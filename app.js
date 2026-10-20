'use strict';
/* =========================================================
   COMPOUND · small wins, compounding
   ---------------------------------------------------------
   Map of this file:
     1. Helpers ......... money, dates, icons
     2. Data ............ your data lives ONLY on this device
     3. Loan engine ..... EMI / extra-payment maths (₹)
     4. Money engine .... income, spending, India transfers (£)
     5. Game engine ..... XP, momentum, quests, milestones, levels
     6. Screens ......... home, money, loan, profile
     7. Sheets .......... pop-up forms
     8. Actions ......... what happens when you tap things
     9. Effects ......... toasts, sound, haptics, confetti
    10. Start-up
   ========================================================= */

/* ---------- 1. Helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const inr = n => '₹' + Math.round(n).toLocaleString('en-IN');
const lakh = n => {
  const a = Math.abs(n);
  if (a >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr';
  if (a >= 1e5) return '₹' + (n / 1e5).toFixed(2) + ' L';
  return inr(n);
};
const gbp = n => {
  const a = Math.round(Math.abs(n) * 100) / 100;
  const s = a.toLocaleString('en-GB', { minimumFractionDigits: Number.isInteger(a) ? 0 : 2, maximumFractionDigits: 2 });
  return (n < -0.004 ? '−' : '') + '£' + s;
};
const num = s => Number(String(s).replace(/[^0-9.]/g, ''));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
const sum = (arr, f) => arr.reduce((t, x) => t + (f(x) || 0), 0);
const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => toISO(new Date());
const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + Math.round(n)); return x; };
const dayOfTs = ts => toISO(new Date(ts));
const ymNow = () => todayISO().slice(0, 7);
const ymAdd = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const ymLabel = (ym, opts = { month: 'long', year: 'numeric' }) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-GB', opts); };
const ymLastDay = ym => { const [y, m] = ym.split('-').map(Number); return toISO(new Date(y, m, 0)); };
const weekStart = iso => { const d = parseISO(iso); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return toISO(d); };
const weekIndex = wk => Math.round(parseISO(wk).getTime() / 6048e5);
const fmtMonth = d => isNaN(d) ? 'Never' : d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
const fmtDay = d => (typeof d === 'string' ? parseISO(d) : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDayShort = iso => parseISO(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const dur = m => !isFinite(m) ? 'never' : m < 12 ? `${m.toFixed(1)} months` : `${(m / 12).toFixed(1)} years`;
const daysSince = iso => iso ? (Date.now() - parseISO(iso)) / 864e5 : Infinity;
const ordinal = n => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

const ICONS = {
  bank: '<path d="M3 10 12 4l9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8"/><path d="M3 20h18"/>',
  card: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h3"/>',
  bowl: '<path d="M4 11h16a8 8 0 0 1-16 0Z"/><path d="M12 4v4M8.5 5.5l1 2.5M15.5 5.5l-1 2.5"/>',
  dumbbell: '<path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/>',
  check: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/>',
  tick: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>',
  chevR: '<path d="m9 6 6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  bolt: '<path d="M13 3 5 13h6l-1 8 8-10h-6l1-8Z"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  sync: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"/>',
  flame: '<path d="M12 21c-3.9 0-7-2.7-7-6.5 0-3.5 3-5.5 4-9 1.5 1.5 2 3 2 4.5 1-1 1.8-2.2 2-3.5 2.5 2 4 4.8 4 8 0 3.8-3.1 6.5-5 6.5Z"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0Z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8"/>',
  send: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  leaf: '<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15"/><path d="M5 19 13 11"/>',
  home: '<path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/>',
  basket: '<path d="M4 9h16l-1.5 10h-13Z"/><path d="M9 9l3-5 3 5"/>',
  bag: '<path d="M6 8h12l-1 12H7Z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
  fork: '<path d="M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 1-3 4-3 7h3v11"/>',
  train: '<rect x="6" y="3" width="12" height="14" rx="3"/><path d="M6 11h12M9 21l1.5-4M15 21l-1.5-4"/>',
  repeat: '<path d="M4 9h13l-3-3M20 15H7l3 3"/>',
  tag: '<path d="M3 12V4h8l9 9-8 8Z"/><circle cx="7.5" cy="8" r="1"/>',
  ticket: '<path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4Z"/><path d="M14 7v2M14 11v2M14 15v2"/>',
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10Z"/>',
  plane: '<path d="M3 13l18-7-7 16-2.5-6.5Z"/>',
  gift: '<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M12 9v11M4 13h16M12 9c-2-4-6-3-5-1 .7 1.4 5 1 5 1Zm0 0c2-4 6-3 5-1-.7 1.4-5 1-5 1Z"/>',
  dots: '<circle cx="6" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18" cy="12" r="1"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 12h18"/>',
  coins: '<ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
};
const icon = name => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.dots}</svg>`;
const LOGO = `<svg class="logo" viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" rx="22" fill="var(--ink)"/><path d="M24 74H76" stroke="var(--muted)" stroke-width="2" stroke-linecap="round"/><path d="M24 70C50 70 62 60 72 30" fill="none" stroke="var(--gold)" stroke-width="3.5" stroke-linecap="round"/><circle cx="72" cy="30" r="4.5" fill="var(--bg)"/></svg>`;

/* ---------- 2. Data ----------
   Everything is stored in this phone's browser storage under one key.
   The key is from the very first version, so updates never lose data. */
const STORE_KEY = 'lifequest.v1';
const DEFAULT_SETTINGS = { sound: true, plan: 50000 };
let state = null;
let view = 'home';
let animateNext = true;
let showAllMilestones = false;
let moneyMonth = ymNow();

function load() {
  try { state = JSON.parse(localStorage.getItem(STORE_KEY)); } catch { state = null; }
  if (state) state = upgrade(state);
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch { toast('Could not save. Export a backup from your profile.'); }
}
// Older versions stored things slightly differently: bring them up to date
function upgrade(s) {
  if (s.version === 1) s = migrateV1(s);
  s.version = 3;
  s.settings = Object.assign({}, DEFAULT_SETTINGS, s.settings);
  s.money = Object.assign({ tx: [], recurring: [], closed: {} }, s.money);
  return s;
}
function migrateV1(s) {
  return {
    version: 2,
    profile: { name: s.hero.name },
    loan: Object.assign({ name: 'Student loan' }, s.loan, { log: s.log || [] }),
    settings: { sound: s.settings?.sound ?? true, plan: s.settings?.oracle ?? 50000 },
    lastBackup: s.lastBackup || null,
    createdAt: s.createdAt || todayISO(),
  };
}

/* ---------- 3. Loan engine (₹) ----------
   simulate() plays the loan forward month by month: the bank charges
   interest on what's left, your EMI (+ any extra) pays that first, and
   the rest reduces the balance. It returns months left + interest paid. */
function simulate(balance, extra = 0, loan = state.loan) {
  const r = loan.rate / 1200, pay = loan.emi + extra;
  let b = balance, months = 0, interest = 0;
  while (b > 0.5) {
    const i = b * r;
    if (pay <= i || months > 1200) return { months: Infinity, interest: Infinity };
    interest += i;
    if (pay - i >= b) { months += (b + i) / pay; b = 0; }
    else { b -= pay - i; months += 1; }
  }
  return { months, interest };
}

const loanBalance = () => state.loan.setupBalance - sum(state.loan.log, e => e.principal);
const lastEmiISO = () => state.loan.log.filter(e => e.type === 'emi').reduce((d, e) => (e.date > d ? e.date : d), state.loan.setupDate);
const ZERO_LOAN = { bal: 0, repaid: 0, emiCount: 0, extraCount: 0, extraPaid: 0, biggest: 0, monthsSaved: 0, interestSaved: 0 };

function loanStats() {
  const L = state.loan;
  if (!L) return null;
  const bal = Math.max(0, loanBalance());
  const emis = L.log.filter(e => e.type === 'emi');
  const extras = L.log.filter(e => e.type === 'extra');
  const proj = simulate(bal);
  const last = parseISO(lastEmiISO());
  const s = {
    bal,
    repaid: Math.min(1, Math.max(0, 1 - bal / L.original)),
    emiCount: emis.length,
    extraCount: extras.length,
    extraPaid: sum(extras, e => e.amount),
    biggest: extras.reduce((m, e) => Math.max(m, e.amount), 0),
    interestNow: bal * L.rate / 1200,
    // compared with day one's plan (EMI only, nothing extra)
    monthsSaved: L.baselineMonths - (emis.length + proj.months),
    interestSaved: L.baselineInterest - (sum(L.log, e => e.interest) + proj.interest),
    nextEmi: addMonths(last, 1),
    freedom: bal <= 0 ? last : addMonths(last, Math.ceil(proj.months)),
    originalEnd: addMonths(parseISO(L.setupDate), Math.ceil(L.baselineMonths)),
  };
  s.emiDue = bal > 0 && new Date() >= s.nextEmi;
  return s;
}

// Creates a loan entry (EMI or extra) and pushes it to the log
function makeLoanEntry(type, amount, date) {
  const bal = Math.max(0, loanBalance());
  const e = { id: uid(), ts: Date.now(), type, date, amount };
  let base;
  if (type === 'emi') {
    e.interest = Math.min(amount, Math.round(bal * state.loan.rate / 1200));
    e.principal = Math.max(0, Math.min(bal, amount - e.interest));
    base = XP.emi;
  } else {
    e.interest = 0;
    e.principal = Math.min(bal, amount);
    const now = simulate(bal), after = simulate(bal - e.principal);
    e.monthsRemoved = Math.max(0, now.months - after.months);
    e.interestSaved = Math.max(0, now.interest - after.interest);
    base = extraXp(amount, e.monthsRemoved);
  }
  const a = award(base);
  e.xp = a.xp;
  e.mult = a.mult;
  state.loan.log.push(e);
  return e;
}

/* ---------- 4. Money engine (£) ---------- */
const cat = (id, name, ic) => ({ id, name, icon: ic });
const EXPENSE_CATS = [
  cat('rent', 'Rent', 'home'), cat('bills', 'Bills', 'bolt'), cat('groceries', 'Groceries', 'basket'),
  cat('takeaway', 'Takeaways', 'bag'), cat('eatingout', 'Eating out', 'fork'), cat('transport', 'Transport', 'train'),
  cat('subscriptions', 'Subscriptions', 'repeat'), cat('shopping', 'Shopping', 'tag'), cat('leisure', 'Leisure', 'ticket'),
  cat('health', 'Health', 'heart'), cat('travel', 'Travel', 'plane'), cat('gifts', 'Gifts', 'gift'), cat('other', 'Other', 'dots'),
];
const INCOME_CATS = [cat('salary', 'Salary', 'briefcase'), cat('tips', 'Tips', 'coins'), cat('refund', 'Refund', 'undo'), cat('otherin', 'Other', 'dots')];
const PURPOSES = { emi: 'Loan EMI', extra: 'Loan extra', savings: 'Savings', family: 'Family' };
const catOf = id => [...EXPENSE_CATS, ...INCOME_CATS].find(c => c.id === id) || cat(id, 'Other', 'dots');

function monthStats(ym) {
  const s = { ym, income: 0, living: 0, byCat: {}, transfer: { emi: 0, extra: 0, savings: 0, family: 0 }, inr: 0, txCount: 0, noSpend: 0 };
  const days = new Set();
  for (const t of state.money.tx) {
    if (t.date.slice(0, 7) !== ym) continue;
    days.add(t.date);
    if (t.type === 'nospend') { s.noSpend++; continue; }
    s.txCount++;
    if (t.type === 'income') s.income += t.amount;
    else if (t.type === 'expense') { s.living += t.amount; s.byCat[t.cat] = (s.byCat[t.cat] || 0) + t.amount; }
    else if (t.type === 'transfer') { s.transfer[t.purpose] = (s.transfer[t.purpose] || 0) + t.amount; s.inr += t.inr; }
  }
  s.transfers = s.transfer.emi + s.transfer.extra + s.transfer.savings + s.transfer.family;
  s.out = s.living + s.transfers;
  s.left = s.income - s.out;
  s.loan = s.transfer.emi + s.transfer.extra;
  s.saved = s.transfer.savings + Math.max(0, s.left);
  // "Put to work" = money that built your future: extra loan payments + savings + what's left
  s.ptw = s.income > 0 ? (s.transfer.extra + s.saved) / s.income : null;
  s.logDays = days.size;
  return s;
}

function gradeFor(m) {
  if (!m.income) return { grade: '—', score: 0, xp: 50 };
  const score = Math.min(1, Math.max(0, m.ptw) / 0.4) * 70 + Math.min(1, m.logDays / 15) * 30;
  const [grade, xp] = score >= 90 ? ['A+', 1000] : score >= 80 ? ['A', 700] : score >= 65 ? ['B', 400] : score >= 50 ? ['C', 200] : ['D', 100];
  return { grade, score: Math.round(score), xp };
}

function dueRecurring(ym = ymNow()) {
  const today = todayISO();
  return state.money.recurring
    .map(r => ({ r, date: `${ym}-${pad(Math.min(r.day, 28))}` }))
    .filter(({ r, date }) => date <= today && !state.money.tx.some(t => t.recurringId === r.id && t.date.slice(0, 7) === ym));
}

function latestRate() {
  const t = state.money.tx.filter(x => x.type === 'transfer').sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts)[0];
  return t ? t.inr / t.amount : null;
}

/* ---------- 5. Game engine ---------- */
const XP = { emi: 150, perRupee: 1 / 100, perMonthSaved: 50 };
const TX_XP = { expense: 10, income: 20, transfer: 30, nospend: 20 };
const DAILY_BONUS = 20;
const extraXp = (amount, monthsSaved) => Math.round(amount * XP.perRupee + monthsSaved * XP.perMonthSaved);

// Momentum: show up on consecutive days and every action earns more XP
const MOMENTUM = [[30, 1.5], [21, 1.4], [14, 1.3], [7, 1.2], [3, 1.1], [0, 1]];
const multFor = streak => MOMENTUM.find(([d]) => streak >= d)[1];

// Every day you did anything → total XP earned that day
function activity() {
  const m = new Map();
  const add = (ts, xp) => { const d = dayOfTs(ts); m.set(d, (m.get(d) || 0) + (xp || 0)); };
  (state.loan?.log || []).forEach(e => add(e.ts, e.xp));
  state.money.tx.forEach(t => add(t.ts, t.xp));
  return m;
}

function streakInfo(act) {
  const today = todayISO();
  let d = act.has(today) ? today : addDays(today, -1), cur = 0;
  while (act.has(d)) { cur++; d = addDays(d, -1); }
  let best = 0, run = 0, prev = null;
  for (const x of [...act.keys()].sort()) {
    run = prev && addDays(prev, 1) === x ? run + 1 : 1;
    best = Math.max(best, run);
    prev = x;
  }
  return { cur, best, today: act.has(today) };
}

// XP for an action right now: daily bonus for the first action, times momentum
function award(base) {
  const st = streakInfo(activity());
  const streakAfter = st.today ? st.cur : st.cur + 1;
  const mult = multFor(streakAfter), bonus = st.today ? 0 : DAILY_BONUS;
  return { xp: Math.round((base + bonus) * mult), mult };
}

// Weekly quests: three per week, rotating
const QUESTS = {
  log5: { text: 'Log money on 5 different days', goal: 5, get: w => w.moneyDays },
  tx10: { text: 'Log 10 transactions', goal: 10, get: w => w.txCount },
  active6: { text: 'Show up on 6 days', goal: 6, get: w => w.activeDays },
  food40: { text: 'Takeaways and eating out under £40', limit: 40, get: w => w.food },
  shop30: { text: 'Shopping under £30', limit: 30, get: w => w.shopping },
  nospend2: { text: 'Have 2 no-spend days', goal: 2, get: w => w.noSpend },
  streak7: { text: 'Show up all 7 days', goal: 7, get: w => w.activeDays },
  extra1: { text: 'Make an extra loan payment', goal: 1, get: w => w.extras },
  tx15: { text: 'Log 15 transactions', goal: 15, get: w => w.txCount },
};
const QUEST_SLOTS = [['log5', 'tx10', 'active6'], ['food40', 'shop30', 'nospend2'], ['streak7', 'extra1', 'tx15']];
const QUEST_XP = 100, CHEST_XP = 150;

function questsFor(wk) {
  const n = weekIndex(wk);
  return QUEST_SLOTS.map((slot, i) => {
    const id = slot[(n + i) % slot.length];
    return id === 'extra1' && !state.loan ? 'tx15' : id;
  });
}

function weekData(wk, act) {
  const end = addDays(wk, 6), inWeek = d => d >= wk && d <= end;
  const w = { moneyDays: 0, txCount: 0, activeDays: 0, food: 0, shopping: 0, noSpend: 0, extras: 0, expenseLogs: 0 };
  const mdays = new Set();
  for (const t of state.money.tx) {
    const logged = dayOfTs(t.ts);
    if (inWeek(logged)) { mdays.add(logged); if (t.type !== 'nospend') w.txCount++; }
    if (!inWeek(t.date)) continue;
    if (t.type === 'nospend') w.noSpend++;
    if (t.type === 'expense') {
      w.expenseLogs++;
      if (t.cat === 'takeaway' || t.cat === 'eatingout') w.food += t.amount;
      if (t.cat === 'shopping') w.shopping += t.amount;
    }
  }
  w.moneyDays = mdays.size;
  for (const d of act.keys()) if (inWeek(d)) w.activeDays++;
  w.extras = (state.loan?.log || []).filter(e => e.type === 'extra' && inWeek(dayOfTs(e.ts))).length;
  return w;
}

function questStatus(wk, act) {
  const w = weekData(wk, act), over = addDays(wk, 6) < todayISO();
  const list = questsFor(wk).map(id => {
    const q = QUESTS[id], val = q.get(w);
    if (q.limit) {
      // Spending limits only count if you actually logged that week, and complete when the week ends
      const valid = w.expenseLogs >= 3, ok = valid && val <= q.limit;
      return { id, text: q.text, limit: q.limit, val, valid, ok, done: over && ok, pct: Math.min(1, val / q.limit), label: `${gbp(val)} / ${gbp(q.limit)}` };
    }
    return { id, text: q.text, val, done: val >= q.goal, pct: Math.min(1, val / q.goal), label: `${Math.min(val, q.goal)} / ${q.goal}` };
  });
  const done = list.filter(q => q.done).length;
  return { wk, list, done, chest: done === list.length };
}

function allQuests(act) {
  const days = [...act.keys()].sort();
  if (!days.length) return { done: 0, chests: 0, xp: 0 };
  let wk = weekStart(days[0]), done = 0, chests = 0;
  const cur = weekStart(todayISO());
  while (wk <= cur) {
    const s = questStatus(wk, act);
    done += s.done;
    chests += s.chest ? 1 : 0;
    wk = addDays(wk, 7);
  }
  return { done, chests, xp: done * QUEST_XP + chests * CHEST_XP };
}

const TITLES = [[1, 'Novice'], [3, 'Apprentice'], [6, 'Steward'], [10, 'Strategist'], [15, 'Architect'], [20, 'Master'], [30, 'Grandmaster']];
const titleFor = lvl => TITLES.filter(t => lvl >= t[0]).pop()[1];
function levelFrom(xp) {
  let lvl = 1, need = 200;
  while (xp >= need) { xp -= need; lvl++; need = 200 + (lvl - 1) * 100; }
  return { lvl, into: xp, need };
}

const ms = (id, name, desc, xp, test) => ({ id, name, desc, xp, test });
const MILESTONES = [
  // Showing up
  ms('streak-3', 'Three days running', 'Momentum ×1.1 unlocked', 150, g => g.best >= 3),
  ms('streak-7', 'A full week', 'Seven days in a row', 300, g => g.best >= 7),
  ms('streak-14', 'Two weeks strong', '', 600, g => g.best >= 14),
  ms('streak-30', 'Thirty-day habit', 'Maximum momentum', 1500, g => g.best >= 30),
  ms('streak-100', 'One hundred days', 'This is who you are now', 5000, g => g.best >= 100),
  ms('quest-1', 'First quest complete', '', 150, g => g.questsDone >= 1),
  ms('chest-1', 'First full week', 'All three quests in one week', 300, g => g.chests >= 1),
  ms('chest-10', 'Ten full weeks', '', 2000, g => g.chests >= 10),
  // Money
  ms('first-income', 'First income logged', '', 100, g => g.incomeCount >= 1),
  ms('first-expense', 'First expense logged', 'Awareness is step one', 100, g => g.expenseCount >= 1),
  ms('first-transfer', 'First transfer home', '', 150, g => g.transferCount >= 1),
  ms('nospend-1', 'First no-spend day', '', 150, g => g.noSpend >= 1),
  ms('nospend-10', 'Ten no-spend days', '', 600, g => g.noSpend >= 10),
  ms('tx-50', 'Fifty transactions logged', '', 400, g => g.txCount >= 50),
  ms('tx-250', '250 transactions logged', 'A true record keeper', 1500, g => g.txCount >= 250),
  ms('close-1', 'First month closed', '', 300, g => g.closedCount >= 1),
  ms('ptw-40', 'Put 40% to work', 'In a closed month', 800, g => g.ptw40),
  ms('grade-a', 'An A month', '', 800, g => g.gradeA),
  ms('grade-aplus', 'A perfect month', 'Grade A+', 1500, g => g.gradeAPlus),
  ms('remit-1l', '₹1 lakh sent home', '', 300, g => g.inrSent >= 1e5),
  ms('remit-10l', '₹10 lakh sent home', '', 1500, g => g.inrSent >= 1e6),
  // Loan
  ms('first-emi', 'First EMI logged', 'The habit begins', 100, g => g.L.emiCount >= 1),
  ms('first-extra', 'First extra payment', 'Straight to the principal', 300, g => g.L.extraCount >= 1),
  ms('hit-50k', '₹50,000 in one payment', 'A serious dent', 300, g => g.L.biggest >= 50000),
  ms('saved-1l', '₹1 lakh interest saved', 'Money the bank will never see', 300, g => g.L.interestSaved >= 1e5),
  ms('time-6', 'Six months sooner', 'Debt-free date moved by half a year', 400, g => g.L.monthsSaved >= 6),
  ms('extra-5', 'Five extra payments', 'Consistency compounds', 500, g => g.L.extraCount >= 5),
  ms('hit-1l', '₹1 lakh in one payment', 'A decisive blow', 600, g => g.L.biggest >= 100000),
  ms('saved-5l', '₹5 lakh interest saved', '', 800, g => g.L.interestSaved >= 5e5),
  ms('time-12', 'One year sooner', 'A whole year returned to you', 800, g => g.L.monthsSaved >= 12),
  ms('emi-12', 'Twelve EMIs logged', 'A full year of showing up', 800, g => g.L.emiCount >= 12),
  ms('extra-12', 'Twelve extra payments', 'A year of discipline', 1000, g => g.L.extraCount >= 12),
  ms('saved-10l', '₹10 lakh interest saved', '', 1500, g => g.L.interestSaved >= 1e6),
  ms('time-60', 'Five years sooner', '', 2000, g => g.L.monthsSaved >= 60),
  ms('saved-25l', '₹25 lakh interest saved', '', 3000, g => g.L.interestSaved >= 2.5e6),
  ms('time-120', 'Ten years sooner', 'A decade given back', 4000, g => g.L.monthsSaved >= 120),
];
for (let p = 5; p <= 100; p += 5) {
  MILESTONES.push(ms('repaid-' + p, p === 100 ? 'Debt-free' : `${p}% of the loan repaid`,
    p === 100 ? 'The loan is gone. You are free.' : p % 25 === 0 ? 'A major milestone' : '',
    p === 100 ? 10000 : p % 25 === 0 ? 1500 : 400, g => g.L.repaid >= p / 100 - 1e-9));
}

// One snapshot of everything game-related
function globalStats() {
  const act = activity(), st = streakInfo(act), tx = state.money.tx, closed = Object.values(state.money.closed);
  const g = {
    act, L: loanStats() || ZERO_LOAN, streak: st.cur, best: st.best, today: st.today,
    incomeCount: tx.filter(t => t.type === 'income').length,
    expenseCount: tx.filter(t => t.type === 'expense').length,
    transferCount: tx.filter(t => t.type === 'transfer').length,
    txCount: tx.filter(t => t.type !== 'nospend').length,
    noSpend: tx.filter(t => t.type === 'nospend').length,
    inrSent: sum(tx, t => t.inr),
    closedCount: closed.length,
    ptw40: closed.some(c => c.ptw >= 0.4),
    gradeA: closed.some(c => c.grade === 'A' || c.grade === 'A+'),
    gradeAPlus: closed.some(c => c.grade === 'A+'),
    week: questStatus(weekStart(todayISO()), act),
  };
  const q = allQuests(act);
  g.questsDone = q.done;
  g.chests = q.chests;
  const unlocked = MILESTONES.filter(m => m.test(g));
  g.unlocked = unlocked.map(m => m.id);
  g.xp = sum(state.loan?.log || [], e => e.xp) + sum(tx, t => t.xp) + sum(unlocked, m => m.xp) + q.xp + sum(closed, c => c.xp);
  return g;
}

// Everything worth celebrating that changed between two snapshots
function rewardsBetween(g0, g1) {
  const out = [];
  if (g0.week.wk === g1.week.wk) {
    g1.week.list.forEach((q, i) => {
      if (q.done && !g0.week.list[i].done) out.push({ kicker: 'Quest complete', title: q.text, xp: QUEST_XP, icon: 'trophy' });
    });
    if (g1.week.chest && !g0.week.chest) out.push({ kicker: 'Full week', title: 'All three quests done', text: 'Bonus unlocked.', xp: CHEST_XP, icon: 'trophy' });
  }
  if (multFor(g1.streak) > multFor(g0.streak))
    out.push({ kicker: 'Momentum', title: `×${multFor(g1.streak).toFixed(1)} XP`, text: `${g1.streak} days in a row. Every action now earns more.`, icon: 'flame' });
  MILESTONES.filter(m => g1.unlocked.includes(m.id) && !g0.unlocked.includes(m.id))
    .forEach(m => out.push({ kicker: 'Milestone', title: m.name, text: m.desc, xp: m.xp, icon: 'star' }));
  const l0 = levelFrom(g0.xp).lvl, l1 = levelFrom(g1.xp).lvl;
  if (l1 > l0) {
    const t0 = titleFor(l0), t1 = titleFor(l1);
    out.push({ kicker: 'Level up', title: `Level ${l1}`, text: t1 !== t0 ? `New title: ${t1}` : 'Steady progress, compounding.', icon: 'up', level: true });
  }
  return out;
}

/* ---------- 6. Screens ---------- */
function render() {
  const app = $('#app');
  const screens = { home: homeView, money: moneyView, loan: loanView, 'loan-setup': loanSetupView, profile: profileView };
  if (!state) app.innerHTML = welcomeView();
  else {
    if (view === 'loan' && !state.loan) view = 'home';
    app.innerHTML = (screens[view] || homeView)();
  }
  if (animateNext) { app.firstElementChild?.classList.add('enter'); animateNext = false; }
  updatePlan();
}

function go(next) {
  view = next;
  animateNext = true;
  if (next === 'money') moneyMonth = ymNow();
  history.pushState({ v: next }, '');
  render();
  scrollTo(0, 0);
}

const topNav = title => `<nav class="topnav">
  <button class="icon-btn" data-back aria-label="Back">${icon('chevL')}</button>
  <span class="title">${title}</span><span class="spacer"></span></nav>`;

const kv = (k, v, sub = '', cls = '') =>
  `<div class="kv"><span class="k">${k}</span><span class="v ${cls}"><span class="stack">${v}${sub ? `<small>${sub}</small>` : ''}</span></span></div>`;

const notice = (act, text, dotColor = 'var(--warn)', extra = '') =>
  `<button class="notice" data-act="${act}" ${extra}><span class="dot" style="background:${dotColor}"></span><span>${text}</span>${icon('chevR')}</button>`;

function ring(frac, size) {
  const sw = size > 60 ? 2.5 : 2, c = size / 2, r = c - sw, len = 2 * Math.PI * r;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${sw}"/>
    <circle class="prog" cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--gold)" stroke-width="${sw}" stroke-linecap="round"
      stroke-dasharray="${len}" stroke-dashoffset="${len * (1 - frac)}"/></svg>`;
}

function welcomeView() {
  return `<div class="welcome">
    ${LOGO}
    <h1 class="wordmark">Compound</h1>
    <p>Small wins, compounding. Track your money, your loan and your habits, and watch steady effort add up.</p>
    <form id="f-welcome">
      <label class="field"><span>What should we call you?</span><input name="name" maxlength="24" autocomplete="given-name" required></label>
      <button class="btn btn-primary btn-block">Begin</button>
    </form>
  </div>`;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function homeView() {
  const g = globalStats(), lv = levelFrom(g.xp), name = state.profile.name, ls = loanStats();
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const prevYm = ymAdd(ymNow(), -1), due = dueRecurring();
  const notices = [];
  if (monthStats(prevYm).txCount && !state.money.closed[prevYm])
    notices.push(notice('close-month', `${ymLabel(prevYm, { month: 'long' })} is ready to close. Claim your grade`, 'var(--gold)', `data-ym="${prevYm}"`));
  if (due.length) notices.push(notice('due', `${due.length} recurring item${due.length > 1 ? 's' : ''} due to log`));
  if (ls && ls.emiDue) notices.push(notice('emi', `Your ${fmtMonth(ls.nextEmi)} EMI is ready to log`));
  if (state.money.tx.length + (state.loan?.log.length || 0) > 5 && daysSince(state.lastBackup) > 14)
    notices.push(notice('backup', `Back up your data · last backup ${state.lastBackup ? fmtDay(state.lastBackup) : 'never'}`, 'var(--muted)'));
  const daysLeft = 7 - ((new Date().getDay() + 6) % 7);
  const soon = (ic, label) => `<button class="soon" data-soon="${label}">${icon(ic)}<div class="name">${label}</div><div class="tag">Coming soon</div></button>`;
  return `<div>
    <header class="home-head">
      <div><div class="date">${today}</div><h1 class="greet">${greeting()},<br>${esc(name)}</h1></div>
      <button class="avatar" data-go="profile" aria-label="Profile">${ring(lv.into / lv.need, 50)}<span class="ini">${esc(name[0].toUpperCase())}</span></button>
    </header>
    <div class="level-line"><span>Level <b>${lv.lvl}</b> · ${titleFor(lv.lvl)}</span><div class="bar gold"><i style="width:${(lv.into / lv.need) * 100}%"></i></div><span>${lv.into.toLocaleString('en-IN')} / ${lv.need.toLocaleString('en-IN')}</span></div>
    ${notices.join('')}

    <div class="section-title"><span>Momentum</span><span>Best ${g.best} day${g.best === 1 ? '' : 's'}</span></div>
    ${momentumCard(g)}

    <div class="section-title"><span>This week's quests</span><span>${daysLeft} day${daysLeft === 1 ? '' : 's'} left</span></div>
    ${questsCard(g.week)}

    <div class="section-title"><span>Trackers</span></div>
    ${moneyCard()}
    ${loanCard(ls)}
    <div class="soon-grid">${soon('timer', 'Flow')}${soon('bowl', 'Food')}${soon('dumbbell', 'Gym')}${soon('check', 'To-do')}</div>
  </div>`;
}

function momentumCard(g) {
  const mult = multFor(g.streak), next = [...MOMENTUM].reverse().find(([d]) => d > g.streak);
  const sub = !g.streak ? 'Log anything today to start a streak.'
    : !g.today ? 'Log something today to keep it alive.'
    : next ? `${next[0] - g.streak} more day${next[0] - g.streak === 1 ? '' : 's'} to ×${next[1].toFixed(1)}` : 'Maximum momentum.';
  return `<section class="panel pad">
    <div class="mom">
      <div class="flame ${g.today ? 'lit' : ''}">${icon('flame')}</div>
      <div><div class="t">${g.streak}-day momentum</div><div class="s">${sub}</div></div>
      <div class="mult">×${mult.toFixed(1)}<small>XP</small></div>
    </div>
    ${activityGrid(g.act)}
    <div class="grid-legend"><span>17 weeks</span><span>Today</span></div>
  </section>`;
}

function activityGrid(act) {
  const weeks = 17, today = todayISO(), start = addDays(weekStart(today), -7 * (weeks - 1));
  let cells = '';
  for (let i = 0; i < weeks * 7; i++) {
    const day = addDays(start, i), xp = act.get(day) || 0;
    const lvl = !act.has(day) ? 0 : xp > 600 ? 4 : xp > 200 ? 3 : xp > 50 ? 2 : 1;
    cells += `<i class="l${lvl}${day > today ? ' f' : ''}${day === today ? ' t' : ''}"></i>`;
  }
  return `<div class="grid-act" style="grid-template-columns:repeat(${weeks},1fr)">${cells}</div>`;
}

function questsCard(ws) {
  const rows = ws.list.map(q => {
    const meta = q.done ? 'Completed'
      : q.limit ? (!q.valid ? 'Log 3+ expenses to qualify' : q.ok ? 'On track until Sunday' : 'Over the limit')
      : '';
    return `<div class="quest ${q.done ? 'done' : ''}">
      <div class="q-top"><div class="c">${q.done ? icon('tick') : ''}</div><div class="q-text">${q.text}</div><div class="q-xp">+${QUEST_XP} XP</div></div>
      <div class="bar ${q.limit && q.val > q.limit ? 'warn' : ''}"><i style="width:${q.pct * 100}%"></i></div>
      <div class="q-meta"><span>${meta}</span><span>${q.label}</span></div>
    </div>`;
  }).join('');
  return `<section class="panel">${rows}
    <div class="q-foot"><span>Complete all three</span><b>${ws.chest ? 'Bonus earned' : `+${CHEST_XP} XP bonus`}</b></div></section>`;
}

function moneyCard() {
  if (!state.money.tx.length) return `<button class="tracker" data-go="money">
      <div class="tr-top">${icon('card')}<span class="grow">Money</span>${icon('plus')}</div>
      <div class="tr-amount setup">Start logging</div>
      <div class="tr-sub">Log income and spending in pounds, and see exactly where your money goes.</div>
    </button>`;
  const m = monthStats(ymNow());
  return `<button class="tracker" data-go="money">
      <div class="tr-top">${icon('card')}<span class="grow">Money · ${ymLabel(m.ym, { month: 'long' })}</span>${icon('chevR')}</div>
      <div class="tr-amount ${m.left < 0 ? 'neg' : ''}">${gbp(m.left)}</div>
      <div class="tr-sub">left this month</div>
      <div class="bar"><i style="width:${m.income ? Math.min(100, (m.out / m.income) * 100) : 0}%"></i></div>
      <div class="tr-foot"><span>In ${gbp(m.income)} · Out ${gbp(m.out)}</span><span>${m.ptw == null ? '' : `${Math.round(m.ptw * 100)}% put to work`}</span></div>
    </button>`;
}

function loanCard(s) {
  if (!s) return `<button class="tracker" data-go="loan-setup">
      <div class="tr-top">${icon('bank')}<span class="grow">Student loan</span>${icon('plus')}</div>
      <div class="tr-amount setup">Set up</div>
      <div class="tr-sub">Track your EMIs and extra payments, and watch your debt-free date move closer.</div>
    </button>`;
  return `<button class="tracker" data-go="loan">
      <div class="tr-top">${icon('bank')}<span class="grow">${esc(state.loan.name)}</span>
        ${s.emiDue ? '<span class="due"><span class="dot"></span>EMI to log</span>' : ''}${icon('chevR')}</div>
      <div class="tr-amount">${inr(s.bal)}</div>
      <div class="tr-sub">remaining</div>
      <div class="bar"><i style="width:${s.repaid * 100}%"></i></div>
      <div class="tr-foot"><span>${(s.repaid * 100).toFixed(1)}% repaid</span><span>Debt-free ${fmtMonth(s.freedom)}</span></div>
    </button>`;
}

/* Money screen */
function moneyView() {
  const ym = moneyMonth, isNow = ym === ymNow(), m = monthStats(ym), prev = monthStats(ymAdd(ym, -1));
  const closed = state.money.closed[ym], grade = closed ? closed.grade : gradeFor(m).grade;
  const due = isNow ? dueRecurring() : [];
  const base = Math.max(m.income, m.out) || 1;
  const seg = (v, cls) => (v > 0 ? `<i class="${cls}" style="width:${(v / base) * 100}%"></i>` : '');
  const cats = Object.entries(m.byCat).sort((a, b) => b[1] - a[1]);
  const trend = [-5, -4, -3, -2, -1, 0].map(i => monthStats(ymAdd(ym, i)));
  const maxT = Math.max(1, ...trend.flatMap(t => [t.income, t.out]));
  const monthTx = state.money.tx.filter(t => t.date.slice(0, 7) === ym).sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);
  const biggest = monthTx.filter(t => t.type === 'expense').sort((a, b) => b.amount - a.amount).slice(0, 5);
  const today = todayISO();
  const canNoSpend = isNow && !state.money.tx.some(t => t.date === today && (t.type === 'expense' || t.type === 'nospend'));
  const canClose = ym < ymNow() && m.txCount && !closed;

  let lastDay = '', txHtml = '';
  for (const t of monthTx) {
    if (t.date !== lastDay) { txHtml += `<div class="day-head">${fmtDayShort(t.date)}</div>`; lastDay = t.date; }
    txHtml += txItem(t);
  }

  return `<div>
    ${topNav('Money')}
    <div class="month-switch">
      <button data-act="month" data-d="-1" aria-label="Previous month">${icon('chevL')}</button>
      <span class="m">${ymLabel(ym)}</span>
      <button data-act="month" data-d="1" ${isNow ? 'disabled' : ''} aria-label="Next month">${icon('chevR')}</button>
    </div>
    ${due.length ? notice('due', `${due.length} recurring item${due.length > 1 ? 's' : ''} due to log`) : ''}
    ${canClose ? notice('close-month', `Close ${ymLabel(ym, { month: 'long' })} and claim your grade`, 'var(--gold)', `data-ym="${ym}"`) : ''}

    <section class="hero">
      <div class="eyebrow">${isNow ? 'Left so far' : 'Left over'}</div>
      <div class="hero-amount ${m.left < 0 ? 'neg' : ''}">${gbp(m.left)}</div>
      <div class="inout">
        <div><div class="k">Money in</div><div class="v pos">${gbp(m.income)}</div></div>
        <div><div class="k">Money out</div><div class="v">${gbp(m.out)}</div></div>
      </div>
      <div class="actions three">
        <button class="btn btn-ghost" data-act="add-income">Income</button>
        <button class="btn btn-primary" data-act="add-expense">Expense</button>
        <button class="btn btn-ghost" data-act="add-transfer">To India</button>
      </div>
      ${canNoSpend ? `<button class="small-btn" data-act="nospend">${icon('leaf')} Mark today as a no-spend day · +${TX_XP.nospend} XP</button>` : ''}
    </section>

    <div class="section-title"><span>Put to work</span><span>${closed ? 'Final grade' : isNow ? 'Grade so far' : 'Projected grade'}</span></div>
    <section class="panel pad">
      <div class="ptw">
        <div><div class="big">${m.ptw == null ? '—' : Math.round(m.ptw * 100) + '%'}</div><div class="muted small">of income saved or sent to the loan</div></div>
        <div class="grade"><b>${grade}</b><span class="muted small">grade</span></div>
      </div>
      <div class="split">${seg(m.living, 'c-living')}${seg(m.loan, 'c-loan')}${seg(m.transfer.family, 'c-family')}${seg(m.saved, 'c-saved')}</div>
      <div class="legend">
        <span><i class="sw c-living"></i>Living<b>${gbp(m.living)}</b></span>
        <span><i class="sw c-loan"></i>Loan<b>${gbp(m.loan)}</b></span>
        <span><i class="sw c-family"></i>Family<b>${gbp(m.transfer.family)}</b></span>
        <span><i class="sw c-saved"></i>Saved<b>${gbp(m.saved)}</b></span>
      </div>
    </section>

    <div class="section-title"><span>Where it went</span><span>vs ${ymLabel(prev.ym, { month: 'short' })}</span></div>
    <section class="panel">${cats.length ? cats.map(([id, v]) => catRow(id, v, prev.byCat[id] || 0, cats[0][1])).join('') : '<p class="empty">No spending logged this month.</p>'}</section>

    <div class="section-title"><span>Six months</span><span class="key"><i class="sw in"></i>In <i class="sw out"></i>Out</span></div>
    <section class="panel pad">
      <div class="trend">${trend.map(t => `<button class="col ${t.ym === ym ? 'sel' : ''}" data-act="set-month" data-ym="${t.ym}">
        <div class="bars"><i class="in" style="height:${(t.income / maxT) * 100}%"></i><i class="out" style="height:${(t.out / maxT) * 100}%"></i></div>
        <span class="lbl">${ymLabel(t.ym, { month: 'short' })}</span></button>`).join('')}</div>
    </section>

    ${biggest.length ? `<div class="section-title"><span>Biggest expenses</span></div>
    <section class="panel">${biggest.map(t => kv(esc(t.note || catOf(t.cat).name), gbp(t.amount), `${catOf(t.cat).name} · ${fmtDayShort(t.date)}`)).join('')}</section>` : ''}

    <div class="section-title"><span>Transactions</span><span>${monthTx.length || ''}</span></div>
    <section class="panel">${txHtml || '<p class="empty">Nothing logged this month yet.</p>'}</section>

    <div class="section-title"><span>Recurring</span></div>
    <section class="panel">${state.money.recurring.length ? state.money.recurring.map(recItem).join('') : '<p class="empty">Tick "Repeat every month" when logging rent, salary or subscriptions, and they will show up here.</p>'}</section>
  </div>`;
}

function catRow(id, v, last, max) {
  const c = catOf(id), diff = v - last;
  const d = !last ? 'New this month' : Math.abs(diff) < 0.5 ? 'Same as last month' : `${diff > 0 ? '↑' : '↓'} ${gbp(Math.abs(diff))} vs last month`;
  const cls = last && diff > 0.5 ? 'neg' : last && diff < -0.5 ? 'pos' : '';
  return `<div class="cat-row"><div class="mark">${icon(c.icon)}</div><div class="main">
    <div class="n"><span>${c.name}</span><b>${gbp(v)}</b></div>
    <div class="bar"><i style="width:${(v / max) * 100}%"></i></div>
    <div class="d ${cls}">${d}</div></div></div>`;
}

function txItem(t) {
  let ic, title, sub = '', amt = '';
  if (t.type === 'transfer') {
    ic = 'send'; title = 'Transfer to India';
    sub = `${PURPOSES[t.purpose] || 'Transfer'} · ${inr(t.inr)} at ₹${(t.inr / t.amount).toFixed(2)}`;
    amt = gbp(-t.amount);
  } else if (t.type === 'nospend') {
    ic = 'leaf'; title = 'No-spend day';
  } else {
    const c = catOf(t.cat);
    ic = c.icon;
    title = t.note ? esc(t.note) : c.name;
    sub = [t.note ? c.name : '', t.recurringId ? 'Recurring' : ''].filter(Boolean).join(' · ');
    amt = t.type === 'income' ? '+' + gbp(t.amount) : gbp(-t.amount);
  }
  return `<div class="hist ${t.type}">
    <div class="mark">${icon(ic)}</div>
    <div class="main"><div class="t">${title}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>
    <div class="amt">${amt}${t.xp ? `<small>+${t.xp} XP</small>` : ''}</div>
    <button class="del" data-act="tx-del" data-id="${t.id}" aria-label="Remove entry">${icon('x')}</button>
  </div>`;
}

function recItem(r) {
  const c = catOf(r.cat);
  return `<div class="hist ${r.type}">
    <div class="mark">${icon(c.icon)}</div>
    <div class="main"><div class="t">${r.note ? esc(r.note) : c.name}</div><div class="s">Every month on the ${ordinal(r.day)}</div></div>
    <div class="amt">${r.type === 'income' ? '+' : ''}${gbp(r.amount)}</div>
    <button class="del" data-act="rec-del" data-id="${r.id}" aria-label="Stop repeating">${icon('x')}</button>
  </div>`;
}

/* Loan screen */
function loanView() {
  const L = state.loan, s = loanStats(), rate = latestRate();
  const history = [...L.log].sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);
  return `<div>
    ${topNav(esc(L.name))}
    ${s.emiDue ? notice('emi', `Your ${fmtMonth(s.nextEmi)} EMI is ready to log`) : ''}
    <section class="hero">
      <div class="eyebrow">Outstanding</div>
      <div class="hero-amount" id="hero-amt">${inr(s.bal)}</div>
      <div class="bar" id="hero-bar"><i style="width:${s.repaid * 100}%"></i></div>
      <div class="hero-meta"><span>${(s.repaid * 100).toFixed(2)}% repaid</span><span>${rate ? `≈ ${gbp(s.bal / rate)}` : `of ${lakh(L.original)}`}</span></div>
      <div class="actions">
        <button class="btn btn-ghost" data-act="emi">Log EMI</button>
        <button class="btn btn-primary" data-act="extra">Pay extra</button>
      </div>
    </section>

    <div class="section-title"><span>Overview</span></div>
    <section class="panel">
      ${kv('Debt-free by', fmtMonth(s.freedom), `originally ${fmtMonth(s.originalEnd)}`)}
      ${kv('Time saved', s.monthsSaved < 0.05 ? '—' : dur(s.monthsSaved), '', 'pos')}
      ${kv('Interest saved', s.interestSaved < 1 ? '—' : lakh(s.interestSaved), '', 'pos')}
      ${kv('Interest this month', inr(s.interestNow), 'goes to the bank', 'neg')}
      ${kv('Extra paid', lakh(s.extraPaid), `${s.extraCount} payment${s.extraCount === 1 ? '' : 's'}`)}
      ${kv('Next EMI', fmtDay(s.nextEmi), `${s.emiCount} logged`)}
    </section>

    <div class="section-title"><span>Plan</span></div>
    <section class="panel pad plan">
      <div class="muted">If you pay extra every month</div>
      <div class="plan-amount"><span id="p-amt"></span> <small>/ month</small></div>
      <input type="range" id="p-range" min="0" max="200000" step="5000" value="${state.settings.plan}" aria-label="Extra payment per month">
      <div id="p-out"></div>
    </section>

    <div class="section-title"><span>History</span><span>${history.length || ''}</span></div>
    <section class="panel">${history.length ? history.map(histItem).join('') : '<p class="empty">No payments logged yet.</p>'}</section>

    <div class="section-title"><span>Loan details</span></div>
    <section class="panel">
      <button class="kv" data-act="terms"><span class="k">Interest rate</span><span class="v">${L.rate}% ${icon('chevR')}</span></button>
      <button class="kv" data-act="terms"><span class="k">Monthly EMI</span><span class="v">${inr(L.emi)} ${icon('chevR')}</span></button>
      <button class="kv" data-act="sync"><span class="k">Sync balance with bank</span><span class="v">${icon('chevR')}</span></button>
    </section>
    <button class="btn btn-text btn-danger btn-block" data-act="remove-loan">Remove loan tracker</button>
  </div>`;
}

function updatePlan() {
  const range = $('#p-range');
  if (!range || !state?.loan) return;
  const x = Number(range.value), bal = Math.max(0, loanBalance());
  range.style.setProperty('--p', (x / Number(range.max)) * 100 + '%');
  $('#p-amt').textContent = inr(x);
  if (bal <= 0) { $('#p-out').innerHTML = '<p class="empty">This loan is fully repaid.</p>'; return; }
  const base = simulate(bal), plan = simulate(bal, x), last = parseISO(lastEmiISO()), rate = latestRate();
  $('#p-out').innerHTML = `
    ${kv('Debt-free by', fmtMonth(addMonths(last, Math.ceil(plan.months))))}
    ${kv('Time left', dur(plan.months))}
    ${kv('Interest still to pay', lakh(plan.interest), '', 'neg')}
    <div class="plan-note">${x > 0
      ? `<b>${dur(base.months - plan.months)}</b> sooner and <b>${lakh(base.interest - plan.interest)}</b> less interest than paying only the EMI.${rate ? ` That's about <b>${gbp(x / rate)}</b> a month from London.` : ''}`
      : 'Slide to see what a monthly extra payment would do.'}</div>`;
}

function histItem(e) {
  const m = {
    emi: ['calendar', 'EMI', `${inr(e.interest)} interest · ${inr(e.principal)} principal`],
    extra: ['bolt', 'Extra payment', `${dur(e.monthsRemoved || 0)} sooner · ${lakh(e.interestSaved || 0)} interest saved`],
    sync: ['sync', 'Balance synced', `set to ${inr(e.amount)}`],
  }[e.type];
  return `<div class="hist ${e.type}">
    <div class="mark">${icon(m[0])}</div>
    <div class="main"><div class="t">${m[1]} <span>· ${fmtDay(e.date)}</span></div><div class="s">${m[2]}</div></div>
    <div class="amt">${e.type === 'sync' ? '' : inr(e.amount)}${e.xp ? `<small>+${e.xp} XP</small>` : ''}</div>
    <button class="del" data-act="del" data-id="${e.id}" aria-label="Remove entry">${icon('x')}</button>
  </div>`;
}

function loanSetupView() {
  const f = (name, label, attrs, help = '') =>
    `<label class="field"><span>${label}</span><input name="${name}" ${attrs} required>${help ? `<small>${help}</small>` : ''}</label>`;
  return `<div>
    ${topNav('New tracker')}
    <h1 class="page-title">Your loan</h1>
    <p class="page-lead">Copy these from your loan statement. They stay on this device.</p>
    <form id="f-loan-setup">
      ${f('name', 'Name', 'value="Student loan" maxlength="30"')}
      ${f('original', 'Original loan amount (₹)', 'inputmode="decimal"', 'The full amount you borrowed.')}
      ${f('balance', 'Outstanding balance now (₹)', 'inputmode="decimal"', 'The closing principal after your latest EMI.')}
      <div class="grid2">
        ${f('rate', 'Interest rate (%)', 'inputmode="decimal"')}
        ${f('emi', 'Monthly EMI (₹)', 'inputmode="decimal"')}
      </div>
      ${f('date', 'Date of your latest EMI', `type="date" value="${todayISO()}"`)}
      <div id="setup-err" class="err"></div>
      <button class="btn btn-primary btn-block">Start tracking</button>
    </form>
  </div>`;
}

function profileView() {
  const g = globalStats(), lv = levelFrom(g.xp), name = state.profile.name;
  const got = new Set(g.unlocked);
  const done = MILESTONES.filter(m => got.has(m.id)), todo = MILESTONES.filter(m => !got.has(m.id));
  const shown = showAllMilestones ? [...done, ...todo] : [...done.slice(-6).reverse(), ...todo.slice(0, 3)];
  const nextTitle = TITLES.find(t => t[0] > lv.lvl);
  const row = m => `<div class="ms ${got.has(m.id) ? 'on' : ''}">
      <div class="c">${got.has(m.id) ? icon('tick') : ''}</div>
      <div><div class="n">${m.name}</div>${m.desc ? `<div class="d">${m.desc}</div>` : ''}</div>
      <div class="x">+${m.xp.toLocaleString('en-IN')} XP</div></div>`;
  return `<div>
    ${topNav('Profile')}
    <section class="profile-head">
      <div class="avatar lg">${ring(lv.into / lv.need, 100)}<span class="ini">${esc(name[0].toUpperCase())}</span></div>
      <h1 class="greet">${esc(name)}</h1>
      <div class="title-chip">${titleFor(lv.lvl)}</div>
      <div class="muted small">Level ${lv.lvl} · ${g.xp.toLocaleString('en-IN')} XP${nextTitle ? ` · ${nextTitle[1]} at level ${nextTitle[0]}` : ''}</div>
    </section>

    <div class="section-title"><span>Record</span></div>
    <div class="statgrid">
      <div><div class="v">${g.streak}</div><div class="k">Current momentum</div></div>
      <div><div class="v">${g.best}</div><div class="k">Best streak</div></div>
      <div><div class="v">${g.questsDone}</div><div class="k">Quests completed</div></div>
      <div><div class="v">${g.closedCount}</div><div class="k">Months closed</div></div>
    </div>

    <div class="section-title"><span>Milestones</span><span>${done.length} / ${MILESTONES.length}</span></div>
    <section class="panel">
      ${shown.map(row).join('')}
      <button class="more" data-act="all-ms">${showAllMilestones ? 'Show less' : `Show all ${MILESTONES.length}`}</button>
    </section>

    <div class="section-title"><span>Titles</span></div>
    <section class="panel">${TITLES.map(([l, t]) => `<div class="ms ${lv.lvl >= l ? 'on' : ''}"><div class="c">${lv.lvl >= l ? icon('tick') : ''}</div><div><div class="n">${t}</div></div><div class="x">Level ${l}</div></div>`).join('')}</section>

    <div class="section-title"><span>Data</span></div>
    <section class="panel">
      <button class="kv" data-act="backup"><span class="k">Export backup</span><span class="v"><small>${state.lastBackup ? fmtDay(state.lastBackup) : 'never'}</small>${icon('chevR')}</span></button>
      <label class="kv"><span class="k">Restore from backup</span><span class="v">${icon('chevR')}</span><input type="file" id="f-import" accept="application/json,.json" hidden></label>
      <button class="kv" data-act="sound"><span class="k">Sounds</span><span class="v">${state.settings.sound ? 'On' : 'Off'}</span></button>
    </section>
    <button class="btn btn-text btn-danger btn-block" data-act="reset">Erase all data</button>
    <p class="foot">Your data is stored only on this device.</p>
  </div>`;
}

/* ---------- 7. Sheets ---------- */
let sheetOnClose = null;
function openSheet(html, { center = false, onClose = null } = {}) {
  sheetOnClose = onClose;
  $('#modal-root').innerHTML = `<div class="backdrop ${center ? 'center' : ''}"><div class="sheet" role="dialog">${center ? '' : '<div class="grip"></div>'}${html}</div></div>`;
}
function closeSheet() {
  $('#modal-root').innerHTML = '';
  const cb = sheetOnClose;
  sheetOnClose = null;
  cb && cb();
}
const sheetButtons = label => `<div class="sheet-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary">${label}</button></div>`;
const defaultDate = () => (moneyMonth === ymNow() || view !== 'money' ? todayISO() : ymLastDay(moneyMonth));

function txSheet(type) {
  const isInc = type === 'income', cats = isInc ? INCOME_CATS : EXPENSE_CATS;
  openSheet(`
    <h2>${isInc ? 'Money in' : 'Money out'}</h2>
    <p class="lead">${isInc ? 'Salary, tips, refunds: anything that lands in your account.' : 'Amount, category, done.'}</p>
    <form id="f-tx" data-type="${type}">
      <label class="field"><span>Amount (£)</span><input name="amount" inputmode="decimal" autocomplete="off" placeholder="${isInc ? '2,400' : '12.50'}"></label>
      <div class="cats">${cats.map((c, i) => `<label class="cat"><input type="radio" name="cat" value="${c.id}" ${isInc && i === 0 ? 'checked' : ''} hidden>${icon(c.icon)}<span>${c.name}</span></label>`).join('')}</div>
      <div class="grid2">
        <label class="field"><span>Note</span><input name="note" maxlength="40" placeholder="${isInc ? 'October salary' : 'Tesco'}"></label>
        <label class="field"><span>Date</span><input name="date" type="date" value="${defaultDate()}"></label>
      </div>
      <label class="check-row"><input type="checkbox" name="recurring"> Repeat every month</label>
      <div id="tx-err" class="err"></div>
      ${sheetButtons('Save')}
    </form>`);
  setTimeout(() => $('#f-tx [name=amount]')?.focus(), 80);
}

function transferSheet(prefill = '') {
  const purposes = Object.entries(PURPOSES).map(([id, n]) =>
    `<label class="purpose"><input type="radio" name="purpose" value="${id}" ${(prefill ? id === 'extra' : id === 'emi') ? 'checked' : ''} hidden>${n}</label>`).join('');
  openSheet(`
    <h2>Transfer to India</h2>
    <p class="lead">What left in pounds, and what arrived in rupees. Your exchange rate is tracked over time.</p>
    <form id="f-transfer">
      <div class="grid2">
        <label class="field"><span>Sent (£)</span><input name="gbp" inputmode="decimal" autocomplete="off" value="${prefill}"></label>
        <label class="field"><span>Received (₹)</span><input name="inr" inputmode="decimal" autocomplete="off"></label>
      </div>
      <div class="rate-line" id="rate-line"></div>
      <div class="purposes">${purposes}</div>
      <label class="field"><span>Date</span><input name="date" type="date" value="${todayISO()}"></label>
      <div class="preview" id="t-preview"></div>
      <div id="tr-err" class="err"></div>
      ${sheetButtons('Save transfer')}
    </form>`);
  updateTransferPreview();
}

function updateTransferPreview() {
  const f = $('#f-transfer');
  if (!f) return;
  const g = num(f.elements.gbp.value), r = num(f.elements.inr.value), p = f.elements.purpose.value, last = latestRate();
  $('#rate-line').textContent = g && r ? `₹${(r / g).toFixed(2)} per £1${last ? ` · last time ₹${last.toFixed(2)}` : ''}` : last ? `Last rate: ₹${last.toFixed(2)} per £1` : '';
  const out = $('#t-preview');
  if (p === 'extra' && state.loan && r) {
    const bal = Math.max(0, loanBalance()), now = simulate(bal), after = simulate(bal - Math.min(r, bal));
    out.innerHTML = kv('Also logged as', 'Extra loan payment') + kv('Debt-free', `${dur(now.months - after.months)} sooner`, '', 'pos') + kv('Interest saved', lakh(now.interest - after.interest), '', 'pos');
  } else if (p === 'emi') out.innerHTML = '<p class="empty">Log the EMI itself from the loan tracker when the bank debits it.</p>';
  else out.innerHTML = '';
}

function paySheet(type) {
  const s = loanStats(), isEmi = type === 'emi';
  if (s.bal <= 0) return toast('This loan is already fully repaid.');
  const chips = [10000, 25000, 50000, 100000].map(v => `<button type="button" class="chip" data-amt="${v}">${lakh(v)}</button>`).join('');
  openSheet(`
    <h2>${isEmi ? 'Log EMI' : 'Pay extra'}</h2>
    <p class="lead">${isEmi ? 'Record your monthly instalment once it has been debited.' : 'Every rupee above your EMI goes straight to the principal.'}</p>
    <form id="f-pay" data-type="${type}">
      <label class="field"><span>Amount (₹)</span><input id="m-amt" inputmode="decimal" autocomplete="off" value="${isEmi ? state.loan.emi : ''}" placeholder="50,000"></label>
      ${isEmi ? '' : `<div class="chips">${chips}</div>`}
      <label class="field"><span>Date</span><input id="m-date" type="date" value="${isEmi ? toISO(s.nextEmi) : todayISO()}"></label>
      <div class="preview" id="m-preview"></div>
      ${sheetButtons(isEmi ? 'Log EMI' : 'Confirm payment')}
    </form>`);
  updatePreview();
  if (!isEmi) setTimeout(() => $('#m-amt')?.focus(), 80);
}

function updatePreview() {
  const form = $('#f-pay'), out = $('#m-preview');
  if (!form || !out) return;
  const a = num($('#m-amt').value), bal = Math.max(0, loanBalance());
  if (!a) { out.innerHTML = ''; return; }
  if (form.dataset.type === 'emi') {
    const i = Math.min(a, (bal * state.loan.rate) / 1200);
    out.innerHTML = kv('To interest', inr(i), '', 'neg') + kv('To principal', inr(Math.max(0, a - i)), '', 'pos');
  } else {
    const now = simulate(bal), after = simulate(bal - Math.min(a, bal)), months = now.months - after.months;
    out.innerHTML = kv('Debt-free', `${dur(months)} sooner`, '', 'pos')
      + kv('Interest saved', lakh(now.interest - after.interest), '', 'pos')
      + kv('Reward', `+${award(extraXp(a, months)).xp.toLocaleString('en-IN')} XP`);
  }
}

function termsSheet() {
  openSheet(`
    <h2>Loan terms</h2>
    <p class="lead">Your rate is floating. Update these whenever the bank changes them.</p>
    <form id="f-terms">
      <div class="grid2">
        <label class="field"><span>Interest rate (%)</span><input name="rate" inputmode="decimal" value="${state.loan.rate}"></label>
        <label class="field"><span>Monthly EMI (₹)</span><input name="emi" inputmode="decimal" value="${state.loan.emi}"></label>
      </div>
      ${sheetButtons('Save')}
    </form>`);
}

function syncSheet() {
  openSheet(`
    <h2>Sync balance</h2>
    <p class="lead">The app estimates your balance. Now and then, enter the real outstanding principal from your bank app so everything stays accurate.</p>
    <form id="f-sync">
      <label class="field"><span>Outstanding balance (₹)</span><input name="bal" inputmode="decimal" placeholder="${Math.round(loanBalance()).toLocaleString('en-IN')}"></label>
      ${sheetButtons('Sync')}
    </form>`);
}

function dueSheet() {
  const due = dueRecurring();
  if (!due.length) return closeSheet();
  openSheet(`
    <h2>Recurring items</h2>
    <p class="lead">Due this month. Confirm what has been paid or received.</p>
    <div class="panel">${due.map(({ r, date }) => {
      const c = catOf(r.cat);
      return `<div class="hist ${r.type}"><div class="mark">${icon(c.icon)}</div>
        <div class="main"><div class="t">${r.note ? esc(r.note) : c.name}</div><div class="s">${r.type === 'income' ? '+' : ''}${gbp(r.amount)} · due ${fmtDayShort(date)}</div></div>
        <button class="btn btn-ghost btn-sm" data-act="rec-log" data-id="${r.id}">Log</button></div>`;
    }).join('')}</div>
    <div class="sheet-actions" style="margin-top:16px"><button class="btn btn-ghost" data-close>Later</button><button class="btn btn-primary" data-act="rec-log-all">Log all</button></div>`);
}

function closeMonthSheet(ym) {
  const m = monthStats(ym), g = gradeFor(m);
  openSheet(`
    <div class="reward-kicker">${ymLabel(ym)} · month close</div>
    <div class="grade-big">${g.grade}</div>
    <div class="panel left">
      ${kv('Money in', gbp(m.income), '', 'pos')}
      ${kv('Living costs', gbp(m.living))}
      ${kv('Sent to the loan', gbp(m.loan))}
      ${kv('Put to work', m.ptw == null ? '—' : Math.round(m.ptw * 100) + '%', '', 'pos')}
      ${kv('Days logged', m.logDays)}
      ${kv('Left over', gbp(m.left), '', m.left >= 0 ? 'pos' : 'neg')}
    </div>
    <div class="reward-xp">+${g.xp} XP</div>
    <button class="btn btn-primary btn-block" data-act="claim-month" data-ym="${ym}">Claim and close ${ymLabel(ym, { month: 'long' })}</button>
    ${m.left > 0 && state.loan ? `<button class="btn btn-text btn-block" data-act="leftover" data-amt="${Math.floor(m.left)}">Send the ${gbp(Math.floor(m.left))} left over to the loan</button>` : ''}`,
    { center: true });
}

function showRewards(list) {
  const r = list.shift();
  if (!r) return;
  r.level ? sfx.level() : sfx.chime();
  haptic([12, 40, 12]);
  confetti(null, 50);
  openSheet(`
    <div class="reward-kicker">${r.kicker}</div>
    <div class="reward-mark">${icon(r.icon || 'star')}</div>
    <div class="reward-title">${r.title}</div>
    ${r.text ? `<p class="reward-text">${r.text}</p>` : ''}
    <div class="reward-xp">${r.xp ? `+${r.xp.toLocaleString('en-IN')} XP` : ''}</div>
    <button class="btn btn-primary btn-block" data-close>Continue</button>`,
    { center: true, onClose: () => setTimeout(() => showRewards(list), 250) });
}

/* ---------- 8. Actions ---------- */
const xpLabel = e => `+${e.xp} XP${e.mult > 1 ? ` ×${e.mult.toFixed(1)}` : ''}`;

// Celebrate an action: sound, haptics, toast, then any rewards it unlocked
function finishAction(g0, msg, { big = false, el = null } = {}) {
  const g1 = globalStats();
  if (!g0.today && g1.today) msg += ` · day ${g1.streak} of momentum`;
  if (big) { sfx.chime(); haptic([15, 50, 30]); confetti(el, 60); }
  else { sfx.soft(); haptic(15); }
  toast(msg, big ? 5500 : 3500);
  const rewards = rewardsBetween(g0, g1);
  if (rewards.length) setTimeout(() => showRewards(rewards), big ? 1300 : 800);
}

function createTx(t) {
  const a = award(TX_XP[t.type]);
  Object.assign(t, { id: uid(), ts: Date.now(), xp: a.xp, mult: a.mult });
  if (t.type === 'expense') state.money.tx = state.money.tx.filter(x => !(x.type === 'nospend' && x.date === t.date));
  state.money.tx.push(t);
  // Money sent home for the loan also counts as an extra loan payment
  if (t.type === 'transfer' && t.purpose === 'extra' && state.loan && loanBalance() > 0) t.loanId = makeLoanEntry('extra', t.inr, t.date).id;
  return t;
}

function addTx(t, msgFor) {
  const g0 = globalStats();
  createTx(t);
  save();
  render();
  finishAction(g0, msgFor(t), { big: !!t.loanId || (t.type === 'income' && t.amount >= 500) });
}

function logPayment(type, amount, date) {
  const g0 = globalStats(), before = loanStats();
  const e = makeLoanEntry(type, amount, date);
  save();
  const after = loanStats();
  render();
  const amt = $('#hero-amt'), bar = $('#hero-bar > i');
  if (amt) countTo(amt, before.bal, after.bal);
  if (bar) { bar.style.transition = 'none'; bar.style.width = before.repaid * 100 + '%'; void bar.offsetWidth; bar.style.transition = ''; bar.style.width = after.repaid * 100 + '%'; }
  const msg = type === 'extra'
    ? `<b>${inr(amount)}</b> paid · ${dur(e.monthsRemoved)} sooner · ${lakh(e.interestSaved)} interest saved · <b>${xpLabel(e)}</b>`
    : `EMI logged · <b>${inr(e.principal)}</b> to principal · <b>${xpLabel(e)}</b>`;
  finishAction(g0, msg, { big: type === 'extra', el: amt });
}

const forms = {
  'f-welcome'(f) {
    const name = f.elements.name.value.trim();
    if (!name) return;
    state = upgrade({ version: 2, profile: { name }, loan: null, lastBackup: null, createdAt: todayISO() });
    save();
    view = 'home';
    animateNext = true;
    render();
    sfx.soft();
  },

  'f-loan-setup'(f) {
    const d = Object.fromEntries(new FormData(f));
    const err = msg => { $('#setup-err').textContent = msg; };
    const loan = { name: d.name.trim() || 'Student loan', original: num(d.original), setupBalance: num(d.balance), rate: num(d.rate), emi: num(d.emi), setupDate: d.date, log: [] };
    if (!(loan.original > 0 && loan.setupBalance > 0 && loan.rate > 0 && loan.emi > 0)) return err('Fill in all the numbers.');
    if (loan.setupBalance > loan.original) return err("The balance can't be more than the original loan.");
    const base = simulate(loan.setupBalance, 0, loan);
    if (!isFinite(base.months)) return err("That EMI doesn't cover the monthly interest. Check the numbers.");
    loan.baselineMonths = base.months;
    loan.baselineInterest = base.interest;
    state.loan = loan;
    save();
    view = 'loan';
    animateNext = true;
    history.replaceState({ v: 'loan' }, '');
    render();
    scrollTo(0, 0);
    sfx.chime();
    confetti($('#hero-amt'), 40);
    toast('Loan tracker ready. Every payment you log now counts.');
  },

  'f-pay'() {
    const a = num($('#m-amt').value);
    if (!a) return $('#m-amt').focus();
    const date = $('#m-date').value || todayISO(), type = $('#f-pay').dataset.type;
    closeSheet();
    logPayment(type, a, date);
  },

  'f-tx'(f) {
    const type = f.dataset.type, amount = num(f.elements.amount.value), catId = f.elements.cat.value;
    const err = msg => { $('#tx-err').textContent = msg; };
    if (!amount) return err('Enter an amount.');
    if (!catId) return err('Pick a category.');
    const date = f.elements.date.value || todayISO(), note = f.elements.note.value.trim();
    const t = { type, amount, cat: catId, note, date };
    if (f.elements.recurring.checked) {
      const r = { id: uid(), type, amount, cat: catId, note, day: parseISO(date).getDate() };
      state.money.recurring.push(r);
      t.recurringId = r.id;
    }
    closeSheet();
    moneyMonth = date.slice(0, 7);
    addTx(t, x => `${x.note ? esc(x.note) : catOf(x.cat).name} <b>${type === 'income' ? '+' : '−'}${gbp(x.amount)}</b> · <b>${xpLabel(x)}</b>`);
  },

  'f-transfer'(f) {
    const amount = num(f.elements.gbp.value), inrAmt = num(f.elements.inr.value), purpose = f.elements.purpose.value;
    if (!amount || !inrAmt) return ($('#tr-err').textContent = 'Enter both the pounds sent and the rupees received.');
    const date = f.elements.date.value || todayISO();
    closeSheet();
    moneyMonth = date.slice(0, 7);
    addTx({ type: 'transfer', amount, inr: inrAmt, purpose, date }, t => {
      const e = t.loanId && state.loan.log.find(x => x.id === t.loanId);
      return e
        ? `<b>${gbp(t.amount)} → ${inr(t.inr)}</b> · loan ${dur(e.monthsRemoved)} sooner · <b>+${t.xp + e.xp} XP</b>`
        : `<b>${gbp(t.amount)} → ${inr(t.inr)}</b> at ₹${(t.inr / t.amount).toFixed(2)} · <b>${xpLabel(t)}</b>`;
    });
  },

  'f-terms'(f) {
    const rate = num(f.elements.rate.value), emi = num(f.elements.emi.value);
    if (!(rate > 0 && emi > 0)) return toast('Enter a valid rate and EMI.');
    if (!isFinite(simulate(loanBalance(), 0, { rate, emi }).months)) return toast("That EMI doesn't cover the monthly interest.");
    Object.assign(state.loan, { rate, emi });
    save();
    closeSheet();
    render();
    toast('Loan terms updated.');
  },

  'f-sync'(f) {
    const raw = f.elements.bal.value, real = num(raw);
    if (!raw.trim() || !(real >= 0)) return toast('Enter the balance from your bank app.');
    if (real > state.loan.original) return toast("That's more than the original loan. Check the number.");
    const bal = loanBalance();
    state.loan.log.push({ id: uid(), ts: Date.now(), type: 'sync', date: todayISO(), amount: real, principal: bal - real, interest: 0, xp: 0 });
    save();
    closeSheet();
    render();
    toast('Balance synced with your bank.');
  },
};

function logRecurring(r, date) {
  return createTx({ type: r.type, amount: r.amount, cat: r.cat, note: r.note, date, recurringId: r.id });
}

function act(a, el) {
  const d = el.dataset;
  switch (a) {
    case 'emi': case 'extra': return paySheet(a);
    case 'terms': return termsSheet();
    case 'sync': return syncSheet();
    case 'add-expense': return txSheet('expense');
    case 'add-income': return txSheet('income');
    case 'add-transfer': return transferSheet();
    case 'due': return dueSheet();
    case 'close-month': return closeMonthSheet(d.ym);
    case 'nospend':
      return addTx({ type: 'nospend', date: todayISO() }, t => `No-spend day · <b>${xpLabel(t)}</b>`);
    case 'month': {
      const next = ymAdd(moneyMonth, Number(d.d));
      if (next <= ymNow()) { moneyMonth = next; render(); }
      return;
    }
    case 'set-month': moneyMonth = d.ym; render(); return;
    case 'rec-log': {
      const item = dueRecurring().find(x => x.r.id === d.id);
      if (!item) return;
      const g0 = globalStats(), t = logRecurring(item.r, item.date);
      save(); render();
      dueRecurring().length ? dueSheet() : closeSheet();
      return finishAction(g0, `${t.note ? esc(t.note) : catOf(t.cat).name} logged · <b>${xpLabel(t)}</b>`);
    }
    case 'rec-log-all': {
      const g0 = globalStats(), items = dueRecurring();
      const xp = sum(items.map(x => logRecurring(x.r, x.date)), t => t.xp);
      save(); closeSheet(); render();
      return finishAction(g0, `${items.length} recurring item${items.length > 1 ? 's' : ''} logged · <b>+${xp} XP</b>`);
    }
    case 'rec-del':
      if (!confirm('Stop repeating this every month? Past entries stay.')) return;
      state.money.recurring = state.money.recurring.filter(r => r.id !== d.id);
      save(); render();
      return;
    case 'tx-del': {
      if (!confirm('Remove this entry?')) return;
      const t = state.money.tx.find(x => x.id === d.id);
      state.money.tx = state.money.tx.filter(x => x.id !== d.id);
      if (t?.loanId && state.loan) state.loan.log = state.loan.log.filter(e => e.id !== t.loanId);
      save(); render();
      return;
    }
    case 'del':
      if (!confirm('Remove this entry? Use this to fix a mistake.')) return;
      state.loan.log = state.loan.log.filter(e => e.id !== d.id);
      state.money.tx.forEach(t => { if (t.loanId === d.id) delete t.loanId; });
      save(); render();
      return;
    case 'claim-month': {
      const m = monthStats(d.ym), gr = gradeFor(m), g0 = globalStats();
      state.money.closed[d.ym] = { grade: gr.grade, score: gr.score, xp: gr.xp, ptw: m.ptw ?? 0, ts: Date.now() };
      save(); closeSheet(); render();
      return finishAction(g0, `${ymLabel(d.ym, { month: 'long' })} closed · grade <b>${gr.grade}</b> · <b>+${gr.xp} XP</b>`, { big: true });
    }
    case 'leftover': closeSheet(); return transferSheet(d.amt);
    case 'remove-loan':
      if (!confirm('Remove the loan tracker and all its history?')) return;
      state.loan = null;
      save();
      history.back();
      return;
    case 'all-ms': showAllMilestones = !showAllMilestones; render(); return;
    case 'sound': state.settings.sound = !state.settings.sound; save(); render(); sfx.tap(); return;
    case 'backup': return exportBackup();
    case 'reset':
      if (confirm('Erase all your data on this device?') && confirm('This cannot be undone. Have you exported a backup?')) {
        localStorage.removeItem(STORE_KEY);
        state = null;
        view = 'home';
        history.replaceState({ v: 'home' }, '');
        animateNext = true;
        render();
      }
      return;
  }
}

function exportBackup() {
  state.lastBackup = todayISO();
  save();
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `compound-backup-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  render();
  toast('Backup saved to your Downloads.');
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || !(data.profile || data.hero)) throw new Error('not a backup');
      if (!confirm('Replace everything on this device with this backup?')) return;
      state = upgrade(data);
      save();
      render();
      toast('Backup restored.');
    } catch { toast("That file isn't a Compound backup."); }
  };
  reader.readAsText(file);
}

// Once a week: a short recap of last week's quests
function weeklyRecap() {
  const cur = weekStart(todayISO());
  if (state.seenWeek === cur) return;
  const first = !state.seenWeek;
  state.seenWeek = cur;
  save();
  if (first) return;
  const s = questStatus(addDays(cur, -7), activity());
  if (!s.list.some(q => q.val > 0)) return;
  showRewards([{
    kicker: 'Last week', title: `${s.done} of 3 quests`, icon: 'trophy',
    text: s.chest ? 'A full week. Bonus earned. New quests are ready.' : 'New quests are ready for this week.',
    xp: s.done * QUEST_XP + (s.chest ? CHEST_XP : 0),
  }]);
}

/* ---------- 9. Effects ---------- */
function toast(msg, ms = 3500) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = msg;
  $('#toasts').appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, ms);
}

function countTo(el, from, to, ms = 1200) {
  const t0 = performance.now();
  const step = t => {
    const k = Math.min(1, (t - t0) / ms), eased = 1 - Math.pow(1 - k, 3);
    el.textContent = inr(from + (to - from) * eased);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function haptic(pattern) { try { navigator.vibrate && navigator.vibrate(pattern); } catch { /* not supported */ } }

let actx = null;
function tone(freq, len, type = 'sine', vol = 0.05, when = 0) {
  if (!state || !state.settings.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime + when, o = actx.createOscillator(), g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(actx.destination);
    o.start(t);
    o.stop(t + len + 0.05);
  } catch { /* audio not available */ }
}
const sfx = {
  tap: () => tone(880, 0.06, 'sine', 0.03),
  soft: () => { tone(659.25, 0.35, 'sine', 0.05); tone(987.77, 0.45, 'sine', 0.035, 0.07); },
  chime: () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.7, 'sine', 0.05, i * 0.085)),
  level: () => [392, 523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, 0.8, 'triangle', 0.035, i * 0.1)),
};

const fx = $('#fx'), ctx = fx.getContext('2d');
let parts = [], running = false;
function sizeFx() {
  const r = window.devicePixelRatio || 1;
  fx.width = innerWidth * r;
  fx.height = innerHeight * r;
  ctx.setTransform(r, 0, 0, r, 0, 0);
}
function confetti(el, n = 50) {
  const css = getComputedStyle(document.documentElement);
  const colors = ['--accent', '--gold', '--ink', '--warn'].map(v => css.getPropertyValue(v).trim());
  const b = el ? el.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 3, width: 0, height: 0 };
  const x = b.left + b.width / 2, y = b.top + b.height / 2;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3, sp = 4 + Math.random() * 7;
    parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, w: 2 + Math.random() * 2.5, h: 6 + Math.random() * 6,
      c: colors[i % colors.length], r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.25 });
  }
  if (!running) { running = true; requestAnimationFrame(tick); }
}
function tick() {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  for (const p of parts) {
    p.vy += 0.16; p.vx *= 0.98; p.vy *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life -= 0.009;
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.4));
    ctx.fillStyle = p.c;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.r);
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r)));
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  parts = parts.filter(p => p.life > 0 && p.y < innerHeight + 40);
  if (parts.length) requestAnimationFrame(tick);
  else { running = false; ctx.clearRect(0, 0, innerWidth, innerHeight); }
}

/* ---------- 10. Start-up ---------- */
addEventListener('resize', sizeFx);
sizeFx();

document.addEventListener('click', ev => {
  const t = ev.target;
  if (t.classList.contains('backdrop') || t.closest('[data-close]')) return closeSheet();
  const chip = t.closest('[data-amt]');
  if (chip && chip.classList.contains('chip')) { $('#m-amt').value = Number(chip.dataset.amt).toLocaleString('en-IN'); return updatePreview(); }
  const el = t.closest('[data-go],[data-back],[data-act],[data-soon]');
  if (!el) return;
  if (el.dataset.go) return go(el.dataset.go);
  if ('back' in el.dataset) return history.back();
  if (el.dataset.soon) { sfx.tap(); return toast(`<b>${el.dataset.soon}</b> arrives in a coming update.`); }
  act(el.dataset.act, el);
});
document.addEventListener('submit', ev => {
  ev.preventDefault();
  forms[ev.target.id]?.(ev.target);
});
document.addEventListener('input', ev => {
  if (ev.target.id === 'm-amt') updatePreview();
  if (ev.target.closest('#f-transfer')) updateTransferPreview();
  if (ev.target.id === 'p-range') { state.settings.plan = Number(ev.target.value); updatePlan(); }
});
document.addEventListener('change', ev => {
  if (ev.target.closest('#f-transfer')) updateTransferPreview();
  if (ev.target.id === 'p-range') save();
  if (ev.target.id === 'f-import' && ev.target.files[0]) importBackup(ev.target.files[0]);
});
// Android's back button / gesture moves between screens instead of closing the app
addEventListener('popstate', ev => {
  if ($('#modal-root').innerHTML) { sheetOnClose = null; $('#modal-root').innerHTML = ''; }
  view = ev.state?.v || 'home';
  animateNext = true;
  render();
});

load();
history.replaceState({ v: 'home' }, '');
render();
if (state) setTimeout(weeklyRecap, 700);

// Offline support + "install as app" (only works on a real web address)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js');
// Ask the phone not to auto-delete saved data
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
