# Distribution

crew is a command-line application that opens a TUI. Users install it once, then run `crew` inside any project containing a `crew.toml`. `crew dev` is an alias for that default flow. No shell activation, server installation, or daemon is needed.

The public repository is [cristianbgp/crew](https://github.com/cristianbgp/crew).

## For contributors: run from source

```sh
bun install --frozen-lockfile
bun run install:local
crew demo
```

`install:local` runs `bun link`, exposing this checkout through Bun’s executable directory. It is useful for contributors; deleting or moving the checkout breaks the link. The linked command can then run another project with `crew` or `crew --config /path/to/crew.toml`.

## npm package, with Bun installed

The package is `@cristianbgp/crew`, and its executable remains `crew`. The current preview version is `0.1.3`.

```sh
bun install -g @cristianbgp/crew
crew
```

For a one-off run:

```sh
bunx --package @cristianbgp/crew crew
```

Pin the package version when repeatability matters:

```sh
bunx --package @cristianbgp/crew@0.1.3 crew
```

Bun is a runtime requirement, not just the package manager: crew uses Bun PTYs, IPC, and FFI. Node.js alone cannot run this application. The manifest declares `engines.bun`.

The source package includes runtime code, its JSX configuration, public documentation, MIT license, the screenshot, and the two fixtures used by the bundled demo. `src/process/session.ts` must stay next to the manager because it is launched as a separate Bun process. No build or installation script is required.

### Why the scope?

The unscoped name `crew` has historical unpublished versions. An authenticated release of `crew@0.1.1` was rejected with HTTP 403 by both Bun and npm's own CLI after browser authorization. Public owner lookup returned `no admin found`; the exact name restriction requires clarification from npm. The maintainer authorized using `@cristianbgp/crew` in the meantime. The command name and lowercase product branding remain `crew`.

### Release checks

1. Confirm the authenticated npm account and the intended package/version.
2. Keep `package.json`, `bun.lock`, and the CLI's `--version` in sync. The current CLI returns `0.1.3` directly; release versioning is manual.
3. Run `bun run check`, `bun run test:terminal`, and `bun audit`.
4. Inspect `bun pm pack --dry-run` and the actual tarball. Exclude credentials, private handoff notes, generated evidence, and test suites; retain required runtime and demo files.
5. Install that tarball with production dependencies into a disposable project. Verify help/version, interactive input, the bundled demo, and child cleanup from an unrelated working directory.
6. Publish the exact reviewed tarball with public access, then verify registry metadata and a fresh registry installation.
7. Keep README installation instructions and the versioned screenshot URL current. Commit/tag/push and hosted CI are separate maintainer actions.

For a reviewed local tarball, use an absolute or `./`-prefixed path so npm does not interpret it as GitHub shorthand:

```sh
npm publish ./work/cristianbgp-crew-0.1.3.tgz --access public --registry=https://registry.npmjs.org/
```

Version `0.1.3` prevents dotenv variables from the launch directory from leaking into services in other repositories. crew and its supervisor disable automatic dotenv loading; each service command or framework loads its own files from its configured directory. Exported terminal variables are preserved. Source invocations must use `bun --no-env-file src/cli.tsx dev`.

The read-only macOS CI workflow checks source changes; it does not publish packages automatically.

## Later: standalone binaries and Homebrew

[Bun can compile standalone executables](https://bun.com/docs/bundler/executables), which would allow installation without a separate Bun runtime. This is a future packaging task, not a supported artifact today.

A successful `bun build --compile` alone would be insufficient. The current manager starts `process.execPath` with a sibling `session.ts` path; a compiled executable would need an intentional supervisor entry mode or a separately packaged helper. Demo assets and OpenTUI’s native libraries would also need to be embedded or shipped and tested without `node_modules` or the source checkout. Validate each OS/architecture and cleanup behavior before promising support.

Once signed/tested macOS release artifacts exist, a Homebrew tap can install them. Linux support, Windows process/FFI differences, automatic updates, and additional package managers should follow actual validation.

## References

- [Bun global installation](https://bun.com/docs/pm/cli/add#global)
- [Bun package executables and bunx](https://bun.com/docs/pm/bunx)
- [npm package contents and bin mappings](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/)
- [Bun publishing and dry runs](https://bun.com/docs/pm/cli/publish)
