// Live API backed by Supabase. Every write goes through server functions
// (see supabase/schema.sql), so the rules can't be bypassed from the browser.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

export function createLiveApi(cfg) {
  const sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  const fail = (error) => {
    const e = new Error(error.message || String(error));
    e.code = error.code;
    throw e;
  };
  const rpc = async (fn, args) => {
    const { data, error } = await sb.rpc(fn, args);
    if (error) fail(error);
    return data;
  };
  let currentUserId = null;

  return {
    mode: "live",

    async getSession() {
      const { data } = await sb.auth.getSession();
      currentUserId = data.session?.user?.id ?? null;
      return data.session;
    },
    onAuthChange(cb) {
      sb.auth.onAuthStateChange((_event, session) => {
        currentUserId = session?.user?.id ?? null;
        cb(session);
      });
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) fail(error);
    },
    async signUp(email, password) {
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) fail(error);
      return { needsConfirm: !data.session };
    },
    async signOut() {
      await sb.auth.signOut();
    },

    registerProfile: (name, role, location, employmentType, teeSize) =>
      rpc("register_profile", { p_full_name: name, p_role: role, p_location: location,
                                p_employment_type: employmentType || null, p_tee_size: teeSize || null }),
    getMyState: () => rpc("get_my_state"),
    setChecklist: (item, done) => rpc("set_checklist", { p_item: item, p_done: done }),
    acknowledgeDocument: (doc) => rpc("acknowledge_document", { p_doc: doc }),
    setMyTeeSize: (size) => rpc("set_my_tee_size", { p_size: size }),

    async getSection(id) {
      const [s, q] = await Promise.all([
        sb.from("sections").select("id, ord, kicker, title, summary, body_html, min_seconds").eq("id", id).single(),
        sb.from("questions").select("id, ord, prompt, options").eq("section_id", id).order("ord"),
      ]);
      if (s.error) fail(s.error);
      if (q.error) fail(q.error);
      return { section: s.data, questions: q.data };
    },
    startSection: (id) => rpc("start_section", { p_section: id }),
    submitSection: (id, answers) => rpc("submit_section", { p_section: id, p_answers: answers }),

    signAck: (name, signature, userAgent) =>
      rpc("sign_acknowledgement", { p_full_name: name, p_signature: signature, p_user_agent: userAgent }),
    async getMyAck(version) {
      const { data, error } = await sb
        .from("acknowledgements").select("*")
        .eq("user_id", currentUserId).eq("code_version", version).maybeSingle();
      if (error) fail(error);
      return data;
    },

    adminOverview: () => rpc("admin_overview"),
    adminUserDetail: (uid) => rpc("admin_user_detail", { p_user: uid }),
    adminSetStatus: (uid, status) => rpc("admin_set_status", { p_user: uid, p_status: status }),
    adminSetAdmin: (uid, value) => rpc("admin_set_admin", { p_user: uid, p_value: value }),
    adminBumpVersion: (v) => rpc("admin_bump_version", { p_version: v }),
    adminUpdateMember: (uid, employmentType, teeSize, teeReceived) =>
      rpc("admin_update_member", { p_user: uid, p_employment_type: employmentType || null,
                                   p_tee_size: teeSize || null, p_tee_received: !!teeReceived }),
    adminConfirmChecklist: (uid, item, confirmed) =>
      rpc("admin_confirm_checklist", { p_user: uid, p_item: item, p_confirmed: confirmed }),
  };
}
