# yunjian-cli

GitHub-only CLI for Yunjian.  
It records encrypted event logs and syncs across devices through a private GitHub repository.

## Features

- GitHub Device Flow login
- Automatic repository create/reuse
- End-to-end encryption (AES-256-GCM + PBKDF2)
- Log events from CLI (`log:add`)
- Record messages to agents (`agent:send`)
- Multi-device sync (`sync`)
- Desktop compatibility: CLI writes encrypted files into `notes/*.json`

## Install

### Install globally (command available in terminal)

```bash
cd yunjian-cli
npm install
npm run install:global
yunjian --help
```

### Install from packed tarball (other machines)

```bash
cd yunjian-cli
npm pack
npm i -g ./yunjian-cli-0.1.0.tgz
yunjian --help
```

## Required env

- `YUNJIAN_GITHUB_CLIENT_ID`: GitHub OAuth App client id
- Optional `YUNJIAN_GITHUB_REPO_PREFIX` (default `yunjian-notes`)

## Usage

```bash
# login
yunjian auth login

# add one log
yunjian log:add "today finished parser optimization"

# send message to agent and keep event log
yunjian agent:send --to agent-a "please summarize today's changes"

# sync manually
yunjian sync

# show recent events
yunjian log:list --limit 20
```

## Local data

Stored in `~/.yunjian-cli` by default:

- `auth.json`: auth session and encryption passphrase
- `state.json`: device id and last sync time
- `pending-events.json`: local unsynced events
- `events-cache.json`: merged local cache

You can override the location with `YUNJIAN_CLI_HOME`.
