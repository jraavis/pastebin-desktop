// Tauri bridge (withGlobalTauri = true). Falls back to stubs when opened
// outside the Tauri runtime (e.g. a plain browser preview) so the UI still loads.
const TAURI = window.__TAURI__;
const invoke = TAURI
  ? TAURI.core.invoke
  : async () => {
      throw "Not running inside the PasteDesk app.";
    };
const shellOpen = TAURI ? TAURI.shell.open : (url) => window.open(url, "_blank");
const clipboard = TAURI
  ? TAURI.clipboardManager
  : {
      writeText: (t) => navigator.clipboard.writeText(t),
      readText: () => navigator.clipboard.readText(),
    };

// ---------- App state ----------
const PAGE_SIZE = 12;
const state = {
  devKey: localStorage.getItem("pb_dev_key") || "",
  userKey: localStorage.getItem("pb_user_key") || "",
  username: localStorage.getItem("pb_username") || "",
  theme: localStorage.getItem("pb_theme") || "auto", // auto | light | dark
  zoom: parseInt(localStorage.getItem("pb_zoom"), 10) || 14,
  // My Pastes
  pastesCache: null, // null = not fetched yet
  page: 1,
  search: "",
  visFilter: "all",
  sortField: "date",
  sortDir: "desc",
  // modal
  modalRaw: "",
  modalFormat: "text",
  modalMode: "preview",
};

// ---------- Helpers ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function toast(msg, type = "info", { html = false, timeout = 4200 } = {}) {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  const body = document.createElement("div");
  if (html) body.innerHTML = msg;
  else body.textContent = msg;
  el.appendChild(body);
  $("#toasts").appendChild(el);
  const kill = () => {
    el.classList.add("out");
    el.addEventListener("animationend", () => el.remove(), { once: true });
  };
  if (timeout) setTimeout(kill, timeout);
  el.addEventListener("dblclick", kill);
  return el;
}

function setLoading(btn, on) {
  const label = btn.querySelector(".btn-label");
  const spin = btn.querySelector(".spinner");
  btn.disabled = on;
  if (label) label.style.opacity = on ? "0.6" : "1";
  if (spin) spin.classList.toggle("hidden", !on);
}

function fmtDate(unix) {
  const n = parseInt(unix, 10);
  if (!n) return "";
  return new Date(n * 1000).toLocaleString();
}

const VIS = { "0": "Public", "1": "Unlisted", "2": "Private" };

// Kept detached from the Create <select> while logged out (see refreshAuthUI).
const privateOpt = $("#opt-private");

function escapeHtml(s) {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ======================================================================
// Auth spine — single source of truth for login-dependent UI.
// Called on init, login, and logout.
// ======================================================================
function refreshAuthUI() {
  const loggedIn = !!state.userKey;

  // sidebar status pill
  $("#auth-dot").className = loggedIn ? "dot online" : "dot offline";
  $("#auth-label").textContent = loggedIn
    ? state.username || "Logged in"
    : "Guest";
  $("#auth-sub").textContent = loggedIn
    ? "Session active"
    : "Not logged in";

  // topbar avatar
  const av = $("#topbar-avatar");
  if (av) {
    av.textContent = loggedIn
      ? (state.username || "?").slice(0, 1).toUpperCase()
      : "?";
    av.classList.toggle("on", loggedIn);
  }

  // account hero
  const heroName = $("#account-name");
  const heroSub = $("#account-sub");
  const heroAv = $("#account-avatar");
  if (heroName) heroName.textContent = loggedIn ? state.username || "Logged in" : "Not signed in";
  if (heroSub) heroSub.textContent = loggedIn ? "Session active. You can manage pastes." : "Sign in to manage your pastes.";
  if (heroAv) {
    heroAv.textContent = loggedIn
      ? (state.username || "?").slice(0, 1).toUpperCase()
      : "?";
    heroAv.classList.toggle("on", loggedIn);
  }

  // Account view: login form vs logout
  $("#btn-login").classList.toggle("hidden", loggedIn);
  $("#btn-logout").classList.toggle("hidden", !loggedIn);
  $("#fld-user").classList.toggle("hidden", loggedIn);
  $("#fld-pass").classList.toggle("hidden", loggedIn);
  $("#s-devkey").value = state.devKey;
  $("#s-user").value = state.username;

  // Create view: Private option requires login.
  // WKWebView (the macOS Tauri runtime) ignores `hidden`/`display:none` on
  // <option>, so detach the node entirely when logged out and re-insert it
  // when logged in — DOM removal is honored by every webview.
  const sel = $("#p-private");
  if (loggedIn) {
    if (!sel.contains(privateOpt)) sel.appendChild(privateOpt);
  } else {
    if (sel.value === "2") sel.value = "1";
    if (sel.contains(privateOpt)) sel.removeChild(privateOpt);
  }

  // My Pastes: logged-out shows a prompt, drop any stale cache
  if (!loggedIn) {
    state.pastesCache = null;
    const list = $("#pastes-list");
    if (list)
      list.innerHTML =
        '<div class="empty empty-hero"><div class="empty-ico">' +
        '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3H6a2 2 0 0 0-2 2v11"/><path d="M8 7h8"/><path d="M8 11h5"/><path d="M19 17v3a2 2 0 0 1-2 2H6"/><path d="m17 14 4 4-4 4"/></svg>' +
        '</div><div class="empty-title">Your pastes will appear here</div>' +
        '<div class="empty-sub">Log in from the Account tab to load your library.</div></div>';
    $("#pager").classList.add("hidden");
    $("#pastes-count").textContent = "";
  }
}

// ======================================================================
// Theme
// ======================================================================
const mql = window.matchMedia("(prefers-color-scheme: light)");

function resolvedTheme() {
  if (state.theme === "auto") return mql.matches ? "light" : "dark";
  return state.theme;
}

function applyTheme() {
  const t = resolvedTheme();
  document.documentElement.setAttribute("data-theme", t);
  // swap highlight.js stylesheet
  $("#hljs-dark").disabled = t === "light";
  $("#hljs-light").disabled = t !== "light";
  // reflect in settings segmented
  $$("#seg-theme button").forEach((b) =>
    b.classList.toggle("active", b.dataset.themeChoice === state.theme)
  );
  // reflect in header toggle (shows current choice icon + tooltip)
  const tog = $("#btn-theme-toggle");
  if (tog) {
    tog.dataset.theme = state.theme;
    tog.title = `Theme: ${state.theme} (click to change)`;
    tog.setAttribute("aria-label", `Theme: ${state.theme}`);
  }
}

function setTheme(choice) {
  state.theme = choice;
  localStorage.setItem("pb_theme", state.theme);
  applyTheme();
}

mql.addEventListener("change", () => {
  if (state.theme === "auto") applyTheme();
});

$$("#seg-theme button").forEach((b) => {
  b.addEventListener("click", () => setTheme(b.dataset.themeChoice));
});

// Header theme toggle cycles auto → light → dark → auto
const THEME_CYCLE = ["auto", "light", "dark"];
$("#btn-theme-toggle").addEventListener("click", () => {
  const next = THEME_CYCLE[(THEME_CYCLE.indexOf(state.theme) + 1) % THEME_CYCLE.length];
  setTheme(next);
});

// ======================================================================
// Zoom (shared default + live modal)
// ======================================================================
function applyZoom() {
  $("#modal-body").style.fontSize = `${state.zoom}px`;
  // drive the create-view editor + overlay via a shared CSS var
  document.documentElement.style.setProperty("--editor-fs", `${state.zoom}px`);
  $("#set-zoom").value = state.zoom;
  $("#set-zoom-val").textContent = `${state.zoom}px`;
}

function setZoom(px) {
  state.zoom = Math.min(24, Math.max(11, px));
  localStorage.setItem("pb_zoom", state.zoom);
  applyZoom();
}

$("#set-zoom").addEventListener("input", (e) =>
  setZoom(parseInt(e.target.value, 10))
);
$("#zoom-in").addEventListener("click", () => setZoom(state.zoom + 1));
$("#zoom-out").addEventListener("click", () => setZoom(state.zoom - 1));
$("#zoom-reset").addEventListener("click", () => setZoom(14));

// Header font-size quick controls (share the zoom state)
$("#btn-font-inc").addEventListener("click", () => setZoom(state.zoom + 1));
$("#btn-font-dec").addEventListener("click", () => setZoom(state.zoom - 1));

// ======================================================================
// Sidebar collapse
// ======================================================================
function applySidebar(collapsed) {
  $("#app").classList.toggle("sidebar-collapsed", collapsed);
  $("#set-sidebar").checked = collapsed;
  localStorage.setItem("pb_sidebar", collapsed ? "1" : "0");
}

// Auto-collapse on narrow viewports (CSS overlay still works via hamburger).
// Uses matchMedia so resize events are coalesced by the browser.
const narrowMql = window.matchMedia("(max-width: 600px)");
function onNarrowChange(e) {
  if (e.matches) {
    // Collapse without saving — user preference is only set by the toggle.
    $("#app").classList.add("sidebar-collapsed");
    $("#set-sidebar").checked = false;
  } else {
    // Restored to wide: apply saved preference.
    applySidebar(localStorage.getItem("pb_sidebar") === "1");
  }
}
narrowMql.addEventListener("change", onNarrowChange);

$("#btn-hamburger").addEventListener("click", () =>
  applySidebar(!$("#app").classList.contains("sidebar-collapsed"))
);
$("#set-sidebar").addEventListener("change", (e) =>
  applySidebar(e.target.checked)
);

// ======================================================================
// Navigation
// ======================================================================
const PAGE_META = {
  create:  { title: "New Paste",      sub: "Share a snippet in seconds." },
  pastes:  { title: "My Pastes",      sub: "Browse, search, and re-open." },
  settings:{ title: "Settings",       sub: "Appearance & preferences." },
  account: { title: "Account",        sub: "Connect your pastebin.com account." },
};

function setView(name) {
  const btn = document.querySelector(`.nav-item[data-view="${name}"]`);
  $$(".nav-item").forEach((b) => b.classList.toggle("active", b === btn));
  $$(".view").forEach((v) => v.classList.remove("active"));
  const target = $(`#view-${name}`);
  if (target) target.classList.add("active");
  const meta = PAGE_META[name] || { title: name, sub: "" };
  $("#page-title").textContent = meta.title;
  $("#page-sub").textContent = meta.sub;
  // show topbar search only on pastes view
  const ts = $("#topbar-search");
  if (ts) ts.hidden = name !== "pastes";
  if (name === "pastes") loadPastes(false);
}

$$(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => setView(btn.dataset.view));
});

// topbar avatar → jump to account
$("#topbar-user").addEventListener("click", () => setView("account"));

// topbar search (My Pastes)
$("#topbar-search-input").addEventListener("input", (e) => {
  state.search = e.target.value;
  state.page = 1;
  renderPastesView();
  $("#topbar-search-clear").classList.toggle("hidden", !state.search);
});
$("#topbar-search-clear").addEventListener("click", () => {
  state.search = "";
  $("#topbar-search-input").value = "";
  $("#topbar-search-clear").classList.add("hidden");
  state.page = 1;
  renderPastesView();
  $("#topbar-search-input").focus();
});

// ---------- Ripple ----------
$$(".ripple").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    const rect = btn.getBoundingClientRect();
    const rip = document.createElement("span");
    rip.className = "rip";
    const size = Math.max(rect.width, rect.height);
    rip.style.width = rip.style.height = `${size}px`;
    rip.style.left = `${e.clientX - rect.left - size / 2}px`;
    rip.style.top = `${e.clientY - rect.top - size / 2}px`;
    btn.appendChild(rip);
    rip.addEventListener("animationend", () => rip.remove(), { once: true });
  });
});

// ---------- Eye toggles (password fields) ----------
$$(".eye").forEach((btn) => {
  btn.addEventListener("click", () => {
    const input = $(`#${btn.dataset.target}`);
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.classList.toggle("on", show);
  });
});

// ======================================================================
// Create paste
// ======================================================================
$("#btn-create").addEventListener("click", async () => {
  const btn = $("#btn-create");
  const code = $("#p-code").value;
  if (!code.trim()) return toast("Content is empty.", "err");
  if (!state.devKey) return toast("Set your API dev key in Account.", "err");

  setLoading(btn, true);
  try {
    const url = await invoke("create_paste", {
      devKey: state.devKey,
      userKey: state.userKey,
      title: $("#p-title").value,
      code,
      format: $("#p-format").value,
      private: $("#p-private").value,
      expire: $("#p-expire").value,
    });
    toast(`Paste created — <a href="#" data-url="${url}">${url}</a>`, "ok", {
      html: true,
      timeout: 9000,
    });
    $("#p-code").value = "";
    $("#p-title").value = "";
    updateCharCount();
    state.pastesCache = null; // new paste invalidates the list cache
  } catch (err) {
    toast(String(err), "err");
  } finally {
    setLoading(btn, false);
  }
});

// Pastebin format → hljs language name (only entries that differ or need null)
const HLJS_LANG = {
  text: null,
  html5: "xml",
  cpp: "cpp",
  c: "c",
};

// editor toolbar
function updateCharCount() {
  const v = $("#p-code").value;
  const lines = v ? v.split(/\r\n|\r|\n/).length : 0;
  $("#char-count").textContent = `${v.length.toLocaleString()} chars · ${lines.toLocaleString()} lines`;
}
function updateEditorHighlight() {
  const hl = $("#p-code-hl");
  if (!hl) return;
  const raw = $("#p-code").value;
  const fmt = $("#p-format").value;
  // The textarea text itself is transparent; this overlay is what the user
  // actually sees. So it must always be populated — fall back to escaped
  // plain text when highlighting is off or unavailable, else text vanishes.
  if (!raw) {
    hl.innerHTML = "";
    return;
  }
  if (fmt === "text" || !window.hljs) {
    hl.innerHTML = escapeHtml(raw);
  } else {
    const lang = fmt in HLJS_LANG ? HLJS_LANG[fmt] : fmt;
    try {
      hl.innerHTML = lang && window.hljs.getLanguage(lang)
        ? window.hljs.highlight(raw, { language: lang }).value
        : window.hljs.highlightAuto(raw).value;
    } catch {
      hl.innerHTML = escapeHtml(raw);
    }
  }
  // keep pre scroll in sync with textarea
  const pre = hl.closest(".code-editor-hl");
  if (pre) pre.scrollTop = $("#p-code").scrollTop;
}

// ---- Markdown preview (editor) ----
let mdPreviewOn = false;
function renderMdPreview() {
  const pane = $("#p-md-preview");
  if (!pane || !mdPreviewOn) return;
  const raw = $("#p-code").value;
  pane.innerHTML = window.marked
    ? sanitize(window.marked.parse(raw))
    : escapeHtml(raw);
}
function syncMdPreviewBtn() {
  const btn = $("#btn-md-preview");
  if (!btn) return;
  const isMd = $("#p-format").value === "markdown";
  btn.hidden = !isMd;
  if (!isMd && mdPreviewOn) setMdPreview(false);
}
function setMdPreview(on) {
  mdPreviewOn = on;
  const btn = $("#btn-md-preview");
  const pane = $("#p-md-preview");
  const wrap = $("#p-code").closest(".code-editor-wrap");
  if (btn) btn.setAttribute("aria-pressed", String(on));
  if (btn) btn.classList.toggle("active", on);
  if (pane) pane.hidden = !on;
  if (wrap) wrap.classList.toggle("preview-on", on);
  if (on) renderMdPreview();
}

$("#p-code").addEventListener("input", () => { updateCharCount(); updateEditorHighlight(); renderMdPreview(); });
$("#p-code").addEventListener("scroll", () => {
  const hl = $("#p-code-hl")?.closest(".code-editor-hl");
  if (hl) hl.scrollTop = $("#p-code").scrollTop;
});
// Tab inserts a tab char instead of moving focus; Shift+Tab outdents.
$("#p-code").addEventListener("keydown", (e) => {
  if (e.key !== "Tab") return;
  e.preventDefault();
  const ta = e.target;
  const { selectionStart: s, selectionEnd: en, value: v } = ta;
  if (e.shiftKey) {
    // remove one leading tab from the line at the caret
    const lineStart = v.lastIndexOf("\n", s - 1) + 1;
    if (v[lineStart] === "\t") {
      ta.value = v.slice(0, lineStart) + v.slice(lineStart + 1);
      const shift = s > lineStart ? 1 : 0;
      ta.selectionStart = s - shift;
      ta.selectionEnd = en - shift;
    }
  } else {
    ta.value = v.slice(0, s) + "\t" + v.slice(en);
    ta.selectionStart = ta.selectionEnd = s + 1;
  }
  ta.dispatchEvent(new Event("input", { bubbles: true }));
});
$("#p-format").addEventListener("change", () => { updateEditorHighlight(); syncMdPreviewBtn(); });
$("#btn-md-preview").addEventListener("click", () => setMdPreview(!mdPreviewOn));
updateCharCount();
syncMdPreviewBtn();

$("#btn-clear-content").addEventListener("click", () => {
  if (!$("#p-code").value) return;
  $("#p-code").value = "";
  $("#p-code").focus();
  updateCharCount();
});
$("#btn-paste-from-clip").addEventListener("click", async () => {
  try {
    const text = await clipboard.readText();
    if (!text) return toast("Clipboard is empty.", "info");
    const ta = $("#p-code");
    ta.value = (ta.value ? ta.value + "\n" : "") + text;
    ta.focus();
    updateCharCount();
    toast("Pasted from clipboard.", "ok", { timeout: 1800 });
  } catch (e) {
    toast("Could not read clipboard: " + e, "err");
  }
});

// open paste links from toasts in browser
$("#toasts").addEventListener("click", (e) => {
  const a = e.target.closest("a[data-url]");
  if (a) {
    e.preventDefault();
    shellOpen(a.dataset.url);
  }
});

// ======================================================================
// Login / Logout
// ======================================================================
$("#btn-login").addEventListener("click", async () => {
  const btn = $("#btn-login");
  const devKey = $("#s-devkey").value.trim();
  const user = $("#s-user").value.trim();
  const pass = $("#s-pass").value;
  if (!devKey || !user || !pass)
    return toast("Fill dev key, username and password.", "err");

  setLoading(btn, true);
  try {
    const userKey = await invoke("login", {
      devKey,
      username: user,
      password: pass,
    });
    state.devKey = devKey;
    state.userKey = userKey;
    state.username = user;
    localStorage.setItem("pb_dev_key", devKey);
    localStorage.setItem("pb_user_key", userKey);
    localStorage.setItem("pb_username", user);
    $("#s-pass").value = "";
    refreshAuthUI();
    toast("Logged in successfully.", "ok");
  } catch (err) {
    toast(String(err), "err");
  } finally {
    setLoading(btn, false);
  }
});

$("#btn-logout").addEventListener("click", () => {
  state.userKey = "";
  state.username = "";
  localStorage.removeItem("pb_user_key");
  localStorage.removeItem("pb_username");
  refreshAuthUI();
  toast("Logged out.", "info");
});

// persist dev key edits even without login
$("#s-devkey").addEventListener("change", (e) => {
  state.devKey = e.target.value.trim();
  localStorage.setItem("pb_dev_key", state.devKey);
});

// ======================================================================
// My Pastes — fetch once, cache, filter/sort/paginate client-side
// ======================================================================
function showSkeletons(n = 6) {
  const list = $("#pastes-list");
  list.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const s = document.createElement("div");
    s.className = "skel";
    list.appendChild(s);
  }
}

// fetch from network; force=true bypasses cache (Refresh button)
async function loadPastes(force) {
  if (!state.userKey) {
    refreshAuthUI();
    return;
  }
  if (state.pastesCache && !force) {
    renderPastesView();
    return;
  }
  showSkeletons();
  $("#pager").classList.add("hidden");
  try {
    const pastes = await invoke("list_pastes", {
      devKey: state.devKey,
      userKey: state.userKey,
      limit: 1000,
    });
    state.pastesCache = pastes;
    state.page = 1;
    renderPastesView();
  } catch (err) {
    state.pastesCache = null;
    $("#pastes-list").innerHTML = `<div class="empty empty-hero"><div class="empty-ico">⚠</div><div class="empty-title">Couldn't load pastes</div><div class="empty-sub">${escapeHtml(
      String(err)
    )}</div></div>`;
    $("#pastes-count").textContent = "";
    toast(String(err), "err");
  }
}

function filteredSorted() {
  let rows = state.pastesCache || [];
  const q = state.search.trim().toLowerCase();
  if (q) rows = rows.filter((p) => (p.title || "").toLowerCase().includes(q));
  if (state.visFilter !== "all")
    rows = rows.filter((p) => p.private === state.visFilter);

  const dir = state.sortDir === "asc" ? 1 : -1;
  rows = [...rows].sort((a, b) => {
    let av, bv;
    if (state.sortField === "title") {
      av = (a.title || "").toLowerCase();
      bv = (b.title || "").toLowerCase();
      return av < bv ? -dir : av > bv ? dir : 0;
    }
    const key = state.sortField === "hits" ? "hits" : "date";
    av = parseInt(a[key], 10) || 0;
    bv = parseInt(b[key], 10) || 0;
    return (av - bv) * dir;
  });
  return rows;
}

function renderPastesView() {
  if (!state.pastesCache) return;
  const rows = filteredSorted();
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (state.page > pages) state.page = pages;
  const start = (state.page - 1) * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);

  $("#pastes-count").textContent = total
    ? `${total} paste${total === 1 ? "" : "s"}`
    : "";
  renderPastes(pageRows);

  const pager = $("#pager");
  if (total > PAGE_SIZE) {
    pager.classList.remove("hidden");
    $("#pg-info").textContent = `Page ${state.page} / ${pages}`;
    $("#pg-prev").disabled = state.page <= 1;
    $("#pg-next").disabled = state.page >= pages;
  } else {
    pager.classList.add("hidden");
  }
}

function renderPastes(pastes) {
  const list = $("#pastes-list");
  list.innerHTML = "";
  if (!pastes.length) {
    list.innerHTML = '<div class="empty empty-hero"><div class="empty-ico">' +
      '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
      '</div><div class="empty-title">No pastes match your filters</div>' +
      '<div class="empty-sub">Try a different search term or clear the visibility filter.</div></div>';
    return;
  }
  pastes.forEach((p, i) => {
    const card = document.createElement("div");
    card.className = "paste-card";
    card.style.animationDelay = `${Math.min(i * 35, 350)}ms`;
    const visClass = p.private === "0" ? "vis-public" : p.private === "1" ? "vis-unlisted" : "vis-private";
    const hits = parseInt(p.hits, 10) || 0;
    const hitsLabel = hits >= 1000 ? (hits / 1000).toFixed(1) + "k" : String(hits);
    card.innerHTML = `
      <div class="pc-head">
        <div class="pc-title">${escapeHtml(p.title) || "Untitled"}</div>
        <span class="pc-vis ${visClass}" title="${VIS[p.private] || "?"}"></span>
      </div>
      <div class="pc-meta">
        <span class="chip"><span class="chip-dot"></span>${escapeHtml(p.format) || "text"}</span>
        <span class="chip dim">${VIS[p.private] || "?"}</span>
        <span class="chip dim">${escapeHtml(hitsLabel)} ${hits === 1 ? "hit" : "hits"}</span>
        <span class="chip dim">${fmtDate(p.date)}</span>
      </div>
      <div class="pc-actions">
        <button class="btn small view-btn" title="Preview in app">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>
          View
        </button>
        <button class="btn small ghost open-btn" title="Open on pastebin.com">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>
          Open
        </button>
        <button class="btn small ghost danger del-btn" title="Delete paste" aria-label="Delete">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6 18 20a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </button>
      </div>`;
    card.querySelector(".view-btn").addEventListener("click", () => viewRaw(p));
    card.querySelector(".open-btn").addEventListener("click", () =>
      shellOpen(p.url)
    );
    card.querySelector(".del-btn").addEventListener("click", () =>
      deletePaste(p, card)
    );
    list.appendChild(card);
  });
}

// Refresh = clear cache and refetch
$("#btn-refresh").addEventListener("click", () => loadPastes(true));

// Controls — operate on the cache, never refetch
$("#flt-vis").addEventListener("change", (e) => {
  state.visFilter = e.target.value;
  state.page = 1;
  renderPastesView();
});
$("#flt-sort").addEventListener("change", (e) => {
  state.sortField = e.target.value;
  state.page = 1;
  renderPastesView();
});
$("#flt-order").addEventListener("click", (e) => {
  state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
  const btn = e.currentTarget;
  btn.dataset.dir = state.sortDir;
  // rotate arrow icon
  const path = btn.querySelector("svg path");
  if (path) {
    // animate a flip
    btn.animate(
      [
        { transform: "rotate(0deg)" },
        { transform: "rotate(180deg)" },
      ],
      { duration: 240, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" }
    );
  }
  renderPastesView();
});
$("#pg-prev").addEventListener("click", () => {
  if (state.page > 1) {
    state.page--;
    renderPastesView();
  }
});
$("#pg-next").addEventListener("click", () => {
  state.page++;
  renderPastesView();
});

// ======================================================================
// View raw (modal) — zoom + preview by paste type
// ======================================================================
async function viewRaw(p) {
  $("#modal-title").textContent = p.title || "Paste";
  $("#modal-format-chip").textContent = (p.format || "text").toUpperCase();
  state.modalFormat = p.format || "text";
  state.modalRaw = "";
  state.modalMode = "preview";
  syncModeButtons();
  const body = $("#modal-body");
  body.className = "raw-body mode-raw";
  body.textContent = "Loading…";
  applyZoom();
  openModal();
  try {
    const raw = await invoke("view_raw", {
      devKey: state.devKey,
      userKey: state.userKey,
      pasteKey: p.key,
    });
    state.modalRaw = raw;
    renderModalBody();
    $("#modal-copy").onclick = async () => {
      try {
        await clipboard.writeText(state.modalRaw);
        toast("Copied to clipboard.", "ok", { timeout: 2000 });
      } catch (e) {
        toast("Copy failed: " + e, "err");
      }
    };
  } catch (err) {
    body.className = "raw-body mode-raw";
    body.textContent = String(err);
  }
}

// Strip anything script-like from rendered markdown HTML.
function sanitize(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  tpl.content.querySelectorAll("script, style, iframe, object, embed").forEach(
    (n) => n.remove()
  );
  tpl.content.querySelectorAll("*").forEach((el) => {
    [...el.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      const val = attr.value.trim().toLowerCase();
      if (name.startsWith("on")) el.removeAttribute(attr.name);
      if (
        (name === "href" || name === "src") &&
        val.startsWith("javascript:")
      )
        el.removeAttribute(attr.name);
    });
  });
  return tpl.innerHTML;
}

function renderModalBody() {
  const body = $("#modal-body");
  const raw = state.modalRaw;
  const fmt = state.modalFormat;

  if (state.modalMode === "raw") {
    body.className = "raw-body mode-raw";
    body.textContent = raw;
    return;
  }

  // preview mode
  if (fmt === "markdown" && window.marked) {
    body.className = "raw-body mode-md";
    body.innerHTML = sanitize(window.marked.parse(raw));
    return;
  }

  // code: highlight (fallback to plain monospace)
  body.className = "raw-body mode-code";
  if (fmt === "text" || !window.hljs) {
    body.className = "raw-body mode-raw";
    body.textContent = raw;
    return;
  }
  const lang = fmt in HLJS_LANG ? HLJS_LANG[fmt] : fmt;
  let out;
  try {
    out =
      lang && window.hljs.getLanguage(lang)
        ? window.hljs.highlight(raw, { language: lang }).value
        : window.hljs.highlightAuto(raw).value;
  } catch {
    out = escapeHtml(raw);
  }
  body.innerHTML = `<pre><code class="hljs">${out}</code></pre>`;
}

function syncModeButtons() {
  $$("#seg-mode button").forEach((b) =>
    b.classList.toggle("active", b.dataset.mode === state.modalMode)
  );
}

$$("#seg-mode button").forEach((b) => {
  b.addEventListener("click", () => {
    state.modalMode = b.dataset.mode;
    syncModeButtons();
    renderModalBody();
  });
});

function openModal() {
  $("#modal").classList.remove("hidden");
}
function closeModal() {
  $("#modal").classList.add("hidden");
}
$("#modal-close").addEventListener("click", closeModal);
$("#modal").addEventListener("click", (e) => {
  if (e.target.id === "modal") closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
  // ⌘/Ctrl + 1..4 → switch view
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
    const map = { "1": "create", "2": "pastes", "3": "settings", "4": "account",
                  "n": "create", "p": "pastes", ",": "settings" };
    if (map[e.key]) {
      e.preventDefault();
      setView(map[e.key]);
    }
  }
});

// ======================================================================
// Delete
// ======================================================================
async function deletePaste(p, card) {
  if (!confirm(`Delete "${p.title || "Untitled"}"? This cannot be undone.`))
    return;
  try {
    await invoke("delete_paste", {
      devKey: state.devKey,
      userKey: state.userKey,
      pasteKey: p.key,
    });
    // drop from cache so it stays gone without a refetch
    if (state.pastesCache)
      state.pastesCache = state.pastesCache.filter((x) => x.key !== p.key);
    card.classList.add("removing");
    card.addEventListener("animationend", () => card.remove(), { once: true });
    toast("Paste deleted.", "ok", { timeout: 2500 });
  } catch (err) {
    toast(String(err), "err");
  }
}

// ======================================================================
// Init
// ======================================================================
applyTheme();
applyZoom();
// On narrow viewports always start collapsed; on wide use saved pref.
if (narrowMql.matches) {
  $("#app").classList.add("sidebar-collapsed");
  $("#set-sidebar").checked = false;
} else {
  applySidebar(localStorage.getItem("pb_sidebar") === "1");
}
refreshAuthUI();
