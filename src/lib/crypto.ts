import type { Wallet } from 'ethers'
import { getBytes } from 'ethers'

/** 模块级密钥缓存（随 session 存在，app 关闭即清除） */
let _cachedKey: CryptoKey | null = null

/**
 * 从钱包私钥派生确定性 AES-256-GCM 加密密钥
 * 流程：signMessage(固定消息) → SHA-256 → importKey
 * 同一私钥每次派生结果相同，保证可重复解密
 */
export async function deriveEncryptionKey(wallet: Wallet): Promise<CryptoKey> {
  if (_cachedKey) return _cachedKey

  // 对固定消息签名，得到 65 字节确定性签名（ECDSA secp256k1）
  const signature = await wallet.signMessage('yunjian:encryption-key-v1')
  // SHA-256 哈希签名字节，得到 32 字节密钥材料
  const sigBytes  = getBytes(signature)
  const keyBuffer = await crypto.subtle.digest('SHA-256', sigBytes)

  _cachedKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
  return _cachedKey
}

/** 清除缓存密钥（退出登录时调用） */
export function clearEncryptionKey() {
  _cachedKey = null
}

/**
 * AES-256-GCM 加密
 * 输出格式（hex）：IV[12字节] + 密文[N字节]
 * 每次加密使用随机 IV，保证相同明文密文不同
 */
export async function encrypt(key: CryptoKey, plaintext: string): Promise<string> {
  const iv       = crypto.getRandomValues(new Uint8Array(12))
  const encoded  = new TextEncoder().encode(plaintext)
  const cipher   = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)

  // 拼接 IV + 密文
  const result = new Uint8Array(12 + cipher.byteLength)
  result.set(iv, 0)
  result.set(new Uint8Array(cipher), 12)
  return toHex(result)
}

/**
 * AES-256-GCM 解密
 * 输入格式（hex）：IV[12字节] + 密文[N字节]
 */
export async function decrypt(key: CryptoKey, hexData: string): Promise<string> {
  const data      = fromHex(hexData)
  const iv        = data.slice(0, 12)
  const ciphertext = data.slice(12)
  const plain     = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  return new TextDecoder().decode(plain)
}

/** 判断字符串是否为加密后的 hex 数据（最短：12字节IV + 16字节tag = 56字符） */
export function isEncrypted(s: string): boolean {
  return /^[0-9a-f]{56,}$/i.test(s)
}

// ── 辅助函数 ──
function toHex(buf: Uint8Array): string {
  return Array.from(buf)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function fromHex(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2)
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return arr
}
