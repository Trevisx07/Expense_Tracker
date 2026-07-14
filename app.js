/* ============================================================
   Matheran · Expense Splitter
   Vanilla JS. State persisted in localStorage.
   ============================================================ */

const PEOPLE = ['Het', 'Jakir', 'Rajesh', 'Mitul', 'Khant', 'Urvesh', 'Suman', 'Selva'];
const N = PEOPLE.length;
const STORAGE_KEY = 'matheran.expenses.v1';

/* ---------- State ---------- */
let expenses = load();
let editingId = null;

/* ---------- Elements ---------- */
const $ = (sel) => document.querySelector(sel);
const form = $('#expenseForm');
const payerSel = $('#payer');
const amountInput = $('#amount');
const descInput = $('#description');
const dateInput = $('#date');
const submitLabel = $('#submitLabel');
const formTitle = $('#formTitle');
const cancelEditBtn = $('#cancelEdit');
const listEl = $('#expenseList');
const emptyState = $('#emptyState');

/* ---------- Persistence ---------- */
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data.filter(valid) : [];
  } catch {
    return [];
  }
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses)); } catch {}
}
function valid(e) {
  return e && typeof e.id !== 'undefined' && PEOPLE.includes(e.payer) && Number.isFinite(e.amount);
}

/* ---------- Helpers ---------- */
const money = (n) => {
  const v = Math.round((n + Number.EPSILON) * 100) / 100;
  const s = v.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return '₹' + s;
};
const initials = (name) => name.slice(0, 2).toUpperCase();
const uid = () => Date.now().toString(36) + Math.floor(performance.now() * 1000 % 1000).toString(36);

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/* ---------- Populate payer dropdown ---------- */
function initPeople() {
  payerSel.innerHTML = PEOPLE.map((p) => `<option value="${p}">${p}</option>`).join('');
}

/* ============================================================
   Settlement math
   Net balance = what a person paid - their equal share.
   Positive => owed money. Negative => owes money.
   Greedy match of biggest creditor with biggest debtor to
   minimise number of transfers.
   ============================================================ */
function computeBalances() {
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const share = total / N;

  const paid = Object.fromEntries(PEOPLE.map((p) => [p, 0]));
  for (const e of expenses) paid[e.payer] += e.amount;

  const net = PEOPLE.map((p) => ({
    name: p,
    paid: paid[p],
    share,
    balance: paid[p] - share,
  }));

  return { total, share, net };
}

function computeSettlements(net) {
  // Work in integer paise to avoid float drift.
  const creditors = [];
  const debtors = [];
  net.forEach((p) => {
    const cents = Math.round(p.balance * 100);
    if (cents > 0) creditors.push({ name: p.name, cents });
    else if (cents < 0) debtors.push({ name: p.name, cents: -cents });
  });

  creditors.sort((a, b) => b.cents - a.cents);
  debtors.sort((a, b) => b.cents - a.cents);

  const transfers = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].cents, creditors[j].cents);
    if (pay > 0) {
      transfers.push({ from: debtors[i].name, to: creditors[j].name, amount: pay / 100 });
    }
    debtors[i].cents -= pay;
    creditors[j].cents -= pay;
    if (debtors[i].cents === 0) i++;
    if (creditors[j].cents === 0) j++;
  }
  return transfers;
}

/* ============================================================
   Render
   ============================================================ */
function render() {
  const { total, share, net } = computeBalances();

  // Stats
  $('#statTotal').textContent = money(total);
  $('#statPerPerson').textContent = money(share);
  $('#statCount').textContent = expenses.length;

  renderList();
  renderBalances(net);
  renderSettlements(net);

  $('#listCount').textContent = expenses.length;
}

function renderList() {
  const has = expenses.length > 0;
  emptyState.hidden = has;
  listEl.hidden = !has;

  // newest first
  const sorted = [...expenses].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  listEl.innerHTML = sorted.map((e) => {
    const dateStr = formatDate(e.date);
    const meta = [
      `Paid by <b>${escapeHtml(e.payer)}</b>`,
      dateStr,
    ].filter(Boolean).join(' · ');

    return `
      <div class="expense-item" data-id="${e.id}">
        <div class="avatar">${initials(e.payer)}</div>
        <div class="exp-body">
          <div class="exp-desc">${escapeHtml(e.description)}</div>
          <div class="exp-meta">${meta}</div>
        </div>
        <div class="exp-amount">${money(e.amount)}</div>
        <div class="exp-actions">
          <button class="icon-btn" data-action="edit" data-id="${e.id}" title="Edit" aria-label="Edit expense">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="icon-btn danger" data-action="delete" data-id="${e.id}" title="Delete" aria-label="Delete expense">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>`;
  }).join('');
}

function renderBalances(net) {
  const maxAbs = Math.max(1, ...net.map((p) => Math.abs(p.balance)));
  const box = $('#balances');

  box.innerHTML = net.map((p) => {
    const cents = Math.round(p.balance * 100);
    const cls = cents > 0 ? 'pos' : cents < 0 ? 'neg' : 'zero';
    const pct = Math.min(100, (Math.abs(p.balance) / maxAbs) * 100);
    const bar = cents > 0
      ? `<div class="bal-bar pos" style="width:${pct}%"></div>`
      : cents < 0
      ? `<div class="bal-bar neg" style="width:${pct}%"></div>`
      : '';
    const val = cents === 0 ? '₹0' : (cents > 0 ? '+' : '−') + money(Math.abs(p.balance)).slice(1);

    return `
      <div class="bal-row">
        <span class="bal-name"><span class="dot ${cls}"></span>${escapeHtml(p.name)}</span>
        <span class="bal-bar-wrap">${bar}</span>
        <span class="bal-val ${cls}">${val}</span>
      </div>`;
  }).join('');
}

function renderSettlements(net) {
  const transfers = computeSettlements(net);
  const box = $('#settlements');
  const settled = $('#settledState');
  const hasData = expenses.length > 0;

  if (transfers.length === 0) {
    box.innerHTML = '';
    settled.hidden = false;
    settled.querySelector('p').textContent = hasData ? 'All settled.' : 'Nothing to settle yet.';
    settled.querySelector('span').textContent = hasData ? "Everyone's even." : 'Add expenses to see who owes whom.';
    settled.querySelector('.empty-mark').textContent = hasData ? '✓' : '₹';
    $('#settleCount').textContent = '0';
    return;
  }

  settled.hidden = true;
  $('#settleCount').textContent = transfers.length;

  box.innerHTML = transfers.map((t) => `
    <div class="settle-row">
      <div class="avatar" style="width:34px;height:34px;font-size:13px">${initials(t.from)}</div>
      <span class="settle-from">${escapeHtml(t.from)}</span>
      <span class="settle-arrow">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
      </span>
      <span class="settle-to">${escapeHtml(t.to)}</span>
      <span class="settle-amt">${money(t.amount)}</span>
    </div>`).join('');
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/* ============================================================
   Form: add / edit
   ============================================================ */
form.addEventListener('submit', (e) => {
  e.preventDefault();

  const payer = payerSel.value;
  const amount = parseFloat(amountInput.value);
  const description = descInput.value.trim();
  const date = dateInput.value || '';

  if (!PEOPLE.includes(payer)) return toast('Pick who paid');
  if (!Number.isFinite(amount) || amount <= 0) return toast('Enter a valid amount');
  if (!description) return toast('Add a short description');

  if (editingId) {
    const exp = expenses.find((x) => x.id === editingId);
    if (exp) {
      exp.payer = payer;
      exp.amount = amount;
      exp.description = description;
      exp.date = date;
    }
    toast('Expense updated');
    exitEdit();
  } else {
    expenses.push({
      id: uid(),
      payer,
      amount,
      description,
      date,
      createdAt: Date.now(),
    });
    toast('Expense added');
  }

  save();
  render();
  form.reset();
  descInput.focus();
});

/* ---------- Edit / delete via delegation ---------- */
listEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  if (action === 'edit') startEdit(id);
  else if (action === 'delete') askDelete(id);
});

function startEdit(id) {
  const exp = expenses.find((x) => x.id === id);
  if (!exp) return;
  editingId = id;
  payerSel.value = exp.payer;
  amountInput.value = exp.amount;
  descInput.value = exp.description;
  dateInput.value = exp.date || '';

  formTitle.textContent = 'Edit expense';
  submitLabel.textContent = 'Save changes';
  cancelEditBtn.hidden = false;

  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  descInput.focus();
}

function exitEdit() {
  editingId = null;
  formTitle.textContent = 'Add an expense';
  submitLabel.textContent = 'Add expense';
  cancelEditBtn.hidden = true;
  form.reset();
}

cancelEditBtn.addEventListener('click', exitEdit);

/* ---------- Delete with confirm + animation ---------- */
function askDelete(id) {
  const exp = expenses.find((x) => x.id === id);
  if (!exp) return;
  openConfirm(
    'Delete expense?',
    `“${exp.description}” · ${money(exp.amount)} paid by ${exp.payer}.`,
    () => doDelete(id)
  );
}

function doDelete(id) {
  const node = listEl.querySelector(`.expense-item[data-id="${id}"]`);

  let done = false;
  const commit = () => {
    if (done) return;
    done = true;
    expenses = expenses.filter((x) => x.id !== id);
    if (editingId === id) exitEdit();
    save();
    render();
    toast('Expense deleted');
  };

  if (node) {
    node.classList.add('removing');
    node.addEventListener('animationend', commit, { once: true });
    setTimeout(commit, 400); // fallback if animationend doesn't fire
  } else {
    commit();
  }
}

/* ============================================================
   Reset all
   ============================================================ */
$('#resetBtn').addEventListener('click', () => {
  if (expenses.length === 0) return toast('Nothing to reset');
  openConfirm(
    'Reset everything?',
    'This deletes all expenses and settlements. It cannot be undone.',
    () => {
      expenses = [];
      exitEdit();
      save();
      render();
      toast('All cleared');
    },
    'Reset'
  );
});

/* ============================================================
   Confirm modal
   ============================================================ */
const modal = $('#confirm');
let confirmCb = null;

function openConfirm(title, msg, cb, okLabel = 'Delete') {
  $('#confirmTitle').textContent = title;
  $('#confirmMsg').textContent = msg;
  $('#confirmOk').textContent = okLabel;
  confirmCb = cb;
  modal.hidden = false;
}
function closeConfirm() { modal.hidden = true; confirmCb = null; }

modal.addEventListener('click', (e) => {
  if (e.target.hasAttribute('data-close')) closeConfirm();
});
$('#confirmOk').addEventListener('click', () => {
  const cb = confirmCb;
  closeConfirm();
  if (cb) cb();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.hidden) closeConfirm();
});

/* ============================================================
   Toast
   ============================================================ */
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ============================================================
   Boot
   ============================================================ */
initPeople();
render();
