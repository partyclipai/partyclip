# partyclip documentation

Two documentation directories coexist in this repo. They serve different audiences and you should know which is which:

## `docs/` (this directory) — partyclip canonical

The post-fork, partyclip-specific documentation. Rendered by [Mintlify](https://mintlify.com) (see `docs/docs.json`). Covers:

- **`architecture.md`**: how partyclip is structured (server, UI, CLI, plugins, adapters)
- **`data-model.md`**: core entities (companies, agents, issues, patches, ministries) and their relationships
- **`upstream-sync.md`**: how to pull selected changes from upstream Paperclip without breaking the rebrand
- **`plugin-api.md`**: the public plugin SDK surface
- **`adr/`**: architecture decision records — append-only, one per major decision
- **`adapters/`, `api/`, `cli/`, `companies/`, `deploy/`, `guides/`, `specs/`**: domain-specific reference

When you want to know how partyclip behaves *today* and what its commitments are, look here first.

## `doc/` (lowercase, sibling) — upstream Paperclip historical

Pre-fork specifications, plans, and product docs inherited from upstream Paperclip. **Preserved verbatim** as the historical record of why partyclip exists and what it inherited from. Includes:

- `SPEC.md`, `SPEC-implementation.md`, `PRODUCT.md` (upstream's living product spec)
- `DEVELOPING.md`, `RELEASING.md`, `PUBLISHING.md`, `DOCKER.md`, `DATABASE.md` (upstream operational docs — partyclip equivalents are in `docs/` going forward)
- `plans/`, `plugins/`, `experimental/` (upstream design discussions)
- `CHANGELOG`s for `cli/` and `server/`

When upstream and partyclip disagree about something — adapter behavior, plugin contract, environment variables, branding — `docs/` wins; `doc/` is read-only context.

## Convention going forward

- **Add new docs to `docs/`**, not `doc/`.
- **Don't edit `doc/` files** unless you are deliberately re-syncing from upstream (rare; see `docs/upstream-sync.md`).
- **Don't merge `doc/` into `docs/`** — the historical separation is the point.
