// Tauri bridge (withGlobalTauri = true). Falls back to stubs when opened
// outside the Tauri runtime (e.g. a plain browser preview) so the UI still loads.
const TAURI = window.__TAURI__;
const invoke = TAURI
  ? TAURI.tauri.invoke
  : async () => {
      throw "Not running inside the Pastebin desktop app.";
    };
const shellOpen = TAURI ? TAURI.shell.open : (url) => window.open(url, "_blank");
const clipboard = TAURI
  ? TAURI.clipboard
  : { writeText: (t) => navigator.clipboard.writeText(t) };

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
        '<div class="empty">Log in from Account to see your pastes.</div>';
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
}

mql.addEventListener("change", () => {
  if (state.theme === "auto") applyTheme();
});

$$("#seg-theme button").forEach((b) => {
  b.addEventListener("click", () => {
    state.theme = b.dataset.themeChoice;
    localStorage.setItem("pb_theme", state.theme);
    applyTheme();
  });
});

// ======================================================================
// Zoom (shared default + live modal)
// ======================================================================
function applyZoom() {
  $("#modal-body").style.fontSize = `${state.zoom}px`;
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
$$(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    const view = btn.dataset.view;
    $$(".nav-item").forEach((b) => b.classList.toggle("active", b === btn));
    $$(".view").forEach((v) => v.classList.remove("active"));
    const target = $(`#view-${view}`);
    target.classList.add("active");
    if (view === "pastes") loadPastes(false); // cached unless empty
  });
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
    state.pastesCache = null; // new paste invalidates the list cache
  } catch (err) {
    toast(String(err), "err");
  } finally {
    setLoading(btn, false);
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
    $("#pastes-list").innerHTML = `<div class="empty">${escapeHtml(
      String(err)
    )}</div>`;
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
    list.innerHTML = '<div class="empty">No pastes match your filters.</div>';
    return;
  }
  pastes.forEach((p, i) => {
    const card = document.createElement("div");
    card.className = "paste-card";
    card.style.animationDelay = `${Math.min(i * 40, 400)}ms`;
    card.innerHTML = `
      <div class="pc-title">${escapeHtml(p.title) || "Untitled"}</div>
      <div class="pc-meta">
        <span class="chip">${escapeHtml(p.format) || "text"}</span>
        <span class="chip dim">${VIS[p.private] || "?"}</span>
        <span class="chip dim">${escapeHtml(p.hits || "0")} hits</span>
        <span class="chip dim">${fmtDate(p.date)}</span>
      </div>
      <div class="pc-actions">
        <button class="btn small view-btn">View</button>
        <button class="btn small open-btn">Open</button>
        <button class="btn small ghost danger del-btn">Delete</button>
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
$("#flt-search").addEventListener("input", (e) => {
  state.search = e.target.value;
  state.page = 1;
  renderPastesView();
});
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
  e.currentTarget.dataset.dir = state.sortDir;
  e.currentTarget.textContent = state.sortDir === "asc" ? "↑ Asc" : "↓ Desc";
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

const HLJS_LANG = {
  text: null,
  html5: "xml",
  cpp: "cpp",
  c: "c",
};

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
