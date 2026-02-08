#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const cli_1 = require("./cli");
(0, cli_1.runCli)(process.argv.slice(2), { fs: fs_1.default, path: path_1.default }).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
