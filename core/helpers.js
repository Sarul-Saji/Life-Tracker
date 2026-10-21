'use strict';
/* COMPOUND · core/helpers.js
   Small shared helpers: money and date formatting, banking-style number inputs, icons. */

const $ = (sel, root = document) => root.querySelector(sel);
const inr = n => '₹' + Math.round(n).toLocaleString('en-IN');
const lakh = n => {
  const a = Math.abs(n);
  if (a >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr';
  if (a >= 1e5) return '₹' + (n / 1e5).toFixed(2) + ' L';
  return inr(n);
};
const gbp = n => {
  const a = Math.round(Math.abs(n) * 100) / 100;
  const s = a.toLocaleString('en-GB', { minimumFractionDigits: Number.isInteger(a) ? 0 : 2, maximumFractionDigits: 2 });
  return (n < -0.004 ? '−' : '') + '£' + s;
};
const num = s => Number(String(s).replace(/[^0-9.]/g, ''));

// Money inputs work like a banking app: type digits only, and the decimal point / commas fill in for you.
// gbp: 1250 → 12.50 · inr: 50000 → 50,000 · rate: 999 → 9.99
const MONEY_FMT = {
  gbp: d => (Number(d) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  rate: d => (Number(d) / 100).toFixed(2),
  inr: d => Number(d).toLocaleString('en-IN'),
  int: d => Number(d).toLocaleString('en-GB'),
  kg: d => (Number(d) / 10).toFixed(1),
};
const MONEY_SCALE = { inr: 1, int: 1, kg: 10 };
const moneyValue = (kind, n) => (n === '' || n == null || isNaN(n) ? '' : MONEY_FMT[kind](Math.round(n * (MONEY_SCALE[kind] ?? 100))));
const moneyAttrs = (kind, value = '') => `data-money="${kind}" inputmode="numeric" autocomplete="off" value="${moneyValue(kind, value)}"`;
function setMoney(input, digits) {
  digits = String(digits).replace(/\D/g, '').replace(/^0+/, '').slice(0, 10);
  input.value = digits ? MONEY_FMT[input.dataset.money](digits) : '';
  const end = input.value.length;
  try { input.setSelectionRange(end, end); } catch { /* some input types don't support it */ }
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
const sum = (arr, f) => arr.reduce((t, x) => t + (f(x) || 0), 0);
const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => toISO(new Date());
const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + Math.round(n)); return x; };
const dayOfTs = ts => toISO(new Date(ts));
const ymNow = () => todayISO().slice(0, 7);
const ymAdd = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const ymLabel = (ym, opts = { month: 'long', year: 'numeric' }) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-GB', opts); };
const ymLastDay = ym => { const [y, m] = ym.split('-').map(Number); return toISO(new Date(y, m, 0)); };
const weekStart = iso => { const d = parseISO(iso); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return toISO(d); };
const weekIndex = wk => Math.round(parseISO(wk).getTime() / 6048e5);
const fmtMonth = d => isNaN(d) ? 'Never' : d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
const fmtDay = d => (typeof d === 'string' ? parseISO(d) : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDayShort = iso => parseISO(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const dur = m => !isFinite(m) ? 'never' : m < 12 ? `${m.toFixed(1)} months` : `${(m / 12).toFixed(1)} years`;
const daysSince = iso => iso ? (Date.now() - parseISO(iso)) / 864e5 : Infinity;
const ordinal = n => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

const ICONS = {
  bank: '<path d="M3 10 12 4l9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8"/><path d="M3 20h18"/>',
  card: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h3"/>',
  bowl: '<path d="M4 11h16a8 8 0 0 1-16 0Z"/><path d="M12 4v4M8.5 5.5l1 2.5M15.5 5.5l-1 2.5"/>',
  dumbbell: '<path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/>',
  check: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/>',
  tick: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>',
  chevR: '<path d="m9 6 6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  bolt: '<path d="M13 3 5 13h6l-1 8 8-10h-6l1-8Z"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  sync: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"/>',
  flame: '<path d="M12 21c-3.9 0-7-2.7-7-6.5 0-3.5 3-5.5 4-9 1.5 1.5 2 3 2 4.5 1-1 1.8-2.2 2-3.5 2.5 2 4 4.8 4 8 0 3.8-3.1 6.5-5 6.5Z"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0Z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8"/>',
  send: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  leaf: '<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15"/><path d="M5 19 13 11"/>',
  home: '<path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/>',
  basket: '<path d="M4 9h16l-1.5 10h-13Z"/><path d="M9 9l3-5 3 5"/>',
  bag: '<path d="M6 8h12l-1 12H7Z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
  fork: '<path d="M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 1-3 4-3 7h3v11"/>',
  train: '<rect x="6" y="3" width="12" height="14" rx="3"/><path d="M6 11h12M9 21l1.5-4M15 21l-1.5-4"/>',
  repeat: '<path d="M4 9h13l-3-3M20 15H7l3 3"/>',
  tag: '<path d="M3 12V4h8l9 9-8 8Z"/><circle cx="7.5" cy="8" r="1"/>',
  ticket: '<path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4Z"/><path d="M14 7v2M14 11v2M14 15v2"/>',
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10Z"/>',
  plane: '<path d="M3 13l18-7-7 16-2.5-6.5Z"/>',
  gift: '<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M12 9v11M4 13h16M12 9c-2-4-6-3-5-1 .7 1.4 5 1 5 1Zm0 0c2-4 6-3 5-1-.7 1.4-5 1-5 1Z"/>',
  dots: '<circle cx="6" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18" cy="12" r="1"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 12h18"/>',
  coins: '<ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  bottle: '<path d="M10 3h4v3l2 3v11a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9l2-3Z"/><path d="M8 13h8"/>',
  cap: '<path d="M2 9l10-5 10 5-10 5Z"/><path d="M6 11v5c2 2 10 2 12 0v-5M22 9v6"/>',
  passport: '<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M9 16h6"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.8"/>',
  glass: '<path d="M8 3h8l-.5 6a3.5 3.5 0 0 1-7 0Z"/><path d="M12 12.5V20M8.5 20h7"/>',
  tin: '<ellipse cx="12" cy="9" rx="8" ry="3"/><path d="M4 9v5c0 1.7 3.6 3 8 3s8-1.3 8-3V9"/>',
  vape: '<rect x="9" y="8" width="6" height="13" rx="2"/><path d="M11 8V5h2v3M12 12v3M10 3c.7-.7 1.3-.7 2 0s1.3.7 2 0"/>',
};
const icon = name => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.dots}</svg>`;
const LOGO = `<svg class="logo" viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" rx="22" fill="var(--ink)"/><path d="M24 74H76" stroke="var(--muted)" stroke-width="2" stroke-linecap="round"/><path d="M24 70C50 70 62 60 72 30" fill="none" stroke="var(--gold)" stroke-width="3.5" stroke-linecap="round"/><circle cx="72" cy="30" r="4.5" fill="var(--bg)"/></svg>`;
