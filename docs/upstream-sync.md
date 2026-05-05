# Upstream sync

partyclip is a soft fork of [paperclipai/paperclip](https://github.com/paperclipai/paperclip). We pull selected upstream changes manually rather than auto-merging — most upstream work is Paperclip-product business logic that does not belong in partyclip, and the rest needs review for compatibility with the partyclip rename.

## Remotes

```bash
git remote -v
# origin    git@github.com:partyclipai/partyclip.git
# upstream  git@github.com:paperclipai/paperclip.git
```

If `upstream` is missing:

```bash
git remote add upstream git@github.com:paperclipai/paperclip.git
```

## What `UPSTREAM_VERSION` is

`UPSTREAM_VERSION` (at the repo root) holds the SHA of the most recent upstream commit that has been merged or cherry-picked into partyclip. It is the baseline for the next sync — `git log $UPSTREAM_VERSION..upstream/main` is what's new since you last looked.

Update it every time you cherry-pick from upstream.

## Routine sync

```bash
git fetch upstream

# What's new upstream since the last sync?
git log $(grep -E '^[a-f0-9]{40}$' UPSTREAM_VERSION)..upstream/main --oneline

# Cherry-pick what you want, fix conflicts (most rename conflicts are mechanical)
git cherry-pick <sha>

# When done, bump UPSTREAM_VERSION to the latest upstream/main SHA you've absorbed
```

## Cherry-pick policy

**Pull from upstream:**
- Security fixes
- Plugin SDK improvements (`packages/plugins/sdk/`)
- Adapter improvements that don't conflict with partyclip's plugin model
- Bug fixes in shared infrastructure (db, shared, adapter-utils)
- Performance and stability work
- Test infrastructure improvements

**Skip:**
- Paperclip-product features (CEO/department/task primitives that partyclip replaces with leader/ministry/policy-patch)
- Paperclip-specific UI strings, branding, marketing copy
- Anything that re-introduces the `@paperclipai`, `paperclipai`, `PAPERCLIP_`, or `Paperclip` identifiers we renamed (those rename conflicts will surface during cherry-pick)
- Release/publish automation tied to `paperclipai` npm scope

When in doubt, open an issue describing the upstream change and link it to a partyclip-side decision.

## Operator migration notes (one-time, post-rename)

Anyone with an existing partyclip checkout from before the Paperclip → partyclip rename must do the following before `pnpm dev` will work:

### 1. Local PostgreSQL database

The DB user, password, and database name all changed from `paperclip` to `partyclip`:

```bash
# Create the new database and user (replace if you use a different superuser):
createdb partyclip
psql -c "CREATE USER partyclip WITH PASSWORD 'partyclip';"
psql -c "GRANT ALL PRIVILEGES ON DATABASE partyclip TO partyclip;"

# Optional: dump and restore data from the old paperclip DB
pg_dump paperclip | psql partyclip
```

### 2. Environment variables

The `PAPERCLIP_*` env-var prefix is now `PARTYCLIP_*`. Update your local `.env` and any shell exports:

```bash
# Replace any line like:  PAPERCLIP_HOME=...
# With:                   PARTYCLIP_HOME=...
sed -i '' 's/^PAPERCLIP_/PARTYCLIP_/g' .env
```

The `PAPERCLIPAI_*` prefix used by some Docker tooling (e.g. `PAPERCLIPAI_VERSION`, `PAPERCLIPAI_CMD`) is now `PARTYCLIPAI_*`.

### 3. Auth secret rotation

`BETTER_AUTH_SECRET=paperclip-dev-secret` is now `partyclip-dev-secret`. **This invalidates every existing dev session.** Sign out and sign back in.

### 4. Container home and systemd quadlet units

Docker images now mount `/partyclip` instead of `/paperclip`. If you have a running container, stop and recreate it.

systemd quadlet unit files were renamed (`paperclip.container` → `partyclip.container`, etc.). If you run partyclip via systemd, `systemctl stop` the old units, replace them, then `systemctl daemon-reload && systemctl start`.

### 5. HTTP API headers

External clients calling the API must replace the `X-Paperclip-` header prefix with `X-Partyclip-`. Affected headers include:

- `X-Paperclip-Run-Id` → `X-Partyclip-Run-Id`
- `X-Paperclip-Signature` → `X-Partyclip-Signature`
- `X-Paperclip-Timestamp` → `X-Partyclip-Timestamp`
- `X-Paperclip-Dev-Server-Status-Token` → `X-Partyclip-Dev-Server-Status-Token`

### 6. npm scope

Workspace packages moved from `@paperclipai/*` to `@partyclipai/*`. If you have a downstream project depending on `@paperclipai/server`, `@paperclipai/plugin-sdk`, etc., update its `package.json` to `@partyclipai/*` (note: those packages are currently `private: true` and not published — see the rename PR for context).

The unscoped CLI binary `paperclipai` is now `partyclipai`. Any shell aliases or CI invocations of `paperclipai run …` must become `partyclipai run …`.

## Things deliberately preserved across the rename

- `paperclipai/paperclip` GitHub URLs in `README.md` (lines 9 and 156, attributing the upstream project)
- `LICENSE` retains the `Copyright (c) 2025 Paperclip AI` line; partyclip contributors are added alongside, not replacing
- `doc/` (lowercase) holds pre-fork upstream specifications and is preserved verbatim. `docs/` (with the `s`) is the canonical post-fork documentation directory.
- `releases/` historical release notes still link to upstream PRs
- `scripts/paperclip-commit-metrics.ts` and the `metrics:paperclip-commits` pnpm script — they track the upstream Paperclip system's `Co-Authored-By: Paperclip <noreply@paperclip.ing>` signature across GitHub, which is a property of upstream by definition
- `paperclip_required` enum value in `AdapterSkillOrigin` (kept for type compatibility with `hermes-paperclip-adapter`, a third-party npm-published adapter still typed against upstream's `@paperclipai/adapter-utils`)
- The third-party `hermes-paperclip-adapter` npm package itself
