/**
 * Ferret's notification pop-ups: a tiny self-contained page that stacks
 * toasts in the corner, with a reply box. Talks to the app only through
 * window.ferret.toast.
 */
export const TOAST_PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>Ferret notifications</title>
<style>
  :root { --bg: #101426; --panel: #181d33; --line: #2a3150; --text: #ffe4c7;
    --dim: #b9a48f; --accent: #f07835; --on-accent: #101426; --accent-dim: #f0783533; --danger: #ff6b6b; --ok: #3ecf8e; }
  * { box-sizing: border-box; margin: 0; }
  html, body { background: transparent; color: var(--text); overflow: hidden;
    font: 13px/1.35 "Inter", "Segoe UI", system-ui, sans-serif; }
  #stack { display: flex; flex-direction: column; gap: 8px; padding: 6px; }
  .toast { position: relative; display: grid; grid-template-columns: 40px 1fr; gap: 10px;
    padding: 12px 12px 12px 16px; border-radius: 14px; background: var(--bg);
    border: 1px solid var(--line); box-shadow: 0 8px 22px #000a; overflow: hidden;
    animation: in .18s ease-out; cursor: pointer; }
  .toast::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 4px; background: var(--accent); }
  .toast.out { animation: out .16s ease-in forwards; }
  @keyframes in { from { opacity: 0; transform: translateX(24px); } }
  @keyframes out { to { opacity: 0; transform: translateX(24px); } }
  .pic { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; background: var(--panel);
    display: grid; place-items: center; font-weight: 700; color: var(--accent); }
  .main { min-width: 0; }
  .top { display: flex; align-items: baseline; gap: 6px; padding-right: 20px; }
  .title { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub { color: var(--dim); font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .body { margin-top: 2px; color: var(--text); opacity: .92; word-wrap: break-word; display: -webkit-box;
    -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; white-space: pre-line; }
  .x { position: absolute; top: 8px; right: 8px; border: 0; background: none; color: var(--dim);
    width: 22px; height: 22px; border-radius: 6px; cursor: pointer; font-size: 14px; }
  .x:hover { background: var(--line); color: var(--text); }
  .actions { display: flex; gap: 6px; margin-top: 8px; }
  .actions button, .send { border: 0; border-radius: 8px; height: 28px; padding: 0 12px; cursor: pointer;
    font: inherit; font-weight: 600; background: var(--panel); color: var(--text); }
  .actions button:hover { background: var(--line); }
  .actions .primary, .send { background: var(--accent); color: var(--on-accent); }
  .actions .primary:hover, .send:hover { filter: brightness(1.08); }
  .reply { display: flex; gap: 6px; margin-top: 8px; }
  .reply input { flex: 1; min-width: 0; height: 30px; border-radius: 8px; border: 1px solid var(--line);
    background: var(--panel); color: var(--text); padding: 0 10px; font: inherit; outline: none; }
  .reply input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-dim); }
  .status { margin-top: 6px; font-size: 12px; }
  .status.ok { color: var(--ok); } .status.err { color: var(--danger); }
  .bar { position: absolute; left: 4px; bottom: 0; height: 2px; background: var(--accent-dim); }
</style></head>
<body><div id="stack"></div>
<script>
  const api = window.ferret.toast;
  const stack = document.getElementById("stack");
  const MAX = 3, LIFETIME = 8000;
  const toasts = new Map();

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

  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function report() {
    requestAnimationFrame(() =>
      api.resize(toasts.size ? Math.ceil(stack.getBoundingClientRect().height) : 0));
  }

  function remove(id) {
    const t = toasts.get(id);
    if (!t) return;
    toasts.delete(id);
    clearTimeout(t.timer);
    t.node.classList.add("out");
    setTimeout(() => { t.node.remove(); report(); }, 160);
  }

  function arm(t, ms) {
    clearTimeout(t.timer);
    if (t.hold) return;
    t.timer = setTimeout(() => remove(t.data.id), ms ?? LIFETIME);
  }

  function open(t) {
    api.action({ type: "open", channelId: t.data.channelId, messageId: t.data.messageId });
    remove(t.data.id);
  }

  function startReply(t) {
    if (t.input) return t.input.focus();
    t.hold = true; clearTimeout(t.timer);
    const row = el("div", "reply");
    const input = el("input");
    input.placeholder = "Reply\\u2026";
    input.maxLength = 2000;
    const send = el("button", "send", "Send");
    const submit = () => {
      const text = input.value.trim();
      if (!text || t.sending) return;
      t.sending = true; input.disabled = true; send.disabled = true;
      t.status.className = "status"; t.status.textContent = "Sending\\u2026";
      api.action({ type: "reply", id: t.data.id, channelId: t.data.channelId,
        messageId: t.data.messageId, text });
      report();
    };
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
      if (e.key === "Escape") remove(t.data.id);
    });
    send.addEventListener("click", (e) => { e.stopPropagation(); submit(); });
    input.addEventListener("click", (e) => e.stopPropagation());
    row.append(input, send);
    t.actions.replaceWith(row);
    t.input = input;
    input.focus();
    report();
  }

  function add(data) {
    if (toasts.has(data.id)) return;
    applyLook(data.look);
    while (toasts.size >= MAX) {
      const oldest = [...toasts.values()].find((t) => !t.hold) || toasts.values().next().value;
      remove(oldest.data.id);
    }
    const node = el("div", "toast");
    let pic;
    if (data.icon) {
      pic = el("img", "pic"); pic.src = data.icon; pic.referrerPolicy = "no-referrer"; pic.alt = "";
      pic.addEventListener("error", () => { pic.replaceWith(initial()); });
    } else pic = initial();
    function initial() { return el("div", "pic", (data.title || "?").replace(/^@/, "").slice(0, 1).toUpperCase()); }

    const main = el("div", "main");
    const top = el("div", "top");
    top.append(el("span", "title", data.title));
    if (data.subtitle) top.append(el("span", "sub", data.subtitle));
    main.append(top, el("div", "body", data.body || ""));

    const actions = el("div", "actions");
    const t = { data, node, actions, hold: false, timer: 0, status: el("div", "status") };
    if (data.canReply) {
      const reply = el("button", "primary", "Reply");
      reply.addEventListener("click", (e) => { e.stopPropagation(); startReply(t); });
      actions.append(reply);
    }
    const openBtn = el("button", "", "Open");
    openBtn.addEventListener("click", (e) => { e.stopPropagation(); open(t); });
    actions.append(openBtn);
    main.append(actions, t.status);

    const x = el("button", "x", "\\u2715");
    x.title = "Dismiss";
    x.addEventListener("click", (e) => { e.stopPropagation(); remove(data.id); });

    node.append(pic, main, x);
    node.addEventListener("click", () => { if (!t.input) open(t); });
    node.addEventListener("mouseenter", () => clearTimeout(t.timer));
    node.addEventListener("mouseleave", () => arm(t));

    toasts.set(data.id, t);
    stack.append(node);
    arm(t);
    report();
  }

  api.onAdd(add);
  api.onReplyResult((result) => {
    const t = toasts.get(result.id);
    if (!t) return;
    t.sending = false;
    if (result.ok) {
      t.status.className = "status ok"; t.status.textContent = "Sent \\u2713";
      t.hold = false; arm(t, 1500);
    } else {
      t.status.className = "status err";
      t.status.textContent = "Couldn't send" + (result.error ? ": " + result.error : "");
      t.input.disabled = false; t.input.focus();
      t.input.nextSibling.disabled = false;
    }
    report();
  });
</script></body></html>`;
