import { webcrypto } from 'node:crypto'
import { EncryptedPayload, RepoCryptoConfig } from './types.js'

const KEY_CHECK_TEXT = 'YUNJIAN_KEY_CHECK_V1'
export type AesKey = webcrypto.CryptoKey

function u8ToB64(buf: Uint8Array): string {
  return Buffer.from(buf).toString('base64')
}

function b64ToU8(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'))
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer
}

async function deriveAesKey(passphrase: string, saltB64: string, iterations: number): Promise<AesKey> {
  const passBytes = new TextEncoder().encode(passphrase)
  const salt = b64ToU8(saltB64)
  const material = await webcrypto.subtle.importKey('raw', passBytes, 'PBKDF2', false, ['deriveKey'])
  return webcrypto.subtle.deriveKey(
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

async function encryptText(key: AesKey, plaintext: string): Promise<{ iv: string; payload: string }> {
  const iv = webcrypto.getRandomValues(new Uint8Array(12))
  const plain = new TextEncoder().encode(plaintext)
  const cipher = await webcrypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(plain),
  )
  return {
    iv: u8ToB64(iv),
    payload: u8ToB64(new Uint8Array(cipher)),
  }
}

async function decryptText(key: AesKey, ivB64: string, payloadB64: string): Promise<string> {
  const iv = b64ToU8(ivB64)
  const cipher = b64ToU8(payloadB64)
  const plain = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(cipher))
  return new TextDecoder().decode(plain)
}

export async function createRepoCryptoConfig(passphrase: string): Promise<{ config: RepoCryptoConfig; key: AesKey }> {
  const salt = webcrypto.getRandomValues(new Uint8Array(16))
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

export async function unlockRepoCryptoKey(passphrase: string, config: RepoCryptoConfig): Promise<AesKey> {
  const key = await deriveAesKey(passphrase, config.kdf.salt, config.kdf.iterations)
  const check = await decryptText(key, config.key_check.iv, config.key_check.payload)
  if (check !== KEY_CHECK_TEXT) {
    throw new Error('Passphrase is invalid for this repository')
  }
  return key
}

export async function encryptPayload<T extends object>(
  value: T,
  key: AesKey,
  now: string,
): Promise<EncryptedPayload> {
  const encrypted = await encryptText(key, JSON.stringify(value))
  return {
    enc: true,
    version: 1,
    created_at: now,
    updated_at: now,
    iv: encrypted.iv,
    payload: encrypted.payload,
  }
}

export async function decryptPayload<T>(blob: EncryptedPayload, key: AesKey): Promise<T> {
  const text = await decryptText(key, blob.iv, blob.payload)
  return JSON.parse(text) as T
}
