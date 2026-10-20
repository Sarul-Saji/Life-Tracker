'use strict';
/* =========================================================
   LIFE QUEST
   ---------------------------------------------------------
   Map of this file:
     1. Helpers ......... money, dates, icons
     2. Save / load ..... your data lives ONLY on this device
     3. Loan engine ..... the maths behind the loan tracker
     4. Progress ........ XP, levels, milestones
     5. Screens ......... welcome, home, loan, profile
     6. Sheets .......... pop-up forms (pay, edit, sync)
     7. Actions ......... what happens when you tap things
     8. Effects ......... toasts, sound, haptics, confetti
     9. Start-up
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
const num = s => Number(String(s).replace(/[^0-9.]/g, ''));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => toISO(new Date());
const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + Math.round(n)); return x; };
const fmtMonth = d => isNaN(d) ? 'Never' : d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
const fmtDay = d => (typeof d === 'string' ? parseISO(d) : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const dur = m => !isFinite(m) ? 'never' : m < 12 ? `${m.toFixed(1)} months` : `${(m / 12).toFixed(1)} years`;
const daysSince = iso => iso ? (Date.now() - parseISO(iso)) / 864e5 : Infinity;

const ICONS = {
  bank: '<path d="M3 10 12 4l9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8"/><path d="M3 20h18"/>',
  card: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h3"/>',
  bowl: '<path d="M4 11h16a8 8 0 0 1-16 0Z"/><path d="M12 4v4M8.5 5.5l1 2.5M15.5 5.5l-1 2.5"/>',
  dumbbell: '<path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/>',
  check: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
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
};
const icon = name => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

/* ---------- 2. Save / load ----------
   Everything is stored in this phone's browser storage under one key.
   Nothing is ever sent to the internet. */
const STORE_KEY = 'lifequest.v1';
const DEFAULT_SETTINGS = { sound: true, plan: 50000 };
let state = null;         // all your data
let view = 'home';        // which screen is showing
let animateNext = true;   // fade the next screen in?
let showAllMilestones = false;

function load() {
  try { state = JSON.parse(localStorage.getItem(STORE_KEY)); } catch { state = null; }
  if (state && state.version === 1) state = migrateV1(state);
  if (state) state.settings = Object.assign({}, DEFAULT_SETTINGS, state.settings);
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch { toast('Could not save. Please export a backup from your profile.'); }
}
// The first (dragon) version stored things slightly differently
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

/* ---------- 3. Loan engine ----------
   simulate() plays the loan forward month by month:
   the bank charges interest on what's left, your EMI (+ any extra)
   pays that interest first, and the rest reduces the balance.
   It returns how many months until the loan is gone and the
   total interest you'd pay on the way. */
function simulate(balance, extra = 0, loan = state.loan) {
  const r = loan.rate / 1200;          // yearly % → monthly fraction
  const pay = loan.emi + extra;
  let b = balance, months = 0, interest = 0;
  while (b > 0.5) {
    const i = b * r;
    if (pay <= i || months > 1200) return { months: Infinity, interest: Infinity };
    interest += i;
    if (pay - i >= b) { months += (b + i) / pay; b = 0; }   // final, partial month
    else { b -= pay - i; months += 1; }
  }
  return { months, interest };
}

// Current balance = balance at setup − all principal paid since
const loanBalance = () => state.loan.setupBalance - state.loan.log.reduce((s, e) => s + e.principal, 0);
const lastEmiISO = () => state.loan.log.filter(e => e.type === 'emi').reduce((d, e) => (e.date > d ? e.date : d), state.loan.setupDate);

// Every number on the loan screens is worked out fresh from the payment log
function loanStats() {
  const L = state.loan;
  if (!L) return null;
  const bal = Math.max(0, loanBalance());
  const emis = L.log.filter(e => e.type === 'emi');
  const extras = L.log.filter(e => e.type === 'extra');
  const proj = simulate(bal);
  const interestPaid = L.log.reduce((s, e) => s + (e.interest || 0), 0);
  const last = parseISO(lastEmiISO());
  const s = {
    bal,
    repaid: Math.min(1, Math.max(0, 1 - bal / L.original)),
    emiCount: emis.length,
    extraCount: extras.length,
    extraPaid: extras.reduce((t, e) => t + e.amount, 0),
    biggest: extras.reduce((m, e) => Math.max(m, e.amount), 0),
    interestNow: bal * L.rate / 1200,
    // compared with the plan on day one (EMI only, nothing extra):
    monthsSaved: L.baselineMonths - (emis.length + proj.months),
    interestSaved: L.baselineInterest - (interestPaid + proj.interest),
    nextEmi: addMonths(last, 1),
    freedom: bal <= 0 ? last : addMonths(last, Math.ceil(proj.months)),
    originalEnd: addMonths(parseISO(L.setupDate), Math.ceil(L.baselineMonths)),
  };
  s.emiDue = bal > 0 && new Date() >= s.nextEmi;
  const unlocked = MILESTONES.filter(m => m.test(s));
  s.unlocked = unlocked.map(m => m.id);
  s.xp = L.log.reduce((t, e) => t + (e.xp || 0), 0) + unlocked.reduce((t, m) => t + m.xp, 0);
  return s;
}

/* ---------- 4. Progress: XP, levels, milestones ---------- */
const XP = { emi: 150, perRupee: 1 / 100, perMonthSaved: 50 };   // ₹50,000 extra ≈ 500 XP + time bonus
const extraXp = (amount, monthsSaved) => Math.round(amount * XP.perRupee + monthsSaved * XP.perMonthSaved);

function levelFrom(xp) {
  let lvl = 1, need = 200;
  while (xp >= need) { xp -= need; lvl++; need = 200 + (lvl - 1) * 100; }
  return { lvl, into: xp, need };
}
const totalXp = () => { const s = loanStats(); return s ? s.xp : 0; };

const MILESTONES = [
  { id: 'first-emi', name: 'First EMI logged', desc: 'The habit begins', xp: 100, test: s => s.emiCount >= 1 },
  { id: 'first-extra', name: 'First extra payment', desc: 'Straight to the principal', xp: 300, test: s => s.extraCount >= 1 },
  { id: 'hit-50k', name: '₹50,000 in one payment', desc: 'A serious dent', xp: 300, test: s => s.biggest >= 50000 },
  { id: 'saved-1l', name: '₹1 lakh interest saved', desc: 'Money the bank will never see', xp: 300, test: s => s.interestSaved >= 1e5 },
  { id: 'time-6', name: 'Six months sooner', desc: 'Debt-free date moved by half a year', xp: 400, test: s => s.monthsSaved >= 6 },
  { id: 'extra-5', name: 'Five extra payments', desc: 'Consistency compounds', xp: 500, test: s => s.extraCount >= 5 },
  { id: 'hit-1l', name: '₹1 lakh in one payment', desc: 'A decisive blow', xp: 600, test: s => s.biggest >= 100000 },
  { id: 'saved-5l', name: '₹5 lakh interest saved', desc: '', xp: 800, test: s => s.interestSaved >= 5e5 },
  { id: 'time-12', name: 'One year sooner', desc: 'A whole year returned to you', xp: 800, test: s => s.monthsSaved >= 12 },
  { id: 'emi-12', name: 'Twelve EMIs logged', desc: 'A full year of showing up', xp: 800, test: s => s.emiCount >= 12 },
  { id: 'extra-12', name: 'Twelve extra payments', desc: 'A year of discipline', xp: 1000, test: s => s.extraCount >= 12 },
  { id: 'saved-10l', name: '₹10 lakh interest saved', desc: '', xp: 1500, test: s => s.interestSaved >= 1e6 },
  { id: 'time-60', name: 'Five years sooner', desc: '', xp: 2000, test: s => s.monthsSaved >= 60 },
  { id: 'saved-25l', name: '₹25 lakh interest saved', desc: '', xp: 3000, test: s => s.interestSaved >= 2.5e6 },
  { id: 'time-120', name: 'Ten years sooner', desc: 'A decade given back', xp: 4000, test: s => s.monthsSaved >= 120 },
];
for (let p = 5; p <= 100; p += 5) {
  MILESTONES.push({
    id: 'repaid-' + p,
    name: p === 100 ? 'Debt-free' : `${p}% repaid`,
    desc: p === 100 ? 'The loan is gone. You are free.' : p % 25 === 0 ? 'A major milestone' : '',
    xp: p === 100 ? 10000 : p % 25 === 0 ? 1500 : 400,
    test: s => s.repaid >= p / 100 - 1e-9,
  });
}

/* ---------- 5. Screens ---------- */
function render() {
  const app = $('#app');
  const screens = { home: homeView, loan: loanView, 'loan-setup': loanSetupView, profile: profileView };
  if (!state) app.innerHTML = welcomeView();
  else {
    if (view === 'loan' && !state.loan) view = 'home';
    app.innerHTML = (screens[view] || homeView)(loanStats());
  }
  if (animateNext) { app.firstElementChild?.classList.add('enter'); animateNext = false; }
  updatePlan();
}

function go(next) {
  view = next;
  animateNext = true;
  history.pushState({ v: next }, '');
  render();
  scrollTo(0, 0);
}

const topNav = title => `<nav class="topnav">
  <button class="icon-btn" data-back aria-label="Back">${icon('chevL')}</button>
  <span class="title">${title}</span><span class="spacer"></span></nav>`;

function ring(frac, size) {
  const sw = size > 60 ? 2.5 : 2, c = size / 2, r = c - sw, len = 2 * Math.PI * r;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${sw}"/>
    <circle class="prog" cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--gold)" stroke-width="${sw}" stroke-linecap="round"
      stroke-dasharray="${len}" stroke-dashoffset="${len * (1 - frac)}"/></svg>`;
}

function welcomeView() {
  return `<div class="welcome">
    <div class="eyebrow">Welcome</div>
    <h1 class="wordmark">Life <em>Quest</em></h1>
    <p>A quiet place to track the things that matter, and make steady progress feel rewarding.</p>
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

function homeView(s) {
  const lv = levelFrom(totalXp()), name = state.profile.name;
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const backupNudge = s && s.emiCount + s.extraCount > 0 && daysSince(state.lastBackup) > 14
    ? `<button class="notice" data-act="backup"><span class="dot" style="background:var(--gold)"></span><span>Back up your data · last backup ${state.lastBackup ? fmtDay(state.lastBackup) : 'never'}</span>${icon('chevR')}</button>` : '';
  const soon = (ic, label) => `<button class="soon" data-soon="${label}">${icon(ic)}<div class="name">${label}</div><div class="tag">Coming soon</div></button>`;
  return `<div>
    <header class="home-head">
      <div><div class="date">${today}</div><h1 class="greet">${greeting()},<br>${esc(name)}</h1></div>
      <button class="avatar" data-go="profile" aria-label="Profile">${ring(lv.into / lv.need, 50)}<span class="ini">${esc(name[0].toUpperCase())}</span></button>
    </header>
    <div class="level-line"><span>Level <b>${lv.lvl}</b></span><div class="bar gold"><i style="width:${(lv.into / lv.need) * 100}%"></i></div><span>${lv.into.toLocaleString('en-IN')} / ${lv.need.toLocaleString('en-IN')} XP</span></div>
    ${backupNudge}
    <div class="section-title"><span>Trackers</span></div>
    ${loanCard(s)}
    <div class="soon-grid">${soon('card', 'Spending')}${soon('bowl', 'Food')}${soon('dumbbell', 'Gym')}${soon('check', 'To-do')}</div>
  </div>`;
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

function kv(k, v, sub = '', cls = '') {
  return `<div class="kv"><span class="k">${k}</span><span class="v ${cls}"><span class="stack">${v}${sub ? `<small>${sub}</small>` : ''}</span></span></div>`;
}

function loanView(s) {
  const L = state.loan;
  const history = [...L.log].sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);
  return `<div>
    ${topNav(esc(L.name))}
    ${s.emiDue ? `<button class="notice" data-act="emi"><span class="dot"></span><span>Your ${fmtMonth(s.nextEmi)} EMI is ready to log</span>${icon('chevR')}</button>` : ''}
    <section class="hero">
      <div class="eyebrow">Outstanding</div>
      <div class="hero-amount" id="hero-amt">${inr(s.bal)}</div>
      <div class="bar" id="hero-bar"><i style="width:${s.repaid * 100}%"></i></div>
      <div class="hero-meta"><span>${(s.repaid * 100).toFixed(2)}% repaid</span><span>of ${lakh(L.original)}</span></div>
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
  if (!range) return;
  const x = Number(range.value), bal = Math.max(0, loanBalance());
  range.style.setProperty('--p', (x / Number(range.max)) * 100 + '%');
  $('#p-amt').textContent = inr(x);
  if (bal <= 0) { $('#p-out').innerHTML = '<p class="empty">This loan is fully repaid.</p>'; return; }
  const base = simulate(bal), plan = simulate(bal, x), last = parseISO(lastEmiISO());
  $('#p-out').innerHTML = `
    ${kv('Debt-free by', fmtMonth(addMonths(last, Math.ceil(plan.months))))}
    ${kv('Time left', dur(plan.months))}
    ${kv('Interest still to pay', lakh(plan.interest), '', 'neg')}
    <div class="plan-note">${x > 0
      ? `<b>${dur(base.months - plan.months)}</b> sooner and <b>${lakh(base.interest - plan.interest)}</b> less interest than paying only the EMI.`
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

function profileView(s) {
  const xp = totalXp(), lv = levelFrom(xp), name = state.profile.name;
  const got = new Set(s ? s.unlocked : []);
  const done = MILESTONES.filter(m => got.has(m.id));
  const todo = MILESTONES.filter(m => !got.has(m.id));
  const shown = showAllMilestones ? [...done, ...todo] : [...done, ...todo.slice(0, 3)];
  const row = m => `<div class="ms ${got.has(m.id) ? 'on' : ''}">
      <div class="c">${got.has(m.id) ? icon('tick') : ''}</div>
      <div><div class="n">${m.name}</div>${m.desc ? `<div class="d">${m.desc}</div>` : ''}</div>
      <div class="x">+${m.xp.toLocaleString('en-IN')} XP</div></div>`;
  return `<div>
    ${topNav('Profile')}
    <section class="profile-head">
      <div class="avatar lg">${ring(lv.into / lv.need, 100)}<span class="ini">${esc(name[0].toUpperCase())}</span></div>
      <h1 class="greet">${esc(name)}</h1>
      <div class="muted">Level ${lv.lvl} · ${xp.toLocaleString('en-IN')} XP</div>
    </section>

    <div class="section-title"><span>Milestones</span><span>${done.length} / ${MILESTONES.length}</span></div>
    <section class="panel">
      ${shown.map(row).join('')}
      <button class="more" data-act="all-ms">${showAllMilestones ? 'Show less' : `Show all ${MILESTONES.length}`}</button>
    </section>

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

/* ---------- 6. Sheets (pop-up forms) ---------- */
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
      <div class="sheet-actions">
        <button type="button" class="btn btn-ghost" data-close>Cancel</button>
        <button class="btn btn-primary">${isEmi ? 'Log EMI' : 'Confirm payment'}</button>
      </div>
    </form>`);
  updatePreview();
  if (!isEmi) setTimeout(() => $('#m-amt')?.focus(), 80);
}

// Shows what a payment will do before you confirm it
function updatePreview() {
  const form = $('#f-pay'), out = $('#m-preview');
  if (!form || !out) return;
  const a = num($('#m-amt').value), bal = Math.max(0, loanBalance());
  if (!a) { out.innerHTML = ''; return; }
  if (form.dataset.type === 'emi') {
    const i = Math.min(a, bal * state.loan.rate / 1200);
    out.innerHTML = kv('To interest', inr(i), '', 'neg') + kv('To principal', inr(Math.max(0, a - i)), '', 'pos');
  } else {
    const now = simulate(bal), after = simulate(bal - Math.min(a, bal)), months = now.months - after.months;
    out.innerHTML = kv('Debt-free', `${dur(months)} sooner`, '', 'pos')
      + kv('Interest saved', lakh(now.interest - after.interest), '', 'pos')
      + kv('Reward', `+${extraXp(a, months).toLocaleString('en-IN')} XP`);
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
      <div class="sheet-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary">Save</button></div>
    </form>`);
}

function syncSheet() {
  openSheet(`
    <h2>Sync balance</h2>
    <p class="lead">The app estimates your balance. Now and then, enter the real outstanding principal from your bank app so everything stays accurate.</p>
    <form id="f-sync">
      <label class="field"><span>Outstanding balance (₹)</span><input name="bal" inputmode="decimal" placeholder="${Math.round(loanBalance()).toLocaleString('en-IN')}"></label>
      <div class="sheet-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary">Sync</button></div>
    </form>`);
}

function showRewards(list) {
  const r = list.shift();
  if (!r) return;
  r.level ? sfx.level() : sfx.chime();
  haptic([12, 40, 12]);
  confetti(null, 50);
  openSheet(`
    <div class="reward-kicker">${r.kicker}</div>
    <div class="reward-mark">${icon(r.level ? 'up' : 'star')}</div>
    <div class="reward-title">${r.title}</div>
    ${r.text ? `<p class="reward-text">${r.text}</p>` : ''}
    <div class="reward-xp">${r.xp ? `+${r.xp.toLocaleString('en-IN')} XP` : ''}</div>
    <button class="btn btn-primary btn-block" data-close>Continue</button>`,
    { center: true, onClose: () => setTimeout(() => showRewards(list), 250) });
}

/* ---------- 7. Actions ---------- */
const forms = {
  'f-welcome'(f) {
    const name = f.elements.name.value.trim();
    if (!name) return;
    state = { version: 2, profile: { name }, loan: null, settings: { ...DEFAULT_SETTINGS }, lastBackup: null, createdAt: todayISO() };
    save();
    view = 'home';
    animateNext = true;
    render();
    sfx.soft();
  },

  'f-loan-setup'(f) {
    const d = Object.fromEntries(new FormData(f));
    const err = msg => { $('#setup-err').textContent = msg; };
    const loan = {
      name: d.name.trim() || 'Student loan',
      original: num(d.original), setupBalance: num(d.balance), rate: num(d.rate), emi: num(d.emi), setupDate: d.date,
      log: [],
    };
    if (!(loan.original > 0 && loan.setupBalance > 0 && loan.rate > 0 && loan.emi > 0)) return err('Please fill in all the numbers.');
    if (loan.setupBalance > loan.original) return err("The balance can't be more than the original loan.");
    const base = simulate(loan.setupBalance, 0, loan);
    if (!isFinite(base.months)) return err("That EMI doesn't cover the monthly interest. Check the numbers.");
    loan.baselineMonths = base.months;     // the "EMI only" plan everything is compared against
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

  'f-pay'(f) {
    const a = num($('#m-amt').value);
    if (!a) return $('#m-amt').focus();
    const date = $('#m-date').value || todayISO();
    closeSheet();
    logPayment(f.dataset.type, a, date);
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
    if (real > state.loan.original) return toast("That's more than the original loan. Please check it.");
    const bal = loanBalance();
    state.loan.log.push({ id: uid(), ts: Date.now(), type: 'sync', date: todayISO(), amount: real, principal: bal - real, interest: 0, xp: 0 });
    save();
    closeSheet();
    render();
    toast('Balance synced with your bank.');
  },
};

function logPayment(type, amount, date) {
  const before = loanStats(), bal = before.bal;
  const e = { id: uid(), ts: Date.now(), type, date, amount };
  if (type === 'emi') {
    e.interest = Math.min(amount, Math.round(bal * state.loan.rate / 1200));
    e.principal = Math.max(0, Math.min(bal, amount - e.interest));
    e.xp = XP.emi;
  } else {
    e.interest = 0;
    e.principal = Math.min(bal, amount);
  }
  state.loan.log.push(e);
  if (type === 'extra') {
    const mid = loanStats();
    e.monthsRemoved = Math.max(0, mid.monthsSaved - before.monthsSaved);
    e.interestSaved = Math.max(0, mid.interestSaved - before.interestSaved);
    e.xp = extraXp(amount, e.monthsRemoved);
  }
  save();
  const after = loanStats();
  render();
  celebrate(e, before, after);
}

function celebrate(e, before, after) {
  // Balance counts down, progress bar glides forward
  const amt = $('#hero-amt'), bar = $('#hero-bar > i');
  if (amt) countTo(amt, before.bal, after.bal);
  if (bar) { bar.style.transition = 'none'; bar.style.width = before.repaid * 100 + '%'; bar.offsetWidth; bar.style.transition = ''; bar.style.width = after.repaid * 100 + '%'; }

  if (e.type === 'extra') {
    sfx.chime(); haptic([15, 50, 30]); confetti(amt, 60);
    toast(`<b>${inr(e.amount)}</b> paid · ${dur(e.monthsRemoved)} sooner · ${lakh(e.interestSaved)} interest saved · <b>+${e.xp} XP</b>`, 5500);
  } else {
    sfx.soft(); haptic(15);
    toast(`EMI logged · <b>${inr(e.principal)}</b> to principal · <b>+${e.xp} XP</b>`, 4000);
  }

  const rewards = MILESTONES
    .filter(m => after.unlocked.includes(m.id) && !before.unlocked.includes(m.id))
    .map(m => ({ kicker: 'Milestone', title: m.name, text: m.desc, xp: m.xp }));
  const l0 = levelFrom(before.xp).lvl, l1 = levelFrom(after.xp).lvl;
  if (l1 > l0) rewards.push({ kicker: 'Level up', title: `Level ${l1}`, text: 'Steady progress, compounding.', level: true });
  if (rewards.length) setTimeout(() => showRewards(rewards), 1300);
}

function act(a, el) {
  switch (a) {
    case 'emi': case 'extra': return paySheet(a);
    case 'terms': return termsSheet();
    case 'sync': return syncSheet();
    case 'del':
      if (!confirm('Remove this entry? Use this to fix a mistake.')) return;
      state.loan.log = state.loan.log.filter(e => e.id !== el.dataset.id);
      save(); render();
      return;
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
  a.download = `lifequest-backup-${todayISO()}.json`;
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
      let data = JSON.parse(reader.result);
      if (data && data.version === 1) data = migrateV1(data);
      if (!data || !data.profile) throw new Error('not a backup');
      if (!confirm('Replace everything on this device with this backup?')) return;
      state = data;
      state.settings = Object.assign({}, DEFAULT_SETTINGS, state.settings);
      save();
      render();
      toast('Backup restored.');
    } catch { toast("That file isn't a Life Quest backup."); }
  };
  reader.readAsText(file);
}

/* ---------- 8. Effects ---------- */
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

// Soft synthesized chimes (no audio files needed)
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

// Light, slow confetti in the app's own colours
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

/* ---------- 9. Start-up ---------- */
addEventListener('resize', sizeFx);
sizeFx();

document.addEventListener('click', ev => {
  const t = ev.target;
  if (t.classList.contains('backdrop') || t.closest('[data-close]')) return closeSheet();
  const chip = t.closest('[data-amt]');
  if (chip) { $('#m-amt').value = Number(chip.dataset.amt).toLocaleString('en-IN'); return updatePreview(); }
  const el = t.closest('[data-go],[data-back],[data-act],[data-soon]');
  if (!el) return;
  if (el.dataset.go) return go(el.dataset.go);
  if ('back' in el.dataset) return history.back();
  if (el.dataset.soon) { sfx.tap(); return toast(`<b>${el.dataset.soon}</b> arrives in the next update.`); }
  act(el.dataset.act, el);
});
document.addEventListener('submit', ev => {
  ev.preventDefault();
  forms[ev.target.id]?.(ev.target);
});
document.addEventListener('input', ev => {
  if (ev.target.id === 'm-amt') updatePreview();
  if (ev.target.id === 'p-range') { state.settings.plan = Number(ev.target.value); updatePlan(); }
});
document.addEventListener('change', ev => {
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

// Offline support + "install as app" (only works on a real web address)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js');
// Ask the phone not to auto-delete saved data
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
