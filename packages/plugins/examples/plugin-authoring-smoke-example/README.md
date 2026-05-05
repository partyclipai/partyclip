# Plugin Authoring Smoke Example

A Paperclip plugin

## Development

```bash
pnpm install
pnpm dev            # watch builds
pnpm dev:ui         # local dev server with hot-reload events
pnpm test
```

## Install Into Paperclip

```bash
pnpm partyclipai plugin install ./
```

## Build Options

- `pnpm build` uses esbuild presets from `@partyclipai/plugin-sdk/bundlers`.
- `pnpm build:rollup` uses rollup presets from the same SDK.
