#!/usr/bin/env node

/**
 * Release script for the ohmydashboard CLI package.
 *
 * Usage:
 *   pnpm cli:release          # bump patch (0.1.7 → 0.1.8)
 *   pnpm cli:release minor    # bump minor (0.1.7 → 0.2.0)
 *   pnpm cli:release major    # bump major (0.1.7 → 1.0.0)
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const cliDir = resolve(root, "packages/cli");

const bump = process.argv[2] || "patch";

if (!["patch", "minor", "major"].includes(bump)) {
  console.error(`Invalid bump type: "${bump}". Use patch, minor, or major.`);
  process.exit(1);
}

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: root, ...opts });
}

// 1. Bump version in packages/cli/package.json (no git tag from npm version)
run(`npm version ${bump} --no-git-tag-version`, { cwd: cliDir });

// 2. Read the new version
const pkg = JSON.parse(readFileSync(resolve(cliDir, "package.json"), "utf8"));
const version = pkg.version;
console.log(`\nReleasing ohmydashboard v${version}\n`);

// 3. Publish to npm (prepublishOnly will build automatically)
run(`pnpm --filter ohmydashboard publish --access public`);

// 4. Commit and tag
run(`git add packages/cli/package.json`);
run(`git commit -m "release cli v${version}"`);
run(`git tag v${version}`);

console.log(`\nDone! Published ohmydashboard@${version} to npm.`);
console.log(`Run "git push && git push --tags" to push the release.`);
