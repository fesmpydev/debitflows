/**
 * DebtFlow — app.js
 * Arquitectura: Módulos IIFE con estado centralizado y eventos
 * Almacenamiento: localStorage
 */

'use strict';

/* ══════════════════════════════════════════
   STATE & STORAGE
══════════════════════════════════════════ */
const STORAGE_KEYS = {
  DEBTS:    'debtflow_debts',
  SALARY:   'debtflow_salary',
  SETTINGS: 'debtflow_settings',
  ALERTS:   'debtflow_alerts',
  ALERT_LOG:'debtflow_alert_log',
};

const DEFAULT_SETTINGS = {
  currency:    'USD',
  alert7days:  true,
  alert3days:  true,
  alertSameDay:true,
  browserNotif:false,
};

const state = {
  debts:    [],
  salary:   0,
  settings: { ...DEFAULT_SETTINGS },
  alertLog: [],
};

// ── Persistence ──
const Storage = {
  load() {
    try {
      state.debts    = JSON.parse(localStorage.getItem(STORAGE_KEYS.DEBTS)    || '[]');
      state.salary   = parseFloat(localStorage.getItem(STORAGE_KEYS.SALARY)  || '0');
      state.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS) || '{}') };
      state.alertLog = JSON.parse(localStorage.getItem(STORAGE_KEYS.ALERT_LOG) || '[]');
    } catch (e) {
      console.warn('DebtFlow: error loading storage', e);
    }
  },
  saveDebts()    { localStorage.setItem(STORAGE_KEYS.DEBTS,     JSON.stringify(state.debts)); },
  saveSalary()   { localStorage.setItem(STORAGE_KEYS.SALARY,    state.salary.toString()); },
  saveSettings() { localStorage.setItem(STORAGE_KEYS.SETTINGS,  JSON.stringify(state.settings)); },
  saveAlertLog() { localStorage.setItem(STORAGE_KEYS.ALERT_LOG, JSON.stringify(state.alertLog)); },
  exportAll() {
    return JSON.stringify({ debts: state.debts, salary: state.salary, settings: state.settings }, null, 2);
  },
  importAll(jsonStr) {
    const data = JSON.parse(jsonStr);
    if (Array.isArray(data.debts)) state.debts = data.debts;
    if (typeof data.salary === 'number') state.salary = data.salary;
    if (typeof data.settings === 'object') state.settings = { ...DEFAULT_SETTINGS, ...data.settings };
    Storage.saveDebts();
    Storage.saveSalary();
    Storage.saveSettings();
  },
};

/* ══════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════ */
const Utils = {
  id: () => `d_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,

  formatCurrency(amount) {
    const symbols = { USD:'$', EUR:'€', MXN:'$', COP:'$', ARS:'$', PEN:'S/', CLP:'$', BRL:'R$' };
    const sym = symbols[state.settings.currency] || '$';
    if (state.settings.currency === 'COP' || state.settings.currency === 'CLP') {
      return `${sym}${Math.round(amount).toLocaleString('es')}`;
    }
    return `${sym}${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',')}`;
  },

  getDueDateThisMonth(day) {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), day);
    return d;
  },

  getDaysUntilDue(day) {
    const now = new Date();
    now.setHours(0,0,0,0);
    const due = this.getDueDateThisMonth(day);
    const diff = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
    return diff;
  },

  getStatus(debt) {
    if (debt.paidThisMonth) return 'pagado';
    const days = this.getDaysUntilDue(debt.dueDay);
    if (days < 0)  return 'vencido';
    if (days <= 7) return 'proximo';
    return 'pendiente';
  },

  categoryIcon(cat) {
    const map = {
      vivienda:'🏠', transporte:'🚗', salud:'🏥',
      entretenimiento:'🎬', educacion:'📚', servicios:'⚡',
      suscripciones:'📱', otros:'📦',
    };
    return map[cat] || '📦';
  },

  priorityBadge(priority) {
    if (priority === 'alta')  return '<span class="badge badge-red">Esencial</span>';
    if (priority === 'media') return '<span class="badge badge-neutral">Importante</span>';
    return '<span class="badge badge-amber">Prescindible</span>';
  },

  statusBadge(status) {
    if (status === 'pagado')   return '<span class="badge badge-green">Pagado</span>';
    if (status === 'vencido')  return '<span class="badge badge-red">Vencido</span>';
    if (status === 'proximo')  return '<span class="badge badge-amber">Próximo</span>';
    return '<span class="badge badge-neutral">Pendiente</span>';
  },

  formatDate(date) {
    return new Intl.DateTimeFormat('es', { day:'2-digit', month:'short', year:'numeric' }).format(date);
  },
};

/* ══════════════════════════════════════════
   CALCULATIONS
══════════════════════════════════════════ */
const Calc = {
  totalCommitted() {
    return state.debts.reduce((s, d) => s + d.amount, 0);
  },
  paidThisMonth() {
    return state.debts.filter(d => d.paidThisMonth).reduce((s, d) => s + d.amount, 0);
  },
  remaining() {
    return state.salary - this.totalCommitted();
  },
  remainingAfterPaid() {
    return state.salary - this.paidThisMonth();
  },
  committedPercent() {
    if (!state.salary) return 0;
    return Math.min(100, (this.totalCommitted() / state.salary) * 100);
  },
  dueSoon() {
    return state.debts.filter(d => !d.paidThisMonth && Utils.getDaysUntilDue(d.dueDay) >= 0 && Utils.getDaysUntilDue(d.dueDay) <= 7);
  },
  overdue() {
    return state.debts.filter(d => !d.paidThisMonth && Utils.getDaysUntilDue(d.dueDay) < 0);
  },
  unnecessary() {
    return state.debts.filter(d => d.priority === 'baja');
  },
  potentialSavings() {
    return this.unnecessary().reduce((s, d) => s + d.amount, 0);
  },
};

/* ══════════════════════════════════════════
   TOAST
══════════════════════════════════════════ */
const Toast = {
  show(msg, type = 'success') {
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<span class="toast-dot"></span><span>${msg}</span>`;
    container.appendChild(el);
    setTimeout(() => {
      el.classList.add('toast-out');
      el.addEventListener('animationend', () => el.remove());
    }, 3500);
  },
};

/* ══════════════════════════════════════════
   NOTIFICATIONS
══════════════════════════════════════════ */
const Notifications = {
  async requestPermission() {
    if (!('Notification' in window)) {
      Toast.show('Tu navegador no soporta notificaciones.', 'warning');
      return false;
    }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      state.settings.browserNotif = true;
      Storage.saveSettings();
      Toast.show('Notificaciones activadas ✓', 'success');
      return true;
    }
    Toast.show('Permiso de notificaciones denegado.', 'warning');
    return false;
  },

  send(title, body, tag) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    new Notification(title, { body, icon: '', tag });
  },

  checkDueDebts() {
    const { alert7days, alert3days, alertSameDay, browserNotif } = state.settings;
    const today = new Date(); today.setHours(0,0,0,0);

    state.debts.forEach(debt => {
      if (debt.paidThisMonth) return;
      const days = Utils.getDaysUntilDue(debt.dueDay);
      let shouldAlert = false;
      let level = 'info';
      let msg = '';

      if      (alertSameDay && days === 0) { shouldAlert = true; level = 'danger';  msg = `¡Hoy vence "${debt.name}"!`; }
      else if (alert3days   && days === 3) { shouldAlert = true; level = 'warning'; msg = `"${debt.name}" vence en 3 días.`; }
      else if (alert7days   && days === 7) { shouldAlert = true; level = 'warning'; msg = `"${debt.name}" vence en 7 días.`; }
      else if (days < 0)                   { shouldAlert = true; level = 'danger';  msg = `"${debt.name}" está vencida.`; }

      if (shouldAlert) {
        const key = `${debt.id}_${today.toISOString().split('T')[0]}_${days}`;
        const alreadyLogged = state.alertLog.some(l => l.key === key);
        if (!alreadyLogged) {
          state.alertLog.unshift({ key, msg, level, date: new Date().toISOString() });
          if (state.alertLog.length > 50) state.alertLog.length = 50;
          Storage.saveAlertLog();
          if (browserNotif) {
            this.send('DebtFlow — Recordatorio', msg, key);
          }
        }
      }
    });
  },
};

/* ══════════════════════════════════════════
   RENDER FUNCTIONS
══════════════════════════════════════════ */
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
    // Salary hero
    document.getElementById('salaryDisplay').textContent    = Utils.formatCurrency(state.salary);
    document.getElementById('totalCommitted').textContent   = Utils.formatCurrency(Calc.totalCommitted());
    document.getElementById('salaryRemaining').textContent  = Utils.formatCurrency(Calc.remaining());
    document.getElementById('paidThisMonth').textContent    = Utils.formatCurrency(Calc.paidThisMonth());

    // Progress bar
    const pct = Calc.committedPercent();
    const bar = document.getElementById('salaryProgressBar');
    bar.style.width = `${pct}%`;
    bar.className = 'salary-progress-bar' + (pct >= 90 ? ' danger' : pct >= 70 ? ' warning' : '');
    document.getElementById('salaryProgressLabel').textContent = `${Math.round(pct)}% comprometido`;

    // Stat cards
    document.getElementById('totalDebts').textContent    = state.debts.length;
    document.getElementById('dueSoonCount').textContent  = Calc.dueSoon().length;
    document.getElementById('overdueCount').textContent  = Calc.overdue().length;
    document.getElementById('unnecessaryCount').textContent = Calc.unnecessary().length;

    // Upcoming list (sorted by due day)
    const sorted = [...state.debts]
      .filter(d => !d.paidThisMonth)
      .sort((a, b) => Utils.getDaysUntilDue(a.dueDay) - Utils.getDaysUntilDue(b.dueDay))
      .slice(0, 5);

    const upcomingList = document.getElementById('upcomingList');
    if (sorted.length === 0) {
      upcomingList.innerHTML = this._emptyState('◎', 'No hay deudas pendientes.', 'openAddDebtEmpty', 'Agregar primera deuda');
    } else {
      upcomingList.innerHTML = sorted.map(d => this._debtCard(d)).join('');
    }
  },

  debtsList() {
    const search   = (document.getElementById('debtSearch')?.value   || '').toLowerCase();
    const catFilter= document.getElementById('categoryFilter')?.value || '';
    const stFilter = document.getElementById('statusFilter')?.value   || '';

    let list = [...state.debts].sort((a, b) => a.dueDay - b.dueDay);

    if (search)    list = list.filter(d => d.name.toLowerCase().includes(search) || (d.notes||'').toLowerCase().includes(search));
    if (catFilter) list = list.filter(d => d.category === catFilter);
    if (stFilter)  list = list.filter(d => Utils.getStatus(d) === stFilter || (stFilter === 'vencido' && Utils.getStatus(d) === 'vencido'));

    const container = document.getElementById('debtsList');
    if (list.length === 0) {
      container.innerHTML = this._emptyState('◎', 'Sin resultados.', 'openAddDebtDebts', 'Agregar deuda');
    } else {
      container.innerHTML = list.map(d => this._debtCard(d, true)).join('');
    }
  },

  alertsView() {
    // Sync toggles with settings
    const t = state.settings;
    document.getElementById('browserNotifToggle').checked = t.browserNotif;
    document.getElementById('alert7Days').checked  = t.alert7days;
    document.getElementById('alert3Days').checked  = t.alert3days;
    document.getElementById('alertSameDay').checked = t.alertSameDay;

    // Alert log
    const log = document.getElementById('alertsLog');
    if (state.alertLog.length === 0) {
      log.innerHTML = this._emptyState('◈', 'Sin alertas recientes.');
    } else {
      log.innerHTML = state.alertLog.map(a => `
        <div class="alert-log-item">
          <span class="alert-log-dot ${a.level}"></span>
          <span>${a.msg}</span>
          <span class="alert-log-time">${Utils.formatDate(new Date(a.date))}</span>
        </div>
      `).join('');
    }
  },

  recommendationsView() {
    document.getElementById('potentialSavings').textContent = Utils.formatCurrency(Calc.potentialSavings());

    const recs = Calc.unnecessary();
    const container = document.getElementById('recommendationsList');

    if (recs.length === 0) {
      container.innerHTML = this._emptyState('◇', '¡Bien! No detectamos gastos innecesarios.');
      return;
    }

    const categoryTips = {
      entretenimiento: 'Las suscripciones de entretenimiento son prescindibles. Considera pausarlas o cancelarlas.',
      suscripciones:   'Revisa si realmente usas esta suscripción este mes.',
      otros:           'Gasto no categorizado como esencial. Evalúa si puedes prescindir de él.',
      transporte:      'Analiza si puedes reducir este gasto de transporte.',
      salud:           'Considera si este gasto de salud es realmente necesario en este momento.',
    };

    container.innerHTML = recs.map(d => {
      const reason = categoryTips[d.category] || 'Este gasto tiene prioridad baja. Considera cancelarlo para mejorar tu liquidez.';
      return `
        <div class="reco-card">
          <div class="reco-card-icon icon-amber">${Utils.categoryIcon(d.category)}</div>
          <div class="reco-card-body">
            <div class="reco-card-name">${d.name}</div>
            <div class="reco-card-reason">${reason}</div>
            <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
              <span class="badge badge-amber">Prioridad baja</span>
              <span class="badge badge-neutral">${d.category}</span>
              <span class="badge badge-neutral">Día ${d.dueDay}</span>
            </div>
          </div>
          <div class="reco-card-amount">${Utils.formatCurrency(d.amount)}</div>
        </div>
      `;
    }).join('');
  },

  settingsView() {
    document.getElementById('currencySelect').value = state.settings.currency;
    document.getElementById('salaryInput').value    = state.salary || '';
  },

  notifBadge() {
    const badge = document.getElementById('notifBadge');
    const count = Calc.overdue().length + Calc.dueSoon().length;
    if (count > 0) {
      badge.textContent = count;
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  },

  // ── helpers ──
  _debtCard(debt, showActions = false) {
    const status = Utils.getStatus(debt);
    const days   = Utils.getDaysUntilDue(debt.dueDay);
    const dueLabel = debt.paidThisMonth
      ? 'Pagado'
      : days < 0
        ? `Venció hace ${Math.abs(days)} día${Math.abs(days)>1?'s':''}`
        : days === 0
          ? 'Vence hoy'
          : `Vence en ${days} día${days>1?'s':''}`;

    const cardClass = status === 'vencido' ? 'overdue' : status === 'proximo' ? 'due-soon' : status === 'pagado' ? 'paid' : '';

    const payBtn = debt.paidThisMonth
      ? `<button class="icon-btn unpay" data-id="${debt.id}" title="Marcar como no pagado">↺</button>`
      : `<button class="icon-btn pay" data-id="${debt.id}" title="Marcar como pagado">✓</button>`;

    const editDeleteBtns = showActions
      ? `<button class="icon-btn edit" data-id="${debt.id}" title="Editar">✎</button>
         <button class="icon-btn delete" data-id="${debt.id}" title="Eliminar">✕</button>`
      : '';

    return `
      <div class="debt-card ${cardClass}" data-id="${debt.id}">
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
        <div class="debt-card-actions">
          ${payBtn}
          ${editDeleteBtns}
        </div>
      </div>
    `;
  },

  _emptyState(icon, msg, btnId = '', btnLabel = '') {
    return `
      <div class="empty-state">
        <span class="empty-icon">${icon}</span>
        <p>${msg}</p>
        ${btnId ? `<button class="btn btn-primary btn-sm" id="${btnId}">${btnLabel}</button>` : ''}
      </div>
    `;
  },
};

/* ══════════════════════════════════════════
   MODAL CONTROLLER
══════════════════════════════════════════ */
const Modal = {
  openDebt(debtToEdit = null) {
    const modal  = document.getElementById('debtModal');
    const overlay= document.getElementById('overlay');
    const form   = document.getElementById('debtForm');

    document.getElementById('modalTitle').textContent  = debtToEdit ? 'Editar Deuda' : 'Nueva Deuda';
    document.getElementById('modalSubmit').textContent = debtToEdit ? 'Actualizar' : 'Guardar deuda';
    document.getElementById('debtId').value            = debtToEdit?.id || '';
    document.getElementById('debtName').value          = debtToEdit?.name || '';
    document.getElementById('debtAmount').value        = debtToEdit?.amount || '';
    document.getElementById('debtCategory').value      = debtToEdit?.category || 'suscripciones';
    document.getElementById('debtDueDay').value        = debtToEdit?.dueDay || '';
    document.getElementById('debtPriority').value      = debtToEdit?.priority || 'media';
    document.getElementById('debtNotes').value         = debtToEdit?.notes || '';
    document.getElementById('debtRecurring').checked   = debtToEdit ? debtToEdit.recurring !== false : true;

    modal.classList.add('active');
    overlay.classList.add('active');
    document.getElementById('debtName').focus();
  },

  closeDebt() {
    document.getElementById('debtModal').classList.remove('active');
    document.getElementById('overlay').classList.remove('active');
    document.getElementById('debtForm').reset();
  },

  openSalary() {
    const modal  = document.getElementById('salaryModal');
    const overlay= document.getElementById('overlay');
    document.getElementById('salaryModalInput').value = state.salary || '';
    modal.classList.add('active');
    overlay.classList.add('active');
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

/* ══════════════════════════════════════════
   DEBT CRUD
══════════════════════════════════════════ */
const Debts = {
  save(formData) {
    const existing = state.debts.find(d => d.id === formData.id);
    if (existing) {
      Object.assign(existing, formData);
    } else {
      state.debts.push({ ...formData, id: Utils.id(), paidThisMonth: false });
    }
    Storage.saveDebts();
    Render.all();
    Toast.show(existing ? 'Deuda actualizada.' : 'Deuda agregada.', 'success');
  },

  delete(id) {
    if (!confirm('¿Eliminar esta deuda?')) return;
    state.debts = state.debts.filter(d => d.id !== id);
    Storage.saveDebts();
    Render.all();
    Toast.show('Deuda eliminada.', 'warning');
  },

  togglePaid(id) {
    const debt = state.debts.find(d => d.id === id);
    if (!debt) return;
    debt.paidThisMonth = !debt.paidThisMonth;
    Storage.saveDebts();
    Render.all();
    Toast.show(debt.paidThisMonth ? `"${debt.name}" marcado como pagado.` : `"${debt.name}" marcado como pendiente.`, 'success');
  },

  resetMonth() {
    if (!confirm('¿Iniciar nuevo mes? Todas las deudas se marcarán como pendientes.')) return;
    state.debts.forEach(d => { if (d.recurring !== false) d.paidThisMonth = false; });
    Storage.saveDebts();
    Render.all();
    Toast.show('Nuevo mes iniciado. Deudas reseteadas.', 'success');
  },
};

/* ══════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════ */
const Nav = {
  currentView: 'dashboard',

  go(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const view = document.getElementById(`view-${viewId}`);
    if (view) view.classList.add('active');

    const navItem = document.querySelector(`[data-view="${viewId}"]`);
    if (navItem) navItem.classList.add('active');

    const titles = {
      dashboard:'Dashboard', debts:'Mis Deudas',
      alerts:'Alertas', recommendations:'Recomendaciones', settings:'Configuración',
    };
    document.getElementById('pageTitle').textContent = titles[viewId] || 'DebtFlow';
    this.currentView = viewId;

    // Close sidebar on mobile
    if (window.innerWidth <= 768) this.closeSidebar();
  },

  toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
  },
  closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
  },
};

/* ══════════════════════════════════════════
   EVENT BINDINGS
══════════════════════════════════════════ */
function bindEvents() {

  // Nav links
  document.querySelectorAll('[data-view]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      Nav.go(el.dataset.view);
    });
  });

  // Sidebar toggle
  document.getElementById('menuToggle').addEventListener('click', Nav.toggleSidebar.bind(Nav));
  document.getElementById('sidebarClose').addEventListener('click', Nav.closeSidebar.bind(Nav));

  // Open "new debt" modal
  document.getElementById('openAddDebt').addEventListener('click', () => Modal.openDebt());
  document.addEventListener('click', e => {
    if (e.target.id === 'openAddDebtEmpty' || e.target.id === 'openAddDebtDebts') Modal.openDebt();
  });

  // Modal close
  document.getElementById('modalClose').addEventListener('click', Modal.closeDebt);
  document.getElementById('modalCancel').addEventListener('click', Modal.closeDebt);
  document.getElementById('overlay').addEventListener('click', Modal.closeAll);

  // Salary edit
  document.getElementById('editSalaryBtn').addEventListener('click', Modal.openSalary);
  document.getElementById('salaryModalClose').addEventListener('click', Modal.closeSalary);
  document.getElementById('salaryModalCancel').addEventListener('click', Modal.closeSalary);
  document.getElementById('salaryModalSave').addEventListener('click', () => {
    const val = parseFloat(document.getElementById('salaryModalInput').value);
    if (isNaN(val) || val < 0) { Toast.show('Ingresa un salario válido.', 'error'); return; }
    state.salary = val;
    Storage.saveSalary();
    Render.all();
    Modal.closeSalary();
    Toast.show('Salario actualizado.', 'success');
  });

  // Debt form submit
  document.getElementById('debtForm').addEventListener('submit', e => {
    e.preventDefault();
    const name    = document.getElementById('debtName').value.trim();
    const amount  = parseFloat(document.getElementById('debtAmount').value);
    const dueDay  = parseInt(document.getElementById('debtDueDay').value);

    if (!name)                       { Toast.show('El nombre es requerido.', 'error'); return; }
    if (isNaN(amount) || amount <= 0){ Toast.show('Ingresa un monto válido.', 'error'); return; }
    if (!dueDay || dueDay < 1 || dueDay > 31) { Toast.show('Día de vencimiento inválido (1–31).', 'error'); return; }

    Debts.save({
      id:       document.getElementById('debtId').value || null,
      name,
      amount,
      dueDay,
      category:  document.getElementById('debtCategory').value,
      priority:  document.getElementById('debtPriority').value,
      notes:     document.getElementById('debtNotes').value.trim(),
      recurring: document.getElementById('debtRecurring').checked,
    });
    Modal.closeDebt();
  });

  // Delegated: pay / unpay / edit / delete buttons in debt cards
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-id]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.classList.contains('pay') || btn.classList.contains('unpay')) Debts.togglePaid(id);
    if (btn.classList.contains('edit'))   { const d = state.debts.find(x => x.id === id); if (d) Modal.openDebt(d); }
    if (btn.classList.contains('delete')) Debts.delete(id);
  });

  // Search & filters
  document.getElementById('debtSearch').addEventListener('input', () => Render.debtsList());
  document.getElementById('categoryFilter').addEventListener('change', () => Render.debtsList());
  document.getElementById('statusFilter').addEventListener('change', () => Render.debtsList());

  // Alerts view
  document.getElementById('requestNotifPermission').addEventListener('click', async () => {
    await Notifications.requestPermission();
    Render.alertsView();
  });
  document.getElementById('saveAlertConfig').addEventListener('click', () => {
    state.settings.browserNotif = document.getElementById('browserNotifToggle').checked;
    state.settings.alert7days   = document.getElementById('alert7Days').checked;
    state.settings.alert3days   = document.getElementById('alert3Days').checked;
    state.settings.alertSameDay = document.getElementById('alertSameDay').checked;
    Storage.saveSettings();
    Toast.show('Configuración de alertas guardada.', 'success');
  });

  // Settings
  document.getElementById('currencySelect').addEventListener('change', e => {
    state.settings.currency = e.target.value;
    Storage.saveSettings();
    Render.all();
    Toast.show('Moneda actualizada.', 'success');
  });
  document.getElementById('saveSalaryBtn').addEventListener('click', () => {
    const val = parseFloat(document.getElementById('salaryInput').value);
    if (isNaN(val) || val < 0) { Toast.show('Ingresa un salario válido.', 'error'); return; }
    state.salary = val;
    Storage.saveSalary();
    Render.all();
    Toast.show('Salario guardado.', 'success');
  });

  // Export
  document.getElementById('exportDataBtn').addEventListener('click', () => {
    const blob = new Blob([Storage.exportAll()], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `debtflow_${new Date().toISOString().split('T')[0]}.json`;
    a.click(); URL.revokeObjectURL(url);
    Toast.show('Datos exportados.', 'success');
  });

  // Import
  document.getElementById('importDataInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        Storage.importAll(ev.target.result);
        Render.all();
        Toast.show('Datos importados correctamente.', 'success');
      } catch (_) {
        Toast.show('Archivo inválido.', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // Reset month
  document.getElementById('resetMonthBtn').addEventListener('click', Debts.resetMonth);

  // Clear all
  document.getElementById('clearDataBtn').addEventListener('click', () => {
    if (!confirm('¿Borrar todos los datos? Esta acción no se puede deshacer.')) return;
    state.debts = []; state.salary = 0; state.alertLog = [];
    Storage.saveDebts(); Storage.saveSalary(); Storage.saveAlertLog();
    Render.all();
    Toast.show('Todos los datos han sido eliminados.', 'warning');
  });

  // Notif bell → go to alerts
  document.getElementById('notifBtn').addEventListener('click', () => Nav.go('alerts'));

  // Keyboard: Escape closes modals
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') Modal.closeAll();
  });
}

/* ══════════════════════════════════════════
   ALERT CHECK SCHEDULER
   Corre cada hora y al iniciar
══════════════════════════════════════════ */
function scheduleAlertChecks() {
  Notifications.checkDueDebts();
  // Run every hour
  setInterval(() => {
    Notifications.checkDueDebts();
    Render.notifBadge();
    Render.alertsView();
  }, 60 * 60 * 1000);
}

/* ══════════════════════════════════════════
   INIT
══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  Storage.load();
  bindEvents();
  Render.all();
  scheduleAlertChecks();

  // Demo data for first-time users
  if (state.debts.length === 0 && state.salary === 0) {
    _loadDemoData();
  }
});

function _loadDemoData() {
  state.salary = 3000;
  Storage.saveSalary();
  const today = new Date();
  const demoDebts = [
    { id: Utils.id(), name: 'Alquiler',    amount: 900,  dueDay: 1,  category: 'vivienda',        priority: 'alta',  recurring: true, paidThisMonth: false, notes: '' },
    { id: Utils.id(), name: 'Netflix',     amount: 15.99,dueDay: 10, category: 'entretenimiento', priority: 'baja',  recurring: true, paidThisMonth: false, notes: 'Plan estándar' },
    { id: Utils.id(), name: 'Spotify',     amount: 9.99, dueDay: 15, category: 'suscripciones',   priority: 'baja',  recurring: true, paidThisMonth: false, notes: '' },
    { id: Utils.id(), name: 'Seguro médico', amount: 120, dueDay: 5, category: 'salud',            priority: 'alta',  recurring: true, paidThisMonth: false, notes: '' },
    { id: Utils.id(), name: 'Internet',    amount: 60,   dueDay: today.getDate() + 2 <= 28 ? today.getDate() + 2 : 28, category: 'servicios', priority: 'alta', recurring: true, paidThisMonth: false, notes: 'Vence pronto' },
    { id: Utils.id(), name: 'Gimnasio',    amount: 45,   dueDay: 20, category: 'suscripciones',   priority: 'baja',  recurring: true, paidThisMonth: false, notes: '' },
    { id: Utils.id(), name: 'Préstamo auto', amount: 280, dueDay: 8, category: 'transporte',      priority: 'alta',  recurring: true, paidThisMonth: false, notes: '' },
  ];
  state.debts = demoDebts;
  Storage.saveDebts();
  Render.all();
  Toast.show('Bienvenido a DebtFlow — datos de ejemplo cargados.', 'success');
}
