# Changelog

## 0.2.2 — 2026-11-07

### Log search

- Show matching lines with adjustable surrounding context: 0, 1, 3, 5 or 10 lines, defaulting to 3. Merge adjacent contexts and label hidden gaps.
- Reveal a selected match in full output with Ctrl+O, preserving the query and occurrence when returning to Matches.
- Keep source line numbers visible with Unicode-aware result snippets, dedicated empty-result guidance and named match navigation.
- Show pending output with Refresh, preserve queries while resuming, and restore following output when clearing search.
- Keep navigation valid when retained history shrinks and scroll distant revealed matches into view after layout.

### Workspace and navigation

- Combine search words across service names, groups and commands, prioritizing exact/prefix service names.
- Identify the current service, show result counts, add Clear/Ctrl+U, and support page and first/last result navigation.
- Put selected-service actions first in Commands and include group/service names in action search.
- Show workspace/group running counts and issue indicators; retain the current row when its group is collapsed.
- Expand and reveal a selected service's group, including after compact-window resizing, and cover the terminal with the compact service drawer.
- Explain empty stopped-service output and provide a Start service action.

### Forms and diagnostics

- Put validation beside the relevant field and clarify first-run creation when no services are configured.
- Order routine actions before optional launch details and removal.
- Offer Reload only after a configuration conflict, confirm discarded edits, and preserve editing/retry focus when recovery fails.
- Group diagnostics and show local timestamps with an explicit timezone; exported diagnostics retain ISO timestamps.

### Development and verification

- Move macOS ARM64 CI to the supported macOS 15 runner after GitHub retired macOS 14.
- Add a local xterm.js preview of the real CLI through a PTY, with demo sessions, responsive size presets and an optional explicit workspace.
- Restrict preview connections to loopback/same-origin sessions, bound output queues, and clean up processes on restart, disconnect and shutdown.
- Add regressions for search, recovery, navigation and preview lifecycle; update usage and contributor documentation.

Publication requires a successful full four-platform CI run for the intended release commit and validation of its exact artifacts. The preview remains development tooling; published runtime packages continue to use the native terminal.
