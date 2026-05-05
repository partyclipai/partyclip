# `@partyclipai/plugin-news-ingest`

First-party plugin: scheduled JSON Feed fetcher.

## What it does

On each cron tick (default: hourly), the worker:

1. Loads the configured sources (`sources.yaml` in the deployment content repo, validated against `src/sources.ts`).
2. Fetches each source via `ctx.http.fetch`. Per-source timeout, optional bearer auth via `ctx.secrets.resolve(auth_secret_ref)`.
3. Parses the response as JSON Feed 1.1 (`src/feed-parser.ts`). Body text is **stripped at parse time** — only id, url, title, one-paragraph summary, publishedAt, authors, tags pass through.
4. Dedupes against a per-source watermark stored in `ctx.state` (a 500-id LRU ring per source per company). Already-seen items are skipped.
5. Emits one structured event per new item via `ctx.events.emit("ingested", companyId, payload)`. The SDK namespaces this as `plugin.partyclip.news-ingest.ingested`.
6. Writes a single `ctx.activity.log` summary per tick: total new items, per-source status (`ok` / `skipped` / `failed`).

Per-source failures are isolated. One broken feed does not stop the tick.

## What it deliberately does *not* do

- **No raw publisher body** is ever passed to subscribers. Body text is dropped before the event is emitted. This generalizes the ForumIngestor isolation principle (see `docs/handoff/08_AGENT_FRAMEWORK.md`) to all untrusted external content.
- **No RSS/Atom support** in v0. JSON Feed only. RSS/Atom is a follow-up; XML parsing is a defensive minefield not worth shipping in v0.
- **No host-side dedup.** The plugin owns its watermark.
- **No retries within a tick.** A failed fetch is logged and re-tried next tick.

## Configuration

Sources file lives in the deployment content repo at `plugins/news-ingest/sources.yaml`. The reference is in `partyclip-content/plugins/news-ingest/sources.example.yaml`.

```yaml
sources:
  - id: example-feed
    kind: json_feed
    url: https://example.com/feed.json
    label: Example
    max_items_per_fetch: 50
    timeout_seconds: 15
    auth_secret_ref: OPTIONAL_BEARER_SECRET_NAME
```

Schema and constraints: see `src/sources.ts`.

## Capabilities requested

| capability | why |
|---|---|
| `http.outbound` | fetch source URLs |
| `events.emit` | emit `ingested` events |
| `plugin.state.read` / `plugin.state.write` | per-source watermark |
| `secrets.read-ref` | resolve `auth_secret_ref` for paywalled feeds |
| `activity.log.write` | per-tick summary entry |

## Subscribing

Other plugins (or in-process consumers) subscribe via the SDK:

```ts
ctx.events.on("plugin.partyclip.news-ingest.ingested", async (event) => {
  // event.payload: { sourceId, itemId, url, title, summary, publishedAt, authors, tags }
});
```

The host-side rewriter that re-surfaces this under the canonical `news.ingested` event name (per `packages/shared/src/types/events.ts`) lands in a follow-up — see `docs/plugin-api.md` "domain events vs. plugin events".

## Testing

Pure pieces — sources schema, feed parser, dedupe, fetcher, orchestrator — are unit-tested in `src/*.test.ts`. The worker file itself is a thin SDK adapter; its behavior is covered by exercising the orchestrator directly with fake clients.
