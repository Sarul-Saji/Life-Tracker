'use strict';
/* COMPOUND · trackers/money.js
   Money tracker (£): income, spending, budgets, India transfers, month close.
   Owned by the "Compound: Money and Loan" session. */

let moneyMonth = ymNow();
let showMoneyMore = false;   // "More" section (six months, recurring) open?
const TX_XP = { expense: 10, income: 20, transfer: 30, nospend: 20 };

const cat = (id, name, ic) => ({ id, name, icon: ic });
// Money's own icon (the shared set in core/helpers.js has no scissors)
ICONS.scissors ||= '<circle cx="6.5" cy="7" r="2.5"/><circle cx="6.5" cy="17" r="2.5"/><path d="M8.6 8.4 19 17M8.6 15.6 19 7"/>';
const EXPENSE_CATS = [
  cat('rent', 'Rent', 'home'), cat('bills', 'Bills', 'bolt'), cat('groceries', 'Groceries', 'basket'), cat('household', 'Household', 'bottle'),
  cat('takeaway', 'Takeaways', 'bag'), cat('eatingout', 'Eating out', 'fork'), cat('transport', 'Transport', 'train'), cat('subscriptions', 'Subscriptions', 'repeat'),
  cat('alcohol', 'Alcohol', 'glass'), cat('snus', 'Snus', 'tin'), cat('vape', 'Vape', 'vape'), cat('shopping', 'Shopping', 'tag'),
  cat('leisure', 'Leisure', 'ticket'), cat('health', 'Health', 'heart'), cat('haircut', 'Haircut', 'scissors'), cat('travel', 'Travel', 'plane'), cat('cima', 'CIMA', 'cap'),
  cat('visa', 'Visa fee', 'passport'), cat('gifts', 'Gifts', 'gift'), cat('other', 'Other', 'dots'),
];
// Habit spending gets its own card: what it costs over a year, and what it would do for the loan
const HABIT_CATS = ['alcohol', 'snus', 'vape'];
function habitStats() {
  const today = todayISO(), since = addDays(today, -29);
  const recent = state.money.tx.filter(t => t.type === 'expense' && HABIT_CATS.includes(t.cat));
  const per = HABIT_CATS.map(id => ({ id, last30: sum(recent.filter(t => t.cat === id && t.date >= since && t.date <= today), t => t.amount) }));
  const total = sum(per, p => p.last30);
  return { per, total, yearly: (total * 365) / 30, any: recent.some(t => t.date >= addDays(today, -89)) };
}
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
  // "Paid off and saved" (once called put to work) = loan extras + savings + what's left
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

// Budgets: a monthly limit per category
function budgetStatus(ym) {
  const m = monthStats(ym);
  return Object.entries(state.money.budgets).map(([id, limit]) => {
    const spent = m.byCat[id] || 0;
    return { id, limit, spent, left: limit - spent, pct: spent / limit, kept: spent <= limit };
  });
}


const BUDGET_XP = 100;
// Everything that happens when a month is closed
function closeSummary(ym) {
  const m = monthStats(ym), gr = gradeFor(m), budgets = budgetStatus(ym);
  const kept = budgets.filter(b => b.kept).length;
  return { m, gr, budgets, kept, xp: gr.xp + kept * BUDGET_XP };
}

/* Screens */
function moneyCard() {
  if (!state.money.tx.length) return `<button class="tracker" data-go="money">
      <div class="tr-top">${icon('card')}<span class="grow">Money</span>${icon('plus')}</div>
      <div class="tr-amount setup">Start logging</div>
      <div class="tr-sub">Log income and spending in pounds, and see exactly where your money goes.</div>
    </button>`;
  const m = monthStats(ymNow());
  return `<button class="tracker" data-go="money">
      <div class="tr-top">${icon('card')}<span class="grow">Money · ${ymLabel(m.ym, { month: 'long' })}</span>${icon('chevR')}</div>
      ${m.income ? `<div class="tr-amount ${m.left < 0 ? 'neg' : ''}">${gbp(m.left)}</div>
      <div class="tr-sub">left this month</div>` : `<div class="tr-amount">${gbp(m.out)}</div>
      <div class="tr-sub">spent this month</div>`}
      <div class="bar"><i style="width:${m.income ? Math.min(100, (m.out / m.income) * 100) : 0}%"></i></div>
      <div class="tr-foot"><span>In ${gbp(m.income)} · Out ${gbp(m.out)}</span><span>${m.income ? `${Math.round(futureParts(m, false).pct * 100)}% paid off and saved` : ''}</span></div>
    </button>`;
}

function moneyView() {
  const ym = moneyMonth, isNow = ym === ymNow(), m = monthStats(ym), prev = monthStats(ymAdd(ym, -1));
  const closed = state.money.closed[ym];
  const due = isNow ? dueRecurring() : [];
  const trend = [-5, -4, -3, -2, -1, 0].map(i => monthStats(ymAdd(ym, i)));
  const maxT = Math.max(1, ...trend.flatMap(t => [t.income, t.out]));
  const monthTx = monthTxList(ym);
  const today = todayISO();
  const canNoSpend = isNow && !state.money.tx.some(t => t.date === today && (t.type === 'expense' || t.type === 'nospend'));
  const canClose = ym < ymNow() && m.txCount && !closed;
  const budgets = budgetStatus(ym);

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
      ${heroNumber(m, isNow)}
      <div class="inout">
        <div><div class="k">Money in</div><div class="v pos">${gbp(m.income)}</div></div>
        <div><div class="k">Money out</div><div class="v">${gbp(m.out)}</div></div>
      </div>
      <div class="actions three">
        <button class="btn btn-ghost" data-act="add-income">Income</button>
        <button class="btn btn-primary" data-act="add-expense">Expense</button>
        <button class="btn btn-ghost" data-act="add-transfer">To India</button>
      </div>
      ${canNoSpend ? `<button class="small-btn" data-act="nospend">${icon('leaf')} Mark today as a no-spend day</button>` : ''}
    </section>

    <button class="tx-link" data-go="money-tx">${icon('calendar')}<span class="grow">Transactions</span><span class="muted">${monthTx.length} in ${ymLabel(ym, { month: 'long' })}</span>${icon('chevR')}</button>

    ${mixCard(m, prev, isNow)}

    ${futureCard(m, ym, closed)}

    ${budgets.length ? `<div class="section-title"><span>Budgets</span><span>${budgets.filter(b => b.kept).length} of ${budgets.length} on track</span></div>
    <section class="panel">
      ${budgets.map(b => budgetRow(b, ym)).join('')}
      <button class="more" data-act="budget-new">${icon('plus')} Add a budget</button>
    </section>` : ''}

    <button class="more more-toggle" data-act="money-more" aria-expanded="${showMoneyMore}">${showMoneyMore ? 'Show less' : 'More: six months, recurring' + (budgets.length ? '' : ', budgets')} ${icon(showMoneyMore ? 'up' : 'chevR')}</button>
    ${showMoneyMore ? `
    <div class="section-title"><span>Six months</span><span class="key"><i class="sw in"></i>In <i class="sw out"></i>Out</span></div>
    <section class="panel pad">
      <div class="trend">${trend.map(t => `<button class="col ${t.ym === ym ? 'sel' : ''}" data-act="set-month" data-ym="${t.ym}">
        <div class="bars"><i class="in" style="height:${(t.income / maxT) * 100}%"></i><i class="out" style="height:${(t.out / maxT) * 100}%"></i></div>
        <span class="lbl">${ymLabel(t.ym, { month: 'short' })}</span></button>`).join('')}</div>
    </section>

    <div class="section-title"><span>Recurring</span></div>
    <section class="panel">${state.money.recurring.length ? state.money.recurring.map(recItem).join('') : '<p class="empty">Tick "Repeat every month" when logging rent, salary or subscriptions, and they will show up here.</p>'}</section>
    ${budgets.length ? '' : `<button class="more" data-act="budget-new">${icon('plus')} Add a monthly budget</button>`}` : ''}
  </div>`;
}

const monthTxList = ym => state.money.tx.filter(t => t.date.slice(0, 7) === ym).sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);

// Transactions page: the whole month, day by day. Tap an entry to edit it, × to delete it.
function moneyTxView() {
  const ym = moneyMonth, isNow = ym === ymNow(), list = monthTxList(ym);
  let lastDay = '', html = '';
  for (const t of list) {
    if (t.date !== lastDay) {
      const dayTotal = sum(list.filter(x => x.date === t.date && x.type === 'expense'), x => x.amount);
      html += `<div class="day-head"><span>${fmtDayShort(t.date)}</span><span>${dayTotal ? `${gbp(dayTotal)} spent` : ''}</span></div>`;
      lastDay = t.date;
    }
    html += txItem(t);
  }
  return `<div>
    ${topNav('Transactions')}
    <div class="month-switch">
      <button data-act="month" data-d="-1" aria-label="Previous month">${icon('chevL')}</button>
      <span class="m">${ymLabel(ym)}</span>
      <button data-act="month" data-d="1" ${isNow ? 'disabled' : ''} aria-label="Next month">${icon('chevR')}</button>
    </div>
    <div class="actions three tx-add">
      <button class="btn btn-ghost" data-act="add-income">Income</button>
      <button class="btn btn-primary" data-act="add-expense">Expense</button>
      <button class="btn btn-ghost" data-act="add-transfer">To India</button>
    </div>
    <div class="section-title"><span>${list.length} entr${list.length === 1 ? 'y' : 'ies'}</span><span>Tap one to edit</span></div>
    <section class="panel tx-box">${html || '<p class="empty">Nothing logged this month yet.</p>'}</section>
  </div>`;
}

// Top of the page: what's left once income has landed; until then, simply what's gone out
function heroNumber(m, isNow) {
  if (isNow && !m.income) return `<div class="eyebrow">Spent this month</div><div class="hero-amount">${gbp(m.out)}</div>`;
  return `<div class="eyebrow">${isNow ? 'Left so far' : 'Left over'}</div><div class="hero-amount ${m.left < 0 ? 'neg' : ''}">${gbp(m.left)}</div>`;
}

/* Paid off and saved
   The share of income that went to your future: loan extras, savings, and (once the month is over) what was left.
   During the month "left over" only counts as a side note, because on payday nearly everything is still "left". */
function futureParts(m, final) {
  const sent = m.transfer.extra + m.transfer.savings, left = Math.max(0, m.left), total = sent + (final ? left : 0);
  return { sent, left, total, pct: m.income > 0 ? total / m.income : null };
}

function futureCard(m, ym, closed) {
  const isNow = ym === ymNow(), f = futureParts(m, !isNow);
  const projected = !closed && !isNow ? gradeFor(m).grade : '';
  const right = closed ? `Grade ${closed.grade}` : projected && m.income ? `Grade ${projected} if closed now` : '';
  const logDays = Math.min(m.logDays, 15);
  return `<div class="section-title"><span>Paid off and saved</span><span>${right}</span></div>
    <section class="panel pad future">
      <div class="future-big">${f.pct == null ? '—' : Math.round(f.pct * 100) + '%'}</div>
      <div class="muted small">of ${isNow ? 'this month\'s' : 'the month\'s'} income went to your future${f.pct == null ? ' (log your income to see this)' : ''}</div>
      <div class="future-rows">
        ${kv('Loan extra', gbp(m.transfer.extra))}
        ${kv('Savings', gbp(m.transfer.savings))}
        ${kv(isNow ? 'Left over so far' : 'Left over', gbp(f.left))}
      </div>
      ${isNow ? `<p class="future-note">Left over counts once the month ends, if it's still there. Your grade comes then too. Top marks: <b>40% or more</b> of income here, and logging on <b>15 days</b> (${logDays} so far).</p>` : ''}
    </section>`;
}

// Habits sit inside "Where it went": the last 30 days of alcohol, snus and vape, scaled to a year
function habitsNote() {
  const h = habitStats();
  if (!h.total) return '';
  let loanLine = '';
  const rate = latestRate();
  if (state.loan && rate) {
    const bal = Math.max(0, loanBalance()), base = simulate(bal), plan = simulate(bal, h.total * rate);
    const months = base.months - plan.months;
    if (months >= 0.1) loanLine = ` Sent to the loan instead, that's <b>${soonerLabel(months)}</b> sooner debt-free.`;
  }
  return `<p class="treat-note">Last 30 days: <b>${gbp(h.total)}</b>. At that rate, about <b>${gbp(Math.round(h.yearly))} a year</b>.${loanLine}</p>`;
}

function budgetRow(b, ym) {
  const c = catOf(b.id), isNow = ym === ymNow();
  const daysLeft = isNow ? parseISO(ymLastDay(ym)).getDate() - new Date().getDate() + 1 : 0;
  const status = !b.kept ? `Over by ${gbp(-b.left)}`
    : isNow ? `${gbp(b.left)} left · ${daysLeft} day${daysLeft === 1 ? '' : 's'} to go${b.left > 0 ? ` · ${gbp(b.left / daysLeft)} a day` : ''}`
    : 'Kept';
  const cls = !b.kept ? 'over' : b.pct >= 0.8 ? 'close' : '';
  return `<button class="cat-row budget ${cls}" data-act="budget-edit" data-id="${b.id}">
    <div class="mark">${icon(c.icon)}</div><div class="main">
      <div class="n"><span>${c.name}</span><b>${gbp(b.spent)} <small>of ${gbp(b.limit)}</small></b></div>
      <div class="bar"><i style="width:${Math.min(1, b.pct) * 100}%"></i></div>
      <div class="d">${status}</div></div></button>`;
}

// Spending mix: categories folded into six fixed groups, each with its own fixed colour
const GROUPS = [
  { id: 'home', name: 'Home', cats: ['rent', 'bills', 'household'] },
  { id: 'food', name: 'Food', cats: ['groceries', 'takeaway', 'eatingout'] },
  { id: 'move', name: 'Getting around', cats: ['transport', 'travel'] },
  { id: 'life', name: 'Lifestyle', cats: ['subscriptions', 'shopping', 'leisure', 'health', 'haircut', 'gifts', 'other'] },
  { id: 'habits', name: 'Habits', cats: ['alcohol', 'snus', 'vape'] },
  { id: 'career', name: 'Career and visa', cats: ['cima', 'visa'] },
];
const groupOf = catId => GROUPS.find(g => g.cats.includes(catId)) || GROUPS[3];
const pctOf = (v, total) => { const p = (v / total) * 100; return p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`; };
const MIX_HINT = 'Tap a colour or a group to see what\'s inside';
let openGroup = '';   // which group is expanded in "Where it went"

// "Where it went": the mix bar for the big picture, and each group opens up to show its categories
function mixCard(m, prev, isNow) {
  const head = `<div class="section-title"><span>Where it went</span><span>${m.living ? `${gbp(m.living)} spent` : ''}</span></div>`;
  if (!m.living) return `${head}<section class="panel"><p class="empty">No spending logged this month.</p></section>`;
  const groups = GROUPS.map((g, i) => {
    const cats = Object.entries(m.byCat).filter(([id]) => groupOf(id) === g).sort((a, b) => b[1] - a[1]);
    const total = sum(cats, c => c[1]), last = sum(Object.entries(prev.byCat).filter(([id]) => groupOf(id) === g), c => c[1]);
    return { ...g, slot: i + 1, total, last, cats, cap: `<b>${g.name}</b> · ${pctOf(total, m.living)} of spending · ${gbp(total)}` };
  }).filter(g => g.total > 0);
  if (!groups.some(g => g.id === openGroup)) openGroup = '';
  const dim = g => (openGroup && g.id !== openGroup ? 'dim' : '');
  const change = (v, last) => !last ? 'new this month' : Math.abs(v - last) < 0.5 ? 'same as last month' : `${v > last ? '↑' : '↓'} ${gbp(Math.abs(v - last))} vs last month`;
  const bar = groups.map(g =>
    `<button class="seg ${dim(g)}" style="flex:${g.total} 1 0;background:var(--s${g.slot})" data-act="mix" data-g="${g.id}" data-cap="${esc(g.cap)}" aria-label="${g.name}, ${pctOf(g.total, m.living)}, ${gbp(g.total)}"></button>`).join('');
  const rows = [...groups].sort((a, b) => b.total - a.total).map(g => {
    const open = g.id === openGroup;
    return `<button class="mix-row ${dim(g)} ${open ? 'open' : ''}" data-act="mix" data-g="${g.id}" data-cap="${esc(g.cap)}" aria-expanded="${open}">
      <i class="sw" style="background:var(--s${g.slot})"></i>
      <div class="main">
        <div class="n"><span>${g.name}</span><b>${pctOf(g.total, m.living)}</b></div>
        <div class="d">${gbp(g.total)} · ${change(g.total, g.last)}</div>
      </div>
      <span class="chev">${icon('chevR')}</span>
    </button>
    ${open ? `<div class="mix-cats">${g.cats.map(([id, v]) => catRow(id, v, prev.byCat[id] || 0, g.cats[0][1], m.living)).join('')}${g.id === 'habits' && isNow ? habitsNote() : ''}</div>` : ''}`;
  }).join('');
  const active = groups.find(g => g.id === openGroup);
  return `${head}
    <section class="panel pad mix" id="mix" data-active="${openGroup}">
      <div class="mix-bar">${bar}</div>
      <div class="mix-cap" id="mix-cap">${active ? active.cap : MIX_HINT}</div>
      ${rows}
    </section>`;
}

// Open one group in "Where it went" (tap again to close)
function focusMix(groupId) {
  openGroup = openGroup === groupId ? '' : groupId;
  render();
}

function catRow(id, v, last, max, total) {
  const c = catOf(id), diff = v - last;
  const change = !last ? 'New this month' : Math.abs(diff) < 0.5 ? 'Same as last month' : `${diff > 0 ? '↑' : '↓'} ${gbp(Math.abs(diff))} vs last month`;
  const d = `${pctOf(v, total)} of spending · ${change}`;
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
  return `<div class="hist ${t.type}${t.type === 'nospend' ? '' : ' tap'}" ${t.type === 'nospend' ? '' : `data-act="tx-edit" data-id="${t.id}"`}>
    <div class="mark">${icon(ic)}</div>
    <div class="main"><div class="t">${title}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>
    <div class="amt">${amt}</div>
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


/* Sheets */
const defaultDate = () => (moneyMonth === ymNow() || view !== 'money' ? todayISO() : ymLastDay(moneyMonth));

// Income or expense: new, or (with `edit`) an existing entry with its details filled in
function txSheet(type, edit = null) {
  const isInc = type === 'income', cats = isInc ? INCOME_CATS : EXPENSE_CATS;
  const checked = (c, i) => (edit ? edit.cat === c.id : isInc && i === 0);
  openSheet(`
    <h2>${edit ? (isInc ? 'Edit income' : 'Edit expense') : isInc ? 'Money in' : 'Money out'}</h2>
    <p class="lead">${edit ? 'Change anything, then save.' : isInc ? 'Salary, tips, refunds: anything that lands in your account.' : 'Amount, category, done.'}</p>
    <form id="f-tx" data-type="${type}" data-id="${edit ? edit.id : ''}">
      <label class="field"><span>Amount (£)</span><input name="amount" ${moneyAttrs('gbp', edit ? edit.amount : '')} placeholder="0.00"></label>
      <div class="cats">${cats.map((c, i) => `<label class="cat"><input type="radio" name="cat" value="${c.id}" ${checked(c, i) ? 'checked' : ''} hidden>${icon(c.icon)}<span>${c.name}</span></label>`).join('')}</div>
      <div class="grid2">
        <label class="field"><span>Note</span><input name="note" maxlength="40" value="${edit ? esc(edit.note || '') : ''}" placeholder="${isInc ? 'October salary' : 'Tesco'}"></label>
        <label class="field"><span>Date</span><input name="date" type="date" value="${edit ? edit.date : defaultDate()}"></label>
      </div>
      ${edit ? '' : '<label class="check-row"><input type="checkbox" name="recurring"> Repeat every month</label>'}
      <div id="tx-err" class="err"></div>
      ${sheetButtons('Save')}
      ${edit ? `<button type="button" class="btn btn-text btn-danger btn-block" data-act="tx-del" data-id="${edit.id}">Delete this entry</button>` : ''}
    </form>`);
  if (!edit) setTimeout(() => $('#f-tx [name=amount]')?.focus(), 80);
}

// Transfer to India: new, or (with `edit`) an existing one with its details filled in
function transferSheet(prefill = '', purpose = prefill ? 'extra' : 'emi', edit = null) {
  if (edit) purpose = edit.purpose;
  const purposes = Object.entries(PURPOSES).map(([id, n]) =>
    `<label class="purpose"><input type="radio" name="purpose" value="${id}" ${id === purpose ? 'checked' : ''} hidden>${n}</label>`).join('');
  openSheet(`
    <h2>${edit ? 'Edit transfer' : 'Transfer to India'}</h2>
    <p class="lead">${edit ? `Change anything, then save.${edit.loanId ? ' The matching extra loan payment updates too.' : ''}` : 'What left in pounds, and what arrived in rupees. Your exchange rate is tracked over time.'}</p>
    <form id="f-transfer" data-id="${edit ? edit.id : ''}">
      <div class="grid2">
        <label class="field"><span>Sent (£)</span><input name="gbp" ${moneyAttrs('gbp', edit ? edit.amount : prefill)} placeholder="0.00"></label>
        <label class="field"><span>Received (₹)</span><input name="inr" ${moneyAttrs('inr', edit ? edit.inr : '')} placeholder="0"></label>
      </div>
      <div class="rate-line" id="rate-line"></div>
      <div class="purposes">${purposes}</div>
      <label class="field"><span>Date</span><input name="date" type="date" value="${edit ? edit.date : todayISO()}"></label>
      <div class="preview" id="t-preview"></div>
      <div id="tr-err" class="err"></div>
      ${sheetButtons('Save transfer')}
      ${edit ? `<button type="button" class="btn btn-text btn-danger btn-block" data-act="tx-del" data-id="${edit.id}">Delete this transfer</button>` : ''}
    </form>`);
  updateTransferPreview();
}

// Remove a transaction, and the extra loan payment it created (if any)
function removeTx(id) {
  const t = state.money.tx.find(x => x.id === id);
  state.money.tx = state.money.tx.filter(x => x.id !== id);
  if (t?.loanId && state.loan) { state.loan.log = state.loan.log.filter(e => e.id !== t.loanId); recheckTargetHits(); }
  return t;
}

function updateTransferPreview() {
  const f = $('#f-transfer');
  if (!f) return;
  const g = num(f.elements.gbp.value), r = num(f.elements.inr.value), p = f.elements.purpose.value, last = latestRate();
  $('#rate-line').textContent = g && r ? `₹${(r / g).toFixed(2)} per £1${last ? ` · last time ₹${last.toFixed(2)}` : ''}` : last ? `Last rate: ₹${last.toFixed(2)} per £1` : '';
  const out = $('#t-preview');
  if (p === 'extra' && state.loan && r) {
    const bal = Math.max(0, loanBalance()), now = simulate(bal), after = simulate(bal - Math.min(r, bal));
    out.innerHTML = kv('Also logged as', 'Extra loan payment') + kv('Debt-free', `${soonerLabel(now.months - after.months)} sooner`, '', 'pos') + kv('Interest saved', lakh(now.interest - after.interest), '', 'pos');
  } else if (p === 'emi') out.innerHTML = `<p class="hint">This just moves money home. ${state.loan?.autoEmi === false ? 'Log the EMI itself in the loan tracker when the bank debits it.' : 'The EMI itself is logged automatically on the day the bank debits it.'}</p>`;
  else if (p === 'savings') out.innerHTML = '<p class="hint">Money kept in India. Counts as saved.</p>';
  else if (p === 'family') out.innerHTML = '<p class="hint">Money for family. Counts as spending.</p>';
  else out.innerHTML = '';
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
  const { m, gr, budgets, kept, xp } = closeSummary(ym);
  openSheet(`
    <div class="reward-kicker">${ymLabel(ym)} · month close</div>
    <div class="grade-big">${gr.grade}</div>
    <div class="panel left">
      ${kv('Money in', gbp(m.income), '', 'pos')}
      ${kv('Living costs', gbp(m.living))}
      ${kv('Sent to the loan', gbp(m.loan))}
      ${kv('Paid off and saved', m.ptw == null ? '—' : Math.round(m.ptw * 100) + '%', 'loan extra, savings and left over', 'pos')}
      ${kv('Days logged', m.logDays)}
      ${budgets.length ? kv('Budgets kept', `${kept} of ${budgets.length}`, kept ? `+${kept * BUDGET_XP} XP` : '', kept ? 'pos' : '') : ''}
      ${kv('Left over', gbp(m.left), '', m.left >= 0 ? 'pos' : 'neg')}
    </div>
    <div class="reward-xp">+${xp.toLocaleString('en-IN')} XP</div>
    <button class="btn btn-primary btn-block" data-act="claim-month" data-ym="${ym}">Claim and close ${ymLabel(ym, { month: 'long' })}</button>
    ${m.left > 0 && state.loan ? `<button class="btn btn-text btn-block" data-act="leftover" data-amt="${Math.floor(m.left)}">Send the ${gbp(Math.floor(m.left))} left over to the loan</button>` : ''}`,
    { center: true });
}

function budgetSheet(catId = '') {
  const used = Object.keys(state.money.budgets);
  const choices = EXPENSE_CATS.filter(c => c.id === catId || !used.includes(c.id));
  openSheet(`
    <h2>${catId ? 'Edit budget' : 'New budget'}</h2>
    <p class="lead">A monthly limit for one category. See how you did when you close the month.</p>
    <form id="f-budget" data-old="${catId}">
      <div class="cats">${choices.map(c => `<label class="cat"><input type="radio" name="cat" value="${c.id}" ${c.id === catId ? 'checked' : ''} hidden>${icon(c.icon)}<span>${c.name}</span></label>`).join('')}</div>
      <label class="field"><span>Monthly limit (£)</span><input name="limit" ${moneyAttrs('gbp', catId ? state.money.budgets[catId] : '')} placeholder="0.00"></label>
      <div id="b-err" class="err"></div>
      ${sheetButtons('Save budget')}
      ${catId ? `<button type="button" class="btn btn-text btn-danger btn-block" data-act="budget-del" data-id="${catId}">Remove this budget</button>` : ''}
    </form>`);
}

/* Actions */
function createTx(t) {
  const a = award(TX_XP[t.type]);
  Object.assign(t, { id: uid(), ts: Date.now(), xp: a.xp, mult: a.mult });
  if (t.type === 'expense') state.money.tx = state.money.tx.filter(x => !(x.type === 'nospend' && x.date === t.date));
  state.money.tx.push(t);
  // Money sent home for the loan also counts as an extra loan payment (or links to one you already logged)
  if (t.linkLoanId) { t.loanId = t.linkLoanId; delete t.linkLoanId; }
  else if (t.type === 'transfer' && t.purpose === 'extra' && state.loan && loanBalance() > 0) t.loanId = makeLoanEntry('extra', t.inr, t.date).id;
  return t;
}

function addTx(t, msgFor) {
  const g0 = globalStats();
  createTx(t);
  save();
  render();
  finishAction(g0, msgFor(t), { big: !!t.loanId || (t.type === 'income' && t.amount >= 500) });
}

function logRecurring(r, date) {
  return createTx({ type: r.type, amount: r.amount, cat: r.cat, note: r.note, date, recurringId: r.id });
}

const moneyForms = {
  'f-tx'(f) {
    const type = f.dataset.type, amount = num(f.elements.amount.value), catId = f.elements.cat.value;
    const err = msg => { $('#tx-err').textContent = msg; };
    if (!amount) return err('Enter an amount.');
    if (!catId) return err('Pick a category.');
    const date = f.elements.date.value || todayISO(), note = f.elements.note.value.trim();
    // Editing: change the entry in place (it keeps its id and when it was first logged)
    const old = f.dataset.id && state.money.tx.find(x => x.id === f.dataset.id);
    if (old) {
      Object.assign(old, { amount, cat: catId, note, date });
      save(); closeSheet(); render();
      return toast(`Saved · ${note ? esc(note) : catOf(catId).name} <b>${gbp(amount)}</b> on ${fmtDayShort(date)}`);
    }
    const t = { type, amount, cat: catId, note, date };
    if (f.elements.recurring.checked) {
      const r = { id: uid(), type, amount, cat: catId, note, day: parseISO(date).getDate() };
      state.money.recurring.push(r);
      t.recurringId = r.id;
    }
    closeSheet();
    moneyMonth = date.slice(0, 7);
    addTx(t, x => {
      let msg = `${x.note ? esc(x.note) : catOf(x.cat).name} <b>${type === 'income' ? '+' : '−'}${gbp(x.amount)}</b> · <b>${xpLabel(x)}</b>`;
      const b = type === 'expense' && budgetStatus(x.date.slice(0, 7)).find(y => y.id === x.cat);
      if (b) msg += b.kept ? ` · ${gbp(b.left)} left in ${catOf(b.id).name}` : ` · <b>${catOf(b.id).name} over budget by ${gbp(-b.left)}</b>`;
      return msg;
    });
  },

  'f-budget'(f) {
    const catId = f.elements.cat.value, limit = num(f.elements.limit.value), old = f.dataset.old;
    if (!catId) return ($('#b-err').textContent = 'Pick a category.');
    if (!limit) return ($('#b-err').textContent = 'Enter a monthly limit.');
    if (old && old !== catId) delete state.money.budgets[old];
    state.money.budgets[catId] = limit;
    save();
    closeSheet();
    render();
    toast(`${catOf(catId).name} budget set to <b>${gbp(limit)}</b> a month.`);
  },

  'f-transfer'(f) {
    const amount = num(f.elements.gbp.value), inrAmt = num(f.elements.inr.value), purpose = f.elements.purpose.value;
    if (!amount || !inrAmt) return ($('#tr-err').textContent = 'Enter both the pounds sent and the rupees received.');
    const date = f.elements.date.value || todayISO();
    const t0 = { type: 'transfer', amount, inr: inrAmt, purpose, date };
    // Editing a transfer: replace it, so any extra loan payment it made is worked out again from the new numbers.
    // Saved quietly: no celebrations for something already logged.
    if (f.dataset.id) {
      removeTx(f.dataset.id);
      createTx(t0);
      targetHitNote();   // clear any note meant for a brand-new payment
      save(); closeSheet(); render();
      return toast(`Saved · <b>${gbp(amount)} → ${inr(inrAmt)}</b> on ${fmtDayShort(date)}${t0.loanId ? ' · loan updated' : ''}`);
    }
    // Duplicate guard: an extra payment already logged by hand in the loan tracker around the same date?
    if (purpose === 'extra' && state.loan) {
      const near = state.loan.log.find(e => e.type === 'extra' && Math.abs(parseISO(e.date) - parseISO(date)) <= 3 * 864e5 && !state.money.tx.some(t => t.loanId === e.id));
      if (near && confirm(`You logged ${inr(near.amount)} as an extra loan payment on ${fmtDay(near.date)}. Is this transfer that same money?\n\nOK = yes, link them (no double counting)\nCancel = no, it's a new payment`)) t0.linkLoanId = near.id;
    }
    closeSheet();
    moneyMonth = date.slice(0, 7);
    addTx(t0, t => {
      const e = t.loanId && state.loan.log.find(x => x.id === t.loanId);
      if (e && e.ts < t.ts) return `<b>${gbp(t.amount)} → ${inr(t.inr)}</b> · linked to your extra payment · <b>${xpLabel(t)}</b>`;
      return e
        ? `<b>${gbp(t.amount)} → ${inr(t.inr)}</b> · loan ${soonerLabel(e.monthsRemoved)} sooner · <b>+${t.xp + e.xp} XP</b>${targetHitNote()}`
        : `<b>${gbp(t.amount)} → ${inr(t.inr)}</b> at ₹${(t.inr / t.amount).toFixed(2)} · <b>${xpLabel(t)}</b>`;
    });
  },
};

// Spending mix: hovering a segment (mouse) previews its details
document.addEventListener('pointerover', ev => {
  const s = ev.target.closest?.('.seg');
  if (s && ev.pointerType === 'mouse') $('#mix-cap').innerHTML = s.dataset.cap;
});
document.addEventListener('pointerout', ev => {
  const s = ev.target.closest?.('.seg');
  if (!s || ev.pointerType !== 'mouse') return;
  const box = $('#mix'), on = box?.dataset.active;
  $('#mix-cap').innerHTML = on ? box.querySelector(`.mix-row[data-g="${on}"]`).dataset.cap : MIX_HINT;
});

/* ---------- Registration ---------- */
registerTracker({
  id: 'money',
  order: 10,

  migrate(s) {
    s.money = Object.assign({ tx: [], recurring: [], closed: {}, budgets: { groceries: 120 } }, s.money);
    // The treat fund is gone: keep its milestone only for whoever already earned it, so that XP stays
    if (!s.money.tx.some(t => t.treat)) {
      const i = MILESTONES.findIndex(x => x.id === 'treat-1');
      if (i >= 0) MILESTONES.splice(i, 1);
    }
  },

  views: { money: moneyView, 'money-tx': moneyTxView },
  card: moneyCard,
  notices() {
    const out = [], prevYm = ymAdd(ymNow(), -1), due = dueRecurring();
    if (monthStats(prevYm).txCount && !state.money.closed[prevYm])
      out.push(notice('close-month', `${ymLabel(prevYm, { month: 'long' })} is ready to close. Claim your grade`, 'var(--gold)', `data-ym="${prevYm}"`));
    if (due.length) out.push(notice('due', `${due.length} recurring item${due.length > 1 ? 's' : ''} due to log`));
    return out;
  },
  onEnter(v) { if (v === 'money') moneyMonth = ymNow(); },

  activity(add) { state.money.tx.forEach(t => add(t.ts, t.xp)); },
  xp: () => sum(state.money.tx, t => t.xp) + sum(Object.values(state.money.closed), c => c.xp),
  stats() {
    const tx = state.money.tx, closed = Object.values(state.money.closed);
    return {
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
      budgetMonths: closed.filter(c => c.budgetsKept > 0).length,
      treats: tx.filter(t => t.treat).length,
    };
  },

  quests: {
    log5: { text: 'Log money on 5 different days', goal: 5, get: w => w.moneyDays },
    tx10: { text: 'Log 10 transactions', goal: 10, get: w => w.txCount },
    tx15: { text: 'Log 15 transactions', goal: 15, get: w => w.txCount },
    food40: { text: 'Takeaways and eating out under £40', limit: 40, get: w => w.food, valid: w => w.expenseLogs >= 3 },
    shop30: { text: 'Shopping under £30', limit: 30, get: w => w.shopping, valid: w => w.expenseLogs >= 3 },
    nospend2: { text: 'Have 2 no-spend days', goal: 2, get: w => w.noSpend },
  },
  weekData(w, inWeek) {
    Object.assign(w, { moneyDays: 0, txCount: 0, food: 0, shopping: 0, noSpend: 0, expenseLogs: 0 });
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
  },

  milestones: [
    ms('first-income', 'First income logged', '', 100, g => g.incomeCount >= 1),
    ms('first-expense', 'First expense logged', 'Awareness is step one', 100, g => g.expenseCount >= 1),
    ms('first-transfer', 'First transfer home', '', 150, g => g.transferCount >= 1),
    ms('nospend-1', 'First no-spend day', '', 150, g => g.noSpend >= 1),
    ms('nospend-10', 'Ten no-spend days', '', 600, g => g.noSpend >= 10),
    ms('tx-50', 'Fifty transactions logged', '', 400, g => g.txCount >= 50),
    ms('tx-250', '250 transactions logged', 'A true record keeper', 1500, g => g.txCount >= 250),
    ms('close-1', 'First month closed', '', 300, g => g.closedCount >= 1),
    ms('ptw-40', '40% paid off and saved', 'In a closed month', 800, g => g.ptw40),
    ms('grade-a', 'An A month', '', 800, g => g.gradeA),
    ms('grade-aplus', 'A perfect month', 'Grade A+', 1500, g => g.gradeAPlus),
    ms('budget-1', 'First budget kept', 'A limit you stuck to', 300, g => g.budgetMonths >= 1),
    ms('budget-3', 'Three months on budget', '', 800, g => g.budgetMonths >= 3),
    ms('treat-1', 'First guilt-free treat', 'Rewards make discipline last', 150, g => g.treats >= 1),
    ms('remit-1l', '₹1 lakh sent home', '', 300, g => g.inrSent >= 1e5),
    ms('remit-10l', '₹10 lakh sent home', '', 1500, g => g.inrSent >= 1e6),
  ],

  xpRows: () => kv('Log an expense', `+${TX_XP.expense}`) + kv('Log income', `+${TX_XP.income}`)
    + kv('Transfer to India', `+${TX_XP.transfer}`) + kv('No-spend day', `+${TX_XP.nospend}`),
  bonusRows: () => kv('Month close', '+100 to +1,000', 'by grade') + kv('Budget kept', `+${BUDGET_XP}`, 'per budget, at month close'),

  forms: moneyForms,
  actions: {
    'add-expense': () => txSheet('expense'),
    'add-income': () => txSheet('income'),
    'add-transfer': () => transferSheet(),
    due: () => dueSheet(),
    'close-month': (el, d) => closeMonthSheet(d.ym),
    nospend: () => addTx({ type: 'nospend', date: todayISO() }, t => `No-spend day · <b>${xpLabel(t)}</b>`),
    month: (el, d) => {
      const next = ymAdd(moneyMonth, Number(d.d));
      if (next <= ymNow()) { moneyMonth = next; render(); }
    },
    'set-month': (el, d) => { moneyMonth = d.ym; render(); },
    'rec-log': (el, d) => {
      const item = dueRecurring().find(x => x.r.id === d.id);
      if (!item) return;
      const g0 = globalStats(), t = logRecurring(item.r, item.date);
      save(); render();
      dueRecurring().length ? dueSheet() : closeSheet();
      finishAction(g0, `${t.note ? esc(t.note) : catOf(t.cat).name} logged · <b>${xpLabel(t)}</b>`);
    },
    'rec-log-all': () => {
      const g0 = globalStats(), items = dueRecurring();
      const xp = sum(items.map(x => logRecurring(x.r, x.date)), t => t.xp);
      save(); closeSheet(); render();
      finishAction(g0, `${items.length} recurring item${items.length > 1 ? 's' : ''} logged · <b>+${xp} XP</b>`);
    },
    'rec-del': (el, d) => {
      if (!confirm('Stop repeating this every month? Past entries stay.')) return;
      state.money.recurring = state.money.recurring.filter(r => r.id !== d.id);
      save(); render();
    },
    'tx-del': (el, d) => {
      if (!confirm('Remove this entry?')) return;
      removeTx(d.id);
      save(); closeSheet(); render();
    },
    'tx-edit': (el, d) => {
      const t = state.money.tx.find(x => x.id === d.id);
      if (!t) return;
      if (t.type === 'transfer') transferSheet('', t.purpose, t);
      else txSheet(t.type, t);
    },
    'claim-month': (el, d) => {
      const c = closeSummary(d.ym), g0 = globalStats();
      state.money.closed[d.ym] = { grade: c.gr.grade, score: c.gr.score, xp: c.xp, ptw: c.m.ptw ?? 0, budgetsKept: c.kept, ts: Date.now() };
      save(); closeSheet(); render();
      finishAction(g0, `${ymLabel(d.ym, { month: 'long' })} closed · grade <b>${c.gr.grade}</b> · <b>+${c.xp} XP</b>`, { big: true });
    },
    mix: (el, d) => focusMix(d.g),
    'money-more': () => { showMoneyMore = !showMoneyMore; render(); },
    'budget-new': () => budgetSheet(),
    'budget-edit': (el, d) => budgetSheet(d.id),
    'budget-del': (el, d) => {
      delete state.money.budgets[d.id];
      save(); closeSheet(); render();
      toast('Budget removed.');
    },
    leftover: (el, d) => { closeSheet(); transferSheet(d.amt); },
  },
  onInput(ev) { if (ev.target.closest('#f-transfer')) updateTransferPreview(); },
  onChange(ev) { if (ev.target.closest('#f-transfer')) updateTransferPreview(); },
});