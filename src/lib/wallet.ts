import { Wallet, JsonRpcProvider } from 'ethers'

/** XLayer 网络配置 */
export const XLAYER_NETWORKS = {
  mainnet: { chainId: 196, name: 'XLayer',         rpc: 'https://rpc.xlayer.tech' },
  testnet: { chainId: 195, name: 'XLayer Testnet', rpc: 'https://testrpc.xlayer.tech' },
} as const

// 默认使用测试网，部署上线后改为 mainnet
export const XLAYER = XLAYER_NETWORKS.mainnet

/** 创建 RPC Provider */
export function getProvider() {
  return new JsonRpcProvider(XLAYER.rpc)
}

/** 用私钥创建 Wallet 实例（已连接 Provider） */
export function walletFromPrivateKey(privateKey: string): Wallet {
  return new Wallet(normalizeKey(privateKey), getProvider())
}

/** 校验是否是有效的 EVM 私钥 */
export function isValidPrivateKey(key: string): boolean {
  try {
    new Wallet(normalizeKey(key))
    return true
  } catch {
    return false
  }
}

/** 从私钥派生钱包地址（不联网） */
export function deriveAddress(privateKey: string): string {
  return new Wallet(normalizeKey(privateKey)).address
}

/** 标准化私钥格式（补 0x 前缀） */
export function normalizeKey(key: string): string {
  return key.startsWith('0x') ? key : `0x${key}`
}

/** 将 UUID 转为 bytes32（去掉横线后补零到 64 位 hex） */
export function uuidToBytes32(uuid: string): `0x${string}` {
  const hex = uuid.replace(/-/g, '')
  return `0x${hex.padEnd(64, '0')}` as `0x${string}`
}

// ── Session 存储（私钥存 sessionStorage，地址存 localStorage）──
const PK_KEY   = 'yunjian_wallet_pk'
const ADDR_KEY = 'yunjian_wallet_address'

export function saveWalletSession(privateKey: string, address: string) {
  sessionStorage.setItem(PK_KEY, privateKey)
  localStorage.setItem(ADDR_KEY, address)
}

export function loadWalletSession(): { privateKey: string; address: string } | null {
  const pk   = sessionStorage.getItem(PK_KEY)
  const addr = localStorage.getItem(ADDR_KEY)
  if (!pk || !addr) return null
  return { privateKey: pk, address: addr }
}

/** 仅清除 sessionStorage 中的私钥（地址保留用于提示重新登录） */
export function clearWalletSession() {
  sessionStorage.removeItem(PK_KEY)
  localStorage.removeItem(ADDR_KEY)
}

/** 获取上次登录的钱包地址（用于登录页提示） */
export function getLastWalletAddress(): string | null {
  return localStorage.getItem(ADDR_KEY)
}
