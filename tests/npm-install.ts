// Actual npm installs from a disposable registry; no publication or global changes.
import { Terminal } from "@xterm/headless";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { buildBinary } from "../scripts/build";
import { stagePackages, packDirectory } from "../scripts/package";
import { hostPlatform, platforms } from "../scripts/platforms";
import { version } from "../src/version";
import { createConfig } from "../src/config/store";
import { startPackageRegistry, type FixtureManifest } from "./package-registry";
import { alive } from "./helpers";

const host = hostPlatform();
const root = await mkdtemp(join(tmpdir(), "crew npm é "));
const checks: string[] = [];
let registry: Awaited<ReturnType<typeof startPackageRegistry>> | undefined;
let child: Bun.Subprocess | undefined;
let screen: Terminal | undefined;
try {
  const nodeProbe = Bun.spawn(["node", "-p", "process.execPath"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const node = (await new Response(nodeProbe.stdout).text()).trim();
  if ((await nodeProbe.exited) !== 0)
    throw new Error("Node >=22 is required for npm acceptance tests");
  const npmCli =
    process.env.CREW_TEST_NPM_CLI ||
    resolve(dirname(node), "../lib/node_modules/npm/bin/npm-cli.js");
  await access(npmCli);
  const tools = join(root, "tools");
  await mkdir(tools);
  await symlink(node, join(tools, "node"));
  await symlink("/bin/sh", join(tools, "sh"));
  const emptyConfig = join(root, "empty.npmrc");
  await writeFile(emptyConfig, "");
  const globalConfig = join(root, "global.npmrc");
  await writeFile(globalConfig, "");
  const env = {
    ...process.env,
    PATH: tools,
    SHELL: "/bin/sh",
    TERM: "xterm-256color",
    CREW_THEME: undefined,
    CREW_NPM_SENTINEL: undefined,
    NPM_CONFIG_USERCONFIG: emptyConfig,
    NPM_CONFIG_GLOBALCONFIG: globalConfig,
    NPM_CONFIG_CACHE: join(root, "cache"),
    NPM_CONFIG_PREFIX: join(root, "default-global"),
    NPM_CONFIG_GLOBAL: "false",
    XDG_STATE_HOME: join(root, "state"),
  };
  const binaries = join(root, "binaries"),
    stage = join(root, "staged"),
    tarballs = join(root, "tarballs");
  await buildBinary(host.id, binaries);
  await stagePackages(binaries, stage, { hostOnly: true });
  const rootManifest = JSON.parse(
    await readFile(join(stage, "root/package.json"), "utf8"),
  );
  const hostManifest = JSON.parse(
    await readFile(join(stage, host.id, "package.json"), "utf8"),
  );
  const rootTarball = await packDirectory(join(stage, "root"), tarballs),
    hostTarball = await packDirectory(join(stage, host.id), tarballs);
  const manifests: FixtureManifest[] = [
    rootManifest,
    ...platforms.map((p) =>
      p.id === host.id
        ? hostManifest
        : { name: p.packageName, version, os: [p.os], cpu: [p.cpu] },
    ),
  ];
  registry = await startPackageRegistry(manifests, {
    [rootManifest.name]: rootTarball,
    [host.packageName]: hostTarball,
  });
  async function npm(args: string[], cwd: string) {
    const p = Bun.spawn([node, npmCli, ...args], {
      cwd,
      env,
      stdout: "pipe",
      stderr: "pipe",
    });
    const out = await new Response(p.stdout).text(),
      err = await new Response(p.stderr).text();
    if ((await p.exited) !== 0)
      throw new Error(
        `npm ${args[0]} failed (exit ${p.exitCode}, signal ${p.signalCode})\n${out}\n${err}`,
      );
    return out;
  }
  const project = join(root, "project");
  await mkdir(project);
  await writeFile(
    join(project, "package.json"),
    JSON.stringify({
      name: "crew-npm-fixture",
      private: true,
      scripts: { "dev:all": "crew" },
    }),
  );
  await writeFile(
    join(project, ".env"),
    "CREW_THEME=invalid\nCREW_NPM_SENTINEL=from-launch-folder\n",
  );
  const config = await createConfig(join(project, "crew.toml"), {
    name: "npm fixture",
    services: [
      {
        id: "shell",
        repo: "npm",
        cwd: project,
        autostart: true,
        command:
          'printf "Process: %s\\nENV:%s\\n" "$$" "${CREW_NPM_SENTINEL-unset}"; while IFS= read -r line; do printf "ANSWER:%s\\n" "$line"; done',
      },
    ],
  });
  const installArgs = [
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--registry",
    registry.url,
  ];
  const packageSpec = `${rootManifest.name}@${version}`;
  await npm(["install", "--save-dev", packageSpec, ...installArgs], project);
  if (process.platform === "darwin") {
    const verify = Bun.spawn(
      [
        "/usr/bin/codesign",
        "--verify",
        "--strict",
        "--verbose=2",
        join(project, "node_modules", host.packageName, "bin/crew"),
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const details = await new Response(verify.stderr).text();
    if ((await verify.exited) !== 0)
      throw new Error(`Installed native signature failed: ${details}`);
  }
  if (
    (
      await npm(["run", "--silent", "dev:all", "--", "--version"], project)
    ).trim() !== version
  )
    throw new Error("npm run reported the wrong native version");
  checks.push(
    "npm devDependency installation and npm run use the matching native binary without Bun",
  );
  const invalid = Bun.spawn(
    [join(project, "node_modules/.bin/crew"), "invalid-argument"],
    { cwd: project, env, stdout: "pipe", stderr: "pipe" },
  );
  const invalidError = await new Response(invalid.stderr).text();
  if ((await invalid.exited) !== 1 || !invalidError.includes("Unknown command"))
    throw new Error("npm launcher did not preserve native failure status");
  checks.push("launcher preserves arguments and native failure exit status");
  for (const p of platforms) {
    const installed = await access(
      join(project, "node_modules", p.packageName),
    ).then(
      () => true,
      () => false,
    );
    if (installed !== (p.id === host.id))
      throw new Error(`Wrong optional platform selection: ${p.id}`);
  }
  checks.push("npm installs only the host platform package");
  const bx = Bun.spawn(
    [process.execPath, "x", "--no-install", "crew", "--version"],
    { cwd: project, env, stdout: "pipe", stderr: "pipe" },
  );
  const bxOut = await new Response(bx.stdout).text(),
    bxErr = await new Response(bx.stderr).text();
  if ((await bx.exited) !== 0 || bxOut.trim() !== version)
    throw new Error(`bunx compatibility failed: ${bxOut} ${bxErr}`);
  checks.push("existing bunx local-bin invocation remains compatible");
  async function interact(
    args: string[],
    signal: false | "SIGINT" | "SIGTERM",
  ) {
    screen = new Terminal({ cols: 100, rows: 30, allowProposedApi: true });
    const frame = () =>
      Array.from(
        { length: screen!.rows },
        (_, y) =>
          screen!.buffer.active
            .getLine(y + screen!.buffer.active.baseY)
            ?.translateToString(true) ?? "",
      ).join("\n");
    const until = async (fn: () => boolean, label: string) => {
      const end = Date.now() + 10000;
      while (!fn() && Date.now() < end) await Bun.sleep(25);
      if (!fn()) throw new Error(`${label}\n${frame()}`);
    };
    child = Bun.spawn(args, {
      cwd: project,
      env,
      detached: true,
      terminal: {
        cols: 100,
        rows: 30,
        data(_term, bytes) {
          screen!.write(bytes);
        },
      },
    });
    await until(
      () => frame().includes("ENV:unset") && frame().includes("Ctrl+Q"),
      "npm native startup",
    );
    const pid = Number(/Process: (\d+)/.exec(frame())?.[1]);
    if (!pid) throw new Error("Missing npm native service PID");
    child.terminal!.write("npm-input\r");
    await until(() => frame().includes("ANSWER:npm-input"), "npm input");
    if (signal) child.kill(signal);
    else child.terminal!.write("\x11");
    await until(() => child!.exitCode !== null, "npm quit");
    if (child.exitCode !== 0 || alive(pid))
      throw new Error("npm wrapper lost exit status or child cleanup");
    child.terminal!.close();
    screen.dispose();
    screen = undefined;
  }
  await interact([node, npmCli, "run", "--silent", "dev:all"], false);
  checks.push(
    "npm run interactive input, dotenv isolation, Ctrl+Q and descendant cleanup",
  );
  const prefix = join(root, "global");
  await npm(
    ["install", "--global", "--prefix", prefix, packageSpec, ...installArgs],
    project,
  );
  const globalBin = join(prefix, "bin/crew");
  const globalVersion = Bun.spawn([globalBin, "--version"], {
    cwd: project,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (
    (await new Response(globalVersion.stdout).text()).trim() !== version ||
    (await globalVersion.exited) !== 0
  )
    throw new Error("Global-prefix executable failed");
  await interact([globalBin, "--config", config.path], "SIGTERM");
  await interact([globalBin, "--config", config.path], "SIGINT");
  checks.push(
    "global-prefix install, config paths with spaces, SIGINT and SIGTERM preserve clean service shutdown",
  );
  const omitted = join(root, "omitted");
  await mkdir(omitted);
  await writeFile(join(omitted, "package.json"), '{"private":true}');
  await npm(
    ["install", packageSpec, "--omit=optional", ...installArgs],
    omitted,
  );
  const missing = Bun.spawn(
    [join(omitted, "node_modules/.bin/crew"), "--version"],
    { cwd: omitted, env, stdout: "pipe", stderr: "pipe" },
  );
  const missingError = await new Response(missing.stderr).text();
  if (
    (await missing.exited) !== 1 ||
    !missingError.includes("optional dependencies")
  )
    throw new Error(`Missing-platform diagnostic failed: ${missingError}`);
  checks.push(
    "omitted optional dependencies produce an actionable error without runtime fallback",
  );
  await access(config.path);
  console.log(checks.map((c) => `PASS ${c}`).join("\n"));
} finally {
  if (child?.exitCode === null) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
    await child.exited;
  }
  child?.terminal?.close();
  screen?.dispose();
  registry?.close();
  await rm(root, { recursive: true, force: true });
}
