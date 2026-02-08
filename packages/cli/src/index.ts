#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { runCli } from "./cli";

runCli(process.argv.slice(2), { fs, path }).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
