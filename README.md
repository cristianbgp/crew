# crew

**Your services, one workspace.**

Run your frontend, API, workers, and other development services in one terminal workspace. Keep their output and interactive terminals together, whether they live in a monorepo or across several local repositories.

<div align="center">
  <img src="https://unpkg.com/@cristianbgp/crew@0.1.1/docs/images/screenshot.png" alt="crew terminal workspace" />
</div>

- **One command to start.** Run `crew` to launch configured services. No configuration? A setup form helps you create one.
- **A terminal for each service.** Switch from the sidebar without losing output, respond to prompts, and use your existing commands.
- **Controls you can see.** Start, stop, restart, edit, search logs, and open local URLs from the interface.
- **One place to close.** Quit crew to stop the services it started.

## Install and try

Early preview. Validated on **macOS arm64 with Bun 1.4.0**. Requires [Bun](https://bun.com); Node.js alone is insufficient. Linux, Windows, and Intel Macs have not been validated.

Install the preview globally, then try the bundled demo:

```sh
bun install -g @cristianbgp/crew
crew demo
```

Or try it without a global install:

```sh
bunx --package @cristianbgp/crew crew demo
```

The demo starts two small servers on random loopback ports; its worker and failure example can be started manually. Demo edits are saved in the installed `examples/crew.toml`.

For development from a source checkout, see [Contributing](CONTRIBUTING.md).

## Use it in a project

From your project directory:

```sh
crew
```

crew reads `crew.toml` from the current directory and starts services marked for automatic startup. If the file is missing, the setup form lets you choose package scripts or enter commands, then save and start. It does not search parent directories.

To open a workspace elsewhere:

```sh
crew --config /path/to/workspace/crew.toml
```

There is no activation step or background daemon. Each invocation owns its workspace and keeps running until you quit.

## Configure your services

Create `crew.toml` beside your project:

```toml
name = "my-workspace"

[services.web]
repo = "product"
cwd = "./apps/web"
command = "bun run dev"

[services.api]
repo = "product"
cwd = "./apps/api"
command = "bun run dev"

[services.worker]
repo = "background"
cwd = "../another-repository"
command = "bun run dev"
autostart = false
```

Paths are relative to `crew.toml`, so the same file can bring together several repositories. `repo` is a sidebar group, not a Git operation. Automatic startup defaults to `true`.

Run each service normally once to install dependencies and complete any initial setup. crew runs your commands; it does not install dependencies or replace your build tool.

For dependencies, readiness checks, environment setup, group actions, diagnostics, and configuration editing, see [Configuration and usage](docs/configuration.md).

## Find your way around

| Action                                      | Shortcut               |
| ------------------------------------------- | ---------------------- |
| Search services and commands                | Ctrl+K or Ctrl+Shift+P |
| Switch service                              | F2                     |
| Search captured output                      | F4                     |
| Move between terminal, sidebar, and toolbar | F6 / Shift+F6          |
| Search all keyboard shortcuts               | F1                     |
| Quit and stop services                      | Ctrl+Q                 |

Type directly into the selected service’s terminal. Tab and arrow keys stay with the service while its terminal has focus. Use F6 to reach crew’s controls. Some Mac keyboards require Fn for function keys.

**Copy:** drag to select, then use Copy or Ctrl+Shift+C. Ctrl+C copies selected text; without a selection, it interrupts the selected service. In Warp, Shift+drag and Cmd+C use Warp’s own selection.

crew follows your terminal’s light/dark appearance when reported. Override it with `CREW_THEME=light crew` or `CREW_THEME=dark crew`.

## Status and limits

crew is an early local-development tool. It has interactive terminals, startup dependencies and readiness checks, bounded history, editable configuration, and orderly process-group shutdown. It does not have detached sessions, persistent background services, or global repository profiles.

Commands in a workspace run with your user permissions and inherited environment. Review a shared `crew.toml` before launching it. Closing crew allows five seconds for graceful shutdown before forcing remaining owned processes to exit. Deliberately detached processes and forcibly killing crew itself can prevent normal cleanup.

crew is distributed through **npm, requiring Bun**. Standalone binaries and Homebrew installation are future work. See [Distribution](docs/distribution.md).

## Contribute

Built with TypeScript, Bun, OpenTUI, and React. See [Contributing](CONTRIBUTING.md) for setup and checks, and [Verification](docs/verification.md) for coverage and platform limits.

## License

[MIT](LICENSE).
