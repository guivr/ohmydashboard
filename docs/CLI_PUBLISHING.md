# Publishing the CLI

This repo includes the `ohmydashboard` CLI in `packages/cli`.

## One-time setup

Make sure you are logged in to npm:

```bash
npm login
```

## Build + publish

From the repo root:

```bash
pnpm cli:build
pnpm cli:publish
```

## Quick sanity check

After publishing:

```bash
npx ohmydashboard --help
```
