import { config } from "./config.js";
import { createSignaturePad } from "./signature.js";

// ---------------------------------------------------------------------
//  Constants
// ---------------------------------------------------------------------
const ROLES = ["Apprentice", "Hairstylist", "Shift Leader", "Manager", "Receptionist", "Admin"];
const LOCATIONS = ["Cannon Hill", "Coorparoo"];
const EYE_SVG = (slash) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>${slash ? `<path d="M4 4l16 16"/>` : ""}</svg>`;
const EYE_OPEN = EYE_SVG(false);
const EYE_CLOSED = EYE_SVG(true);
const EMPLOYMENT = ["Full-time", "Part-time", "Casual", "Fixed-term"];
const TEE_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];
const TRACK_INFO = {
  safety: { label: "Safety induction", short: "Safety", kicker: "Step 2", blurb: "How we keep clients and the team safe, every shift." },
  code: { label: "Staff Code of Conduct", short: "Code", kicker: "Step 3", blurb: "Our standards, how we communicate and how we solve problems." },
  role: { label: "Your role", short: "Role", kicker: "Step 4", blurb: "Training specific to your role." },
};
const ACK_TEXT = [
  "I acknowledge that I have read, understood and agree to uphold the standards, communication protocol and expectations outlined in the Life Is Good Staff Code of Conduct & Communication Protocol, including the Compulsory Uniform Policy in Appendix A.",
  "I understand that this Code exists to create clarity, protect our culture and support the wellbeing of every client and team member. I understand that I am expected to raise concerns honestly and transparently, and that breaches of this Code may result in disciplinary action, up to and including termination of employment.",
];
const FRIENDLY = {
  not_signed_in: "Please sign in again.",
  not_active: "Your account isn't active yet. Ask the Shop Manager to approve it.",
  locked: "Finish the earlier modules first.",
  unknown_section: "That module doesn't exist.",
  not_started: "Open the module before answering the questions.",
  incomplete: "Complete every Code module before signing.",
  unknown_item: "That checklist item isn't available.",
  unknown_document: "That document isn't available.",
  tee_already_received: "Your tee has already been handed over — ask the Shop Manager to change the size.",
  invalid_signature: "Please draw your signature again.",
  name_required: "Please enter your full name.",
  not_admin: "Only managers can do that.",
  cannot_change_self: "You can't change your own access.",
  bad_version: "Enter a new version number (different from the current one).",
  "Invalid login credentials": "Email or password is incorrect.",
  "User already registered": "There's already an account with this email — sign in instead.",
};
const friendly = (e) => {
  const msg = e?.message || String(e);
  const key = Object.keys(FRIENDLY).find((k) => msg.includes(k));
  return key ? FRIENDLY[key] : msg;
};

// ---------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------
const app = document.getElementById("app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "");
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "");
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;
const go = (hash) => { if (location.hash === "#" + hash || (!hash && !location.hash)) route(); else location.hash = hash; };
let toastTimer;
function toast(msg, bad = false) {
  document.querySelector(".toast")?.remove();
  const t = document.createElement("div");
  t.className = "toast" + (bad ? " bad" : "");
  t.textContent = msg;
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 3800);
}
const loading = () => { app.innerHTML = `<div class="loading"><div class="spinner"></div>Loading…</div>`; };

// ---------------------------------------------------------------------
//  App state
// ---------------------------------------------------------------------
let api = null;
let session = null;
let state = null;
let cleanup = null;
const params = new URLSearchParams(location.search);
const DEMO = params.has("demo");

async function refresh() {
  state = session ? await api.getMyState() : null;
}

async function boot() {
  try {
    if (DEMO) {
      const m = await import("./demo-api.js");
      api = await m.createDemoApi({ fast: params.has("fast") });
    } else if (!config.supabaseUrl || !config.supabaseAnonKey) {
      return viewSetup();
    } else {
      const m = await import("./api.js");
      api = m.createLiveApi(config);
    }
    session = await api.getSession();
    await refresh();
    window.addEventListener("hashchange", route);
    api.onAuthChange(async (s) => {
      const changed = !!s !== !!session || s?.user?.id !== session?.user?.id;
      session = s;
      if (changed) { await refresh(); route(); }
    });
    route();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="wrap"><div class="card"><h2>Something went wrong</h2><p class="muted">${esc(friendly(e))}</p><button class="btn" onclick="location.reload()">Try again</button></div></div>`;
  }
}

async function route() {
  if (cleanup) { cleanup(); cleanup = null; }
  window.scrollTo(0, 0);
  const parts = location.hash.replace(/^#\/?/, "").split("/");
  try {
    if (!session) return viewAuth();
    await refresh(); // always fresh: a manager may have confirmed items or changed details meanwhile
    if (!state.profile) return viewProfileForm();
    if (state.profile.status === "pending") return viewPending();
    if (state.profile.status === "inactive") return viewInactive();
    switch (parts[0]) {
      case "m": return await viewModule(parts[1]);
      case "sign": return viewSign();
      case "certificate": return await viewCertificate();
      case "admin":
        if (!state.profile.is_admin) return go("");
        return parts[1] === "u" ? await viewAdminUser(parts[2]) : await viewAdmin();
      default: return viewHome();
    }
  } catch (e) {
    console.error(e);
    shell(`<div class="card"><h2>Couldn't load this page</h2><p class="muted">${esc(friendly(e))}</p><a class="btn" href="#">Back to my onboarding</a></div>`);
  }
}

// ---------------------------------------------------------------------
//  Layout
// ---------------------------------------------------------------------
function shell(inner, { wide = false } = {}) {
  const p = state?.profile;
  app.innerHTML = `
    ${DEMO ? `<div class="demo-banner">Demo mode — nothing is saved online. <button data-reset-demo>Reset demo</button></div>` : ""}
    <header class="topbar">
      <a class="brand" href="#" aria-label="Life's Good Barber Centre — home"><img src="assets/logo-word-light.png" alt="Life's Good Barber Centre"></a>
      <nav class="menu">
        ${p ? `<span class="who">${esc(p.full_name)}</span>` : ""}
        ${p?.is_admin ? `<a href="#/admin">Team</a>` : ""}
        <button data-signout>Sign out</button>
      </nav>
    </header>
    <main class="wrap ${wide ? "wide" : ""}">${inner}
      <div class="foot"><span class="serif">Life is Good.</span><small>Cannon Hill · Coorparoo · Team only</small></div>
    </main>`;
  app.querySelector("[data-signout]").onclick = async () => { await api.signOut(); session = null; state = null; location.hash = ""; route(); };
  app.querySelector("[data-reset-demo]")?.addEventListener("click", () => { api.reset(); location.hash = ""; location.reload(); });
}

function viewSetup() {
  app.innerHTML = `
    <div class="auth"><div class="auth-photo" style="background-image:url(assets/photo-ceiling.jpg)"></div>
      <div class="auth-side"><div class="auth-inner"><div class="card stack">
        <h2>Almost ready</h2>
        <p>This portal isn't connected to its database yet. Add the Supabase URL and anon key to <code>js/config.js</code> (see <b>SETUP.md</b>).</p>
        <a class="btn gold block" href="?demo">Open the demo</a>
      </div></div></div>
    </div>`;
}

// ---------------------------------------------------------------------
//  Auth
// ---------------------------------------------------------------------
function authFace(signup) {
  return `
        <div class="card face ${signup ? "face-back" : "face-front"}" data-face="${signup ? "signup" : "signin"}">
          <div class="tabs" role="tablist"><button type="button" role="tab" data-tab="signin" aria-selected="${!signup}" class="${signup ? "" : "on"}">Sign in</button><button type="button" role="tab" data-tab="signup" aria-selected="${signup}" class="${signup ? "on" : ""}">Create account</button></div>
          <div class="err"></div>
          <form novalidate>
            ${signup ? `
              <label class="field"><span>Full name</span><input name="name" type="text" autocomplete="name" required></label>
              <div class="row2">
                <label class="field"><span>Role</span><select name="role">${ROLES.map((r) => `<option>${r}</option>`).join("")}</select></label>
                <label class="field"><span>Location</span><select name="location">${LOCATIONS.map((l) => `<option>${l}</option>`).join("")}</select></label>
              </div>
              <div class="row2">
                <label class="field"><span>Employment</span><select name="employment">${EMPLOYMENT.map((t) => `<option>${t}</option>`).join("")}</select></label>
                <label class="field"><span>Tee size</span><select name="tee">${TEE_SIZES.map((t) => `<option ${t === "M" ? "selected" : ""}>${t}</option>`).join("")}</select></label>
              </div>` : ""}
            <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required></label>
            <label class="field"><span>Password</span><span class="pw"><input name="password" type="password" autocomplete="${signup ? "new-password" : "current-password"}" minlength="8" required><button type="button" class="pw-toggle" aria-label="Show password" aria-pressed="false">${EYE_OPEN}</button></span></label>
            <button class="btn gold block" type="submit">${signup ? "Create account" : "Sign in"}</button>
          </form>
          <p class="small muted center" style="margin:14px 0 0">${signup
            ? "Your account will be approved by the Shop Manager before you can start."
            : "Forgot your password? Ask the Shop Manager to reset your access."}</p>
        </div>`;
}

function viewAuth(tab = "signin") {
  app.innerHTML = `
    ${DEMO ? `<div class="demo-banner">Demo mode — create an account with any email to try it.</div>` : ""}
    <div class="auth">
      <div class="auth-photo" style="background-image:url(assets/photo-ceiling.jpg)">
        <div class="quote"><p>“Behind every clean cut is a team that cares.”</p><span>Every client · Every day</span></div>
      </div>
      <div class="auth-side"><div class="auth-inner">
        <div class="auth-brand">
          <img src="assets/logo-mark-light.png" alt="Life's Good Barber Centre">
          <p>Team Portal · Onboarding</p>
        </div>
        <div class="flip"><div class="flip-inner">${authFace(false)}${authFace(true)}</div></div>
      </div></div>
    </div>`;

  const inner = app.querySelector(".flip-inner");
  const faces = { signin: inner.querySelector('[data-face="signin"]'), signup: inner.querySelector('[data-face="signup"]') };
  let current = tab === "signup" ? "signup" : "signin";

  const settle = () => {
    // Only the visible side stays in the layout and in the tab order.
    for (const [name, el] of Object.entries(faces)) {
      const active = name === current;
      el.hidden = !active;
      el.inert = !active;
      el.setAttribute("aria-hidden", String(!active));
    }
    inner.classList.remove("animating");
    inner.style.height = "";
  };

  const flipTo = (target) => {
    if (target === current && !inner.classList.contains("animating")) return;
    const from = faces[current], to = faces[target];
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Carry over what was already typed.
    const fromEmail = from.querySelector("input[name=email]").value, toEmail = to.querySelector("input[name=email]");
    if (fromEmail && !toEmail.value) toEmail.value = fromEmail;
    current = target;
    if (reduce) {
      inner.classList.toggle("flipped", target === "signup");
      settle();
      to.classList.remove("fade-in");
      void to.offsetWidth;
      to.classList.add("fade-in");
      to.querySelector(`[data-tab="${target}"]`).focus({ preventScroll: true });
      return;
    }
    const h0 = inner.offsetHeight;
    faces.signin.hidden = faces.signup.hidden = false;
    const h1 = to.offsetHeight;
    inner.style.height = h0 + "px";
    inner.classList.add("animating");
    void inner.offsetHeight; // commit the starting height before animating
    inner.style.height = h1 + "px";
    inner.classList.toggle("flipped", target === "signup");
    to.inert = false;
    to.setAttribute("aria-hidden", "false");
    from.inert = true;
    from.setAttribute("aria-hidden", "true");
    to.querySelector(`[data-tab="${target}"]`).focus({ preventScroll: true });
  };

  inner.addEventListener("transitionend", (e) => {
    if (e.target === inner && e.propertyName === "transform") settle();
  });
  inner.classList.toggle("flipped", current === "signup");
  settle();

  for (const [name, face] of Object.entries(faces)) wireAuthForm(face, name === "signup");
  inner.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => flipTo(b.dataset.tab)));
}

function wireAuthForm(face, signup) {
  const form = face.querySelector("form");
  const err = face.querySelector(".err");
  const pwToggle = form.querySelector(".pw-toggle");
  pwToggle.onclick = (e) => {
    e.preventDefault();
    const input = form.querySelector("input[name=password]");
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    pwToggle.setAttribute("aria-pressed", String(show));
    pwToggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
    pwToggle.innerHTML = show ? EYE_CLOSED : EYE_OPEN;
    input.focus();
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    err.innerHTML = "";
    if (signup && (f.name || "").trim().length < 2) return (err.innerHTML = `<div class="form-error">Please enter your full name.</div>`);
    if (!/^\S+@\S+\.\S+$/.test(f.email || "")) return (err.innerHTML = `<div class="form-error">Please enter a valid email.</div>`);
    if ((f.password || "").length < 8) return (err.innerHTML = `<div class="form-error">Password must be at least 8 characters.</div>`);
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      if (signup) {
        const res = await api.signUp(f.email.trim(), f.password);
        if (res.needsConfirm) {
          sessionStorage.setItem("lig-pending-profile", JSON.stringify({ name: f.name.trim(), role: f.role, location: f.location, employment: f.employment, tee: f.tee }));
          err.innerHTML = `<div class="form-note">Check your email to confirm your account, then come back and sign in.</div>`;
          btn.disabled = false;
          return;
        }
        session = await api.getSession();
        await api.registerProfile(f.name.trim(), f.role, f.location, f.employment, f.tee);
      } else {
        await api.signIn(f.email.trim(), f.password);
        session = await api.getSession();
      }
      await refresh();
      location.hash = "";
      route();
    } catch (e2) {
      err.innerHTML = `<div class="form-error">${esc(friendly(e2))}</div>`;
      btn.disabled = false;
    }
  };
}

// Signed in but no profile yet (e.g. confirmed email in another tab).
function viewProfileForm() {
  const saved = JSON.parse(sessionStorage.getItem("lig-pending-profile") || "{}");
  shell(`
    <div class="card">
      <span class="eyebrow">One more step</span>
      <h1>Tell us who you are</h1>
      <div class="err"></div>
      <form novalidate>
        <label class="field"><span>Full name</span><input name="name" type="text" value="${esc(saved.name || "")}" required></label>
        <div class="row2">
          <label class="field"><span>Role</span><select name="role">${ROLES.map((r) => `<option ${r === saved.role ? "selected" : ""}>${r}</option>`).join("")}</select></label>
          <label class="field"><span>Location</span><select name="location">${LOCATIONS.map((l) => `<option ${l === saved.location ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        </div>
        <div class="row2">
          <label class="field"><span>Employment</span><select name="employment">${EMPLOYMENT.map((t) => `<option ${t === saved.employment ? "selected" : ""}>${t}</option>`).join("")}</select></label>
          <label class="field"><span>Tee size</span><select name="tee">${TEE_SIZES.map((t) => `<option ${t === (saved.tee || "M") ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        </div>
        <button class="btn gold" type="submit">Continue</button>
      </form>
    </div>`);
  const form = app.querySelector("form");
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    if ((f.name || "").trim().length < 2) return (app.querySelector(".err").innerHTML = `<div class="form-error">Please enter your full name.</div>`);
    try {
      await api.registerProfile(f.name.trim(), f.role, f.location, f.employment, f.tee);
      sessionStorage.removeItem("lig-pending-profile");
      await refresh();
      route();
    } catch (e2) {
      app.querySelector(".err").innerHTML = `<div class="form-error">${esc(friendly(e2))}</div>`;
    }
  };
}

function viewPending() {
  shell(`
    <section class="hero center stack" style="background-image:url(assets/photo-chair.jpg)">
      <span class="eyebrow paren">Welcome to the team</span>
      <h1>Thanks, ${esc(state.profile.full_name.split(" ")[0])}</h1>
      <p class="tagline">Great cuts bring people in. The team brings them back.</p>
      <p>Your account is <b>waiting for approval</b> by the Shop Manager.</p>
      <p class="small">Once approved, your onboarding opens: your employment documents, a short safety induction, the Code of Conduct (with a few quick questions after each module and your signature at the end), and your first-week checklist.</p>
      <div class="cta" style="justify-content:center"><button class="btn gold" data-check>Check again</button></div>
    </section>`);
  app.querySelector("[data-check]").onclick = async () => { await refresh(); route(); if (state.profile.status === "pending") toast("Still waiting for approval."); };
}

function viewInactive() {
  shell(`<div class="card center stack"><div class="hexicon">✕</div><h1>Access paused</h1><p>Your access to the portal is currently disabled. Please speak with the Shop Manager.</p></div>`);
}

// ---------------------------------------------------------------------
//  Home
// ---------------------------------------------------------------------
function moduleRows(list, { signRow = false } = {}) {
  const rows = list.map((s, i) => {
    const locked = i > 0 && list.slice(0, i).some((x) => !x.completed_at);
    const cls = s.completed_at ? "done" : locked ? "locked" : "current";
    const chip = s.completed_at ? `<span class="chip ok">Done</span>` : locked ? `<span class="chip">Locked</span>` : `<span class="chip go">${s.started_at ? "Continue" : "Start"}</span>`;
    const inner = `<span class="num">${s.completed_at ? "✓" : i + 1}</span>
      <span class="txt"><span class="k">${esc(s.kicker)}</span><div class="t">${esc(s.title)}</div><div class="s">${esc(s.summary || "")}</div></span>${chip}`;
    return locked ? `<li class="module locked" data-locked>${inner}</li>` : `<li><a class="module ${cls}" href="#/m/${esc(s.id)}">${inner}</a></li>`;
  });
  if (signRow) {
    const allDone = list.length > 0 && list.every((s) => s.completed_at);
    rows.push(`<li>${allDone
      ? `<a class="module ${state.ack ? "done" : "current"}" href="${state.ack ? "#/certificate" : "#/sign"}"><span class="num">${state.ack ? "✓" : "✎"}</span><span class="txt"><span class="k">Section 10</span><div class="t">Acknowledgement &amp; Commitment</div><div class="s">${state.ack ? "Signed " + fmtDate(state.ack.signed_at) : "Sign to confirm you've read and understood the Code"}</div></span>${state.ack ? `<span class="chip ok">Signed</span>` : `<span class="chip go">Sign</span>`}</a>`
      : `<div class="module locked" data-locked><span class="num">✎</span><span class="txt"><span class="k">Section 10</span><div class="t">Acknowledgement &amp; Commitment</div><div class="s">Unlocks when every Code module is complete</div></span><span class="chip">Locked</span></div>`}</li>`);
  }
  return `<ul class="modules">${rows.join("")}</ul>`;
}

function onboardingSteps() {
  const p = state.profile;
  const secs = state.sections || [];
  const t = (k) => secs.filter((s) => s.track === k);
  const docs = state.documents || [];
  const cl = state.checklist || [];
  return [
    { key: "docs", total: docs.length, done: docs.filter((d) => d.received_at).length },
    { key: "safety", total: t("safety").length, done: t("safety").filter((s) => s.completed_at).length },
    { key: "code", total: t("code").length + 1, done: t("code").filter((s) => s.completed_at).length + (state.ack ? 1 : 0) },
    { key: "role", total: t("role").length, done: t("role").filter((s) => s.completed_at).length },
    { key: "checklist", total: cl.length, done: cl.filter((c) => c.confirmed_at).length },
    { key: "tee", total: 1, done: p.tee_received_at ? 1 : 0 },
  ];
}

function nextAction() {
  const secs = state.sections || [];
  const firstOpen = (k) => secs.find((s) => s.track === k && !s.completed_at);
  const doc = (state.documents || []).find((d) => !d.received_at);
  if (doc) return { label: "Read your documents", href: "#docs", hint: "Start with your employment documents, then work down the page." };
  for (const k of ["safety", "code"]) {
    const s = firstOpen(k);
    if (s) return { label: `${s.started_at ? "Continue" : "Start"}: ${s.title}`, href: `#/m/${s.id}` };
    if (k === "code" && !state.ack && secs.some((x) => x.track === "code")) return { label: "Sign your acknowledgement", href: "#/sign" };
  }
  const r = firstOpen("role");
  if (r) return { label: `${r.started_at ? "Continue" : "Start"}: ${r.title}`, href: `#/m/${r.id}` };
  if ((state.checklist || []).some((c) => !c.done_at)) return { label: "Your first-week checklist", href: "#checklist" };
  return null;
}

function viewHome() {
  const p = state.profile;
  const secs = state.sections || [];
  const t = (k) => secs.filter((s) => s.track === k);
  const steps = onboardingSteps();
  const total = steps.reduce((n, s) => n + s.total, 0);
  const done = steps.reduce((n, s) => n + s.done, 0);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const first = esc(p.full_name.split(" ")[0]);
  const next = nextAction();
  const waiting = (state.checklist || []).filter((c) => c.done_at && !c.confirmed_at).length;

  const tagline = pct === 100 ? "Life is Good." : pct === 0 ? "Behind every clean cut is a team that cares." : pct > 75 ? "Almost there." : "One step, one detail at a time.";
  const headline = pct === 100
    ? "Your onboarding is complete. Welcome to the team — see you in the chair."
    : next
      ? next.hint || "Work through each step below — your progress is saved automatically."
      : `Everything on your side is done${waiting ? ` — ${waiting} checklist item${waiting === 1 ? " is" : "s are"} waiting for your manager to confirm` : ""}.`;
  const cta = next
    ? `<a class="btn gold" href="${esc(next.href)}" data-jump>${esc(next.label)} →</a>`
    : state.ack ? `<a class="btn ghost" href="#/certificate">View my acknowledgement</a>` : "";

  const step = (k) => steps.find((s) => s.key === k);
  const badge = (k) => { const s = step(k); return `<span class="chip ${s.done === s.total && s.total ? "ok" : ""}">${s.done}/${s.total}</span>`; };
  const docs = state.documents || [];
  const opened = JSON.parse(sessionStorage.getItem("lig-opened-docs") || "[]");
  const cl = state.checklist || [];

  shell(`
    <section class="hero" style="background-image:url(assets/photo-reception.jpg)">
      <div class="hello">
        <div class="ring" style="--p:${pct}"><div>${pct}%</div></div>
        <div>
          <span class="eyebrow paren">Welcome, ${first}</span>
          <h1>Your onboarding</h1>
          <p class="tagline">${tagline}</p>
          <p>${headline}</p>
        </div>
      </div>
      <div class="cta">${cta}</div>
    </section>

    <div class="card" id="docs" style="margin-top:16px">
      <div class="card-head"><div><span class="eyebrow paren">Step 1</span><h2>Your documents</h2></div>${badge("docs")}</div>
      <p class="muted small intro-line">By law, every new starter receives these. Open each one, read it, then confirm.</p>
      <ul class="docs">
        ${docs.map((d) => `
          <li class="doc ${d.received_at ? "done" : ""}">
            <div class="txt"><b>${esc(d.title)}</b><span>${esc(d.description || "")}</span></div>
            <div class="acts">
              <a class="btn ghost small" href="${esc(d.url)}" target="_blank" rel="noopener" data-open="${esc(d.id)}">Open ↗</a>
              ${d.received_at
                ? `<span class="chip ok">Read ${fmtDate(d.received_at)}</span>`
                : `<button class="btn small" data-ack="${esc(d.id)}" ${opened.includes(d.id) ? "" : "disabled"} title="Open the document first">I've read it</button>`}
            </div>
          </li>`).join("") || `<li class="muted small">No documents for you right now.</li>`}
      </ul>
    </div>

    ${["safety", "code", "role"].filter((k) => t(k).length).map((k, i) => `
      <div class="card">
        <div class="card-head"><div><span class="eyebrow paren">Step ${i + 2}</span><h2>${TRACK_INFO[k].label}</h2></div>${badge(k)}</div>
        <p class="muted small intro-line">${TRACK_INFO[k].blurb}</p>
        ${moduleRows(t(k), { signRow: k === "code" })}
      </div>`).join("")}

    <div class="card" id="checklist">
      <div class="card-head"><div><span class="eyebrow paren">First week</span><h2>Your checklist</h2></div>${badge("checklist")}</div>
      <p class="muted small intro-line">Tick each item once it's done. Your Shift Leader or Shop Manager will confirm it.</p>
      <ul class="checklist">
        ${cl.map((c) => `
          <li class="${c.confirmed_at ? "confirmed" : c.done_at ? "ticked" : ""}">
            <label><input type="checkbox" data-item="${esc(c.id)}" ${c.done_at ? "checked" : ""} ${c.confirmed_at ? "disabled" : ""}>
              <span><b>${esc(c.title)}</b>${c.detail ? `<small>${esc(c.detail)}</small>` : ""}</span></label>
            <span class="chip ${c.confirmed_at ? "ok" : c.done_at ? "warn" : ""}">${c.confirmed_at ? "Confirmed" : c.done_at ? "Waiting for manager" : "To do"}</span>
          </li>`).join("")}
      </ul>
    </div>

    <div class="card" id="uniform">
      <div class="card-head"><div><span class="eyebrow paren">Uniform</span><h2>Your official tee</h2></div>${badge("tee")}</div>
      ${p.tee_received_at
        ? `<p style="margin:0">✓ Your official Life Is Good tee (size <b>${esc(p.tee_size || "—")}</b>) was handed over on ${fmtDate(p.tee_received_at)}. It's now your uniform.</p>`
        : `<p>Your official tee hasn't been handed over yet. <b>Until then, wear a plain basic tee in white, black or grey</b> — no logos or prints.</p>
           <div class="toolbar" style="margin:0"><span class="eyebrow">Your size</span>
             <select data-tee style="max-width:110px">${TEE_SIZES.map((s) => `<option ${s === p.tee_size ? "selected" : ""}>${s}</option>`).join("")}</select></div>`}
    </div>

    <p class="small muted center" style="margin-top:18px">${esc(p.role)} · ${esc(p.location)} · ${esc(p.employment_type || "Employment type not set")} · Code v${esc(state.version)}</p>`);

  app.querySelectorAll("[data-locked]").forEach((el) => (el.onclick = () => toast("Finish the earlier modules first — they unlock in order.")));
  app.querySelector("[data-jump]")?.addEventListener("click", (e) => {
    const h = e.currentTarget.getAttribute("href");
    if (h === "#docs" || h === "#checklist") { e.preventDefault(); app.querySelector(h)?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  });
  app.querySelectorAll("[data-open]").forEach((a) => a.addEventListener("click", () => {
    const list = JSON.parse(sessionStorage.getItem("lig-opened-docs") || "[]");
    if (!list.includes(a.dataset.open)) list.push(a.dataset.open);
    sessionStorage.setItem("lig-opened-docs", JSON.stringify(list));
    const btn = app.querySelector(`[data-ack="${a.dataset.open}"]`);
    if (btn) btn.disabled = false;
  }));
  app.querySelectorAll("[data-ack]").forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    const y = window.scrollY;
    try { await api.acknowledgeDocument(b.dataset.ack); await refresh(); viewHome(); window.scrollTo(0, y); toast("Thanks — recorded."); }
    catch (e) { toast(friendly(e), true); b.disabled = false; }
  }));
  app.querySelectorAll("[data-item]").forEach((cb) => (cb.onchange = async () => {
    cb.disabled = true;
    const y = window.scrollY;
    try { await api.setChecklist(cb.dataset.item, cb.checked); await refresh(); viewHome(); window.scrollTo(0, y); }
    catch (e) { toast(friendly(e), true); cb.checked = !cb.checked; cb.disabled = false; }
  }));
  app.querySelector("[data-tee]")?.addEventListener("change", async (e) => {
    try { await api.setMyTeeSize(e.target.value); await refresh(); toast(`Tee size saved: ${e.target.value}`); }
    catch (e2) { toast(friendly(e2), true); }
  });
}

// ---------------------------------------------------------------------
//  Module reader + quiz
// ---------------------------------------------------------------------
async function viewModule(id) {
  const meta = state.sections.find((s) => s.id === id);
  if (!meta) return go("");
  const secs = state.sections.filter((s) => s.track === meta.track);
  const idx = secs.indexOf(meta);
  if (secs.slice(0, idx).some((s) => !s.completed_at)) { toast("Finish the earlier modules first."); return go(""); }
  loading();
  const [{ section, questions }, clock] = await Promise.all([api.getSection(id), api.startSection(id)]);
  const isDone = !!clock.completed_at;
  const next = secs[idx + 1];
  const trackName = TRACK_INFO[meta.track]?.label || "Module";
  const nextHref = next ? `#/m/${esc(next.id)}` : meta.track === "code" ? "#/sign" : "#";
  const nextLabel = next ? `Next: module ${idx + 2} →` : meta.track === "code" ? "Sign acknowledgement →" : "Back to my onboarding →";

  shell(`
    <a class="back" href="#">← My onboarding</a>
    <div class="card">
      <span class="eyebrow paren">${esc(trackName)} · ${idx + 1} of ${secs.length}</span>
      <h1>${esc(section.title)}</h1>
      <div class="article">${section.body_html}</div>
      <div id="end-of-article"></div>
    </div>
    ${isDone
      ? `<div class="done-banner"><span>✓ You completed this module on ${fmtDate(clock.completed_at)}</span><a class="btn" href="${nextHref}">${nextLabel}</a></div>`
      : `<div class="card quiz" id="quiz">
          <div class="intro"><h2>Check your understanding</h2><span class="muted small">${questions.length} question${questions.length === 1 ? "" : "s"} · get them all right to continue</span></div>
          <form novalidate>
            ${questions.map((q, i) => `
              <fieldset class="q" data-id="${esc(q.id)}">
                <legend>${i + 1}. ${esc(q.prompt)}</legend>
                ${q.options.map((o, j) => `<label class="opt"><input type="radio" name="q${i}" value="${j}"><span>${esc(o)}</span></label>`).join("")}
              </fieldset>`).join("")}
            <ul class="gate"></ul>
            <div class="result-slot"></div>
            <button class="btn gold block" type="submit" disabled>Submit answers</button>
          </form>
        </div>`}
    ${isDone ? "" : `<div class="readbar"><div class="inner"><span class="label"></span><div class="bar"><i></i></div></div></div>`}`);

  if (isDone) return;

  // --- reading gate: minimum time (server clock) + scrolled to the end ---
  let remaining = Math.max(0, clock.min_seconds - clock.elapsed);
  const total = Math.max(1, clock.min_seconds);
  let reachedEnd = false;
  const form = app.querySelector("#quiz form");
  const submit = form.querySelector("button[type=submit]");
  const gate = form.querySelector(".gate");
  const bar = app.querySelector(".readbar");
  const fill = bar.querySelector("i");
  const label = bar.querySelector(".label");
  const fieldsets = [...form.querySelectorAll("fieldset.q")];

  const allAnswered = () => fieldsets.every((fs) => fs.querySelector("input:checked"));
  function update() {
    const timeOk = remaining <= 0;
    fill.style.width = `${Math.round(((total - remaining) / total) * 100)}%`;
    bar.classList.toggle("done", timeOk && reachedEnd);
    label.textContent = timeOk
      ? reachedEnd ? "✓ Reading complete — answer the questions" : "Scroll to the end of the module"
      : `Keep reading · ${mmss(remaining)}`;
    gate.innerHTML = `
      <li class="${timeOk ? "ok" : ""}">${timeOk ? "✓" : "○"} Minimum reading time${timeOk ? "" : ` (${mmss(remaining)} left)`}</li>
      <li class="${reachedEnd ? "ok" : ""}">${reachedEnd ? "✓" : "○"} Read to the end of the module</li>
      <li class="${allAnswered() ? "ok" : ""}">${allAnswered() ? "✓" : "○"} Answer every question</li>`;
    submit.disabled = !(timeOk && reachedEnd && allAnswered());
  }
  const timer = setInterval(() => { if (remaining > 0) { remaining--; update(); } checkEnd(); }, 1000);
  // "Read to the end" = the end of the article has been on screen (or scrolled past).
  const sentinel = app.querySelector("#end-of-article");
  const checkEnd = () => {
    if (!reachedEnd && sentinel.getBoundingClientRect().top < window.innerHeight - 40) { reachedEnd = true; update(); }
  };
  window.addEventListener("scroll", checkEnd, { passive: true });
  window.addEventListener("resize", checkEnd);
  form.addEventListener("change", (e) => {
    const fs = e.target.closest("fieldset");
    fs?.classList.remove("wrong");
    fs?.querySelector(".flag")?.remove();
    update();
  });
  cleanup = () => { clearInterval(timer); window.removeEventListener("scroll", checkEnd); window.removeEventListener("resize", checkEnd); };
  update();
  checkEnd();

  form.onsubmit = async (e) => {
    e.preventDefault();
    if (submit.disabled) return;
    const answers = {};
    fieldsets.forEach((fs) => {
      const c = fs.querySelector("input:checked");
      if (c) answers[fs.dataset.id] = Number(c.value);
    });
    submit.disabled = true;
    submit.textContent = "Checking…";
    try {
      const res = await api.submitSection(id, answers);
      const slot = form.querySelector(".result-slot");
      if (res.ok) {
        cleanup(); cleanup = null;
        bar.remove();
        fieldsets.forEach((fs) => {
          fs.classList.add("right");
          fs.querySelectorAll("input").forEach((i) => (i.disabled = true));
          const why = res.explanations?.[fs.dataset.id];
          if (why) fs.insertAdjacentHTML("beforeend", `<div class="why">✓ ${esc(why)}</div>`);
        });
        gate.remove();
        slot.innerHTML = `<div class="result ok"><span class="serif">${next ? "One step, one detail at a time." : meta.track === "safety" ? "Safety induction complete. Every client, every day." : "That's every module. Life is Good."}</span>✓ ${esc(trackName)} · module ${idx + 1} complete.</div>`;
        submit.outerHTML = `<a class="btn gold block" href="${nextHref}">${nextLabel}</a>`;
        await refresh();
      } else if (res.reason === "too_soon") {
        remaining = res.wait;
        submit.textContent = "Submit answers";
        update();
        toast(`Take a little more time with this module — ${mmss(res.wait)} to go.`);
      } else {
        const wrong = new Set(res.wrong);
        fieldsets.forEach((fs) => {
          fs.querySelector(".flag")?.remove();
          if (wrong.has(fs.dataset.id)) {
            fs.classList.add("wrong");
            fs.querySelectorAll("input").forEach((i) => (i.checked = false));
            fs.insertAdjacentHTML("beforeend", `<div class="flag">Not quite — re-read the module and try again.</div>`);
          }
        });
        slot.innerHTML = `<div class="result bad">${wrong.size} of ${fieldsets.length} answer${wrong.size === 1 ? "" : "s"} need${wrong.size === 1 ? "s" : ""} another look. Scroll up, re-read, and try again.</div>`;
        submit.textContent = "Submit answers";
        update();
        fieldsets.find((fs) => wrong.has(fs.dataset.id))?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } catch (e2) {
      toast(friendly(e2), true);
      submit.textContent = "Submit answers";
      update();
    }
  };
}

// ---------------------------------------------------------------------
//  Sign + certificate
// ---------------------------------------------------------------------
function viewSign() {
  if (state.ack) return go("/certificate");
  const codeMods = state.sections.filter((s) => s.track === "code");
  if (!codeMods.length || codeMods.some((s) => !s.completed_at)) { toast("Complete every Code module before signing."); return go(""); }
  const p = state.profile;
  shell(`
    <a class="back" href="#">← My onboarding</a>
    <div class="card">
      <span class="eyebrow paren">Section 10</span>
      <h1>Acknowledgement &amp; Commitment</h1>
      <p class="tagline">Clarity creates confidence. Confidence creates freedom.</p>
      <div class="ack-text">${ACK_TEXT.map((t) => `<p>${esc(t)}</p>`).join("")}</div>
      <form novalidate>
        <div class="meta">
          <div><small>Role</small>${esc(p.role)}</div>
          <div><small>Location</small>${esc(p.location)}</div>
          <div><small>Date</small>${fmtDate(new Date())}</div>
        </div>
        <label class="field"><span>Full name</span><input name="name" type="text" value="${esc(p.full_name)}" required></label>
        <label class="field" style="margin-bottom:6px"><span>Signature</span></label>
        <div class="sigpad"></div>
        <div style="text-align:right;margin-top:6px"><button type="button" class="btn ghost small" data-clear>Clear</button></div>
        <label class="check"><input type="checkbox" name="agree"><span>I have read and understood the Code of Conduct, including the Compulsory Uniform Policy, and I agree to uphold it.</span></label>
        <div class="err"></div>
        <button class="btn gold block" type="submit" disabled>Sign &amp; submit</button>
      </form>
      <p class="small muted" style="margin-top:12px">Your signature, name, role, location, date and time are recorded against version ${esc(state.version)} of the Code. You'll be able to save or print a copy.</p>
    </div>`);
  const form = app.querySelector("form");
  const pad = createSignaturePad(app.querySelector(".sigpad"));
  cleanup = () => pad.destroy();
  const submit = form.querySelector("button[type=submit]");
  const check = () => (submit.disabled = !(form.agree.checked && !pad.isEmpty() && form.name.value.trim().length >= 2));
  form.addEventListener("input", check);
  form.addEventListener("change", check);
  app.querySelector(".sigpad").addEventListener("change", check);
  app.querySelector("[data-clear]").onclick = () => pad.clear();
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true;
    try {
      await api.signAck(form.name.value.trim(), pad.toDataURL(), navigator.userAgent);
      await refresh();
      toast("Signed — thank you!");
      go("/certificate");
    } catch (e2) {
      form.querySelector(".err").innerHTML = `<div class="form-error">${esc(friendly(e2))}</div>`;
      check();
    }
  };
}

async function viewCertificate() {
  if (!state.ack) return go("");
  loading();
  const a = await api.getMyAck(state.version);
  if (!a) return go("");
  shell(certificateHtml(a, state.version) + `
    <div class="cta no-print" style="justify-content:center">
      <button class="btn gold" data-print>Save as PDF / Print</button>
      <a class="btn ghost" href="#">Back to my onboarding</a>
    </div>`);
  app.querySelector("[data-print]").onclick = () => window.print();
}

function certificateHtml(a, version) {
  return `
    <div class="certificate">
      <div class="head"><img src="assets/logo-mark-dark.png" alt="Life's Good Barber Centre"></div>
      <span class="eyebrow paren">Staff Code of Conduct &amp; Communication Protocol · v${esc(version)}</span>
      <h2>Acknowledgement &amp; Commitment</h2>
      ${ACK_TEXT.map((t) => `<p>${esc(t)}</p>`).join("")}
      <div class="meta">
        <div><small>Team member</small>${esc(a.full_name)}</div>
        <div><small>Role</small>${esc(a.role)}</div>
        <div><small>Location</small>${esc(a.location)}</div>
      </div>
      <div class="sig">
        <div><img src="${esc(a.signature)}" alt="Signature"><div class="small muted">Signature</div></div>
        <div><b>${fmtDateTime(a.signed_at)}</b><div class="small muted">Date &amp; time signed</div></div>
      </div>
      <p class="signoff">Life is Good.</p>
      <p class="stamp">Signed electronically in the Life Is Good Team Portal. Reference ${esc(String(a.id).slice(0, 8).toUpperCase())}. One copy is kept on the team member's file.</p>
    </div>`;
}

// ---------------------------------------------------------------------
//  Admin
// ---------------------------------------------------------------------
let adminFilter = { status: "all", location: "all", q: "" };

// Overall onboarding progress for a person (same steps the person sees).
function userProgress(u) {
  const total = u.docs_total + u.safety_total + u.code_total + 1 + u.role_total + u.checklist_total + 1;
  const done = u.docs_received + u.safety_done + u.code_done + (u.signed_at ? 1 : 0) + u.role_done + u.checklist_confirmed + (u.tee_received_at ? 1 : 0);
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}
const frac = (d, t) => `<span class="frac ${t && d === t ? "full" : ""}">${d}/${t}</span>`;

async function viewAdmin() {
  loading();
  const ov = await api.adminOverview();
  const users = ov.users.map((u) => ({ ...u, prog: userProgress(u), toConfirm: u.checklist_done - u.checklist_confirmed }));
  const active = users.filter((u) => u.status === "active");
  const complete = active.filter((u) => u.prog.pct === 100);
  const signed = active.filter((u) => u.signed_at);
  const pending = users.filter((u) => u.status === "pending");
  const toConfirm = active.filter((u) => u.toConfirm > 0);
  const tees = active.filter((u) => !u.tee_received_at);

  const statusOf = (u) =>
    u.status === "pending" ? `<span class="chip warn">Awaiting approval</span>`
    : u.status === "inactive" ? `<span class="chip bad">Inactive</span>`
    : u.prog.pct === 100 ? `<span class="chip ok">Onboarded</span>`
    : `<span class="chip go">In onboarding</span>`;

  shell(`
    <span class="eyebrow">Manager view</span>
    <h1>Team onboarding</h1>
    <p class="muted" style="margin-top:0">Code version ${esc(ov.version)}</p>

    <div class="tiles">
      <div class="tile gold"><b>${complete.length}/${active.length}</b><span>Fully onboarded</span></div>
      <div class="tile"><b>${signed.length}/${active.length}</b><span>Code signed</span></div>
      <div class="tile"><b>${toConfirm.reduce((n, u) => n + u.toConfirm, 0)}</b><span>Checklist items to confirm</span></div>
      <div class="tile"><b>${tees.length}</b><span>Tees to hand out</span></div>
      <div class="tile"><b>${pending.length}</b><span>Awaiting approval</span></div>
    </div>

    ${pending.length ? `
      <div class="card">
        <h2>Awaiting approval</h2>
        ${pending.map((u) => `
          <div class="pending-card">
            <div><b>${esc(u.full_name)}</b><div class="small muted">${esc(u.role)} · ${esc(u.location)} · ${esc(u.employment_type || "—")} · tee ${esc(u.tee_size || "—")} · ${esc(u.email || "")} · registered ${fmtDate(u.created_at)}</div></div>
            <div style="display:flex;gap:8px"><button class="btn small" data-approve="${esc(u.id)}">Approve</button><button class="btn ghost small" data-reject="${esc(u.id)}">Decline</button></div>
          </div>`).join("")}
      </div>` : ""}

    ${toConfirm.length || tees.length ? `
      <div class="two-col" style="margin-top:0;margin-bottom:16px">
        <div class="card">
          <h2>To confirm</h2>
          ${toConfirm.length ? toConfirm.map((u) => `
            <div class="pending-card"><div><b>${esc(u.full_name)}</b><div class="small muted">${u.toConfirm} checklist item${u.toConfirm === 1 ? "" : "s"} ticked, waiting for you</div></div>
            <a class="btn small" href="#/admin/u/${esc(u.id)}">Review</a></div>`).join("") : `<p class="muted">Nothing waiting.</p>`}
        </div>
        <div class="card">
          <h2>Tees to hand out</h2>
          ${tees.length ? `<table class="team"><tbody>${tees.map((u) => `<tr class="click" data-user="${esc(u.id)}"><td><b>${esc(u.full_name)}</b><div class="small muted">${esc(u.location)}</div></td><td><span class="chip">${esc(u.tee_size || "Size?")}</span></td></tr>`).join("")}</tbody></table>` : `<p class="muted">Everyone has their tee.</p>`}
        </div>
      </div>` : ""}

    <div class="card">
      <div class="toolbar">
        <div class="seg" data-seg="status">
          ${[["all", "All"], ["onboarding", "In onboarding"], ["done", "Onboarded"], ["pending", "Pending"], ["inactive", "Inactive"]]
            .map(([k, l]) => `<button data-v="${k}" class="${adminFilter.status === k ? "on" : ""}">${l}</button>`).join("")}
        </div>
        <select data-loc><option value="all">Both locations</option>${LOCATIONS.map((l) => `<option ${adminFilter.location === l ? "selected" : ""}>${l}</option>`).join("")}</select>
        <input class="grow" type="search" placeholder="Search name…" value="${esc(adminFilter.q)}" data-q>
        <button class="btn ghost small" data-csv>Export CSV</button>
      </div>
      <div style="overflow-x:auto">
        <table class="team">
          <thead><tr><th>Team member</th><th>Onboarding</th><th class="hide-sm">Docs</th><th class="hide-sm">Safety</th><th>Code</th><th class="hide-sm">Checklist</th><th class="hide-sm">Tee</th></tr></thead>
          <tbody data-team></tbody>
        </table>
      </div>
    </div>

    <div class="two-col">
      <div class="card">
        <h2>Most-missed questions</h2>
        ${ov.missed.length
          ? `<ol class="missed">${ov.missed.map((m) => `<li><b>${m.misses}×</b> ${esc(m.prompt)} <span class="small muted">· ${esc(m.section)}</span></li>`).join("")}</ol>
             <p class="small muted">Worth covering in the next team brief.</p>`
          : `<p class="muted">No wrong answers recorded yet.</p>`}
      </div>
      <div class="card">
        <h2>Publish a new Code version</h2>
        <p class="small">When the Code changes, publish a new version. <b>Everyone will need to complete the Code modules and sign again.</b> The safety induction, documents and checklist are kept. Update the content in Supabase first.</p>
        <form data-version class="toolbar" style="margin:0">
          <input name="v" type="text" placeholder="e.g. 1.1" style="max-width:120px">
          <button class="btn danger small" type="submit">Publish version</button>
        </form>
      </div>
    </div>`, { wide: true });

  const tbody = app.querySelector("tbody[data-team]");
  function paint() {
    const q = adminFilter.q.trim().toLowerCase();
    const rows = users.filter((u) => {
      if (adminFilter.location !== "all" && u.location !== adminFilter.location) return false;
      if (q && !u.full_name.toLowerCase().includes(q)) return false;
      switch (adminFilter.status) {
        case "onboarding": return u.status === "active" && u.prog.pct < 100;
        case "done": return u.status === "active" && u.prog.pct === 100;
        case "pending": return u.status === "pending";
        case "inactive": return u.status === "inactive";
        default: return true;
      }
    });
    tbody.innerHTML = rows.length ? rows.map((u) => `
      <tr class="click" data-user="${esc(u.id)}">
        <td><b>${esc(u.full_name)}</b>${u.is_admin ? ` <span class="chip warn">Admin</span>` : ""}<div class="small muted">${esc(u.role)} · ${esc(u.location)}</div><div style="margin-top:4px">${statusOf(u)}</div></td>
        <td><div class="mini ${u.prog.pct === 100 ? "full" : ""}"><div class="bar"><i style="width:${u.prog.pct}%"></i></div><span class="small">${u.prog.pct}%</span></div></td>
        <td class="hide-sm">${frac(u.docs_received, u.docs_total)}</td>
        <td class="hide-sm">${frac(u.safety_done, u.safety_total)}</td>
        <td>${frac(u.code_done, u.code_total)}${u.signed_at ? `<div><span class="chip ok">Signed</span></div>` : ""}</td>
        <td class="hide-sm">${frac(u.checklist_confirmed, u.checklist_total)}${u.toConfirm > 0 ? `<div><span class="chip warn">${u.toConfirm} to confirm</span></div>` : ""}</td>
        <td class="hide-sm">${u.tee_received_at ? `<span class="chip ok">✓ ${esc(u.tee_size || "")}</span>` : `<span class="chip">${esc(u.tee_size || "—")}</span>`}</td>
      </tr>`).join("") : `<tr><td colspan="7" class="muted center">No one matches these filters.</td></tr>`;
    tbody.querySelectorAll("[data-user]").forEach((tr) => (tr.onclick = () => go("/admin/u/" + tr.dataset.user)));
  }
  paint();
  app.querySelectorAll(".two-col [data-user]").forEach((tr) => (tr.onclick = () => go("/admin/u/" + tr.dataset.user)));

  app.querySelectorAll("[data-seg] button").forEach((b) => (b.onclick = () => {
    adminFilter.status = b.dataset.v;
    app.querySelectorAll("[data-seg] button").forEach((x) => x.classList.toggle("on", x === b));
    paint();
  }));
  app.querySelector("[data-loc]").onchange = (e) => { adminFilter.location = e.target.value; paint(); };
  app.querySelector("[data-q]").oninput = (e) => { adminFilter.q = e.target.value; paint(); };
  app.querySelectorAll("[data-approve]").forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    try { await api.adminSetStatus(b.dataset.approve, "active"); toast("Approved."); viewAdmin(); } catch (e) { toast(friendly(e), true); b.disabled = false; }
  }));
  app.querySelectorAll("[data-reject]").forEach((b) => (b.onclick = async () => {
    if (!confirm("Decline this account? They won't be able to access the portal.")) return;
    try { await api.adminSetStatus(b.dataset.reject, "inactive"); toast("Declined."); viewAdmin(); } catch (e) { toast(friendly(e), true); }
  }));
  app.querySelector("[data-csv]").onclick = () => {
    const head = ["Name", "Email", "Role", "Location", "Employment", "Status", "Onboarding %", "Documents read", "Documents total",
                  "Safety done", "Safety total", "Code done", "Code total", "Code signed at", "Checklist confirmed", "Checklist total",
                  "Tee size", "Tee handed over", "Wrong answers", "Last activity"];
    const lines = users.map((u) => [u.full_name, u.email, u.role, u.location, u.employment_type, u.status, u.prog.pct, u.docs_received, u.docs_total,
      u.safety_done, u.safety_total, u.code_done, u.code_total, u.signed_at || "", u.checklist_confirmed, u.checklist_total,
      u.tee_size, u.tee_received_at || "", u.wrong_total, u.last_activity || ""]);
    const csv = [head, ...lines].map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
    a.download = `lig-onboarding-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };
  app.querySelector("[data-version]").onsubmit = async (e) => {
    e.preventDefault();
    const v = e.target.v.value.trim();
    if (!v) return;
    if (!confirm(`Publish Code version ${v}? Every team member will have to complete the Code modules and sign again.`)) return;
    try { await api.adminBumpVersion(v); await refresh(); toast(`Version ${v} published.`); viewAdmin(); } catch (e2) { toast(friendly(e2), true); }
  };
}

async function viewAdminUser(uid) {
  loading();
  const [ov, detail] = await Promise.all([api.adminOverview(), api.adminUserDetail(uid)]);
  const u = ov.users.find((x) => x.id === uid);
  if (!u) return go("/admin");
  const prog = userProgress(u);
  const isMe = uid === state.profile.id;
  const track = (k) => detail.sections.filter((s) => s.track === k);

  shell(`
    <a class="back" href="#/admin">← Team onboarding</a>
    <section class="hero" style="background-image:url(assets/photo-chair.jpg)">
      <div class="hello">
        <div class="ring" style="--p:${prog.pct}"><div>${prog.pct}%</div></div>
        <div>
          <span class="eyebrow paren">${esc(u.role)} · ${esc(u.location)}</span>
          <h1>${esc(u.full_name)}</h1>
          <p>${esc(u.email || "")} · joined ${fmtDate(u.created_at)}</p>
        </div>
      </div>
      <div class="cta">
        ${u.status === "active"
          ? `<button class="btn ghost small" data-status="inactive" ${isMe ? "disabled" : ""}>Deactivate access</button>`
          : `<button class="btn gold small" data-status="active">${u.status === "pending" ? "Approve" : "Reactivate access"}</button>`}
        ${u.is_admin
          ? `<button class="btn ghost small" data-admin="false" ${isMe ? "disabled" : ""}>Remove manager access</button>`
          : `<button class="btn ghost small" data-admin="true">Give manager access</button>`}
      </div>
    </section>

    <div class="card" style="margin-top:16px">
      <h2>Details &amp; uniform</h2>
      <form data-member class="row3">
        <label class="field"><span>Employment</span><select name="type"><option value="">—</option>${EMPLOYMENT.map((t) => `<option ${t === u.employment_type ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        <label class="field"><span>Tee size</span><select name="tee"><option value="">—</option>${TEE_SIZES.map((t) => `<option ${t === u.tee_size ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        <label class="check" style="margin:22px 0 0"><input type="checkbox" name="received" ${u.tee_received_at ? "checked" : ""}><span>Official tee handed over${u.tee_received_at ? ` <span class="muted small">(${fmtDate(u.tee_received_at)})</span>` : ""}</span></label>
        <div><button class="btn small" type="submit">Save</button></div>
      </form>
      <p class="small muted" style="margin:6px 0 0">Employment type decides which information statements they must receive (e.g. casuals also get the Casual Employment Information Statement).</p>
    </div>

    <div class="card">
      <div class="card-head"><h2>Documents</h2>${frac(u.docs_received, u.docs_total)}</div>
      <table class="team"><tbody>${detail.documents.map((d) => `<tr><td>${esc(d.title)}</td><td style="text-align:right">${d.received_at ? `<span class="chip ok">Read ${fmtDate(d.received_at)}</span>` : `<span class="chip">Not yet</span>`}</td></tr>`).join("") || `<tr><td class="muted">Set the employment type to see the documents.</td></tr>`}</tbody></table>
    </div>

    <div class="card">
      <div class="card-head"><h2>First-week checklist</h2>${frac(u.checklist_confirmed, u.checklist_total)}</div>
      <ul class="checklist admin">
        ${detail.checklist.map((c) => `
          <li class="${c.confirmed_at ? "confirmed" : c.done_at ? "ticked" : ""}">
            <span><b>${esc(c.title)}</b><small>${c.confirmed_at ? `Confirmed ${fmtDate(c.confirmed_at)}${c.confirmed_by ? " by " + esc(c.confirmed_by) : ""}` : c.done_at ? `Ticked by ${esc(u.full_name.split(" ")[0])} ${fmtDate(c.done_at)}` : "Not done yet"}</small></span>
            ${c.confirmed_at
              ? `<button class="btn ghost small" data-confirm="${esc(c.id)}" data-v="0">Undo</button>`
              : `<button class="btn small" data-confirm="${esc(c.id)}" data-v="1">Confirm</button>`}
          </li>`).join("")}
      </ul>
    </div>

    ${["safety", "code", "role"].filter((k) => track(k).length).map((k) => `
      <div class="card">
        <div class="card-head"><h2>${TRACK_INFO[k].label}</h2>${frac(track(k).filter((s) => s.completed_at).length, track(k).length)}</div>
        <div style="overflow-x:auto"><table class="team">
          <thead><tr><th>Module</th><th>Completed</th><th>Attempts</th><th class="hide-sm">Wrong answers</th></tr></thead>
          <tbody>${track(k).map((s, i) => `
            <tr><td><span class="small muted">${i + 1}. ${esc(s.kicker)}</span><div>${esc(s.title)}</div></td>
            <td>${s.completed_at ? `<span class="chip ok">${fmtDate(s.completed_at)}</span>` : s.started_at ? `<span class="chip go">Opened</span>` : `<span class="chip">—</span>`}</td>
            <td>${s.attempts || "—"}</td><td class="hide-sm">${s.wrong_total || "—"}</td></tr>`).join("")}
          </tbody></table></div>
      </div>`).join("")}

    ${detail.ack ? certificateHtml(detail.ack, ov.version) + `<div class="cta no-print" style="justify-content:center"><button class="btn ghost" data-print>Print / save this acknowledgement</button></div>` : `<div class="card"><p class="muted" style="margin:0">Code of Conduct not signed yet for version ${esc(ov.version)}.</p></div>`}
  `);

  app.querySelector("[data-print]")?.addEventListener("click", () => window.print());
  app.querySelector("[data-status]")?.addEventListener("click", async (e) => {
    const s = e.currentTarget.dataset.status;
    if (s === "inactive" && !confirm(`Deactivate ${u.full_name}? They will no longer be able to sign in to the portal.`)) return;
    try { await api.adminSetStatus(uid, s); toast("Updated."); viewAdminUser(uid); } catch (e2) { toast(friendly(e2), true); }
  });
  app.querySelector("[data-admin]")?.addEventListener("click", async (e) => {
    const v = e.currentTarget.dataset.admin === "true";
    if (v && !confirm(`Give ${u.full_name} manager access? They'll see everyone's progress and can approve accounts.`)) return;
    try { await api.adminSetAdmin(uid, v); toast("Updated."); viewAdminUser(uid); } catch (e2) { toast(friendly(e2), true); }
  });
  app.querySelector("[data-member]").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    try { await api.adminUpdateMember(uid, f.type.value, f.tee.value, f.received.checked); toast("Saved."); viewAdminUser(uid); }
    catch (e2) { toast(friendly(e2), true); }
  };
  app.querySelectorAll("[data-confirm]").forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    const y = window.scrollY;
    try { await api.adminConfirmChecklist(uid, b.dataset.confirm, b.dataset.v === "1"); await viewAdminUser(uid); window.scrollTo(0, y); }
    catch (e) { toast(friendly(e), true); b.disabled = false; }
  }));
}

boot();
