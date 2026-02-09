# Publishing the CLI

This repo includes the `ohmydashboard` CLI in `packages/cli`.

## One-time setup

Make sure you are logged in to npm:

```bash
npm login
```

## Release

From the repo root:

```bash
pnpm cli:release          # patch bump (0.2.0 → 0.2.1)
pnpm cli:release minor    # minor bump (0.2.0 → 0.3.0)
pnpm cli:release major    # major bump (0.2.0 → 1.0.0)
```

Then push:

```bash
git push && git push --tags
```

This handles version bump, build, npm publish, git commit, and git tag in one step.

## Quick sanity check

After publishing:

```bash
npx ohmydashboard@latest --help
```
