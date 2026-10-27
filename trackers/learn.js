'use strict';
/* COMPOUND · trackers/learn.js
   Learn: the owner's "how to build a real app" syllabus, taught in the "Compound: Learn how apps work" chat.
   Read-only on the phone: progress lives in this file, not in saved data.
   After each lesson the learning chat ticks the level in LEARN_DONE, adds new words to LEARN_WORDS and uploads. */

// Passed levels → date passed
const LEARN_DONE = {
  '0-1': '2026-10-27',
};

// Words unlocked so far, in the order learned
const LEARN_WORDS = [
  ['HTML', 'The skeleton of a screen: what is on it.'],
  ['CSS', 'The looks: colours, sizes, layout, dark mode.'],
  ['JavaScript', 'The brain: what happens when you tap things.'],
  ['Manifest', 'The "app costume": name, icon, no address bar.'],
  ['Service worker', 'A helper that keeps saved copies so the app opens offline.'],
  ['PWA', 'A website you can install like an app.'],
  ['localStorage', 'The browser drawer where Compound keeps your data.'],
  ['Site data', "Everything Chrome stores for one website: cache, cookies, localStorage."],
  ['Cache', "Saved copies of the app's files, so it loads fast or offline."],
  ['Cookies', 'Tiny notes a website reads and sends back to its server.'],
];

const LEARN_WORLDS = [
  { n: 0, name: 'How Compound works today', goal: 'Open any Compound file and roughly say what it does.', levels: [
    ['0-1', 'What happens when you tap the icon', 'Files vs data, the shopping list in index.html, where your data lives.'],
    ['0-2', 'HTML: the skeleton of a screen', 'Tags, buttons, lists and how a screen is described in text.'],
    ['0-3', 'CSS: how things get their look', 'Colours, spacing, layout, dark and light mode, phone-sized screens.'],
    ['0-4', 'JavaScript: how buttons do things', 'Variables, functions, events: what runs when you tap "Add".'],
    ['0-5', 'Where your data lives', 'Saving and loading, the data shape, upgrades that keep old data safe, backups.'],
    ['0-6', 'Git and GitHub', 'Versions, commits, pushing, and why several sessions can work at once.'],
    ['0-7', 'Hosting', 'Domains, servers and how GitHub Pages puts files on the internet.'],
    ['0-8', 'PWA and offline', 'The manifest, the service worker and how updates reach your phone.'],
    ['0-9', 'How Compound is organised', 'The engine, trackers that plug in, and why code is split into files.'],
    ['0-B', 'Boss: tap to saved', 'Explain the full journey from tapping "Add expense" to it being saved.'],
  ]},
  { n: 1, name: 'Give Compound a backend', goal: 'Understand how almost every real app is connected behind the scenes.', levels: [
    ['1-1', 'Client and server', 'Your phone asks, a computer somewhere answers. Who does what.'],
    ['1-2', 'APIs and JSON', 'How apps talk to servers: requests, responses and the format they use.'],
    ['1-3', 'Databases', 'Tables, rows and why a database beats a file for many users.'],
    ['1-4', 'Accounts and sign-in', 'Passwords, sessions, tokens, "Sign in with Google".'],
    ['1-5', 'Picking a backend service', 'Supabase and Firebase compared, free tiers and real costs.'],
    ['1-6', 'Security basics', 'HTTPS, secret keys, and making sure people only see their own data.'],
    ['1-7', 'Sync and offline', 'Keeping phone and cloud in step, and what happens when they disagree.'],
    ['1-8', 'Moving real data safely', 'Migrating your data to the cloud without losing anything.'],
    ['1-B', 'Boss: Compound in the cloud', 'Sign in on a new phone and see all your data.'],
  ]},
  { n: 2, name: 'Let one other person use it', goal: 'Have a real user who is not you.', levels: [
    ['2-1', 'Many users, one app', 'Separating everyone\'s data and privacy rules in the database.'],
    ['2-2', 'Testing on other devices', 'Different phones, browsers and screen sizes.'],
    ['2-3', 'Bugs and error reports', 'Finding out what broke on someone else\'s phone.'],
    ['2-4', 'Feedback and analytics', 'Learning what people use, while respecting privacy.'],
    ['2-5', 'Releasing updates safely', 'Test copies, version numbers and rolling back a bad update.'],
    ['2-6', 'The legal basics', 'Privacy policies and UK data rules (GDPR) in plain words.'],
    ['2-B', 'Boss: a friend\'s week', 'Someone else uses Compound for a week and you fix what they hit.'],
  ]},
  { n: 3, name: 'Put it in the Play Store', goal: 'Ship an app people can download.', levels: [
    ['3-1', 'Web, native and hybrid apps', 'The three ways to build an app and when each makes sense.'],
    ['3-2', 'Wrapping a web app for Android', 'Turning Compound into a Play Store app.'],
    ['3-3', 'Developer accounts', 'Google Play Console, Apple Developer, fees and identity checks.'],
    ['3-4', 'The store listing', 'Icon, screenshots, description and how people find apps.'],
    ['3-5', 'Signing, versions and review', 'Proving the app is yours, and getting through review.'],
    ['3-6', 'iPhone and the App Store', 'What is different on Apple and what it costs.'],
    ['3-7', 'Notifications', 'Reminders and alerts: how push notifications work.'],
    ['3-B', 'Boss: live on Google Play', 'Compound installs from the Play Store.'],
  ]},
  { n: 4, name: 'Your first real public app', goal: 'Build, launch and run an app for strangers.', levels: [
    ['4-1', 'An idea people need', 'Finding a real problem and checking people want it before building.'],
    ['4-2', 'Design and user flows', 'Sketching screens and journeys before any code.'],
    ['4-3', 'Choosing the tools', 'Picking a tech stack, and frameworks like React in plain words.'],
    ['4-4', 'Building with AI like a pro', 'Clear briefs, reviewing what Claude builds, debugging and testing.'],
    ['4-5', 'The first version (MVP)', 'The smallest app worth launching.'],
    ['4-6', 'Payments and subscriptions', 'Taking money safely and the fees involved.'],
    ['4-7', 'Launch and marketing', 'Getting the first 100 users.'],
    ['4-8', 'Running it', 'Support, reviews, costs as you grow, and what to build next.'],
    ['4-B', 'Final boss: launch', 'Your own app, live, with real users.'],
  ]},
];

const LEARN_ALL = LEARN_WORLDS.flatMap(w => w.levels.map(l => ({ id: l[0], title: l[1], about: l[2], world: w.n })));
const learnNext = () => LEARN_ALL.find(l => !LEARN_DONE[l.id]);
const learnDone = list => list.filter(l => LEARN_DONE[l[0] ?? l.id]).length;

function learnCard() {
  const done = learnDone(LEARN_ALL), next = learnNext();
  return `<button class="tracker" data-go="learn">
      <div class="tr-top">${icon('cap')}<span class="grow">Learn</span>${icon('chevR')}</div>
      <div class="tr-amount">${done}<span class="of"> of ${LEARN_ALL.length} levels</span></div>
      <div class="tr-sub">${next ? `Up next · ${next.id} ${esc(next.title)}` : 'Every level passed'}</div>
      <div class="ln-bar"><i style="width:${(done / LEARN_ALL.length) * 100}%"></i></div>
    </button>`;
}

function learnView() {
  const done = learnDone(LEARN_ALL), next = learnNext(), pct = Math.round((done / LEARN_ALL.length) * 100);
  const worlds = LEARN_WORLDS.map(w => {
    const d = learnDone(w.levels), open = next ? next.world === w.n : false;
    const rows = w.levels.map(([id, title, about]) => {
      const when = LEARN_DONE[id], cur = next?.id === id;
      return `<div class="ln-level ${when ? 'on' : ''} ${cur ? 'cur' : ''}">
        <span class="c">${when ? icon('tick') : ''}</span>
        <div class="grow"><div class="n"><b>${id}</b> ${esc(title)}</div><div class="d">${esc(about)}</div>
          ${when ? `<div class="d">Passed ${fmtDay(when)}</div>` : cur ? '<div class="d ln-now">Up next</div>' : ''}</div></div>`;
    }).join('');
    return `<details class="panel ln-world" ${open ? 'open' : ''}>
      <summary><div class="grow"><div class="eyebrow">World ${w.n}</div><div class="ln-wname">${esc(w.name)}</div></div>
        <span class="ln-count">${d} / ${w.levels.length}</span></summary>
      <p class="ln-goal">Goal: ${esc(w.goal)}</p>${rows}</details>`;
  }).join('');
  return `<div>
    ${topNav('Learn')}
    <section class="hero">
      <div class="eyebrow">Levels passed</div>
      <div class="hero-amount">${done}<span class="of"> of ${LEARN_ALL.length}</span></div>
      <div class="ln-bar"><i style="width:${pct}%"></i></div>
      <div class="hero-meta"><span>${pct}% of the way</span><span>${LEARN_WORDS.length} words learned</span></div>
    </section>
    ${next ? `<div class="section-title"><span>Up next</span></div>
    <section class="panel pad ln-next"><div class="eyebrow">World ${next.world} · Level ${next.id}</div>
      <div class="ln-wname">${esc(next.title)}</div><p class="d">${esc(next.about)}</p>
      <p class="hint">Lessons happen in the "Compound: Learn how apps work" chat. Each one: a short lesson, a quest, then a boss question.</p></section>` : ''}
    <div class="section-title"><span>Syllabus</span></div>
    ${worlds}
    <div class="section-title"><span>Words learned</span><span>${LEARN_WORDS.length}</span></div>
    <section class="panel">${LEARN_WORDS.map(([w, m]) => `<div class="kv"><span class="k">${esc(w)}</span><span class="v">${esc(m)}</span></div>`).join('')}</section>
  </div>`;
}

registerTracker({
  id: 'learn',
  order: 90,
  cardOrder: 90,
  views: { learn: learnView },
  card: learnCard,
});
