# Paperclip MCP Server

Model Context Protocol server for Paperclip.

This package is a thin MCP wrapper over the existing Paperclip REST API. It does
not talk to the database directly and it does not reimplement business logic.

## Authentication

The server reads its configuration from environment variables:

- `PARTYCLIP_API_URL` - Paperclip base URL, for example `http://localhost:3100`
- `PARTYCLIP_API_KEY` - bearer token used for `/api` requests
- `PARTYCLIP_COMPANY_ID` - optional default company for company-scoped tools
- `PARTYCLIP_AGENT_ID` - optional default agent for checkout helpers
- `PARTYCLIP_RUN_ID` - optional run id forwarded on mutating requests

## Usage

```sh
npx -y @partyclipai/mcp-server
```

Or locally in this repo:

```sh
pnpm --filter @partyclipai/mcp-server build
node packages/mcp-server/dist/stdio.js
```

## Tool Surface

Read tools:

- `partyclipMe`
- `partyclipInboxLite`
- `partyclipListAgents`
- `partyclipGetAgent`
- `partyclipListIssues`
- `partyclipGetIssue`
- `partyclipGetHeartbeatContext`
- `partyclipListComments`
- `partyclipGetComment`
- `partyclipListIssueApprovals`
- `partyclipListDocuments`
- `partyclipGetDocument`
- `partyclipListDocumentRevisions`
- `partyclipListProjects`
- `partyclipGetProject`
- `partyclipGetIssueWorkspaceRuntime`
- `partyclipWaitForIssueWorkspaceService`
- `partyclipListGoals`
- `partyclipGetGoal`
- `partyclipListApprovals`
- `partyclipGetApproval`
- `partyclipGetApprovalIssues`
- `partyclipListApprovalComments`

Write tools:

- `partyclipCreateIssue`
- `partyclipUpdateIssue`
- `partyclipCheckoutIssue`
- `partyclipReleaseIssue`
- `partyclipAddComment`
- `partyclipSuggestTasks`
- `partyclipAskUserQuestions`
- `partyclipRequestConfirmation`
- `partyclipUpsertIssueDocument`
- `partyclipRestoreIssueDocumentRevision`
- `partyclipControlIssueWorkspaceServices`
- `partyclipCreateApproval`
- `partyclipLinkIssueApproval`
- `partyclipUnlinkIssueApproval`
- `partyclipApprovalDecision`
- `partyclipAddApprovalComment`

Escape hatch:

- `partyclipApiRequest`

`partyclipApiRequest` is limited to paths under `/api` and JSON bodies. It is
meant for endpoints that do not yet have a dedicated MCP tool.
