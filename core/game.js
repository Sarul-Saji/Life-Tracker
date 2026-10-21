'use strict';
/* COMPOUND · core/game.js
   The tracker registry and the shared game engine: XP, momentum, weekly quests, milestones, levels.

   HOW TRACKERS PLUG IN
   Each file in trackers/ calls registerTracker({...}) once. Every field is optional:
     id, order          unique name; order sets the sequence (lower first)
     cardOrder          position of its card on Home (defaults to order)
     migrate(s)         bring older saved data up to date (runs on every load)
     views              { viewName: () => html } screens it owns
     needsData          { viewName: () => bool } if false, that screen falls back to Home
     card()             html for its card on Home
     notices()          array of html notices for Home
     actions            { 'data-act name': (el, dataset) => void }
     forms              { 'form id': (form) => void }
     onInput(ev), onChange(ev), onRender(), onEnter(view), onStart(), onResume()
     activity(add)      call add(timestamp, xp) for each thing you logged (drives momentum)
     xp()               total XP earned inside this tracker
     stats()            fields merged into globalStats() for milestone tests
     quests             { id: { text, goal | limit, get(w), valid?(w) } }
     questSlots         [{ ids: [...], active?(wk) }] extra weekly quest slots
     weekData(w, inWeek, wk)   add this week's numbers to w for quests
     milestones         [ms(...), ...]
     xpRows()           html rows for the "How XP works" guide */

const TRACKERS = [];
const QUESTS = {};
const MILESTONES = [];
const ms = (id, name, desc, xp, test) => ({ id, name, desc, xp, test });

function registerTracker(t) {
  TRACKERS.push(t);
  TRACKERS.sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
  Object.entries(t.quests || {}).forEach(([id, q]) => { QUESTS[id] = { ...q, tracker: t.id }; });
  MILESTONES.push(...(t.milestones || []));
}
const tracker = id => TRACKERS.find(t => t.id === id);

/* ---------- XP and momentum ---------- */
const DAILY_BONUS = 20;
// Momentum: show up on consecutive days and every action earns more XP
const MOMENTUM = [[30, 1.5], [21, 1.4], [14, 1.3], [7, 1.2], [3, 1.1], [0, 1]];
const multFor = streak => MOMENTUM.find(([d]) => streak >= d)[1];

// Every day you did anything → total XP earned that day
function activity() {
  const m = new Map();
  const add = (ts, xp) => { const d = dayOfTs(ts); m.set(d, (m.get(d) || 0) + (xp || 0)); };
  TRACKERS.forEach(t => t.activity?.(add));
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

// XP for an action right now: daily bonus for the first action, times momentum.
// Passive actions (done by the app for you) get your current multiplier but no daily bonus.
function award(base, { passive = false } = {}) {
  const st = streakInfo(activity());
  if (passive) { const mult = multFor(st.cur); return { xp: Math.round(base * mult), mult }; }
  const streakAfter = st.today ? st.cur : st.cur + 1;
  const mult = multFor(streakAfter), bonus = st.today ? 0 : DAILY_BONUS;
  return { xp: Math.round((base + bonus) * mult), mult };
}

/* ---------- Weekly quests ---------- */
Object.assign(QUESTS, {
  active6: { text: 'Show up on 6 days', goal: 6, get: w => w.activeDays, tracker: 'home' },
  streak7: { text: 'Show up all 7 days', goal: 7, get: w => w.activeDays, tracker: 'home' },
});
// The three core slots rotate weekly. Changing them changes past weeks' quests (and XP), so only edit in main build.
const BASE_SLOTS = [['log5', 'tx10', 'active6'], ['food40', 'shop30', 'nospend2'], ['streak7', 'extra1', 'tx15']];
const QUEST_XP = 100, CHEST_XP = 150;

function questsFor(wk) {
  const n = weekIndex(wk);
  const ids = BASE_SLOTS.map((slot, i) => {
    const id = slot[(n + i) % slot.length];
    return id === 'extra1' && !state.loan ? 'tx15' : id;
  });
  TRACKERS.forEach(t => (t.questSlots || []).forEach(s => {
    if (!s.active || s.active(wk)) ids.push(s.ids[n % s.ids.length]);
  }));
  return ids;
}

function weekData(wk, act) {
  const end = addDays(wk, 6), inWeek = d => d >= wk && d <= end;
  const w = { activeDays: 0 };
  for (const d of act.keys()) if (inWeek(d)) w.activeDays++;
  TRACKERS.forEach(t => t.weekData?.(w, inWeek, wk));
  return w;
}

function questStatus(wk, act) {
  const w = weekData(wk, act), over = addDays(wk, 6) < todayISO();
  const list = questsFor(wk).filter(id => QUESTS[id]).map(id => {
    const q = QUESTS[id], val = q.get(w) || 0;
    if (q.limit) {
      // Limits only count if you actually logged that week, and complete when the week ends
      const valid = q.valid ? q.valid(w) : true, ok = valid && val <= q.limit;
      return { id, text: q.text, limit: q.limit, val, valid, ok, done: over && ok, pct: Math.min(1, val / q.limit), label: `${gbp(val)} / ${gbp(q.limit)}` };
    }
    const goal = typeof q.goal === 'function' ? q.goal() : q.goal;
    return { id, text: q.text, val, done: val >= goal, pct: Math.min(1, val / goal), label: `${Math.min(val, goal)} / ${goal}` };
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

/* ---------- Levels and milestones ---------- */
const TITLES = [[1, 'Novice'], [3, 'Apprentice'], [6, 'Steward'], [10, 'Strategist'], [15, 'Architect'], [20, 'Master'], [30, 'Grandmaster']];
const titleFor = lvl => TITLES.filter(t => lvl >= t[0]).pop()[1];
function levelFrom(xp) {
  let lvl = 1, need = 200;
  while (xp >= need) { xp -= need; lvl++; need = 200 + (lvl - 1) * 100; }
  return { lvl, into: xp, need };
}

// Showing-up milestones; each tracker adds its own when it registers
MILESTONES.push(
  ms('streak-3', 'Three days running', 'Momentum ×1.1 unlocked', 150, g => g.best >= 3),
  ms('streak-7', 'A full week', 'Seven days in a row', 300, g => g.best >= 7),
  ms('streak-14', 'Two weeks strong', '', 600, g => g.best >= 14),
  ms('streak-30', 'Thirty-day habit', 'Maximum momentum', 1500, g => g.best >= 30),
  ms('streak-100', 'One hundred days', 'This is who you are now', 5000, g => g.best >= 100),
  ms('quest-1', 'First quest complete', '', 150, g => g.questsDone >= 1),
  ms('chest-1', 'First full week', 'All three quests in one week', 300, g => g.chests >= 1),
  ms('chest-10', 'Ten full weeks', '', 2000, g => g.chests >= 10),
);

// One snapshot of everything game-related
function globalStats() {
  const act = activity(), st = streakInfo(act);
  const g = { act, streak: st.cur, best: st.best, today: st.today };
  TRACKERS.forEach(t => Object.assign(g, t.stats?.()));
  g.week = questStatus(weekStart(todayISO()), act);
  const q = allQuests(act);
  g.questsDone = q.done;
  g.chests = q.chests;
  const unlocked = MILESTONES.filter(m => m.test(g));
  g.unlocked = unlocked.map(m => m.id);
  g.xp = sum(TRACKERS, t => t.xp?.()) + sum(unlocked, m => m.xp) + q.xp;
  return g;
}

// Everything worth celebrating that changed between two snapshots
function rewardsBetween(g0, g1) {
  const out = [];
  if (g0.week.wk === g1.week.wk) {
    g1.week.list.forEach((q, i) => {
      if (q.done && !g0.week.list[i]?.done) out.push({ kicker: 'Quest complete', title: q.text, xp: QUEST_XP, icon: 'trophy' });
    });
    if (g1.week.chest && !g0.week.chest) out.push({ kicker: 'Full week', title: `All ${g1.week.list.length} quests done`, text: 'Bonus unlocked.', xp: CHEST_XP, icon: 'trophy' });
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
