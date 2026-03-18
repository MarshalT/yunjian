import { decrypt, encrypt, isEncrypted } from './crypto'

const STORAGE_KEY_PREFIX = 'Yunqian_supabase_enc_key_'
const SALT_PREFIX = 'Yunqian:supabase:enc:v1:'

const keyCache = new Map<string, CryptoKey>()

function storageKey(userId: string) {
  return `${STORAGE_KEY_PREFIX}${userId}`
}

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function deriveKeyFromPassword(userId: string, password: string): Promise<CryptoKey> {
  const pwBytes = new TextEncoder().encode(password)
  const salt = new TextEncoder().encode(`${SALT_PREFIX}${userId}`)
  const pwCopy = Uint8Array.from(pwBytes)
  const saltCopy = Uint8Array.from(salt)

  const material = await crypto.subtle.importKey('raw', pwCopy, 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltCopy,
      iterations: 210_000,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  )
}

async function exportRawKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key)
  return toBase64(new Uint8Array(raw))
}

async function importRawKey(rawB64: string): Promise<CryptoKey> {
  const raw = fromBase64(rawB64)
  const rawCopy = Uint8Array.from(raw)
  return crypto.subtle.importKey('raw', rawCopy, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

/**
 * 登录成功后调用：使用用户密码派生对称密钥，并仅保存在当前 session 中。
 */
export async function primeSupabaseEncryptionKey(userId: string, password: string): Promise<void> {
  const key = await deriveKeyFromPassword(userId, password)
  keyCache.set(userId, key)
  sessionStorage.setItem(storageKey(userId), await exportRawKey(key))
}

/**
 * 获取当前 session 的 Supabase 加密密钥；若没有则返回 null。
 */
export async function getSupabaseEncryptionKey(userId: string): Promise<CryptoKey | null> {
  const cached = keyCache.get(userId)
  if (cached) return cached

  const raw = sessionStorage.getItem(storageKey(userId))
  if (!raw) return null

  const key = await importRawKey(raw)
  keyCache.set(userId, key)
  return key
}

export function clearSupabaseEncryptionKey(userId?: string) {
  if (userId) {
    keyCache.delete(userId)
    sessionStorage.removeItem(storageKey(userId))
    return
  }

  keyCache.clear()
  Object.keys(sessionStorage)
    .filter((k) => k.startsWith(STORAGE_KEY_PREFIX))
    .forEach((k) => sessionStorage.removeItem(k))
}

export function noteNeedsKey(title: string, content: string): boolean {
  return isEncrypted(title) || isEncrypted(content)
}

export async function encryptNoteFields(key: CryptoKey, title: string, content: string) {
  return {
    title: await encrypt(key, title),
    content: await encrypt(key, content),
  }
}

export async function decryptMaybeEncryptedField(key: CryptoKey | null, value: string): Promise<string> {
  if (!isEncrypted(value)) return value
  if (!key) throw new Error('检测到已加密笔记，但当前会话未解锁。请退出后重新用密码登录。')
  return decrypt(key, value)
}
