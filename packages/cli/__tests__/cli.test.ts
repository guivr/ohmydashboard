// @vitest-environment node

import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { runCli } from "../src/cli";

describe("ohmydashboard CLI", () => {
  it("clones the default repo into the default folder and installs deps", async () => {
    const exec = vi.fn().mockResolvedValue(undefined);
    const logs: string[] = [];
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ohmydashboard-test-"));

    await runCli([], {
      exec,
      cwd,
      log: (line) => logs.push(line),
      fs,
      path,
    });

    expect(exec).toHaveBeenNthCalledWith(
      1,
      "git",
      ["clone", "https://github.com/gvrizzo/ohmydashboard", "ohmydashboard"],
      { cwd }
    );
    expect(exec).toHaveBeenNthCalledWith(
      2,
      "pnpm",
      ["install"],
      { cwd: path.join(cwd, "ohmydashboard") }
    );
    expect(logs.join("\n")).toContain("pnpm dev");
  });

  it("accepts a custom target directory", async () => {
    const exec = vi.fn().mockResolvedValue(undefined);
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ohmydashboard-test-"));

    await runCli(["my-dashboard"], {
      exec,
      cwd,
      log: () => {},
      fs,
      path,
    });

    expect(exec).toHaveBeenNthCalledWith(
      1,
      "git",
      ["clone", "https://github.com/gvrizzo/ohmydashboard", "my-dashboard"],
      { cwd }
    );
  });

  it("accepts a custom repo via --repo", async () => {
    const exec = vi.fn().mockResolvedValue(undefined);
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ohmydashboard-test-"));

    await runCli(["--repo", "https://example.com/ohmydashboard.git"], {
      exec,
      cwd,
      log: () => {},
      fs,
      path,
    });

    expect(exec).toHaveBeenNthCalledWith(
      1,
      "git",
      ["clone", "https://example.com/ohmydashboard.git", "ohmydashboard"],
      { cwd }
    );
  });

  it("errors when the target directory already exists", async () => {
    const exec = vi.fn().mockResolvedValue(undefined);
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ohmydashboard-test-"));
    const existing = path.join(cwd, "ohmydashboard");
    fs.mkdirSync(existing, { recursive: true });

    await expect(
      runCli([], {
        exec,
        cwd,
        log: () => {},
        fs,
        path,
      })
    ).rejects.toThrow("Target directory already exists");
    expect(exec).not.toHaveBeenCalled();
  });
});
