# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A kid-facing math trainer (Ukrainian UI, built for a first-grader) — a single-page vanilla JS web app with no build step, no framework, no package.json, no tests, and no linter. Data persists to Firebase Firestore.

## Running it

Serve the directory statically and open `index.html`:

```bash
python3 -m http.server 8000
```

Internet access is required at runtime: Firebase compat SDK 10.9.0 and Google Fonts load from CDNs, and persistence talks to Firestore. There is no local/offline fallback — without Firebase the login step fails.

There are no build, lint, or test commands. Verification is manual in the browser.

## Deployment

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy-pages.yml`. Feature branches are NOT visible to the user's child — work only reaches the phone once it lands on `main`.

## Files

- `index.html` — every screen is a `<div class="screen">` in this one file (login, menu, submenu, game, completion, calendar, shop, achievements, plus the custom-mix modal). Buttons use inline `onclick` attributes calling global functions. Has no-cache meta tags so the HTML itself always revalidates on the phone.
- `main.js` — all logic (~2300 lines), organized in `// ===== SECTION =====` blocks. No modules, no classes; global functions and a single global `state` object.
- `style.css` — all styles; design tokens (pastel palette, shadows, radii) are CSS custom properties in `:root`.
- `firebase-config.js` — Firebase init; exposes global `db` (Firestore). Client-side keys, intentionally committed.

## Cache busting (easy to forget)

Static assets are referenced with a version query (`style.css?v=30`, `main.js?v=30`, `firebase-config.js?v=30`) in `index.html`. When you change any of these files, bump the `?v=` number on **all three** references so users don't get stale cached scripts.

## Architecture

### State and config

- `state` (top of `main.js`) is the single mutable app state: current mode/problem/round, economy (coins, combo, robloxTime, robuxOwed), daily progress, per-fact stats, history, and the resumable `session` snapshot.
- `CONFIG` is the single source of truth for all tunables: rounds per session, daily-task bonuses, exam pass threshold, Robux exchange rate and daily limit, answer→next pacing delays, save debounce, history cap (400). Tune numbers here, not inline.
- `MODE_META` maps each mode to its label, calendar color, and coin reward per correct answer.

### Screens

`showScreen(id)` toggles the `.screen` divs and stamps `document.body.dataset.screen` so CSS can target the active screen. `goToMenu()` also resets in-game state and timers.

### Auth and persistence

- "Login" is a 4-digit PIN that is literally the Firestore document ID (`users/{pin}`) — no real authentication. The PIN is cached in `localStorage` (`savedPin`) for auto-login.
- The whole user document (coins, daily, achievements, history, stats, activeSession) is rewritten by `saveToFirebase()`.
- `saveGame()` is debounced (`CONFIG.saveDebounceMs`); call `saveGame(true)` for anything involving money or session boundaries so it can't be lost. `visibilitychange`/`beforeunload` flush pending saves.
- `history` is capped at `CONFIG.historyCap` entries to keep the Firestore doc under size limits.

### Session persistence (no restart loophole)

A started 20-question game or exam is snapshotted after every question (`persistSession()` → `activeSession` in Firestore). Pressing "back" does not abandon it: the menu shows a resume banner, and `blockedBySession()` forces the child to finish the active session before starting a new one. Blitz is not resumable.

### Game modes

All modes share the same game screen and `nextProblem()` → answer → `handleResult()` loop. **Answers are always typed on the numpad** — multiple-choice input was removed (leftover `choices-container`/`generateChoices` code is vestigial).

- **addition / subtraction** — adaptive within `maxNum` via `buildAddSubPool()`; each also has a "Через десяток" (crossing tens) variant with a step-by-step decomposition UI (`crossing-*` functions) and a make-ten dots picture. A wrong +/- answer that crosses ten shows a worked `makeTenHint()` that stays until dismissed.
- **plusminus** — mixed addition/subtraction drill (`startPlusMinus()`, no submenu). The +/- family (addition, subtraction, plusminus) also gets a per-question results table on the completion screen (`hasResultsTable`, `state.sessionLog`).
- **multiplication / division** — adaptive: `buildFactPool()` enumerates facts for the chosen tables (2–9, single table, or a custom mix picked in the mix modal), and `pickWeightedFact()` biases selection toward weak facts via `factWeight()` (errors, slowness, and recent misses raise weight; mastered facts drop to 0.25). Division facts are built from multiplication so answers are always whole.
- **logic** — equations with an unknown, or number sequences.
- **blitz** — 60-second timer, mixed add/sub, no round limit.
- **exam** — 100 multiplication questions built by `buildExamQueue()`: all 64 facts (2–9 × 2–9) once plus 36 repeats of the statistically weakest. **No right/wrong feedback during the run** (`handleExamResult` bypasses the normal feedback path), pass = at most `CONFIG.examMaxErrors` (2) mistakes, mistakes are listed on the completion screen and stored in history.
- **goatexam** ("Симулятор екзамену козла" 🐐, a family joke — the prize is a Goat Simulator DLC) — same silent exam pipeline (`isExamMode()` gates it alongside `exam`): 100 add/sub questions within `goatExamMax` (30), 50/50 ±, **all crossing the ten** (`buildGoatExamQueue()`; addition units sum > 10, subtraction requires a borrow — no trivial 2+3/15+1), weighted toward statistically weak facts. Pass ≤ `examMaxErrors`, bonus `goatExamPassBonus` (100). Completion shows the full 100-row results table (with per-question time) plus mistake chips; the history record stores `mistakes` (with op/user/timeMs), `passed`, and `avgMs` for later analysis.

### Adaptivity stats

Every answer is recorded per fact key (`m:3x7`, `a:5+8`, …) in `state.stats` via `recordStat()` — this feeds adaptive problem generation and the exam's repeat selection. Keep fact-key formats stable or existing user stats break.

### Economy (deliberately anti-abuse)

`awardCorrect()` is the single reward pipeline for per-answer rewards: combo, coins per `MODE_META`, achievements, UI, save. Guardrails that exist on purpose — don't "simplify" them away:

- "Завдання дня" is an endless chain of *mode-specific* tasks: each task names a mode from `DAILY_TASK_MODES` (rotation order shifts daily via a date-seeded offset in `dailyTaskMode()`, so the child can't grind one mode), and only a session of THAT mode finished with zero mistakes calls `completeDailyTask()` — the first completed task each day pays `dailyBonus` and grows the streak, repeats pay the smaller `dailyRepeatBonus`, and the next task (next mode) appears immediately (menu panel shows the task number, required mode, and 🏅 medals earned today). Blitz and exam never complete tasks. Any perfect session still triggers `launchFireworks()` (full-screen salute) on the completion screen; a perfect session of the wrong mode gets a toast pointing at the required one. `CONFIG.dailyGoal` is legacy — kept only to migrate old saves' streaks in `handleLogin`.
- ×2 and ×5 dedicated drills award coins only once per day (`easyMultDailyLimit`).
- The exam awards nothing per answer — only a pass bonus at completion.
- The shop trades coins for Robux (`buyRobux`: `robuxRate` coins per 1, capped at `robuxDailyLimit` per day; `robuxOwed` tracks what the parent still owes and delivers manually) and for Roblox minutes (`buyRobloxTime` — the real-world reward the child is playing for).

## Conventions

- **All user-facing text is Ukrainian.** Code comments are a mix of Ukrainian/Russian/English; write new UI strings in Ukrainian.
- Global functions + inline `onclick` in HTML is the established pattern — follow it rather than introducing modules, frameworks, or event-listener refactors.
- The app is designed mobile-first for a child on an iPhone: big touch targets, `user-scalable=no`, playful emoji-heavy UI. Test layout changes at narrow widths.
- Commit messages follow `feat:` / `fix:` prefixes, written in English.
