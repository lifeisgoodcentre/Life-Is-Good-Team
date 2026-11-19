// Demo API: runs entirely in this browser (localStorage), mirroring the
// server rules in supabase/schema.sql. Used with ?demo in the URL.
// Content comes from private/*.mjs, which only exists on your computer
// (it is not published to GitHub), so the demo only works locally.

const KEY = "lig-portal-demo-v2";
const err = (m) => { throw new Error(m); };
const now = () => new Date().toISOString();
const ago = (mins) => new Date(Date.now() - mins * 60000).toISOString();
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
const TRACKS = ["safety", "code", "role"];
const minSeconds = (html) => {
  const words = html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(20, Math.min(240, Math.round((words / 220) * 60 * 0.7)));
};

function fakeSignature(seed) {
  const c = document.createElement("canvas");
  c.width = 360; c.height = 120;
  const x = c.getContext("2d");
  x.fillStyle = "#fff"; x.fillRect(0, 0, 360, 120);
  x.strokeStyle = "#111"; x.lineWidth = 2.4; x.lineCap = "round";
  x.beginPath(); x.moveTo(30, 80);
  for (let i = 0; i < 14; i++) x.quadraticCurveTo(40 + i * 21, 20 + ((i * seed) % 70), 50 + i * 21, 70 + ((i * 7 + seed) % 30));
  x.stroke();
  return c.toDataURL("image/png");
}

export async function createDemoApi({ fast = false } = {}) {
  let code, onboarding;
  try {
    code = (await import("../private/content.mjs")).sections;
    onboarding = await import("../private/onboarding.mjs");
  } catch {
    err("The demo needs the private/ folder, which only exists on the computer where the portal was built.");
  }
  const sections = [...onboarding.safetySections, ...code.map((s) => ({ track: "code", ...s }))]
    .sort((a, b) => TRACKS.indexOf(a.track) - TRACKS.indexOf(b.track))
    .map((s, i) => ({
      id: s.id, ord: i + 1, track: s.track, roles: s.roles || null, kicker: s.kicker, title: s.title, summary: s.summary,
      body_html: s.body.trim(), min_seconds: fast ? 3 : s.min_seconds ?? minSeconds(s.body),
      questions: (s.questions || []).map((q, j) => ({ id: `${s.id}:${j + 1}`, ord: j + 1, prompt: q.prompt, options: q.options, correct: q.correct, explanation: q.explanation })),
    }));
  const checklist = onboarding.checklist.map((c, i) => ({ ...c, ord: i + 1, roles: c.roles || null }));
  const documents = onboarding.documents.map((d, i) => ({ ...d, ord: i + 1, employment_types: d.employment_types || null }));
  const allQuestions = sections.flatMap((s) => s.questions);

  let db; // loaded below, once the helpers it needs are defined
  function load() {
    try { const d = JSON.parse(localStorage.getItem(KEY)); if (d?.version) return d; } catch {}
    return seed();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {} }

  const forRole = (list, role) => list.filter((x) => !x.roles || x.roles.includes(role));
  const forType = (list, type) => list.filter((x) => !x.employment_types || x.employment_types.includes(type));
  const verFor = (sid) => (sections.find((s) => s.id === sid)?.track === "code" ? db.version : "base");
  const pkey = (u, s) => `${u}|${s}|${verFor(s)}`;
  db = load();

  function seed() {
    const d = { version: "1.0", auth: {}, profiles: {}, progress: {}, acks: {}, attempts: [], checklist: {}, receipts: {}, session: null };
    const team = [
      ["Marco Silva", "Barber", "Coorparoo", "active", "Full-time", "L", true, 99, 12, 4300],
      ["Aisha Rahman", "Shift Leader", "Cannon Hill", "active", "Full-time", "M", true, 99, 99, 2900],
      ["Jess Nguyen", "Receptionist", "Cannon Hill", "active", "Casual", "S", false, 7, 5, 600],
      ["Tom Becker", "Apprentice", "Coorparoo", "active", "Part-time", "M", false, 2, 2, 1500],
      ["Diego Ramos", "Barber", "Coorparoo", "active", "Casual", "XL", false, 0, 0, 0],
      ["Liam O'Connor", "Barber", "Cannon Hill", "pending", "Full-time", "L", false, 0, 0, 0],
    ];
    team.forEach(([name, role, loc, status, type, tee, teeGot, done, checks, minsAgo], n) => {
      const id = uid();
      d.auth[id] = { email: name.toLowerCase().replace(/[^a-z]+/g, ".") + "@example.com", password: "demo-password" };
      d.profiles[id] = { id, email: d.auth[id].email, full_name: name, role, location: loc, status, is_admin: false,
                         employment_type: type, tee_size: tee, tee_received_at: teeGot ? ago(minsAgo + 100) : null, created_at: ago(minsAgo + 9000) };
      const mine = forRole(sections, role);
      mine.filter((s) => s.track === "code").slice(0, done).concat(done > 0 ? mine.filter((s) => s.track === "safety") : []).forEach((s, i) => {
        d.progress[`${id}|${s.id}|${s.track === "code" ? "1.0" : "base"}`] = { started_at: ago(minsAgo + 60 - i * 3), completed_at: ago(minsAgo + 55 - i * 3), attempts: 1 + ((i + n) % 3 === 0 ? 1 : 0), wrong_total: (i + n) % 3 === 0 ? 1 : 0 };
        if ((i + n) % 3 === 0 && s.questions[0]) d.attempts.push({ uid: id, sid: s.id, ver: s.track === "code" ? "1.0" : "base", wrong: [s.questions[(i + n) % s.questions.length].id] });
      });
      if (done >= 99) d.acks[`${id}|1.0`] = { id: uid(), user_id: id, code_version: "1.0", full_name: name, role, location: loc, signature: fakeSignature(n + 3), signed_at: ago(minsAgo), user_agent: "demo" };
      forRole(checklist, role).slice(0, checks).forEach((c, i) => {
        d.checklist[`${id}|${c.id}`] = { done_at: ago(minsAgo + 30), confirmed_at: i % 4 === 3 ? null : ago(minsAgo + 20), confirmed_by: null };
      });
      if (done > 0) forType(documents, type).forEach((doc) => (d.receipts[`${id}|${doc.id}`] = ago(minsAgo + 50)));
    });
    return d;
  }

  const me = () => db.session;
  const profile = (id = me()) => db.profiles[id];
  const isActive = () => profile()?.status === "active";
  const isAdmin = () => isActive() && profile().is_admin;
  const section = (id) => sections.find((s) => s.id === id);
  const applies = (u, sid) => { const s = section(sid); return s && (!s.roles || s.roles.includes(profile(u).role)); };
  const missingBefore = (u, sid) => {
    const t = section(sid);
    return forRole(sections, profile(u).role).filter((s) => s.track === t.track && s.ord < t.ord && !db.progress[pkey(u, s.id)]?.completed_at).length;
  };
  const ackPublic = (a) => { if (!a) return null; const { signature, ...rest } = a; return rest; };
  function summary(u) {
    const p = profile(u);
    const mine = forRole(sections, p.role);
    const done = (s) => !!db.progress[pkey(u, s.id)]?.completed_at;
    const cl = forRole(checklist, p.role).map((c) => db.checklist[`${u}|${c.id}`] || {});
    const docs = forType(documents, p.employment_type);
    const t = (tr) => mine.filter((s) => s.track === tr);
    return {
      code_total: t("code").length, code_done: t("code").filter(done).length,
      safety_total: t("safety").length, safety_done: t("safety").filter(done).length,
      role_total: t("role").length, role_done: t("role").filter(done).length,
      checklist_total: cl.length, checklist_done: cl.filter((c) => c.done_at).length, checklist_confirmed: cl.filter((c) => c.confirmed_at).length,
      docs_total: docs.length, docs_received: docs.filter((d) => db.receipts[`${u}|${d.id}`]).length,
      signed_at: db.acks[`${u}|${db.version}`]?.signed_at || null,
    };
  }
  let authCb = () => {};

  return {
    mode: "demo",
    reset() { localStorage.removeItem(KEY); },

    async getSession() { return me() ? { user: { id: me() } } : null; },
    onAuthChange(cb) { authCb = cb; },
    async signIn(email, password) {
      const id = Object.keys(db.auth).find((k) => db.auth[k].email === email.toLowerCase());
      if (!id || db.auth[id].password !== password) err("Invalid login credentials");
      db.session = id; save();
    },
    async signUp(email, password) {
      if (Object.values(db.auth).some((a) => a.email === email.toLowerCase())) err("User already registered");
      const id = uid();
      db.auth[id] = { email: email.toLowerCase(), password };
      db.session = id; save();
      return { needsConfirm: false };
    },
    async signOut() { db.session = null; save(); authCb(null); },

    async registerProfile(name, role, location, employmentType, teeSize) {
      if (!me()) err("not_signed_in");
      const existing = profile();
      if (existing && existing.status !== "pending") return existing;
      const first = !Object.values(db.profiles).some((p) => p.is_admin);
      const fields = { full_name: name, role, location, employment_type: employmentType || null, tee_size: teeSize || null };
      db.profiles[me()] = existing
        ? { ...existing, ...fields }
        : { id: me(), email: db.auth[me()].email, ...fields, status: first ? "active" : "pending", is_admin: first, tee_received_at: null, created_at: now() };
      save();
      return db.profiles[me()];
    },

    async getMyState() {
      if (!me()) err("not_signed_in");
      const p = profile();
      if (!p) return { profile: null, version: db.version };
      if (p.status !== "active") return { profile: p, version: db.version };
      return {
        profile: p, version: db.version,
        sections: forRole(sections, p.role).map((s) => {
          const pr = db.progress[pkey(me(), s.id)];
          return { id: s.id, ord: s.ord, track: s.track, kicker: s.kicker, title: s.title, summary: s.summary, min_seconds: s.min_seconds,
                   question_count: s.questions.length, started_at: pr?.started_at ?? null, completed_at: pr?.completed_at ?? null, attempts: pr?.attempts ?? 0 };
        }),
        checklist: forRole(checklist, p.role).map((c) => {
          const cp = db.checklist[`${me()}|${c.id}`] || {};
          return { id: c.id, title: c.title, detail: c.detail || null, done_at: cp.done_at || null, confirmed_at: cp.confirmed_at || null };
        }),
        documents: forType(documents, p.employment_type).map((d) => ({ id: d.id, title: d.title, description: d.description, url: d.url, received_at: db.receipts[`${me()}|${d.id}`] || null })),
        ack: ackPublic(db.acks[`${me()}|${db.version}`]),
      };
    },

    async getSection(id) {
      if (!isActive()) err("not_active");
      const s = section(id);
      if (!s || !applies(me(), id)) err("unknown_section");
      return {
        section: { id: s.id, ord: s.ord, track: s.track, kicker: s.kicker, title: s.title, summary: s.summary, body_html: s.body_html, min_seconds: s.min_seconds },
        questions: s.questions.map(({ id: qid, ord, prompt, options }) => ({ id: qid, ord, prompt, options })),
      };
    },
    async startSection(id) {
      if (!isActive()) err("not_active");
      const s = section(id);
      if (!s || !applies(me(), id)) err("unknown_section");
      if (missingBefore(me(), id) > 0) err("locked");
      const k = pkey(me(), id);
      const pr = db.progress[k];
      if (!pr) db.progress[k] = { started_at: now(), completed_at: null, attempts: 0, wrong_total: 0 };
      else if (!pr.completed_at && Date.now() - Date.parse(pr.started_at) > 2 * 3600e3) pr.started_at = now();
      save();
      const p = db.progress[k];
      return { started_at: p.started_at, now: now(), min_seconds: s.min_seconds, completed_at: p.completed_at,
               elapsed: Math.floor((Date.now() - Date.parse(p.started_at)) / 1000) };
    },
    async submitSection(id, answers) {
      if (!isActive()) err("not_active");
      const s = section(id);
      if (!s || !applies(me(), id)) err("unknown_section");
      const pr = db.progress[pkey(me(), id)] || err("not_started");
      if (pr.completed_at) return { ok: true, already: true };
      if (missingBefore(me(), id) > 0) err("locked");
      const elapsed = Math.floor((Date.now() - Date.parse(pr.started_at)) / 1000);
      if (elapsed < s.min_seconds) return { ok: false, reason: "too_soon", wait: s.min_seconds - elapsed };
      const wrong = s.questions.filter((q) => String(answers?.[q.id]) !== String(q.correct)).map((q) => q.id);
      pr.attempts++; pr.wrong_total += wrong.length;
      if (!wrong.length) pr.completed_at = now();
      db.attempts.push({ uid: me(), sid: id, ver: verFor(id), wrong });
      save();
      if (wrong.length) return { ok: false, reason: "wrong", wrong };
      return { ok: true, explanations: Object.fromEntries(s.questions.map((q) => [q.id, q.explanation])) };
    },

    async signAck(name, signature, userAgent) {
      if (!isActive()) err("not_active");
      if (forRole(sections, profile().role).some((s) => s.track === "code" && !db.progress[pkey(me(), s.id)]?.completed_at)) err("incomplete");
      if ((name || "").trim().length < 2) err("name_required");
      if (!signature?.startsWith("data:image/png;base64,") || signature.length < 200) err("invalid_signature");
      const k = `${me()}|${db.version}`;
      const p = profile();
      db.acks[k] ||= { id: uid(), user_id: me(), code_version: db.version, full_name: name.trim(), role: p.role, location: p.location, signature, signed_at: now(), user_agent: userAgent };
      save();
      return ackPublic(db.acks[k]);
    },
    async getMyAck(version) { return db.acks[`${me()}|${version}`] || null; },

    async setChecklist(item, done) {
      if (!isActive()) err("not_active");
      if (!forRole(checklist, profile().role).some((c) => c.id === item)) err("unknown_item");
      const k = `${me()}|${item}`;
      const cp = db.checklist[k] || {};
      if (!cp.confirmed_at) cp.done_at = done ? cp.done_at || now() : null;
      db.checklist[k] = cp; save();
      return cp;
    },
    async acknowledgeDocument(doc) {
      if (!isActive()) err("not_active");
      if (!forType(documents, profile().employment_type).some((d) => d.id === doc)) err("unknown_document");
      db.receipts[`${me()}|${doc}`] ||= now(); save();
      return { received_at: db.receipts[`${me()}|${doc}`] };
    },
    async setMyTeeSize(size) {
      if (!isActive()) err("not_active");
      if (profile().tee_received_at) err("tee_already_received");
      profile().tee_size = size; save();
      return profile();
    },

    async adminOverview() {
      if (!isAdmin()) err("not_admin");
      const users = Object.values(db.profiles).map((p) => {
        const prs = Object.entries(db.progress).filter(([k]) => k.startsWith(p.id + "|")).map(([, v]) => v);
        const times = prs.flatMap((x) => [x.started_at, x.completed_at]).filter(Boolean).sort();
        return { ...p, attempts: prs.reduce((n, x) => n + x.attempts, 0), wrong_total: prs.reduce((n, x) => n + x.wrong_total, 0),
                 last_activity: times.at(-1) || null, ...summary(p.id) };
      }).sort((a, b) => ({ pending: 0, active: 1, inactive: 2 }[a.status] - { pending: 0, active: 1, inactive: 2 }[b.status]) || a.full_name.localeCompare(b.full_name));
      const counts = {};
      db.attempts.filter((a) => a.ver === db.version || a.ver === "base").forEach((a) => a.wrong.forEach((q) => (counts[q] = (counts[q] || 0) + 1)));
      const missed = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([qid, misses]) => {
        const q = allQuestions.find((x) => x.id === qid);
        const s = sections.find((x) => x.questions.includes(q));
        return { question_id: qid, section: s?.title, prompt: q?.prompt, misses };
      }).filter((m) => m.prompt);
      return { version: db.version, users, missed };
    },
    async adminUserDetail(id) {
      if (!isAdmin()) err("not_admin");
      const p = profile(id);
      return {
        sections: forRole(sections, p.role).map((s) => {
          const pr = db.progress[pkey(id, s.id)];
          return { id: s.id, track: s.track, kicker: s.kicker, title: s.title, started_at: pr?.started_at ?? null, completed_at: pr?.completed_at ?? null, attempts: pr?.attempts ?? 0, wrong_total: pr?.wrong_total ?? 0 };
        }),
        checklist: forRole(checklist, p.role).map((c) => {
          const cp = db.checklist[`${id}|${c.id}`] || {};
          return { id: c.id, title: c.title, detail: c.detail || null, done_at: cp.done_at || null, confirmed_at: cp.confirmed_at || null,
                   confirmed_by: cp.confirmed_by ? profile(cp.confirmed_by)?.full_name : cp.confirmed_at ? "Shop Manager" : null };
        }),
        documents: forType(documents, p.employment_type).map((d) => ({ id: d.id, title: d.title, received_at: db.receipts[`${id}|${d.id}`] || null })),
        ack: db.acks[`${id}|${db.version}`] || null,
      };
    },
    async adminSetStatus(id, status) {
      if (!isAdmin()) err("not_admin");
      if (id === me() && status !== "active") err("cannot_change_self");
      db.profiles[id].status = status; save();
    },
    async adminSetAdmin(id, value) {
      if (!isAdmin()) err("not_admin");
      if (id === me() && !value) err("cannot_change_self");
      db.profiles[id].is_admin = value; save();
    },
    async adminUpdateMember(id, type, size, received) {
      if (!isAdmin()) err("not_admin");
      const p = db.profiles[id];
      p.employment_type = type || null; p.tee_size = size || null;
      p.tee_received_at = received ? p.tee_received_at || now() : null;
      save(); return p;
    },
    async adminConfirmChecklist(id, item, confirmed) {
      if (!isAdmin()) err("not_admin");
      const k = `${id}|${item}`;
      const cp = db.checklist[k] || {};
      if (confirmed) { cp.done_at ||= now(); cp.confirmed_at ||= now(); cp.confirmed_by ||= me(); }
      else { cp.confirmed_at = null; cp.confirmed_by = null; }
      db.checklist[k] = cp; save();
    },
    async adminBumpVersion(v) {
      if (!isAdmin()) err("not_admin");
      v = (v || "").trim();
      if (!v || v === db.version) err("bad_version");
      db.version = v; save();
      return v;
    },
  };
}
