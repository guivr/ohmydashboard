import * as fs from "fs";
import * as path from "path";
export interface ExecFn {
    (command: string, args: string[], options?: {
        cwd?: string;
    }): Promise<void>;
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
export declare function parseGitHubRepo(repoUrl: string): {
    owner: string;
    repo: string;
} | null;
export declare function buildTarballUrl(owner: string, repo: string, branch: string): string;
export declare function runCli(args: string[], deps: CliDeps): Promise<void>;
