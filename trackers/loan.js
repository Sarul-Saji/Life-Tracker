'use strict';
/* COMPOUND · trackers/loan.js
   Student loan tracker (₹): EMIs, extra payments, payoff plan.
   Owned by the "Compound: Money and Loan" session. Money transfers marked "Loan extra" call makeLoanEntry(). */

const XP = { emi: 150, perRupee: 1 / 100, perMonthSaved: 50 };
const extraXp = (amount, monthsSaved) => Math.round(amount * XP.perRupee + monthsSaved * XP.perMonthSaved);

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
const ZERO_LOAN = { bal: 0, repaid: 0, emiCount: 0, extraCount: 0, extraPaid: 0, biggest: 0, monthsSaved: 0, interestSaved: 0, targetHits: 0 };

// Time you can feel: days for small amounts, then months and years
const DAYS_PER_MONTH = 30.44;
function soonerLabel(m) {
  if (!isFinite(m)) return 'never';
  if (m >= 2) return dur(m);
  const d = Math.round(m * DAYS_PER_MONTH);
  return `${d} day${d === 1 ? '' : 's'}`;
}

// Like simulate(), but stops once the balance drops to goalBal: how many EMIs until a checkpoint
function monthsToReach(goalBal, extra = 0, fromBal = loanBalance()) {
  const r = state.loan.rate / 1200, pay = state.loan.emi + extra;
  let b = Math.max(0, fromBal), m = 0;
  while (b > goalBal + 0.5) {
    if (pay <= b * r || m > 1200) return Infinity;
    b -= pay - b * r;
    m++;
  }
  return m;
}

/* ---------- Monthly target ----------
   An extra-payment goal for each month, on top of the EMI. Hitting it is recorded once per month
   (with the target at that moment), so changing the target later never takes back earned XP. */
const TARGET_XP = 250;
let loanTargetHit = null;   // set when the payment just logged hit its month's target
const extrasIn = ym => sum(state.loan.log.filter(e => e.type === 'extra' && e.date.slice(0, 7) === ym), e => e.amount);

function checkTargetHit(ym) {
  const L = state.loan, paid = extrasIn(ym);
  L.targetHits ||= {};
  const hit = L.targetHits[ym];
  if (hit) { if (paid < hit.target) delete L.targetHits[ym]; return null; }   // a payment was removed
  // Only this month or last (for a late-logged transfer) can be hit, so old payments can't earn it retroactively
  if (!(L.target > 0) || paid < L.target || ym < ymAdd(ymNow(), -1)) return null;
  L.targetHits[ym] = { target: L.target, xp: TARGET_XP, ts: Date.now() };
  return { ym, ...L.targetHits[ym] };
}
const recheckTargetHits = () => Object.keys(state.loan?.targetHits || {}).forEach(ym => checkTargetHit(ym));

// Extra notes for the toast after an extra payment: target hit, personal record broken
let loanRecordNote = '';
function targetHitNote() {
  const h = loanTargetHit, rec = loanRecordNote;
  loanTargetHit = null;
  loanRecordNote = '';
  return (h ? ` · <b>${ymLabel(h.ym, { month: 'long' })} target hit +${h.xp} XP</b>` : '') + (rec ? ` · <b>${rec}</b>` : '');
}

/* ---------- Race the bank ----------
   A "ghost" loan that pays exactly your EMIs and nothing extra. Each EMI's interest is scaled from your
   real one (so rate changes hit you both the same), and bank syncs correct both. The gap is all yours. */
function bankRace() {
  const L = state.loan;
  const log = [...L.log].sort((a, b) => a.date.localeCompare(b.date) || a.ts - b.ts);
  let you = L.setupBalance, bank = L.setupBalance;
  for (const e of log) {
    if (e.type === 'emi') {
      const i = you > 0 ? e.interest * (bank / you) : bank * L.rate / 1200;
      bank -= Math.max(0, Math.min(bank, e.amount - i));
    } else if (e.type === 'sync') bank = Math.max(0, bank - e.principal);
    you -= e.principal;
  }
  you = Math.max(0, you);
  const ahead = bank - you, last = parseISO(lastEmiISO());
  const bankMonths = simulate(bank).months;
  return {
    you, bank, ahead,
    months: ahead > 0.5 ? monthsToReach(you, 0, bank) : 0,
    bankFree: addMonths(last, Math.ceil(bankMonths)),
    youRepaid: 1 - you / L.original, bankRepaid: 1 - bank / L.original,
  };
}

/* ---------- Personal records ---------- */
function loanRecords() {
  const L = state.loan, extras = L.log.filter(e => e.type === 'extra');
  const biggest = extras.reduce((m, e) => (!m || e.amount > m.amount ? e : m), null);
  const byMonth = {};
  extras.forEach(e => { const ym = e.date.slice(0, 7); byMonth[ym] = (byMonth[ym] || 0) + e.amount; });
  const bestMonth = Object.entries(byMonth).sort((a, b) => b[1] - a[1])[0] || null;
  // Monthly targets hit in a row
  const hits = Object.keys(L.targetHits || {}).sort();
  let best = 0, run = 0, prev = null;
  for (const ym of hits) { run = prev && ymAdd(prev, 1) === ym ? run + 1 : 1; best = Math.max(best, run); prev = ym; }
  let cur = 0, ym = L.targetHits?.[ymNow()] ? ymNow() : ymAdd(ymNow(), -1);
  while (L.targetHits?.[ym]) { cur++; ym = ymAdd(ym, -1); }
  const sent = state.money.tx.filter(t => t.type === 'transfer' && t.amount > 0 && t.inr > 0);
  const bestRate = sent.reduce((m, t) => (!m || t.inr / t.amount > m.inr / m.amount ? t : m), null);
  return { biggest, bestMonth, streak: { cur, best }, bestRate };
}

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
    targetHits: Object.keys(L.targetHits || {}).length,
  };
  s.emiDue = bal > 0 && new Date() >= s.nextEmi;
  return s;
}

// Creates a loan entry (EMI or extra) and pushes it to the log.
// auto = logged by the app itself (the monthly EMI), so it earns XP but doesn't count as you showing up.
function makeLoanEntry(type, amount, date, { auto = false } = {}) {
  loanTargetHit = null;
  loanRecordNote = '';
  const bal = Math.max(0, loanBalance());
  const e = { id: uid(), ts: Date.now(), type, date, amount };
  if (auto) e.auto = true;
  let base;
  if (type === 'emi') {
    e.interest = Math.min(amount, Math.round(bal * state.loan.rate / 1200));
    e.principal = Math.max(0, Math.min(bal, amount - e.interest));
    base = XP.emi;
  } else {
    // Personal records: announced only when an earlier record is beaten
    const prev = state.loan.log.filter(x => x.type === 'extra'), ym = date.slice(0, 7), totals = {};
    prev.forEach(x => { const m = x.date.slice(0, 7); totals[m] = (totals[m] || 0) + x.amount; });
    const [bestYm, bestTotal] = Object.entries(totals).sort((a, b) => b[1] - a[1])[0] || [];
    if (prev.length && amount > Math.max(...prev.map(x => x.amount))) loanRecordNote = 'New record: your biggest payment yet';
    else if (bestYm && bestYm !== ym && (totals[ym] || 0) + amount > bestTotal) loanRecordNote = 'New record: your best month for extra payments';
    e.interest = 0;
    e.principal = Math.min(bal, amount);
    const now = simulate(bal), after = simulate(bal - e.principal);
    e.monthsRemoved = Math.max(0, now.months - after.months);
    e.interestSaved = Math.max(0, now.interest - after.interest);
    base = extraXp(amount, e.monthsRemoved);
  }
  const a = award(base, { passive: auto });
  e.xp = a.xp;
  e.mult = a.mult;
  state.loan.log.push(e);
  if (type === 'extra') loanTargetHit = checkTargetHit(date.slice(0, 7));
  return e;
}

// The EMI is an automatic debit on the same day every month, so the app logs it for you
function autoLogEmis() {
  if (!state?.loan || state.loan.autoEmi === false) return [];
  const made = [];
  for (let i = 0; i < 24; i++) {
    const s = loanStats();
    if (s.bal <= 0 || new Date() < s.nextEmi) break;
    made.push(makeLoanEntry('emi', state.loan.emi, toISO(s.nextEmi), { auto: true }));
  }
  if (made.length) save();
  return made;
}

function runAutoEmi() {
  if (!state?.loan || state.loan.autoEmi === false) return;
  const g0 = globalStats(), made = autoLogEmis();
  if (!made.length) return;
  render();
  const months = made.map(e => fmtMonth(parseISO(e.date)).split(' ')[0]).join(', ');
  finishAction(g0, `${months} EMI logged automatically · <b>${inr(sum(made, e => e.principal))}</b> to principal · <b>+${sum(made, e => e.xp)} XP</b>`);
}

/* Screens */
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

    ${questStrip('loan')}

    ${targetPanel(s)}
    ${roadPanel(s)}
    ${racePanel(s)}
    ${boughtPanel(s)}
    ${recordsPanel()}

    <div class="section-title"><span>Overview</span></div>
    <section class="panel">
      ${kv('Debt-free by', fmtMonth(s.freedom), `originally ${fmtMonth(s.originalEnd)}`)}
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
      <button class="kv" data-act="auto-emi"><span class="k">Log EMI automatically on the ${ordinal(parseISO(L.setupDate).getDate())}</span><span class="v">${L.autoEmi === false ? 'Off' : 'On'}</span></button>
    </section>
    <button class="btn btn-text btn-danger btn-block" data-act="remove-loan">Remove loan tracker</button>
  </div>`;
}

// This month's extra-payment target: progress, what's left, and a one-tap way to send it
function targetPanel(s) {
  if (s.bal <= 0) return '';
  const L = state.loan, ym = ymNow(), t = L.target || 0;
  const head = `<div class="section-title"><span>${ymLabel(ym, { month: 'long' })} target</span><span>${t ? 'extra, on top of the EMI' : ''}</span></div>`;
  if (!t) return `${head}<section class="panel pad target">
      <p class="tg-note">Pick an amount to pay extra every month. Hitting it earns <b>+${TARGET_XP} XP</b> and pulls every date on your road to freedom closer.</p>
      <button class="btn btn-ghost btn-block" data-act="target">Set a monthly target</button>
    </section>`;
  const paid = extrasIn(ym), left = Math.max(0, t - paid), met = paid >= t, rate = latestRate(), hit = L.targetHits?.[ym];
  const daysLeft = parseISO(ymLastDay(ym)).getDate() - new Date().getDate() + 1;
  const send = rate ? Math.ceil(left / rate) : '';
  const note = met
    ? `Target hit${hit ? ` · <b>+${hit.xp} XP</b>` : ''}. Anything more this month is a bonus.`
    : `<b>${inr(left)}</b> to go${rate ? `, about ${gbp(send)}` : ''} · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;
  return `${head}<section class="panel pad target ${met ? 'met' : ''}">
    <div class="tg-top">
      <div><div class="tg-big">${inr(paid)}</div><div class="muted small">of ${inr(t)} paid extra</div></div>
      <button class="btn btn-ghost btn-sm" data-act="target">Edit</button>
    </div>
    <div class="bar ${met ? 'gold' : ''}"><i style="width:${Math.min(1, paid / t) * 100}%"></i></div>
    <p class="tg-note">${note}</p>
    ${met ? '' : `<button class="btn btn-primary btn-block" data-act="target-send" data-gbp="${send}">Send ${rate ? gbp(send) : 'it'} from the UK</button>`}
  </section>`;
}

// Road to freedom: a checkpoint every 5% repaid, each with its date at your current pace
const checkpointXp = p => (p === 100 ? 10000 : p % 25 === 0 ? 1500 : 400);
function roadPanel(s) {
  const L = state.loan, pct = s.repaid * 100, passed = Math.min(20, Math.floor(pct / 5 + 1e-9)), t = L.target || 0;
  const segs = [...Array(20)].map((_, i) => `<i><b style="width:${Math.min(1, Math.max(0, (pct - i * 5) / 5)) * 100}%"></b></i>`).join('');
  const last = parseISO(lastEmiISO());
  const stops = [];
  for (let p = (passed + 1) * 5; p <= 100 && stops.length < 3; p += 5) {
    const goal = L.original * (1 - p / 100), m = monthsToReach(goal, t);
    stops.push({ p, name: p === 100 ? 'Debt-free' : `${p}% repaid`, toGo: s.bal - goal, when: isFinite(m) ? `around ${fmtMonth(addMonths(last, m))}` : 'not at this pace' });
  }
  const [next, ...later] = stops;
  return `<div class="section-title"><span>Road to freedom</span><span>${passed} of 20 checkpoints</span></div>
    <section class="panel pad road-panel">
      ${next ? `<div class="muted small">Next checkpoint</div>
        <div class="tg-big">${next.name}</div>
        <div class="muted small">${lakh(next.toGo)} to go · ${next.when} · <span class="xp">+${checkpointXp(next.p).toLocaleString('en-IN')} XP</span></div>`
      : `<div class="tg-big">Debt-free</div><div class="muted small">Every checkpoint passed. You made it.</div>`}
      <div class="road" role="img" aria-label="${pct.toFixed(1)}% of the loan repaid">${segs}</div>
      <div class="road-marks"><span>25%</span><span>50%</span><span>75%</span><span>Free</span></div>
      ${later.map(x => kv(x.name, x.when, `${lakh(x.toGo)} to go · +${checkpointXp(x.p).toLocaleString('en-IN')} XP`)).join('')}
      ${next ? `<p class="hint">Dates assume your EMI${t ? ` plus your ${inr(t)} monthly target` : ' only. Set a monthly target to pull them closer'}.</p>` : ''}
    </section>`;
}

// You against the bank's own schedule (EMI only), on a track that zooms to the current quarter of the loan
function racePanel(s) {
  if (s.bal <= 0) return '';
  const r = bankRace(), top = Math.min(100, Math.max(25, Math.ceil((Math.max(r.youRepaid, r.bankRepaid) * 100 + 0.01) / 25) * 25));
  const lane = (who, frac, cls) => `<div class="lane ${cls}"><span class="who">${who}</span>
    <div class="track"><i style="width:${Math.min(100, Math.max(0, frac * 100) / top * 100)}%"></i></div><span class="pc">${(frac * 100).toFixed(1)}%</span></div>`;
  let big, sub;
  if (r.ahead > 0.5) {
    big = `${soonerLabel(r.months)} ahead`;
    sub = `You owe ${lakh(r.ahead)} less than the bank's schedule. It says debt-free ${fmtMonth(r.bankFree)}; you're on course for ${fmtMonth(s.freedom)}.`;
  } else if (r.ahead < -0.5) {
    big = `${lakh(-r.ahead)} behind`;
    sub = 'Behind the bank\'s schedule. Check your history for a mistake, or sync your balance with the bank.';
  } else {
    big = 'Neck and neck';
    sub = `Paying only the EMI keeps you level with the bank. Your first extra payment puts you ahead, and it stays ahead for good.`;
  }
  return `<div class="section-title"><span>Race the bank</span><span>vs its EMI-only schedule</span></div>
    <section class="panel pad race">
      <div class="tg-big">${big}</div>
      <p class="race-sub">${sub}</p>
      ${lane('You', r.youRepaid, 'you')}
      ${lane('Bank', r.bankRepaid, 'bank')}
      <div class="race-scale"><span>0%</span><span>${top === 100 ? 'Free' : top + '% repaid'}</span></div>
    </section>`;
}

// Your best moments so far
function recordsPanel() {
  const r = loanRecords(), rows = [];
  if (r.biggest) rows.push(kv('Biggest extra payment', inr(r.biggest.amount), fmtDay(r.biggest.date)));
  if (r.bestMonth) rows.push(kv('Best month', inr(r.bestMonth[1]), `${ymLabel(r.bestMonth[0])} · extra payments`));
  if (r.streak.best) rows.push(kv('Targets hit in a row', `${r.streak.cur} month${r.streak.cur === 1 ? '' : 's'}`, `best ${r.streak.best}`));
  if (r.bestRate) rows.push(kv('Best exchange rate', `₹${(r.bestRate.inr / r.bestRate.amount).toFixed(2)} per £1`, fmtDay(r.bestRate.date)));
  if (!rows.length) return '';
  return `<div class="section-title"><span>Personal records</span></div><section class="panel">${rows.join('')}</section>`;
}

// What your extra payments have bought back, in days and in things from your own life
function boughtPanel(s) {
  const L = state.loan, bal = Math.max(0, loanBalance());
  const days = Math.max(0, Math.round(s.monthsSaved * DAYS_PER_MONTH)), saved = Math.max(0, s.interestSaved);
  let top, amount = saved;
  if (saved >= 1) {
    top = `<div class="bought-top">
        <div><div class="tg-big">${days.toLocaleString('en-GB')}</div><div class="muted small">day${days === 1 ? '' : 's'} of your life bought back</div></div>
        <div><div class="tg-big">${lakh(saved)}</div><div class="muted small">interest the bank will never see</div></div>
      </div>
      <div class="eq-title">That interest is the same as</div>`;
  } else {
    if (bal <= 0) return '';
    // Nothing yet: show what one payment of your target (or ₹50,000) would do
    const sample = Math.min(bal, L.target || 50000), now = simulate(bal), after = simulate(bal - sample);
    amount = now.interest - after.interest;
    top = `<p class="tg-note">Nothing bought back yet. One extra payment of <b>${inr(sample)}</b> would buy back about <b>${soonerLabel(now.months - after.months)}</b> and save <b>${lakh(amount)}</b> in interest. That's the same as:</p>`;
  }
  const rateNote = s.monthsSaved < -0.05
    ? '<p class="hint">Rate rises since you started tracking have added time to the loan. Extra payments win it back.</p>' : '';
  return `<div class="section-title"><span>Bought back</span><span>vs paying only the EMI</span></div>
    <section class="panel pad bought">${top}${lifeEquivalents(amount)}${rateNote}</section>`;
}

// Rupees turned into your own London life, using what you've actually logged in Money
function lifeEquivalents(rupees) {
  const rate = latestRate(), tiles = [];
  const add = (n, label) => { if (isFinite(n) && n >= 0.1) tiles.push([n >= 10 ? Math.round(n).toLocaleString('en-GB') : n.toFixed(1), label]); };
  if (rate) tiles.push([gbp(Math.round(rupees / rate)), `in pounds, at ₹${rate.toFixed(2)} per £1`]);
  add(rupees / state.loan.emi, 'EMIs you never have to pay');
  if (rate) {
    // A typical month: the average of the last six full months that had any of it (rent also counts this month)
    const months = [1, 2, 3, 4, 5, 6].map(i => monthStats(ymAdd(ymNow(), -i)));
    const typical = (pick, extra = []) => {
      const vals = [...months, ...extra].map(pick).filter(v => v > 0);
      return vals.length ? sum(vals, v => v) / vals.length : 0;
    };
    const pounds = rupees / rate;
    const rent = typical(m => m.byCat.rent, [monthStats(ymNow())]), living = typical(m => m.living), food = typical(m => m.byCat.groceries);
    if (rent) add(pounds / rent, 'months of your rent');
    if (living) add(pounds / living, 'months of everything you spend in London');
    if (food) add(pounds / food, 'months of groceries');
  }
  const html = tiles.slice(0, 4).map(([n, label]) => `<div class="eq"><b>${n}</b><span>${label}</span></div>`).join('');
  return `<div class="eq-grid">${html}</div>${rate ? '' : '<p class="hint">Log a transfer in <b>Money → To India</b> and this also shows in pounds and in months of your London life.</p>'}`;
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
      : 'Slide to see what a monthly extra payment would do.'}</div>
    ${x > 0 && x !== (state.loan.target || 0) ? `<button class="btn btn-ghost btn-block plan-set" data-act="plan-target">Make ${inr(x)} my monthly target</button>` : ''}`;
}

function histItem(e) {
  const m = {
    emi: ['calendar', 'EMI', `${inr(e.interest)} interest · ${inr(e.principal)} principal`],
    extra: ['bolt', 'Extra payment', `${soonerLabel(e.monthsRemoved || 0)} sooner · ${lakh(e.interestSaved || 0)} interest saved`],
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
      ${f('original', 'Original loan amount (₹)', moneyAttrs('inr'), 'The full amount you borrowed.')}
      ${f('balance', 'Outstanding balance now (₹)', moneyAttrs('inr'), 'The closing principal after your latest EMI.')}
      <div class="grid2">
        ${f('rate', 'Interest rate (%)', moneyAttrs('rate') + ' placeholder="0.00"')}
        ${f('emi', 'Monthly EMI (₹)', moneyAttrs('inr'))}
      </div>
      ${f('date', 'Date of your latest EMI', `type="date" value="${todayISO()}"`)}
      <div id="setup-err" class="err"></div>
      <button class="btn btn-primary btn-block">Start tracking</button>
    </form>
  </div>`;
}

/* Sheets */
function paySheet(type) {
  const s = loanStats(), isEmi = type === 'emi';
  if (s.bal <= 0) return toast('This loan is already fully repaid.');
  const chips = [10000, 25000, 50000, 100000].map(v => `<button type="button" class="chip" data-act="pay-chip" data-amt="${v}">${lakh(v)}</button>`).join('');
  openSheet(`
    <h2>${isEmi ? 'Log EMI' : 'Pay extra'}</h2>
    <p class="lead">${isEmi
      ? (state.loan.autoEmi === false ? 'Record your monthly instalment once it has been debited.' : 'Your EMI logs itself every month. Use this only for a missed or different payment.')
      : 'For money paid from your Indian account. Every rupee goes straight to the principal.'}</p>
    ${isEmi ? '' : `<p class="hint box">Sending it from the UK? Log it in <b>Money → To India</b> as <b>Loan extra</b> instead. It lands here automatically, so you never log it twice.</p>`}
    <form id="f-pay" data-type="${type}">
      <label class="field"><span>Amount (₹)</span><input id="m-amt" ${moneyAttrs('inr', isEmi ? state.loan.emi : '')} placeholder="50,000"></label>
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
    out.innerHTML = kv('Debt-free', `${soonerLabel(months)} sooner`, '', 'pos')
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
        <label class="field"><span>Interest rate (%)</span><input name="rate" ${moneyAttrs('rate', state.loan.rate)}></label>
        <label class="field"><span>Monthly EMI (₹)</span><input name="emi" ${moneyAttrs('inr', state.loan.emi)}></label>
      </div>
      ${sheetButtons('Save')}
    </form>`);
}

function targetSheet() {
  const L = state.loan, chips = [25000, 50000, 75000, 100000].map(v => `<button type="button" class="chip" data-act="target-chip" data-amt="${v}">${lakh(v)}</button>`).join('');
  openSheet(`
    <h2>Monthly target</h2>
    <p class="lead">How much you aim to pay off the loan each month, on top of the EMI. Hit it and earn <b>+${TARGET_XP} XP</b>.</p>
    <form id="f-target">
      <label class="field"><span>Extra per month (₹)</span><input id="tg-amt" ${moneyAttrs('inr', L.target || state.settings.plan || '')} placeholder="50,000"></label>
      <div class="chips">${chips}</div>
      <div class="preview" id="tg-preview"></div>
      ${sheetButtons('Save target')}
      ${L.target ? '<button type="button" class="btn btn-text btn-danger btn-block" data-act="target-off">Remove the target</button>' : ''}
    </form>`);
  updateTargetPreview();
}

function updateTargetPreview() {
  const out = $('#tg-preview');
  if (!out) return;
  const x = num($('#tg-amt').value), bal = Math.max(0, loanBalance()), rate = latestRate();
  if (!x || bal <= 0) { out.innerHTML = ''; return; }
  const base = simulate(bal), plan = simulate(bal, x);
  out.innerHTML = kv('Debt-free by', fmtMonth(addMonths(parseISO(lastEmiISO()), Math.ceil(plan.months))), `${soonerLabel(base.months - plan.months)} sooner`, 'pos')
    + kv('Interest saved', lakh(base.interest - plan.interest), '', 'pos')
    + (rate ? kv('From London', `about ${gbp(Math.ceil(x / rate))}`, 'a month') : '');
}

function syncSheet() {
  openSheet(`
    <h2>Sync balance</h2>
    <p class="lead">The app estimates your balance. Now and then, enter the real outstanding principal from your bank app so everything stays accurate.</p>
    <form id="f-sync">
      <label class="field"><span>Outstanding balance (₹)</span><input name="bal" ${moneyAttrs('inr')} placeholder="${Math.round(loanBalance()).toLocaleString('en-IN')}"></label>
      ${sheetButtons('Sync')}
    </form>`);
}

/* Actions */
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
    ? `<b>${inr(amount)}</b> paid · ${soonerLabel(e.monthsRemoved)} sooner · ${lakh(e.interestSaved)} interest saved · <b>${xpLabel(e)}</b>${targetHitNote()}`
    : `EMI logged · <b>${inr(e.principal)}</b> to principal · <b>${xpLabel(e)}</b>`;
  finishAction(g0, msg, { big: type === 'extra', el: amt });
}

const loanForms = {
  'f-loan-setup'(f) {
    const d = Object.fromEntries(new FormData(f));
    const err = msg => { $('#setup-err').textContent = msg; };
    const loan = { name: d.name.trim() || 'Student loan', original: num(d.original), setupBalance: num(d.balance), rate: num(d.rate), emi: num(d.emi), setupDate: d.date, log: [], autoEmi: true, target: 0, targetHits: {} };
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
    // Duplicate guard
    if (type === 'emi') {
      const same = state.loan.log.find(e => e.type === 'emi' && e.date.slice(0, 7) === date.slice(0, 7));
      if (same && !confirm(`An EMI for ${fmtMonth(parseISO(date))} is already logged. Log another one?`)) return;
    } else {
      const near = state.loan.log.find(e => e.type === 'extra' && Math.abs(parseISO(e.date) - parseISO(date)) <= 3 * 864e5 && state.money.tx.some(t => t.loanId === e.id));
      if (near && !confirm(`You logged ${inr(near.amount)} on ${fmtDay(near.date)} through a transfer to India. Is this a different payment?`)) return;
    }
    closeSheet();
    logPayment(type, a, date);
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

  'f-target'() {
    const t = num($('#tg-amt').value);
    if (!t) return $('#tg-amt').focus();
    state.loan.target = t;
    save();
    closeSheet();
    render();
    toast(`Monthly target set: <b>${inr(t)}</b> extra. Hit it and earn <b>+${TARGET_XP} XP</b>.`);
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

/* ---------- Registration ---------- */
registerTracker({
  id: 'loan',
  order: 20,
  cardOrder: 30,

  migrate(s) {
    if (s.loan && s.loan.autoEmi === undefined) s.loan.autoEmi = true;
    if (s.loan && s.loan.target === undefined) s.loan.target = 0;
    if (s.loan && !s.loan.targetHits) s.loan.targetHits = {};
  },

  views: { loan: loanView, 'loan-setup': loanSetupView },
  needsData: { loan: () => !!state.loan },
  card: () => loanCard(loanStats()),
  notices() {
    const ls = loanStats(), out = [];
    if (!ls) return out;
    if (ls.emiDue) out.push(notice('emi', `Your ${fmtMonth(ls.nextEmi)} EMI is ready to log`));
    // Last week of the month: a nudge if the target isn't hit yet
    const ym = ymNow(), t = state.loan.target || 0, left = t - extrasIn(ym);
    if (ls.bal > 0 && t > 0 && left > 0 && addDays(todayISO(), 7) > ymLastDay(ym))
      out.push(notice('target-go', `${inr(left)} to go for your ${ymLabel(ym, { month: 'long' })} loan target`, 'var(--gold)'));
    return out;
  },
  onRender: () => updatePlan(),
  onStart: () => runAutoEmi(),
  onResume: () => runAutoEmi(),

  // Auto-logged EMIs earn XP but don't count as you showing up
  activity(add) {
    (state.loan?.log || []).forEach(e => { if (!e.auto) add(e.ts, e.xp); });
    Object.values(state.loan?.targetHits || {}).forEach(h => add(h.ts, h.xp));
  },
  xp: () => sum(state.loan?.log || [], e => e.xp) + sum(Object.values(state.loan?.targetHits || {}), h => h.xp),
  stats: () => ({ L: loanStats() || ZERO_LOAN }),

  quests: {
    extra1: { text: 'Make an extra loan payment', goal: 1, get: w => w.extras },
  },
  weekData(w, inWeek) {
    w.extras = (state.loan?.log || []).filter(e => e.type === 'extra' && inWeek(dayOfTs(e.ts))).length;
  },

  milestones: [
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
    ms('target-1', 'First monthly target hit', 'You said it, you paid it', 300, g => g.L.targetHits >= 1),
    ms('target-3', 'Three monthly targets hit', '', 600, g => g.L.targetHits >= 3),
    ms('target-6', 'Six monthly targets hit', 'Half a year of extra payments', 1000, g => g.L.targetHits >= 6),
    ms('target-12', 'Twelve monthly targets hit', 'A year of beating the bank', 2000, g => g.L.targetHits >= 12),
    ...[...Array(20)].map((_, i) => {
      const p = (i + 1) * 5;
      return ms('repaid-' + p, p === 100 ? 'Debt-free' : `${p}% of the loan repaid`,
        p === 100 ? 'The loan is gone. You are free.' : p % 25 === 0 ? 'A major milestone' : '',
        checkpointXp(p), g => g.L.repaid >= p / 100 - 1e-9);
    }),
  ],

  xpRows: () => kv('EMI', `+${XP.emi}`, 'logged automatically each month') + kv('Extra loan payment', '+1 per ₹100', '+50 for every month it cuts')
    + kv('Monthly loan target hit', `+${TARGET_XP}`, 'once a month'),

  forms: loanForms,
  actions: {
    emi: () => paySheet('emi'),
    extra: () => paySheet('extra'),
    'pay-chip': (el, d) => { $('#m-amt').value = Number(d.amt).toLocaleString('en-IN'); updatePreview(); },
    terms: () => termsSheet(),
    sync: () => syncSheet(),
    del: (el, d) => {
      if (!confirm('Remove this entry? Use this to fix a mistake.')) return;
      state.loan.log = state.loan.log.filter(e => e.id !== d.id);
      state.money.tx.forEach(t => { if (t.loanId === d.id) delete t.loanId; });
      recheckTargetHits();
      save(); render();
    },
    target: () => targetSheet(),
    'target-chip': (el, d) => { $('#tg-amt').value = Number(d.amt).toLocaleString('en-IN'); updateTargetPreview(); },
    'target-off': () => {
      state.loan.target = 0;
      save(); closeSheet(); render();
      toast('Monthly target removed. XP you already earned stays.');
    },
    'target-send': (el, d) => transferSheet(d.gbp, 'extra'),
    'target-go': () => go('loan'),
    'plan-target': () => {
      state.loan.target = Number($('#p-range').value);
      save(); render();
      toast(`Monthly target set: <b>${inr(state.loan.target)}</b> extra. Hit it and earn <b>+${TARGET_XP} XP</b>.`);
    },
    'auto-emi': () => {
      state.loan.autoEmi = state.loan.autoEmi === false;
      save(); render();
      if (state.loan.autoEmi) runAutoEmi();
      toast(state.loan.autoEmi ? 'Your EMI will now log itself every month.' : 'Automatic EMI logging is off. Log it by hand each month.');
    },
    'remove-loan': () => {
      if (!confirm('Remove the loan tracker and all its history?')) return;
      state.loan = null;
      save();
      history.back();
    },
  },
  onInput(ev) {
    if (ev.target.id === 'm-amt') updatePreview();
    if (ev.target.id === 'tg-amt') updateTargetPreview();
    if (ev.target.id === 'p-range') { state.settings.plan = Number(ev.target.value); updatePlan(); }
  },
  onChange(ev) { if (ev.target.id === 'p-range') save(); },
});