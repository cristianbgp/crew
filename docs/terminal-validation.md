# crew terminal integration

crew uses OpenTUI 0.6.6's `EmbeddedTerminalRenderable` and Bun 1.4.0's PTY support. The native component already handles emulation, screen buffers, keyboard encoding, paste, scrollback, selection and mouse input. A separate xterm renderer is unnecessary. `@xterm/headless` is only a development dependency for the outer terminal in end-to-end tests.

The service output is parsed synchronously by the native component. Only its selected panel is visible; hidden panels retain their screens. Rendering is limited to 30 fps, scrollback to 10,000 lines and pre-attachment replay to 1 MiB per process. There is no unbounded JavaScript parser queue.

Automated integration tests exercise actual kernel PTYs, not mocked output streams. `tests/terminal-smoke.ts` starts the real CLI inside an outer PTY, renders it through an independent terminal emulator, sends mouse sequences and keystrokes, then verifies screens and child termination.

The demo was additionally run with two actual HTTP servers bound to loopback ports, with interactive input, service switching, editor cancellation, resize and graceful exit. Running network fixtures in a restricted sandbox requires permission for local listening sockets.

These checks validate behavior on this macOS host. They do not establish compatibility with every terminal emulator, remote SSH environment, Windows or Linux.
