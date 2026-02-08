// @vitest-environment node

import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { buildTarballUrl, runCli } from "../src/cli";

describe("ohmydashboard CLI", () => {
  it("builds GitHub tarball URLs without refs/heads", () => {
    expect(buildTarballUrl("guivr", "ohmydashboard", "main")).toBe(
      "https://codeload.github.com/guivr/ohmydashboard/tar.gz/main"
    );
  });

  it("clones the default repo into the default folder and installs deps", async () => {
    const exec = vi.fn().mockResolvedValue(undefined);
    const downloadRepo = vi.fn().mockResolvedValue(undefined);
    const logs: string[] = [];
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ohmydashboard-test-"));

    await runCli([], {
      exec,
      downloadRepo,
      cwd,
      log: (line) => logs.push(line),
      fs,
      path,
    });

    expect(downloadRepo).toHaveBeenCalledWith({
      owner: "guivr",
      repo: "ohmydashboard",
      branch: "main",
      targetPath: path.join(cwd, "ohmydashboard"),
    });
    expect(exec).toHaveBeenNthCalledWith(
      1,
      "pnpm",
      ["install"],
      { cwd: path.join(cwd, "ohmydashboard") }
    );
    const output = logs.join("\n");
    expect(output).toContain("Next steps");
    expect(output).toContain("cd ohmydashboard");
    expect(output).toContain("pnpm dev");
  });

  it("accepts a custom target directory", async () => {
    const exec = vi.fn().mockResolvedValue(undefined);
    const downloadRepo = vi.fn().mockResolvedValue(undefined);
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ohmydashboard-test-"));

    await runCli(["my-dashboard"], {
      exec,
      downloadRepo,
      cwd,
      log: () => {},
      fs,
      path,
    });

    expect(downloadRepo).toHaveBeenCalledWith({
      owner: "guivr",
      repo: "ohmydashboard",
      branch: "main",
      targetPath: path.join(cwd, "my-dashboard"),
    });
  });

  it("accepts a custom repo via --repo", async () => {
    const exec = vi.fn().mockResolvedValue(undefined);
    const downloadRepo = vi.fn().mockResolvedValue(undefined);
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ohmydashboard-test-"));

    await runCli(["--repo", "https://github.com/example/ohmydashboard.git"], {
      exec,
      downloadRepo,
      cwd,
      log: () => {},
      fs,
      path,
    });

    expect(downloadRepo).toHaveBeenCalledWith({
      owner: "example",
      repo: "ohmydashboard",
      branch: "main",
      targetPath: path.join(cwd, "ohmydashboard"),
    });
  });

  it("passes --branch to the download when provided", async () => {
    const exec = vi.fn().mockResolvedValue(undefined);
    const downloadRepo = vi.fn().mockResolvedValue(undefined);
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ohmydashboard-test-"));

    await runCli(["--branch", "main"], {
      exec,
      downloadRepo,
      cwd,
      log: () => {},
      fs,
      path,
    });

    expect(downloadRepo).toHaveBeenCalledWith({
      owner: "guivr",
      repo: "ohmydashboard",
      branch: "main",
      targetPath: path.join(cwd, "ohmydashboard"),
    });
  });

  it("uses git clone when --git is provided", async () => {
    const exec = vi.fn().mockResolvedValue(undefined);
    const downloadRepo = vi.fn().mockResolvedValue(undefined);
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ohmydashboard-test-"));

    await runCli(["--git"], {
      exec,
      downloadRepo,
      cwd,
      log: () => {},
      fs,
      path,
    });

    expect(exec).toHaveBeenNthCalledWith(
      1,
      "git",
      ["clone", "--branch", "main", "https://github.com/guivr/ohmydashboard.git", "ohmydashboard"],
      { cwd }
    );
    expect(downloadRepo).not.toHaveBeenCalled();
  });

  it("errors when the target directory already exists", async () => {
    const exec = vi.fn().mockResolvedValue(undefined);
    const downloadRepo = vi.fn().mockResolvedValue(undefined);
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ohmydashboard-test-"));
    const existing = path.join(cwd, "ohmydashboard");
    fs.mkdirSync(existing, { recursive: true });

    await expect(
      runCli([], {
        exec,
        downloadRepo,
        cwd,
        log: () => {},
        fs,
        path,
      })
    ).rejects.toThrow("Target directory already exists");
    expect(exec).not.toHaveBeenCalled();
    expect(downloadRepo).not.toHaveBeenCalled();
  });
});
