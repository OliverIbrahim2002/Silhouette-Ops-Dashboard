/**
 * Supabase cloud sync for Silhouette Studio dashboard.
 * Loads/saves app_state rows and subscribes to realtime updates.
 */
(function (global) {
  const STATE_KEYS = {
    'sil-cdb': () => global.S?.clientDB,
    'sil-sched': () => global.S?.scheduleData,
    'sil-att': () => global.S?.attendance,
    'sil-inst': () => global.S?.instructorAssign,
    'sil-rem': () => global.S?.reminders,
    'sil-pipe': () => global.S?.pipeline,
    'sil-memb': () => global.S?.membershipLedger,
    'sil-memb-pay': () => global.S?.membershipPayments,
    'sil-acct': () => global.S?.accountSettings
  };

  const SETTERS = {
    'sil-cdb': (v) => { global.S.clientDB = v; },
    'sil-sched': (v) => { global.S.scheduleData = v; },
    'sil-att': (v) => { global.S.attendance = v; },
    'sil-inst': (v) => { global.S.instructorAssign = v; },
    'sil-rem': (v) => { global.S.reminders = v; },
    'sil-pipe': (v) => { global.S.pipeline = v; },
    'sil-memb': (v) => { global.S.membershipLedger = v; },
    'sil-memb-pay': (v) => { global.S.membershipPayments = v; },
    'sil-acct': (v) => { global.S.accountSettings = v; }
  };

  let sb = null;
  let realtimeChannel = null;
  let saveTimers = {};
  let applyingRemote = false;
  let lastPushAt = 0;
  let hooksInstalled = false;

  function cfg() {
    return global.SUPABASE_CONFIG?.url && global.SUPABASE_CONFIG?.anonKey
      ? global.SUPABASE_CONFIG
      : null;
  }

  function isConfigured() {
    return !!cfg() && typeof global.supabase !== 'undefined';
  }

  function getClient() {
    if (!isConfigured()) return null;
    if (!sb) sb = global.supabase.createClient(cfg().url, cfg().anonKey);
    return sb;
  }

  function persistLocal(key) {
    try {
      const g = STATE_KEYS[key]?.();
      if (g !== undefined) localStorage.setItem(key, JSON.stringify(g));
    } catch (e) { console.warn('local persist', key, e); }
  }

  function applyKey(key, value) {
    if (!global.S || !SETTERS[key]) return;
    SETTERS[key](value);
    persistLocal(key);
  }

  async function pushKey(key) {
    const client = getClient();
    if (!client || !global.S) return;
    const value = STATE_KEYS[key]?.();
    if (value === undefined) return;
    const user = global.S.user || 'unknown';
    const { error } = await client.from('app_state').upsert({
      key,
      value,
      updated_at: new Date().toISOString(),
      updated_by: user
    }, { onConflict: 'key' });
    if (error) {
      console.error('Supabase save failed', key, error);
      global.S.cloudErr = error.message;
      return;
    }
    global.S.cloudErr = null;
    lastPushAt = Date.now();
  }

  function scheduleCloudSave(key) {
    if (!isConfigured() || applyingRemote) return;
    persistLocal(key);
    clearTimeout(saveTimers[key]);
    saveTimers[key] = setTimeout(() => pushKey(key), 400);
  }

  function installSaveHooks() {
    if (hooksInstalled) return;
    hooksInstalled = true;
    global.saveDB = () => { persistLocal('sil-cdb'); scheduleCloudSave('sil-cdb'); };
    global.saveSched = () => { persistLocal('sil-sched'); scheduleCloudSave('sil-sched'); };
    global.saveAtt = () => { persistLocal('sil-att'); scheduleCloudSave('sil-att'); };
    global.saveInst = () => { persistLocal('sil-inst'); scheduleCloudSave('sil-inst'); };
    global.saveRem = () => { persistLocal('sil-rem'); scheduleCloudSave('sil-rem'); };
    global.savePipe = () => { persistLocal('sil-pipe'); scheduleCloudSave('sil-pipe'); };
    global.saveMemb = () => { persistLocal('sil-memb'); scheduleCloudSave('sil-memb'); };
    global.saveMembPay = () => { persistLocal('sil-memb-pay'); scheduleCloudSave('sil-memb-pay'); };
    global.saveAcct = () => { persistLocal('sil-acct'); scheduleCloudSave('sil-acct'); };
  }

  async function loadAllFromCloud() {
    const client = getClient();
    if (!client) return false;
    const { data, error } = await client.from('app_state').select('key,value,updated_at');
    if (error) {
      console.error('Supabase load failed', error);
      global.S.cloudErr = error.message;
      return false;
    }
    applyingRemote = true;
    (data || []).forEach((row) => applyKey(row.key, row.value));
    applyingRemote = false;
    global.S.cloudLoaded = true;
    return true;
  }

  async function migrateLocalToCloudIfEmpty() {
    const client = getClient();
    if (!client) return;
    const { count } = await client.from('app_state').select('*', { count: 'exact', head: true });
    if (count && count > 0) return;
    applyingRemote = true;
    for (const key of Object.keys(STATE_KEYS)) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        applyKey(key, JSON.parse(raw));
        await pushKey(key);
      } catch (e) { console.warn('migrate skip', key); }
    }
    applyingRemote = false;
    console.log('Migrated local data to Supabase');
  }

  function subscribeRealtime() {
    const client = getClient();
    if (!client || realtimeChannel) return;
    realtimeChannel = client
      .channel('app_state_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_state' }, (payload) => {
        const row = payload.new || payload.old;
        if (!row?.key || !SETTERS[row.key]) return;
        if (saveTimers[row.key]) return;
        applyingRemote = true;
        if (payload.eventType !== 'DELETE' && row.value !== undefined) {
          applyKey(row.key, row.value);
        }
        applyingRemote = false;
        if (typeof global.render === 'function') global.render();
      })
      .subscribe();
  }

  async function fetchProfile(userId) {
    const client = getClient();
    if (!client) return null;
    const { data } = await client.from('profiles').select('*').eq('id', userId).maybeSingle();
    return data;
  }

  async function signInWithUsername(username, password) {
    const client = getClient();
    if (!client) return { ok: false, error: 'Cloud not configured' };
    const un = username.trim().toLowerCase();
    const { data: prof, error: pErr } = await client
      .from('profiles')
      .select('id,username,role,instructor_name')
      .eq('username', un)
      .maybeSingle();
    if (pErr || !prof) return { ok: false, error: 'User not found in cloud. Ask admin to create your login.' };
    const email = prof.username.includes('@') ? prof.username : `${prof.username}@silhouette.studio`;
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: error.message };
    return { ok: true, session: data.session, profile: prof, email };
  }

  async function signOutCloud() {
    const client = getClient();
    if (realtimeChannel) {
      const c = getClient();
      if (c) await c.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
    if (client) await client.auth.signOut();
  }

  async function initCloud() {
    if (!isConfigured()) {
      global.S.cloudConfigured = false;
      installSaveHooks();
      return { ok: false };
    }
    global.S.cloudConfigured = true;
    installSaveHooks();
    const { data: { session } } = await getClient().auth.getSession();
    if (session) {
      const prof = await fetchProfile(session.user.id);
      if (prof) {
        global.S.role = prof.role;
        global.S.user = prof.username;
        global.S.instructorName = prof.instructor_name || null;
      }
      await loadAllFromCloud();
      subscribeRealtime();
      global.S.cloudOk = true;
      return { ok: true, session: true };
    }
    return { ok: true, session: false };
  }

  async function flushAllToCloud() {
    if (!isConfigured()) return;
    await Promise.all(Object.keys(STATE_KEYS).map((k) => pushKey(k)));
  }

  global.SilCloud = {
    isConfigured,
    initCloud,
    loadAllFromCloud,
    migrateLocalToCloudIfEmpty,
    subscribeRealtime,
    signInWithUsername,
    signOutCloud,
    fetchProfile,
    flushAllToCloud,
    scheduleCloudSave
  };
})(typeof window !== 'undefined' ? window : global);
