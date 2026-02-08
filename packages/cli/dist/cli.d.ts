import type fs from "fs";
import type path from "path";
export interface ExecFn {
    (command: string, args: string[], options?: {
        cwd?: string;
    }): Promise<void>;
}
export interface CliDeps {
    exec?: ExecFn;
    cwd?: string;
    log?: (line: string) => void;
    fs: typeof fs;
    path: typeof path;
}
export declare function runCli(args: string[], deps: CliDeps): Promise<void>;
