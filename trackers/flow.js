'use strict';
/* COMPOUND · trackers/flow.js
   Flow tracker: focus sessions (Pomodoro, Deep work, Open flow), a calm full-screen timer,
   focus ratings, stats, XP, a weekly quest and milestones.
   Owned by the "Compound: Flow" session. */

/* ---------- Flow engine ----------
   The timer never counts seconds itself. It stores timestamps ("this phase started at 14:02")
   and works out the time from the real clock, so it stays right if the phone sleeps or the app closes.
   Only focus time counts; breaks are timed on screen but never added to totals. */
const FLOW_MODES = { pomo: 'Pomodoro', deep: 'Deep work', open: 'Open flow', manual: 'Logged' };
const FLOW_QUICK = [15, 20, 25, 30, 45, 50, 60, 90, 120];   // one-tap lengths for logging time without the timer
const FLOW_DEFAULTS = { pomo: [25, 5], deep: [50, 10] };
const FLOW_LABELS = ['CIMA', 'Building', 'Learning'];
const FLOW_DISTRACTIONS = ['Phone', 'Noise', 'People', 'Tired', 'Hungry', 'Wandering mind'];
const FLOW_RATINGS = ['', 'Scattered', 'Distracted', 'Okay', 'Focused', 'In the zone'];
const FLOW_XP_PER_MIN = 1;
const FLOW_MIN = 5;     // sessions shorter than this are saved but earn no XP and don't count for momentum
const FLOW_DAY = 25;    // focus minutes that make a day count for the focus streak
const FLOW_DEEP = 50;   // a "deep" session for quests and milestones
const FLOW_TIMES = [[0, 'Night', 'late night'], [5, 'Early', 'early morning'], [9, 'Morning', 'morning'], [12, 'Afternoon', 'afternoon'], [17, 'Evening', 'evening'], [21, 'Night', 'late night']];
const FL = () => state.flow;

const flowHM = m => (m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${pad(m % 60)}m`);
const flowHMBig = m => (m < 60 ? `${m}<small> min</small>` : `${Math.floor(m / 60)}<small>h</small> ${pad(m % 60)}<small>m</small>`);
const flowClock = ms => {
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
};
const flowTimeOf = ts => { const h = new Date(ts).getHours(); return FLOW_TIMES.filter(t => h >= t[0]).pop(); };
const flowCounted = () => FL().sessions.filter(s => s.mins >= FLOW_MIN);

/* The running session */
const flowPhaseLen = a => (a.mode === 'open' ? Infinity : a.phase === 'focus' ? a.focusLen : a.breakLen);
const flowPhaseMs = (a, now = Date.now()) => a.phaseAcc + (a.paused || a.phase === 'ready' ? 0 : now - a.phaseStart);
const flowFocusMs = (a, now = Date.now()) => a.focusDone + (a.phase === 'focus' ? flowPhaseMs(a, now) : 0);

// Move the session on through any phases that finished (possibly while the app was closed).
// After a break the timer waits for you, so a forgotten Pomodoro never keeps counting by itself.
function flowAdvance(a, now = Date.now()) {
  let changed = false;
  while (a.mode !== 'open' && !a.paused && a.phase !== 'ready') {
    const len = flowPhaseLen(a);
    if (flowPhaseMs(a, now) < len) break;
    const endedAt = a.phaseStart + (len - a.phaseAcc);
    if (a.phase === 'focus') { a.focusDone += len; a.blocks++; a.phase = 'break'; }
    else a.phase = 'ready';
    a.phaseStart = endedAt;
    a.phaseAcc = 0;
    changed = true;
  }
  return changed;
}
function flowPause(a) { a.phaseAcc = flowPhaseMs(a); a.paused = true; }
function flowResume(a) { a.phaseStart = Date.now(); a.paused = false; }
function flowNextBlock(a) { Object.assign(a, { phase: 'focus', phaseStart: Date.now(), phaseAcc: 0, paused: false }); }

/* Stats */
function flowDayMins() {
  const m = {};
  FL().sessions.forEach(s => { m[s.date] = (m[s.date] || 0) + s.mins; });
  return m;
}

function flowStreak(byDay) {
  const ok = d => (byDay[d] || 0) >= FLOW_DAY, today = todayISO();
  let d = ok(today) ? today : addDays(today, -1), cur = 0;
  while (ok(d)) { cur++; d = addDays(d, -1); }
  let best = 0, run = 0, prev = null;
  for (const x of Object.keys(byDay).filter(ok).sort()) {
    run = prev && addDays(prev, 1) === x ? run + 1 : 1;
    best = Math.max(best, run);
    prev = x;
  }
  return { cur, best, today: ok(today) };
}

// When you focus best: the time of day with the highest focus rating (weighted by minutes)
function flowBestTime() {
  const list = flowCounted().filter(s => s.rating && s.start);   // time logged for a past day has no start time
  if (list.length < 3) return null;
  const g = {};
  list.forEach(s => {
    const t = flowTimeOf(s.start), k = t[2];
    g[k] = g[k] || { short: t[1], long: t[2], n: 0, mins: 0, score: 0 };
    g[k].n++; g[k].mins += s.mins; g[k].score += s.rating * s.mins;
  });
  const best = Object.values(g).filter(x => x.n >= 2).map(x => ({ ...x, avg: x.score / x.mins }))
    .sort((a, b) => b.avg - a.avg || b.mins - a.mins)[0];
  return best || null;
}

function flowAvgRating(days = 30) {
  const from = addDays(todayISO(), -days + 1);
  const list = flowCounted().filter(s => s.rating && s.date >= from);
  return list.length ? sum(list, s => s.rating) / list.length : null;
}

const ZERO_FLOW = { sessions: 0, totalMins: 0, bestDay: 0, bestWeek: 0, bestStreak: 0, longest: 0, deep: 0 };
function flowStats() {
  if (!FL()) return ZERO_FLOW;
  const list = flowCounted(), byDay = flowDayMins(), perWeek = {};
  Object.entries(byDay).forEach(([d, m]) => { const w = weekStart(d); perWeek[w] = (perWeek[w] || 0) + m; });
  return {
    sessions: list.length,
    totalMins: sum(FL().sessions, s => s.mins),
    bestDay: Math.max(0, ...Object.values(byDay)),
    bestWeek: Math.max(0, ...Object.values(perWeek)),
    bestStreak: flowStreak(byDay).best,
    longest: Math.max(0, ...list.map(s => s.mins)),
    deep: list.filter(s => s.mins >= FLOW_DEEP).length,
  };
}

/* ---------- Screens ---------- */
function flowCard() {
  if (!FL()) return `<button class="tracker" data-go="flow-setup">
      <div class="tr-top">${icon('timer')}<span class="grow">Flow</span>${icon('plus')}</div>
      <div class="tr-amount setup">Set up</div>
      <div class="tr-sub">A calm focus timer. Track deep work and find your best hours.</div>
    </button>`;
  const a = FL().active, byDay = flowDayMins(), today = todayISO(), st = flowStreak(byDay);
  const week = sum(Object.entries(byDay).filter(([d]) => d >= weekStart(today)), ([, m]) => m);
  const avg = flowAvgRating();
  return `<button class="tracker" data-go="${a ? 'flow-timer' : 'flow'}">
      <div class="tr-top">${icon('timer')}<span class="grow">Flow</span>
        ${a ? `<span class="fl-live"><span class="dot"></span>${a.paused ? 'Paused' : a.phase === 'focus' ? 'Focusing' : a.phase === 'break' ? 'On a break' : 'Break over'}</span>` : ''}${icon('chevR')}</div>
      <div class="tr-amount">${flowHMBig(byDay[today] || 0)}</div>
      <div class="tr-sub">${a ? `focused today · ${esc(a.label)} in progress` : 'focused today'} · ${flowHM(week)} this week</div>
      <div class="tr-foot"><span>${st.cur ? `${st.cur}-day focus streak` : `${FLOW_DAY} min a day starts a streak`}</span><span>${avg ? `Focus ${avg.toFixed(1)} / 5` : 'No ratings yet'}</span></div>
    </button>`;
}

function flowView() {
  const f = FL(), a = f.active, today = todayISO(), byDay = flowDayMins(), st = flowStreak(byDay);
  const wk = weekStart(today), days = [...Array(7)].map((_, i) => addDays(wk, i));
  const week = sum(days, d => byDay[d]), top = Math.max(60, ...days.map(d => byDay[d] || 0));
  const bars = days.map(d => {
    const m = byDay[d] || 0;
    return `<div class="fl-col ${d === today ? 'today' : ''} ${d > today ? 'future' : ''}">
      <span class="fl-val">${m ? (m < 60 ? `${m}m` : `${(m / 60).toFixed(1)}h`) : ''}</span>
      <div class="fl-track"><i style="height:${(m / top) * 100}%"></i></div>
      <span class="fl-day">${parseISO(d).toLocaleDateString('en-GB', { weekday: 'narrow' })}</span></div>`;
  }).join('');
  const avg = flowAvgRating(), best = flowBestTime(), weekSessions = f.sessions.filter(s => s.date >= wk).length;
  const recent = [...f.sessions].sort((x, y) => y.ts - x.ts).slice(0, 8);
  return `<div>
    ${topNav('Flow')}
    ${a ? `<button class="fl-running" data-go="flow-timer"><span class="dot"></span>
      <span><b>${esc(a.label)}</b> · ${a.paused ? 'paused' : a.phase === 'ready' ? 'break over' : a.phase} · ${flowHM(Math.floor(flowFocusMs(a) / 6e4))} so far</span>${icon('chevR')}</button>` : ''}

    <section class="hero">
      <div class="eyebrow">Focused today</div>
      <div class="hero-amount fl-hero">${flowHMBig(byDay[today] || 0)}</div>
      <div class="hero-meta"><span>${flowHM(week)} this week</span><span>${st.today ? 'Streak kept today' : `${FLOW_DAY} min keeps the streak`}</span></div>
    </section>
    <div class="fl-go ${a ? 'one' : ''}">
      ${a ? '' : `<button class="btn btn-primary" data-act="fl-start">${icon('timer')} Start a session</button>`}
      <button class="btn btn-ghost" data-act="fl-log">${icon('plus')} Log time</button>
    </div>

    <div class="section-title"><span>This week</span><span>${flowHM(week)}</span></div>
    <section class="panel pad"><div class="fl-week">${bars}</div></section>

    <div class="fl-stats">
      <div><div class="v">${st.cur}<small> day${st.cur === 1 ? '' : 's'}</small></div><div class="k">Focus streak</div><div class="s">best ${st.best}</div></div>
      <div><div class="v">${avg ? avg.toFixed(1) : '—'}<small> / 5</small></div><div class="k">Average focus</div><div class="s">last 30 days</div></div>
      <div><div class="v">${best ? best.short : '—'}</div><div class="k">Best time to focus</div><div class="s">${best ? `rated ${best.avg.toFixed(1)} on average` : 'after a few rated sessions'}</div></div>
      <div><div class="v">${weekSessions}</div><div class="k">Sessions this week</div><div class="s">${f.sessions.filter(s => s.date >= wk && s.mins >= FLOW_DEEP).length} deep (${FLOW_DEEP}+ min)</div></div>
    </div>

    ${questStrip('flow')}

    <div class="section-title"><span>Recent sessions</span></div>
    <section class="panel">${recent.length ? recent.map(flowItem).join('') : '<p class="empty">No sessions yet. Your first one is a tap away.</p>'}</section>

    <button class="fl-settings" data-act="fl-settings">
      <span>Timer and labels</span><small>Pomodoro ${f.settings.pomo.join(' / ')} · Deep ${f.settings.deep.join(' / ')}</small>${icon('chevR')}
    </button>
  </div>`;
}

function flowItem(s) {
  const when = fmtDayShort(s.date) + (s.start ? ` · ${new Date(s.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : '') + (s.manual ? ' · logged' : '');
  return `<div class="hist fl-row">
    <div class="mark">${icon('timer')}</div>
    <div class="main"><div class="t">${esc(s.label)} <span>· ${flowHM(s.mins)}</span></div>
      <div class="s">${when}${s.rating ? ` · rated ${s.rating}/5` : ''}${s.note ? ` · ${esc(s.note)}` : ''}</div></div>
    <div class="amt">${s.xp ? `<small>+${s.xp} XP</small>` : ''}</div>
    <button class="del" data-act="fl-del" data-id="${s.id}" aria-label="Remove">${icon('x')}</button>
  </div>`;
}

const FLOW_R = 114, FLOW_LEN = 2 * Math.PI * FLOW_R;
// The parts of the timer screen that change every second
function flowFace(a, now = Date.now()) {
  const ms = flowPhaseMs(a, now), focus = Math.floor(flowFocusMs(a, now) / 6e4);
  if (a.mode === 'open') return { time: flowClock(ms), sub: 'no limit', frac: (ms % 36e5) / 36e5, total: `${flowHM(focus)} focused` };
  if (a.phase === 'ready') return { time: 'Ready', sub: 'break over', frac: 1, total: `${flowHM(focus)} focused · ${a.blocks} block${a.blocks === 1 ? '' : 's'}` };
  const len = flowPhaseLen(a);
  return { time: flowClock(len - ms), sub: `of ${len / 6e4} min ${a.phase}`, frac: Math.min(1, ms / len), total: `${flowHM(focus)} focused · block ${a.blocks + (a.phase === 'focus' ? 1 : 0)}` };
}

function flowTimerView() {
  const a = FL().active;
  flowAdvance(a);
  const face = flowFace(a);
  const phase = a.mode === 'open' ? 'Open flow' : a.phase === 'focus' ? 'Focus' : a.phase === 'break' ? 'Break' : 'Break over';
  const wake = 'wakeLock' in navigator;
  const controls = a.phase === 'ready'
    ? `<button class="btn btn-ghost" data-act="fl-end">End session</button><button class="btn btn-primary" data-act="fl-next">Start next block</button>`
    : `<button class="btn btn-ghost" data-act="${a.paused ? 'fl-resume' : 'fl-pause'}">${a.paused ? 'Resume' : 'Pause'}</button><button class="btn btn-primary" data-act="fl-end">End</button>`;
  return `<div class="fl-timer ${a.phase} ${a.paused ? 'paused' : ''}">
    <nav class="topnav">
      <button class="icon-btn" data-back aria-label="Back (the timer keeps running)">${icon('chevL')}</button>
      <span class="title">${esc(a.label)} · ${FLOW_MODES[a.mode]}</span><span class="spacer"></span></nav>
    <div class="fl-stage">
      <div class="eyebrow fl-phase">${a.paused ? 'Paused' : phase}</div>
      <div class="fl-ring">
        <svg viewBox="0 0 240 240" aria-hidden="true">
          <circle cx="120" cy="120" r="${FLOW_R}" class="fl-ring-track"/>
          <circle cx="120" cy="120" r="${FLOW_R}" class="fl-ring-prog" id="fl-prog" stroke-dasharray="${FLOW_LEN}" stroke-dashoffset="${FLOW_LEN * (1 - face.frac)}"/>
        </svg>
        <div class="fl-clock"><div class="fl-time" id="fl-time">${face.time}</div><div class="fl-sub" id="fl-sub">${face.sub}</div></div>
      </div>
      <div class="fl-total" id="fl-total">${face.total}</div>
      ${a.phase === 'break' && !a.paused ? '<button class="btn btn-text" data-act="fl-next">Skip break</button>' : ''}
    </div>
    <div class="fl-controls">${controls}</div>
    <p class="fl-note"><span id="fl-wake">${wake ? 'The screen stays awake while this is open.' : "This browser can't keep the screen awake, so it may lock."}</span>
      The chime only plays while Compound is open on screen. If you leave, the timer keeps time and catches up when you come back.</p>
  </div>`;
}

function flowSetupView() {
  return `<div>
    ${topNav('New tracker')}
    <h1 class="page-title">Flow</h1>
    <p class="page-lead">A calm focus timer. Pick what you're working on, start the clock, and rate how well you focused at the end.</p>
    <section class="panel">
      ${kv('Pomodoro', '25 / 5 min', 'focus, then a break, repeating')}
      ${kv('Deep work', '50 / 10 min', 'longer blocks for hard thinking')}
      ${kv('Open flow', 'No limit', 'a stopwatch for long runs')}
    </section>
    <p class="hint">You can change the lengths and your labels any time. Only focus time counts, never breaks.</p>
    <form id="f-flsetup"><button class="btn btn-primary btn-block">Start using Flow</button></form>
  </div>`;
}

/* ---------- Sheets ---------- */
const flowChips = (name, opts, val) => `<div class="purposes">${opts.map(([v, l]) =>
  `<label class="purpose"><input type="radio" name="${name}" value="${esc(v)}" ${String(v) === String(val) ? 'checked' : ''} hidden>${l}</label>`).join('')}</div>`;

// Focus done without the timer: pick a length and it's added to that day
function flowLogSheet() {
  const f = FL(), last = f.last || {};
  const label = f.labels.includes(last.label) ? last.label : f.labels[0];
  openSheet(`
    <h2>Log focus time</h2>
    <p class="lead">Already done some focused work without the timer? Add it here.</p>
    <form id="f-fllog">
      <div class="field-label">How long?</div>
      ${flowChips('mins', FLOW_QUICK.map(m => [m, m < 60 ? `${m} min` : `${m / 60} h`]), 30)}
      <label class="field"><span>Or exact minutes</span><input name="other" ${moneyAttrs('int')} placeholder="0"></label>
      <div class="field-label">On what?</div>
      ${f.labels.length ? flowChips('label', f.labels.map(l => [l, esc(l)]), label) : ''}
      <label class="field"><span>${f.labels.length ? 'Or something new' : 'Label'}</span><input name="newlabel" maxlength="24" placeholder="Work, Study…" autocomplete="off"></label>
      <div class="field-label">Focus rating (optional)</div>
      <div class="purposes fl-rate">${[1, 2, 3, 4, 5].map(n => `<label class="purpose"><input type="radio" name="rating" value="${n}" hidden>${n}</label>`).join('')}</div>
      <p class="hint fl-rate-hint">1 scattered · 3 okay · 5 completely absorbed</p>
      <label class="field"><span>Day</span><input name="date" type="date" value="${todayISO()}" max="${todayISO()}"></label>
      <div id="fl-err" class="err"></div>
      ${sheetButtons('Log time')}
    </form>`);
}

function flowStartSheet() {
  const f = FL(), last = f.last || {}, s = f.settings;
  const label = f.labels.includes(last.label) ? last.label : f.labels[0];
  openSheet(`
    <h2>Start a session</h2>
    <p class="lead">What are you focusing on?</p>
    <form id="f-flstart">
      ${f.labels.length ? flowChips('label', f.labels.map(l => [l, esc(l)]), label) : ''}
      <label class="field"><span>${f.labels.length ? 'Or something new' : 'Label'}</span><input name="newlabel" maxlength="24" placeholder="Work, Study…" autocomplete="off"></label>
      <div class="field-label">Mode</div>
      ${flowChips('mode', [['pomo', `Pomodoro ${s.pomo.join(' / ')}`], ['deep', `Deep work ${s.deep.join(' / ')}`], ['open', 'Open flow']], last.mode || 'pomo')}
      <div id="fl-err" class="err"></div>
      ${sheetButtons('Start')}
    </form>`);
}

function flowEndSheet() {
  const a = FL().active;
  flowAdvance(a);
  const wasRunning = !a.paused && a.phase !== 'ready';
  if (wasRunning) flowPause(a);
  save();
  const mins = Math.floor(flowFocusMs(a) / 6e4);
  // Cancelling goes back to the timer, running again if it was running
  const onClose = () => { const x = FL().active; if (x && wasRunning) { flowResume(x); save(); } render(); };
  if (mins < 1) {
    return openSheet(`
      <h2>Under a minute</h2>
      <p class="lead">There's nothing to save yet. Keep going, or discard this session.</p>
      <div class="sheet-actions"><button class="btn btn-ghost" data-act="fl-discard">Discard</button><button class="btn btn-primary" data-close>Keep going</button></div>`, { onClose });
  }
  openSheet(`
    <h2>How was your focus?</h2>
    <p class="lead">${esc(a.label)} · ${FLOW_MODES[a.mode]} · the timer measured ${flowHM(mins)} of focus.</p>
    <form id="f-flend" data-max="${mins}">
      <div class="field-label">Focus rating</div>
      <div class="purposes fl-rate">${[1, 2, 3, 4, 5].map(n => `<label class="purpose"><input type="radio" name="rating" value="${n}" hidden>${n}</label>`).join('')}</div>
      <p class="hint fl-rate-hint">1 scattered · 3 okay · 5 completely absorbed</p>
      <label class="field"><span>What distracted you? (optional)</span><input name="note" maxlength="60" placeholder="Nothing, phone, noise…" autocomplete="off"></label>
      <div class="chips">${FLOW_DISTRACTIONS.map(d => `<button type="button" class="chip" data-act="fl-dist" data-v="${d}">${d}</button>`).join('')}</div>
      <label class="field"><span>Minutes to count</span><input name="mins" ${moneyAttrs('int', mins)}>
        <small>Lower it if you stepped away and the timer kept going.</small></label>
      <div class="preview" id="fl-preview"></div>
      <div id="fl-err" class="err"></div>
      ${sheetButtons('Save session')}
    </form>
    <button class="btn btn-text btn-danger btn-block" data-act="fl-discard">Discard this session</button>`, { onClose });
  flowEndPreview();
}

function flowEndPreview() {
  const f = $('#f-flend');
  if (!f) return;
  const mins = Math.min(Number(f.dataset.max), num(f.elements.mins.value) || 0);
  $('#fl-preview').innerHTML = mins >= FLOW_MIN
    ? kv('Reward', `+${award(mins * FLOW_XP_PER_MIN).xp} XP`, `${FLOW_XP_PER_MIN} XP a focused minute, with momentum`)
    : kv('Reward', '—', `sessions of ${FLOW_MIN}+ minutes earn XP`);
}

function flowSettingsSheet() {
  const f = FL(), s = f.settings;
  openSheet(`
    <h2>Timer and labels</h2>
    <p class="lead">Lengths are in minutes. Changes apply from your next session.</p>
    <form id="f-flset">
      <div class="field-label">Pomodoro</div>
      <div class="grid2">
        <label class="field"><span>Focus</span><input name="pf" ${moneyAttrs('int', s.pomo[0])}></label>
        <label class="field"><span>Break</span><input name="pb" ${moneyAttrs('int', s.pomo[1])}></label>
      </div>
      <div class="field-label">Deep work</div>
      <div class="grid2">
        <label class="field"><span>Focus</span><input name="df" ${moneyAttrs('int', s.deep[0])}></label>
        <label class="field"><span>Break</span><input name="db" ${moneyAttrs('int', s.deep[1])}></label>
      </div>
      <div class="field-label">Labels</div>
      <div class="panel" style="margin-bottom:12px">${f.labels.map(l => `<div class="kv"><span class="k">${esc(l)}</span>
        <button type="button" class="del" data-act="fl-label-del" data-v="${esc(l)}" aria-label="Remove ${esc(l)}">${icon('x')}</button></div>`).join('') || '<p class="empty">No labels yet.</p>'}</div>
      <label class="field"><span>Add a label</span><input name="newlabel" maxlength="24" autocomplete="off" placeholder="Work"></label>
      <div id="fl-err" class="err"></div>
      ${sheetButtons('Save')}
    </form>`);
}

/* ---------- Screen wake lock and the once-a-second tick ---------- */
let flowWakeLock = null, flowWakeWant = false, flowWakeBusy = false, flowTicker = null;
async function flowWake(on) {
  flowWakeWant = on;
  if (flowWakeBusy || !('wakeLock' in navigator)) return;
  flowWakeBusy = true;
  try {
    // Keep going until the lock matches what the latest call asked for
    while (flowWakeWant !== !!flowWakeLock) {
      if (flowWakeWant) {
        if (document.visibilityState !== 'visible') break;
        const lock = await navigator.wakeLock.request('screen');
        lock.addEventListener('release', () => { if (flowWakeLock === lock) flowWakeLock = null; });
        flowWakeLock = lock;
      } else {
        const lock = flowWakeLock;
        flowWakeLock = null;
        await lock.release();
      }
    }
  } catch {
    // Refused, e.g. by battery saver: say so on the timer instead of promising it
    const n = $('#fl-wake');
    if (n) n.textContent = "Your phone didn't allow keeping the screen awake, so it may lock.";
  }
  flowWakeBusy = false;
}

// Called after every render: run the tick and hold the screen awake only on the timer screen
function flowSync() {
  const a = FL()?.active, on = view === 'flow-timer' && !!a;
  if (on && !flowTicker) flowTicker = setInterval(flowTick, 1000);
  if (!on && flowTicker) { clearInterval(flowTicker); flowTicker = null; }
  flowWake(on && !a.paused && a.phase !== 'ready');
}

function flowTick() {
  const a = FL()?.active;
  if (!a || view !== 'flow-timer') return flowSync();
  const was = a.phase;
  if (flowAdvance(a)) {
    save();
    if (document.visibilityState === 'visible') flowCue(was, a);
    if (!$('#modal-root').innerHTML) render();
    return;
  }
  const face = flowFace(a), t = $('#fl-time');
  if (!t) return;
  t.textContent = face.time;
  $('#fl-sub').textContent = face.sub;
  $('#fl-total').textContent = face.total;
  $('#fl-prog').setAttribute('stroke-dashoffset', FLOW_LEN * (1 - face.frac));
}

function flowCue(was, a) {
  sfx.chime();
  haptic([200, 120, 200]);
  if (was === 'focus') toast(`<b>Block ${a.blocks} done.</b> Take ${a.breakLen / 6e4} minutes away from the screen.`);
  else toast("<b>Break's over.</b> Start the next block when you're ready.");
}

/* ---------- Actions ---------- */
function flowFinish(form) {
  const f = FL(), a = f.active, max = Number(form.dataset.max);
  const rating = Number(form.elements.rating.value), note = form.elements.note.value.trim();
  const mins = num(form.elements.mins.value);
  if (!rating) return ($('#fl-err').textContent = 'Pick a focus rating from 1 to 5.');
  if (mins > max) return ($('#fl-err').textContent = `That's more than the ${flowHM(max)} the timer measured.`);
  if (mins < 1) return ($('#fl-err').textContent = 'Count at least one minute, or discard the session.');
  const g0 = globalStats();
  const { xp, mult } = mins >= FLOW_MIN ? award(mins * FLOW_XP_PER_MIN) : { xp: 0, mult: 1 };
  const ts = Date.now();
  const e = { id: uid(), ts, date: dayOfTs(ts), start: a.startTs, label: a.label, mode: a.mode, blocks: a.blocks, mins, rating, note, xp, mult };
  f.sessions.push(e);
  f.active = null;
  save();
  closeSheet();
  flowLeaveTimer();
  const week = sum(f.sessions.filter(s => s.date >= weekStart(todayISO())), s => s.mins);
  finishAction(g0, xp
    ? `${esc(e.label)} · ${flowHM(mins)} of focus · ${flowHM(week)} this week · <b>${xpLabel(e)}</b>`
    : `${esc(e.label)} · ${flowHM(mins)} saved.`, { big: mins >= FLOW_DAY });
}

// After a session ends, the timer's place in the back-button history becomes the Flow screen
function flowLeaveTimer() {
  view = 'flow';
  animateNext = true;
  history.replaceState({ v: 'flow' }, '');
  render();
  scrollTo(0, 0);
}

const flowForms = {
  'f-flsetup'() {
    state.flow = { createdAt: todayISO(), settings: { pomo: [...FLOW_DEFAULTS.pomo], deep: [...FLOW_DEFAULTS.deep] }, labels: [...FLOW_LABELS], sessions: [], active: null, last: null };
    save();
    view = 'flow';
    animateNext = true;
    history.replaceState({ v: 'flow' }, '');
    render();
    scrollTo(0, 0);
    sfx.chime();
    toast('Flow is ready. Start your first session when you sit down to work.');
  },

  'f-flstart'(form) {
    const f = FL(), typed = form.elements.newlabel.value.trim();
    const label = typed || form.elements.label?.value || '';
    if (!label) return ($('#fl-err').textContent = "Name what you're focusing on.");
    if (typed && !f.labels.some(l => l.toLowerCase() === typed.toLowerCase())) f.labels.push(typed);
    const mode = form.elements.mode.value || 'pomo', [fm, bm] = f.settings[mode] || [0, 0];
    const now = Date.now();
    f.active = { label, mode, startTs: now, phase: 'focus', phaseStart: now, phaseAcc: 0, paused: false, focusDone: 0, blocks: 0, focusLen: fm * 6e4, breakLen: bm * 6e4 };
    f.last = { label, mode };
    save();
    closeSheet();
    sfx.soft();
    haptic(15);
    go('flow-timer');
  },

  'f-flend'(form) { flowFinish(form); },

  'f-fllog'(form) {
    const f = FL(), today = todayISO(), typed = form.elements.newlabel.value.trim();
    const mins = num(form.elements.other.value) || Number(form.elements.mins.value);
    const label = typed || form.elements.label?.value || '', date = form.elements.date.value || today;
    if (!(mins >= 1 && mins <= 720)) return ($('#fl-err').textContent = 'Pick a length between 1 minute and 12 hours.');
    if (!label) return ($('#fl-err').textContent = "Name what you focused on.");
    if (date > today) return ($('#fl-err').textContent = "You can't log a day that hasn't happened yet.");
    if (typed && !f.labels.some(l => l.toLowerCase() === typed.toLowerCase())) f.labels.push(typed);
    const g0 = globalStats();
    const { xp, mult } = mins >= FLOW_MIN ? award(mins * FLOW_XP_PER_MIN) : { xp: 0, mult: 1 };
    // Today: it ended just now. A past day: stamped at midday so it lands on that day, with no start time
    const now = Date.now(), isToday = date === today, ts = isToday ? now : parseISO(date).getTime() + 12 * 36e5;
    f.sessions.push({ id: uid(), ts, date, start: isToday ? now - mins * 6e4 : null, label, mode: 'manual', manual: true,
      blocks: 0, mins, rating: Number(form.elements.rating.value) || null, note: '', xp, mult });
    f.last = { label, mode: f.last?.mode || 'pomo' };
    save();
    closeSheet();
    render();
    const week = sum(f.sessions.filter(s => s.date >= weekStart(today)), s => s.mins);
    finishAction(g0, `${esc(label)} · ${flowHM(mins)} logged${isToday ? '' : ` for ${fmtDayShort(date)}`} · ${flowHM(week)} this week`, { big: mins >= FLOW_DAY });
  },

  'f-flset'(form) {
    const n = name => num(form.elements[name].value);
    const pomo = [n('pf'), n('pb')], deep = [n('df'), n('db')];
    if (![pomo[0], deep[0]].every(m => m >= 5 && m <= 180)) return ($('#fl-err').textContent = 'Focus blocks need to be 5 to 180 minutes.');
    if (![pomo[1], deep[1]].every(m => m >= 1 && m <= 60)) return ($('#fl-err').textContent = 'Breaks need to be 1 to 60 minutes.');
    const f = FL(), typed = form.elements.newlabel.value.trim();
    if (typed && !f.labels.some(l => l.toLowerCase() === typed.toLowerCase())) f.labels.push(typed);
    Object.assign(f.settings, { pomo, deep });
    save();
    closeSheet();
    render();
    toast('Saved. New lengths apply from your next session.');
  },
};

const flowActions = {
  'fl-start': () => flowStartSheet(),
  'fl-log': () => flowLogSheet(),
  'fl-settings': () => flowSettingsSheet(),
  'fl-pause': () => { flowAdvance(FL().active); flowPause(FL().active); save(); render(); sfx.tap(); },
  'fl-resume': () => { flowResume(FL().active); save(); render(); sfx.tap(); },
  'fl-next': () => { flowNextBlock(FL().active); save(); render(); sfx.soft(); },
  'fl-end': () => flowEndSheet(),
  'fl-discard': () => {
    if (!confirm('Discard this session? Nothing will be saved.')) return;
    FL().active = null;
    save();
    closeSheet();
    flowLeaveTimer();
    toast('Session discarded.');
  },
  'fl-dist': (el, d) => { const i = $('#f-flend [name=note]'); if (i) i.value = d.v; },
  'fl-del': (el, d) => {
    if (!confirm('Remove this session?')) return;
    FL().sessions = FL().sessions.filter(s => s.id !== d.id);
    save();
    render();
  },
  'fl-label-del': (el, d) => {
    FL().labels = FL().labels.filter(l => l !== d.v);
    save();
    flowSettingsSheet();
  },
};

/* ---------- Registration ---------- */
const FLOW_SLOT = ['flow5h', 'flowDays4', 'flow5h', 'flowDeep3'];

registerTracker({
  id: 'flow',
  order: 40,
  cardOrder: 40,

  migrate(s) {
    if (!s.flow) return;
    const f = s.flow;
    f.settings = Object.assign({ pomo: [...FLOW_DEFAULTS.pomo], deep: [...FLOW_DEFAULTS.deep] }, f.settings);
    f.labels = f.labels || [...FLOW_LABELS];
    f.sessions = f.sessions || [];
    f.active = f.active || null;
  },

  views: { flow: flowView, 'flow-timer': flowTimerView, 'flow-setup': flowSetupView },
  needsData: { flow: () => !!state.flow, 'flow-timer': () => !!state.flow?.active },
  card: flowCard,
  notices: () => {
    const a = state.flow?.active;
    if (!a) return [];
    flowAdvance(a);
    const what = a.paused ? 'paused' : a.phase === 'ready' ? 'break over' : a.phase === 'break' ? 'on a break' : 'running';
    return [notice('fl-open', `Flow session ${what} · ${esc(a.label)} · ${flowHM(Math.floor(flowFocusMs(a) / 6e4))}`, 'var(--accent)')];
  },

  activity(add) { if (state.flow) flowCounted().forEach(s => add(s.ts, s.xp)); },
  xp: () => (state.flow ? sum(state.flow.sessions, s => s.xp) : 0),
  stats: () => ({ Fl: flowStats() }),

  quests: {
    flow5h: { text: 'Focus for 5 hours', goal: 5, get: w => w.flowHours },
    flowDays4: { text: `Focus ${FLOW_DAY}+ minutes on 4 days`, goal: 4, get: w => w.flowDays },
    flowDeep3: { text: `Three sessions of ${FLOW_DEEP}+ minutes`, goal: 3, get: w => w.flowDeep },
  },
  // An extra weekly quest, from the week Flow was set up
  questSlots: [{ ids: FLOW_SLOT, active: wk => !!state.flow && wk >= weekStart(state.flow.createdAt) }],
  weekData(w, inWeek) {
    if (!state.flow) return;
    const list = state.flow.sessions.filter(s => inWeek(s.date)), byDay = {};
    list.forEach(s => { byDay[s.date] = (byDay[s.date] || 0) + s.mins; });
    w.flowHours = Math.floor(sum(list, s => s.mins) / 6) / 10;
    w.flowDays = Object.values(byDay).filter(m => m >= FLOW_DAY).length;
    w.flowDeep = list.filter(s => s.mins >= FLOW_DEEP).length;
  },

  milestones: [
    ms('fl-first', 'First flow session', '', 100, g => g.Fl.sessions >= 1),
    ms('fl-hour', 'A focused hour', 'One session, sixty minutes', 200, g => g.Fl.longest >= 60),
    ms('fl-day2h', 'First two-hour flow day', '', 300, g => g.Fl.bestDay >= 120),
    ms('fl-streak3', 'Three focus days running', `${FLOW_DAY}+ minutes a day`, 200, g => g.Fl.bestStreak >= 3),
    ms('fl-streak7', 'A week of focus', `${FLOW_DAY}+ minutes, seven days running`, 600, g => g.Fl.bestStreak >= 7),
    ms('fl-week10', 'Ten hours in a week', '', 800, g => g.Fl.bestWeek >= 600),
    ms('fl-deep10', 'Ten deep sessions', `${FLOW_DEEP}+ minutes each`, 800, g => g.Fl.deep >= 10),
    ms('fl-total10', 'Ten hours of focus', '', 300, g => g.Fl.totalMins >= 600),
    ms('fl-total50', 'Fifty hours of focus', '', 1200, g => g.Fl.totalMins >= 3000),
    ms('fl-total100', 'One hundred hours', 'Deep work is a habit now', 3000, g => g.Fl.totalMins >= 6000),
  ],

  xpRows: () => kv('Focused minute', `+${FLOW_XP_PER_MIN}`, `sessions of ${FLOW_MIN}+ minutes`),

  forms: flowForms,
  actions: { ...flowActions, 'fl-open': () => go('flow-timer') },
  onInput(ev) { if (ev.target.closest('#f-flend')) flowEndPreview(); },
  onRender: flowSync,
  onResume() {
    const a = state.flow?.active;
    if (a && flowAdvance(a)) save();
    if (a && ['flow-timer', 'flow', 'home'].includes(view) && !$('#modal-root').innerHTML) render();
    else flowSync();
  },
});
