# Paperclip Artifact Curation for partyclip

> **Manifest only — no files are deleted by this document.** It classifies every Paperclip-inherited doc/plan as `KEEP`, `DELETE`, or `REVIEW` against the six partyclip workstreams in `doc/plans/2026-05-02-meta-development-plan.md`. Code is untouched.
>
> Action: review the `DELETE` and `REVIEW` lists with the operator. Once approved, run a single removal commit with the rationale linked to this manifest.

## Workstream legend

- **W1** Substrate alignment (Paperclip ⇄ partyclip)
- **W2** Data model & schema
- **W3** Pipeline runtime
- **W4** Governance gates
- **W5** Public surface & first-party plugins
- **W6** Citizen layer
- **SUBSTRATE** = Paperclip primitive partyclip re-uses as-is

---

## 1. DELETE — Paperclip product/marketing/competitive artifacts that conflict with partyclip's framing

These describe Paperclip-the-product (autonomous AI companies, ClipHub marketplace, OpenClaw onboarding, Paperclip's GDP-scale ambition). partyclip is a different product with a different audience; keeping these in-tree creates contradictory messaging and confuses contributors.

| Path | Why delete |
|---|---|
| `ROADMAP.md` | Paperclip's directional roadmap (CEO Chat, MAXIMIZER MODE, Self-Organization, Desktop App, etc.). Conflicts with partyclip's roadmap in `README.md` + meta plan. **Replace with a partyclip ROADMAP that points at the meta plan.** |
| `doc/GOAL.md` | "Paperclip is the backbone of the autonomous economy … rivals the GDP of the world's largest countries." Wrong product, wrong vision. |
| `doc/PRODUCT.md` | Paperclip product definition (control plane for autonomous AI companies). partyclip's product definition lives in `README.md`. |
| `doc/CLIPHUB.md` | ClipHub company-template marketplace. Out of scope (§7 of meta plan: "Out of scope — Federation between partyclip instances"). |
| `docs/specs/cliphub-plan.md` | Same as above; already marked superseded at the top of the file. |
| `doc/README-draft.md` | Paperclip README writing instructions; partyclip already has its own README. |
| `doc/OPENCLAW_ONBOARDING.md` | Onboarding for OpenClaw-style agents — Paperclip product surface, not a partyclip primitive. |
| `doc/AGENTCOMPANIES_SPEC_INVENTORY.md` | Code inventory for `agentcompanies/v1` spec compliance — partyclip ships content via the content repo, not via this spec. |
| `doc/plans/2026-03-13-features.md` | "Guided onboarding + first-job magic" — Paperclip product feature list. |
| `doc/plans/2026-04-12-vscode-task-interoperability-plan.md` | IDE integration. Out of scope for partyclip. |
| `doc/plans/workspace-product-model-and-work-product.md` | Undated duplicate of `2026-03-13-workspace-product-model-and-work-product.md`. |
| `doc/plans/workspace-technical-implementation.md` | Undated companion of the duplicate above; references absolute path on someone's laptop in line 5. |
| `doc/plugins/ideas-from-opencode.md` | "Design report, not a V1 commitment" — speculative plugin ideas inherited from OpenCode. Not aligned. |
| `releases/v0.2.7.md`, `v0.3.0.md`, `v0.3.1.md` | Pre-fork Paperclip release notes (semver `v0.x`). Historical noise; partyclip will start its own release cadence. |

**Rationale summary:** any doc that markets Paperclip-the-product, advertises features partyclip will not ship, or duplicates a more recent dated version.

---

## 2. REVIEW — likely-delete but operator should confirm

These are Paperclip artifacts that *could* still be useful as substrate references but probably belong in the upstream-only sync notes, not in partyclip's tree.

| Path | Tension |
|---|---|
| `doc/SPEC.md` | Long-horizon Paperclip product context. Useful while we still depend on the substrate, but partyclip needs its own SPEC. **Recommendation:** keep until partyclip SPEC exists (Phase 0 deliverable), then delete or rename to `doc/SPEC-paperclip-substrate.md`. |
| `doc/SPEC-implementation.md` | V1 build contract for Paperclip. Same trade-off as above — substrate reference, but `AGENTS.md` currently points contributors at it as authoritative. Update `AGENTS.md` to point at partyclip docs once they exist, then move/rename. |
| `doc/plans/2026-02-16-module-system.md` | Already marked superseded at the top. Has historical/decision-log value but contradicts current direction. **Recommendation:** delete; rely on the supersession pointer. |
| `doc/plans/2026-02-19-ceo-agent-creation-and-hiring.md` | "CEO Agent" hiring governance — Paperclip flow. partyclip configures agents from the content repo, not via in-product hiring UI. Likely DELETE; KEEP only if an org-creation flow becomes a partyclip primitive (currently not in any workstream). |
| `doc/plans/2026-02-23-cursor-cloud-adapter.md` | Adapter for Cursor cloud agents. partyclip will primarily run local/Claude/Llama (W6 cost runway). Low priority but not strictly off-strategy. |
| `doc/memory-landscape.md` | Memory systems survey. partyclip's audit log + constitution + content repo cover the same ground differently. Keep only if Phase 4 ministries grow a memory primitive. |
| `adapter-plugin.md` (root) | Hermes adapter externalization notes — fork-history specific (HenkDz fork lineage per §11 of `AGENTS.md`). Not on partyclip's path. |
| `releases/v2026.*.md` | Recent Paperclip release notes (post-fork by date). Useful as the "last synced with Paperclip" provenance record. **Recommendation:** keep one (the most recent) as the sync waterline, delete the rest. |
| `report/2026-03-13-08-46-token-optimization-implementation.md` | Implementation report for an upstream PR. Useful context for W6 cost work; otherwise inert. |

---

## 3. KEEP — substrate or directly aligned with a workstream

### 3.1 Universal substrate (KEEP — W1 / SUBSTRATE)

Foundational to every Paperclip deployment, partyclip included. Do not touch.

- `AGENTS.md`, `CONTRIBUTING.md`, `SECURITY.md`, `LICENSE`, `README.md`
- `doc/DATABASE.md`, `doc/DEPLOYMENT-MODES.md`, `doc/DEVELOPING.md`, `doc/DOCKER.md`
- `doc/PUBLISHING.md`, `doc/RELEASING.md`, `doc/RELEASE-AUTOMATION-SETUP.md`
- `doc/CLI.md`, `doc/TASKS.md`, `doc/TASKS-mcp.md`
- `doc/UNTRUSTED-PR-REVIEW.md` (relevant to W4 operator sign-off)
- `doc/execution-semantics.md`
- `doc/spec/agent-runs.md`, `doc/spec/agents-runtime.md`, `doc/spec/invite-flow.md`, `doc/spec/ui.md`
- `doc/plugins/PLUGIN_AUTHORING_GUIDE.md`, `doc/plugins/PLUGIN_SPEC.md` — **critical for W1, W5**
- `doc/experimental/issue-worktree-support.md` — relevant to W3 stage isolation

### 3.2 User-facing docs (KEEP — reference until partyclip equivalents exist)

These describe Paperclip primitives that partyclip wraps. Keep verbatim until a partyclip-specific replacement is written; then either rewrite in place or supersede with a pointer.

- `docs/start/*` — `architecture.md`, `core-concepts.md`, `quickstart.md`, `what-is-paperclip.md` (the last one will need a partyclip equivalent at `docs/start/what-is-partyclip.md`)
- `docs/companies/companies-spec.md` — concept maps to "deployment configuration"; partyclip will need a companion `parties-spec.md`
- `docs/guides/agent-developer/*` — all relevant
- `docs/guides/board-operator/*` — all relevant (board operator ≈ partyclip operator)
- `docs/guides/execution-policy.md`, `docs/guides/openclaw-docker-setup.md`
- `docs/deploy/*` — deployment universal
- `docs/cli/*`, `docs/api/*` — substrate
- `docs/adapters/*` — adapter system, partyclip needs all of them
- `docs/agents-runtime.md`, `docs/feedback-voting.md` (the rating mechanism is a useful prior for W6 advisory voting)
- `docs/specs/agent-config-ui.md`
- `docs/plans/2026-03-13-issue-documents-plan.md` — relevant to W3 (patch documents)

### 3.3 Plans aligned with partyclip workstreams (KEEP)

| Plan | Workstream | Relevance |
|---|---|---|
| `2026-02-18-agent-authentication.md` + `-implementation.md` | W6 | Operator + agent auth foundation |
| `2026-02-19-agent-mgmt-followup-plan.md` | W3 | Agent lifecycle |
| `2026-02-20-issue-run-orchestration-plan.md` | W3 | Direct foundation for patch pipeline state machine |
| `2026-02-20-storage-system-implementation.md` | W2 | Storage for artifacts |
| `2026-02-21-humans-and-permissions.md` + `-implementation.md` | W4, W6 | Operator/citizen tier model |
| `2026-02-23-deployment-auth-mode-consolidation.md` | W6 | Auth modes |
| `2026-03-10-workspace-strategy-and-git-worktrees.md` | W3 | Stage execution isolation (relevant for ForumIngestor sandboxing in W6 too) |
| `2026-03-11-agent-chat-ui-and-issue-backed-conversations.md` | W4 | Operator review surface |
| `2026-03-13-TOKEN-OPTIMIZATION-PLAN.md` | W6 | Cost runway |
| `2026-03-13-agent-evals-framework.md` | W4 | Bias Mirror evals |
| `2026-03-13-company-import-export-v2.md` | W1 | Maps to partyclip content-repo packaging |
| `2026-03-13-paperclip-skill-tightening-plan.md` | W3 | Skill scoping per agent |
| `2026-03-13-plugin-kitchen-sink-example.md` | W1, W5 | Plugin SDK exemplar — useful for the toy plugin in §W1 of meta plan |
| `2026-03-13-workspace-product-model-and-work-product.md` (dated version) | W3 | Work-product model = Patch + Artifact |
| `2026-03-14-adapter-skill-sync-rollout.md` | W1 | Adapter substrate |
| `2026-03-14-billing-ledger-and-reporting.md` | W6 | Revenue stream + cost transparency |
| `2026-03-14-budget-policies-and-enforcement.md` | W6 | Compute runway thresholds |
| `2026-03-14-skills-ui-product-plan.md` | W3 | Skills surface |
| `2026-03-17-docker-release-browser-e2e.md` | substrate | Release engineering |
| `2026-03-17-memory-service-surface-api.md` | REVIEW above | (downgrade if memory not adopted) |
| `2026-03-17-release-automation-and-versioning.md` | substrate | |
| `2026-04-06-smart-model-routing.md` | W6 | Model tiering for cost |
| `2026-04-06-subissue-creation-on-issue-detail.md` | W3 | Cross-cutting patch decomposition |
| `2026-04-07-issue-detail-speed-and-optimistic-inventory.md` | W4 | Operator UI perf |
| `2026-04-07-pi-hooks-survey.md` | W1 | Hook taxonomy — relevant to partyclip's heartbeat trigger event taxonomy |
| `2026-04-08-agent-browser-process-cleanup-plan.md` | W3 | Runtime hygiene |
| `2026-04-08-agent-os-follow-up-plan.md` | W1 | Substrate evolution |
| `2026-04-08-agent-os-technical-report.md` | W1 | |
| `2026-05-02-meta-development-plan.md` | — | The plan itself |

---

## 4. Suggested execution order

If/when the operator approves the deletes, do them in this order to keep history clean:

1. **Replace `ROADMAP.md`** with a partyclip-specific roadmap pointing at the meta plan. Single commit. (Do not delete in isolation — leaves a dangling expectation.)
2. **Delete §1 list** (Paperclip product/marketing artifacts). One commit per logical group:
   - product framing: `GOAL.md`, `PRODUCT.md`, `README-draft.md`, `OPENCLAW_ONBOARDING.md`, `AGENTCOMPANIES_SPEC_INVENTORY.md`
   - ClipHub: `CLIPHUB.md`, `docs/specs/cliphub-plan.md`
   - misaligned plans: the four named plans + `ideas-from-opencode.md`
   - pre-fork releases: the three `v0.x` files
3. **Resolve §2 REVIEW list** with operator decisions. Each REVIEW item gets a yes/no and a one-line rationale appended to this file before deletion.
4. **Update `AGENTS.md`** §2 reading order once `doc/SPEC.md` / `doc/SPEC-implementation.md` are renamed or replaced — currently they are pointed at as authoritative.
5. **Update `README.md` "Built on Paperclip"** section to also link to this manifest, so the substrate boundary is explicit for outside readers.

## 5. What this manifest does NOT touch

- Any file under `packages/`, `server/`, `ui/`, `cli/`, `evals/`, `tests/`, `scripts/`, `patches/`, `assets/`, `docker/` — code is out of scope per the request.
- `.github/`, `.claude/`, `.agents/` — tooling configuration.
- `pnpm-workspace.yaml`, `package.json`, lockfiles, configs — substrate.
- `skills/` — skill packages, substrate.

If a doc deletion later turns out to reference live code paths (e.g., links from `AGENTS.md`), fix the references in the same commit; do not leave broken links.
