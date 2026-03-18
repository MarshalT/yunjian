import { Contract } from 'ethers'
import type { Wallet } from 'ethers'
import { getProvider, uuidToBytes32 } from './wallet'
import type { WalletNote } from '../types'
import { deriveEncryptionKey, encrypt, decrypt, isEncrypted } from './crypto'
import { addGasUsed } from './walletStore'

/**
 * 合约地址 —— 部署后填入
 * 部署命令（需安装 hardhat 或 foundry）：
 *   npx hardhat run scripts/deploy.js --network xlayer_testnet
 */
export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS ?? ''

/** 合约 ABI（Human-Readable 格式） */
const ABI = [
  'function saveNote(bytes32 noteId, string title, string content) external',
  'function saveNotes(bytes32[] noteIds, string[] titles, string[] contents) external',
  'function deleteNote(bytes32 noteId) external',
  'function getAllNotes(address owner) external view returns (tuple(bytes32 id, string title, string content, uint256 createdAt, uint256 updatedAt, bool exists)[] notes, bool[] deletedFlags)',
  'event NoteSaved(address indexed owner, bytes32 indexed noteId, string title)',
  'event NoteDeleted(address indexed owner, bytes32 indexed noteId)',
]

/** 获取只读合约实例 */
function readContract() {
  return new Contract(CONTRACT_ADDRESS, ABI, getProvider())
}

/** 获取可写合约实例（需要 Wallet） */
function writeContract(wallet: Wallet) {
  return new Contract(CONTRACT_ADDRESS, ABI, wallet)
}

/**
 * 批量上传笔记到链上
 * @returns 交易 hash
 */
export async function uploadNotes(
  wallet: Wallet,
  notes: Pick<WalletNote, 'id' | 'title' | 'content'>[],
): Promise<string> {
  if (!CONTRACT_ADDRESS) throw new Error('合约地址未配置，请在 .env 中设置 VITE_CONTRACT_ADDRESS')

  const key       = await deriveEncryptionKey(wallet)
  const contract  = writeContract(wallet)
  const noteIds   = notes.map(n => uuidToBytes32(n.id))
  const titles    = await Promise.all(notes.map(n => encrypt(key, n.title)))
  const contents  = await Promise.all(notes.map(n => encrypt(key, n.content)))

  const tx      = await contract.saveNotes(noteIds, titles, contents)
  const receipt = await tx.wait()
  if (receipt) addGasUsed(wallet.address, BigInt(receipt.gasUsed) * BigInt(receipt.gasPrice))
  return tx.hash as string
}

/**
 * 从链上拉取当前地址的所有笔记
 */
export async function fetchNotesFromChain(address: string, wallet?: Wallet): Promise<WalletNote[]> {
  if (!CONTRACT_ADDRESS) throw new Error('合约地址未配置')

  const key      = wallet ? await deriveEncryptionKey(wallet) : null
  const contract = readContract()
  const [notes, deletedFlags]: [
    Array<{ id: string; title: string; content: string; createdAt: bigint; updatedAt: bigint }>,
    boolean[]
  ] = await contract.getAllNotes(address)

  const decryptField = async (s: string) => {
    if (!key || !isEncrypted(s)) return s
    try {
      return await decrypt(key, s)
    } catch {
      // 解密失败（如旧格式数据），原样返回
      console.warn('[crypto] decrypt failed, returning raw:', s.slice(0, 20))
      return s
    }
  }

  const results = await Promise.all(
    notes.map(async (n, i) => ({
      id:         fromBytes32ToUuid(n.id),
      address,
      title:      await decryptField(n.title),
      content:    await decryptField(n.content),
      created_at: new Date(Number(n.createdAt) * 1000).toISOString(),
      updated_at: new Date(Number(n.updatedAt) * 1000).toISOString(),
      pending:    false,
      deleted:    deletedFlags[i],
    }))
  )
  return results.filter(n => !n.deleted)
}

/**
 * 删除链上笔记
 */
export async function deleteNoteOnChain(wallet: Wallet, noteId: string): Promise<void> {
  if (!CONTRACT_ADDRESS) throw new Error('合约地址未配置')
  const contract = writeContract(wallet)
  const tx      = await contract.deleteNote(uuidToBytes32(noteId))
  const receipt = await tx.wait()
  if (receipt) addGasUsed(wallet.address, BigInt(receipt.gasUsed) * BigInt(receipt.gasPrice))
}


function fromBytes32ToUuid(hex: string): string {
  const clean = hex.replace(/^0x/, '').replace(/0+$/, '').padEnd(32, '0')
  return [
    clean.slice(0, 8),
    clean.slice(8, 12),
    clean.slice(12, 16),
    clean.slice(16, 20),
    clean.slice(20, 32),
  ].join('-')
}
