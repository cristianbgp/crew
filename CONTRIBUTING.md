# Contributing to crew

Use macOS and Bun 1.4.0 or later. The validated environment is macOS arm64; please include your OS, architecture, terminal, and Bun version when reporting a problem.

## Setup

```sh
bun install --frozen-lockfile
bun run --no-env-file demo
```

Link the checkout with `bun run install:local` if you want to run `crew` from another project. Linking exposes this working tree; it is not a versioned release installation.

When running source files directly, use `bun --no-env-file src/cli.tsx dev`. When using a package script, put `--no-env-file` on the outer Bun invocation too, as above. This prevents Bun from loading the launch directory's dotenv files into crew before the CLI starts. The installed `crew` executable and `bunx` entry point handle this automatically.

## Check changes

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

Report the duration actually tested; the default soak is 60 seconds. GitHub Actions runs the ordinary checks and terminal smoke test on macOS. A passing run does not establish compatibility with other operating systems or terminal hosts.

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
