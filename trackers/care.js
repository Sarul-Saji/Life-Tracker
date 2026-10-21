'use strict';
/* COMPOUND · trackers/care.js
   Care: reminders to check in on your partner around her PMS and period.
   XP rewards your check-ins only, never anything about her cycle.
   Owned by the "Compound: Care (Akansha)" session. */

/* ---------- Care engine ----------
   Day 1 is the first day of her period. Until two cycles are logged the cycle length is the
   "usual length" setting (28 to start), then the average of the gaps between logged starts.
   The PMS window is the last few days before the next expected period. All of this is an estimate. */
const CARE_XP = 30;            // per check-in, once a day
const CARE_PMS_DAYS = 6;       // PMS window: about the last 6 days of the cycle
const CARE_LEAD = 7;           // check-ins up to 7 days before a period count towards supporting that cycle
const CARE_SUPPORT_DAYS = 3;   // check in on 3 days around her period and that cycle counts as supported
const CARE_PMS_HOLD = 10;      // "She has PMS" keeps reminders on for up to 10 days
const CARE_HOW = [['msg', 'Message'], ['call', 'Call'], ['person', 'In person']];
const C = () => state.care;

// The PIN is a privacy curtain, not real security: it is stored as a scrambled code, not as the digits.
let careUnlocked = false;
const careHash = pin => {
  let h = 0x811c9dc5;
  for (const ch of 'care:' + pin) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h.toString(16);
};
const careLocked = () => !!C()?.settings.pinOn && !careUnlocked;
const careName = () => esc(C().name);
const careDays = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 864e5);

const CARE_SVG = {
  bubble: '<path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4 3.5V17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/><path d="M12 13.2s-2.6-1.6-2.6-3.3a1.4 1.4 0 0 1 2.6-.8 1.4 1.4 0 0 1 2.6.8c0 1.7-2.6 3.3-2.6 3.3Z"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  phone: '<path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2C10.5 19.5 4.5 13.5 4.5 5.5a2 2 0 0 1 2-2Z"/>',
  person: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>',
};
const careIcon = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${CARE_SVG[n]}</svg>`;
const careHowIcon = how => (how === 'call' ? careIcon('phone') : how === 'person' ? careIcon('person') : careIcon('bubble'));

const careStarts = () => [...C().periods].sort((a, b) => a.start.localeCompare(b.start));

// Average gap between logged period starts (ignoring gaps that look like a missed log)
function careCycleLen() {
  const s = careStarts(), gaps = [];
  for (let i = 1; i < s.length; i++) {
    const g = careDays(s[i - 1].start, s[i].start);
    if (g >= 18 && g <= 45) gaps.push(g);
  }
  if (gaps.length < 2) return { len: C().settings.cycle, learned: false, gaps: gaps.length };
  const last = gaps.slice(-6);
  return { len: Math.round(sum(last, g => g) / last.length), learned: true, gaps: gaps.length };
}

// Where she is today: cycle day, phase, and the dates that matter
function careNow(date = todayISO()) {
  const c = C(), s = careStarts().filter(p => p.start <= date), last = s[s.length - 1];
  const pmsMark = [...c.pms].filter(p => p.date <= date && (!last || p.date > last.start)).sort((a, b) => b.date.localeCompare(a.date))[0];
  const pmsOn = !!pmsMark && careDays(pmsMark.date, date) < CARE_PMS_HOLD;
  const { len, learned } = careCycleLen(), P = c.settings.periodLen;
  if (!last) return { known: false, len, learned, pmsOn, window: pmsOn, phase: pmsOn ? 'pms' : 'unknown' };
  const day = careDays(last.start, date) + 1;
  const ov = Math.max(P + 2, len - 14), pmsFrom = len - CARE_PMS_DAYS + 1;
  let phase;
  if (day <= P) phase = 'period';
  else if (day > len) phase = 'late';
  else if (day >= pmsFrom) phase = 'pms';
  else if (Math.abs(day - ov) <= 1) phase = 'ovulation';
  else if (day < ov) phase = 'follicular';
  else phase = 'luteal';
  if (pmsOn && phase !== 'period' && phase !== 'late') phase = 'pms';
  const next = addDays(last.start, len), pmsStart = addDays(last.start, pmsFrom - 1);
  // Remind during PMS, her period, and the first week of a late period (then stop nagging)
  const window = phase === 'period' || phase === 'pms' || (phase === 'late' && day <= len + 7);
  return { known: true, start: last.start, day, len, learned, P, ov, pmsFrom, phase, next, pmsStart, pmsOn, window,
    toPms: careDays(date, pmsStart), toNext: careDays(date, next) };
}

const CARE_PHASES = {
  period: { name: 'Period', tip: 'Ask how she is feeling and whether she needs anything.' },
  follicular: { name: 'Follicular phase', tip: 'Often a lighter stretch. A normal check-in is plenty.' },
  ovulation: { name: 'Around ovulation', tip: 'A normal check-in is plenty.' },
  luteal: { name: 'Luteal phase', tip: 'PMS is coming up. A quiet check-in now goes a long way.' },
  pms: { name: 'PMS window', tip: 'Ask how she is feeling. Be extra patient, and don’t take moods personally.' },
  late: { name: 'Period expected', tip: 'Estimates are often a few days out. Check in as usual.' },
  unknown: { name: 'Waiting for her next period', tip: 'Tap “Her period started” when she tells you, and the estimates begin.' },
};
const carePhaseLine = n => (n.phase === 'period' ? `Day ${n.day} of her period` : CARE_PHASES[n.phase].name);

const careCheckedOn = date => C().checks.some(x => x.date === date);

// A cycle counts as supported when you checked in on 3+ days from a week before her period to its end
function careStats() {
  const c = C();
  if (!c) return { checks: 0, supported: 0, streak: 0, best: 0 };
  const P = c.settings.periodLen, today = todayISO(), dates = new Set(c.checks.map(x => x.date));
  const cycles = careStarts().map(p => {
    const from = addDays(p.start, -CARE_LEAD), to = addDays(p.start, P - 1);
    const n = [...dates].filter(d => d >= from && d <= to).length;
    return { start: p.start, n, ok: n >= CARE_SUPPORT_DAYS, open: today <= to };
  });
  let streak = 0, best = 0, run = 0;
  cycles.forEach(x => { run = x.ok ? run + 1 : 0; best = Math.max(best, run); });
  for (let i = cycles.length - 1; i >= 0; i--) {
    if (cycles[i].ok) streak++;
    else if (!(cycles[i].open && i === cycles.length - 1)) break;   // a window still in progress doesn't break it
  }
  return { checks: c.checks.length, supported: cycles.filter(x => x.ok).length, streak, best, cycles };
}

// Check-in days so far towards supporting the cycle you're in the middle of
function careWindowCount(n) {
  const dates = new Set(C().checks.map(x => x.date)), today = todayISO();
  let from;
  if (n.known && n.phase === 'period') from = addDays(n.start, -CARE_LEAD);
  else if (n.known) from = addDays(n.next, -CARE_LEAD);
  else return null;
  return [...dates].filter(d => d >= from && d <= today).length;
}

/* ---------- Cycle ring ---------- */
function careRing(n, size = 236) {
  const c = size / 2, r = c - 14, sw = 14, len = n.len, gap = 0.004;
  const pt = (frac, rad = r) => [c + rad * Math.sin(frac * 2 * Math.PI), c - rad * Math.cos(frac * 2 * Math.PI)];
  const arc = (a, b) => {
    const [x1, y1] = pt(a), [x2, y2] = pt(b);
    return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${r} ${r} 0 ${b - a > 0.5 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  };
  const kind = d => (d <= n.P ? 'period' : d >= n.pmsFrom ? 'pms' : Math.abs(d - n.ov) <= 1 ? 'ovulation' : d < n.ov ? 'follicular' : 'luteal');
  let segs = '';
  for (let d = 1; d <= len; d++) {
    const k = kind(d), past = d <= n.day;
    segs += `<path class="seg ${k} ${past ? 'past' : ''}" d="${arc((d - 1) / len + gap / 2, d / len - gap / 2)}" stroke-width="${sw}"/>`;
  }
  const at = Math.min(n.day, len), [mx, my] = pt((at - 0.5) / len);
  return `<svg class="care-ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img"
      aria-label="Day ${n.day} of about ${len}: ${CARE_PHASES[n.phase].name}">
    ${segs}
    <circle class="mark" cx="${mx.toFixed(2)}" cy="${my.toFixed(2)}" r="10"/>
    <text class="day" x="${c}" y="${c - 4}" text-anchor="middle">Day ${n.day}</text>
    <text class="of" x="${c}" y="${c + 22}" text-anchor="middle">of about ${len}</text>
  </svg>`;
}

const careLegend = () => `<div class="care-legend">
  <span><i class="period"></i>Period</span><span><i class="follicular"></i>Follicular</span>
  <span><i class="ovulation"></i>Ovulation</span><span><i class="luteal"></i>Luteal</span><span><i class="pms"></i>PMS window</span></div>`;

const CARE_NOTE = '<p class="care-note">These dates are estimates from the days you logged. They are often a few days out, and must <b>never</b> be used for contraception.</p>';

/* ---------- Screens ---------- */
function careCard() {
  if (!C()) return `<button class="tracker" data-go="care-setup">
      <div class="tr-top">${careIcon('bubble')}<span class="grow">Care</span>${icon('plus')}</div>
      <div class="tr-amount setup">Set up</div>
      <div class="tr-sub">A gentle reminder to check in on your partner during her PMS and her period.</div>
    </button>`;
  if (careLocked()) return `<button class="tracker" data-go="care">
      <div class="tr-top">${careIcon('lock')}<span class="grow">Care</span>${icon('chevR')}</div>
      <div class="tr-amount setup">Locked</div>
      <div class="tr-sub">Tap to open with your PIN.</div>
    </button>`;
  const n = careNow(), st = careStats(), today = todayISO(), done = careCheckedOn(today);
  const sub = !n.known ? (n.pmsOn ? 'PMS window · check in each day' : 'Waiting for her next period')
    : n.phase === 'late' ? 'Period expected any day'
    : n.phase === 'period' ? `${careName()} · her period · next around ${fmtDayShort(n.next)}`
    : n.phase === 'pms' ? `${careName()} · PMS window · period around ${fmtDayShort(n.next)}`
    : `${CARE_PHASES[n.phase].name} · PMS likely in ${n.toPms} day${n.toPms === 1 ? '' : 's'}`;
  return `<button class="tracker" data-go="care">
      <div class="tr-top">${careIcon('bubble')}<span class="grow">Care</span>
        ${n.window && !done ? '<span class="due"><span class="dot"></span>Check in today</span>' : ''}${icon('chevR')}</div>
      <div class="tr-amount">${n.known ? `Day ${n.day} <small class="of">of ~${n.len}</small>` : n.pmsOn ? 'PMS' : '—'}</div>
      <div class="tr-sub">${sub}</div>
      ${n.known ? `<div class="bar care-bar ${n.phase}"><i style="width:${Math.min(100, (n.day / n.len) * 100)}%"></i></div>` : ''}
      <div class="tr-foot"><span>${done ? 'Checked in today' : n.window ? 'Not checked in yet today' : 'All calm'}</span>
        <span>${st.supported} cycle${st.supported === 1 ? '' : 's'} supported</span></div>
    </button>`;
}

function careLockView() {
  return `<div>
    ${topNav('Care')}
    <section class="care-lock">
      <div class="care-lock-mark">${careIcon('lock')}</div>
      <h1 class="page-title">Locked</h1>
      <p class="page-lead">Enter your PIN to open Care.</p>
      <form id="f-cpin">
        <label class="field"><span>PIN</span><input name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off" class="care-pin"></label>
        <div id="c-err" class="err"></div>
        <button class="btn btn-primary btn-block">Unlock</button>
      </form>
      <button class="btn btn-text btn-block" data-act="c-forgot">Forgot your PIN?</button>
    </section>
  </div>`;
}

function careView() {
  if (careLocked()) return careLockView();
  const c = C(), n = careNow(), st = careStats(), today = todayISO(), done = careCheckedOn(today);
  const ph = CARE_PHASES[n.phase], wc = careWindowCount(n);
  const recent = [...c.checks].sort((a, b) => b.ts - a.ts).slice(0, 5);
  const when = n.known ? (n.phase === 'late'
    ? kv('Next period', 'Expected now', `estimated ${fmtDayShort(n.next)}`)
    : (n.phase === 'period' || n.phase === 'pms' ? '' : kv('PMS window', n.toPms === 1 ? 'Likely tomorrow' : `In about ${n.toPms} days`, `from ${fmtDayShort(n.pmsStart)}`))
      + kv('Next period', n.toNext === 1 ? 'Likely tomorrow' : `In about ${n.toNext} days`, `around ${fmtDayShort(n.next)}`))
    : '';
  return `<div>
    ${topNav('Care')}
    <section class="care-hero">
      <div class="eyebrow">${careName()} today</div>
      ${n.known ? `<div class="care-ring-wrap">${careRing(n)}</div>${careLegend()}` : ''}
      <div class="care-phase ${n.phase}">${carePhaseLine(n)}</div>
      ${n.known && n.pmsOn && n.phase === 'pms' && n.day < n.pmsFrom ? '<div class="muted small">You marked PMS, so reminders are on.</div>' : ''}
    </section>
    ${when ? `<section class="panel care-when">${when}</section>` : ''}

    <div class="section-title"><span>Check in</span><span>${n.window ? 'Every day this week' : 'Any day counts'}</span></div>
    <section class="panel pad care-check ${done ? 'done' : ''}">
      ${done ? `<div class="care-done">${icon('tick')}<div><b>Checked in today</b><div class="muted small">Nice. See you tomorrow.</div></div></div>`
        : `<p class="care-tip">${ph.tip}</p>
      <div class="care-how">${CARE_HOW.map(([k, l]) => `<button class="btn btn-ghost" data-act="c-check" data-how="${k}">${careHowIcon(k)}${l}</button>`).join('')}</div>
      <div class="muted small care-xp">+${award(CARE_XP).xp} XP</div>`}
      ${wc !== null && (n.window || n.phase === 'luteal') ? `<p class="treat-note">${Math.min(wc, CARE_SUPPORT_DAYS)} of ${CARE_SUPPORT_DAYS} check-in days to support this cycle${wc >= CARE_SUPPORT_DAYS ? ' · <b>supported</b>' : ''}</p>` : ''}
    </section>

    <div class="section-title"><span>When she tells you</span></div>
    <div class="care-tell">
      <button class="care-tell-btn" data-act="c-period"><b>Her period started</b><span>Resets the countdown</span></button>
      <button class="care-tell-btn" data-act="c-pms"${n.phase === 'period' ? 'disabled' : ''}><b>She has PMS</b><span>${n.pmsOn ? 'Reminders are on' : 'Turns on daily reminders'}</span></button>
    </div>

    <div class="section-title"><span>Your care</span><span>${st.streak ? `${st.streak}-cycle streak` : ''}</span></div>
    <div class="statgrid">
      <div><div class="v">${st.supported}</div><div class="k">Cycles supported</div></div>
      <div><div class="v">${st.checks}</div><div class="k">Check-ins</div></div>
    </div>
    ${recent.length ? `<section class="panel" style="margin-top:12px">${recent.map(careCheckItem).join('')}</section>` : ''}

    <button class="care-details" data-act="c-settings">
      <span>Settings</span><small>${n.learned ? `Learned cycle: ${n.len} days` : `Cycle: ${n.len} days (default)`} · PIN ${c.settings.pinOn ? 'on' : 'off'}</small>${icon('chevR')}
    </button>
    ${c.settings.pinOn ? `<button class="btn btn-text btn-block care-lock-btn" data-act="c-lock">${careIcon('lock')}Lock now</button>` : ''}
    ${CARE_NOTE}
  </div>`;
}

function careCheckItem(e) {
  const how = (CARE_HOW.find(h => h[0] === e.how) || CARE_HOW[0])[1];
  return `<div class="hist care-row">
    <div class="mark">${careHowIcon(e.how)}</div>
    <div class="main"><div class="t">${how}</div><div class="s">${fmtDayShort(e.date)}</div></div>
    <div class="amt">${e.xp ? `<small>+${e.xp} XP</small>` : ''}</div>
    <button class="del" data-act="c-del" data-id="${e.id}" aria-label="Remove">${icon('x')}</button>
  </div>`;
}

function careSetupView() {
  const chips = (name, opts, val) => `<div class="purposes">${opts.map(([v, l]) =>
    `<label class="purpose"><input type="radio" name="${name}" value="${v}" ${String(v) === String(val) ? 'checked' : ''} hidden>${l}</label>`).join('')}</div>`;
  return `<div>
    ${topNav('New tracker')}
    <h1 class="page-title">Care</h1>
    <p class="page-lead">A reminder to check in on your partner during her PMS and her period. It stays on this phone.</p>
    <form id="f-csetup">
      <label class="field"><span>Her name</span><input name="name" maxlength="24" autocomplete="off" required></label>
      <div class="field-label">Right now she is…</div>
      ${chips('now', [['on', 'On her period'], ['off', 'Not on her period'], ['unsure', 'Not sure']], 'on')}
      <div class="care-q" data-for="on">
        <div class="field-label">Which day of her period is it today?</div>
        ${chips('pday', [1, 2, 3, 4, 5, 6, 7].map(d => [d, `Day ${d}`]), 1)}
      </div>
      <div class="care-q" data-for="off" hidden>
        <label class="field"><span>Roughly when did her last period start?</span><input name="last" type="date" max="${todayISO()}"><small>A guess within a few days is fine.</small></label>
      </div>
      <div class="care-q" data-for="unsure" hidden>
        <p class="hint box">No problem. Tap “Her period started” next time she tells you, and the reminders start from there.</p>
      </div>
      <label class="check-row"><input type="checkbox" name="pinOn" checked> Hide Care behind a PIN</label>
      <label class="field care-pinfield"><span>Choose a PIN (4 to 8 digits)</span><input name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off" class="care-pin">
        <small>When it's on, Home shows "Care · Locked" and plain "Care reminder" notices without her name.</small></label>
      <div id="c-err" class="err"></div>
      <button class="btn btn-primary btn-block">Start</button>
    </form>
    ${CARE_NOTE}
  </div>`;
}

/* ---------- Sheets ---------- */
function careCheckSheet() {
  const n = careNow();
  openSheet(`
    <h2>Check in on ${careName()}</h2>
    <p class="lead">${CARE_PHASES[n.phase].tip}</p>
    <div class="care-how">${CARE_HOW.map(([k, l]) => `<button class="btn btn-ghost" data-act="c-check" data-how="${k}">${careHowIcon(k)}${l}</button>`).join('')}</div>
    <p class="hint">Tap how you checked in once you've done it. +${award(CARE_XP).xp} XP.</p>
    <button class="btn btn-text btn-block" data-close>Later</button>`);
}

function carePeriodSheet() {
  openSheet(`
    <h2>Her period started</h2>
    <p class="lead">This resets the countdown. Each one you log makes the estimates better.</p>
    <form id="f-cperiod">
      <label class="field"><span>When did it start?</span><input name="date" type="date" value="${todayISO()}" max="${todayISO()}"></label>
      <div id="c-err" class="err"></div>
      ${sheetButtons('Save')}
    </form>`);
}

function careSettingsSheet() {
  const c = C(), cl = careCycleLen(), starts = careStarts().reverse();
  const chips = (name, opts, val) => `<div class="purposes">${opts.map(([v, l]) =>
    `<label class="purpose"><input type="radio" name="${name}" value="${v}" ${String(v) === String(val) ? 'checked' : ''} hidden>${l}</label>`).join('')}</div>`;
  openSheet(`
    <h2>Care settings</h2>
    <p class="lead">${cl.learned ? `Her cycle is learned from what you logged: about <b>${cl.len} days</b>.` : `Log her next ${2 - cl.gaps === 1 ? 'period' : `${2 - cl.gaps} periods`} and the app learns her own cycle length. Until then it uses the length below.`}</p>
    <form id="f-csettings">
      <label class="field"><span>Her name</span><input name="name" maxlength="24" autocomplete="off" value="${careName()}" required></label>
      <label class="field"><span>Usual cycle length (days)</span><input name="cycle" ${moneyAttrs('int', c.settings.cycle)}>
        <small>${cl.learned ? 'Not used while a learned length is available.' : '28 is a common starting point. Most cycles are 21 to 35 days.'}</small></label>
      <div class="field-label">Her period usually lasts</div>
      ${chips('plen', [3, 4, 5, 6, 7].map(d => [d, `${d} days`]), c.settings.periodLen)}
      <label class="check-row"><input type="checkbox" name="pinOn" ${c.settings.pinOn ? 'checked' : ''}> Hide Care behind a PIN</label>
      <label class="field care-pinfield" ${c.settings.pinOn ? '' : 'hidden'}><span>${c.settings.pin ? 'New PIN (leave empty to keep it)' : 'Choose a PIN (4 to 8 digits)'}</span>
        <input name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off" class="care-pin"></label>
      <div class="field-label">Period starts you logged</div>
      <div class="panel" style="margin-bottom:18px">${starts.map(p => `<div class="kv"><span class="k">${fmtDay(p.start)}</span>
        <button type="button" class="del" data-act="c-period-del" data-id="${p.id}" aria-label="Remove ${fmtDay(p.start)}">${icon('x')}</button></div>`).join('') || '<p class="empty">None yet.</p>'}</div>
      <div id="c-err" class="err"></div>
      ${sheetButtons('Save')}
    </form>`);
}

/* ---------- Actions ---------- */
function careCheckIn(how) {
  const today = todayISO();
  if (careCheckedOn(today)) return toast('Already checked in today.');
  const g0 = globalStats(), s0 = careStats().supported, { xp, mult } = award(CARE_XP);
  const e = { id: uid(), date: today, ts: Date.now(), how, xp, mult };
  C().checks.push(e);
  save();
  closeSheet();
  render();
  const s1 = careStats().supported;
  finishAction(g0, `${s1 > s0 ? '<b>Cycle supported.</b> ' : ''}Checked in on ${careName()} · <b>${xpLabel(e)}</b>`, { big: s1 > s0 });
}

function careFinishSetup() {
  view = 'care';
  animateNext = true;
  history.replaceState({ v: 'care' }, '');
  render();
  scrollTo(0, 0);
  sfx.chime();
}

const carePinOk = pin => /^\d{4,8}$/.test(pin);

const careForms = {
  'f-csetup'(f) {
    const name = f.elements.name.value.trim(), now = f.elements.now.value, pinOn = f.elements.pinOn.checked, pin = f.elements.pin.value.trim();
    const err = m => ($('#c-err').textContent = m);
    if (!name) return err('Add her name.');
    let start = null;
    if (now === 'on') start = addDays(todayISO(), -(Number(f.elements.pday.value) - 1));
    if (now === 'off') {
      start = f.elements.last.value;
      if (!start) return err('Pick roughly when her last period started, or choose "Not sure".');
      if (start > todayISO()) return err('That date is in the future.');
    }
    if (pinOn && !carePinOk(pin)) return err('Choose a PIN of 4 to 8 digits, or untick the PIN option.');
    state.care = {
      createdAt: todayISO(), name,
      settings: { cycle: 28, periodLen: 5, pinOn, pin: pinOn ? careHash(pin) : null },
      periods: start ? [{ id: uid(), start }] : [], pms: [], checks: [],
    };
    careUnlocked = true;
    save();
    careFinishSetup();
    toast(pinOn ? 'Care is ready. It locks again whenever you leave the app.' : 'Care is ready.');
  },

  'f-cpin'(f) {
    if (careHash(f.elements.pin.value.trim()) !== C().settings.pin) {
      f.elements.pin.value = '';
      return ($('#c-err').textContent = "That PIN doesn't match.");
    }
    careUnlocked = true;
    sfx.soft();
    render();
  },

  'f-cperiod'(f) {
    const date = f.elements.date.value || todayISO(), c = C();
    if (date > todayISO()) return ($('#c-err').textContent = 'That date is in the future.');
    // A start within 10 days of one already logged is treated as a correction, not a new cycle
    const near = c.periods.find(p => Math.abs(careDays(p.start, date)) < 10);
    if (near) near.start = date;
    else c.periods.push({ id: uid(), start: date });
    save();
    closeSheet();
    render();
    sfx.soft();
    const n = careNow();
    toast(near ? 'Start date updated.' : `Logged. Next period estimated around ${fmtDayShort(n.next)}. Check in on ${careName()} each day this week.`, 5000);
  },

  'f-csettings'(f) {
    const c = C(), name = f.elements.name.value.trim(), cycle = num(f.elements.cycle.value), pinOn = f.elements.pinOn.checked, pin = f.elements.pin.value.trim();
    const err = m => ($('#c-err').textContent = m);
    if (!name) return err('Add her name.');
    if (!(cycle >= 18 && cycle <= 45)) return err('Cycle length should be between 18 and 45 days.');
    if (pin && !carePinOk(pin)) return err('A PIN is 4 to 8 digits.');
    if (pinOn && !pin && !c.settings.pin) return err('Choose a PIN to turn it on.');
    c.name = name;
    Object.assign(c.settings, { cycle, periodLen: Number(f.elements.plen.value) || 5, pinOn });
    if (pin) c.settings.pin = careHash(pin);
    save();
    closeSheet();
    render();
    toast('Settings saved.');
  },
};

/* ---------- Registration ---------- */
registerTracker({
  id: 'care',
  order: 50,
  cardOrder: 50,

  migrate(s) {
    if (!s.care) return;
    s.care.settings = Object.assign({ cycle: 28, periodLen: 5, pinOn: false, pin: null }, s.care.settings);
    ['periods', 'pms', 'checks'].forEach(k => { s.care[k] = s.care[k] || []; });
  },

  views: { care: careView, 'care-setup': careSetupView },
  needsData: { care: () => !!state.care },
  card: careCard,
  notices() {
    if (!C()) return [];
    const n = careNow(), done = careCheckedOn(todayISO());
    const show = (n.window && !done) || (n.known && !n.window && (n.toPms === 1 || n.toPms === 2));
    if (!show) return [];
    if (careLocked()) return [notice('c-open', 'Care reminder', 'var(--care-rose)')];
    if (n.window && !done) return [notice('c-checkin', `Check in on ${careName()} today · ${n.phase === 'period' ? `day ${n.day} of her period` : n.phase === 'late' ? 'period expected' : 'PMS window'}`, 'var(--care-rose)')];
    return [notice('c-open', `${careName()}'s PMS window likely starts ${n.toPms === 1 ? 'tomorrow' : 'in 2 days'}`, 'var(--care-pms)')];
  },

  activity(add) { if (C()) C().checks.forEach(x => add(x.ts, x.xp)); },
  xp: () => (C() ? sum(C().checks, x => x.xp) : 0),
  stats: () => ({ Cs: careStats() }),

  milestones: [
    ms('c-check-1', 'First check-in', 'Showing up for someone', 100, g => g.Cs.checks >= 1),
    ms('c-cycle-1', 'First cycle supported', `Checked in on ${CARE_SUPPORT_DAYS}+ days around a period`, 300, g => g.Cs.supported >= 1),
    ms('c-cycle-3', 'Three cycles supported', '', 800, g => g.Cs.supported >= 3),
    ms('c-streak-3', 'Three cycles in a row', 'Reliable', 1000, g => g.Cs.best >= 3),
    ms('c-cycle-6', 'Six cycles supported', 'Half a year of showing up', 1500, g => g.Cs.supported >= 6),
    ms('c-check-25', '25 check-ins', '', 600, g => g.Cs.checks >= 25),
    ms('c-cycle-12', 'A year of care', 'Twelve cycles supported', 3000, g => g.Cs.supported >= 12),
  ],

  xpRows: () => kv('Care check-in', `+${CARE_XP}`, 'once a day'),

  forms: careForms,
  actions: {
    'c-open': () => go('care'),
    'c-checkin': () => careCheckSheet(),
    'c-check': (el, d) => careCheckIn(d.how),
    'c-period': () => carePeriodSheet(),
    'c-pms': () => {
      const c = C(), today = todayISO();
      if (careNow().pmsOn) return toast('PMS reminders are already on. They stop when you log her period.');
      c.pms.push({ id: uid(), date: today });
      save();
      render();
      sfx.soft();
      toast(`Daily check-in reminders are on until her period starts. Go gently with ${careName()}.`, 5000);
    },
    'c-settings': () => careSettingsSheet(),
    'c-lock': () => { careUnlocked = false; go('home'); },
    'c-del': (el, d) => {
      if (!confirm('Remove this check-in?')) return;
      C().checks = C().checks.filter(x => x.id !== d.id);
      save(); render();
    },
    'c-period-del': (el, d) => {
      if (!confirm('Remove this period start?')) return;
      C().periods = C().periods.filter(p => p.id !== d.id);
      save(); render(); careSettingsSheet();
    },
    'c-forgot': () => {
      if (!confirm("Turn the PIN off? Care's data stays. You can set a new PIN in its settings.")) return;
      C().settings.pinOn = false;
      C().settings.pin = null;
      save(); render();
      toast('PIN turned off.');
    },
  },
  onChange(ev) {
    const f = ev.target.closest('#f-csetup, #f-csettings');
    if (!f) return;
    if (ev.target.name === 'now') f.querySelectorAll('.care-q').forEach(q => { q.hidden = q.dataset.for !== ev.target.value; });
    if (ev.target.name === 'pinOn') f.querySelector('.care-pinfield').hidden = !ev.target.checked;
  },
  // Leaving the app locks Care again
  onResume() { if (careUnlocked && C()?.settings.pinOn) { careUnlocked = false; render(); } },
});
