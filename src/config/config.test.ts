import { test, expect } from "bun:test";
import {
  mkdtemp,
  readFile,
  writeFile,
  mkdir,
  chmod,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, createConfig, saveConfig } from "./store";
import { parseConfig } from "./parse";
async function fixture(fn: (dir: string, path: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "crew-config-"));
  try {
    await mkdir(join(dir, "apps"));
    await fn(dir, join(dir, "crew.toml"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
test("resolves directories from the file and defaults autostart and group", () =>
  fixture(async (dir, path) => {
    await writeFile(
      path,
      'name="project"\n[services.web]\ncwd="apps"\ncommand="bun dev"\n',
    );
    const d = (await loadConfig(path))!;
    expect(d.config.services[0]).toEqual({
      id: "web",
      cwd: join(dir, "apps"),
      command: "bun dev",
      repo: "project",
      autostart: true,
    });
  }));
test("rejects malformed and invalid fields before executing", () =>
  fixture(async (dir, path) => {
    for (const [source, error] of [
      ["name=[]", "name"],
      ['name="x"\n[services.web]\ncwd="."\ncommand=""', "web.command"],
      [
        'name="x"\n[services.web]\ncwd="."\ncommand="x"\nautostart="yes"',
        "web.autostart",
      ],
      ['[services.web]\ncommand="x"\n[services.web]', "TOML"],
    ]) {
      expect(() => parseConfig(source!, path)).toThrow(error);
    }
  }));
test("updates values preserving comments, CRLF, quoted names and unrelated settings", () =>
  fixture(async (dir, path) => {
    const text =
      '# environment\r\nname = "p"\r\n[services."web app"] # group\r\n# local command\r\ncwd = "."\r\ncommand = """bun\r\nrun dev""" # keep me\r\n[other]\r\nkey = 12 # untouched\r\n';
    await writeFile(path, text);
    const d = (await loadConfig(path))!;
    const saved = await saveConfig(d, {
      type: "update",
      serviceId: "web app",
      service: { ...d.config.services[0]!, command: "bun run start" },
    });
    const result = await readFile(path, "utf8");
    expect(result).toContain('command = "bun run start" # keep me\r\n');
    expect(result).toContain("# local command");
    expect(result).toContain("[other]\r\nkey = 12 # untouched");
    expect(saved.config.services[0]!.command).toBe("bun run start");
  }));
test("add/remove round trip and conflicts leave external content untouched", () =>
  fixture(async (dir, path) => {
    let d = await createConfig(path, { name: "p", services: [] });
    d = await saveConfig(d, {
      type: "add",
      serviceId: "api",
      service: {
        id: "api",
        cwd: dir,
        repo: "one",
        command: 'printf "hi"',
        autostart: false,
      },
    });
    expect(d.config.services[0]!.autostart).toBe(false);
    const external =
      (await readFile(path, "utf8")) + "\n# changed externally\n";
    await writeFile(path, external);
    await expect(
      saveConfig(d, { type: "remove", serviceId: "api" }),
    ).rejects.toThrow("changed");
    expect(await readFile(path, "utf8")).toBe(external);
    d = (await loadConfig(path))!;
    d = await saveConfig(d, { type: "remove", serviceId: "api" });
    expect(d.config.services).toHaveLength(0);
    expect(d.text).toContain("# changed externally");
    await expect(
      createConfig(path, { name: "other", services: [] }),
    ).rejects.toThrow();
  }));
test("read-only config cannot be silently replaced", () =>
  fixture(async (dir, path) => {
    await createConfig(path, { name: "p", services: [] });
    await chmod(path, 0o444);
    const d = (await loadConfig(path))!;
    try {
      await expect(
        saveConfig(d, {
          type: "add",
          serviceId: "a",
          service: {
            id: "a",
            cwd: dir,
            repo: "p",
            command: "x",
            autostart: true,
          },
        }),
      ).rejects.toThrow();
      expect(await readFile(path, "utf8")).toBe(d.text);
    } finally {
      await chmod(path, 0o644);
    }
  }));
test("a failed first write does not publish a partial final config", () =>
  fixture(async (dir, path) => {
    const code = `import {createConfig} from ${JSON.stringify(new URL("./store.ts", import.meta.url).pathname)};await createConfig(${JSON.stringify(path)}, {name:'x'.repeat(200000),services:[]});`;
    const child = Bun.spawn(
      [
        "/bin/sh",
        "-c",
        'ulimit -f 1; exec "$1" -e "$2"',
        "sh",
        process.execPath,
        code,
      ],
      { stdout: "ignore", stderr: "pipe" },
    );
    expect(await child.exited).not.toBe(0);
    expect(await loadConfig(path)).toBe(null);
    const d = await createConfig(path, { name: "retry", services: [] });
    expect(d.config.name).toBe("retry");
  }));
