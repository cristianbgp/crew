# Distribution

crew opens a terminal workspace with `crew` or `crew dev`. It needs no activation or background daemon. Package name: `@cristianbgp/crew`; command: `crew`.

These instructions describe **0.2.0**. Earlier **0.1.x versions require Bun**. Installation requires a published 0.2.0 release. Preparing artifacts does not publish packages or create a GitHub Release.

## npm installation

```sh
npm install -g @cristianbgp/crew@0.2.0
crew demo
```

The launcher requires Node.js **22 or later** and selects one exact-version optional platform package. Keep optional dependencies enabled. There is no postinstall download or compilation step. No separately installed Bun or mprocs is needed: the executable embeds its runtime and terminal libraries.

```sh
npm install --save-dev @cristianbgp/crew@0.2.0
# package.json: { "scripts": { "dev:all": "crew" } }
npm run dev:all
```

One-off: `npx --package @cristianbgp/crew@0.2.0 crew demo`. Bun users can use `bun install -g @cristianbgp/crew@0.2.0` or `bunx --package @cristianbgp/crew@0.2.0 crew demo`.

Service commands still require their own tools: `bun run dev` requires Bun for that service. Each command runs from its configured `cwd`; exported terminal variables are preserved. The launch directory's dotenv files are not automatically imported. Each service/framework loads its own env files.

## Direct executables

Platform tarballs contain the standalone executable and its licenses. Download the matching tarball and checksum metadata from the approved [GitHub release](https://github.com/cristianbgp/crew/releases), when available. A CI artifact is not itself a public release.

| Platform suffix | Target             | Native CI environment |
| --------------- | ------------------ | --------------------- |
| `darwin-arm64`  | Apple Silicon Mac  | macOS 14              |
| `darwin-x64`    | Intel Mac          | macOS 15 Intel        |
| `linux-arm64`   | Linux ARM64, glibc | Ubuntu 24.04 ARM64    |
| `linux-x64`     | Linux x64, glibc   | Ubuntu 24.04 x64      |

These are tested environments, not claims about older OS/glibc versions or every CPU. Windows, Alpine/musl and Homebrew are outside this release. macOS builds are ad-hoc signed and signature-verified; they are not Developer ID signed or notarized. macOS may ask for approval when opening a downloaded executable.

Verify the downloaded tarball's SHA-256 against `platformTarballSha256` in the accompanying platform JSON with `shasum -a 256` on macOS or `sha256sum` on Linux. Then, for example:

```sh
tar -xzf cristianbgp-crew-darwin-arm64-0.2.0.tgz
mkdir -p "$HOME/.local/bin"
install -m 755 package/bin/crew "$HOME/.local/bin/crew"
# Ensure $HOME/.local/bin is in PATH.
crew --version
crew demo
```

Choose the tarball for your actual target. Retain `package/licenses/` and `package/THIRD_PARTY_NOTICES.md`. Extracting and using this executable needs no npm, Node, Bun, source checkout or node_modules.

## Build and review

Contributors need Bun 1.4.0 and Node.js 22+. See [Contributing](../CONTRIBUTING.md).

```sh
bun install --frozen-lockfile
bun run --no-env-file build
bun run --no-env-file package --host-only
bun run test:npm
```

`dist/npm/` holds staged manifests; `dist/tarballs/` holds packages. The source manifest deliberately has no unpublished platform optional dependencies. **Do not publish a tarball packed from the source root.** Staging adds four exact optional versions to the lightweight root launcher. Each native package contains its executable and licenses.

Darwin builds run on macOS so the final executable can be signed and verified. Each native CI job tests its actual architecture and uploads its binary, tarballs and checksum evidence after all checks pass.

## CI and release checks

Normal PRs and pushes to `main` run two jobs: the source checks/terminal suite on Linux, then a macOS ARM64 native smoke test. Feature branches with a PR do not also run duplicate push jobs. Formatting, lint and typechecking run once.

Before publishing, request the full release matrix from the same workflow:

```sh
gh workflow run ci.yml --ref main -f full_release=true
```

That run performs the source checks once and builds/tests all four native targets. Each target verifies standalone behavior, service environments, compiled terminal interactions and npm installation. The smoke-only job is skipped. The four jobs upload their tested binary, tarballs, licenses and checksum evidence; ordinary PR CI uploads no release artifacts.

## Publish a release

1. Update the root version and documentation; synchronize the lockfile if needed. CLI and staged versions derive from the root manifest.
2. Run [Verification](verification.md), including dependency audit. Request the full release run and confirm the checks job and all four native jobs succeed for the intended commit. The artifact validator does not query GitHub for you.
3. Download all four artifacts from that successful run into a private directory. Preserve their directories; duplicate root tarballs must be identical. Do not mix runs or regenerate packages locally.

```sh
gh run watch RUN_ID --exit-status
gh run download RUN_ID --dir work/reviewed-artifacts
bun --no-env-file scripts/release.ts --directory work/reviewed-artifacts --dry-run
```

Replace `RUN_ID` with the full-release run ID. The dry-run checks versions, target metadata, expected files/licenses, launcher bytes, executable payloads and checksums. It also requires matching source-commit/run records and all native checks. No package is published by CI or dry-run.

After reviewing and approving those exact artifacts:

```sh
npm whoami
bun --no-env-file scripts/release.ts --directory work/reviewed-artifacts --publish
```

The four `@cristianbgp/crew-{target}` packages publish first and `@cristianbgp/crew` last. All five registry versions and local tarball hashes are checked before publishing. Identical existing integrity is skipped; conflicting integrity aborts. Complete npm's browser authorization prompts normally.

If npm is still processing a package, the command stops before publishing the root. Wait until that exact version is visible in npm, then rerun with the same artifacts. There are no receipts, background polling or local release locks; run one publisher at a time. Changed artifacts require a new version.

Finally, verify registry integrities and fresh exact-version installation, demo, project scripts and cleanup. Tag the reviewed commit and attach the exact platform tarballs and matching platform JSON checksum records to a GitHub Release when direct downloads are wanted. Those remain maintainer actions; there is no automatic publication, release-preparation workflow or Homebrew tap.

The unscoped name `crew` was rejected by npm with HTTP 403 despite authorization; the scope avoids that name restriction. Command and product branding remain `crew`.
