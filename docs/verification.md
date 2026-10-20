# Verification

## Supported evidence

The current validated environment is macOS arm64 with Bun 1.4.0. OpenTUI provides the native embedded terminal; `@xterm/headless` is a development dependency used to observe the outer terminal in smoke tests.

The latest local application check completed with 96 passing tests across 28 files, and the real CLI smoke test completed 16 checks. Counts describe that run, not a release guarantee. Run the commands below against the commit you intend to share.

Linux, Windows, Intel Macs, every terminal emulator, remote clipboard behavior, and standalone binary installation have not been validated. A terminal protocol check does not establish a manual visual review in Warp.

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
bun pm pack --dry-run
```

A dependency audit checks known registry advisories, not every possible vulnerability. Packing inspects what would ship; it does not prove that an installed package works. Verify the actual tarball from a separate consumer directory before publishing. See [Distribution](distribution.md) for that release checklist.

## Published preview — 2026-10-20

`@cristianbgp/crew@0.1.1` is publicly available on npm and tagged `latest`. Its registry shasum, `1d66aebd1f3b7606deef5733ea262f9ea64f9769`, matches the reviewed source artifact. The release tarball SHA-256 is `02b17683e61442d5013d3db3c804af15e69e5dfdbf2632e064950f8987a69397`.

The scoped package and frozen lockfile are synchronized. The release check passed 96 tests / 451 assertions, all 16 real CLI/PTY checks, and six production tarball-install checks. A fresh production installation by name and version from the public npm registry then passed six more checks:

- Help and version through the installed `crew` executable.
- Interactive UI, process supervisor, searchable shortcuts, and restored service input.
- Workspace shutdown and child cleanup.
- A responding bundled HTTP demo and its cleanup.

These checks ran from a separate working directory without importing the source checkout. The release contains 55 files, including runtime source, JSX configuration, public docs, MIT license, demo assets and the screenshot. Test suites, local evidence, credentials files and handoff notes are excluded from the npm artifact. The repository retains the tests and `bun.lock` for contributors.

The macOS GitHub Actions workflow runs frozen installation, source checks, real terminal verification, and package preview. See the repository’s Actions page for hosted results. Local logs and captures remain under ignored `work/`.
