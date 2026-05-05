---
title: Environment Variables
summary: Full environment variable reference
---

All environment variables that Paperclip uses for server configuration.

## Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3100` | Server port |
| `PARTYCLIP_BIND` | `loopback` | Reachability preset: `loopback`, `lan`, `tailnet`, or `custom` |
| `PARTYCLIP_BIND_HOST` | (unset) | Required when `PARTYCLIP_BIND=custom` |
| `HOST` | `127.0.0.1` | Legacy host override; prefer `PARTYCLIP_BIND` for new setups |
| `DATABASE_URL` | (embedded) | PostgreSQL connection string |
| `PARTYCLIP_HOME` | `~/.paperclip` | Base directory for all Paperclip data |
| `PARTYCLIP_INSTANCE_ID` | `default` | Instance identifier (for multiple local instances) |
| `PARTYCLIP_DEPLOYMENT_MODE` | `local_trusted` | Runtime mode override |
| `PARTYCLIP_DEPLOYMENT_EXPOSURE` | `private` | Exposure policy when deployment mode is `authenticated` |
| `PARTYCLIP_API_URL` | (auto-derived) | Paperclip API base URL. When set externally (e.g., via Kubernetes ConfigMap, load balancer, or reverse proxy), the server preserves the value instead of deriving it from the listen host and port. Useful for deployments where the public-facing URL differs from the local bind address. |

## Secrets

| Variable | Default | Description |
|----------|---------|-------------|
| `PARTYCLIP_SECRETS_MASTER_KEY` | (from file) | 32-byte encryption key (base64/hex/raw) |
| `PARTYCLIP_SECRETS_MASTER_KEY_FILE` | `~/.paperclip/.../secrets/master.key` | Path to key file |
| `PARTYCLIP_SECRETS_STRICT_MODE` | `false` | Require secret refs for sensitive env vars |

## Agent Runtime (Injected into agent processes)

These are set automatically by the server when invoking agents:

| Variable | Description |
|----------|-------------|
| `PARTYCLIP_AGENT_ID` | Agent's unique ID |
| `PARTYCLIP_COMPANY_ID` | Company ID |
| `PARTYCLIP_API_URL` | Paperclip API base URL (inherits the server-level value; see Server Configuration above) |
| `PARTYCLIP_API_KEY` | Short-lived JWT for API auth |
| `PARTYCLIP_RUN_ID` | Current heartbeat run ID |
| `PARTYCLIP_TASK_ID` | Issue that triggered this wake |
| `PARTYCLIP_WAKE_REASON` | Wake trigger reason |
| `PARTYCLIP_WAKE_COMMENT_ID` | Comment that triggered this wake |
| `PARTYCLIP_APPROVAL_ID` | Resolved approval ID |
| `PARTYCLIP_APPROVAL_STATUS` | Approval decision |
| `PARTYCLIP_LINKED_ISSUE_IDS` | Comma-separated linked issue IDs |

## LLM Provider Keys (for adapters)

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key (for Claude Local adapter) |
| `OPENAI_API_KEY` | OpenAI API key (for Codex Local adapter) |
