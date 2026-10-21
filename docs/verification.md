# Verification

## Supported evidence

The 0.2.0 candidate uses Bun 1.4.0 for builds and source development, and Node 22+ for the npm launcher. Direct executables embed their runtime. OpenTUI provides the embedded terminal; `@xterm/headless` independently observes it in development tests.

Native CI runs macOS 14 ARM64, macOS 15 Intel, Ubuntu 24.04 ARM64 and Ubuntu 24.04 x64. Release acceptance requires all four jobs to pass for one commit. See the exact run recorded in each release's `RELEASE.json`; a local build alone establishes only local evidence.

Windows, Alpine/musl, older OS/glibc releases, every terminal emulator and remote clipboard behavior are not established by this matrix. A terminal protocol check does not establish a manual visual review in Warp.

## Static and behavior checks

```sh
bun install --frozen-lockfile
bun run check
```

This runs Oxlint, Oxfmt, TypeScript, and behavior tests for:

- TOML validation, portable paths, comment-preserving edits, external-change conflicts, and kernel-owned configuration locks.
- Real PTY input, isolated service failures, restart, dependency order, readiness, cancellation, and owned process-group cleanup.
- Terminal colors, cursor operations, split UTF-8/control sequences, alternate buffers, retained output, and theme changes.
- Sidebar navigation, small-window layouts, editable forms, clipboard routing, command search, searchable shortcuts, and focus restoration.
- CLI arguments, help/version, noninteractive invocation, state preferences, diagnostics, and private log exports.

Tests use temporary workspaces and real child processes. Some need permission to open loopback listening sockets. The clipboard integration test restores the previous clipboard contents.

## Real CLI in a PTY

```sh
bun run test:terminal
```

This launches the actual CLI inside a kernel PTY and observes it with an independent terminal emulator. It exercises startup, interactive input, mouse actions, editing/cancellation, output around 1 MiB/s for ten seconds, resize, F2 switching, F4 logs, command search, F1 shortcut filtering, native appearance notifications, and Ctrl+Q. It checks exit status, title restoration sequences, state persistence, and child termination.

The smoke test includes 40×12 and 65×15 layouts. Generated evidence is written under ignored `work/`; it is not shipped in the package.

## Output load

```sh
bun run test:soak
SOAK_SECONDS=7200 SOAK_SERVICES=12 bun run test:soak
```

The default run lasts 60 seconds with 12 real services and native terminal panes. It records parent-process RSS/heap, sampled event-loop delay, fresh input acknowledgements, bounded replay, and cleanup in `work/soak-verification.json`. The second command requests two hours; it is not a claim that such a run has already passed.

Measurements do not include all child-process memory or establish a long-term memory bound. Deliberately detached processes and an uncatchable termination of crew itself remain outside normal cleanup guarantees.

## Before publication

```sh
bun audit
bun run --no-env-file build
bun run test:standalone --binary "$PWD/dist/darwin-arm64/crew"
CREW_TEST_EXECUTABLE="$PWD/dist/darwin-arm64/crew" bun test tests/environment.test.ts
CREW_TEST_EXECUTABLE="$PWD/dist/darwin-arm64/crew" bun run test:terminal
bun run test:npm
```

A dependency audit checks known registry advisories, not every possible vulnerability. Replace `darwin-arm64` with the actual host target. The standalone harness copies the executable outside the checkout, removes runtimes from PATH, and checks the demo, setup, input, restart, readiness failure, malformed config and descendant cleanup under quit/signals. Compiled terminal smoke adds resize, appearance changes, editing and title restoration.

The npm harness installs actual tarballs by name from an isolated local registry using real npm and Node, without Bun on PATH. It checks local devDependency scripts, global-prefix installation, signals, paths with spaces, missing optional packages and macOS executable signatures. It does not publish to npm or change global installations. Release tests use a fake registry adapter to verify partial failures, integrity conflicts and retries. See [Distribution](distribution.md) for the full release gate.

## Initial published preview — 2026-10-20

`@cristianbgp/crew@0.1.1` was the initial public npm preview. Its registry shasum, `1d66aebd1f3b7606deef5733ea262f9ea64f9769`, matches the reviewed source artifact. The release tarball SHA-256 is `02b17683e61442d5013d3db3c804af15e69e5dfdbf2632e064950f8987a69397`.

The scoped package and frozen lockfile are synchronized. The release check passed 96 tests / 451 assertions, all 16 real CLI/PTY checks, and six production tarball-install checks. A fresh production installation by name and version from the public npm registry then passed six more checks:

- Help and version through the installed `crew` executable.
- Interactive UI, process supervisor, searchable shortcuts, and restored service input.
- Workspace shutdown and child cleanup.
- A responding bundled HTTP demo and its cleanup.

These checks ran from a separate working directory without importing the source checkout. The release contains 55 files, including runtime source, JSX configuration, public docs, MIT license, demo assets and the screenshot. Test suites, local evidence, credentials files and handoff notes are excluded from the npm artifact. The repository retains the tests and `bun.lock` for contributors.

The macOS GitHub Actions workflow runs frozen installation, source checks, real terminal verification, and package preview. See the repository’s Actions page for hosted results. Local logs and captures remain under ignored `work/`.
