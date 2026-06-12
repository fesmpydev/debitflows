'use strict';

const SUPABASE_URL  = 'https://nrayngemdajgfucvkmfc.supabase.co';
const SUPABASE_ANON = 'sb_publishable_Crpr_en2mwwyMHB_003DSw_PkOkXG4X';   // ← anon/public key

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON);

const DEFAULT_SETTINGS = {
  currency: 'PYG', salary: 0,
  alert7days: true, alert3days: true, alertSameDay: true, browserNotif: false,
};

DEFAULT_SETTINGS.emailReminders = false;
DEFAULT_SETTINGS.reminderEmail = '';

const state = {
  user:     null,
  debts:    [],
  settings: { ...DEFAULT_SETTINGS },
  alertLog: [],
  isOnline: false,
  isSyncing: false,
};

const Cache = {
  KEY_PREFIX:  'df_user_',
  KEY_DEBTS:   'debts_cache',
  KEY_SETTINGS:'settings_cache',
  KEY_ALERTS:  'alerts_cache',

  key(name) {
    return `${this.KEY_PREFIX}${state.user?.id || 'anon'}_${name}`;
  },

  saveDebts()    { try { localStorage.setItem(this.key(this.KEY_DEBTS), JSON.stringify(state.debts)); } catch(_){} },
  saveSettings() { try { localStorage.setItem(this.key(this.KEY_SETTINGS), JSON.stringify(state.settings)); } catch(_){} },
  saveAlerts()   { try { localStorage.setItem(this.key(this.KEY_ALERTS), JSON.stringify(state.alertLog)); } catch(_){} },

  loadAll() {
    if (!state.user) return;
    try {
      const d = localStorage.getItem(this.key(this.KEY_DEBTS));
      const s = localStorage.getItem(this.key(this.KEY_SETTINGS));
      const a = localStorage.getItem(this.key(this.KEY_ALERTS));
      if (d) state.debts    = JSON.parse(d);
      if (s) state.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(s) };
      if (a) state.alertLog = JSON.parse(a);
    } catch(_) {}
  },

  clear(userId = null) {
    const id = userId || state.user?.id;
    if (!id) return;
    try {
      const prefix = `${this.KEY_PREFIX}${id}_`;
      localStorage.removeItem(`${prefix}${this.KEY_DEBTS}`);
      localStorage.removeItem(`${prefix}${this.KEY_SETTINGS}`);
      localStorage.removeItem(`${prefix}${this.KEY_ALERTS}`);
    } catch(_) {}
  },
};

const Auth = {
  timerId: null,
  pendingVerificationEmail: null,

  async init() {
    this.bindEvents();
    const { data } = await db.auth.getSession();
    state.user = data.session?.user ?? null;
    await this.handleAuthState();
    db.auth.onAuthStateChange(async (_event, session) => {
      state.user = session?.user ?? null;
      await this.handleAuthState();
    });
  },

  bindEvents() {
    document.getElementById('loginForm').addEventListener('submit', this.handleLogin.bind(this));
    document.getElementById('registerForm').addEventListener('submit', this.handleRegister.bind(this));
    document.getElementById('switchToRegister').addEventListener('click', () => this.switchTab('register'));
    document.getElementById('switchToLogin').addEventListener('click', () => this.switchTab('login'));
    document.querySelectorAll('.auth-tab').forEach(button => button.addEventListener('click', () => this.switchTab(button.dataset.tab)));
    document.getElementById('authSignOutBtn').addEventListener('click', this.signOut.bind(this));
    document.getElementById('signOutBtn').addEventListener('click', this.signOut.bind(this));
  },

  async handleAuthState() {
    if (!state.user && this.pendingVerificationEmail) {
      document.getElementById('verifyEmailText').textContent = this.pendingVerificationEmail;
      this.showAuthScreen('verify');
      return;
    }

    if (!state.user) {
      this.pendingVerificationEmail = null;
      this.showAuthScreen('login');
      return;
    }

    if (!state.user.email_confirmed_at) {
      document.getElementById('verifyEmailText').textContent = state.user.email;
      this.showAuthScreen('verify');
      return;
    }

    document.body.classList.add('authenticated');
    document.getElementById('signOutBtn').hidden = false;
    document.getElementById('userEmailLabel').hidden = false;
    document.getElementById('userEmailLabel').textContent = state.user.email;
    this.hideAuthScreen();
    Cache.loadAll();
    Render.all();
    await this.loadRemoteData();
  },

  showAuthScreen(panel = 'login') {
    document.body.classList.remove('authenticated');
    document.getElementById('authScreen').classList.add('active');
    document.getElementById('signOutBtn').hidden = true;
    document.getElementById('userEmailLabel').hidden = true;
    if (panel === 'verify') {
      document.querySelector('.auth-tabs').style.display = 'none';
      document.getElementById('loginForm').classList.add('auth-hidden');
      document.getElementById('registerForm').classList.add('auth-hidden');
      document.getElementById('verifyPanel').classList.remove('auth-hidden');
    } else {
      document.querySelector('.auth-tabs').style.display = 'grid';
      this.switchTab(panel);
    }
  },

  hideAuthScreen() {
    document.getElementById('authScreen').classList.remove('active');
  },

  switchTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
    document.getElementById('loginForm').classList.toggle('auth-hidden', tab !== 'login');
    document.getElementById('registerForm').classList.toggle('auth-hidden', tab !== 'register');
    document.getElementById('verifyPanel').classList.add('auth-hidden');
  },

  async handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!email || !password) {
      Toast.show('Completa email y contraseña.', 'warning');
      return;
    }
    try {
      const { data, error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw error;
      state.user = data.user;
      if (state.user && !state.user.email_confirmed_at) {
        this.pendingVerificationEmail = email;
        Toast.show('Verifica tu correo antes de acceder.', 'warning');
        await db.auth.signOut();
        return;
      }
      Toast.show('Bienvenido de nuevo.', 'success');
    } catch (err) {
      Toast.show('Email o contraseña incorrectos.', 'error');
    }
  },

  async handleRegister(event) {
    event.preventDefault();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirm = document.getElementById('registerPasswordConfirm').value;

    if (!email || !password || !confirm) {
      Toast.show('Completa todos los campos.', 'warning');
      return;
    }
    if (password !== confirm) {
      Toast.show('Las contraseñas no coinciden.', 'error');
      return;
    }
    try {
      const { error } = await db.auth.signUp({ email, password }, { options: { emailRedirectTo: window.location.origin } });
      if (error) throw error;
      document.getElementById('verifyEmailText').textContent = email;
      this.showAuthScreen('verify');
      Toast.show('Correo de verificación enviado. Revisa tu bandeja.', 'success');
    } catch (err) {
      Toast.show('No se pudo crear la cuenta. Verifica los datos.', 'error');
    }
  },

  async signOut() {
    const userId = state.user?.id;
    await db.auth.signOut();
    SupabaseDB.unsubscribeRealtime();
    state.user = null;
    this.pendingVerificationEmail = null;
    state.debts = [];
    state.settings = { ...DEFAULT_SETTINGS };
    state.alertLog = [];
    Cache.clear(userId);
    Render.all();
    this.showAuthScreen('login');
    Toast.show('Sesión cerrada.', 'success');
  },

  async loadRemoteData() {
    if (!state.user) return;
    UI.updateSyncStatus('syncing', 'Conectando…');
    try {
      const [debts, settings, alertLogs] = await Promise.all([
        SupabaseDB.fetchDebts(),
        SupabaseDB.fetchSettings(),
        SupabaseDB.fetchAlertLogs(),
      ]);
      state.debts = debts;
      state.settings = settings;
      state.alertLog = alertLogs;
      Cache.saveDebts();
      Cache.saveSettings();
      Cache.saveAlerts();
      Render.all();
      UI.updateSyncStatus('online', 'Sincronizado');
      SupabaseDB.subscribeRealtime();
      await Notifications.checkDueDebts();
      if (this.timerId) clearInterval(this.timerId);
      this.timerId = setInterval(() => Notifications.checkDueDebts(), 60 * 60 * 1000);
    } catch (err) {
      UI.updateSyncStatus('offline', 'Sin conexión — usando caché');
      Toast.show('Usando datos en caché. Verifica tu conexión.', 'warning');
    }
  },
};

const SupabaseDB = {

  _authUserId() {
    return state.user?.id || null;
  },

  async fetchDebts() {
    const uid = this._authUserId();
    const { data, error } = await db
      .from('debts')
      .select('*')
      .eq('user_id', uid)
      .order('due_day', { ascending: true });
    if (error) throw error;
    return data.map(SupabaseDB._rowToDebt);
  },

  async insertDebt(debt) {
    const { data, error } = await db
      .from('debts')
      .insert([{ ...SupabaseDB._debtToRow(debt), user_id: this._authUserId() }])
      .select()
      .single();
    if (error) throw error;
    return SupabaseDB._rowToDebt(data);
  },

  async updateDebt(debt) {
    const uid = this._authUserId();
    const { data, error } = await db
      .from('debts')
      .update(SupabaseDB._debtToRow(debt))
      .eq('id', debt.id)
      .eq('user_id', uid)
      .select()
      .single();
    if (error) throw error;
    return SupabaseDB._rowToDebt(data);
  },

  async deleteDebt(id) {
    const uid = this._authUserId();
    const { error } = await db.from('debts').delete().eq('id', id).eq('user_id', uid);
    if (error) throw error;
  },

  async togglePaid(id, currentValue) {
    const uid = this._authUserId();
    const { data, error } = await db
      .from('debts')
      .update({ paid_this_month: !currentValue })
      .eq('id', id)
      .eq('user_id', uid)
      .select()
      .single();
    if (error) throw error;
    return SupabaseDB._rowToDebt(data);
  },

  async resetMonth() {
    const uid = this._authUserId();
    const { error } = await db
      .from('debts')
      .update({ paid_this_month: false })
      .eq('recurring', true)
      .eq('user_id', uid);
    if (error) throw error;
  },

  async fetchSettings() {
    const uid = this._authUserId();
    const { data, error } = await db
      .from('settings')
      .select('*')
      .eq('user_id', uid)
      .maybeSingle();
    if (error) throw error;
    return data ? SupabaseDB._rowToSettings(data) : { ...DEFAULT_SETTINGS };
  },

  async saveSettings(settings) {
    const uid = this._authUserId();
    const { error } = await db
      .from('settings')
      .upsert({ user_id: uid, ...SupabaseDB._settingsToRow(settings) });
    if (error) throw error;
  },

  async fetchAlertLogs() {
    const uid = this._authUserId();
    const { data, error } = await db
      .from('alert_logs')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return data.map(r => ({
      key:   r.id,
      msg:   r.message,
      level: r.level,
      date:  r.created_at,
    }));
  },

  async insertAlertLog(log) {
    const uid = this._authUserId();
    const { error } = await db
      .from('alert_logs')
      .insert([{ id: log.key, user_id: uid, debt_id: log.debtId || null, message: log.msg, level: log.level }]);
    // error code 23505 = unique violation — esperado, ignorar
    if (error && error.code !== '23505') throw error;
  },

  channelRef: null,

  subscribeRealtime() {
    if (this.channelRef) return;
    const uid = this._authUserId();
    if (!uid) return;

    this.channelRef = db.channel('debtflow-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'debts', filter: `user_id=eq.${uid}` }, payload => {
        SupabaseDB._handleDebtChange(payload);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings', filter: `user_id=eq.${uid}` }, payload => {
        if (payload.new) {
          state.settings = SupabaseDB._rowToSettings(payload.new);
          Cache.saveSettings();
          Render.all();
        }
      })
      .subscribe(status => {
        state.isOnline = status === 'SUBSCRIBED';
        UI.updateSyncStatus(state.isOnline ? 'online' : 'offline',
          state.isOnline ? 'Sincronizado' : 'Sin conexión');
      });
  },

  unsubscribeRealtime() {
    if (!this.channelRef) return;
    this.channelRef.unsubscribe();
    this.channelRef = null;
  },

  _handleDebtChange(payload) {
    const { eventType, new: newRow, old: oldRow } = payload;
    if (eventType === 'INSERT') {
      const debt = SupabaseDB._rowToDebt(newRow);
      if (!state.debts.find(d => d.id === debt.id)) state.debts.push(debt);
    } else if (eventType === 'UPDATE') {
      const debt = SupabaseDB._rowToDebt(newRow);
      const idx  = state.debts.findIndex(d => d.id === debt.id);
      if (idx >= 0) state.debts[idx] = debt; else state.debts.push(debt);
    } else if (eventType === 'DELETE') {
      state.debts = state.debts.filter(d => d.id !== oldRow.id);
    }
    Cache.saveDebts();
    Render.all();
  },

  _rowToDebt(row) {
    return {
      id:            row.id,
      name:          row.name,
      amount:        parseFloat(row.amount),
      dueDay:        row.due_day,
      category:      row.category,
      priority:      row.priority,
      notes:         row.notes || '',
      recurring:     row.recurring,
      paidThisMonth: row.paid_this_month,
      createdAt:     row.created_at,
    };
  },

  _debtToRow(debt) {
    return {
      id:              debt.id || undefined,
      name:            debt.name,
      amount:          debt.amount,
      due_day:         debt.dueDay,
      category:        debt.category,
      priority:        debt.priority,
      notes:           debt.notes || '',
      recurring:       debt.recurring !== false,
      paid_this_month: debt.paidThisMonth || false,
    };
  },

  _rowToSettings(row) {
    return {
      currency:    row.currency    || 'PYG',
      salary:      parseFloat(row.salary) || 0,
      alert7days:  row.alert_7days  !== false,
      alert3days:  row.alert_3days  !== false,
      alertSameDay:row.alert_same_day !== false,
      browserNotif:row.browser_notif || false,
      emailReminders: row.email_reminders || false,
      reminderEmail:  row.reminder_email || '',
    };
  },

  _settingsToRow(s) {
    return {
      currency:      s.currency,
      salary:        s.salary,
      alert_7days:   s.alert7days,
      alert_3days:   s.alert3days,
      alert_same_day:s.alertSameDay,
      browser_notif: s.browserNotif,
      email_reminders: s.emailReminders,
      reminder_email:  s.reminderEmail,
    };
  },
};

/* ══════════════════════════════════════════════════════════════
   UTILIDADES
══════════════════════════════════════════════════════════════ */
const Utils = {
  formatCurrency(amount) {
    const map = {
      PYG:{ sym:'₲', dec:false }, USD:{ sym:'$', dec:true }, EUR:{ sym:'€', dec:true },
      MXN:{ sym:'$', dec:true },  COP:{ sym:'$', dec:false }, ARS:{ sym:'$', dec:true },
      PEN:{ sym:'S/',dec:true },  CLP:{ sym:'$', dec:false }, BRL:{ sym:'R$',dec:true },
    };
    const { sym, dec } = map[state.settings.currency] || { sym:'₲', dec:false };
    const n = dec
      ? amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
      : Math.round(amount).toLocaleString('es');
    return `${sym}${n}`;
  },

  getDaysUntilDue(day) {
    const now = new Date(); now.setHours(0,0,0,0);
    const due = new Date(now.getFullYear(), now.getMonth(), day);
    return Math.ceil((due - now) / (1000 * 60 * 60 * 24));
  },

  getStatus(debt) {
    if (debt.paidThisMonth) return 'pagado';
    const d = this.getDaysUntilDue(debt.dueDay);
    if (d < 0)  return 'vencido';
    if (d <= 7) return 'proximo';
    return 'pendiente';
  },

  categoryIcon(cat) {
    return { vivienda:'🏠', transporte:'🚗', salud:'🏥', entretenimiento:'🎬',
             educacion:'📚', servicios:'⚡', suscripciones:'📱', otros:'📦' }[cat] || '📦';
  },

  priorityBadge(p) {
    if (p === 'alta')  return '<span class="badge badge-red">Esencial</span>';
    if (p === 'media') return '<span class="badge badge-neutral">Importante</span>';
    return '<span class="badge badge-amber">Prescindible</span>';
  },

  statusBadge(s) {
    if (s === 'pagado')  return '<span class="badge badge-green">Pagado</span>';
    if (s === 'vencido') return '<span class="badge badge-red">Vencido</span>';
    if (s === 'proximo') return '<span class="badge badge-amber">Próximo</span>';
    return '<span class="badge badge-neutral">Pendiente</span>';
  },

  formatDate(d) {
    return new Intl.DateTimeFormat('es', { day:'2-digit', month:'short', year:'numeric' }).format(new Date(d));
  },

  uuid() {
    // RFC-4122 v4 UUID
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
  },
};

const Calc = {
  totalCommitted()   { return state.debts.reduce((s, d) => s + d.amount, 0); },
  paidThisMonth()    { return state.debts.filter(d => d.paidThisMonth).reduce((s, d) => s + d.amount, 0); },
  remaining()        { return state.settings.salary - this.totalCommitted(); },
  committedPercent() { return state.settings.salary ? Math.min(100, this.totalCommitted() / state.settings.salary * 100) : 0; },
  dueSoon()          { return state.debts.filter(d => !d.paidThisMonth && Utils.getDaysUntilDue(d.dueDay) >= 0 && Utils.getDaysUntilDue(d.dueDay) <= 7); },
  overdue()          { return state.debts.filter(d => !d.paidThisMonth && Utils.getDaysUntilDue(d.dueDay) < 0); },
  unnecessary()      { return state.debts.filter(d => d.priority === 'baja'); },
  potentialSavings() { return this.unnecessary().reduce((s, d) => s + d.amount, 0); },
};

const UI = {
  updateSyncStatus(state, label) {
    ['syncDot','syncDotSettings'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.className = `sync-dot ${state}`; }
    });
    ['syncLabel','syncLabelSettings'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = label;
    });
  },

  setSyncing(on) {
    state.isSyncing = on;
    if (on) this.updateSyncStatus('syncing', 'Sincronizando…');
  },

  skeletons(containerId, count = 3) {
    const c = document.getElementById(containerId);
    if (c) c.innerHTML = Array(count).fill('<div class="skeleton" style="margin-bottom:8px"></div>').join('');
  },
};

const Toast = {
  show(msg, type = 'success') {
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<span class="toast-dot"></span><span>${msg}</span>`;
    container.appendChild(el);
    setTimeout(() => {
      el.classList.add('toast-out');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    }, 3500);
  },
};

const Notifications = {
  async requestPermission() {
    if (!('Notification' in window)) { Toast.show('Tu navegador no soporta notificaciones.', 'warning'); return false; }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      state.settings.browserNotif = true;
      await SupabaseDB.saveSettings(state.settings);
      Cache.saveSettings();
      Toast.show('Notificaciones activadas ✓', 'success');
      return true;
    }
    Toast.show('Permiso de notificaciones denegado.', 'warning');
    return false;
  },

  async sendUpcomingByEmail(targetEmail) {
    if (!targetEmail) {
      Toast.show('Ingresa un correo válido.', 'error');
      return;
    }
    const due = Calc.dueSoon().concat(Calc.overdue());
    if (due.length === 0) {
      Toast.show('No hay deudas próximas para notificar.', 'info');
      return;
    }
    try {
      UI.setSyncing(true);

      const { data: { session } } = await db.auth.getSession();

      if (!session) { Toast.show('Sesión expirada. Vuelve a iniciar sesión.', 'error'); return; }
      
       const message = due
         .map(
           (d) =>
             `• ${d.name} — Día ${d.dueDay} — ${Utils.formatCurrency(d.amount)}`,
         )
         .join("\n");

      const payload = {
        username: state.user?.email ?? "usuario",
        email: targetEmail,
        subject: "DebtFlow — Recordatorio de pagos próximos",
        message,
      };

      const res = await db.functions.invoke('send_upcoming_payments', { body: payload, headers: {
        Authorization: `Bearer ${session.access_token}`
      } });

      if (res?.status === 200 || res?.error == null) {
        Toast.show('Correo enviado correctamente.', 'success');
      } else {
        Toast.show('Error al enviar el correo.', 'error');
      }
    } catch (e) {
      Toast.show('Error al enviar el correo.', 'error');
    } finally {
      UI.updateSyncStatus('online', 'Sincronizado');
    }
  },

  send(title, body, tag) {
    if (Notification.permission !== 'granted') return;
    new Notification(title, { body, tag });
  },

  async checkDueDebts() {
    const { alert7days, alert3days, alertSameDay, browserNotif } = state.settings;
    const today = new Date().toISOString().split('T')[0];

    for (const debt of state.debts) {
      if (debt.paidThisMonth) continue;
      const days = Utils.getDaysUntilDue(debt.dueDay);
      let shouldAlert = false, level = 'info', msg = '';

      if      (alertSameDay && days === 0) { shouldAlert = true; level = 'danger';  msg = `¡Hoy vence "${debt.name}"!`; }
      else if (alert3days   && days === 3) { shouldAlert = true; level = 'warning'; msg = `"${debt.name}" vence en 3 días.`; }
      else if (alert7days   && days === 7) { shouldAlert = true; level = 'warning'; msg = `"${debt.name}" vence en 7 días.`; }
      else if (days < 0)                   { shouldAlert = true; level = 'danger';  msg = `"${debt.name}" está vencida.`; }

      if (!shouldAlert) continue;

      const key = `${debt.id}_${today}_${days}`;
      try {
        await SupabaseDB.insertAlertLog({ key, debtId: debt.id, msg, level });
        // Si se insertó, refrescar logs
        state.alertLog = await SupabaseDB.fetchAlertLogs();
        Cache.saveAlerts();
        if (browserNotif) this.send('DebtFlow — Recordatorio', msg, key);
      } catch(_) {}
    }
    Render.alertsView();
    Render.notifBadge();
  },
};

const Render = {
  all() {
    this.dashboard();
    this.debtsList();
    this.alertsView();
    this.recommendationsView();
    this.settingsView();
    this.notifBadge();
  },

  dashboard() {
    const salary = state.settings.salary;
    document.getElementById('salaryDisplay').textContent   = Utils.formatCurrency(salary);
    document.getElementById('totalCommitted').textContent  = Utils.formatCurrency(Calc.totalCommitted());
    document.getElementById('salaryRemaining').textContent = Utils.formatCurrency(Calc.remaining());
    document.getElementById('paidThisMonth').textContent   = Utils.formatCurrency(Calc.paidThisMonth());

    const pct = Calc.committedPercent();
    const bar = document.getElementById('salaryProgressBar');
    bar.style.width = `${pct}%`;
    bar.className   = 'salary-progress-bar' + (pct >= 90 ? ' danger' : pct >= 70 ? ' warning' : '');
    document.getElementById('salaryProgressLabel').textContent = `${Math.round(pct)}% comprometido`;

    document.getElementById('totalDebts').textContent       = state.debts.length;
    document.getElementById('dueSoonCount').textContent     = Calc.dueSoon().length;
    document.getElementById('overdueCount').textContent     = Calc.overdue().length;
    document.getElementById('unnecessaryCount').textContent = Calc.unnecessary().length;

    const sorted = [...state.debts]
      .filter(d => !d.paidThisMonth)
      .sort((a, b) => Utils.getDaysUntilDue(a.dueDay) - Utils.getDaysUntilDue(b.dueDay))
      .slice(0, 5);

    const ul = document.getElementById('upcomingList');
    ul.innerHTML = sorted.length === 0
      ? this._emptyState('◎', 'No hay deudas pendientes.', 'openAddDebtEmpty', 'Agregar primera deuda')
      : sorted.map(d => this._debtCard(d)).join('');
  },

  debtsList() {
    const search    = (document.getElementById('debtSearch')?.value || '').toLowerCase();
    const catFilter = document.getElementById('categoryFilter')?.value || '';
    const stFilter  = document.getElementById('statusFilter')?.value  || '';

    let list = [...state.debts].sort((a, b) => a.dueDay - b.dueDay);
    if (search)    list = list.filter(d => d.name.toLowerCase().includes(search) || d.notes.toLowerCase().includes(search));
    if (catFilter) list = list.filter(d => d.category === catFilter);
    if (stFilter)  list = list.filter(d => Utils.getStatus(d) === stFilter);

    const c = document.getElementById('debtsList');
    c.innerHTML = list.length === 0
      ? this._emptyState('◎', 'Sin resultados.', 'openAddDebtDebts', 'Agregar deuda')
      : list.map(d => this._debtCard(d, true)).join('');
  },

  alertsView() {
    const t = state.settings;
    document.getElementById('browserNotifToggle').checked = t.browserNotif;
    document.getElementById('alert7Days').checked         = t.alert7days;
    document.getElementById('alert3Days').checked         = t.alert3days;
    document.getElementById('alertSameDay').checked       = t.alertSameDay;
    // Email reminder UI
    const emailToggle = document.getElementById('emailReminderToggle');
    const emailAddr   = document.getElementById('emailReminderAddress');
    if (emailToggle) emailToggle.checked = !!t.emailReminders;
    if (emailAddr)   emailAddr.value = t.reminderEmail || state.user?.email || '';

    const log = document.getElementById('alertsLog');
    log.innerHTML = state.alertLog.length === 0
      ? this._emptyState('◈', 'Sin alertas recientes.')
      : state.alertLog.map(a => `
          <div class="alert-log-item">
            <span class="alert-log-dot ${a.level}"></span>
            <span>${a.msg}</span>
            <span class="alert-log-time">${Utils.formatDate(a.date)}</span>
          </div>`).join('');
  },

  recommendationsView() {
    document.getElementById('potentialSavings').textContent = Utils.formatCurrency(Calc.potentialSavings());
    const recs = Calc.unnecessary();
    const tips = {
      entretenimiento: 'Las suscripciones de entretenimiento son prescindibles. Considera pausarlas.',
      suscripciones:   'Revisa si realmente usas esta suscripción este mes.',
      otros:           'Gasto no categorizado como esencial. Evalúa si puedes prescindir.',
      transporte:      'Analiza si puedes reducir este gasto de transporte.',
      salud:           'Considera si este gasto de salud es realmente necesario ahora.',
    };
    const c = document.getElementById('recommendationsList');
    c.innerHTML = recs.length === 0
      ? this._emptyState('◇', '¡Bien! No detectamos gastos innecesarios.')
      : recs.map(d => `
          <div class="reco-card">
            <div class="reco-card-icon icon-amber">${Utils.categoryIcon(d.category)}</div>
            <div class="reco-card-body">
              <div class="reco-card-name">${d.name}</div>
              <div class="reco-card-reason">${tips[d.category] || 'Prioridad baja. Considera cancelarlo para mejorar tu liquidez.'}</div>
              <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
                <span class="badge badge-amber">Prioridad baja</span>
                <span class="badge badge-neutral">${d.category}</span>
                <span class="badge badge-neutral">Día ${d.dueDay}</span>
              </div>
            </div>
            <div class="reco-card-amount">${Utils.formatCurrency(d.amount)}</div>
          </div>`).join('');
  },

  settingsView() {
    document.getElementById('currencySelect').value = state.settings.currency;
    document.getElementById('salaryInput').value    = state.settings.salary || '';
  },

  notifBadge() {
    const badge = document.getElementById('notifBadge');
    const count = Calc.overdue().length + Calc.dueSoon().length;
    badge.textContent = count;
    badge.hidden = count === 0;
  },

  _debtCard(debt, showActions = false) {
    const status   = Utils.getStatus(debt);
    const days     = Utils.getDaysUntilDue(debt.dueDay);
    const dueLabel = debt.paidThisMonth ? 'Pagado'
      : days < 0 ? `Venció hace ${Math.abs(days)}d`
      : days === 0 ? 'Vence hoy'
      : `Vence en ${days}d`;
    const cls = status === 'vencido' ? 'overdue' : status === 'proximo' ? 'due-soon' : status === 'pagado' ? 'paid' : '';
    const payBtn = debt.paidThisMonth
      ? `<button class="icon-btn unpay" data-id="${debt.id}" title="Marcar pendiente">↺</button>`
      : `<button class="icon-btn pay"   data-id="${debt.id}" title="Marcar pagado">✓</button>`;
    const editDel = showActions
      ? `<button class="icon-btn edit"   data-id="${debt.id}" title="Editar">✎</button>
         <button class="icon-btn delete" data-id="${debt.id}" title="Eliminar">✕</button>`
      : '';
    return `
      <div class="debt-card ${cls}" data-id="${debt.id}">
        <div class="debt-card-icon">${Utils.categoryIcon(debt.category)}</div>
        <div class="debt-card-body">
          <div class="debt-card-name">${debt.name}</div>
          <div class="debt-card-meta">
            ${Utils.statusBadge(status)}
            ${Utils.priorityBadge(debt.priority)}
            <span style="font-size:12px;color:var(--text-muted)">${dueLabel}</span>
            ${debt.notes ? `<span style="font-size:11px;color:var(--text-muted)">• ${debt.notes}</span>` : ''}
          </div>
        </div>
        <div class="debt-card-amount">${Utils.formatCurrency(debt.amount)}</div>
        <div class="debt-card-actions">${payBtn}${editDel}</div>
      </div>`;
  },

  _emptyState(icon, msg, btnId = '', btnLabel = '') {
    return `<div class="empty-state">
      <span class="empty-icon">${icon}</span><p>${msg}</p>
      ${btnId ? `<button class="btn btn-primary btn-sm" id="${btnId}">${btnLabel}</button>` : ''}
    </div>`;
  },
};

const Modal = {
  openDebt(debt = null) {
    const isEdit = !!debt;
    document.getElementById('modalTitle').textContent  = isEdit ? 'Editar Deuda' : 'Nueva Deuda';
    document.getElementById('modalSubmit').textContent = isEdit ? 'Actualizar'   : 'Guardar deuda';
    document.getElementById('debtId').value      = debt?.id    || '';
    document.getElementById('debtName').value    = debt?.name  || '';
    document.getElementById('debtAmount').value  = debt?.amount || '';
    document.getElementById('debtCategory').value= debt?.category || 'suscripciones';
    document.getElementById('debtDueDay').value  = debt?.dueDay  || '';
    document.getElementById('debtPriority').value= debt?.priority || 'media';
    document.getElementById('debtNotes').value   = debt?.notes   || '';
    document.getElementById('debtRecurring').checked = debt ? debt.recurring !== false : true;
    document.getElementById('debtModal').classList.add('active');
    document.getElementById('overlay').classList.add('active');
    document.getElementById('debtName').focus();
  },
  closeDebt() {
    document.getElementById('debtModal').classList.remove('active');
    document.getElementById('overlay').classList.remove('active');
    document.getElementById('debtForm').reset();
  },
  openSalary() {
    document.getElementById('salaryModalInput').value = state.settings.salary || '';
    document.getElementById('salaryModal').classList.add('active');
    document.getElementById('overlay').classList.add('active');
    document.getElementById('salaryModalInput').focus();
  },
  closeSalary() {
    document.getElementById('salaryModal').classList.remove('active');
    document.getElementById('overlay').classList.remove('active');
  },
  closeAll() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
    document.getElementById('overlay').classList.remove('active');
  },
};

const Debts = {
  async save(data) {
    UI.setSyncing(true);
    try {
      const isEdit = !!data.id && state.debts.find(d => d.id === data.id);
      let saved;
      if (isEdit) {
        saved = await SupabaseDB.updateDebt(data);
        const idx = state.debts.findIndex(d => d.id === saved.id);
        if (idx >= 0) state.debts[idx] = saved;
      } else {
        data.id = Utils.uuid();
        saved = await SupabaseDB.insertDebt(data);
        if (!state.debts.find(d => d.id === saved.id)) state.debts.push(saved);
      }
      Cache.saveDebts();
      Render.all();
      Toast.show(isEdit ? 'Deuda actualizada.' : 'Deuda guardada.', 'success');
    } catch (e) {
      Toast.show('Error al guardar. Verifica tu conexión.', 'error');
    } finally {
      UI.updateSyncStatus('online', 'Sincronizado');
    }
  },

  async delete(id) {
    if (!confirm('¿Eliminar esta deuda?')) return;
    UI.setSyncing(true);
    try {
      await SupabaseDB.deleteDebt(id);
      state.debts = state.debts.filter(d => d.id !== id);
      Cache.saveDebts();
      Render.all();
      Toast.show('Deuda eliminada.', 'warning');
    } catch (e) {
      Toast.show('Error al eliminar.', 'error');
    } finally {
      UI.updateSyncStatus('online', 'Sincronizado');
    }
  },

  async togglePaid(id) {
    const debt = state.debts.find(d => d.id === id);
    if (!debt) return;
    UI.setSyncing(true);
    try {
      const updated = await SupabaseDB.togglePaid(id, debt.paidThisMonth);
      const idx = state.debts.findIndex(d => d.id === id);
      if (idx >= 0) state.debts[idx] = updated;
      Cache.saveDebts();
      Render.all();
      Toast.show(updated.paidThisMonth ? `"${updated.name}" marcado como pagado.` : `"${updated.name}" marcado como pendiente.`, 'success');
    } catch (e) {
      Toast.show('Error al actualizar.', 'error');
    } finally {
      UI.updateSyncStatus('online', 'Sincronizado');
    }
  },

  async resetMonth() {
    if (!confirm('¿Iniciar nuevo mes? Todas las deudas recurrentes se marcarán como pendientes.')) return;
    UI.setSyncing(true);
    try {
      await SupabaseDB.resetMonth();
      state.debts.forEach(d => { if (d.recurring) d.paidThisMonth = false; });
      Cache.saveDebts();
      Render.all();
      Toast.show('Nuevo mes iniciado.', 'success');
    } catch (e) {
      Toast.show('Error al reiniciar mes.', 'error');
    } finally {
      UI.updateSyncStatus('online', 'Sincronizado');
    }
  },
};

const Nav = {
  go(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`view-${viewId}`)?.classList.add('active');
    document.querySelector(`[data-view="${viewId}"]`)?.classList.add('active');
    const titles = { dashboard:'Dashboard', debts:'Mis Deudas', alerts:'Alertas', recommendations:'Recomendaciones', settings:'Configuración' };
    document.getElementById('pageTitle').textContent = titles[viewId] || 'DebtFlow';
    if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('open');
  },
};

function bindEvents() {
  document.querySelectorAll('[data-view]').forEach(el =>
    el.addEventListener('click', e => { e.preventDefault(); Nav.go(el.dataset.view); })
  );

  document.getElementById('menuToggle').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
  document.getElementById('sidebarClose').addEventListener('click', () => document.getElementById('sidebar').classList.remove('open'));

  document.getElementById('openAddDebt').addEventListener('click', () => Modal.openDebt());
  document.addEventListener('click', e => {
    const id = e.target.id;
    if (id === 'openAddDebtEmpty' || id === 'openAddDebtDebts') Modal.openDebt();
  });

  document.getElementById('modalClose').addEventListener('click', Modal.closeDebt);
  document.getElementById('modalCancel').addEventListener('click', Modal.closeDebt);
  document.getElementById('overlay').addEventListener('click', Modal.closeAll);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') Modal.closeAll(); });

  document.getElementById('editSalaryBtn').addEventListener('click', Modal.openSalary);
  document.getElementById('salaryModalClose').addEventListener('click', Modal.closeSalary);
  document.getElementById('salaryModalCancel').addEventListener('click', Modal.closeSalary);
  document.getElementById('salaryModalSave').addEventListener('click', async () => {
    const val = parseFloat(document.getElementById('salaryModalInput').value);
    if (isNaN(val) || val < 0) { Toast.show('Ingresa un salario válido.', 'error'); return; }
    state.settings.salary = val;
    await SupabaseDB.saveSettings(state.settings);
    Cache.saveSettings();
    Render.all();
    Modal.closeSalary();
    Toast.show('Salario actualizado.', 'success');
  });

  document.getElementById('debtForm').addEventListener('submit', async e => {
    e.preventDefault();
    const name   = document.getElementById('debtName').value.trim();
    const amount = parseFloat(document.getElementById('debtAmount').value);
    const dueDay = parseInt(document.getElementById('debtDueDay').value);
    if (!name)                        { Toast.show('El nombre es requerido.', 'error'); return; }
    if (isNaN(amount) || amount <= 0) { Toast.show('Ingresa un monto válido.', 'error'); return; }
    if (!dueDay || dueDay < 1 || dueDay > 31) { Toast.show('Día inválido (1–31).', 'error'); return; }
    const btn = document.getElementById('modalSubmit');
    btn.disabled = true; btn.textContent = 'Guardando…';
    await Debts.save({
      id:       document.getElementById('debtId').value || null,
      name, amount, dueDay,
      category: document.getElementById('debtCategory').value,
      priority: document.getElementById('debtPriority').value,
      notes:    document.getElementById('debtNotes').value.trim(),
      recurring:document.getElementById('debtRecurring').checked,
    });
    btn.disabled = false;
    Modal.closeDebt();
  });

  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-id]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.classList.contains('pay') || btn.classList.contains('unpay')) Debts.togglePaid(id);
    if (btn.classList.contains('edit'))   { const d = state.debts.find(x => x.id === id); if (d) Modal.openDebt(d); }
    if (btn.classList.contains('delete')) Debts.delete(id);
  });

  document.getElementById('debtSearch').addEventListener('input',   () => Render.debtsList());
  document.getElementById('categoryFilter').addEventListener('change', () => Render.debtsList());
  document.getElementById('statusFilter').addEventListener('change',   () => Render.debtsList());

  document.getElementById('requestNotifPermission').addEventListener('click', async () => {
    await Notifications.requestPermission();
    Render.alertsView();
  });
  document.getElementById('saveAlertConfig').addEventListener('click', async () => {
    state.settings.browserNotif = document.getElementById('browserNotifToggle').checked;
    state.settings.alert7days   = document.getElementById('alert7Days').checked;
    state.settings.alert3days   = document.getElementById('alert3Days').checked;
    state.settings.alertSameDay = document.getElementById('alertSameDay').checked;
    state.settings.emailReminders = document.getElementById('emailReminderToggle').checked;
    state.settings.reminderEmail = document.getElementById('emailReminderAddress').value.trim();
    await SupabaseDB.saveSettings(state.settings);
    Cache.saveSettings();
    Toast.show('Configuración de alertas guardada.', 'success');
  });

  document.getElementById('emailReminderNow').addEventListener('click', async () => {
    const email = document.getElementById('emailReminderAddress').value.trim() || state.user?.email;
    await Notifications.sendUpcomingByEmail(email);
  });

  document.getElementById('currencySelect').addEventListener('change', async e => {
    state.settings.currency = e.target.value;
    await SupabaseDB.saveSettings(state.settings);
    Cache.saveSettings();
    Render.all();
    Toast.show('Moneda actualizada.', 'success');
  });

  document.getElementById('saveSalaryBtn').addEventListener('click', async () => {
    const val = parseFloat(document.getElementById('salaryInput').value);
    if (isNaN(val) || val < 0) { Toast.show('Ingresa un salario válido.', 'error'); return; }
    state.settings.salary = val;
    await SupabaseDB.saveSettings(state.settings);
    Cache.saveSettings();
    Render.all();
    Toast.show('Salario guardado.', 'success');
  });

  document.getElementById('exportDataBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ debts: state.debts, settings: state.settings }, null, 2)], { type:'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `debtflow_${new Date().toISOString().split('T')[0]}.json`;
    a.click(); URL.revokeObjectURL(url);
    Toast.show('Datos exportados.', 'success');
  });

  document.getElementById('importDataInput').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!confirm(`¿Importar ${data.debts?.length || 0} deudas? Esto reemplazará todos los datos actuales.`)) return;
        UI.setSyncing(true);
        // Clear remote debts
        for (const d of state.debts) await SupabaseDB.deleteDebt(d.id).catch(()=>{});
        // Insert imported debts
        state.debts = [];
        for (const d of (data.debts || [])) {
          d.id = Utils.uuid();
          const saved = await SupabaseDB.insertDebt(d);
          state.debts.push(saved);
        }
        if (data.settings) {
          state.settings = { ...DEFAULT_SETTINGS, ...data.settings };
          await SupabaseDB.saveSettings(state.settings);
        }
        Cache.saveDebts(); Cache.saveSettings();
        Render.all();
        UI.updateSyncStatus('online', 'Sincronizado');
        Toast.show('Datos importados correctamente.', 'success');
      } catch (_) { Toast.show('Archivo inválido.', 'error'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  document.getElementById('resetMonthBtn').addEventListener('click', Debts.resetMonth.bind(Debts));

  document.getElementById('clearDataBtn').addEventListener('click', async () => {
    if (!confirm('¿Borrar TODOS los datos en Supabase? Esta acción no se puede deshacer.')) return;
    UI.setSyncing(true);
    try {
      for (const d of state.debts) await SupabaseDB.deleteDebt(d.id).catch(()=>{});
      state.settings = { ...DEFAULT_SETTINGS };
      await SupabaseDB.saveSettings(state.settings);
      state.debts = []; state.alertLog = [];
      Cache.saveDebts(); Cache.saveSettings(); Cache.saveAlerts();
      Render.all();
      Toast.show('Todos los datos eliminados.', 'warning');
    } catch(_) { Toast.show('Error al borrar datos.', 'error'); }
    finally { UI.updateSyncStatus('online', 'Sincronizado'); }
  });

  document.getElementById('notifBtn').addEventListener('click', () => Nav.go('alerts'));
}

document.addEventListener('DOMContentLoaded', async () => {
  bindEvents();
  await Auth.init();
});