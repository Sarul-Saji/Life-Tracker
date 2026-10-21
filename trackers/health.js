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
const GYM_TYPES = [['push', 'Push', 5], ['pull', 'Pull', 5], ['legs', 'Legs', 5.5], ['upper', 'Upper', 5], ['full', 'Full body', 5.5], ['cardio', 'Cardio', 7.5], ['other', 'Other', 5]];
const GOALS = { lose: { name: 'Lose fat', adj: -500 }, maintain: { name: 'Maintain', adj: 0 }, build: { name: 'Build muscle', adj: 300 } };
const WATER_GOAL = 8;
const H_XP = { food: 10, water: 3, gym: 60 };
const SHIFT_GYM_BONUS = 40;   // extra XP for training on a shift day
const H = () => state.health;

const bmr = p => 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'f' ? -161 : 5);
const dayType = date => (H() && H().rota[date]) || '';
const gymName = id => (GYM_TYPES.find(g => g[0] === id) || GYM_TYPES[6])[1];
const gymKcal = (type, mins) => Math.round((GYM_TYPES.find(g => g[0] === type) || GYM_TYPES[0])[2] * H().profile.weightKg * mins / 60);
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
  const ratio = kcal / t.total, off = date === todayISO() && ratio <= 1 ? 0 : Math.abs(ratio - 1);
  const score = (off <= 0.1 ? 40 : off <= 0.2 ? 25 : 10) + Math.min(1, protein / proteinTarget()) * 30
    + Math.min(1, water / WATER_GOAL) * 15 + (shift && fries ? 0 : 15);
  const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : 'D';
  return { kcal, protein, water, fries, shift, t, score, grade };
}

const ZERO_HEALTH = { meals: 0, gymCount: 0, gymWeeks: 0, gymBest: 0, gymCur: 0, thisWeek: 0, fryFree: 0, fuelA: 0, water8: 0, doubles: 0 };
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
  const fuel = [...new Set(h.food.map(f => f.date))].map(fuelDay);
  const waterByDay = {};
  h.water.forEach(w => { waterByDay[w.date] = (waterByDay[w.date] || 0) + 1; });
  return {
    meals: h.food.length, gymCount: h.gym.length, gymWeeks: hit.length, gymBest: best, gymCur: cur, thisWeek: perWeek[thisWk] || 0,
    fryFree: fuel.filter(f => f.shift && !f.fries).length,
    fuelA: fuel.filter(f => f.grade === 'A').length,
    water8: Object.values(waterByDay).filter(n => n >= WATER_GOAL).length,
    doubles: new Set(h.gym.filter(s => dayType(s.date) === 'shift').map(s => s.date)).size,
  };
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
  const h = H(), today = todayISO(), f = fuelDay(today), hs = healthStats(), t = f.t, target = h.settings.gymTarget;
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
  const todayFood = h.food.filter(x => x.date === today).sort((a, b) => b.ts - a.ts);
  const sessions = [...h.gym].sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts).slice(0, 5);
  return `<div>
    ${topNav('Health')}
    ${!dayType(today) ? `<div class="ask-today"><span>Working today?</span>
      <button class="btn btn-ghost btn-sm" data-act="rota-set" data-day="${today}" data-v="off">Day off</button>
      <button class="btn btn-primary btn-sm" data-act="rota-set" data-day="${today}" data-v="shift">Shift</button></div>` : ''}
    <div class="section-title"><span>This week's rota</span><span>Tap a day to change</span></div>
    <div class="rota">${rota}</div>

    <section class="hero">
      <div class="eyebrow">Eaten today</div>
      <div class="hero-amount">${f.kcal.toLocaleString('en-GB')} <small class="of">/ ${t.total.toLocaleString('en-GB')} kcal</small></div>
      <div class="bar ${f.kcal > t.total * 1.1 ? 'over' : ''}"><i style="width:${Math.min(100, (f.kcal / t.total) * 100)}%"></i></div>
      <div class="hero-meta"><span>${left >= 0 ? `${left.toLocaleString('en-GB')} kcal left` : `${(-left).toLocaleString('en-GB')} kcal over`}</span>
        <button class="link" data-act="h-why">How is this worked out?</button></div>
    </section>

    <div class="tiles">
      <div class="tile"><div class="k">Protein</div><div class="v">${f.protein}<small> / ${pt}g</small></div><div class="bar"><i style="width:${Math.min(100, (f.protein / pt) * 100)}%"></i></div></div>
      <button class="tile" data-act="water"><div class="k">Water <span class="plus">+</span></div><div class="v">${f.water}<small> / ${WATER_GOAL}</small></div><div class="bar"><i style="width:${Math.min(100, (f.water / WATER_GOAL) * 100)}%"></i></div></button>
      <button class="tile" data-act="h-why"><div class="k">Fuel score</div><div class="v grade">${f.grade || '—'}</div><div class="s">${f.grade ? 'so far today' : 'log a meal'}</div></button>
    </div>

    <div class="section-title"><span>Log a meal</span><span>One tap</span></div>
    <div class="meals">
      ${h.meals.map(m => `<button class="meal ${m.fries ? 'fries' : ''}" data-act="meal" data-id="${m.id}"><b>${esc(m.name)}</b><span>${m.kcal.toLocaleString('en-GB')} kcal · ${m.protein} g protein</span></button>`).join('')}
      <button class="meal add" data-act="meal-other">${icon('plus')}<b>Something else</b></button>
    </div>
    ${todayFood.length ? `<section class="panel tx-box" style="margin-top:12px">${todayFood.map(foodItem).join('')}</section>` : ''}

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

    <button class="details-btn" data-act="h-settings">
      <span>Your details</span><small>${GOALS[h.profile.goal].name} · ${h.profile.weightKg} kg · gym ${target}/week</small>${icon('chevR')}
    </button>
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
    <div class="main"><div class="t">${gymName(s.type)} <span>· ${fmtDayShort(s.date)}</span></div><div class="s">${s.mins} min · ~${s.kcal} kcal</div></div>
    <div class="amt">${s.xp ? `<small>+${s.xp} XP</small>` : ''}</div>
    <button class="del" data-act="h-del" data-kind="gym" data-id="${s.id}" aria-label="Remove">${icon('x')}</button>
  </div>`;
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
      <div class="field-label">Type</div>${chips('type', GYM_TYPES.map(g => [g[0], g[1]]), 'push')}
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
  const k = gymKcal(f.elements.type.value, Number(f.elements.mins.value)), onShift = dayType(f.elements.date.value) === 'shift';
  $('#g-preview').innerHTML = kv('Estimated burn', `~${k} kcal`, "added to that day's calorie target")
    + kv('Reward', `+${award(H_XP.gym + (onShift ? SHIFT_GYM_BONUS : 0)).xp} XP`, onShift ? `includes +${SHIFT_GYM_BONUS} shift-day bonus` : '');
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
      ${kv(`Goal: ${GOALS[p.goal].name}`, t.adj ? sign(t.adj) : '—')}
      ${kv("Today's target", `${t.total.toLocaleString('en-GB')} kcal`, '', 'pos')}
    </div>
    <div class="section-title"><span>Fuel score${f.grade ? ` · ${f.grade} so far` : ''}</span></div>
    <div class="panel">
      ${kv('Calories near target', '40 pts', 'within 10% of target')}
      ${kv(`Protein (${proteinTarget()} g)`, '30 pts', '1.6 g per kg of body weight')}
      ${kv(`Water (${WATER_GOAL} glasses)`, '15 pts')}
      ${kv('Fry-free on a shift', '15 pts', 'days off count automatically')}
    </div>
    <p class="hint">A 85+, B 70+, C 55+, D below.</p>
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
  if (!waterFull) ({ xp, mult } = award(H_XP[kind] + (e.bonus || 0)));
  Object.assign(e, { id: uid(), ts: Date.now(), xp, mult });
  H()[kind].push(e);
  save();
  render();
  finishAction(g0, msgFor(e), { big });
}

function logMeal(m) {
  addHealth('food', { date: todayISO(), mealId: m.id, name: m.name, kcal: m.kcal, protein: m.protein, fries: !!m.fries }, e => {
    const f = fuelDay(todayISO()), left = f.t.total - f.kcal;
    const fryNote = f.shift && !f.fries ? ' · fry-free shift so far' : '';
    return `${esc(e.name)} · ${e.kcal.toLocaleString('en-GB')} kcal · ${left >= 0 ? `${left.toLocaleString('en-GB')} left` : `${(-left).toLocaleString('en-GB')} over`} today${fryNote} · <b>${xpLabel(e)}</b>`;
  });
}

const healthForms = {
  'f-hsetup'(f) {
    const r = readHealthForm(f);
    if (!r) return ($('#h-err').textContent = 'Check your height, weight and age.');
    state.health = { createdAt: todayISO(), profile: r.p, settings: r.s, rota: {}, meals: DEFAULT_MEALS.map(m => ({ ...m })), seeded: DEFAULT_MEALS.map(m => m.id), food: [], gym: [], water: [], weights: [{ date: todayISO(), kg: r.p.weightKg }] };
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
    if (r.p.weightKg !== h.profile.weightKg) h.weights.push({ date: todayISO(), kg: r.p.weightKg });
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

  'f-gym'(f) {
    const type = f.elements.type.value, mins = Number(f.elements.mins.value), date = f.elements.date.value || todayISO();
    closeSheet();
    // Training on a shift day is a double win: on your feet all shift and in the gym
    const onShift = dayType(date) === 'shift';
    addHealth('gym', { type, mins, date, kcal: gymKcal(type, mins), ...(onShift ? { bonus: SHIFT_GYM_BONUS } : {}) }, e => {
      const n = healthStats().thisWeek, target = H().settings.gymTarget;
      return `${onShift ? '<b>Shift and gym, double win.</b> ' : ''}${gymName(type)} · ${mins} min · ~${e.kcal} kcal · <b>${n} of ${target}</b> this week${n === target ? ' · <b>target hit</b>' : ''} · <b>${xpLabel(e)}</b>`;
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
  },

  views: { health: healthView, 'health-setup': healthSetupView },
  needsData: { health: () => !!state.health },
  card: healthCard,
  notices: () => (state.health && !dayType(todayISO()) ? [notice('rota-ask', 'Working today? Set it in your rota', 'var(--a2)')] : []),

  activity(add) { if (state.health) [...state.health.food, ...state.health.gym, ...state.health.water].forEach(x => add(x.ts, x.xp)); },
  xp: () => (state.health ? sum([...state.health.food, ...state.health.gym, ...state.health.water], x => x.xp) : 0),
  stats: () => ({ Hs: healthStats() }),

  quests: {
    gymT: { text: 'Hit your weekly gym target', goal: () => state.health?.settings.gymTarget || 3, get: w => w.gym },
    fry3: { text: 'Fry-free on 3 shifts', goal: 3, get: w => w.fryFree },
    protein4: { text: 'Hit your protein target on 4 days', goal: 4, get: w => w.proteinDays },
    water4: { text: `Drink ${WATER_GOAL} glasses of water on 4 days`, goal: 4, get: w => w.waterDays },
  },
  // A fourth weekly quest, from the week Health was set up
  questSlots: [{ ids: HEALTH_SLOT, active: wk => !!state.health && wk >= weekStart(state.health.createdAt) }],
  weekData(w, inWeek) {
    if (!state.health) return;
    const h = state.health;
    w.gym = h.gym.filter(s => inWeek(s.date)).length;
    const days = [...new Set(h.food.filter(f => inWeek(f.date)).map(f => f.date))].map(fuelDay);
    w.fryFree = days.filter(f => f.shift && !f.fries).length;
    w.proteinDays = days.filter(f => f.protein >= proteinTarget()).length;
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
  ],

  xpRows: () => kv('Log a meal', `+${H_XP.food}`) + kv('Glass of water', `+${H_XP.water}`, `up to ${WATER_GOAL} a day`)
    + kv('Gym session', `+${H_XP.gym}`, `+${SHIFT_GYM_BONUS} more on a shift day`),

  forms: healthForms,
  actions: {
    meal: (el, d) => { const m = H().meals.find(x => x.id === d.id); if (m) logMeal(m); },
    'meal-other': () => foodSheet(),
    'meal-remove': (el, d) => {
      H().meals = H().meals.filter(m => m.id !== d.id);
      save();
      healthSettingsSheet();
    },
    water: () => addHealth('water', { date: todayISO() }, e => `Water ${fuelDay(todayISO()).water} of ${WATER_GOAL}${e.xp ? ` · <b>${xpLabel(e)}</b>` : ''}`),
    'gym-log': () => gymSheet(),
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
      save(); render();
    },
  },
  onChange(ev) { if (ev.target.closest('#f-gym')) updateGymPreview(); },
});