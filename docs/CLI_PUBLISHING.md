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
# Bump version first (required for npm to publish)
cd packages/cli
pnpm version patch
```

```bash
pnpm cli:build
pnpm cli:publish
```

## Quick sanity check

After publishing:

```bash
npx ohmydashboard --help
```
