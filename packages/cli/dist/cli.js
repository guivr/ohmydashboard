"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseGitHubRepo = parseGitHubRepo;
exports.buildTarballUrl = buildTarballUrl;
exports.runCli = runCli;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const os_1 = __importDefault(require("os"));
const https_1 = __importDefault(require("https"));
const promises_1 = require("stream/promises");
const DEFAULT_REPO = "https://github.com/guivr/ohmydashboard.git";
const DEFAULT_SSH_REPO = "git@github.com:guivr/ohmydashboard.git";
const DEFAULT_DIR = "ohmydashboard";
const DEFAULT_BRANCH = "main";
function parseArgs(args) {
    let repoUrl = DEFAULT_REPO;
    let targetDir = DEFAULT_DIR;
    let showHelp = false;
    let useSsh = false;
    let branch = DEFAULT_BRANCH;
    let useGit = false;
    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        if (!arg)
            continue;
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
function defaultExec(command, args, options) {
    return new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)(command, args, {
            cwd: options?.cwd,
            stdio: "inherit",
        });
        child.on("error", reject);
        child.on("exit", (code) => {
            if (code === 0)
                resolve();
            else
                reject(new Error(`${command} exited with code ${code}`));
        });
    });
}
function parseGitHubRepo(repoUrl) {
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
function buildTarballUrl(owner, repo, branch) {
    return `https://codeload.github.com/${owner}/${repo}/tar.gz/${branch}`;
}
async function defaultDownloadRepo(opts) {
    const { owner, repo, branch, targetPath } = opts;
    await fs.promises.mkdir(targetPath, { recursive: true });
    const tmpFile = await fs.promises.mkdtemp(path.join(os_1.default.tmpdir(), "ohmydashboard-"));
    const tarPath = path.join(tmpFile, `${repo}.tar.gz`);
    const url = buildTarballUrl(owner, repo, branch);
    await new Promise((resolve, reject) => {
        https_1.default.get(url, (res) => {
            if (res.statusCode && res.statusCode >= 400) {
                reject(new Error(`Failed to download repo (HTTP ${res.statusCode})`));
                return;
            }
            const fileStream = fs.createWriteStream(tarPath);
            (0, promises_1.pipeline)(res, fileStream).then(resolve).catch(reject);
        }).on("error", reject);
    });
    const tar = await Promise.resolve().then(() => __importStar(require("tar")));
    await tar.x({
        file: tarPath,
        cwd: targetPath,
        strip: 1,
    });
}
async function runCli(args, deps) {
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
    }
    else {
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
