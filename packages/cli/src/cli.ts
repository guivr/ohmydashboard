import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import os from "os";
import https from "https";
import { pipeline } from "stream/promises";

export interface ExecFn {
  (command: string, args: string[], options?: { cwd?: string }): Promise<void>;
}

export interface DownloadRepoFn {
  (opts: {
    owner: string;
    repo: string;
    branch: string;
    targetPath: string;
  }): Promise<void>;
}

export interface CliDeps {
  exec?: ExecFn;
  downloadRepo?: DownloadRepoFn;
  cwd?: string;
  log?: (line: string) => void;
  fs: typeof fs;
  path: typeof path;
}

interface ParsedArgs {
  targetDir: string;
  repoUrl: string;
  showHelp: boolean;
  useSsh: boolean;
  branch: string;
  useGit: boolean;
}

const DEFAULT_REPO = "https://github.com/gvrizzo/ohmydashboard.git";
const DEFAULT_SSH_REPO = "git@github.com:gvrizzo/ohmydashboard.git";
const DEFAULT_DIR = "ohmydashboard";
const DEFAULT_BRANCH = "main";

function parseArgs(args: string[]): ParsedArgs {
  let repoUrl = DEFAULT_REPO;
  let targetDir = DEFAULT_DIR;
  let showHelp = false;
  let useSsh = false;
  let branch = DEFAULT_BRANCH;
  let useGit = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) continue;
    if (arg === "--help" || arg === "-h") {
      showHelp = true;
      continue;
    }
    if (arg === "--git") {
      useGit = true;
      continue;
    }
    if (arg === "--ssh") {
      useSsh = true;
      continue;
    }
    if (arg === "--repo") {
      const next = args[i + 1];
      if (next) {
        repoUrl = next;
        i += 1;
      }
      continue;
    }
    if (arg === "--branch") {
      const next = args[i + 1];
      if (next) {
        branch = next;
        i += 1;
      }
      continue;
    }
    if (!arg.startsWith("-") && targetDir === DEFAULT_DIR) {
      targetDir = arg;
    }
  }

  return { targetDir, repoUrl, showHelp, useSsh, branch, useGit };
}

function defaultExec(command: string, args: string[], options?: { cwd?: string }) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options?.cwd,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

export function parseGitHubRepo(repoUrl: string): { owner: string; repo: string } | null {
  const trimmed = repoUrl.trim();
  if (/^[^/]+\/[^/]+$/.test(trimmed)) {
    const [owner, repo] = trimmed.split("/");
    return { owner, repo: repo.replace(/\.git$/, "") };
  }

  const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/(.+?)(\.git)?$/i);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  const httpsMatch = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/(.+?)(\.git)?$/i);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }

  return null;
}

export function buildTarballUrl(owner: string, repo: string, branch: string) {
  return `https://codeload.github.com/${owner}/${repo}/tar.gz/${branch}`;
}

async function defaultDownloadRepo(opts: {
  owner: string;
  repo: string;
  branch: string;
  targetPath: string;
}) {
  const { owner, repo, branch, targetPath } = opts;
  await fs.promises.mkdir(targetPath, { recursive: true });

  const tmpFile = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ohmydashboard-"));
  const tarPath = path.join(tmpFile, `${repo}.tar.gz`);
  const url = buildTarballUrl(owner, repo, branch);

  await new Promise<void>((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`Failed to download repo (HTTP ${res.statusCode})`));
        return;
      }
      const fileStream = fs.createWriteStream(tarPath);
      pipeline(res, fileStream).then(resolve).catch(reject);
    }).on("error", reject);
  });

  const tar = await import("tar");
  await tar.x({
    file: tarPath,
    cwd: targetPath,
    strip: 1,
  });
}

export async function runCli(args: string[], deps: CliDeps) {
  const { fs, path } = deps;
  const exec = deps.exec ?? defaultExec;
  const downloadRepo = deps.downloadRepo ?? defaultDownloadRepo;
  const cwd = deps.cwd ?? process.cwd();
  const log = deps.log ?? console.log;

  const { targetDir, repoUrl, showHelp, useSsh, branch, useGit } = parseArgs(args);
  if (showHelp) {
    log("Usage: npx ohmydashboard [target-dir] [--repo <url>] [--branch <name>] [--git] [--ssh]");
    return;
  }

  const targetPath = path.join(cwd, targetDir);
  if (fs.existsSync(targetPath)) {
    throw new Error("Target directory already exists");
  }

  if (useGit) {
    const cloneArgs = ["clone"];
    if (branch) {
      cloneArgs.push("--branch", branch);
    }
    cloneArgs.push(useSsh ? DEFAULT_SSH_REPO : repoUrl, targetDir);
    await exec("git", cloneArgs, { cwd });
  } else {
    const parsed = parseGitHubRepo(repoUrl);
    if (!parsed) {
      throw new Error("Repo must be a GitHub URL or owner/repo (use --git for other hosts).");
    }
    await downloadRepo({
      owner: parsed.owner,
      repo: parsed.repo,
      branch,
      targetPath,
    });
  }
  await exec("pnpm", ["install"], { cwd: targetPath });

  log("");
  log("Setup complete!");
  log(`cd ${targetDir}`);
  log("pnpm dev");
  log("Open http://localhost:3000 and connect integrations at /settings");
}
