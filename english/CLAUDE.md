# english/CLAUDE.md — the English module

This folder is the **English** subject of the app. It is developed in its own Claude session, separate from math.
Read the root `CLAUDE.md` first — especially «Subjects and the two-session setup»: it is the contract between the two sessions.

## Scope of the English session

- You own `english/**` (this file, `english.js`, `english.css`, and any new files you add here).
- In `index.html` you may only bump the `?v=` numbers of `english/english.css` and `english/english.js`.
- Everything else (`main.js`, `style.css`, the rest of `index.html`, the root `CLAUDE.md`, the economy) belongs to the math session. If you need a change there — a new hook, a coin-rate change, a bug fix — write the exact request for the user to pass to the math session.

## Integration API (provided by main.js)

| Call | What for |
|---|---|
| `registerSubject({ id: 'english', icon, label, desc, start, onLogin, onLogout })` | Shows up on the «Що вчимо?» picker after login. `start()` opens your first screen. `onLogin(userDoc)` gets the whole Firestore doc — read `userDoc.english`. |
| `showSubjectPicker()` | «Back» from English to the subject choice. |
| `showScreen(id)` | Switch to one of your screens (create them from `english.js`, class `screen`). |
| `awardCoins(amount, source)` | The **only** way to give coins. Integer, `0..CONFIG.maxAwardPerCall`. Returns what was actually added. |
| `CONFIG.english.*` | Coin rates (owned by the math session): `rewardTyped`, `rewardChoice`, `rewardMastered`, `firstTryOnly`. |
| `registerMode('en-…', { icon, label, color })` | Register each English mode for history / calendar / parent report. Prefix `en-` is required. |
| `recordSubjectSession(mode, label, correct, total, coins, extra)` | Log a finished session to the shared history. |
| `showNotification(title, desc, emoji)`, `launchConfetti()`, `launchFireworks()`, `createStarBurst()` | Shared celebration helpers. |
| `state.userId`, `db` | Current profile and Firestore, for saving **your own field only**. |

Saving your data — only your field, never `coins` or math fields:

```js
db.collection('users').doc(state.userId).set({ english: enState }, { mergeFields: ['english'] });
```

Debounce it yourself (math debounces to 2 s and flushes on `visibilitychange`). Keep `english` compact — the whole document is capped at 1 MiB.

## Economy rules (set by the math session — don't work around them)

- Coins go through `awardCoins()` and use the rates from `CONFIG.english`.
- Tap/choice answers are guessable, so they pay less (`rewardChoice`) than answers the child types or spells (`rewardTyped`).
- `firstTryOnly`: only a correct answer on the **first** attempt pays — no retry-until-right farming.
- Already-mastered items pay `rewardMastered` (0), like `× 2` in math. Track mastery per item in your own stats.
- English does not complete math's «Завдання дня» and does not use math's resume slot.

## Product notes

- The learner is a Ukrainian first-grader (≈7). Interface text stays **Ukrainian**, like the rest of the app; the learning content is English, with Ukrainian translations where helpful.
- Pronunciation: the browser's `speechSynthesis` with `lang = 'en-US'` works offline on iPhone Safari — good for "listen and choose".
- Reuse the look: Halloween night theme, white cards, shimmering rainbow digits/letters (`.rainbow-digit` from `style.css`), big touch targets. Text sitting directly on the dark background must use `var(--text-on-bg)`.
- Before building, agree the content with the user: what the child already knows in English and what to start with.
