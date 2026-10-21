'use strict';
/* COMPOUND · core/state.js
   Your data lives ONLY on this device, in the browser storage under one key.
   The key is from the very first version, so updates never lose data. */

const STORE_KEY = 'lifequest.v1';
const DEFAULT_SETTINGS = { sound: true, plan: 50000 };
let state = null;
let view = 'home';
let animateNext = true;

function load() {
  try { state = JSON.parse(localStorage.getItem(STORE_KEY)); } catch { state = null; }
  if (state) state = upgrade(state);
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch { toast('Could not save. Export a backup from your profile.'); }
}
// Older versions stored things slightly differently: bring them up to date
function upgrade(s) {
  if (s.version === 1) s = migrateV1(s);
  s.version = 3;
  s.settings = Object.assign({}, DEFAULT_SETTINGS, s.settings);
  TRACKERS.forEach(t => t.migrate?.(s));   // each tracker upgrades its own part of the data
  return s;
}
function migrateV1(s) {
  return {
    version: 2,
    profile: { name: s.hero.name },
    loan: Object.assign({ name: 'Student loan' }, s.loan, { log: s.log || [] }),
    settings: { sound: s.settings?.sound ?? true, plan: s.settings?.oracle ?? 50000 },
    lastBackup: s.lastBackup || null,
    createdAt: s.createdAt || todayISO(),
  };
}
