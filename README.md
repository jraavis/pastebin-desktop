# PasteDesk

An unofficial, open-source desktop client for [pastebin.com](https://pastebin.com) built with **Tauri** (Rust backend) and vanilla HTML/CSS/JS frontend. No Electron, no Node.js runtime — just a lean native binary.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Tauri](https://img.shields.io/badge/tauri-2.x-purple.svg)
![Rust](https://img.shields.io/badge/rust-2026-orange.svg)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)

---

## Features

- **Create pastes** — title, content, syntax format, expiry, and visibility (Public / Unlisted / Private)
- **My Pastes** — browse your pastes with live title search, visibility filter, sort (date / title / hits, asc/desc), and pagination; data is fetched once and cached, refreshed only on demand
- **View modal** — Preview mode (syntax-highlighted via [highlight.js](https://highlightjs.org/) or rendered Markdown via [marked](https://marked.js.org/)) and Raw mode; adjustable font size with zoom controls
- **Account** — API dev key and username/password login; all sensitive fields masked with show/hide toggles; password never stored, session key kept in `localStorage`
- **Settings** — Light / Dark / Auto (system) theme; default zoom level; sidebar collapse preference
- **Sidebar** — collapsible with a hamburger button; overlays content on narrow windows; state persisted across sessions
- **Responsive** — adapts from wide desktop down to ~375 px (mobile-sized window); sidebar auto-collapses below 600 px and slides in as an overlay
- **Secure** — Markdown preview sanitized (strips `<script>`, inline event handlers, `javascript:` hrefs); no telemetry; all network calls go directly to `pastebin.com`

---

## Screenshots

> _Screenshots coming soon._

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| [Rust](https://rustup.rs/) | stable ≥ 1.70 | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Tauri CLI | 2.x | `cargo install tauri-cli --version "^2"` |
| Pastebin account | — | Free at [pastebin.com](https://pastebin.com); API dev key from [pastebin.com/doc_api](https://pastebin.com/doc_api) |

> Node.js is **not required** — the frontend is plain HTML/CSS/JS with no build step.

### Platform-specific system dependencies

<details>
<summary><strong>macOS</strong></summary>

```sh
xcode-select --install
```

</details>

<details>
<summary><strong>Ubuntu / Debian</strong></summary>

```sh
sudo apt update
sudo apt install libwebkit2gtk-4.0-dev build-essential curl wget libssl-dev \
  libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

</details>

<details>
<summary><strong>Fedora / RHEL</strong></summary>

```sh
sudo dnf install webkit2gtk4.0-devel openssl-devel curl wget \
  libappindicator-gtk3-devel librsvg2-devel
sudo dnf group install "C Development Tools and Libraries"
```

</details>

<details>
<summary><strong>Windows</strong></summary>

1. Install [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) — select the **Desktop development with C++** workload.
2. [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) is already included in Windows 11. For Windows 10, download the Evergreen Bootstrapper from that link.
3. Restart your terminal after installation.

</details>

---

## Quick start

### 1. Clone

```sh
git clone https://github.com/your-username/pastebin-desktop.git
cd pastebin-desktop
```

### 2. Run in development mode

```sh
cargo tauri dev
```

A live window opens. Changes to `src/` (HTML/CSS/JS) take effect on page reload; changes to `src-tauri/src/` trigger an automatic Rust recompile.

### 3. Build a release binary

```sh
cargo tauri build
```

Platform-specific installers/binaries are written to `src-tauri/target/release/bundle/`:

| Platform | Output |
|----------|--------|
| macOS | `bundle/macos/PasteDesk.app` + `.dmg` |
| Windows | `bundle/msi/*.msi` + `bundle/nsis/*.exe` |
| Linux | `bundle/deb/*.deb` + `bundle/appimage/*.AppImage` |

---

## Installing from GitHub Releases

GitHub Actions publishes **unsigned** builds for macOS, Windows, and Linux. No Apple Developer account or code-signing certificate is required to build or distribute.

> Unofficial client — not affiliated with pastebin.com.

### macOS

1. Download `PasteDesk_<version>_universal.dmg` from the [Releases](https://github.com/your-username/pastebin-desktop/releases) page.
2. Open the DMG and drag **PasteDesk.app** to **Applications**.
3. On first launch, macOS may block the app ("unidentified developer"). Either:
   - Right-click **PasteDesk.app** → **Open** → confirm **Open**, or
   - Remove the quarantine flag in Terminal:
     ```sh
     xattr -dr com.apple.quarantine /Applications/PasteDesk.app
     ```
4. Launch from Applications or Spotlight.

### Windows

1. Download `PasteDesk_<version>_x64-setup.msi` or `PasteDesk_<version>_x64-setup.exe` from Releases.
2. Run the installer. Windows SmartScreen may show **Windows protected your PC** because the build is unsigned.
3. Click **More info** → **Run anyway** to proceed.

### Linux

**AppImage** (portable, no install):

```sh
chmod +x PasteDesk_*.AppImage
./PasteDesk_*.AppImage
```

**Debian/Ubuntu `.deb`:**

```sh
sudo dpkg -i pastedesk_*.deb
```

If WebKitGTK is missing, install it first:

```sh
sudo apt install libwebkit2gtk-4.1-0
```

---

## First-time setup

1. Get your **API dev key** from [pastebin.com/doc_api](https://pastebin.com/doc_api) (requires a free account).
2. Open the app → **Account** → paste the key into the **API Dev Key** field.
3. Enter your **Username** and **Password**, then click **Log In**.
   - The password is sent once to Pastebin's login API and is never stored.
   - The returned session key is saved in `localStorage` so you stay logged in between app launches.
4. For **guest pastes** (public/unlisted only), you only need the dev key — skip login.

---

## Project structure

```
pastebin-desktop/
├── src/                        # Frontend (no build step required)
│   ├── index.html              # App shell — all views, modal, toasts
│   ├── styles.css              # CSS custom properties, layout, responsive breakpoints
│   ├── main.js                 # All UI logic: auth spine, theme, cache, filtering, modal
│   └── vendor/                 # Vendored offline-safe libraries
│       ├── highlight.min.js    # Syntax highlighting (highlight.js 11)
│       ├── hljs-dark.css       # GitHub Dark theme for highlight.js
│       ├── hljs-light.css      # GitHub Light theme for highlight.js
│       └── marked.min.js       # Markdown → HTML (marked 12)
├── src-tauri/
│   ├── src/
│   │   ├── main.rs             # Tauri commands + app entry point
│   │   ├── api.rs              # Pastebin HTTP API (login, create, list, view, delete)
│   │   └── models.rs           # Paste data struct
│   ├── Cargo.toml              # Rust dependencies
│   ├── tauri.conf.json         # Window config, CSP, bundle settings
│   └── icons/                  # App icons (all platforms)
├── .gitignore
├── CONTRIBUTING.md
├── LICENSE                     # MIT
└── README.md
```

---

## Architecture

| Layer | Technology | Role |
|-------|-----------|------|
| Frontend | HTML + CSS + JS (no framework) | UI, state management, filtering, theming |
| Vendor libs | highlight.js 11, marked 12 | Syntax highlighting, Markdown rendering |
| IPC | Tauri `invoke()` | Frontend → Rust async command calls |
| Backend | Rust + Tauri 2.x | HTTP calls to Pastebin API, XML parsing |
| HTTP client | reqwest + rustls | TLS without an OpenSSL system dependency |
| Packaging | Tauri bundler | `.app` / `.exe` / `.deb` / `.AppImage` |

### Tauri commands (Rust → Frontend API)

| Command | Parameters | Returns | Description |
|---------|-----------|---------|-------------|
| `login` | `dev_key`, `username`, `password` | `user_key: String` | Exchange credentials for a session key |
| `create_paste` | `dev_key`, `user_key`, `title`, `code`, `format`, `private`, `expire` | `url: String` | Create a new paste |
| `list_pastes` | `dev_key`, `user_key`, `limit` | `Vec<Paste>` | Fetch up to 1000 of the user's pastes |
| `view_raw` | `dev_key`, `user_key`, `paste_key` | `String` | Fetch raw text of a paste |
| `delete_paste` | `dev_key`, `user_key`, `paste_key` | `String` | Delete a paste |

### Frontend data flow

```
Tauri invoke() → Rust command → pastebin.com API
                                      ↓
                               parse response
                                      ↓
                    JS state (pastesCache, auth state)
                                      ↓
                    filter → sort → paginate → render
```

---

## Theming

The app supports **Light**, **Dark**, and **Auto** (follows OS) themes via CSS custom properties on `<html data-theme="...">`.

- All colors, shadows, and backgrounds are CSS tokens — no hardcoded `rgba()` values.
- Changing the theme swaps the `data-theme` attribute and the highlight.js stylesheet.
- Preference is stored in `localStorage` as `pb_theme` (`auto` / `light` / `dark`).

To add a custom theme, add a new `[data-theme="yourtheme"]` block in `src/styles.css` mirroring the `[data-theme="light"]` block, then set `document.documentElement.setAttribute('data-theme', 'yourtheme')` from JS.

---

## Security notes

- **No telemetry** — the app makes no calls except to `pastebin.com`.
- **Markdown sanitization** — rendered HTML has `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>`, all `on*` attributes, and `javascript:` hrefs stripped before display.
- **Password** — never written to disk; cleared from the input field immediately after login.
- **CSP** — configured in `tauri.conf.json`. Tighten `security.csp` for your fork if needed.
- **Private option** — the "Private (login)" visibility option is removed from the DOM (not just hidden) when the user is logged out, preventing accidental selection.

---

## Contributing

All contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

Quick summary:
- Fork the repo → create a feature branch → open a PR against `main`
- Rust changes live in `src-tauri/`; UI changes live in `src/`
- No bundler or Node.js needed — keep it that way
- Run `cargo clippy --all-targets` and `cargo fmt` before submitting Rust changes
- For UI changes, test at desktop (≥ 1024 px) and narrow (≤ 480 px) window sizes

---

## Roadmap

- [ ] Multiple Pastebin accounts
- [ ] Keyboard shortcuts (new paste, close modal, refresh)
- [ ] Export / import pastes as local files
- [ ] System tray quick-paste
- [ ] Auto-update via Tauri updater plugin
- [ ] Offline mode — read cached pastes without network

---

## License

[MIT](LICENSE) — free to use, modify, and distribute with attribution.
