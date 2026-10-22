'use strict';
/* COMPOUND · core/motion.js
   Kept tiny on purpose so the app stays fast on phones: a screen fades in once (CSS .enter)
   and logging shows a floating "+XP". No count-ups, scroll listeners or tap ripples.
   Phones with "Remove animations" switched on skip all of it. */
const calm = matchMedia('(prefers-reduced-motion: reduce)');

// Called by render() after a screen is drawn fresh: drop the fade class once it has played
function motionIn(view) {
  if (view) setTimeout(() => view.classList.remove('enter'), 400);
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
  setTimeout(() => f.remove(), 1300);
}
