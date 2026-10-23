'use strict';
/* COMPOUND · core/home.js
   Home (greeting, notices, tracker cards), Profile with milestones,
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
  const soon = SOON.filter(([id]) => !tracker(id))
    .map(([, ic, label]) => `<button class="soon" data-soon="${label}">${icon(ic)}<div class="name">${label}</div><div class="tag">Coming soon</div></button>`).join('');
  const cards = [...TRACKERS].sort((a, b) => (a.cardOrder ?? a.order ?? 50) - (b.cardOrder ?? b.order ?? 50)).map(t => t.card?.() || '').join('');
  return `<div>
    <header class="home-head">
      <div><div class="date">${today}</div><h1 class="greet">${greeting()},<br>${esc(name)}</h1></div>
      <button class="avatar plain" data-go="profile" aria-label="Profile"><span class="ini">${esc(name[0].toUpperCase())}</span></button>
    </header>
    ${notices.join('')}

    <div class="section-title"><span>Trackers</span></div>
    ${cards}
    ${soon ? `<div class="soon-grid">${soon}</div>` : ''}
  </div>`;
}

// Quests, levels, XP and momentum are hidden from the app (the owner found them clutter).
// XP is still counted quietly in saved data so nothing is lost if they ever come back.
// Trackers still call questStrip(): it now shows nothing.
function questStrip() { return ''; }

// Removes every "+30 XP" style mention a tracker puts on screen or in a toast, so trackers need no changes
const XP_HTML = /\s*·?\s*(?:<b>\s*\+[\d,]+\s*(?:bonus\s*)?XP(?:\s*×[\d.]+)?\s*<\/b>|<small>\s*\+[\d,]+ XP\s*<\/small>|\+[\d,]+\s*(?:bonus\s*)?XP(?:\s*×[\d.]+)?)/g;
const stripXpHtml = html => String(html).replace(XP_HTML, '');
function stripXp(root) {
  if (!root) return;
  root.querySelectorAll('.kv').forEach(r => { if (r.querySelector('.k')?.textContent.trim() === 'Reward') r.remove(); });
  root.querySelectorAll('small, b, span, div').forEach(el => {
    if (!el.children.length && /^\+[\d,]+\s*(bonus\s*)?XP(\s*×[\d.]+)?$/.test(el.textContent.trim())) el.remove();
  });
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n; (n = walk.nextNode());) if (/XP/.test(n.nodeValue)) n.nodeValue = stripXpHtml(n.nodeValue);
}

// Buttons and forms that belong to the core (trackers register their own)
const coreActions = {
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

function profileView() {
  const g = globalStats(), name = state.profile.name;
  const got = new Set(g.unlocked);
  const all = shownMilestones(), done = all.filter(m => got.has(m.id)), todo = all.filter(m => !got.has(m.id));
  const shown = showAllMilestones ? [...done, ...todo] : [...done.slice(-6).reverse(), ...todo.slice(0, 3)];
  const row = m => `<div class="ms ${got.has(m.id) ? 'on' : ''}">
      <div class="c">${got.has(m.id) ? icon('tick') : ''}</div>
      <div><div class="n">${m.name}</div>${m.desc ? `<div class="d">${m.desc}</div>` : ''}</div>
      </div>`;
  return `<div>
    ${topNav('Profile')}
    <section class="profile-head">
      <div class="avatar lg plain"><span class="ini">${esc(name[0].toUpperCase())}</span></div>
      <h1 class="greet">${esc(name)}</h1>
    </section>

    <div class="section-title"><span>Milestones</span><span>${done.length} / ${all.length}</span></div>
    <section class="panel">
      ${shown.map(row).join('')}
      <button class="more" data-act="all-ms">${showAllMilestones ? 'Show less' : `Show all ${all.length}`}</button>
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

// The weekly quest recap is switched off along with quests
function weeklyRecap() {}
