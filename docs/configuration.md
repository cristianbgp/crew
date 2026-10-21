# Configuration and usage

## Workspace file

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
cwd = "../another-repo"
command = "bun run dev"
autostart = false
```

Missing service directories appear as local service errors and can be repaired through Edit; they do not prevent healthy services from loading or running.

Paths are relative to the configuration file. Absolute paths also work. `repo` is a visual group, not a Git operation. It defaults to the workspace name. `autostart` defaults to `true`.

Commands run in your configured shell using `-c`, with the selected working directory and inherited environment. crew does not load login profiles, install dependencies or run database migrations for you. Include any environment setup in your command, for example `bun --env-file=.env run dev`. Existing Portless commands can be used directly.

### Environment files across repositories

crew and its process supervisor do not load dotenv files. Each service runs from its own `cwd`, so its command or framework resolves `.env`, `.env.local`, and mode-specific files using that project's normal rules. Starting crew in repo A does not copy repo A's dotenv variables into a service in repo B. A plain shell or runtime without dotenv support still needs an explicit loader in its command.

For example, if `cwd = "../api"`, `command = "bun run dev"` lets Bun load the API project's environment files. To choose a file explicitly, use `command = "bun --env-file=.env.staging run dev"`; the file path is relative to the service directory. crew does not force `NODE_ENV` or change the framework's file precedence.

Variables already exported in your terminal are inherited by every service, including values exported by tools such as direnv. Their precedence follows the service's dotenv loader; Bun gives inherited values priority over dotenv files. Inline assignments such as `NODE_ENV=production bun run start` remain part of the command.

Use the installed `crew` command or `bunx --package @cristianbgp/crew crew` for automatic startup isolation. If invoking source through Bun yourself, use `bun --no-env-file src/cli.tsx dev` or `bun run --no-env-file dev`. Otherwise, the outer Bun process can load dotenv before crew gets control, making those values indistinguishable from exported terminal variables.

## Using the interface

Press **F1** or click **Shortcuts** (**Help** in narrow windows) for the searchable keyboard guide. Type an action, key or scope—for example `restart`, `Ctrl+Q` or `forms`. Daily essentials come first; each entry shows where it works. Use arrows or Page Up / Page Down to scroll, Tab to reach footer actions, and **Escape** or **F1** to close. Function keys may require Fn on Mac keyboards. The guide is available during setup and editing, preserves unsaved fields, and restores focus when closed. It is also available by searching `shortcuts` in Commands.

- Open **Commands** in the sidebar or More panel, or press **Ctrl+K**, forwarded **Cmd+K**, or **Ctrl+Shift+P**. Search services and actions; arrows select, Enter runs, Escape closes. A host terminal may reserve Cmd+K. Existing function keys remain available.
- crew remembers the selected service and collapsed groups separately for each workspace file. Preferences live in `$XDG_STATE_HOME/crew`, or `~/.local/state/crew`, and are not written into shared TOML.
- Click a service in the sidebar to show its terminal. Type directly into the active terminal.
- Use **Start** and **Stop** in the service header. **More** contains Restart, Edit, Remove and command details at every window size; wide windows also show Restart directly. A failed service stays visible with its output.
- Buttons highlight on hover and briefly on activation. Service actions show Starting, Stopping or Restarting while pending and prevent duplicate requests for that service.
- Scroll the terminal to see history. Drag to select text; **Copy** copies the selection, or the visible screen if nothing is selected, using the native OS clipboard locally, with OSC52 as a fallback for supported terminals or remote sessions. You can also use Ctrl+C while text is selected, or Ctrl+Shift+C.
- Use **Add service**, **Edit** and **Remove** to change `crew.toml`. Removing a service stops its process. Changes to a running command or directory apply on restart.
- Use **F6 / Shift+F6** to move between the terminal, sidebar and toolbar. Tab and Shift+Tab navigate crew controls after leaving the terminal; Tab and arrows inside the terminal still belong to your service. Menus support arrows, Enter and Escape. Forms include toggles, script choices and actions in their Tab order; Ctrl+Enter saves a service and Ctrl+A selects input text.
- Use **Ctrl+Q** or **Quit** in the bottom bar to stop all services crew started and close the workspace. A closing screen shows remaining services. crew allows five seconds for orderly shutdown before forcing remaining processes in its groups to exit.
- `Ctrl+C` copies when text is selected; otherwise it goes to the service. It does not quit crew. Other applications can continue running independently.
- Roomy windows separate the group breadcrumb, service title/status, toolbar and output with padding. Compact windows keep a two-row header, with details under More. Below 80 columns, **Services** opens a drawer over the terminal. Selecting a service or pressing Escape closes it. Forms and help keep action buttons visible and scroll their content; the interface is verified down to 40×12.

- Use **F2** to filter services by name, repository or command. Arrows select a result; Enter switches and restores terminal input.
- Use **F4** or **Logs** to inspect searchable captured output. **Pause / Resume** freezes only the view, **Latest** clears the filter and resumes following, Ctrl+P toggles pause, and Ctrl+End jumps to latest. Search covers retained output (up to 1 MiB and the last 5,000 plain-text lines), with ANSI formatting removed. The original interactive terminal stays intact beneath it.
- Active failures take priority in the status bar. Success confirmations expire after four seconds; click a message to inspect its complete text. Copy and lifecycle actions return focus to the current terminal unless you have moved to another crew area.

## Appearance

crew follows the terminal’s light/dark mode automatically when the terminal reports it. Changes update the workspace, forms, menus and embedded terminal defaults in place, preserving sessions, history, selection and input. Explicit colors printed by services are retained.

If your terminal does not report its appearance, crew defaults to dark. You can force either palette when launching:

```sh
CREW_THEME=light crew
CREW_THEME=dark crew
# CREW_THEME=auto is the default
```

The signal comes from the host terminal, so its appearance settings determine whether a macOS appearance change reaches crew. crew draws a solid embedded terminal surface to keep output readable. A translucent Warp window can still show content behind it because window opacity is controlled by Warp, outside crew.

## Groups, availability and diagnostics

Click **···** beside a sidebar group to see its Start / Stop / Restart commands. The command palette also lists every group. Progress appears in the status bar; failures open a per-service result report. Start resolves dependencies; stop processes the chosen group in reverse dependency order. A group action affects that group, while Start may also start dependencies in other groups. Stopping a group does not cascade into its external dependents.

Optional startup settings are configured in `crew.toml`. Ordinary UI edits preserve them:

```toml
[services.db]
cwd = "."
command = "docker compose up db"
ready = { port = 5432, timeout_ms = 30000 }

[services.api]
cwd = "./apps/api"
command = "bun run dev"
depends_on = ["db"]
ready = { http = "http://127.0.0.1:3000/health", timeout_ms = 30000 }

[services.worker]
cwd = "./apps/worker"
command = "bun run dev"
depends_on = ["api"]
ready = { log = "Worker ready", timeout_ms = 10000 }
```

Choose exactly one check: `port` (optional `host`, default `127.0.0.1`), `http` (2xx response), or `log` (literal text from this run). Timeout defaults to 30 seconds and accepts 1–300,000 milliseconds. Checks run once at startup; they are not continuous health monitoring. The header distinguishes **waiting**, **ready** and **unready**. A timeout leaves the process and logs available but blocks dependent starts. Use **Cancel start** / **Cancel restart**, Stop in Commands, or Quit to cancel pending startup. Shared dependencies remain running when only a dependent's startup is cancelled. Dependencies start even if their own `autostart` is false. Invalid references and dependency cycles are rejected before startup.

Complete HTTP(S) links printed by a service appear live as an **Open ↗** button beside the service title, and as **Open URL** / **Copy URL** commands. Detection waits for a delimiter such as a space or newline so output split across chunks cannot expose a partial address. The button prefers a localhost/loopback link when available. Wildcard listener addresses become `localhost`. crew opens a browser only when you choose Open or Open URL; it never automatically opens links printed by a service.

Choose **More → Diagnostics** or search **Diagnostics** for process state, readiness, PID, timestamps, duration, exit code, failure, command and directory. **Export logs** writes a unique private file under the state directory’s `logs/` folder. It contains these diagnostics and the retained plain-text output (up to 1 MiB, possibly including previous runs), with terminal control sequences removed. Exports are local and may contain whatever your services printed.

## Configuration editing

crew preserves comments and unrelated keys when updating standard `[services.name]` tables. It detects external file changes before saving and offers **Reload file**. Reloading applies definitions and stops sessions removed externally; it does not automatically start newly added services.

Inline-table or nested service definitions can be read when valid, but the editor asks you to convert them to standard service tables before changing them. Save operations use a kernel advisory lock and an atomic replacement. The adjacent `.lock` file is a persistent lock anchor, not a sign that another instance is running; the OS releases ownership after a crash. You can ignore this file in version control. As with most file editors, simultaneous writes by unrelated tools during the final replacement cannot be fully excluded.

## Current limits

This is the first local version. It does not include detached sessions, free shells or global repository profiles. Without an optional readiness check, running means a live process. crew owns process groups it created; processes that deliberately detach into a different session can escape that ownership. An uncatchable termination of crew itself also prevents orderly cleanup.

The terminal uses OpenTUI's native embedded emulator. Scrollback is capped at 10,000 lines; a bounded 1 MiB replay buffer exists before panels attach. Very long unbroken lines and terminal-specific keyboard or clipboard features depend on the host terminal and OpenTUI.
