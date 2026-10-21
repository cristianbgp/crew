import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export interface FixtureManifest {
  name: string;
  version: string;
  [key: string]: unknown;
}
export async function startPackageRegistry(
  manifests: FixtureManifest[],
  tarballs: Record<string, string>,
) {
  const integrity: Record<string, string> = {};
  for (const [name, path] of Object.entries(tarballs))
    integrity[name] = `sha512-${createHash("sha512")
      .update(await readFile(path))
      .digest("base64")}`;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request): Response {
      const path = decodeURIComponent(new URL(request.url).pathname);
      if (path.startsWith("/tarballs/")) {
        const name = path.slice("/tarballs/".length).replace(/\.tgz$/, "");
        const file = tarballs[name];
        return file
          ? new Response(Bun.file(file))
          : new Response("No fixture tarball", { status: 404 });
      }
      const pkg = manifests.find((manifest) => path === `/${manifest.name}`);
      if (!pkg) return new Response("Not in fixture registry", { status: 404 });
      return Response.json({
        name: pkg.name,
        "dist-tags": { latest: pkg.version },
        versions: {
          [pkg.version]: {
            ...pkg,
            dist: {
              tarball: `${server.url.origin}/tarballs/${encodeURIComponent(pkg.name)}.tgz`,
              ...(integrity[pkg.name]
                ? { integrity: integrity[pkg.name] }
                : {}),
            },
          },
        },
      });
    },
  });
  return { url: server.url.origin, close: () => server.stop(true) };
}
