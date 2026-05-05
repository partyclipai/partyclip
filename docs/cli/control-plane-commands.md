---
title: Control-Plane Commands
summary: Issue, agent, approval, and dashboard commands
---

Client-side commands for managing issues, agents, approvals, and more.

## Issue Commands

```sh
# List issues
pnpm partyclipai issue list [--status todo,in_progress] [--assignee-agent-id <id>] [--match text]

# Get issue details
pnpm partyclipai issue get <issue-id-or-identifier>

# Create issue
pnpm partyclipai issue create --title "..." [--description "..."] [--status todo] [--priority high]

# Update issue
pnpm partyclipai issue update <issue-id> [--status in_progress] [--comment "..."]

# Add comment
pnpm partyclipai issue comment <issue-id> --body "..." [--reopen]

# Checkout task
pnpm partyclipai issue checkout <issue-id> --agent-id <agent-id>

# Release task
pnpm partyclipai issue release <issue-id>
```

## Company Commands

```sh
pnpm partyclipai company list
pnpm partyclipai company get <company-id>

# Export to portable folder package (writes manifest + markdown files)
pnpm partyclipai company export <company-id> --out ./exports/acme --include company,agents

# Preview import (no writes)
pnpm partyclipai company import \
  <owner>/<repo>/<path> \
  --target existing \
  --company-id <company-id> \
  --ref main \
  --collision rename \
  --dry-run

# Apply import
pnpm partyclipai company import \
  ./exports/acme \
  --target new \
  --new-company-name "Acme Imported" \
  --include company,agents
```

## Agent Commands

```sh
pnpm partyclipai agent list
pnpm partyclipai agent get <agent-id>
```

## Approval Commands

```sh
# List approvals
pnpm partyclipai approval list [--status pending]

# Get approval
pnpm partyclipai approval get <approval-id>

# Create approval
pnpm partyclipai approval create --type hire_agent --payload '{"name":"..."}' [--issue-ids <id1,id2>]

# Approve
pnpm partyclipai approval approve <approval-id> [--decision-note "..."]

# Reject
pnpm partyclipai approval reject <approval-id> [--decision-note "..."]

# Request revision
pnpm partyclipai approval request-revision <approval-id> [--decision-note "..."]

# Resubmit
pnpm partyclipai approval resubmit <approval-id> [--payload '{"..."}']

# Comment
pnpm partyclipai approval comment <approval-id> --body "..."
```

## Activity Commands

```sh
pnpm partyclipai activity list [--agent-id <id>] [--entity-type issue] [--entity-id <id>]
```

## Dashboard

```sh
pnpm partyclipai dashboard get
```

## Heartbeat

```sh
pnpm partyclipai heartbeat run --agent-id <agent-id> [--api-base http://localhost:3100]
```
