import type fs from "fs";
import type path from "path";
import { spawn } from "child_process";

export interface ExecFn {
  (command: string, args: string[], options?: { cwd?: string }): Promise<void>;
}

export interface CliDeps {
  exec?: ExecFn;
  cwd?: string;
  log?: (line: string) => void;
  fs: typeof fs;
  path: typeof path;
}

interface ParsedArgs {
  targetDir: string;
  repoUrl: string;
  showHelp: boolean;
}

const DEFAULT_REPO = "https://github.com/gvrizzo/ohmydashboard";
const DEFAULT_DIR = "ohmydashboard";

function parseArgs(args: string[]): ParsedArgs {
  let repoUrl = DEFAULT_REPO;
  let targetDir = DEFAULT_DIR;
  let showHelp = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) continue;
    if (arg === "--help" || arg === "-h") {
      showHelp = true;
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
    if (!arg.startsWith("-") && targetDir === DEFAULT_DIR) {
      targetDir = arg;
    }
  }

  return { targetDir, repoUrl, showHelp };
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

export async function runCli(args: string[], deps: CliDeps) {
  const { fs, path } = deps;
  const exec = deps.exec ?? defaultExec;
  const cwd = deps.cwd ?? process.cwd();
  const log = deps.log ?? console.log;

  const { targetDir, repoUrl, showHelp } = parseArgs(args);
  if (showHelp) {
    log("Usage: npx ohmydashboard [target-dir] [--repo <url>]");
    return;
  }

  const targetPath = path.join(cwd, targetDir);
  if (fs.existsSync(targetPath)) {
    throw new Error("Target directory already exists");
  }

  await exec("git", ["clone", repoUrl, targetDir], { cwd });
  await exec("pnpm", ["install"], { cwd: targetPath });

  log("");
  log("Setup complete!");
  log(`cd ${targetDir}`);
  log("pnpm dev");
  log("Open http://localhost:3000 and connect integrations at /settings");
}
