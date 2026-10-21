import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createConfig } from "../src/config/store";
import { alive, quote, waitFor } from "./helpers";

const cli = resolve("src/cli.tsx");
const launches = ["executable", "bunx", "source"] as const;

for (const launch of launches) {
  for (const exported of [false, true]) {
    test(`${launch}: services load their own env files and preserve exported overrides (${exported})`, async () => {
      const root = await mkdtemp(join(tmpdir(), "crew-env-"));
      const a = join(root, "repo-a"),
        b = join(root, "repo-b");
      let child: Bun.Subprocess | undefined;
      const pids: number[] = [];
      try {
        await mkdir(a);
        await mkdir(b);
        await writeFile(
          join(a, ".env"),
          "CREW_TEST_SHARED=repo-a\nCREW_TEST_A_ONLY=from-a\n",
        );
        await writeFile(
          join(b, ".env"),
          "CREW_TEST_SHARED=repo-b\nCREW_TEST_B_ONLY=from-b\nCREW_TEST_ORDER=base\n",
        );
        await writeFile(
          join(b, ".env.development"),
          "CREW_TEST_MODE=development-b\nCREW_TEST_ORDER=development\n",
        );
        await writeFile(
          join(b, ".env.local"),
          "CREW_TEST_LOCAL=local-b\nCREW_TEST_ORDER=local\n",
        );
        const fixture = join(root, "report.ts");
        await writeFile(
          fixture,
          `import {writeFileSync} from "node:fs";
writeFileSync(process.argv[2], JSON.stringify({
  cwd: process.cwd(), pid: process.pid,
  shared: process.env.CREW_TEST_SHARED ?? null,
  a: process.env.CREW_TEST_A_ONLY ?? null,
  b: process.env.CREW_TEST_B_ONLY ?? null,
  mode: process.env.CREW_TEST_MODE ?? null,
  local: process.env.CREW_TEST_LOCAL ?? null,
  order: process.env.CREW_TEST_ORDER ?? null,
  exported: process.env.CREW_TEST_EXPORTED ?? null,
}));
setInterval(() => {}, 60000);
`,
        );
        const reports = [
          join(a, "report.json"),
          join(b, "report.json"),
          join(b, "no-env.json"),
        ];
        await createConfig(join(a, "crew.toml"), {
          name: "Environment fixture",
          services: [a, b, b].map((cwd, i) => ({
            id: ["a", "b", "no-env"][i]!,
            repo: "fixture",
            cwd,
            autostart: true,
            command: `${quote(process.execPath)} ${i === 2 ? "--no-env-file " : ""}${quote(fixture)} ${quote(reports[i]!)}`,
          })),
        });
        // Mimic an installed bin without accessing the network or global links.
        const bin = join(a, "node_modules/.bin");
        await mkdir(bin, { recursive: true });
        await symlink(cli, join(bin, "crew-env-fixture"));
        const env = {
          ...process.env,
          TERM: "xterm-256color",
          NODE_ENV: "development",
          CREW_THEME: "dark",
          XDG_STATE_HOME: join(root, "state"),
          CREW_TEST_SHARED: exported ? "shell-value" : undefined,
          CREW_TEST_EXPORTED: "from-shell",
          CREW_TEST_A_ONLY: undefined,
          CREW_TEST_B_ONLY: undefined,
          CREW_TEST_MODE: undefined,
          CREW_TEST_LOCAL: undefined,
          CREW_TEST_ORDER: undefined,
        };
        child = Bun.spawn(
          launch === "executable"
            ? [cli]
            : launch === "bunx"
              ? [process.execPath, "x", "--no-install", "crew-env-fixture"]
              : [process.execPath, "--no-env-file", cli],
          { cwd: a, env, terminal: { cols: 100, rows: 30, data() {} } },
        );
        await waitFor(() => reports.every((path) => existsSync(path)), 8000);
        const [first, second, plain] = await Promise.all(
          reports.map(async (path) => JSON.parse(await readFile(path, "utf8"))),
        );
        pids.push(first.pid, second.pid, plain.pid);
        // macOS resolves /var to /private/var in process.cwd().
        expect(first.cwd.endsWith("/repo-a")).toBe(true);
        expect(second.cwd.endsWith("/repo-b")).toBe(true);
        expect(first.shared).toBe(exported ? "shell-value" : "repo-a");
        expect(second.shared).toBe(exported ? "shell-value" : "repo-b");
        expect(first.a).toBe("from-a");
        expect(first.b).toBeNull();
        expect(second.a).toBeNull();
        expect(second.b).toBe("from-b");
        expect(second.mode).toBe("development-b");
        expect(second.local).toBe("local-b");
        expect(second.order).toBe("local");
        // crew's supervisor must not load dotenv on behalf of the command.
        expect(plain.shared).toBe(exported ? "shell-value" : null);
        expect(plain.a).toBeNull();
        expect(plain.b).toBeNull();
        expect(plain.mode).toBeNull();
        expect(plain.local).toBeNull();
        expect(plain.order).toBeNull();
        for (const report of [first, second, plain])
          expect(report.exported).toBe("from-shell");
        child.terminal!.write("\x11");
        await waitFor(() => child!.exitCode !== null, 8000);
        expect(child.exitCode).toBe(0);
        expect(pids.every((pid) => !alive(pid))).toBe(true);
      } finally {
        if (child?.exitCode === null) {
          child.kill("SIGTERM");
          await child.exited;
        }
        child?.terminal?.close();
        await rm(root, { recursive: true, force: true });
      }
    }, 20000);
  }
}
