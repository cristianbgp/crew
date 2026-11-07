# Contributing to crew

Use Bun 1.4.0 and Node.js 22 or later. Native CI covers macOS and Linux glibc on ARM64 and x64; please include your OS, architecture, terminal, installation method and version when reporting a problem.

## Setup

```sh
bun install --frozen-lockfile
bun run --no-env-file demo
```

Link the checkout with `bun run --no-env-file install:local` if you want to run `crew` from another project. This builds and stages the host executable, links its platform package locally, then exposes the npm launcher through `bun link`. It is not a versioned release installation.

When running source files directly, use `bun --no-env-file src/entry.ts dev`. When using a package script, put `--no-env-file` on the outer Bun invocation too, as above. This prevents Bun from loading the launch directory's dotenv files into crew before the CLI starts. Compiled executables disable that loading themselves.

## Check changes

### Browser terminal preview

```sh
bun run --no-env-file preview
# Or run a workspace you explicitly choose:
bun run --no-env-file preview --config /path/to/crew.toml
```

Open the printed `http://127.0.0.1:…` URL. The browser displays the actual CLI inside a PTY through xterm.js; it is not a recreation of the interface. Type and click in the terminal, use the size selector for automatic fitting or 110×34, 80×24 and 40×12 presets, and use the toolbar for shortcuts intercepted by the browser.

The default is the disposable demo, with an independent session for each tab. Closing a tab stops its services; restarting begins a fresh session. Quit crew leaves its exit status visible until you restart. Ctrl+C in the server terminal stops all preview sessions and the HTTP server.

With `--config`, service commands and configuration edits affect that real workspace. Avoid opening the same workspace in several tabs. The preview binds only to loopback and accepts token-authorized WebSockets from its own origin; it is local development tooling and should not be exposed through a public proxy.

The preview uses a dark theme. Browser fonts, clipboard behavior and intercepted shortcuts can differ from native terminals. Keep the native terminal smoke tests as well as visual browser checks.

### Automated checks

```sh
bun run check          # Oxlint, Oxfmt, TypeScript, and tests
bun run test:terminal  # Real CLI, PTYs, keyboard/mouse flows, and cleanup
bun run format        # Apply project formatting
```

Tests create temporary workspaces and processes. Some tests bind loopback ports. Generated captures and logs go under ignored `work/`. The terminal smoke test does not require manually opening a terminal app.

For changes to process handling or output performance, also run:

```sh
bun run test:soak
# Optional longer run:
SOAK_SECONDS=7200 SOAK_SERVICES=12 bun run test:soak
```

Report the duration actually tested; the default soak is 60 seconds. Routine GitHub Actions uses one Linux job for source checks and terminal smoke. Native builds and package checks run only when manually preparing a release, on all four supported targets. A passing run does not establish compatibility with every OS version or terminal host.

## Project layout

- `src/process/`: service lifecycle, process groups, dependencies, readiness, and diagnostics.
- `src/terminal/`: terminal stream handling and window title helpers.
- `src/config/`: TOML parsing, validation, and conflict-aware editing.
- `src/ui/`: OpenTUI/React interface and behavior regressions.
- `tests/`: integration tests, real CLI smoke test, and fixtures.
- `examples/`: editable demo configuration.

Keep service input separate from crew’s controls, retain bounded output, and clean up owned processes. Add behavior tests when changing those contracts. Test small windows and both themes for interface changes. All display branding is lowercase: `crew`.

Keep credentials and personal workspace paths out of examples, screenshots, and issues. `bun.lock` belongs in version control; local `crew.toml`, `.env` files, lock anchors, artifacts, and private handoff notes do not. Shared workspace files in other projects can be committed when they contain portable configuration rather than personal settings.

See [Configuration and usage](docs/configuration.md) for user behavior and [Distribution](docs/distribution.md) before preparing a release.

## Standalone packaging

```sh
bun run --no-env-file build
bun run --no-env-file package --host-only
bun run test:npm --tarballs dist/tarballs
```

The release root package and its exact platform optional dependencies are generated under `dist/npm/`. The `--tarballs` option tests those exact packaged files without rebuilding or repacking; missing or mismatched inputs fail. Running `bun run test:npm` without that option builds disposable packages for a standalone local check. Publish reviewed staged tarballs, not `bun pm pack` from the source root. The source manifest deliberately does not depend on unpublished platform packages. Third-party license files under `licenses/` are preserved verbatim.
