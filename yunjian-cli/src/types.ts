export interface AuthSession {
  accessToken: string
  login: string
  repo: string
  branch: string
  repoPrefix: string
  passphrase: string
}

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

export interface EncryptedPayload {
  enc: true
  version: number
  created_at: string
  updated_at: string
  iv: string
  payload: string
}

export type EventType = 'log' | 'agent_message'

export interface SyncEvent {
  id: string
  type: EventType
  content: string
  to?: string
  deviceId: string
  createdAt: string
}

export interface LocalState {
  deviceId: string
  lastSyncAt?: string
}

export interface Note {
  id: string
  user_id: string
  title: string
  content: string
  created_at: string
  updated_at: string
  pending?: boolean
}
