#!/bin/sh
# Provisions an isolated git worktree for a board task: creates the task's
# feature branch off develop, adds a sibling worktree folder, and copies the
# git-ignored files a fresh checkout needs.
#
# Used by the /task-start skill; can also be run by hand from the main checkout.
# Prints the new worktree's absolute path on stdout; all other output goes to
# stderr so callers can capture the path.
#
# Usage: scripts/new-worktree.sh <task-id>      e.g. scripts/new-worktree.sh L4-A
set -eu

id="${1:-}"
if [ -z "$id" ]; then
  echo "usage: scripts/new-worktree.sh <task-id>   (e.g. L4-A)" >&2
  exit 1
fi

repo_root="$(git rev-parse --show-toplevel)"

task_file="$(ls "$repo_root"/docs/tasks/"$id"-*.md 2>/dev/null | head -n1 || true)"
if [ -z "$task_file" ]; then
  echo "error: no task file matching docs/tasks/$id-*.md" >&2
  exit 1
fi

branch="$(sed -n 's/^branch:[[:space:]]*//p' "$task_file" | head -n1)"
if [ -z "$branch" ]; then
  echo "error: no 'branch:' field in $task_file" >&2
  exit 1
fi

if git -C "$repo_root" show-ref --verify --quiet "refs/heads/$branch"; then
  echo "error: branch '$branch' already exists — $id may already be claimed" >&2
  exit 1
fi

repo_name="$(basename "$repo_root")"
suffix="$(printf '%s' "$id" | tr '[:upper:]' '[:lower:]')"
worktree_dir="$(dirname "$repo_root")/${repo_name}-${suffix}"
if [ -e "$worktree_dir" ]; then
  echo "error: $worktree_dir already exists" >&2
  exit 1
fi

# New branch + worktree off develop; git output to stderr to keep stdout clean.
git -C "$repo_root" worktree add -b "$branch" "$worktree_dir" develop 1>&2

# Carry over git-ignored files a fresh worktree does not inherit. Each is
# optional — partyclip dev defaults to embedded PGlite with no committed .env.
for f in .env .claude/settings.local.json; do
  if [ -f "$repo_root/$f" ]; then
    mkdir -p "$worktree_dir/$(dirname "$f")"
    cp "$repo_root/$f" "$worktree_dir/$f"
    echo "  copied $f" >&2
  fi
done

# Per-instance local state directory (adapter plugins etc.), if present.
if [ -d "$repo_root/.partyclip" ]; then
  cp -R "$repo_root/.partyclip" "$worktree_dir/.partyclip"
  echo "  copied .partyclip/" >&2
fi

# node_modules and data/ are intentionally NOT copied: run `pnpm install` in
# the worktree if the task needs deps; the PGlite dev DB (data/) is recreated
# per worktree by `pnpm dev`.

echo "worktree ready on branch '$branch'" >&2
echo "$worktree_dir"
