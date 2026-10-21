'use strict';
/* COMPOUND · core/motion.js
   The moving parts of the theme: cascades when a screen opens, numbers counting up,
   bars and rings filling, the activity grid popping in, scroll reveals, tap ripples
   and the floating "+XP". The looks live in base.css; this file only starts them.
   Phones with "Remove animations" switched on skip all of it. */
const calm = matchMedia('(prefers-reduced-motion: reduce)');

// Called by render() after a screen is drawn fresh (navigation or start-up)
function motionIn(view) {
  if (!view || calm.matches) return;
  [...view.children].forEach((el, i) => el.style.setProperty('--i', Math.min(i, 12)));
  view.querySelectorAll('.tracker').forEach((el, i) => el.style.setProperty('--i', i));
  view.querySelectorAll('.grid-act').forEach(g => [...g.children].forEach((sq, i) => sq.style.setProperty('--i', i)));
  view.querySelectorAll('.tr-amount, .hero-amount, .statgrid .v, .mom .mult, .big').forEach(countUp);
  view.querySelectorAll('.bar > i').forEach(fillFromZero);
  view.querySelectorAll('circle[stroke-dasharray]').forEach(ringFromEmpty);
  revealOnScroll(view);
  // Safety net: if the phone skipped frames, never leave a screen half-faded
  setTimeout(() => view.classList.remove('enter'), 1800);
}

// Count the first number inside an element up from zero, keeping its £/₹, commas and decimals
function countUp(el) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode()) && !/\d/.test(node.nodeValue));
  if (!node) return;
  const m = node.nodeValue.match(/^([^\d]*?)(\d[\d,]*(?:\.\d+)?)([\s\S]*)$/);
  if (!m) return;
  const raw = m[2], target = Number(raw.replace(/,/g, ''));
  if (!isFinite(target) || target === 0) return;
  const dp = (raw.split('.')[1] || '').length, commas = raw.includes(',');
  const indian = /\d,\d\d,\d{3}/.test(raw) || /₹/.test(el.textContent);
  const fmt = v => commas ? v.toLocaleString(indian ? 'en-IN' : 'en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp }) : v.toFixed(dp);
  const t0 = performance.now(), ms = 1100;
  const step = t => {
    const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 4);
    node.nodeValue = m[1] + (k < 1 ? fmt(target * e) : raw) + m[3];
    if (k < 1) requestAnimationFrame(step);
  };
  node.nodeValue = m[1] + fmt(0) + m[3];
  requestAnimationFrame(step);
  setTimeout(() => { node.nodeValue = m[1] + raw + m[3]; }, ms + 150);   // lands on the real number even if frames were skipped
}

function fillFromZero(bar) {
  const w = bar.style.width;
  if (!w) return;
  bar.style.width = '0';
  requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = w; }));
}

function ringFromEmpty(c) {
  const off = c.getAttribute('stroke-dashoffset');
  if (off == null) return;
  c.style.transition = c.style.transition || 'stroke-dashoffset 1.4s cubic-bezier(.2, .75, .2, 1)';
  c.setAttribute('stroke-dashoffset', c.getAttribute('stroke-dasharray'));
  requestAnimationFrame(() => requestAnimationFrame(() => c.setAttribute('stroke-dashoffset', off)));
}

// Blocks below the fold wait, then glide in as they scroll into view
let revealer = null;
function revealOnScroll(view) {
  if (!('IntersectionObserver' in window)) return;
  revealer?.disconnect();
  revealer = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); revealer.unobserve(e.target); }
  }), { rootMargin: '0px 0px -8% 0px' });
  [...view.children].forEach(el => {
    if (el.getBoundingClientRect().top > innerHeight) {
      el.style.animation = 'none';
      el.classList.add('rv');
      revealer.observe(el);
    }
  });
}

// A golden "+60 XP" that floats up from where you tapped (or mid-screen)
function xpFloat(msg, el) {
  const m = String(msg).replace(/<[^>]+>/g, '').match(/\+[\d,]+ XP/);
  if (!m || calm.matches) return;
  const b = el?.getBoundingClientRect?.(), f = document.createElement('div');
  f.className = 'xp-float';
  f.textContent = m[0];
  f.style.left = (b ? b.left + b.width / 2 : innerWidth / 2) + 'px';
  f.style.top = (b ? b.top : innerHeight * 0.42) + 'px';
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 1700);
}

// Soft ripple from the exact spot you touch
const RIPPLE = '.tracker, .notice, .btn, .icon-btn, .chip, .purpose, .soon, button.kv, label.kv, button.level-line';
document.addEventListener('pointerdown', e => {
  const t = e.target.closest?.(RIPPLE);
  if (!t || calm.matches) return;
  const b = t.getBoundingClientRect(), r = document.createElement('span');
  r.className = 'rip';
  r.style.left = (e.clientX - b.left) + 'px';
  r.style.top = (e.clientY - b.top) + 'px';
  t.appendChild(r);
  setTimeout(() => r.remove(), 750);
}, { passive: true });

// The background glows drift a little as you scroll (parallax)
// and any block still waiting to be revealed shows once it's on screen, even if the observer missed it
addEventListener('scroll', () => {
  document.body.style.setProperty('--sy', scrollY);
  document.querySelectorAll('.rv:not(.in)').forEach(el => { if (el.getBoundingClientRect().top < innerHeight) el.classList.add('in'); });
}, { passive: true });
