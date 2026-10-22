'use strict';
/* COMPOUND · trackers/health.js
   Health tracker: food, water, gym and the shift rota.
   Owned by the "Compound: Health" session. */

/* ---------- 4b. Health engine ----------
   Food, gym and the shift rota. The daily calorie target is an estimate:
   body at rest (Mifflin-St Jeor) × 1.3 for everyday movement,
   + extra burn on shift days, + gym sessions logged that day, ± the goal. */
const DEFAULT_MEALS = [
  { id: 'm-burger', name: 'Burger and fries', kcal: 1400, protein: 50, fries: true },
  { id: 'm-burger-salad', name: 'Burger and side salad', kcal: 900, protein: 45 },
  { id: 'm-caesar', name: 'Chicken Caesar salad', kcal: 700, protein: 45 },
  { id: 'm-chickenrice', name: 'Chicken and rice', kcal: 650, protein: 60 },
];
const GYM_KCAL_PER_KG_HOUR = 4;   // deliberately conservative: gym trackers tend to overstate burn
const GOALS = { lose: { name: 'Lose fat', adj: -500 }, recomp: { name: 'Lose fat, build muscle', adj: -400 }, maintain: { name: 'Maintain', adj: 0 }, build: { name: 'Build muscle', adj: 300 } };
// Deficit goals: a day is a win when you eat at or under target, but not below your body-at-rest burn
const isDeficitGoal = () => ['lose', 'recomp'].includes(H().profile.goal);
const CAL_QUEST_FROM = '2026-10-19';   // the calorie quest slot starts this week, so past weeks stay as they were
const WATER_GOAL = 8;
const H_XP = { food: 10, water: 3, gym: 60, weights: 15, supp: 5 };
// Starting list; edit it in the app. One tick per supplement per day, so a second dose needs a deliberate confirm.
const DEFAULT_SUPPS = [{ id: 's-vitd', name: 'Vitamin D' }, { id: 's-b12', name: 'Vitamin B12' }, { id: 's-zinc', name: 'Zinc' }, { id: 's-mag', name: 'Magnesium' }, { id: 's-iron', name: 'Iron' }];
const suppLog = () => (state.health?.supps?.log || []);
const suppTaken = (id, date) => suppLog().filter(x => x.suppId === id && x.date === date);
const SHIFT_GYM_BONUS = 40;   // extra XP for training on a shift day
const H = () => state.health;

const bmr = p => 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'f' ? -161 : 5);
const dayType = date => (H() && H().rota[date]) || '';
// Older sessions keep the type and calories they were saved with; new ones are estimated from duration only
const gymKcal = mins => Math.round(H().profile.weightKg * mins / 60 * GYM_KCAL_PER_KG_HOUR);
const proteinTarget = () => Math.round(H().profile.weightKg * 1.6);

function dayTarget(date) {
  const p = H().profile, base = Math.round(bmr(p) * 1.3);
  const shift = dayType(date) === 'shift' ? H().settings.shiftBurn : 0;
  const gym = sum(H().gym.filter(s => s.date === date), s => s.kcal);
  const adj = GOALS[p.goal].adj;
  return { base, shift, gym, adj, total: base + shift + gym + adj };
}

// One day's food picture and its fuel score (A–D)
function fuelDay(date) {
  const food = H().food.filter(f => f.date === date);
  const kcal = sum(food, f => f.kcal), protein = sum(food, f => f.protein);
  const water = H().water.filter(w => w.date === date).length;
  const fries = food.some(f => f.fries), shift = dayType(date) === 'shift', t = dayTarget(date);
  if (!food.length) return { kcal, protein, water, fries, shift, t, grade: null };
  // Today isn't over, so being under target isn't a miss yet; only going over counts against you
  // On a deficit goal, anywhere between body-at-rest and target is full marks
  const ratio = kcal / t.total, inDeficit = isDeficitGoal() && ratio <= 1 && kcal >= bmr(H().profile);
  const off = inDeficit || (date === todayISO() && ratio <= 1) ? 0 : Math.abs(ratio - 1);
  const score = (off <= 0.1 ? 40 : off <= 0.2 ? 25 : 10) + Math.min(1, protein / proteinTarget()) * 30
    + Math.min(1, water / WATER_GOAL) * 15 + (shift && fries ? 0 : 15);
  const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : 'D';
  return { kcal, protein, water, fries, shift, t, score, grade };
}

// A finished day with food logged is a calorie win: in your deficit (deficit goals) or within 10% of target (others)
function calWin(date) {
  const f = fuelDay(date);
  if (!f.grade || date >= todayISO()) return false;
  if (isDeficitGoal()) return f.kcal <= f.t.total && f.kcal >= bmr(H().profile);
  return Math.abs(f.kcal / f.t.total - 1) <= 0.1;
}
function calStreak() {
  let d = addDays(todayISO(), -1), n = 0;
  while (calWin(d)) { n++; d = addDays(d, -1); }
  return n;
}

// Full days: every supplement on your current list taken that day
function suppStats() {
  const list = H().supps?.list || [];
  if (!list.length) return { suppFull: 0, suppBest: 0 };
  const days = [...new Set(suppLog().map(x => x.date))].sort().filter(d => list.every(s => suppTaken(s.id, d).length));
  let best = 0, run = 0, prev = null;
  for (const d of days) { run = prev && addDays(prev, 1) === d ? run + 1 : 1; best = Math.max(best, run); prev = d; }
  return { suppFull: days.length, suppBest: best };
}

const ZERO_HEALTH = { meals: 0, gymCount: 0, gymWeeks: 0, gymBest: 0, gymCur: 0, thisWeek: 0, fryFree: 0, fuelA: 0, water8: 0, doubles: 0, weighs: 0, weighWeeks: 0, defDays: 0, defBest: 0, suppFull: 0, suppBest: 0 };
function healthStats() {
  const h = H();
  if (!h) return ZERO_HEALTH;
  const target = h.settings.gymTarget, thisWk = weekStart(todayISO());
  const perWeek = {};
  h.gym.forEach(s => { const w = weekStart(s.date); perWeek[w] = (perWeek[w] || 0) + 1; });
  const hit = Object.keys(perWeek).filter(w => perWeek[w] >= target).sort();
  let best = 0, run = 0, prev = null;
  for (const w of hit) { run = prev && addDays(prev, 7) === w ? run + 1 : 1; best = Math.max(best, run); prev = w; }
  let cur = 0, wk = perWeek[thisWk] >= target ? thisWk : addDays(thisWk, -7);
  while (perWeek[wk] >= target) { cur++; wk = addDays(wk, -7); }
  const foodDays = [...new Set(h.food.map(f => f.date))].sort(), fuel = foodDays.map(fuelDay);
  // Deficit milestones only count while you're on a deficit goal
  const defWins = isDeficitGoal() ? foodDays.filter(calWin) : [];
  let defBest = 0, defRun = 0, defPrev = null;
  for (const d of defWins) { defRun = defPrev && addDays(defPrev, 1) === d ? defRun + 1 : 1; defBest = Math.max(defBest, defRun); defPrev = d; }
  const waterByDay = {};
  h.water.forEach(w => { waterByDay[w.date] = (waterByDay[w.date] || 0) + 1; });
  return {
    meals: h.food.length, gymCount: h.gym.length, gymWeeks: hit.length, gymBest: best, gymCur: cur, thisWeek: perWeek[thisWk] || 0,
    fryFree: fuel.filter(f => f.shift && !f.fries).length,
    fuelA: fuel.filter(f => f.grade === 'A').length,
    water8: Object.values(waterByDay).filter(n => n >= WATER_GOAL).length,
    doubles: new Set(h.gym.filter(s => dayType(s.date) === 'shift').map(s => s.date)).size,
    weighs: weighIns().length,
    weighWeeks: new Set(weighIns().map(w => weekStart(w.date))).size,
    ...suppStats(),
    defDays: defWins.length, defBest,
  };
}

/* ---------- Weight ----------
   Weight swings 1–2 kg day to day with water and salt, so the 7-day average (not any single
   reading) is what shows whether the calorie target is working. Entries saved from "Your details"
   have no ts and earn no XP; weigh-ins logged from the Weight panel do. */
let hWeightRange = 90;   // days shown on the chart (0 = all)
const weighIns = () => H().weights.filter(w => w.ts);
const hDaysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 864e5);
const kgFmt = n => n.toFixed(1);

// One reading per day (the last one saved that day), oldest first, each with its 7-day average
function weightSeries() {
  const byDay = {};
  H().weights.forEach(w => { byDay[w.date] = w; });
  const days = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));
  return days.map(w => {
    const from = addDays(w.date, -6), win = days.filter(x => x.date >= from && x.date <= w.date);
    return { date: w.date, kg: w.kg, avg: sum(win, x => x.kg) / win.length };
  });
}

// kg per week over the last 4 weeks (straight-line fit), or null until there's enough to judge
function weightRate(series) {
  if (!series.length) return null;
  const last = series[series.length - 1].date, pts = series.filter(p => p.date > addDays(last, -28));
  if (pts.length < 4 || hDaysBetween(pts[0].date, last) < 10) return null;
  const xs = pts.map(p => hDaysBetween(pts[0].date, p.date)), mx = sum(xs, x => x) / xs.length, my = sum(pts, p => p.kg) / pts.length;
  let top = 0, bottom = 0;
  pts.forEach((p, i) => { top += (xs[i] - mx) * (p.kg - my); bottom += (xs[i] - mx) ** 2; });
  return (top / bottom) * 7;
}

// Plain-English read of the trend against the goal; the nudges are ±200 kcal so changes stay small
function weightVerdict(rate, goal, kg) {
  if (rate == null) return 'Weigh in 3 or 4 times a week, first thing in the morning. After about two weeks this tells you whether your calorie target is right.';
  const r = `${kgFmt(Math.abs(rate))} kg a week`;
  if (goal === 'lose' || goal === 'recomp') {
    if (rate <= -0.01 * kg) return `Losing about <b>${r}</b>. That's fast: fine for a few weeks, but eat a little more if training feels flat, or you'll lose muscle too.`;
    if (rate <= -0.2) return `Losing about <b>${r}</b>. Right on track.`;
    if (rate < -0.05) return `Losing slowly, about <b>${r}</b>. Still progress. Eat about 200 kcal a day less if you want it faster.`;
    return `<b>Not losing yet.</b> Your real burn is probably lower than the estimate. Lower the shift-day calories in Your details by 200, or eat about 200 less a day.`;
  }
  if (goal === 'build') {
    if (rate >= 0.45) return `Gaining about <b>${r}</b>. Faster than muscle can grow, so some of it is fat. Try about 200 kcal a day less.`;
    if (rate >= 0.1) return `Gaining about <b>${r}</b>. A good pace for building muscle.`;
    return `<b>Not gaining yet.</b> To build muscle you need a small surplus. Try about 200 kcal a day more.`;
  }
  if (Math.abs(rate) <= 0.2) return `<b>Holding steady</b> (within ${r}). Your target fits.`;
  return rate > 0 ? `Creeping up about <b>${r}</b>. Your target may be a bit high. Try about 200 kcal a day less.`
    : `Drifting down about <b>${r}</b>. Your target may be a bit low. Try about 200 kcal a day more.`;
}

// The latest reading becomes the weight your calorie and protein targets use
function syncWeight() {
  const h = H(), latest = [...h.weights].sort((a, b) => a.date.localeCompare(b.date)).pop();
  if (latest) h.profile.weightKg = latest.kg;
}

/* Screens */
function healthCard() {
  if (!state.health) return `<button class="tracker" data-go="health-setup">
      <div class="tr-top">${icon('heart')}<span class="grow">Health</span>${icon('plus')}</div>
      <div class="tr-amount setup">Set up</div>
      <div class="tr-sub">Food, gym and your shift rota in one place, with a calorie target that knows when you're on shift.</div>
    </button>`;
  const today = todayISO(), f = fuelDay(today), hs = healthStats(), type = dayType(today);
  return `<button class="tracker" data-go="health">
      <div class="tr-top">${icon('heart')}<span class="grow">Health</span>
        ${!type ? '<span class="due"><span class="dot"></span>Set today</span>' : ''}${icon('chevR')}</div>
      <div class="tr-amount">${f.kcal.toLocaleString('en-GB')} <small class="of">/ ${f.t.total.toLocaleString('en-GB')} kcal</small></div>
      <div class="tr-sub">eaten today · ${type === 'shift' ? 'shift day' : type === 'off' ? 'day off' : 'rota not set'}</div>
      <div class="bar"><i style="width:${Math.min(100, (f.kcal / f.t.total) * 100)}%"></i></div>
      <div class="tr-foot"><span>Gym ${hs.thisWeek} of ${H().settings.gymTarget} this week</span><span>Fuel ${f.grade || '—'}</span></div>
    </button>`;
}

function healthView() {
  const h = H(), today = todayISO(), fd = foodDay(), f = fuelDay(fd), hs = healthStats(), t = f.t, target = h.settings.gymTarget;
  const wk = weekStart(today), days = [...Array(7)].map((_, i) => addDays(wk, i)), pt = proteinTarget(), left = t.total - f.kcal;
  const narrow = dt => parseISO(dt).toLocaleDateString('en-GB', { weekday: 'narrow' });
  const rota = days.map(dt => {
    const v = dayType(dt);
    return `<button class="rota-day ${v} ${dt === today ? 'today' : ''}" data-act="rota-cycle" data-day="${dt}" aria-label="${fmtDayShort(dt)}: ${v || 'not set'}">
      <span>${narrow(dt)}</span><b>${v === 'shift' ? 'Shift' : v === 'off' ? 'Off' : '–'}</b></button>`;
  }).join('');
  const gymDays = days.map(dt => `<span class="gd ${h.gym.some(s => s.date === dt) ? 'on' : ''} ${dt === today ? 'today' : ''}">${narrow(dt)}</span>`).join('');
  let next;
  if (hs.thisWeek >= target) next = 'Target hit this week. Rest is part of the plan.';
  else {
    const free = days.filter(dt => dt >= today && dayType(dt) === 'off' && !h.gym.some(s => s.date === dt));
    next = free.length ? `Next good gym day: <b>${free[0] === today ? 'today' : parseISO(free[0]).toLocaleDateString('en-GB', { weekday: 'long' })}</b> (day off). Training on a shift day earns a +${SHIFT_GYM_BONUS} XP bonus.`
      : `${target - hs.thisWeek} more to go this week. Training on a shift day earns a +${SHIFT_GYM_BONUS} XP bonus.`;
  }
  const todayFood = h.food.filter(x => x.date === fd).sort((a, b) => b.ts - a.ts);
  const dayLabel = fd === today ? 'today' : fd === addDays(today, -1) ? 'yesterday' : fmtDayShort(fd);
  const sessions = [...h.gym].sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts).slice(0, 5);
  return `<div>
    ${topNav('Health')}
    ${!dayType(today) ? `<div class="ask-today"><span>Working today?</span>
      <button class="btn btn-ghost btn-sm" data-act="rota-set" data-day="${today}" data-v="off">Day off</button>
      <button class="btn btn-primary btn-sm" data-act="rota-set" data-day="${today}" data-v="shift">Shift</button></div>` : ''}
    <div class="section-title"><span>This week's rota</span><span>Tap a day to change</span></div>
    <div class="rota">${rota}</div>

    <section class="hero">
      <div class="day-nav">
        <button class="icon-btn" data-act="food-day" data-d="-1" ${fd <= addDays(today, -FOOD_BACK_DAYS) ? 'disabled' : ''} aria-label="Previous day">${icon('chevL')}</button>
        <div class="eyebrow">Eaten ${dayLabel}</div>
        <button class="icon-btn" data-act="food-day" data-d="1" ${fd >= today ? 'disabled' : ''} aria-label="Next day">${icon('chevR')}</button>
      </div>
      <div class="hero-amount">${f.kcal.toLocaleString('en-GB')} <small class="of">/ ${t.total.toLocaleString('en-GB')} kcal</small></div>
      <div class="bar ${f.kcal > t.total * 1.1 ? 'over' : ''}"><i style="width:${Math.min(100, (f.kcal / t.total) * 100)}%"></i></div>
      <div class="hero-meta"><span>${left >= 0 ? `${left.toLocaleString('en-GB')} kcal left` : `${(-left).toLocaleString('en-GB')} kcal over`}</span>
        <button class="link" data-act="h-why">How is this worked out?</button></div>
      ${isDeficitGoal() ? deficitNote(f, fd) : ''}
    </section>

    <div class="tiles">
      <div class="tile"><div class="k">Protein</div><div class="v">${f.protein}<small> / ${pt}g</small></div><div class="bar"><i style="width:${Math.min(100, (f.protein / pt) * 100)}%"></i></div></div>
      <button class="tile" data-act="water"><div class="k">Water <span class="plus">+</span></div><div class="v">${f.water}<small> / ${WATER_GOAL}</small></div><div class="bar"><i style="width:${Math.min(100, (f.water / WATER_GOAL) * 100)}%"></i></div></button>
      <button class="tile" data-act="h-why"><div class="k">Fuel score</div><div class="v grade">${f.grade || '—'}</div><div class="s">${!f.grade ? 'log a meal' : fd === today ? 'so far today' : 'for the day'}</div></button>
    </div>

    <div class="section-title"><span>Log a meal</span><span>${fd === today ? 'One tap' : `Adding to ${dayLabel}`}</span></div>
    <div class="meals">
      ${h.meals.map(m => `<button class="meal ${m.fries ? 'fries' : ''}" data-act="meal" data-id="${m.id}"><b>${esc(m.name)}</b><span>${m.kcal.toLocaleString('en-GB')} kcal · ${m.protein} g protein</span></button>`).join('')}
      <button class="meal add" data-act="meal-other">${icon('plus')}<b>Something else</b></button>
    </div>
    ${todayFood.length ? `<section class="panel tx-box" style="margin-top:12px">${todayFood.map(foodItem).join('')}</section>` : ''}

    ${calSection()}

    ${suppSection()}

    ${questStrip('health')}

    <div class="section-title"><span>Gym</span><span>${hs.gymCur ? `${hs.gymCur}-week streak` : `Target: ${target} a week`}</span></div>
    <section class="panel pad gym">
      <div class="gym-top">
        <div><div class="big">${hs.thisWeek}<small> of ${target}</small></div><div class="muted small">sessions this week</div></div>
        <button class="btn btn-primary btn-sm" data-act="gym-log">Log session</button>
      </div>
      <div class="gym-days">${gymDays}</div>
      <p class="treat-note">${next}</p>
    </section>
    ${sessions.length ? `<section class="panel" style="margin-top:12px">${sessions.map(gymItem).join('')}</section>` : ''}

    ${weightSection()}

    <button class="details-btn" data-act="h-settings">
      <span>Your details</span><small>${GOALS[h.profile.goal].name} · ${h.profile.weightKg} kg · gym ${target}/week</small>${icon('chevR')}
    </button>
  </div>`;
}

// Maintenance (what you burn today) vs what you've eaten, and the run of deficit days
function deficitNote(f, date) {
  const t = f.t, maint = t.total - t.adj, n = calStreak(), past = date < todayISO();
  const status = f.kcal > maint ? `Over maintenance: <b>no deficit ${past ? 'that day' : 'today'}</b>.`
    : f.kcal > t.total ? `Over target, but still <b>${(maint - f.kcal).toLocaleString('en-GB')} kcal under maintenance</b>: a small deficit.`
    : past ? (calWin(date) ? `<b>Deficit day</b> banked.` : `Under your body-at-rest burn, so <b>not counted</b> as a deficit day.`)
    : `Finish at or under target to bank a <b>deficit day</b>.`;
  return `<div class="def-note">
      <div class="def-row"><span>${past ? 'You burned' : 'You burn today'}</span><b>~${maint.toLocaleString('en-GB')} kcal</b></div>
      <div class="def-row"><span>Deficit streak</span><b>${n ? `${n} day${n > 1 ? 's' : ''}` : '—'}</b></div>
      <p>${status}</p>
    </div>`;
}

function foodItem(e) {
  return `<div class="hist food">
    <div class="mark">${icon(e.fries ? 'bag' : 'bowl')}</div>
    <div class="main"><div class="t">${esc(e.name)}</div><div class="s">${e.kcal.toLocaleString('en-GB')} kcal · ${e.protein} g protein</div></div>
    <div class="amt">${e.xp ? `<small>+${e.xp} XP</small>` : ''}</div>
    <button class="del" data-act="h-del" data-kind="food" data-id="${e.id}" aria-label="Remove">${icon('x')}</button>
  </div>`;
}

function gymItem(s) {
  return `<div class="hist gymrow">
    <div class="mark">${icon('dumbbell')}</div>
    <div class="main"><div class="t">${fmtDayShort(s.date)}</div><div class="s">${s.mins} min · ~${s.kcal} kcal</div></div>
    <div class="amt">${s.xp ? `<small>+${s.xp} XP</small>` : ''}</div>
    <button class="del" data-act="h-del" data-kind="gym" data-id="${s.id}" aria-label="Remove">${icon('x')}</button>
  </div>`;
}

function weightSection() {
  const h = H(), s = weightSeries(), last = s[s.length - 1], rate = weightRate(s);
  const ago = last ? hDaysBetween(last.date, todayISO()) : 0, span = last ? hDaysBetween(s[0].date, last.date) : 0;
  const when = !last ? '' : ago <= 0 ? 'Weighed today' : ago === 1 ? 'Weighed yesterday' : `Last weighed ${ago} days ago`;
  const all = weightsNewestFirst(), recent = all.slice(0, 3);
  return `<div class="section-title"><span>Weight</span><span>${when}</span></div>
    <section class="panel pad weight">
      <div class="gym-top">
        <div><div class="big">${last ? kgFmt(last.avg) : '–'}<small> kg</small></div><div class="muted small">${s.length > 1 ? '7-day average' : 'your last reading'}</div></div>
        <button class="btn btn-primary btn-sm" data-act="weigh">Weigh in</button>
      </div>
      ${s.length ? `${span > 35 ? `<div class="w-range">${[[30, '1M'], [90, '3M'], [0, 'All']].map(([d, l]) =>
            `<button class="${hWeightRange === d ? 'on' : ''}" data-act="w-range" data-d="${d}">${l}</button>`).join('')}</div>` : ''}
        <div id="w-chart" class="w-chart"></div>
        <div class="w-legend"><span><i class="k-dot"></i>Weigh-in</span>${s.length > 1 ? '<span><i class="k-line"></i>7-day average</span>' : ''}</div>
        ${s.length === 1 ? '<p class="muted small w-one">Weigh in on another day and the line between your dates starts here.</p>' : ''}` : ''}
      <p class="treat-note w-note">${weightVerdict(rate, h.profile.goal, h.profile.weightKg)}</p>
    </section>
    ${recent.length ? `<section class="panel" style="margin-top:12px">${recent.map(w => weighItem(w)).join('')}
      ${all.length > 3 ? `<button class="w-all" data-act="weigh-all">See all ${all.length} weigh-ins</button>` : ''}</section>` : ''}`;
}

const weightsNewestFirst = () => [...H().weights].sort((a, b) => b.date.localeCompare(a.date) || (b.ts || 0) - (a.ts || 0));

// Every reading with its date, newest first, plus the change from the one before it
function weighAllSheet() {
  const all = weightsNewestFirst();
  openSheet(`
    <h2>All weigh-ins</h2>
    <p class="lead">${all.length} readings, newest first.</p>
    <div class="panel w-list">${all.map((w, i) => {
      const prev = all[i + 1], diff = prev ? w.kg - prev.kg : 0;
      return weighItem(w, prev ? `${diff > 0 ? '+' : diff < 0 ? '−' : '±'}${kgFmt(Math.abs(diff))} kg` : 'first');
    }).join('')}</div>
    <div class="sheet-actions"><button class="btn btn-primary" data-close>Done</button></div>`);
}

function weighItem(w, change) {
  return `<div class="hist weighrow">
    <div class="mark">${icon('target')}</div>
    <div class="main"><div class="t">${kgFmt(w.kg)} kg</div><div class="s">${fmtDayShort(w.date)}${w.ts ? '' : ' · from Your details'}</div></div>
    <div class="amt">${change ? `<small>${change}</small>` : w.xp ? `<small>+${w.xp} XP</small>` : ''}</div>
    <button class="del" data-act="h-del" data-kind="weights" data-id="${w.id}" aria-label="Remove">${icon('x')}</button>
  </div>`;
}

// Drawn after render so it can measure its real width (crisp text and round dots at any screen size)
function drawWeightChart() {
  const box = $('#w-chart');
  if (!box || !state.health) return;
  const all = weightSeries(), end = all[all.length - 1].date;
  let P = hWeightRange ? all.filter(p => p.date > addDays(end, -hWeightRange)) : all;
  if (P.length < 2) P = all.slice(-2);
  const W = box.clientWidth, HT = box.clientHeight, L = 34, R = 10, T = 22, B = 24, one = P.length === 1;
  const span = Math.max(1, hDaysBetween(P[0].date, end)), vals = P.flatMap(p => [p.kg, p.avg]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const range = Math.max(hi - lo, 1), step = range <= 2 ? 0.5 : range <= 5 ? 1 : range <= 10 ? 2 : 5;
  lo = Math.floor((lo - 0.2) / step) * step;
  hi = Math.ceil((hi + 0.2) / step) * step;
  const x = d => (one ? (L + W - R) / 2 : L + (hDaysBetween(P[0].date, d) / span) * (W - L - R));
  const y = v => T + ((hi - v) / (hi - lo)) * (HT - T - B);
  const short = d => parseISO(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  let grid = '';
  for (let v = lo; v <= hi + 1e-9; v += step) {
    grid += `<line class="w-grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="w-tick" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${step < 1 ? v.toFixed(1) : v.toFixed(0)}</text>`;
  }
  // With room between points (a few weigh-ins), every point gets its own date and kg; otherwise just the ends
  const gap = Math.min(Infinity, ...P.slice(1).map((p, i) => x(p.date) - x(P[i].date)));
  const each = one || gap >= 44;
  const xl = one ? [[end, 'middle']] : each ? P.map((p, i) => [p.date, i === 0 ? 'start' : i === P.length - 1 ? 'end' : 'middle'])
    : [[P[0].date, 'start'], ...(span >= 21 ? [[addDays(P[0].date, Math.round(span / 2)), 'middle']] : []), [end, 'end']];
  const r = P.length > 40 ? 3 : 4;
  // A reading under its average gets its label underneath, away from the line (when there's room above the dates)
  const ly = p => (p.kg < p.avg && y(p.kg) + 16 <= HT - B ? y(p.kg) + 16 : y(p.kg) - 9);
  const kgl = each ? P.map((p, i) => `<text class="w-val" x="${x(p.date)}" y="${ly(p)}" text-anchor="${one ? 'middle' : i === 0 ? 'start' : i === P.length - 1 ? 'end' : 'middle'}">${kgFmt(p.kg)}</text>`).join('') : '';
  box.innerHTML = `<svg width="${W}" height="${HT}" role="img" aria-label="Weight from ${kgFmt(P[0].avg)} to ${kgFmt(P[P.length - 1].avg)} kg (7-day average), ${short(P[0].date)} to ${short(end)}">
      ${grid}
      ${xl.map(([d, a]) => `<text class="w-tick" x="${x(d)}" y="${HT - 6}" text-anchor="${a}">${short(d)}</text>`).join('')}
      ${P.map(p => `<circle class="w-dot" cx="${x(p.date)}" cy="${y(p.kg)}" r="${r}"/>`).join('')}
      ${one ? '' : `<path class="w-line" d="${P.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.avg).toFixed(1)}`).join('')}"/>
      <circle class="w-end" cx="${x(end)}" cy="${y(P[P.length - 1].avg)}" r="4.5"/>`}
      ${kgl}
      <line class="w-cross" x1="0" x2="0" y1="${T}" y2="${HT - B}" style="display:none"/>
      <circle class="w-hi" r="5" style="display:none"/>
    </svg>
    <div class="w-tip" hidden><div><b></b> <span>on the scale</span></div><div class="w-tip-d"></div><div class="w-tip-kg"></div></div>`;
  const svg = box.firstElementChild, tip = box.querySelector('.w-tip'), cross = box.querySelector('.w-cross'), dot = box.querySelector('.w-hi');
  // The crosshair snaps to the nearest weigh-in, so you never have to hit a dot exactly
  const show = ev => {
    const px = ev.clientX - svg.getBoundingClientRect().left;
    const p = P.reduce((b, q) => (Math.abs(x(q.date) - px) < Math.abs(x(b.date) - px) ? q : b));
    const cx = x(p.date);
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.style.display = '';
    dot.setAttribute('cx', cx); dot.setAttribute('cy', y(p.kg)); dot.style.display = '';
    tip.querySelector('b').textContent = `${kgFmt(p.kg)} kg`;
    tip.querySelector('.w-tip-d').textContent = fmtDayShort(p.date);
    tip.querySelector('.w-tip-kg').textContent = one ? '' : `7-day average ${kgFmt(p.avg)} kg`;
    tip.hidden = false;
    tip.style.left = cx >= W / 2 ? `${L + 6}px` : '';
    tip.style.right = cx >= W / 2 ? '' : `${R + 6}px`;
  };
  svg.addEventListener('pointerdown', show);
  svg.addEventListener('pointermove', show);
  svg.addEventListener('pointerleave', ev => { if (ev.pointerType === 'mouse') { tip.hidden = true; cross.style.display = dot.style.display = 'none'; } });
}
addEventListener('resize', () => { drawWeightChart(); drawCalChart(); });

/* ---------- Calorie history ----------
   Eaten vs that day's target, so you can see how much intake swings. Days with nothing logged stay blank
   instead of counting as zero, and today is drawn faded because it isn't over yet. */
let hFoodDay = null;          // the day "Eaten" shows and meals are added to (null = today)
let hCalRange = 14;           // days shown on the calorie chart
const FOOD_BACK_DAYS = 7;     // how far back food can be added or removed
const foodDay = () => hFoodDay || todayISO();

function calDays(n) {
  const today = todayISO(), logged = new Set(H().food.map(x => x.date));
  return [...Array(n)].map((_, i) => addDays(today, i - n + 1)).map(d => {
    const f = fuelDay(d);
    return { date: d, kcal: f.kcal, target: f.t.total, logged: logged.has(d), today: d === today };
  });
}

function calSection() {
  const all = calDays(hCalRange), days = all.filter(d => d.logged), done = days.filter(d => !d.today);
  const k = n => Math.round(n).toLocaleString('en-GB');
  let summary = 'Log a few days of meals to see how your calories move.';
  if (done.length >= 2) {
    const avg = sum(done, d => d.kcal) / done.length, avgT = sum(done, d => d.target) / done.length;
    const lo = Math.min(...done.map(d => d.kcal)), hi = Math.max(...done.map(d => d.kcal));
    const under = done.filter(d => d.kcal <= d.target).length;
    summary = `Average <b>${k(avg)} kcal</b> a day against a <b>${k(avgT)}</b> target. Under target on <b>${under} of ${done.length}</b> logged days. Swing: <b>${k(hi - lo)} kcal</b> (${k(lo)} to ${k(hi)}).`;
  }
  // Which foods your calories come from over the same range
  const groups = {};
  H().food.filter(x => x.date > addDays(todayISO(), -hCalRange)).forEach(x => {
    const g = groups[x.name] || (groups[x.name] = { name: x.name, kcal: 0, n: 0 });
    g.kcal += x.kcal; g.n++;
  });
  const top = Object.values(groups).sort((a, b) => b.kcal - a.kcal), total = sum(top, g => g.kcal), max = top[0]?.kcal || 1;
  return `<div class="section-title"><span>Calories</span><span>Last ${hCalRange} days</span></div>
    <section class="panel pad cals">
      <div class="w-range">${[[7, '7D'], [14, '14D'], [30, '30D']].map(([d, l]) =>
        `<button class="${hCalRange === d ? 'on' : ''}" data-act="cal-range" data-d="${d}">${l}</button>`).join('')}</div>
      ${days.length ? `<div id="c-chart" class="w-chart"></div>
        <div class="w-legend"><span><i class="k-bar"></i>Under target</span><span><i class="k-bar over"></i>Over target</span><span><i class="k-line t"></i>Target</span></div>` : ''}
      <p class="treat-note w-note">${summary}</p>
    </section>
    ${top.length ? `<div class="section-title"><span>Calories by food</span><span>Last ${hCalRange} days</span></div>
    <section class="panel pad topfoods">${top.slice(0, 6).map(g => `<div class="tf">
        <div class="tf-top"><b>${esc(g.name)}</b><span>${k(g.kcal)} kcal · ${Math.round((g.kcal / total) * 100)}%</span></div>
        <div class="tf-bar"><i style="width:${(g.kcal / max) * 100}%"></i></div>
        <div class="tf-sub">${g.n} time${g.n > 1 ? 's' : ''} · ${k(g.kcal / g.n)} kcal each</div>
      </div>`).join('')}${top.length > 6 ? `<p class="tf-sub">Plus ${top.length - 6} more foods, ${k(sum(top.slice(6), g => g.kcal))} kcal</p>` : ''}</section>` : ''}`;
}

function drawCalChart() {
  const box = $('#c-chart');
  if (!box || !state.health) return;
  const D = calDays(hCalRange), W = box.clientWidth, HT = box.clientHeight, L = 38, R = 6, T = 8, B = 24;
  const top = Math.max(...D.map(d => Math.max(d.kcal, d.target))) * 1.05, step = top > 3000 ? 1000 : 500, hi = Math.ceil(top / step) * step;
  const slot = (W - L - R) / D.length, bw = Math.min(24, Math.max(3, slot - 3));
  const x = i => L + slot * i + slot / 2, y = v => T + (1 - v / hi) * (HT - T - B);
  const short = d => parseISO(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  let grid = '';
  for (let v = 0; v <= hi; v += step) grid += `<line class="w-grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="w-tick" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v >= 1000 ? `${v / 1000}k` : v}</text>`;
  const xl = [[0, 'start'], [Math.floor((D.length - 1) / 2), 'middle'], [D.length - 1, 'end']];
  // Bars: 4px rounded top, square at the baseline; target as a short tick across each day's slot
  const bar = (d, i) => {
    if (!d.logged) return '';
    const h = Math.max(1, y(0) - y(d.kcal)), r = Math.min(4, bw / 2, h), x0 = x(i) - bw / 2, y0 = y(d.kcal);
    return `<path class="c-bar ${d.kcal > d.target ? 'over' : ''} ${d.today ? 'now' : ''}" d="M${x0},${y(0)}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x0 + bw - r}Q${x0 + bw},${y0} ${x0 + bw},${y0 + r}V${y(0)}Z"/>`;
  };
  box.innerHTML = `<svg width="${W}" height="${HT}" role="img" aria-label="Calories eaten each day against target, last ${hCalRange} days">
      ${grid}
      ${xl.map(([i, a]) => `<text class="w-tick" x="${a === 'start' ? L : a === 'end' ? W - R : x(i)}" y="${HT - 6}" text-anchor="${a}">${D[i].today ? 'Today' : short(D[i].date)}</text>`).join('')}
      ${D.map(bar).join('')}
      ${D.map((d, i) => `<line class="c-target" x1="${x(i) - slot / 2 + 1}" x2="${x(i) + slot / 2 - 1}" y1="${y(d.target)}" y2="${y(d.target)}"/>`).join('')}
      <rect class="c-hi" y="${T}" height="${HT - T - B}" style="display:none"/>
    </svg>
    <div class="w-tip" hidden><div><b></b> <span></span></div><div class="w-tip-kg"></div><div class="w-tip-d"></div></div>`;
  const svg = box.firstElementChild, tip = box.querySelector('.w-tip'), hl = box.querySelector('.c-hi');
  const show = ev => {
    const i = Math.max(0, Math.min(D.length - 1, Math.floor((ev.clientX - svg.getBoundingClientRect().left - L) / slot))), d = D[i];
    hl.setAttribute('x', x(i) - slot / 2); hl.setAttribute('width', slot); hl.style.display = '';
    tip.querySelector('b').textContent = d.logged ? `${d.kcal.toLocaleString('en-GB')} kcal` : 'Nothing logged';
    tip.querySelector('span').textContent = d.logged ? (d.today ? 'so far' : 'eaten') : '';
    tip.querySelector('.w-tip-kg').textContent = `Target ${d.target.toLocaleString('en-GB')} kcal${d.logged && !d.today ? ` · ${d.kcal > d.target ? `${(d.kcal - d.target).toLocaleString('en-GB')} over` : `${(d.target - d.kcal).toLocaleString('en-GB')} under`}` : ''}`;
    tip.querySelector('.w-tip-d').textContent = d.today ? 'Today' : fmtDayShort(d.date);
    tip.hidden = false;
    tip.style.left = x(i) > W / 2 ? `${L + 6}px` : '';
    tip.style.right = x(i) > W / 2 ? '' : `${R + 6}px`;
  };
  svg.addEventListener('pointerdown', show);
  svg.addEventListener('pointermove', show);
  svg.addEventListener('pointerleave', ev => { if (ev.pointerType === 'mouse') { tip.hidden = true; hl.style.display = 'none'; } });
}

function healthFields(p, s) {
  const chips = (name, opts, val) => `<div class="purposes">${opts.map(([v, l]) =>
    `<label class="purpose"><input type="radio" name="${name}" value="${v}" ${String(v) === String(val) ? 'checked' : ''} hidden>${l}</label>`).join('')}</div>`;
  return `
    <div class="field-label">Goal</div>${chips('goal', Object.entries(GOALS).map(([k, g]) => [k, g.name]), p.goal)}
    <div class="grid2">
      <label class="field"><span>Height (cm)</span><input name="height" ${moneyAttrs('int', p.heightCm)}><small>6 ft = 183 cm</small></label>
      <label class="field"><span>Weight (kg)</span><input name="weight" ${moneyAttrs('kg', p.weightKg)}></label>
    </div>
    <div class="grid2">
      <label class="field"><span>Age</span><input name="age" ${moneyAttrs('int', p.age)}></label>
      <div><div class="field-label">Body</div>${chips('sex', [['m', 'Male'], ['f', 'Female']], p.sex)}</div>
    </div>
    <div class="field-label">Gym sessions a week</div>${chips('gym', [[2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']], s.gymTarget)}
    <label class="field"><span>Extra calories burned on a shift day</span><input name="shift" ${moneyAttrs('int', s.shiftBurn)}>
      <small>Long hospitality shifts on your feet often burn 600–1,000 extra. 800 is a sensible start.</small></label>`;
}

function healthSetupView() {
  return `<div>
    ${topNav('New tracker')}
    <h1 class="page-title">Health</h1>
    <p class="page-lead">Food, gym and your shift rota in one place. These details set your daily calorie target, and they stay on this device.</p>
    <form id="f-hsetup">
      ${healthFields({ heightCm: 183, weightKg: 85, age: 27, sex: 'm', goal: 'maintain' }, { gymTarget: 3, shiftBurn: 800 })}
      <div id="h-err" class="err"></div>
      <button class="btn btn-primary btn-block">Start tracking</button>
    </form>
  </div>`;
}

function readHealthForm(f) {
  const p = { heightCm: num(f.elements.height.value), weightKg: num(f.elements.weight.value), age: num(f.elements.age.value), sex: f.elements.sex.value || 'm', goal: f.elements.goal.value || 'maintain' };
  const s = { gymTarget: Number(f.elements.gym.value) || 3, shiftBurn: num(f.elements.shift.value) || 0 };
  if (!(p.heightCm > 100 && p.heightCm < 250 && p.weightKg > 30 && p.weightKg < 300 && p.age > 12 && p.age < 100)) return null;
  return { p, s };
}

/* Sheets */
function foodSheet() {
  openSheet(`
    <h2>Something else</h2>
    <p class="lead">A rough estimate is fine. Logging consistently matters more than being precise.</p>
    <form id="f-food">
      <label class="field"><span>What did you eat?</span><input name="name" maxlength="40" placeholder="Chicken wrap"></label>
      <div class="grid2">
        <label class="field"><span>Calories</span><input name="kcal" ${moneyAttrs('int')} placeholder="0"></label>
        <label class="field"><span>Protein (g)</span><input name="protein" ${moneyAttrs('int')} placeholder="0"></label>
      </div>
      <label class="check-row"><input type="checkbox" name="fries"> Came with fries</label>
      <label class="check-row"><input type="checkbox" name="fav" checked> Save to my meals for one-tap logging</label>
      <div id="f-err" class="err"></div>
      ${sheetButtons('Log meal')}
    </form>`);
  setTimeout(() => $('#f-food [name=name]')?.focus(), 80);
}

function gymSheet() {
  const chips = (name, opts, val) => `<div class="purposes">${opts.map(([v, l]) =>
    `<label class="purpose"><input type="radio" name="${name}" value="${v}" ${v === val ? 'checked' : ''} hidden>${l}</label>`).join('')}</div>`;
  openSheet(`
    <h2>Log a session</h2>
    <p class="lead">Any day counts. On a shift day it's a double win, with +${SHIFT_GYM_BONUS} bonus XP.</p>
    <form id="f-gym">
      <div class="field-label">Duration</div>${chips('mins', [30, 45, 60, 75, 90].map(m => [String(m), `${m} min`]), '60')}
      <label class="field"><span>Date</span><input name="date" type="date" value="${todayISO()}"></label>
      <div class="preview" id="g-preview"></div>
      ${sheetButtons('Log session')}
    </form>`);
  updateGymPreview();
}

function updateGymPreview() {
  const f = $('#f-gym');
  if (!f) return;
  const k = gymKcal(Number(f.elements.mins.value)), onShift = dayType(f.elements.date.value) === 'shift';
  $('#g-preview').innerHTML = kv('Estimated burn', `~${k} kcal`, "added to that day's calorie target")
    + kv('Reward', `+${award(H_XP.gym + (onShift ? SHIFT_GYM_BONUS : 0)).xp} XP`, onShift ? `includes +${SHIFT_GYM_BONUS} shift-day bonus` : '');
}

// Each supplement: today's tick, this week's taken/skipped days (tap a past day to fix it), and the last 7 days
function suppSection() {
  const list = H().supps.list, today = todayISO(), wk = weekStart(today), days = [...Array(7)].map((_, i) => addDays(wk, i));
  const narrow = dt => parseISO(dt).toLocaleDateString('en-GB', { weekday: 'narrow' });
  const done = list.filter(s => suppTaken(s.id, today).length).length;
  const rows = list.map(s => {
    const on = suppTaken(s.id, today).length > 0;
    const last7 = [...Array(7)].map((_, i) => addDays(today, -i)).filter(d => suppTaken(s.id, d).length).length;
    return `<div class="supp-row">
      <button class="supp-tick ${on ? 'on' : ''}" data-act="supp" data-id="${s.id}" aria-pressed="${on}" aria-label="${esc(s.name)}: ${on ? 'taken today' : 'not taken today'}">${icon('tick')}</button>
      <div class="supp-main">
        <div class="supp-name"><b>${esc(s.name)}</b><span>${last7} of last 7 days</span></div>
        <div class="supp-week">${days.map(d => `<button class="sd ${suppTaken(s.id, d).length ? 'on' : ''} ${d === today ? 'today' : ''}" data-act="supp-day" data-id="${s.id}" data-day="${d}" ${d > today ? 'disabled' : ''}
          aria-label="${esc(s.name)}, ${fmtDayShort(d)}: ${suppTaken(s.id, d).length ? 'taken' : 'not taken'}">${narrow(d)}</button>`).join('')}</div>
      </div>
    </div>`;
  }).join('');
  return `<div class="section-title"><span>Supplements</span><span>${list.length ? `${done} of ${list.length} today` : ''}</span></div>
    <section class="panel supps">
      ${rows || '<p class="empty">No supplements on your list.</p>'}
      <button class="small-btn supp-edit" data-act="supp-edit">${icon('plus')}Edit list</button>
    </section>`;
}

function takeSupp(s, date = todayISO()) {
  // Ticking a past day fixes the record but earns no XP, so XP stays tied to taking it on the day
  const g0 = globalStats(), { xp, mult } = date === todayISO() ? award(H_XP.supp) : { xp: 0, mult: 1 };
  const e = { id: uid(), suppId: s.id, date, ts: Date.now(), xp, mult };
  H().supps.log.push(e);
  save();
  render();
  finishAction(g0, `${esc(s.name)} · ${date === todayISO() ? 'taken today' : `ticked for ${fmtDayShort(date)}`}${xp ? ` · <b>${xpLabel(e)}</b>` : ''}`);
}
const untickSupp = (id, date) => { H().supps.log = H().supps.log.filter(x => !(x.suppId === id && x.date === date)); save(); render(); };

// Already taken today: say when, and offer only an untick, never a second dose
function suppAgainSheet(s) {
  const at = new Date(suppTaken(s.id, todayISO())[0].ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  openSheet(`
    <h2>Already taken today</h2>
    <p class="lead">You ticked ${esc(s.name)} at ${at}. One a day is the plan, so there's nothing more to take.</p>
    <div class="sheet-actions">
      <button class="btn btn-ghost" data-act="supp-undo" data-id="${s.id}">Untick it</button>
      <button class="btn btn-primary" data-close>Got it</button>
    </div>`);
}

function suppEditSheet() {
  openSheet(`
    <h2>Your supplements</h2>
    <p class="lead">Removing one keeps its past days in your history.</p>
    <div class="panel" style="margin-bottom:18px">${H().supps.list.map(s => `<div class="kv"><span class="k">${esc(s.name)}</span>
      <button type="button" class="del" data-act="supp-remove" data-id="${s.id}" aria-label="Remove ${esc(s.name)}">${icon('x')}</button></div>`).join('') || '<p class="empty">No supplements yet.</p>'}</div>
    <form id="f-supp">
      <label class="field"><span>Add a supplement</span><input name="name" maxlength="30" placeholder="Omega-3"></label>
      <div id="s-err" class="err"></div>
      ${sheetButtons('Add')}
    </form>`);
}

function weighSheet() {
  const s = weightSeries(), last = s[s.length - 1];
  openSheet(`
    <h2>Weigh in</h2>
    <p class="lead">Weigh at the same time each day: first thing in the morning, before eating. Daily ups and downs are normal; the 7-day average is what counts.</p>
    <form id="f-weigh">
      <div class="grid2">
        <label class="field"><span>Weight (kg)</span><input name="kg" ${moneyAttrs('kg')} placeholder="${last ? kgFmt(last.kg) : '0.0'}"></label>
        <label class="field"><span>Date</span><input name="date" type="date" value="${todayISO()}" max="${todayISO()}"></label>
      </div>
      <div id="w-err" class="err"></div>
      ${sheetButtons('Save')}
    </form>`);
  setTimeout(() => $('#f-weigh [name=kg]')?.focus(), 80);
}

function healthSettingsSheet() {
  const h = H();
  openSheet(`
    <h2>Your details</h2>
    <p class="lead">These set your daily calorie and protein targets.</p>
    <form id="f-hsettings">
      ${healthFields(h.profile, h.settings)}
      <div class="field-label">Saved meals</div>
      <div class="panel" style="margin-bottom:18px">${h.meals.map(m => `<div class="kv"><span class="k">${esc(m.name)}<br><small>${m.kcal.toLocaleString('en-GB')} kcal · ${m.protein} g</small></span>
        <button type="button" class="del" data-act="meal-remove" data-id="${m.id}" aria-label="Remove ${esc(m.name)}">${icon('x')}</button></div>`).join('') || '<p class="empty">No saved meals.</p>'}</div>
      <div id="h-err" class="err"></div>
      ${sheetButtons('Save')}
    </form>`);
}

function whySheet() {
  const p = H().profile, today = todayISO(), t = dayTarget(today), b = Math.round(bmr(p)), f = fuelDay(today);
  const sign = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toLocaleString('en-GB');
  openSheet(`
    <h2>Your daily target</h2>
    <p class="lead">An estimate, not a prescription. It changes with your rota and gym sessions every day.</p>
    <div class="panel">
      ${kv('Body at rest', `${b.toLocaleString('en-GB')} kcal`, 'from height, weight and age')}
      ${kv('Everyday movement', sign(t.base - b), '×1.3 for normal daily life')}
      ${kv('Shift', t.shift ? sign(t.shift) : '—', t.shift ? 'walking on a long shift' : dayType(today) === 'off' ? 'day off' : 'rota not set')}
      ${kv('Gym today', t.gym ? sign(t.gym) : '—')}
      ${kv('Maintenance', `${(t.total - t.adj).toLocaleString('en-GB')} kcal`, 'what you burn today')}
      ${kv(`Goal: ${GOALS[p.goal].name}`, t.adj ? sign(t.adj) : '—', t.adj < 0 ? 'your daily deficit' : '')}
      ${kv("Today's target", `${t.total.toLocaleString('en-GB')} kcal`, '', 'pos')}
    </div>
    <div class="section-title"><span>Fuel score${f.grade ? ` · ${f.grade} so far` : ''}</span></div>
    <div class="panel">
      ${kv(isDeficitGoal() ? 'Calories in your deficit' : 'Calories near target', '40 pts', isDeficitGoal() ? `at or under target, but above ${b.toLocaleString('en-GB')}` : 'within 10% of target')}
      ${kv(`Protein (${proteinTarget()} g)`, '30 pts', '1.6 g per kg of body weight')}
      ${kv(`Water (${WATER_GOAL} glasses)`, '15 pts')}
      ${kv('Fry-free on a shift', '15 pts', 'days off count automatically')}
    </div>
    <p class="hint">A 85+, B 70+, C 55+, D below.</p>
    ${isDeficitGoal() ? `<p class="hint"><b>Deficit day:</b> a finished day where you ate at or under your target, but not less than ${b.toLocaleString('en-GB')} kcal (your body at rest). Eating less than that isn't a win: it costs muscle and energy for your shifts.</p>` : ''}
    <button class="btn btn-primary btn-block" data-close>Got it</button>`);
}

function rotaAskSheet() {
  const today = todayISO();
  openSheet(`
    <h2>Working today?</h2>
    <p class="lead">Shift days add extra calories to your target and count towards fry-free shifts.</p>
    <div class="sheet-actions">
      <button class="btn btn-ghost" data-act="rota-set" data-day="${today}" data-v="off">Day off</button>
      <button class="btn btn-primary" data-act="rota-set" data-day="${today}" data-v="shift">Working a shift</button>
    </div>`);
}

/* Actions */
// Health logs (food, water, gym) share one path: XP with momentum, save, celebrate
function addHealth(kind, e, msgFor, big = false) {
  const g0 = globalStats();
  let xp = 0, mult = 1;
  const waterFull = kind === 'water' && H().water.filter(w => w.date === e.date).length >= WATER_GOAL;
  // Food and water added to a past day fix the record but earn no XP
  const backfill = (kind === 'food' || kind === 'water') && e.date < todayISO();
  if (!waterFull && !backfill) ({ xp, mult } = award(H_XP[kind] + (e.bonus || 0)));
  Object.assign(e, { id: uid(), ts: Date.now(), xp, mult });
  H()[kind].push(e);
  if (kind === 'weights') syncWeight();
  save();
  render();
  finishAction(g0, msgFor(e), { big });
}

function logMeal(m) {
  addHealth('food', { date: foodDay(), mealId: m.id, name: m.name, kcal: m.kcal, protein: m.protein, fries: !!m.fries }, e => {
    const f = fuelDay(e.date), left = f.t.total - f.kcal, today = e.date === todayISO();
    const fryNote = today && f.shift && !f.fries ? ' · fry-free shift so far' : '';
    return `${esc(e.name)} · ${e.kcal.toLocaleString('en-GB')} kcal · ${left >= 0 ? `${left.toLocaleString('en-GB')} left` : `${(-left).toLocaleString('en-GB')} over`} ${today ? 'today' : `on ${fmtDayShort(e.date)}`}${fryNote}${e.xp ? ` · <b>${xpLabel(e)}</b>` : ''}`;
  });
}

const healthForms = {
  'f-hsetup'(f) {
    const r = readHealthForm(f);
    if (!r) return ($('#h-err').textContent = 'Check your height, weight and age.');
    state.health = { createdAt: todayISO(), profile: r.p, settings: r.s, rota: {}, meals: DEFAULT_MEALS.map(m => ({ ...m })), seeded: DEFAULT_MEALS.map(m => m.id), food: [], gym: [], water: [], weights: [{ id: uid(), date: todayISO(), kg: r.p.weightKg }], supps: { list: DEFAULT_SUPPS.map(x => ({ ...x })), log: [] } };
    save();
    view = 'health';
    animateNext = true;
    history.replaceState({ v: 'health' }, '');
    render();
    scrollTo(0, 0);
    sfx.chime();
    toast("Health is ready. Start by setting today's shift and logging your next meal.");
  },

  'f-hsettings'(f) {
    const r = readHealthForm(f);
    if (!r) return ($('#h-err').textContent = 'Check your height, weight and age.');
    const h = H();
    if (r.p.weightKg !== h.profile.weightKg) h.weights.push({ id: uid(), date: todayISO(), kg: r.p.weightKg });
    Object.assign(h.profile, r.p);
    Object.assign(h.settings, r.s);
    save();
    closeSheet();
    render();
    toast('Details saved. Your targets are updated.');
  },

  'f-food'(f) {
    const name = f.elements.name.value.trim(), kcal = num(f.elements.kcal.value), protein = num(f.elements.protein.value) || 0;
    if (!name) return ($('#f-err').textContent = 'Name the meal.');
    if (!kcal) return ($('#f-err').textContent = 'Add a calorie estimate.');
    const m = { id: uid(), name, kcal, protein, fries: f.elements.fries.checked };
    if (f.elements.fav.checked) H().meals.push(m);
    closeSheet();
    logMeal(m);
  },

  'f-supp'(f) {
    const name = f.elements.name.value.trim();
    if (!name) return ($('#s-err').textContent = 'Name the supplement.');
    if (H().supps.list.some(s => s.name.toLowerCase() === name.toLowerCase())) return ($('#s-err').textContent = "It's already on your list.");
    H().supps.list.push({ id: uid(), name });
    save(); render(); suppEditSheet();
  },

  'f-weigh'(f) {
    const kg = num(f.elements.kg.value), date = f.elements.date.value || todayISO();
    if (!(kg > 30 && kg < 300)) return ($('#w-err').textContent = 'Enter your weight in kg, for example 84.6.');
    if (date > todayISO()) return ($('#w-err').textContent = "That date hasn't happened yet.");
    closeSheet();
    // One XP weigh-in per day: a second one that day just corrects the reading
    const same = weighIns().find(w => w.date === date);
    if (same) {
      same.kg = kg;
      syncWeight(); save(); render();
      return toast(`${fmtDayShort(date)} updated to ${kgFmt(kg)} kg.`);
    }
    addHealth('weights', { date, kg }, e => {
      const s = weightSeries(), p = s.find(x => x.date === e.date);
      return `${kgFmt(e.kg)} kg · 7-day average ${kgFmt(p.avg)} kg · <b>${xpLabel(e)}</b>`;
    });
  },

  'f-gym'(f) {
    const mins = Number(f.elements.mins.value), date = f.elements.date.value || todayISO();
    closeSheet();
    // Training on a shift day is a double win: on your feet all shift and in the gym
    const onShift = dayType(date) === 'shift';
    addHealth('gym', { mins, date, kcal: gymKcal(mins), ...(onShift ? { bonus: SHIFT_GYM_BONUS } : {}) }, e => {
      const n = healthStats().thisWeek, target = H().settings.gymTarget;
      return `${onShift ? '<b>Shift and gym, double win.</b> ' : ''}Gym · ${mins} min · ~${e.kcal} kcal · <b>${n} of ${target}</b> this week${n === target ? ' · <b>target hit</b>' : ''} · <b>${xpLabel(e)}</b>`;
    }, true);
  },
};

/* ---------- Registration ---------- */
const HEALTH_SLOT = ['gymT', 'fry3', 'gymT', 'protein4', 'gymT', 'water4'];

registerTracker({
  id: 'health',
  order: 30,
  cardOrder: 20,

  // New one-tap meals reach existing Health users once (deleting one later keeps it deleted)
  migrate(s) {
    if (!s.health) return;
    s.health.seeded = s.health.seeded || DEFAULT_MEALS.filter(m => m.id !== 'm-burger-salad').map(m => m.id);
    DEFAULT_MEALS.forEach((m, i) => {
      if (s.health.seeded.includes(m.id)) return;
      s.health.seeded.push(m.id);
      if (!s.health.meals.some(x => x.id === m.id)) s.health.meals.splice(Math.min(i, s.health.meals.length), 0, { ...m });
    });
    // Older weight entries had no id, so they couldn't be removed from the list
    s.health.weights = (s.health.weights || []).map(w => (w.id ? w : { ...w, id: uid() }));
    // Supplements arrived later: existing Health users get the starting list once
    if (!s.health.supps) s.health.supps = { list: DEFAULT_SUPPS.map(x => ({ ...x })), log: [] };
  },

  views: { health: healthView, 'health-setup': healthSetupView },
  needsData: { health: () => !!state.health },
  card: healthCard,
  notices: () => (state.health && !dayType(todayISO()) ? [notice('rota-ask', 'Working today? Set it in your rota', 'var(--a2)')] : []),

  activity(add) { if (state.health) [...state.health.food, ...state.health.gym, ...state.health.water, ...weighIns(), ...suppLog()].forEach(x => add(x.ts, x.xp)); },
  xp: () => (state.health ? sum([...state.health.food, ...state.health.gym, ...state.health.water, ...weighIns(), ...suppLog()], x => x.xp) : 0),
  stats: () => ({ Hs: healthStats() }),

  quests: {
    gymT: { text: 'Hit your weekly gym target', goal: () => state.health?.settings.gymTarget || 3, get: w => w.gym },
    fry3: { text: 'Fry-free on 3 shifts', goal: 3, get: w => w.fryFree },
    protein4: { text: 'Hit your protein target on 4 days', goal: 4, get: w => w.proteinDays },
    calT4: { text: 'Hit your calorie target on 4 days', goal: 4, get: w => w.calDays },
    water4: { text: `Drink ${WATER_GOAL} glasses of water on 4 days`, goal: 4, get: w => w.waterDays },
  },
  // A fourth weekly quest, from the week Health was set up
  questSlots: [
    { ids: HEALTH_SLOT, active: wk => !!state.health && wk >= weekStart(state.health.createdAt) },
    // Calorie target (your deficit on a fat-loss goal); days count once they're over
    { ids: ['calT4'], active: wk => !!state.health && wk >= CAL_QUEST_FROM && wk >= weekStart(state.health.createdAt) },
  ],
  weekData(w, inWeek) {
    if (!state.health) return;
    const h = state.health;
    w.gym = h.gym.filter(s => inWeek(s.date)).length;
    const days = [...new Set(h.food.filter(f => inWeek(f.date)).map(f => f.date))].map(fuelDay);
    w.fryFree = days.filter(f => f.shift && !f.fries).length;
    w.proteinDays = days.filter(f => f.protein >= proteinTarget()).length;
    w.calDays = [...new Set(h.food.filter(f => inWeek(f.date)).map(f => f.date))].filter(calWin).length;
    const wc = {};
    h.water.filter(x => inWeek(x.date)).forEach(x => { wc[x.date] = (wc[x.date] || 0) + 1; });
    w.waterDays = Object.values(wc).filter(n => n >= WATER_GOAL).length;
  },

  milestones: [
    ms('h-meal-1', 'First meal logged', '', 100, g => g.Hs.meals >= 1),
    ms('h-water-1', 'Eight glasses in a day', '', 100, g => g.Hs.water8 >= 1),
    ms('h-fry-1', 'First fry-free shift', 'Same shift, better fuel', 150, g => g.Hs.fryFree >= 1),
    ms('h-fry-10', 'Ten fry-free shifts', '', 500, g => g.Hs.fryFree >= 10),
    ms('h-fry-50', 'Fifty fry-free shifts', 'A new default', 1500, g => g.Hs.fryFree >= 50),
    ms('h-fuel-a', 'First A for fuel', '', 200, g => g.Hs.fuelA >= 1),
    ms('h-fuel-a7', 'Seven A days', '', 800, g => g.Hs.fuelA >= 7),
    ms('h-gym-1', 'First gym session', '', 150, g => g.Hs.gymCount >= 1),
    ms('h-double-1', 'Shift and gym', 'Trained on a working day', 200, g => g.Hs.doubles >= 1),
    ms('h-double-10', 'Ten double days', 'Shift and gym, ten times', 1000, g => g.Hs.doubles >= 10),
    ms('h-week-1', 'Gym target hit', 'A full week of training', 300, g => g.Hs.gymWeeks >= 1),
    ms('h-week-4', 'Four weeks on target', '', 800, g => g.Hs.gymBest >= 4),
    ms('h-week-12', 'Twelve weeks on target', 'A real habit now', 2000, g => g.Hs.gymBest >= 12),
    ms('h-gym-25', '25 gym sessions', '', 600, g => g.Hs.gymCount >= 25),
    ms('h-gym-100', '100 gym sessions', '', 2500, g => g.Hs.gymCount >= 100),
    ms('h-weigh-1', 'First weigh-in', '', 100, g => g.Hs.weighs >= 1),
    ms('h-weigh-w4', 'Weighed in on 4 weeks', 'Enough to see a trend', 250, g => g.Hs.weighWeeks >= 4),
    ms('h-weigh-w12', 'Weighed in on 12 weeks', 'A trend you can trust', 800, g => g.Hs.weighWeeks >= 12),
    ms('h-def-1', 'First deficit day', 'Under target, still well fed', 150, g => g.Hs.defDays >= 1),
    ms('h-def-7', 'Seven deficit days in a row', '', 600, g => g.Hs.defBest >= 7),
    ms('h-def-30', 'Thirty deficit days', 'Fat loss on autopilot', 1500, g => g.Hs.defDays >= 30),
    ms('h-supp-1', 'Full supplement day', 'Every one on your list', 100, g => g.Hs.suppFull >= 1),
    ms('h-supp-7', 'Supplements, 7 days straight', '', 400, g => g.Hs.suppBest >= 7),
    ms('h-supp-30', 'Supplements, 30 full days', '', 1000, g => g.Hs.suppFull >= 30),
  ],

  xpRows: () => kv('Log a meal', `+${H_XP.food}`) + kv('Glass of water', `+${H_XP.water}`, `up to ${WATER_GOAL} a day`)
    + kv('Gym session', `+${H_XP.gym}`, `+${SHIFT_GYM_BONUS} more on a shift day`) + kv('Weigh in', `+${H_XP.weights}`, 'once a day'),

  forms: healthForms,
  actions: {
    meal: (el, d) => { const m = H().meals.find(x => x.id === d.id); if (m) logMeal(m); },
    'meal-other': () => foodSheet(),
    'meal-remove': (el, d) => {
      H().meals = H().meals.filter(m => m.id !== d.id);
      save();
      healthSettingsSheet();
    },
    water: () => addHealth('water', { date: foodDay() }, e => `Water ${fuelDay(e.date).water} of ${WATER_GOAL}${e.date < todayISO() ? ` on ${fmtDayShort(e.date)}` : ''}${e.xp ? ` · <b>${xpLabel(e)}</b>` : ''}`),
    'food-day': (el, d) => {
      const today = todayISO(), next = addDays(foodDay(), Number(d.d));
      if (next > today || next < addDays(today, -FOOD_BACK_DAYS)) return;
      hFoodDay = next === today ? null : next;
      render();
    },
    'cal-range': (el, d) => { hCalRange = Number(d.d); render(); },
    'gym-log': () => gymSheet(),
    supp: (el, d) => {
      const s = H().supps.list.find(x => x.id === d.id);
      if (!s) return;
      if (suppTaken(s.id, todayISO()).length) suppAgainSheet(s); else takeSupp(s);
    },
    'supp-day': (el, d) => {
      const s = H().supps.list.find(x => x.id === d.id);
      if (!s || d.day > todayISO()) return;
      if (suppTaken(s.id, d.day).length) { untickSupp(s.id, d.day); toast(`${esc(s.name)} unticked for ${fmtDayShort(d.day)}.`); }
      else takeSupp(s, d.day);
    },
    'supp-undo': (el, d) => { closeSheet(); untickSupp(d.id, todayISO()); toast('Unticked for today.'); },
    'supp-edit': () => suppEditSheet(),
    'supp-remove': (el, d) => {
      H().supps.list = H().supps.list.filter(x => x.id !== d.id);
      save(); render(); suppEditSheet();
    },
    weigh: () => weighSheet(),
    'weigh-all': () => weighAllSheet(),
    'w-range': (el, d) => { hWeightRange = Number(d.d); render(); },
    'h-settings': () => healthSettingsSheet(),
    'h-why': () => whySheet(),
    'rota-ask': () => rotaAskSheet(),
    'rota-set': (el, d) => {
      H().rota[d.day] = d.v;
      save(); closeSheet(); render();
      toast(d.v === 'shift' ? `Shift day: +${H().settings.shiftBurn} kcal on today's target.` : 'Day off. A good day for the gym.');
    },
    'rota-cycle': (el, d) => {
      const order = ['', 'shift', 'off'], cur = dayType(d.day), next = order[(order.indexOf(cur) + 1) % 3];
      if (next) H().rota[d.day] = next; else delete H().rota[d.day];
      save(); render();
    },
    'h-del': (el, d) => {
      if (!confirm('Remove this entry?')) return;
      H()[d.kind] = H()[d.kind].filter(x => x.id !== d.id);
      if (d.kind === 'weights') syncWeight();
      save(); render();
      if (el.closest('.w-list')) weighAllSheet();   // keep the full list open after removing from it
    },
  },
  onChange(ev) { if (ev.target.closest('#f-gym')) updateGymPreview(); },
  onRender() { drawWeightChart(); drawCalChart(); },
  // Opening Health always starts on today
  onEnter(v) { if (v === 'health') hFoodDay = null; },
});