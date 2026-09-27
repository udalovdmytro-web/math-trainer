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
- **multiplication / division** — adaptive: `buildFactPool()` enumerates facts for the chosen tables (2–9, single table, or a custom mix picked in the mix modal), and `pickWeightedFact()` biases selection toward weak facts via `factWeight()` (errors, slowness, and recent misses raise weight; mastered facts drop to 0.25). Division facts are built from multiplication so answers are always whole. The multiplier / quotient is **3–9 only** — the trivial `× 2`, `× 10` and `4 ÷ 2` style facts were removed (the full table is 56 facts). The multiplication *exam* has its own queue and is unaffected.
- **logic** — 2 coins per answer. Content is deliberately non-trivial: equations with the unknown in either operand, `+` and `−` (including an unknown minuend, `? − 5 = 12`), numbers up to 30; sequences with step 2–9, ascending *and* descending. **Adaptive by task type**, not by individual problem (there are hundreds): `logicCategories()` defines 8 equation types (4 forms × numbers ≤20 / 21–30, keys `le:<form>:<s|b>`) and 16 sequence types (up/down × step, keys `ls:<up|down>:<step>`); `pickWeightedFact()` picks the type from stats, then the numbers are random within it.
- **blitz** — 60-second timer, no round limit. Problems come from `buildAddSubPool(op, true)`, i.e. **crossing-the-ten only**, same as the rest of the +/- family — without that it was the fastest coin farm in the game.
- **exam** — 100 multiplication questions built by `buildExamQueue()`: all 64 facts (2–9 × 2–9) once plus 36 repeats of the statistically weakest. **No right/wrong feedback during the run** (`handleExamResult` bypasses the normal feedback path), pass = at most `CONFIG.examMaxErrors` (2) mistakes, mistakes are listed on the completion screen and stored in history.
- **goatexam** — shown as «🌷 Тренування на Весну» (it used to be the «Симулятор екзамену козла»; the id stays `goatexam` so history and stats keep working). 100 add/sub questions within `goatExamMax` (30), added/subtracted operand `goatOpMin..goatOpMax` (3–19: 25−8, 8+15, 24−13), 50/50 ±, **all crossing the ten judged by the units digit** (`buildGoatExamQueue()`; addition units sum > 10, subtraction needs a borrow — no 2+3/15+1/26−4/25−15), weighted toward weak facts. Unlike the multiplication exam it is **not silent** (`isSilentExam()` is `exam` only): the normal ✓/✗ feedback runs, and every mistake opens `springHint()` — a step-by-step "how to count it" explanation (tens first, then through the round ten) that stays until dismissed. Still a 100-question queue (`isExamMode()`), no coins per answer, pass ≤ `examMaxErrors` → `goatExamPassBonus` (100). Answers are logged to `state.examResults`, so completion shows the full 100-row table plus mistake chips and history stores `mistakes`, `passed`, `avgMs`.

### Adaptivity stats

Every answer is recorded per fact key (`m:3x7`, `a:5+8`, …) in `state.stats` via `recordStat()` — this feeds adaptive problem generation and the exam's repeat selection. Keep fact-key formats stable or existing user stats break.

### Economy (deliberately anti-abuse)

`awardCorrect()` is the single reward pipeline for per-answer rewards: combo, coins per `MODE_META`, achievements, UI, save. Guardrails that exist on purpose — don't "simplify" them away:

- "Завдання дня" is an endless chain of *mode-specific* tasks: each task names a mode from `DAILY_TASK_MODES` (rotation order shifts daily via a date-seeded offset in `dailyTaskMode()`, so the child can't grind one mode), and only a session of THAT mode finished with zero mistakes calls `completeDailyTask()` — the first completed task each day pays `dailyBonus` and grows the streak, repeats pay the smaller `dailyRepeatBonus`, and the next task (next mode) appears immediately (menu panel shows the task number, required mode, and 🏅 medals earned today). Blitz and exam never complete tasks. Any perfect session still triggers `launchFireworks()` (full-screen salute) on the completion screen; a perfect session of the wrong mode gets a toast pointing at the required one. `CONFIG.dailyGoal` is legacy — kept only to migrate old saves' streaks in `handleLogin`.
- Multiplication pays on its own scale (`multAnswerReward()`): **`× 2` facts pay 0 everywhere** (even inside the full table or a mix; a once-a-day toast explains why), «Вся таблиця» pays `multRewardFull` (2), every other table / custom mix pays `multRewardOther` (1). The submenu badge is computed per option, so «На 2» shows «без монет».
- Division pays 2 for everything, but trivial division content (2 and/or 5 only) pays for at most `easyDailyAnswers` (20 ≈ one session) answers per day. The check is `isTrivialDrill()`, which reads `activeFactors()` — the actual number set — so it covers both the dedicated drills and a custom mix of the same numbers.
- Both exams award nothing per answer (`isExamMode()` guard) — only a pass bonus at completion.
- The shop trades coins for Robux (`buyRobux`; small 5/10 packs at `robuxRate` coins per 1, capped at `robuxDailyLimit` per day; the big 500/1000 packs are priced explicitly — 8000 and 15000 coins — and are exempt from the daily cap; `robuxOwed` tracks what the parent still owes and delivers manually) and for Roblox minutes (`buyRobloxTime` — the real-world reward the child is playing for).

### Parent report (audit trail)

`saveSession()` records now carry `coins` — the coins actually awarded in that session (`state.sessionCoins`, accumulated in `awardCorrect()`, plus an exam pass bonus). `showParentReport()` (menu → 📊 Звіт для батьків) breaks today's coins down by mode + difficulty with percentage shares, flags farmable rows (`isFarmRow()` — single-digit ×2/×5 custom mixes), and compares the reconstructed total against `daily.count` and the balance, so a suspicious jump can be traced. Records saved before this feature have no `coins` field and are reconstructed from current `MODE_META` rates by `sessionCoinsOf()` — the report labels those as approximate.

### Visual theme

The current look is a **Halloween night theme** (the child's request): a dark navy sky with a moon and a pumpkin glow, floating 🎃👻🦇 decorations (`createFloatingDecorations()` item list), and **rainbow problem digits** (`.problem-num`, `.crossing-num` — a top-to-bottom gradient via `background-clip: text`, so even a single digit shows every colour). The whole theme lives in one block at the end of `style.css` (overriding `--bg-gradient` and the colours of text that sits directly on the page background), so it can be swapped for another season without touching the rest. Because the background is dark, **any new text placed directly on the page background (not inside a white card) must use `var(--text-on-bg)`** — the pastel `--text`/`--text-light` vars are for text on white/pastel cards and are unreadable on the night sky.

## Conventions

- **All user-facing text is Ukrainian.** Code comments are a mix of Ukrainian/Russian/English; write new UI strings in Ukrainian.
- Global functions + inline `onclick` in HTML is the established pattern — follow it rather than introducing modules, frameworks, or event-listener refactors.
- The app is designed mobile-first for a child on an iPhone: big touch targets, `user-scalable=no`, playful emoji-heavy UI. Test layout changes at narrow widths.
- Commit messages follow `feat:` / `fix:` prefixes, written in English.
