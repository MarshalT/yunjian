import { Note } from '../types'

const PASSPHRASE_KEY = 'Yunqian_github_passphrase'
const KEY_CHECK_TEXT = 'YUNJIAN_KEY_CHECK_V1'

export interface RepoCryptoConfig {
  enc_version: number
  cipher: 'AES-GCM'
  kdf: {
    name: 'PBKDF2'
    hash: 'SHA-256'
    iterations: number
    salt: string
  }
  key_check: {
    iv: string
    payload: string
  }
}

export interface EncryptedNotePayload {
  enc: true
  version: number
  created_at: string
  updated_at: string
  iv: string
  payload: string
}

function u8ToB64(buf: Uint8Array): string {
  let s = ''
  for (const b of buf) s += String.fromCharCode(b)
  return btoa(s)
}

function b64ToU8(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer
}

async function deriveAesKey(passphrase: string, saltB64: string, iterations: number): Promise<CryptoKey> {
  const passBytes = new TextEncoder().encode(passphrase)
  const salt = b64ToU8(saltB64)
  const material = await crypto.subtle.importKey('raw', passBytes, 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: toArrayBuffer(salt),
      iterations,
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function encryptText(key: CryptoKey, plaintext: string): Promise<{ iv: string; payload: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plain = new TextEncoder().encode(plaintext)
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(plain),
  )
  return {
    iv: u8ToB64(iv),
    payload: u8ToB64(new Uint8Array(cipher)),
  }
}

async function decryptText(key: CryptoKey, ivB64: string, payloadB64: string): Promise<string> {
  const iv = b64ToU8(ivB64)
  const cipher = b64ToU8(payloadB64)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(cipher))
  return new TextDecoder().decode(plain)
}

export function setGithubPassphrase(passphrase: string) {
  sessionStorage.setItem(PASSPHRASE_KEY, passphrase)
}

export function getGithubPassphrase(): string | null {
  return sessionStorage.getItem(PASSPHRASE_KEY)
}

export function clearGithubPassphrase() {
  sessionStorage.removeItem(PASSPHRASE_KEY)
}

export function requireGithubPassphrase(): string {
  const passphrase = getGithubPassphrase()
  if (!passphrase) {
    throw new Error('未解锁加密口令，请重新登录并输入口令')
  }
  return passphrase
}

export async function createRepoCryptoConfig(passphrase: string): Promise<{ config: RepoCryptoConfig; key: CryptoKey }> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const saltB64 = u8ToB64(salt)
  const iterations = 210_000
  const key = await deriveAesKey(passphrase, saltB64, iterations)
  const check = await encryptText(key, KEY_CHECK_TEXT)

  return {
    key,
    config: {
      enc_version: 1,
      cipher: 'AES-GCM',
      kdf: {
        name: 'PBKDF2',
        hash: 'SHA-256',
        iterations,
        salt: saltB64,
      },
      key_check: check,
    },
  }
}

export async function unlockRepoCryptoKey(passphrase: string, config: RepoCryptoConfig): Promise<CryptoKey> {
  const key = await deriveAesKey(passphrase, config.kdf.salt, config.kdf.iterations)
  const check = await decryptText(key, config.key_check.iv, config.key_check.payload)
  if (check !== KEY_CHECK_TEXT) {
    throw new Error('加密口令错误，无法解锁仓库数据')
  }
  return key
}

export async function encryptNote(note: Note, key: CryptoKey): Promise<EncryptedNotePayload> {
  const payload = await encryptText(key, JSON.stringify(note))
  return {
    enc: true,
    version: 1,
    created_at: note.created_at,
    updated_at: note.updated_at,
    iv: payload.iv,
    payload: payload.payload,
  }
}

export async function decryptNote(blob: EncryptedNotePayload, key: CryptoKey): Promise<Note> {
  const text = await decryptText(key, blob.iv, blob.payload)
  return JSON.parse(text) as Note
}
