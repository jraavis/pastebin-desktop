# Contributing to Pastebin Desktop

Thank you for taking the time to contribute! This document explains how to get set up, the conventions used in this codebase, and how to submit a pull request.

---

## Table of contents

1. [Code of conduct](#code-of-conduct)
2. [Ways to contribute](#ways-to-contribute)
3. [Development setup](#development-setup)
4. [Project conventions](#project-conventions)
5. [Submitting a pull request](#submitting-a-pull-request)
6. [Reporting bugs](#reporting-bugs)
7. [Suggesting features](#suggesting-features)

---

## Code of conduct

Be respectful. Criticism of code is welcome; criticism of people is not. Pull requests, issues, and discussions should remain constructive and on-topic.

---

## Ways to contribute

- Fix a bug — see open issues labelled `bug`
- Implement a roadmap item from the README
- Improve documentation or fix typos
- Add or improve platform-specific setup instructions
- Report a reproducible bug with a clear description

---

## Development setup

### 1. Prerequisites

See the [README prerequisites section](README.md#prerequisites). You need Rust stable ≥ 1.70 and the Tauri CLI. No Node.js or npm is required.

### 2. Fork and clone

```sh
# Fork on GitHub first, then:
git clone https://github.com/YOUR_USERNAME/pastebin-desktop.git
cd pastebin-desktop
git remote add upstream https://github.com/ORIGINAL_OWNER/pastebin-desktop.git
```

### 3. Create a feature branch

```sh
git checkout -b feat/my-feature
# or for a bug fix:
git checkout -b fix/issue-42
```

Branch naming convention: `feat/`, `fix/`, `docs/`, `refactor/`, `chore/`.

### 4. Run the dev server

```sh
cargo tauri dev
```

The app window opens. Changes to `src/` (HTML/CSS/JS) show after a page reload (Cmd/Ctrl+R inside the window). Changes to `src-tauri/src/` trigger an automatic Rust recompile.

### 5. Static preview of the UI (no Tauri)

Open `src/index.html` in a browser or run a static server:

```sh
python3 -m http.server 1421 --directory src
# then open http://localhost:1421
```

The frontend detects that `window.__TAURI__` is absent and stubs all `invoke()` calls. The full UI is exercisable without the Rust backend — useful for rapid CSS / layout iteration.

---

## Project conventions

### Rust (`src-tauri/`)

- Follow standard Rust idioms. Run before every commit:
  ```sh
  cargo fmt
  cargo clippy --all-targets -- -D warnings
  ```
- Avoid `unwrap()` in production paths — propagate errors as `Result<_, String>`.
- Keep `api.rs` focused on HTTP + parsing; put Tauri command wiring in `main.rs`.
- New data fields go in `models.rs` with `#[derive(Serialize)]`.

### Frontend (`src/`)

- **No build step, no bundler, no framework.** Keep it vanilla HTML/CSS/JS.
- **No inline styles or event handlers in HTML** — all logic stays in `main.js`.
- **No new vendor libraries** without discussion. If you need one, vendor it as a single minified file in `src/vendor/` so the app works offline inside the Tauri webview.
- Auth-related UI changes (login state, button visibility, Private option) must go through `refreshAuthUI()` in `main.js` — not scattered elsewhere.
- Theme tokens live in `styles.css` as CSS custom properties on `:root`/`[data-theme=dark]`/`[data-theme=light]`. Do not add hardcoded colour values (`rgba(…)`, hex) outside those blocks.
- Test at both desktop (≥ 1024 px) and narrow (≤ 480 px) window widths.

### Markdown sanitization

If you modify the Markdown preview path, the `sanitize()` function in `main.js` must always strip `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>`, all `on*` attributes, and `javascript:` hrefs. Do not relax these rules.

### Commit messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <short description>

[optional body explaining why, not what]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `chore`.

Examples:
```
feat(ui): add zoom controls to view modal
fix(auth): hide Private option via DOM removal for WKWebView compat
docs: update Linux prerequisites in README
```

---

## Submitting a pull request

1. Make sure `cargo fmt` and `cargo clippy` pass with no warnings.
2. Test the change manually in the app (`cargo tauri dev`).
3. If the change affects the UI, test at multiple window sizes.
4. Push your branch and open a PR against `main`.
5. In the PR description:
   - Explain **what** changed and **why**.
   - Note any trade-offs or alternative approaches you considered.
   - Include a screenshot or screen recording for visible UI changes.
6. Keep PRs focused — one feature or fix per PR. Large refactors should be discussed in an issue first.

---

## Reporting bugs

Open a GitHub Issue and include:

- **OS and version** (e.g. macOS 14.5, Windows 11 23H2, Ubuntu 24.04)
- **App version / commit** (`git log -1 --oneline`)
- **Steps to reproduce** — numbered, specific
- **Expected behaviour**
- **Actual behaviour**
- **Logs** — open the Tauri dev console (`cargo tauri dev` stderr) or the webview devtools and paste any errors

---

## Suggesting features

Open a GitHub Issue with the label `enhancement`. Describe:

- The problem you want to solve
- Your proposed solution
- Any alternatives you considered

For large features, discuss before implementing — it avoids wasted effort if the direction doesn't align with the project goals.
