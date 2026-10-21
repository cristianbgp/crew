# Distribution

crew opens a terminal workspace with `crew` or `crew dev`. It needs no activation or background daemon. Package name: `@cristianbgp/crew`; command: `crew`.

This branch prepares **0.2.0**. The published **0.1.3 requires Bun**. The installation instructions below describe 0.2.0 once published. Preparing artifacts does not publish packages or create a GitHub Release.

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

Prepared downloads contain four executables, five npm tarballs, `SHA256SUMS`, `RELEASE.json`, and licenses. Download the matching binary and checksums from the approved [GitHub release](https://github.com/cristianbgp/crew/releases), when available. A prepared CI artifact is not itself a public release.

| Executable          | Target             | Native CI environment |
| ------------------- | ------------------ | --------------------- |
| `crew-darwin-arm64` | Apple Silicon Mac  | macOS 14              |
| `crew-darwin-x64`   | Intel Mac          | macOS 15 Intel        |
| `crew-linux-arm64`  | Linux ARM64, glibc | Ubuntu 24.04 ARM64    |
| `crew-linux-x64`    | Linux x64, glibc   | Ubuntu 24.04 x64      |

These are tested environments, not claims about older OS/glibc versions or every CPU. Windows, Alpine/musl and Homebrew are outside this release. macOS builds are ad-hoc signed and signature-verified; they are not Developer ID signed or notarized. macOS may ask for approval when opening a downloaded executable.

Verify the downloaded file's SHA-256 against `SHA256SUMS` with `shasum -a 256` on macOS or `sha256sum` on Linux. Then, for example:

```sh
mkdir -p "$HOME/.local/bin"
install -m 755 ./crew-darwin-arm64 "$HOME/.local/bin/crew"
# Ensure $HOME/.local/bin is in PATH.
crew --version
crew demo
```

Choose your actual target in place of `crew-darwin-arm64`. Retain the accompanying licenses. Direct executables need no Node, Bun, source checkout or node_modules.

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

## Prepare a release

1. Update the root version and documentation; synchronize the lockfile if needed. CLI and staged package versions derive from the root manifest.
2. Run [Verification](verification.md), including dependency audit. Require all four native CI jobs to succeed for the same commit.
3. Download all four artifacts from that run into a private directory. Preserve their directories; identical copies of the root tarball are compared. Do not mix runs or regenerate tarballs locally.
4. Run the manual **prepare release** workflow with the successful CI run ID, or validate locally:

```sh
bun --no-env-file scripts/release.ts --directory work/reviewed-artifacts --dry-run
bun --no-env-file scripts/release.ts --directory work/reviewed-artifacts --prepare work/release
```

The tool checks archive allowlists, versions, target metadata, launcher bytes, executable payloads and all checksums. It verifies the recorded GitHub CI run and four successful native jobs. The workflow uploads reviewed downloads only; it has no npm credentials and creates no GitHub Release.

## Publish approved artifacts

After maintainer approval of those exact artifacts:

```sh
npm whoami
bun --no-env-file scripts/release.ts --directory work/reviewed-artifacts --publish
```

The four `@cristianbgp/crew-{target}` packages publish first; `@cristianbgp/crew` publishes last, after all native packages are visible in the registry. Complete npm's browser authorization prompts normally.

All five versions are queried before publishing. Identical registry integrity is skipped; differing integrity aborts before mutations. A partial failure leaves the root gated. A private `.release-state.json` records accepted publications so retries wait for npm processing instead of republishing. Retry with the **same directory and files**. A crashed publisher can leave `.publishing`; check that no publisher is running before removing that lock. Changed artifacts need a new version.

After publication, verify registry integrities and fresh exact-version installation, demo, project scripts and cleanup. Then tag the reviewed commit and attach the prepared downloads to a GitHub Release. Those remain separate maintainer actions; there is no automatic publication, tag push or Homebrew tap.

The unscoped name `crew` was rejected by npm with HTTP 403 despite authorization; the scope avoids that name restriction. Command and product branding remain `crew`.
