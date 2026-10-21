'use strict';
/* COMPOUND · core/ui.js
   Shared UI: drawing the current screen, navigation, building blocks (kv rows, notices, rings),
   pop-up sheets, rewards, toasts, sounds, haptics and confetti. */

function render() {
  const app = $('#app');
  if (!state) app.innerHTML = welcomeView();
  else {
    const screens = { home: homeView, profile: profileView };
    TRACKERS.forEach(t => Object.assign(screens, t.views));
    const owner = TRACKERS.find(t => t.needsData?.[view]);
    if (owner && !owner.needsData[view]()) view = 'home';
    app.innerHTML = (screens[view] || homeView)();
  }
  if (animateNext) { app.firstElementChild?.classList.add('enter'); animateNext = false; }
  if (state) TRACKERS.forEach(t => t.onRender?.());
}

function go(next) {
  view = next;
  animateNext = true;
  TRACKERS.forEach(t => t.onEnter?.(next));
  history.pushState({ v: next }, '');
  render();
  scrollTo(0, 0);
}

const topNav = title => `<nav class="topnav">
  <button class="icon-btn" data-back aria-label="Back">${icon('chevL')}</button>
  <span class="title">${title}</span><span class="spacer"></span></nav>`;

const kv = (k, v, sub = '', cls = '') =>
  `<div class="kv"><span class="k">${k}</span><span class="v ${cls}"><span class="stack">${v}${sub ? `<small>${sub}</small>` : ''}</span></span></div>`;

const notice = (act, text, dotColor = 'var(--warn)', extra = '') =>
  `<button class="notice" data-act="${act}" ${extra}><span class="dot" style="background:${dotColor}"></span><span>${text}</span>${icon('chevR')}</button>`;

function ring(frac, size) {
  const sw = size > 60 ? 2.5 : 2, c = size / 2, r = c - sw, len = 2 * Math.PI * r;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${sw}"/>
    <circle class="prog" cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--gold)" stroke-width="${sw}" stroke-linecap="round"
      stroke-dasharray="${len}" stroke-dashoffset="${len * (1 - frac)}"/></svg>`;
}

let sheetOnClose = null;
function openSheet(html, { center = false, onClose = null } = {}) {
  sheetOnClose = onClose;
  $('#modal-root').innerHTML = `<div class="backdrop ${center ? 'center' : ''}"><div class="sheet" role="dialog">${center ? '' : '<div class="grip"></div>'}${html}</div></div>`;
}
function closeSheet() {
  $('#modal-root').innerHTML = '';
  const cb = sheetOnClose;
  sheetOnClose = null;
  cb && cb();
}
const sheetButtons = label => `<div class="sheet-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary">${label}</button></div>`;

function showRewards(list) {
  const r = list.shift();
  if (!r) return;
  r.level ? sfx.level() : sfx.chime();
  haptic([12, 40, 12]);
  confetti(null, 50);
  openSheet(`
    <div class="reward-kicker">${r.kicker}</div>
    <div class="reward-mark">${icon(r.icon || 'star')}</div>
    <div class="reward-title">${r.title}</div>
    ${r.text ? `<p class="reward-text">${r.text}</p>` : ''}
    <div class="reward-xp">${r.xp ? `+${r.xp.toLocaleString('en-IN')} XP` : ''}</div>
    <button class="btn btn-primary btn-block" data-close>Continue</button>`,
    { center: true, onClose: () => setTimeout(() => showRewards(list), 250) });
}

/* Celebrations */
const xpLabel = e => `+${e.xp} XP${e.mult > 1 ? ` ×${e.mult.toFixed(1)}` : ''}`;

// Celebrate an action: sound, haptics, toast, then any rewards it unlocked
function finishAction(g0, msg, { big = false, el = null } = {}) {
  const g1 = globalStats();
  if (!g0.today && g1.today) msg += ` · day ${g1.streak} of momentum`;
  if (big) { sfx.chime(); haptic([15, 50, 30]); confetti(el, 60); }
  else { sfx.soft(); haptic(15); }
  toast(msg, big ? 5500 : 3500);
  const rewards = rewardsBetween(g0, g1);
  if (rewards.length) setTimeout(() => showRewards(rewards), big ? 1300 : 800);
}

function toast(msg, ms = 3500) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = msg;
  $('#toasts').appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, ms);
}

function countTo(el, from, to, ms = 1200) {
  const t0 = performance.now();
  const step = t => {
    const k = Math.min(1, (t - t0) / ms), eased = 1 - Math.pow(1 - k, 3);
    el.textContent = inr(from + (to - from) * eased);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function haptic(pattern) { try { navigator.vibrate && navigator.vibrate(pattern); } catch { /* not supported */ } }

let actx = null;
function tone(freq, len, type = 'sine', vol = 0.05, when = 0) {
  if (!state || !state.settings.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime + when, o = actx.createOscillator(), g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(actx.destination);
    o.start(t);
    o.stop(t + len + 0.05);
  } catch { /* audio not available */ }
}
const sfx = {
  tap: () => tone(880, 0.06, 'sine', 0.03),
  soft: () => { tone(659.25, 0.35, 'sine', 0.05); tone(987.77, 0.45, 'sine', 0.035, 0.07); },
  chime: () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.7, 'sine', 0.05, i * 0.085)),
  level: () => [392, 523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, 0.8, 'triangle', 0.035, i * 0.1)),
};

const fx = $('#fx'), ctx = fx.getContext('2d');
let parts = [], running = false;
function sizeFx() {
  const r = window.devicePixelRatio || 1;
  fx.width = innerWidth * r;
  fx.height = innerHeight * r;
  ctx.setTransform(r, 0, 0, r, 0, 0);
}
function confetti(el, n = 50) {
  const css = getComputedStyle(document.documentElement);
  const colors = ['--accent', '--gold', '--ink', '--warn'].map(v => css.getPropertyValue(v).trim());
  const b = el ? el.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 3, width: 0, height: 0 };
  const x = b.left + b.width / 2, y = b.top + b.height / 2;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3, sp = 4 + Math.random() * 7;
    parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, w: 2 + Math.random() * 2.5, h: 6 + Math.random() * 6,
      c: colors[i % colors.length], r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.25 });
  }
  if (!running) { running = true; requestAnimationFrame(tick); }
}
function tick() {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  for (const p of parts) {
    p.vy += 0.16; p.vx *= 0.98; p.vy *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life -= 0.009;
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.4));
    ctx.fillStyle = p.c;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.r);
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r)));
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  parts = parts.filter(p => p.life > 0 && p.y < innerHeight + 40);
  if (parts.length) requestAnimationFrame(tick);
  else { running = false; ctx.clearRect(0, 0, innerWidth, innerHeight); }
}
