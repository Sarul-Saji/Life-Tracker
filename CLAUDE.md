# Compound — project rulebook

Compound is a personal, gamified life tracker: an installable web app (PWA) on the owner's Android phone,
hosted on GitHub Pages at https://sarul-saji.github.io/Life-Tracker/ (repo: github.com/Sarul-Saji/Life-Tracker, branch `main`).
Plain HTML/CSS/JS — no build step, no frameworks, no npm. Every push to `main` goes live in about a minute.

## Who you're working with
- The owner is **not a programmer**. Explain in plain words, step by step, and be brutally honest about trade-offs.
- They live in London (paid in GBP), have an Indian student loan (INR), work long hospitality shifts.
- Several Claude sessions may work on this folder **at the same time**. Follow the ownership and Git rules below.

## Architecture
```
index.html            loads everything; one <link> + one <script> line per tracker
core/                 the shared engine — owned by the "Compound: main build" session
  helpers.js          formatting, dates, icons, banking-style number inputs (data-money)
  state.js            load/save/upgrade of the single saved state (localStorage key 'lifequest.v1' — NEVER change it)
  game.js             tracker registry + XP, momentum, weekly quests, milestones, levels
  ui.js               render(), go(), kv/notice/ring building blocks, sheets, toasts, sounds, confetti
  home.js             Home, Profile, XP guide, backups, weekly recap, SOON placeholders
  main.js             event wiring + start-up (loads last)
  base.css            shared design tokens and components (affects every screen)
trackers/             one self-contained tracker per file pair
  money.js / .css     Money (£): income, spending, budgets, India transfers, month close, treat fund
  loan.js  / .css     Student loan (₹): EMIs (auto-logged), extra payments, payoff plan
  health.js / .css    Health: food, water, gym, shift rota, fuel score
sw.js                 offline support (network-first)
```
Each tracker calls `registerTracker({...})` once (see the comment at the top of `core/game.js` for every hook:
views, card, notices, actions, forms, activity, xp, stats, quests, questSlots, weekData, milestones, xpRows, migrate…).
Trackers talk to the core only through those hooks and the shared helpers. All files are classic scripts sharing one
global scope, so **top-level names must be unique across all files** (prefix new tracker-specific names if unsure).

## Session ownership (who may edit what)
| Session | May edit |
|---|---|
| Compound: main build | `core/*`, `index.html`, `sw.js`, `manifest.json`, `icons/`, `CLAUDE.md`, cross-tracker changes |
| Compound: Money and Loan | `trackers/money.*`, `trackers/loan.*` (they are coupled: "Loan extra" transfers call `makeLoanEntry`) |
| Compound: Health | `trackers/health.*` |
| Compound: Care (Akansha) | `trackers/care.*` |
| Compound: Flow | `trackers/flow.*` |
| Compound: To-do | `trackers/todo.*` |

- Only edit files your session owns. If you need a change in `core/` or another tracker, **stop and ask the owner
  to request it in "Compound: main build"** (describe exactly what's needed).
- Adding a brand-new tracker is the one allowed shared edit: add its two lines to `index.html` (see below).
- Never change `BASE_SLOTS` in `core/game.js` or existing milestone/quest ids: past weeks' quests and earned XP depend on them.

## Data safety (the owner's real data lives on their phone)
- Saved data must always survive updates. When a tracker's data shape changes, add a `migrate(s)` step that upgrades
  old data in place — never delete or reset existing fields.
- Never upload private files. `.gitignore` blocks PDFs, spreadsheets and backups; the owner's loan statement sits in this folder.
- Never put personal numbers (loan amounts, account numbers, weight, etc.) in the code. Users type them into the app.

## Testing (before every upload)
- Each session runs its **own** local server so test data can't collide (browser storage is per address):
  main build → `life-quest` (port 8765), Money and Loan → `compound-money` (8766), Health → `compound-health` (8767),
  Care → `compound-care` (8768), Flow → `compound-flow` (8769), To-do → `compound-todo` (8770), anything else → `compound-extra` (8771).
  Start it with the preview tools by that name.
- Test in a 375px-wide mobile viewport, light and dark. Check the browser console for errors.
- `.tools/fixture.js` (not uploaded) builds a rich test dataset and snapshots every screen: useful before/after refactors.
- Clear the test data from your local server when done. Never touch the owner's phone data.

## Uploading (Git) — several sessions work at once
**If your session runs in a worktree** (your folder is under `.claude/worktrees/`, on a branch other than `main`):
you have a private copy, so nobody else's edits are in your folder. To publish:
`git add <your files>` → `git commit -F <file>` → `git pull --rebase origin main` → re-test → `git push origin HEAD:main`.
If the rebase reports a conflict in a file you don't own, stop and tell the owner to bring it to "Compound: main build".
Local test data and `.tools/` don't exist in worktrees; that's fine.

**If you work directly in the main folder** (on `main`), other sessions may be editing files next to yours:
1. Stage **only your own files by name**: `git add trackers/health.js trackers/health.css`. **Never `git add -A` or `git add .`**
   — it would upload another session's half-finished work.
2. Commit with a message file: `git commit -F <file>` (PowerShell 5.1 breaks quoted multi-line messages). End messages with
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
3. `git push`. If Git says `index.lock` exists, another session is committing: wait a few seconds and retry.
   If the push is rejected, run `git pull --rebase --autostash`, re-test, push again.
4. If a push needs a GitHub sign-in, run it in the owner's Terminal panel (the browser sign-in can't open from a background shell).
5. Confirm it's live: poll `https://sarul-saji.github.io/Life-Tracker/<your file>` until it shows your change.
   Phones pick it up the next time the app is opened online (close and reopen it fully).

## Adding a new tracker (any new session can do this)
1. Create `trackers/<id>.js` ending with `registerTracker({ id: '<id>', order: <number>, ... })` and `trackers/<id>.css`.
2. Add `<link rel="stylesheet" href="trackers/<id>.css">` and `<script src="trackers/<id>.js"></script>` to `index.html`
   in the marked tracker blocks (scripts must stay before `core/main.js`).
3. Store its data under its own key on the saved state (e.g. `state.care`), created in its setup form; add `migrate(s)` later as needed.
4. If `core/home.js` has a `SOON` placeholder with the same id, it disappears automatically.
5. Give it XP via `award()` + `finishAction()` (see `addHealth` in `trackers/health.js` for the pattern), its own quests via
   `quests` + `questSlots`, and milestones via `ms(...)`.

## Design language
Minimal, warm, classic: paper background, Instrument Serif for big numbers/headings, Inter for text, black/white/grey with
colour only where it carries meaning (blue activity ramp `--a1..4`, validated chart colours `--s1..6`, deep green
accent, gold for XP). Banking-style number inputs (`moneyAttrs()`), bottom sheets for forms, short toasts, no emoji in UI chrome.
