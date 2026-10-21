'use strict';
/* COMPOUND · core/home.js
   Home (greeting, level, momentum, quests, tracker cards), Profile, the XP guide,
   backups and the weekly recap. Tracker cards and notices come from the registry. */

let showAllMilestones = false;
// Placeholder cards on Home. A tracker with the same id hides its placeholder automatically.
const SOON = [['flow', 'timer', 'Flow'], ['todo', 'check', 'To-do']];

function homeView() {
  const g = globalStats(), lv = levelFrom(g.xp), name = state.profile.name;
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const notices = TRACKERS.flatMap(t => t.notices?.() || []);
  if (g.act.size > 2 && daysSince(state.lastBackup) > 14)
    notices.push(notice('backup', `Back up your data · last backup ${state.lastBackup ? fmtDay(state.lastBackup) : 'never'}`, 'var(--muted)'));
  const daysLeft = 7 - ((new Date().getDay() + 6) % 7);
  const soon = SOON.filter(([id]) => !tracker(id))
    .map(([, ic, label]) => `<button class="soon" data-soon="${label}">${icon(ic)}<div class="name">${label}</div><div class="tag">Coming soon</div></button>`).join('');
  const cards = [...TRACKERS].sort((a, b) => (a.cardOrder ?? a.order ?? 50) - (b.cardOrder ?? b.order ?? 50)).map(t => t.card?.() || '').join('');
  return `<div>
    <header class="home-head">
      <div><div class="date">${today}</div><h1 class="greet">${greeting()},<br>${esc(name)}</h1></div>
      <button class="avatar" data-go="profile" aria-label="Profile">${ring(lv.into / lv.need, 50)}<span class="ini">${esc(name[0].toUpperCase())}</span></button>
    </header>
    <button class="level-line" data-act="xp-help" aria-label="How XP works">
      <span>Level <b>${lv.lvl}</b> · ${titleFor(lv.lvl)}</span>
      <div class="bar gold"><i style="width:${(lv.into / lv.need) * 100}%"></i></div>
      <span>${lv.into.toLocaleString('en-IN')} / ${lv.need.toLocaleString('en-IN')} XP</span><span class="qmark">?</span>
    </button>
    ${notices.join('')}

    <div class="section-title"><span>Momentum</span><span>Best ${g.best} day${g.best === 1 ? '' : 's'}</span></div>
    ${momentumCard(g)}

    <div class="section-title"><span>This week's quests</span><span>${daysLeft} day${daysLeft === 1 ? '' : 's'} left</span></div>
    ${questsCard(g.week)}

    <div class="section-title"><span>Trackers</span></div>
    ${cards}
    ${soon ? `<div class="soon-grid">${soon}</div>` : ''}
  </div>`;
}

// Inside each tracker: just this week's quests that belong to it
function questStrip(trackerId) {
  const ws = questStatus(weekStart(todayISO()), activity());
  const list = ws.list.filter(q => QUESTS[q.id]?.tracker === trackerId);
  if (!list.length) return '';
  return `<div class="section-title"><span>This week's quest${list.length > 1 ? 's' : ''}</span><span>${ws.done} of ${ws.list.length} done overall</span></div>
    <section class="panel qstrip">${list.map(questRow).join('')}</section>`;
}

function xpSheet() {
  const g = globalStats(), lv = levelFrom(g.xp), mult = multFor(g.streak);
  openSheet(`
    <h2>How XP works</h2>
    <p class="lead">Everything you log earns XP. XP fills your level bar, and each level needs a little more than the last. You're level ${lv.lvl}: ${(lv.need - lv.into).toLocaleString('en-IN')} XP to level ${lv.lvl + 1}.</p>
    <div class="section-title"><span>Earn</span></div>
    <div class="panel">
      ${TRACKERS.map(t => t.xpRows?.() || '').join('')}
      ${kv('First log of the day', `+${DAILY_BONUS} bonus`)}
    </div>
    <div class="section-title"><span>Multiply</span></div>
    <div class="panel">
      ${kv('Momentum', `×${mult.toFixed(1)} now`, '×1.1 at 3 days, up to ×1.5 at 30')}
    </div>
    <div class="section-title"><span>Bonuses</span></div>
    <div class="panel">
      ${kv('Weekly quest', `+${QUEST_XP} each`, `+${CHEST_XP} for completing them all`)}
      ${TRACKERS.map(t => t.bonusRows?.() || '').join('')}
      ${kv('Milestones', '+100 to +10,000', `${g.unlocked.length} of ${MILESTONES.length} unlocked`)}
    </div>
    <div class="section-title"><span>Titles</span></div>
    <div class="panel">${TITLES.map(([l, t]) => kv(t, `Level ${l}`, '', lv.lvl >= l ? 'pos' : '')).join('')}</div>
    <div style="height:18px"></div>
    <button class="btn btn-primary btn-block" data-close>Got it</button>`);
}

// Buttons and forms that belong to the core (trackers register their own)
const coreActions = {
  'xp-help': () => xpSheet(),
  'all-ms': () => { showAllMilestones = !showAllMilestones; render(); },
  sound: () => { state.settings.sound = !state.settings.sound; save(); render(); sfx.tap(); },
  backup: () => exportBackup(),
  reset: () => {
    if (confirm('Erase all your data on this device?') && confirm('This cannot be undone. Have you exported a backup?')) {
      localStorage.removeItem(STORE_KEY);
      state = null;
      view = 'home';
      history.replaceState({ v: 'home' }, '');
      animateNext = true;
      render();
    }
  },
};

const coreForms = {
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
};

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

function questRow(q) {
  const meta = q.done ? 'Completed'
    : q.limit ? (!q.valid ? 'Log 3+ expenses to qualify' : q.ok ? 'On track until Sunday' : 'Over the limit')
    : '';
  return `<div class="quest ${q.done ? 'done' : ''}">
    <div class="q-top"><div class="c">${q.done ? icon('tick') : ''}</div><div class="q-text">${q.text}</div><div class="q-xp">+${QUEST_XP} XP</div></div>
    <div class="bar ${q.limit && q.val > q.limit ? 'warn' : ''}"><i style="width:${q.pct * 100}%"></i></div>
    <div class="q-meta"><span>${meta}</span><span>${q.label}</span></div>
  </div>`;
}

function questsCard(ws) {
  return `<section class="panel">${ws.list.map(questRow).join('')}
    <div class="q-foot"><span>Complete all ${ws.list.length}</span><b>${ws.chest ? 'Bonus earned' : `+${CHEST_XP} XP bonus`}</b></div></section>`;
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
      <button class="small-btn" data-act="xp-help">How XP works ${icon('chevR')}</button>
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
    kicker: 'Last week', title: `${s.done} of ${s.list.length} quests`, icon: 'trophy',
    text: s.chest ? 'A full week. Bonus earned. New quests are ready.' : 'New quests are ready for this week.',
    xp: s.done * QUEST_XP + (s.chest ? CHEST_XP : 0),
  }]);
}
