import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, readdir } from "node:fs/promises";

// The bundler inventory includes modules reached through dynamic imports and
// peers, while excluding development dependencies that are never bundled.
export async function javascriptNotices(inputs: string[]) {
  const seen = new Set<string>(),
    sections: string[] = [];
  async function visit(input: string) {
    if (!input.includes("node_modules/")) return;
    let directory = dirname(resolve(import.meta.dir, "..", input));
    for (;;) {
      let pkg;
      try {
        pkg = JSON.parse(
          await readFile(join(directory, "package.json"), "utf8"),
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      if (pkg?.name) {
        const key = `${pkg.name}@${pkg.version}`;
        if (seen.has(key)) return;
        seen.add(key);
        const files = (await readdir(directory))
          .filter((file) => /^(license|copying|notice)([.-]|$)/i.test(file))
          .sort();
        if (
          !files.length &&
          pkg.name === "react-devtools-core" &&
          pkg.repository?.url === "https://github.com/facebook/react.git" &&
          pkg.license === "MIT"
        ) {
          // This package omits its repository-root LICENSE. React ships that
          // same repository-wide license with the complete Meta copyright.
          const reactDirectory = dirname(
            fileURLToPath(import.meta.resolve("react")),
          );
          sections.push(
            `## ${key}\n\nReact repository LICENSE (https://github.com/facebook/react/blob/main/LICENSE):\n\n${await readFile(join(reactDirectory, "LICENSE"), "utf8")}\n`,
          );
        } else {
          if (!files.length) throw new Error(`Missing runtime license: ${key}`);
          sections.push(
            `## ${key}\n\n` +
              (
                await Promise.all(
                  files.map(
                    async (file) =>
                      `### ${file}\n\n${await readFile(join(directory, file), "utf8")}\n`,
                  ),
                )
              ).join("\n"),
          );
        }
        return;
      }
      const next = dirname(directory);
      if (next === directory)
        throw new Error(`Cannot locate runtime manifest: ${input}`);
      directory = next;
    }
  }
  const comments = new Set<string>();
  for (const input of [...inputs].sort()) {
    await visit(input);
    // Upstream packages can themselves contain bundled third-party modules.
    // Preserve their supplied legal comments as well as package-root licenses.
    if (input.includes("node_modules/") && /\.[cm]?jsx?$/.test(input)) {
      const text = await readFile(
        resolve(import.meta.dir, "..", input),
        "utf8",
      );
      for (const [comment] of text.matchAll(/\/\*[\s\S]*?\*\//g)) {
        if (comment.startsWith("/*!") || comment.includes("@license"))
          comments.add(comment);
      }
    }
  }
  if (comments.size)
    sections.push(
      "## Upstream bundled license comments\n\n" + [...comments].join("\n\n"),
    );
  return "# Embedded JavaScript dependency notices\n\n" + sections.join("\n");
}
