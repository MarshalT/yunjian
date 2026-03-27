#!/usr/bin/env node
import 'dotenv/config'
import { Command } from 'commander'
import { randomUUID } from 'node:crypto'
import readline from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { getDataDir, loadAuthSession, loadState, saveAuthSession } from './config.js'
import { createAndQueueEvent, readLocalTimeline, runSync } from './events.js'
import {
  ensureRepoForNotes,
  pollDeviceToken,
  startDeviceFlow,
  verifyOrInitRepoPassphrase,
} from './github.js'
import { AuthSession } from './types.js'

function requiredClientId(cliValue?: string): string {
  const value = cliValue || process.env.YUNJIAN_GITHUB_CLIENT_ID || process.env.VITE_GITHUB_CLIENT_ID
  if (!value) {
    throw new Error(
      'Missing GitHub OAuth client id. Use --client-id or set YUNJIAN_GITHUB_CLIENT_ID in your shell.',
    )
  }
  return value.trim()
}

function repoPrefix(cliValue?: string): string {
  return (cliValue || process.env.YUNJIAN_GITHUB_REPO_PREFIX || 'yunjian-notes').trim()
}

async function resolvePassphrase(cliValue?: string): Promise<string> {
  const value = cliValue || process.env.YUNJIAN_PASSPHRASE
  if (value?.trim()) return value.trim()
  const rl = readline.createInterface({ input: stdin, output: stdout })
  try {
    const entered = await rl.question('Encryption passphrase: ')
    if (!entered.trim()) throw new Error('Passphrase cannot be empty')
    return entered.trim()
  } finally {
    rl.close()
  }
}

function formatEventLine(event: { createdAt: string; type: string; content: string; to?: string; pending?: boolean }) {
  const pending = event.pending ? ' [pending]' : ''
  const target = event.to ? ` -> ${event.to}` : ''
  return `${event.createdAt} ${event.type}${target}: ${event.content}${pending}`
}

async function authLogin(opts: { clientId?: string; repoPrefix?: string; passphrase?: string }) {
  const clientId = requiredClientId(opts.clientId)
  const prefix = repoPrefix(opts.repoPrefix)
  const passphrase = await resolvePassphrase(opts.passphrase)

  const device = await startDeviceFlow(clientId)
  console.log(`Open this URL: ${device.verification_uri}`)
  console.log(`Enter code: ${device.user_code}`)
  console.log('Waiting for GitHub authorization...')

  const accessToken = await pollDeviceToken({
    clientId,
    deviceCode: device.device_code,
    expiresIn: device.expires_in,
    interval: device.interval,
  })

  const session = await ensureRepoForNotes(accessToken, prefix)
  await verifyOrInitRepoPassphrase(session, passphrase)

  const auth: AuthSession = {
    accessToken: session.accessToken,
    login: session.login,
    repo: session.repo,
    branch: session.branch,
    repoPrefix: prefix,
    passphrase,
  }
  await saveAuthSession(auth)

  console.log(`Logged in as ${auth.login}`)
  console.log(`Repository: ${auth.login}/${auth.repo} (${auth.branch})`)
  console.log(`Local state dir: ${getDataDir()}`)
}

async function authStatus() {
  const auth = await loadAuthSession()
  const state = await loadState()
  if (!auth) {
    console.log('Not logged in')
    return
  }
  console.log(`User: ${auth.login}`)
  console.log(`Repo: ${auth.login}/${auth.repo}`)
  console.log(`Branch: ${auth.branch}`)
  console.log(`Device ID: ${state.deviceId}`)
  console.log(`Last sync: ${state.lastSyncAt || 'never'}`)
  console.log(`State dir: ${getDataDir()}`)
}

async function addLog(content: string, opts: { sync?: boolean }) {
  if (!content.trim()) throw new Error('Log content cannot be empty')
  const event = await createAndQueueEvent({ type: 'log', content: content.trim() })
  console.log(`Queued log: ${event.id}`)
  if (opts.sync !== false) {
    const result = await runSync()
    console.log(`Synced: pushed=${result.pushed}, pulled=${result.pulled}, total=${result.total}`)
  }
}

async function sendAgent(to: string, content: string, opts: { sync?: boolean }) {
  if (!to.trim()) throw new Error('Agent id cannot be empty')
  if (!content.trim()) throw new Error('Message cannot be empty')
  const event = await createAndQueueEvent({
    type: 'agent_message',
    to: to.trim(),
    content: content.trim(),
  })
  console.log(`Queued agent message: ${event.id}`)
  if (opts.sync !== false) {
    const result = await runSync()
    console.log(`Synced: pushed=${result.pushed}, pulled=${result.pulled}, total=${result.total}`)
  }
}

async function listLogs(limit: number, opts: { sync?: boolean }) {
  if (opts.sync !== false) {
    const result = await runSync()
    console.log(`Synced: pushed=${result.pushed}, pulled=${result.pulled}, total=${result.total}`)
  }
  const timeline = await readLocalTimeline(limit)
  if (timeline.length === 0) {
    console.log('No logs yet')
    return
  }
  for (const event of timeline) {
    console.log(formatEventLine(event))
  }
}

const program = new Command()

program
  .name('yunjian')
  .description('Yunjian GitHub-only CLI with encrypted event logs and multi-device sync')
  .version('0.1.0')

const auth = program.command('auth').description('Authentication commands')

auth
  .command('login')
  .option('--client-id <id>', 'GitHub OAuth App client id')
  .option('--repo-prefix <prefix>', 'Repository prefix, default: yunjian-notes')
  .option('--passphrase <value>', 'Encryption passphrase')
  .action(authLogin)

auth.command('status').action(authStatus)

program
  .command('sync')
  .description('Push local pending events and pull remote events')
  .action(async () => {
    const result = await runSync()
    console.log(`Synced: pushed=${result.pushed}, pulled=${result.pulled}, total=${result.total}`)
  })

program
  .command('log:add')
  .description('Add a log event')
  .argument('<content>', 'Log content')
  .option('--no-sync', 'Skip sync after add')
  .action(addLog)

program
  .command('log:list')
  .description('List latest events')
  .option('--limit <n>', 'Number of events to show', (v: string) => Number(v), 30)
  .option('--no-sync', 'Skip sync before list')
  .action(async (opts: { limit: number; sync?: boolean }) => {
    await listLogs(opts.limit, { sync: opts.sync })
  })

program
  .command('agent:send')
  .description('Send message to an agent and record event')
  .requiredOption('--to <agent>', 'Agent id/name')
  .argument('<content>', 'Message content')
  .option('--no-sync', 'Skip sync after send')
  .action(async (content: string, opts: { to: string; sync?: boolean }) => {
    await sendAgent(opts.to, content, { sync: opts.sync })
  })

program.command('id').description('Generate one event id').action(() => {
  console.log(randomUUID())
})

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error((error as Error).message)
  process.exit(1)
})
