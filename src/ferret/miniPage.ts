/**
 * The compact always-on-top call window. A tiny self-contained page (no web
 * client bundle) that draws whatever the main page reports and sends button
 * presses back through window.ferret.mini.
 */
export const MINI_PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>Ferret call</title>
<style>
  :root { --bg: #101426; --panel: #181d33; --line: #262c47; --text: #ffe4c7;
    --dim: #b9a48f; --accent: #f07835; --on-accent: #101426; --danger: #e5484d; --speak: #3ecf8e; }
  * { box-sizing: border-box; margin: 0; }
  html, body { background: transparent; color: var(--text); overflow: hidden;
    font: 13px/1.3 "Inter", "Segoe UI", system-ui, sans-serif; user-select: none; }
  .card { margin: 4px; border-radius: 14px; background: var(--bg);
    border: 1px solid var(--line); box-shadow: 0 6px 18px #0008; overflow: hidden; }
  header { display: flex; align-items: center; gap: 8px; padding: 8px 8px 6px 12px;
    -webkit-app-region: drag; cursor: move; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--speak); flex: none; }
  .title { flex: 1; min-width: 0; }
  .title b, .title small { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .title small { color: var(--dim); font-size: 11px; }
  .x { -webkit-app-region: no-drag; border: 0; background: none; color: var(--dim);
    width: 22px; height: 22px; border-radius: 6px; cursor: pointer; font-size: 15px; }
  .x:hover { background: var(--line); color: var(--text); }
  ul { list-style: none; padding: 0 8px; display: flex; flex-direction: column; gap: 2px;
    max-height: 240px; overflow-y: auto; }
  li { display: flex; align-items: center; gap: 8px; padding: 3px 4px; border-radius: 8px; }
  li img, li .ph { width: 24px; height: 24px; border-radius: 50%; flex: none;
    outline: 2px solid transparent; outline-offset: 1px; object-fit: cover; }
  li .ph { background: var(--line); display: grid; place-items: center; font-size: 11px; }
  li.speaking img, li.speaking .ph { outline-color: var(--speak); }
  li span { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  li i { font-style: normal; color: var(--dim); font-size: 11px; }
  .more { color: var(--dim); font-size: 11px; padding: 2px 6px; }
  footer { display: flex; gap: 6px; padding: 8px; }
  footer button { flex: 1; height: 30px; border: 0; border-radius: 8px; cursor: pointer;
    background: var(--panel); color: var(--text); font: inherit; font-weight: 600; }
  footer button:hover { background: var(--line); }
  footer button.on { background: var(--accent); color: var(--on-accent); }
  footer button.end { background: var(--danger); color: #fff; flex: 0 0 44px; }
</style></head>
<body><div class="card" id="card">
  <header>
    <div class="dot"></div>
    <div class="title" id="open" title="Open Ferret"><b id="channel">Voice</b><small id="sub"></small></div>
    <button class="x" id="close" title="Hide for this call">&#x2715;</button>
  </header>
  <ul id="people"></ul>
  <footer>
    <button id="mute" title="Mute">Mute</button>
    <button id="deafen" title="Deafen">Deafen</button>
    <button id="open2" title="Open Ferret">Open</button>
    <button id="end" class="end" title="Disconnect">&#x260E;</button>
  </footer>
</div>
<script>
  const $ = (id) => document.getElementById(id);
  const mini = window.ferret.mini;
  const MAX = 8;
  let startedAt = 0;

  function applyLook(look) {
    if (!look || typeof look !== "object") return;
    const vars = { bg: "--bg", panel: "--panel", line: "--line", text: "--text",
      dim: "--dim", accent: "--accent", onAccent: "--on-accent" };
    const hex = /^#[0-9a-f]{6}$/i;
    for (const key in vars) {
      const value = look[key];
      if (typeof value === "string" && hex.test(value))
        document.documentElement.style.setProperty(vars[key], value);
    }
    if (typeof look.accent === "string" && hex.test(look.accent))
      document.documentElement.style.setProperty("--accent-dim", look.accent + "33");
  }

  for (const [id, cmd] of [["mute","toggleMute"],["deafen","toggleDeafen"],["end","disconnect"],
      ["close","close"],["open","focus"],["open2","focus"]]) {
    $(id).addEventListener("click", () => mini.command(cmd));
  }

  function elapsed() {
    if (!startedAt) return "";
    const s = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return (h ? h + ":" + pad(m) : m) + ":" + pad(r);
  }

  function render(state) {
    if (!state || !state.inCall) return;
    applyLook(state.look);
    startedAt = Number(state.startedAt) || 0;
    $("channel").textContent = state.channelName || "Voice";
    const where = state.serverName ? state.serverName + " \\u00b7 " : "";
    $("sub").textContent = where + elapsed();
    $("mute").classList.toggle("on", !!state.muted);
    $("mute").textContent = state.muted ? "Unmute" : "Mute";
    $("deafen").classList.toggle("on", !!state.deafened);
    $("deafen").textContent = state.deafened ? "Undeafen" : "Deafen";

    const people = Array.isArray(state.participants) ? state.participants : [];
    const list = $("people");
    list.replaceChildren();
    for (const p of people.slice(0, MAX)) {
      const li = document.createElement("li");
      if (p.speaking) li.className = "speaking";
      let pic;
      if (typeof p.avatar === "string" && /^https:\\/\\//.test(p.avatar)) {
        pic = document.createElement("img");
        pic.src = p.avatar;
        pic.referrerPolicy = "no-referrer";
      } else {
        pic = document.createElement("div");
        pic.className = "ph";
        pic.textContent = String(p.name || "?").slice(0, 1).toUpperCase();
      }
      const name = document.createElement("span");
      name.textContent = String(p.name || "Someone");
      li.append(pic, name);
      if (p.deafened || p.muted) {
        const flag = document.createElement("i");
        flag.textContent = p.deafened ? "deafened" : "muted";
        li.append(flag);
      }
      list.append(li);
    }
    if (people.length > MAX) {
      const more = document.createElement("li");
      more.className = "more";
      more.textContent = "+" + (people.length - MAX) + " more";
      list.append(more);
    }
    requestAnimationFrame(() => mini.resize(Math.ceil($("card").getBoundingClientRect().height) + 8));
  }

  let last;
  mini.onRender((state) => { last = state; render(state); });
  setInterval(() => { if (last && last.inCall) $("sub").textContent =
    (last.serverName ? last.serverName + " \\u00b7 " : "") + elapsed(); }, 1000);
</script></body></html>`;
