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

## Files

- `index.html` — every screen is a `<div class="screen">` in this one file (login, menu, submenu, game, completion, calendar, shop, achievements, plus the custom-mix modal). Buttons use inline `onclick` attributes calling global functions.
- `main.js` — all logic (~1900 lines), organized in `// ===== SECTION =====` blocks. No modules, no classes; global functions and a single global `state` object.
- `style.css` — all styles; design tokens (pastel palette, shadows, radii) are CSS custom properties in `:root`.
- `firebase-config.js` — Firebase init; exposes global `db` (Firestore). Client-side keys, intentionally committed.

## Cache busting (easy to forget)

Static assets are referenced with a version query (`style.css?v=15`, `main.js?v=15`, `firebase-config.js?v=15`) in `index.html`. When you change any of these files, bump the `?v=` number on **all three** references so users don't get stale cached scripts.

## Architecture

### State and config

- `state` (top of `main.js`) is the single mutable app state: current mode/problem/round, economy (coins, combo, robloxTime), daily progress, per-fact stats, history.
- `CONFIG` is the single source of truth for all tunables: rounds per session, daily goal (100) and bonus, exam pass threshold, answer→next pacing delays, save debounce, history cap (400). Tune numbers here, not inline.
- `MODE_META` maps each mode to its label, calendar color, and coin reward per correct answer.

### Screens

`showScreen(id)` toggles the `.screen` divs and stamps `document.body.dataset.screen` so CSS can target the active screen. `goToMenu()` also resets in-game state and timers.

### Auth and persistence

- "Login" is a 4-digit PIN that is literally the Firestore document ID (`users/{pin}`) — no real authentication. The PIN is cached in `localStorage` (`savedPin`) for auto-login.
- The whole user document (coins, daily, achievements, history, stats) is rewritten by `saveToFirebase()`.
- `saveGame()` is debounced (`CONFIG.saveDebounceMs`); call `saveGame(true)` for anything involving money or session boundaries so it can't be lost. `visibilitychange`/`beforeunload` flush pending saves.
- `history` is capped at `CONFIG.historyCap` entries to keep the Firestore doc under size limits.

### Game modes

All modes share the same game screen and `nextProblem()` → answer → `handleResult()` loop:

- **addition / subtraction** — random within `maxNum`; each also has a "Через десяток" (crossing tens) variant, a separate step-by-step UI (`crossing-*` functions) where the child enters each decomposition step.
- **multiplication / division** — *adaptive*: `buildFactPool()` enumerates facts for the chosen tables (2–9, single table, or a custom mix picked in the mix modal), and `pickWeightedFact()` biases selection toward weak facts via `factWeight()` (errors, slowness, and recent misses raise weight; mastered facts drop to 0.25). Division facts are built from multiplication so answers are always whole.
- **logic** — equations with an unknown, or number sequences.
- **blitz** — 60-second timer, mixed add/sub, no round limit.
- **exam** — 100 multiplication questions built by `buildExamQueue()`: all 64 facts (2–9 × 2–9) once plus 36 repeats of the statistically weakest. Numpad only, **no right/wrong feedback during the run** (`handleExamResult` bypasses the normal feedback path), pass = at most `CONFIG.examMaxErrors` (2) mistakes, mistakes are listed on the completion screen and stored in history.

### Adaptivity stats

Every answer is recorded per fact key (`m:3x7`, `a:5+8`, …) in `state.stats` via `recordStat()` — this feeds both adaptive problem generation and the exam's repeat selection. Keep fact-key formats stable or existing user stats break.

### Economy (deliberately anti-abuse)

`awardCorrect()` is the single reward pipeline: combo, coins per `MODE_META`, daily goal/streak/bonus, achievements, UI, save. Guardrails that exist on purpose — don't "simplify" them away:

- ×2 and ×5 dedicated drills award coins only once per day (`easyMultDailyLimit`).
- Multiple-choice input ("Варіанти") is allowed once per day (`choicesPerDay`); after that the numpad is forced.
- The exam awards nothing per answer — only a pass bonus at completion.
- The shop trades coins for Roblox minutes (the real-world reward the child is playing for).

### Multiple-choice distractors

`generateChoices()` builds *plausible* wrong answers (neighbouring table products for ×, near quotients and the divisor for ÷) rather than random noise, falling back to nearby numbers for other modes.

## Conventions

- **All user-facing text is Ukrainian.** Code comments are a mix of Ukrainian/Russian/English; write new UI strings in Ukrainian.
- Global functions + inline `onclick` in HTML is the established pattern — follow it rather than introducing modules, frameworks, or event-listener refactors.
- The app is designed mobile-first for a child on an iPhone: big touch targets, `user-scalable=no`, playful emoji-heavy UI. Test layout changes at narrow widths.
- Commit messages follow `feat:` / `fix:` prefixes, written in English.
