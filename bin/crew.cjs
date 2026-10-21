#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

function selectPlatform({ platform, arch, libc }) {
  if (
    !["darwin", "linux"].includes(platform) ||
    !["arm64", "x64"].includes(arch) ||
    (platform === "linux" && libc !== "glibc")
  ) {
    throw new Error(
      `Unsupported platform: ${platform}-${arch}${libc ? ` (${libc})` : ""}. crew supports macOS and glibc Linux on ARM64/x64.`,
    );
  }
  return `@cristianbgp/crew-${platform}-${arch}`;
}
function resolveBinary(name, root = path.resolve(__dirname, "..")) {
  const expected = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  ).version;
  let manifest;
  try {
    manifest = require.resolve(`${name}/package.json`, { paths: [root] });
  } catch {
    throw new Error(
      `Missing ${name}@${expected}. Reinstall @cristianbgp/crew@${expected} with optional dependencies enabled (npm install --include=optional).`,
    );
  }
  const installed = JSON.parse(fs.readFileSync(manifest, "utf8"));
  if (installed.version !== expected)
    throw new Error(
      `Native package version mismatch: expected ${name}@${expected}, found ${installed.version}. Reinstall crew with optional dependencies enabled.`,
    );
  const binary = path.join(path.dirname(manifest), "bin", "crew");
  try {
    fs.accessSync(binary, fs.constants.X_OK);
  } catch {
    throw new Error(
      `Missing or unexecutable binary in ${name}. Reinstall crew with optional dependencies enabled.`,
    );
  }
  const header = Buffer.alloc(4);
  const fd = fs.openSync(binary, "r");
  try {
    fs.readSync(fd, header, 0, 4, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (!["cffaedfe", "7f454c46"].includes(header.toString("hex")))
    throw new Error(
      `Invalid native executable in ${name}. Reinstall crew with optional dependencies enabled.`,
    );
  return binary;
}
function run(args) {
  try {
    if (Number(process.versions.node.split(".")[0]) < 22)
      throw new Error(
        "The npm launcher requires Node.js >=22. You can also use a standalone crew download.",
      );
    const libc =
      process.platform === "linux"
        ? process.report.getReport().header.glibcVersionRuntime
          ? "glibc"
          : "musl"
        : undefined;
    const binary = resolveBinary(
      selectPlatform({ platform: process.platform, arch: process.arch, libc }),
    );
    const child = spawn(binary, args, { stdio: "inherit", env: process.env });
    const signals = ["SIGINT", "SIGTERM", "SIGHUP"];
    const forward = Object.fromEntries(
      signals.map((signal) => [signal, () => child.kill(signal)]),
    );
    for (const signal of signals) process.on(signal, forward[signal]);
    const clean = () => {
      for (const signal of signals)
        process.removeListener(signal, forward[signal]);
    };
    child.on("error", (error) => {
      clean();
      console.error(
        `crew: Cannot execute ${binary}: ${error.message}. Reinstall crew.`,
      );
      process.exitCode = 1;
    });
    child.on("exit", (code, signal) => {
      clean();
      if (signal) process.kill(process.pid, signal);
      else process.exitCode = code ?? 1;
    });
    return child;
  } catch (error) {
    console.error(`crew: ${error.message}`);
    process.exitCode = 1;
  }
}
module.exports = { selectPlatform, resolveBinary, run };
if (require.main === module) run(process.argv.slice(2));
