'use strict';
/* COMPOUND · core/main.js
   Loads last: wires taps, forms and typing to the core and to whichever tracker owns them, then starts the app. */

function act(name, el) {
  const fn = coreActions[name] || TRACKERS.find(t => t.actions?.[name])?.actions[name];
  if (fn) fn(el, el.dataset);
}

addEventListener('resize', sizeFx);
sizeFx();

document.addEventListener('click', ev => {
  const t = ev.target;
  if (t.classList.contains('backdrop') || t.closest('[data-close]')) return closeSheet();
  const el = t.closest('[data-go],[data-back],[data-act],[data-soon]');
  if (!el) return;
  if (el.dataset.go) return go(el.dataset.go);
  if ('back' in el.dataset) return history.back();
  if (el.dataset.soon) { sfx.tap(); return toast(`<b>${el.dataset.soon}</b> arrives in a coming update.`); }
  act(el.dataset.act, el);
});

document.addEventListener('submit', ev => {
  ev.preventDefault();
  const id = ev.target.id;
  const fn = coreForms[id] || TRACKERS.find(t => t.forms?.[id])?.forms[id];
  fn?.(ev.target);
});

// Money inputs: digits go in from the right; backspace removes the last digit
document.addEventListener('beforeinput', ev => {
  const el = ev.target;
  if (!el.dataset?.money) return;
  const digits = el.value.replace(/\D/g, '');
  const all = el.value && el.selectionStart === 0 && el.selectionEnd === el.value.length;
  if (ev.inputType === 'insertText' && ev.data) setMoney(el, (all ? '' : digits) + ev.data);
  else if (ev.inputType === 'deleteContentBackward') setMoney(el, all ? '' : digits.slice(0, -1));
  else return;   // paste and anything else: let it happen, then clean it up on 'input'
  ev.preventDefault();
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
// Keep the cursor at the end, where new digits arrive
document.addEventListener('focusin', ev => {
  const el = ev.target;
  if (el.dataset?.money) setTimeout(() => { try { el.setSelectionRange(el.value.length, el.value.length); } catch { /* ignore */ } }, 0);
});

document.addEventListener('input', ev => {
  if (ev.target.dataset?.money) setMoney(ev.target, ev.target.value);
  TRACKERS.forEach(t => t.onInput?.(ev));
});
document.addEventListener('change', ev => {
  if (ev.target.id === 'f-import' && ev.target.files[0]) importBackup(ev.target.files[0]);
  TRACKERS.forEach(t => t.onChange?.(ev));
});

// Android's back button / gesture moves between screens instead of closing the app
addEventListener('popstate', ev => {
  if ($('#modal-root').innerHTML) { sheetOnClose = null; $('#modal-root').innerHTML = ''; }
  view = ev.state?.v || 'home';
  animateNext = true;
  render();
});

load();
history.replaceState({ v: 'home' }, '');
render();
if (state) setTimeout(() => { TRACKERS.forEach(t => t.onStart?.()); weeklyRecap(); }, 700);
// Coming back to the app (it may have stayed open in the background)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state) TRACKERS.forEach(t => t.onResume?.());
});

// Offline support + "install as app" (only works on a real web address)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js');
// Ask the phone not to auto-delete saved data
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
