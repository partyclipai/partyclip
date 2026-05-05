---
title: Setup Commands
summary: Onboard, run, doctor, and configure
---

Instance setup and diagnostics commands.

## `partyclipai run`

One-command bootstrap and start:

```sh
pnpm partyclipai run
```

Does:

1. Auto-onboards if config is missing
2. Runs `partyclipai doctor` with repair enabled
3. Starts the server when checks pass

Choose a specific instance:

```sh
pnpm partyclipai run --instance dev
```

## `partyclipai onboard`

Interactive first-time setup:

```sh
pnpm partyclipai onboard
```

If Paperclip is already configured, rerunning `onboard` keeps the existing config in place. Use `partyclipai configure` to change settings on an existing install.

First prompt:

1. `Quickstart` (recommended): local defaults (embedded database, no LLM provider, local disk storage, default secrets)
2. `Advanced setup`: full interactive configuration

Start immediately after onboarding:

```sh
pnpm partyclipai onboard --run
```

Non-interactive defaults + immediate start (opens browser on server listen):

```sh
pnpm partyclipai onboard --yes
```

On an existing install, `--yes` now preserves the current config and just starts Paperclip with that setup.

## `partyclipai doctor`

Health checks with optional auto-repair:

```sh
pnpm partyclipai doctor
pnpm partyclipai doctor --repair
```

Validates:

- Server configuration
- Database connectivity
- Secrets adapter configuration
- Storage configuration
- Missing key files

## `partyclipai configure`

Update configuration sections:

```sh
pnpm partyclipai configure --section server
pnpm partyclipai configure --section secrets
pnpm partyclipai configure --section storage
```

## `partyclipai env`

Show resolved environment configuration:

```sh
pnpm partyclipai env
```

This now includes bind-oriented deployment settings such as `PARTYCLIP_BIND` and `PARTYCLIP_BIND_HOST` when configured.

## `partyclipai allowed-hostname`

Allow a private hostname for authenticated/private mode:

```sh
pnpm partyclipai allowed-hostname my-tailscale-host
```

## Local Storage Paths

| Data | Default Path |
|------|-------------|
| Config | `~/.paperclip/instances/default/config.json` |
| Database | `~/.paperclip/instances/default/db` |
| Logs | `~/.paperclip/instances/default/logs` |
| Storage | `~/.paperclip/instances/default/data/storage` |
| Secrets key | `~/.paperclip/instances/default/secrets/master.key` |

Override with:

```sh
PARTYCLIP_HOME=/custom/home PARTYCLIP_INSTANCE_ID=dev pnpm partyclipai run
```

Or pass `--data-dir` directly on any command:

```sh
pnpm partyclipai run --data-dir ./tmp/partyclip-dev
pnpm partyclipai doctor --data-dir ./tmp/partyclip-dev
```
