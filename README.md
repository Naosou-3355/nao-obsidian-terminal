# Lean Obsidian Terminal

An embedded terminal panel for [Obsidian](https://obsidian.md), powered by [xterm.js](https://xtermjs.org/) and [node-pty](https://github.com/nicedoc/node-pty). Run shell commands directly inside your vault workspace — no external windows needed.

**Desktop only.** Requires Obsidian 1.5.0+.

## Features

- Full PTY terminal (not a simple command runner) with interactive shell support
- Multiple terminal tabs with rename support
- Auto-detects your shell: PowerShell 7 / Windows PowerShell / cmd.exe on Windows, `$SHELL` on macOS/Linux
- Four built-in color themes: Obsidian Dark, Obsidian Light, Monokai, Solarized Dark
- Clickable URLs in terminal output
- Auto-resize on panel resize
- Opens at vault root by default
- Configurable: shell path, font size, font family, cursor blink, scrollback, panel location

## Installation

### Via BRAT (recommended)

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin if you don't have it
2. Open **Settings > BRAT > Add Beta Plugin**
3. Enter: `sdkasper/lean-obsidian-terminal`
4. Enable the plugin in **Settings > Community Plugins**
5. Go to **Settings > Terminal > Download binaries** and click **Download** — this fetches the native terminal binary for your platform
6. Open the terminal via the ribbon icon or command palette

### Manual Installation

1. Clone this repository
2. Run `npm install && npm run build`
3. Run `node install.mjs "/path/to/your/vault"`
4. Restart Obsidian and enable the plugin in **Settings > Community Plugins**

## Usage

| Action | How |
|--------|-----|
| Open terminal | Click the terminal icon in the ribbon, or run **Open terminal** from the command palette |
| Toggle terminal | Command palette: **Toggle terminal**, or click the ribbon icon again |
| New tab | Command palette: **New terminal tab**, or click the **+** button in the tab bar |
| Rename tab | Right-click the tab label |
| Close tab | Click the **x** on the tab |
| Split pane | Command palette: **Open terminal in new pane** |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Shell path | Auto-detect | Path to shell executable. Leave empty for auto-detection |
| Font size | 14 | Terminal font size in pixels |
| Font family | Menlo, Monaco, 'Courier New', monospace | Terminal font stack |
| Theme | Obsidian Dark | Color theme for the terminal |
| Cursor blink | On | Whether the cursor blinks |
| Scrollback | 5000 | Number of lines kept in scroll history |
| Default location | Bottom | Where new terminal panels open (Bottom or Right) |

## How It Works

The plugin uses xterm.js for terminal rendering and node-pty for native pseudo-terminal support. node-pty spawns a real shell process (PowerShell, bash, etc.) and connects its stdin/stdout to xterm.js via Obsidian's Electron runtime. This gives you a fully interactive terminal — not just command execution.

On Windows, the plugin uses the winpty backend because Obsidian's Electron renderer does not support Worker threads required by ConPTY.

## Development

```bash
npm install
npm run dev          # Watch mode (auto-rebuild on save)
npm run build        # Production build
node install.mjs     # Install to default vault (D:\Lean Notes)
```

## License

[MIT](LICENSE)
