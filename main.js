// ===== MATH GAME STATE =====
const state = {
    mode: null,        // 'addition' | 'subtraction' | 'multiplication'
    maxNum: 20,        // limit for problems
    difficultyLabel: '',
    inputMode: 'choices', // 'choices' | 'numpad'
    currentProblem: null,
    score: 0,
    round: 0,
    totalRounds: 20,
    answered: false,
    numpadValue: '',
    sessionCorrect: 0,
    // Multiplication / division specifics
    minA: 2,
    maxA: 4,
    factors: null,     // explicit set of operands, e.g. [4,6,7] (mixed); null → use minA..maxA range
    // Crossing tens mode
    crossingTens: false,
    crossingStep: 0,
    crossingData: null,
    crossingInputValue: '',
    // Calendar
    calendarYear: new Date().getFullYear(),
    calendarMonth: new Date().getMonth(),
    // Economy & Auth
    userId: null,
    coins: 0,
    combo: 0,
    robloxTime: 0,
    daily: { date: '', count: 0, streak: 0, multLimits: {} },
    achievements: [],
    blitzRecord: 0,
    history: [],
    problemStartTime: 0,
    // Adaptivity (Phase 2): per-fact stats { seen, correct, timeMs, lastResult, lastTs }
    stats: {},
    lastFactKey: null
};

// ===== CONFIG (single source of truth) =====
const CONFIG = {
    totalRounds: 20,
    dailyGoal: 100,          // correct answers for the daily goal
    dailyBonus: 50,          // coins awarded on completing the daily goal
    multDivDailyLimit: 60,   // per-operand daily coin cap for ×/÷ (anti-abuse)
    saveDebounceMs: 2000,    // coalesce Firebase writes within this window
    historyCap: 400,         // keep only the most recent N sessions (Firestore doc size)
    // Delay (ms) after an answer before the next problem appears — tune the pacing here
    pace: {
        correct: 700,        // correct answer → next (normal modes)
        wrong: 1800,         // wrong answer → next (longer: time to read the right answer)
        blitzCorrect: 450,   // correct, blitz
        blitzWrong: 900,     // wrong, blitz
        crossingDone: 900    // "через десяток" problem solved → next
    }
};

// Per-mode metadata: label (UI/history), calendar color, and coin reward per correct answer.
// crossingReward applies to the step-by-step "через десяток" variant of add/sub.
const MODE_META = {
    addition:       { icon: '➕',  label: 'Додавання',   color: 'var(--pink-light)', reward: 1, crossingReward: 2 },
    subtraction:    { icon: '➖',  label: 'Віднімання',  color: 'var(--lavender)',   reward: 2, crossingReward: 3 },
    multiplication: { icon: '✖️', label: 'Множення',    color: 'var(--mint)',       reward: 1 },
    division:       { icon: '➗',  label: 'Ділення',     color: 'var(--sky)',        reward: 2 },
    logic:          { icon: '🧩', label: 'Логіка',      color: 'var(--peach)',      reward: 3 },
    blitz:          { icon: '⏱️', label: 'Бліц-Турнір', color: 'var(--yellow)',     reward: 1 }
};

function modeLabel(mode) { return (MODE_META[mode] && MODE_META[mode].label) || mode; }

// ===== FIREBASE & HISTORY =====
async function saveToFirebase() {
    if (!state.userId) return;
    try {
        await db.collection("users").doc(state.userId).set({
            coins: state.coins,
            combo: state.combo,
            robloxTime: state.robloxTime,
            daily: state.daily,
            achievements: state.achievements,
            blitzRecord: state.blitzRecord,
            history: state.history,
            stats: state.stats
        });
    } catch (e) {
        console.error("Ошибка сохранения в Firebase: ", e);
    }
}

// Debounced saver: coalesces the many per-answer writes into one every few seconds.
// The scheduled write reads live state at fire time, so it always persists the latest.
// Pass immediate=true for money/session-boundary events that must not be lost.
let saveTimer = null;
function saveGame(immediate = false) {
    if (immediate) {
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
        saveToFirebase();
        return;
    }
    if (saveTimer) return; // a write is already scheduled; it will capture latest state
    saveTimer = setTimeout(() => { saveTimer = null; saveToFirebase(); }, CONFIG.saveDebounceMs);
}

function updateEconomyUI() {
    // Menu
    const menuCoins = document.getElementById('menu-coins');
    const menuCombo = document.getElementById('menu-combo');
    if (menuCoins) menuCoins.textContent = state.coins;
    if (menuCombo) menuCombo.textContent = state.combo;
    
    // Game
    const gameCoins = document.getElementById('game-coins');
    const gameCombo = document.getElementById('game-combo');
    if (gameCoins) gameCoins.textContent = state.coins;
    if (gameCombo) gameCombo.textContent = state.combo;
    
    // Shop
    const shopCoins = document.getElementById('shop-coins');
    if (shopCoins) shopCoins.textContent = state.coins;
    
    // Global Header
    const globCoins = document.getElementById('global-total-coins');
    if (globCoins) globCoins.textContent = state.coins;
    const globRobloxTime = document.getElementById('global-roblox-time');
    if (globRobloxTime) globRobloxTime.textContent = state.robloxTime;
}

function updateDailyUI() {
    const dailyCount = document.getElementById('daily-count');
    const dailyStreak = document.getElementById('daily-streak');
    const dailyFill = document.getElementById('daily-progress-fill');
    
    if (dailyCount) dailyCount.textContent = state.daily.count;
    if (dailyStreak) dailyStreak.textContent = state.daily.streak;
    
    if (dailyFill) {
        let pct = Math.min(100, Math.round((state.daily.count / CONFIG.dailyGoal) * 100));
        dailyFill.style.width = pct + '%';
        if (pct === 100) {
            dailyFill.style.background = 'var(--gold)';
        } else {
            dailyFill.style.background = 'var(--mint)';
        }
    }
}

function checkDailyReset() {
    const today = new Date().toLocaleDateString('en-CA'); // e.g. "2026-04-11"
    if (state.daily.date !== today) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toLocaleDateString('en-CA');
        
        if (state.daily.date !== yesterdayStr || state.daily.count < CONFIG.dailyGoal) {
            state.daily.streak = 0;
        }
        state.daily.count = 0;
        state.daily.date = today;
        state.daily.multLimits = {};
        saveGame(true);
    }
    updateDailyUI();
}

function getHistory() {
    return state.history || [];
}

function saveSession(mode, difficultyLabel, correct, total) {
    const history = getHistory();
    const now = new Date();
    history.push({
        date: now.toISOString().split('T')[0], // "2026-03-28"
        mode: mode,
        difficulty: difficultyLabel,
        correct: correct,
        total: total,
        timestamp: now.getTime(),
        time: now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    });
    // Keep the document small: retain only the most recent sessions
    if (history.length > CONFIG.historyCap) {
        history.splice(0, history.length - CONFIG.historyCap);
    }
    state.history = history;
    saveGame(true);
}

function getHistoryForDate(dateStr) {
    return getHistory().filter(h => h.date === dateStr);
}

function getDatesWithHistory() {
    const history = getHistory();
    const dates = new Set();
    history.forEach(h => dates.add(h.date));
    return dates;
}

// ===== AUTH / LOGIN =====
async function handleLogin() {
    const pin = document.getElementById('login-pin').value;
    const errorEl = document.getElementById('login-error');
    if (pin.length !== 4) {
        errorEl.style.display = 'block';
        return;
    }
    errorEl.style.display = 'none';
    
    document.getElementById('btn-login').textContent = 'Загрузка...';
    
    try {
        const docRef = db.collection("users").doc(pin);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
            const data = docSnap.data();
            state.coins = data.coins || 0;
            state.combo = data.combo || 0;
            state.robloxTime = data.robloxTime || data.robux || 0;
            state.daily = data.daily || { date: '', count: 0, streak: 0, multLimits: {} };
            if (!state.daily.multLimits) state.daily.multLimits = {};
            state.achievements = data.achievements || [];
            state.blitzRecord = data.blitzRecord || 0;
            state.history = data.history || [];
            state.stats = data.stats || {};
        } else {
            // New user
            state.coins = 0;
            state.combo = 0;
            state.robloxTime = 0;
            state.daily = { date: '', count: 0, streak: 0, multLimits: {} };
            state.achievements = [];
            state.blitzRecord = 0;
            state.history = [];
            state.stats = {};
            await docRef.set({ coins: 0, combo: 0, robloxTime: 0, daily: state.daily, achievements: [], blitzRecord: 0, history: [], stats: {} });
        }
        
        state.userId = pin;
        localStorage.setItem('savedPin', pin);
        checkDailyReset();
        updateEconomyUI();
        document.getElementById('btn-login').textContent = 'Увійти';
        document.getElementById('login-pin').value = '';
        goToMenu();
    } catch (e) {
        console.error("Ошибка входа: ", e);
        errorEl.textContent = 'Помилка: ' + (e.message || 'Невідомо');
        errorEl.style.display = 'block';
        document.getElementById('btn-login').textContent = 'Увійти';
    }
}

function showNotification(title, desc, emoji) {
    const container = document.getElementById('notification-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'notification-toast';
    toast.innerHTML = `
        <div class="toast-emoji">${emoji}</div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-desc">${desc}</div>
        </div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('closing');
        setTimeout(() => toast.remove(), 300);
    }, 8000); // 8 seconds
}

function handleLogout() {
    saveGame(true); // flush any pending progress before switching profile
    localStorage.removeItem('savedPin');
    state.userId = null;
    showScreen('screen-login');
}

function initAuth() {
    const savedPin = localStorage.getItem('savedPin');
    if (savedPin) {
        document.getElementById('login-pin').value = savedPin;
        handleLogin();
    } else {
        showScreen('screen-login');
    }
}

// ===== SCREEN MANAGEMENT =====
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(screenId);
    screen.classList.add('active');
    document.body.dataset.screen = screenId; // lets CSS target the active screen (e.g. hide global header in-game)
    screen.style.animation = 'none';
    screen.offsetHeight;
    screen.style.animation = '';
}

function goToMenu() {
    state.mode = null;
    state.score = 0;
    state.round = 0;
    state.sessionCorrect = 0;
    state.crossingTens = false;
    state.crossingStep = 0;
    state.crossingData = null;
    state.crossingInputValue = '';
    if (typeof blitzTimer !== 'undefined' && blitzTimer) clearInterval(blitzTimer);
    document.getElementById('progress-display').style.display = 'block';
    if (document.getElementById('blitz-timer-display')) {
        document.getElementById('blitz-timer-display').style.display = 'none';
    }
    document.getElementById('crossing-container').style.display = 'none';
    document.getElementById('problem-container').style.display = '';
    showScreen('screen-menu');
}

// ===== INPUT MODE =====
function setInputMode(mode) {
    state.inputMode = mode;
    document.getElementById('toggle-choices').classList.toggle('active', mode === 'choices');
    document.getElementById('toggle-numpad').classList.toggle('active', mode === 'numpad');
}

// ===== SUB-MENU =====
function showSubMenu(mode) {
    state.mode = mode;
    const submenuContainer = document.getElementById('submenu-container');
    const submenuIcon = document.getElementById('submenu-icon');
    const submenuTitle = document.getElementById('submenu-title');

    submenuContainer.innerHTML = '';

    const configs = {
        addition: {
            icon: '➕',
            title: 'Додавання',
            options: [
                { emoji: '🌟', label: 'До 20', desc: 'Додавання в межах 20', maxNum: 20, reward: 1 },
                { emoji: '🔟', label: 'Через десяток', desc: 'Розкладаємо через 10', crossing: true, reward: 2 },
            ]
        },
        subtraction: {
            icon: '➖',
            title: 'Віднімання',
            options: [
                { emoji: '🌟', label: 'До 20', desc: 'Віднімання в межах 20', maxNum: 20, reward: 2 },
                { emoji: '🔟', label: 'Через десяток', desc: 'Розкладаємо через 10', crossing: true, reward: 3 },
            ]
        },
        multiplication: {
            icon: '✖️',
            title: 'Множення',
            options: [
                { emoji: '🐣', label: 'На 2', desc: 'Множення на 2', minA: 2, maxA: 2, reward: 1 },
                { emoji: '🐥', label: 'На 3', desc: 'Множення на 3', minA: 3, maxA: 3, reward: 1 },
                { emoji: '🦆', label: 'На 4', desc: 'Множення на 4', minA: 4, maxA: 4, reward: 1 },
                { emoji: '🦉', label: 'На 5', desc: 'Множення на 5', minA: 5, maxA: 5, reward: 1 },
                { emoji: '🐝', label: 'На 6', desc: 'Множення на 6', minA: 6, maxA: 6, reward: 1 },
                { emoji: '🦖', label: 'На 7', desc: 'Множення на 7', minA: 7, maxA: 7, reward: 1 },
                { emoji: '🐙', label: 'На 8', desc: 'Множення на 8', minA: 8, maxA: 8, reward: 1 },
                { emoji: '🦁', label: 'На 9', desc: 'Множення на 9', minA: 9, maxA: 9, reward: 1 },
                { emoji: '🎲', label: 'Мікс 4·6·7', desc: 'На 4, 6 і 7 упереміш', factors: [4, 6, 7], reward: 1 },
                { emoji: '🦋', label: 'Вся таблиця (2-9)', desc: 'Вся таблиця', minA: 2, maxA: 9, reward: 1 },
            ]
        },
        division: {
            icon: '➗',
            title: 'Ділення',
            options: [
                { emoji: '🐣', label: 'На 2', desc: 'Ділення на 2', minA: 2, maxA: 2, reward: 2 },
                { emoji: '🐥', label: 'На 3', desc: 'Ділення на 3', minA: 3, maxA: 3, reward: 2 },
                { emoji: '🦆', label: 'На 4', desc: 'Ділення на 4', minA: 4, maxA: 4, reward: 2 },
                { emoji: '🦉', label: 'На 5', desc: 'Ділення на 5', minA: 5, maxA: 5, reward: 2 },
                { emoji: '🐝', label: 'На 6', desc: 'Ділення на 6', minA: 6, maxA: 6, reward: 2 },
                { emoji: '🦖', label: 'На 7', desc: 'Ділення на 7', minA: 7, maxA: 7, reward: 2 },
                { emoji: '🐙', label: 'На 8', desc: 'Ділення на 8', minA: 8, maxA: 8, reward: 2 },
                { emoji: '🦁', label: 'На 9', desc: 'Ділення на 9', minA: 9, maxA: 9, reward: 2 },
                { emoji: '🦋', label: 'Вся таблиця (2-9)', desc: 'Вся таблиця', minA: 2, maxA: 9, reward: 2 },
            ]
        },
        logic: {
            icon: '🧩',
            title: 'Логіка',
            options: [
                { emoji: '❓', label: 'Рівняння', desc: 'Знайди невідоме', type: 'equation', reward: 3 },
                { emoji: '🎲', label: 'Послідовності', desc: 'Продовж ряд', type: 'sequence', reward: 3 },
            ]
        },
    };

    const config = configs[mode];
    submenuIcon.textContent = config.icon;
    submenuTitle.textContent = config.title;

    config.options.forEach((opt, i) => {
        const card = document.createElement('div');
        card.className = 'difficulty-card slide-up';
        card.style.animationDelay = `${i * 0.1}s`;
        card.innerHTML = `
            <span class="diff-emoji">${opt.emoji}</span>
            <div class="diff-label">${opt.label}</div>
            <div class="diff-desc">${opt.desc}</div>
            <div class="diff-reward">+${opt.reward} 💰</div>
        `;
        card.onclick = () => {
            state.difficultyLabel = opt.label;
            state.crossingTens = opt.crossing || false;
            if (mode === 'multiplication' || mode === 'division') {
                state.factors = opt.factors || null;
                state.minA = opt.minA || 2;
                state.maxA = opt.maxA || 4;
            } else if (mode === 'logic') {
                state.logicMode = opt.type;
            } else {
                state.maxNum = opt.maxNum || 20;
            }
            startGame();
        };
        submenuContainer.appendChild(card);
    });

    showScreen('screen-submenu');
}

// ===== BLITZ MODE =====
let blitzTimer = null;
let blitzSeconds = 60;

function startBlitzMode() {
    state.mode = 'blitz';
    state.score = 0;
    state.sessionCorrect = 0;
    state.round = 0; 
    state.difficultyLabel = 'Бліц';
    blitzSeconds = 60;

    document.getElementById('score-value').textContent = '0';
    document.getElementById('progress-display').style.display = 'none';
    
    const blitzTimerDisplay = document.getElementById('blitz-timer-display');
    if (blitzTimerDisplay) {
        blitzTimerDisplay.style.display = 'block';
        document.getElementById('blitz-time-value').textContent = '60';
    }

    showScreen('screen-game');
    nextProblem();

    if (blitzTimer) clearInterval(blitzTimer);
    blitzTimer = setInterval(() => {
        blitzSeconds--;
        document.getElementById('blitz-time-value').textContent = blitzSeconds;
        if (blitzSeconds <= 0) {
            endBlitzMode();
        }
    }, 1000);
}

function endBlitzMode() {
    clearInterval(blitzTimer);
    state.answered = true; // disable further inputs
    showCompletion();
}

// ===== ADAPTIVITY (Phase 2) =====
// A "fact" is a specific example (e.g. 3×7). We track how well it's known and
// bias generation toward weak facts (spaced-repetition style). Invisible to the child.

function factKeyFor(mode, a, b, opSymbol) {
    switch (opSymbol) {
        case '+': return `a:${a}+${b}`;
        case '−': return `s:${a}-${b}`;
        case '×': return `m:${a}x${b}`;
        case '÷': return `d:${a}:${b}`;
    }
    if (mode === 'logic') return `l:${state.logicMode || 'eq'}`;
    return null;
}

function recordStat(factKey, correct, timeMs) {
    if (!factKey) return;
    if (!state.stats) state.stats = {};
    const s = state.stats[factKey] || { seen: 0, correct: 0, timeMs: 0, lastResult: 0, lastTs: 0 };
    s.seen++;
    if (correct) s.correct++;
    s.timeMs += Math.max(0, Math.min(timeMs || 0, 60000)); // clamp outliers (afk etc.)
    s.lastResult = correct ? 1 : 0;
    s.lastTs = Date.now();
    state.stats[factKey] = s;
}

// Higher weight = fact needs more practice.
function factWeight(key) {
    const s = state.stats && state.stats[key];
    if (!s || s.seen === 0) return 2.5;              // unseen: introduce, but don't flood
    const acc = s.correct / s.seen;
    const avg = s.timeMs / s.seen;
    if (s.seen >= 4 && acc >= 0.9 && avg < 3000) return 0.25; // mastered: show rarely
    let w = 1;
    w += (1 - acc) * 4;                              // errors dominate
    if (avg > 4000) w += 1;                          // slow → needs reps
    if (s.lastResult === 0) w += 1.5;                // just missed it
    return Math.max(0.25, w);
}

// Weighted-random pick over a pool of {a, b, answer, factKey}.
function pickWeightedFact(pool) {
    let total = 0;
    const weights = pool.map(c => {
        let w = factWeight(c.factKey);
        if (c.factKey === state.lastFactKey && pool.length > 1) w *= 0.15; // avoid immediate repeat
        total += w;
        return w;
    });
    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
        r -= weights[i];
        if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
}

// Build the candidate pool for the current multiplication/division difficulty.
function buildFactPool(mode) {
    const pool = [];
    // Explicit factor set (e.g. mixed 4·6·7) takes priority over the minA..maxA range
    let factors = (state.factors && state.factors.length) ? state.factors : [];
    if (!factors.length) {
        for (let x = state.minA; x <= state.maxA; x++) factors.push(x);
    }
    for (const x of factors) {
        for (let q = 2; q <= 10; q++) {
            if (mode === 'multiplication') {
                pool.push({ a: x, b: q, answer: x * q, factKey: `m:${x}x${q}` });
            } else { // division: x is divisor, q is quotient, dividend = x*q
                pool.push({ a: x * q, b: x, answer: q, factKey: `d:${x * q}:${x}` });
            }
        }
    }
    return pool;
}

// ===== PROBLEM GENERATION =====
function generateProblem() {
    let a, b, answer, opSymbol;

    if (state.mode === 'blitz') {
        const isAdd = randomInt(0, 1) === 1;
        if (isAdd) {
            answer = randomInt(6, 20);
            a = randomInt(3, answer - 3);
            b = answer - a;
            opSymbol = '+';
        } else {
            a = randomInt(6, 20);
            b = randomInt(3, a);
            answer = a - b;
            opSymbol = '−';
        }
        const blitzKey = factKeyFor('blitz', a, b, opSymbol);
        state.lastFactKey = blitzKey;
        return { a, b, answer, opSymbol, factKey: blitzKey };
    }

    switch (state.mode) {
        case 'addition':
            // a + b = ?, both a,b >= 3, result <= maxNum
            answer = randomInt(6, state.maxNum);
            a = randomInt(3, answer - 3);
            b = answer - a;
            opSymbol = '+';
            break;

        case 'subtraction':
            // a - b = ?, b >= 3, answer >= 3
            a = randomInt(6, state.maxNum);
            b = randomInt(3, Math.max(3, a - 3));
            answer = a - b;
            opSymbol = '−';
            break;

        case 'multiplication': {
            // Adaptive: pick a fact weighted toward what's still weak
            const pick = pickWeightedFact(buildFactPool('multiplication'));
            a = pick.a; b = pick.b; answer = pick.answer;
            opSymbol = '×';
            break;
        }

        case 'division': {
            // Adaptive: built from a multiplication fact so the answer is whole
            const pick = pickWeightedFact(buildFactPool('division'));
            a = pick.a; b = pick.b; answer = pick.answer;
            opSymbol = '÷';
            break;
        }

        case 'logic':
            if (state.logicMode === 'equation') {
                let c = randomInt(8, 20);
                let unknownA = randomInt(1, c - 1);
                let unknownB = c - unknownA;
                if (randomInt(0, 1) === 1) {
                    answer = unknownA;
                    a = `? + ${unknownB} = ${c}`;
                } else {
                    answer = unknownB;
                    a = `${unknownA} + ? = ${c}`;
                }
                b = '';
                opSymbol = '';
            } else {
                let step = randomInt(2, 5);
                let start = randomInt(1, 10);
                a = `${start}, ${start + step}, ${start + 2*step},`;
                b = '';
                opSymbol = '';
                answer = start + 3*step;
            }
            break;
    }

    const factKey = factKeyFor(state.mode, a, b, opSymbol);
    state.lastFactKey = factKey;
    return { a, b, answer, opSymbol, factKey };
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateChoices(correctAnswer) {
    const choices = new Set([correctAnswer]);
    let attempts = 0;

    while (choices.size < 4 && attempts < 100) {
        let wrong;
        const offset = randomInt(1, Math.max(5, Math.ceil(correctAnswer * 0.5)));
        if (Math.random() > 0.5) {
            wrong = correctAnswer + randomInt(1, offset);
        } else {
            wrong = correctAnswer - randomInt(1, offset);
        }
        if (wrong >= 0 && wrong !== correctAnswer) {
            choices.add(wrong);
        }
        attempts++;
    }

    let fill = 1;
    while (choices.size < 4) {
        choices.add(correctAnswer + fill * 2);
        fill++;
    }

    return shuffleArray([...choices]);
}

function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ===== GAME FLOW =====
function startGame() {
    state.score = 0;
    state.round = 0;
    state.sessionCorrect = 0;
    state.numpadValue = '';
    state.crossingStep = 0;
    state.crossingData = null;
    state.crossingInputValue = '';

    document.getElementById('score-value').textContent = '0';
    document.getElementById('progress-total').textContent = state.totalRounds;
    showScreen('screen-game');
    nextProblem();
}

function nextProblem() {
    state.round++;
    state.answered = false;
    state.numpadValue = '';

    if (state.mode !== 'blitz' && state.round > state.totalRounds) {
        showCompletion();
        return;
    }

    document.getElementById('progress-current').textContent = state.round;
    document.getElementById('progress-bar').style.width = `${((state.round - 1) / state.totalRounds) * 100}%`;

    document.getElementById('feedback').textContent = '';
    document.getElementById('feedback').className = 'feedback';

    const problemContainer = document.getElementById('problem-container');
    problemContainer.classList.remove('shake');

    // Crossing tens mode
    if (state.crossingTens) {
        problemContainer.style.display = 'none';
        document.getElementById('choices-container').style.display = 'none';
        document.getElementById('numpad-container').style.display = 'none';
        document.getElementById('crossing-container').style.display = 'flex';
        startCrossingProblem();
        state.problemStartTime = Date.now();
        return;
    }

    // Normal mode
    problemContainer.style.display = '';
    document.getElementById('crossing-container').style.display = 'none';

    state.currentProblem = generateProblem();
    const { a, b, answer, opSymbol } = state.currentProblem;

    document.getElementById('num-a').textContent = a;
    document.getElementById('op').textContent = opSymbol;
    document.getElementById('num-b').textContent = b;

    const eqSign = document.querySelector('.problem-eq');
    const numA = document.getElementById('num-a');
    if (state.mode === 'logic') {
        if (eqSign) eqSign.style.display = 'none';
        if (numA) numA.style.marginRight = '15px';
    } else {
        if (eqSign) eqSign.style.display = 'inline';
        if (numA) numA.style.marginRight = '0';
    }

    const answerDisplay = document.getElementById('answer-display');
    answerDisplay.textContent = '?';
    answerDisplay.className = 'problem-answer';

    if (state.inputMode === 'choices') {
        document.getElementById('choices-container').style.display = 'grid';
        document.getElementById('numpad-container').style.display = 'none';

        const choices = generateChoices(answer);
        for (let i = 0; i < 4; i++) {
            const btn = document.getElementById(`choice-${i}`);
            btn.textContent = choices[i];
            btn.dataset.value = choices[i];
            btn.className = 'choice-btn';
            btn.disabled = false;
        }
    } else {
        document.getElementById('choices-container').style.display = 'none';
        document.getElementById('numpad-container').style.display = '';
        document.getElementById('numpad-display').textContent = '?';
        enableNumpad(true);
    }
    
    state.problemStartTime = Date.now();
}

// ===== ANSWER CHECKING =====
function checkAnswer(btnElement) {
    if (state.answered) return;
    state.answered = true;

    const userAnswer = parseInt(btnElement.dataset.value);
    const correct = userAnswer === state.currentProblem.answer;

    handleResult(correct, userAnswer, btnElement);
}

function numpadInput(digit) {
    if (state.answered) return;
    if (state.numpadValue.length >= 3) return;

    state.numpadValue += digit.toString();
    document.getElementById('numpad-display').textContent = state.numpadValue;
}

function numpadClear() {
    if (state.answered) return;
    state.numpadValue = state.numpadValue.slice(0, -1);
    document.getElementById('numpad-display').textContent = state.numpadValue || '?';
}

function numpadSubmit() {
    if (state.answered) return;
    if (state.numpadValue === '') return;

    state.answered = true;
    const userAnswer = parseInt(state.numpadValue);
    const correct = userAnswer === state.currentProblem.answer;

    handleResult(correct, userAnswer, null);
}

function enableNumpad(enabled) {
    document.querySelectorAll('#numpad-container .numpad-btn').forEach(btn => {
        btn.disabled = !enabled;
    });
}

// ===== CROSSING TENS MODE =====
function generateCrossingProblem() {
    let a, b;
    if (state.mode === 'addition') {
        // a + b crosses 10: both 3-9, sum > 10
        do {
            a = randomInt(3, 9);
            b = randomInt(3, 9);
        } while (a + b <= 10 || a + b > 18);

        const toTen = 10 - a;
        const remainder = b - toTen;
        const answer = a + b;

        return {
            a, b, answer, opSymbol: '+', crossOp: '+',
            answers: [10, remainder, answer],
            factKey: `a:${a}+${b}`
        };
    } else {
        // subtraction: a > 10, crossing below 10
        a = randomInt(11, 17);
        const minB = Math.max(3, a - 9);
        const maxB = Math.min(9, a - 3);
        b = randomInt(minB, maxB);

        const toTen = a - 10;
        const remainder = b - toTen;
        const answer = a - b;

        return {
            a, b, answer, opSymbol: '−', crossOp: '−',
            answers: [10, remainder, answer],
            factKey: `s:${a}-${b}`
        };
    }
}

function startCrossingProblem() {
    const problem = generateCrossingProblem();
    state.crossingData = problem;
    state.crossingStep = 1;
    state.crossingInputValue = '';
    state.currentProblem = problem;

    renderCrossingSteps();
    document.getElementById('crossing-input-display').textContent = '?';
    document.getElementById('crossing-input-display').className = 'crossing-input-display';
    enableCrossingNumpad(true);
}

function renderCrossingSteps() {
    const eqEl = document.getElementById('crossing-equation');
    const p = state.crossingData;
    const currentStep = state.crossingStep;

    // Base structure: a op b =
    let html = `<span class="crossing-num">${p.a}</span> <span class="crossing-op">${p.opSymbol}</span> <span class="crossing-num">${p.b}</span> <span class="crossing-eq">=</span> `;

    // Step 1: the 10
    if (currentStep > 1) {
        html += `<span class="crossing-num-filled">${p.answers[0]}</span>`;
    } else {
        html += `<span class="crossing-num-active">?</span>`;
    }

    html += ` <span class="crossing-op">${p.crossOp}</span> `;

    // Step 2: remainder
    if (currentStep > 2) {
        html += `<span class="crossing-num-filled">${p.answers[1]}</span>`;
    } else if (currentStep === 2) {
        html += `<span class="crossing-num-active">?</span>`;
    } else {
        html += `<span class="crossing-num-locked">?</span>`;
    }

    html += ` <span class="crossing-eq">=</span> `;

    // Step 3: answer
    if (currentStep > 3) {
        html += `<span class="crossing-result filled">${p.answers[2]}</span>`;
    } else if (currentStep === 3) {
        html += `<span class="crossing-num-active">?</span>`;
    } else {
        html += `<span class="crossing-num-locked">?</span>`;
    }

    eqEl.innerHTML = html;
}

function crossingInput(digit) {
    if (state.answered) return;
    if (state.crossingInputValue.length >= 2) return;

    state.crossingInputValue += digit.toString();
    document.getElementById('crossing-input-display').textContent = state.crossingInputValue;
}

function crossingClear() {
    if (state.answered) return;
    state.crossingInputValue = state.crossingInputValue.slice(0, -1);
    document.getElementById('crossing-input-display').textContent = state.crossingInputValue || '?';
}

function crossingSubmit() {
    if (state.answered) return;
    if (state.crossingInputValue === '') return;

    const userAnswer = parseInt(state.crossingInputValue);
    const p = state.crossingData;
    const currentAns = p.answers[state.crossingStep - 1];
    const correct = userAnswer === currentAns;
    const inputDisplay = document.getElementById('crossing-input-display');

    if (correct) {
        inputDisplay.className = 'crossing-input-display correct-flash';
        inputDisplay.textContent = '✓ ' + userAnswer;
        
        createStarBurst();
        enableCrossingNumpad(false);

        if (state.crossingStep >= 3) {
            // All steps done — problem complete!
            state.answered = true;
            state.score++;
            state.sessionCorrect++;
            document.getElementById('score-value').textContent = state.score;

            // Re-render final state
            renderCrossingSteps();

            const timeTaken = Date.now() - state.problemStartTime;
            recordStat(state.crossingData && state.crossingData.factKey, true, timeTaken);
            awardCorrect(timeTaken);

            const feedback = document.getElementById('feedback');
            const emojis = ['🎉', '⭐', '🌟', '💫', '✨', '🎊', '💖', '🦄', '🌈', '🎀'];
            feedback.textContent = emojis[Math.floor(Math.random() * emojis.length)];
            feedback.className = 'feedback show';

            if (state.sessionCorrect % 3 === 0) launchConfetti();

            setTimeout(nextProblem, CONFIG.pace.crossingDone);
        } else {
            // Move to next step
            setTimeout(() => {
                state.crossingStep++;
                state.crossingInputValue = '';
                renderCrossingSteps();
                inputDisplay.textContent = '?';
                inputDisplay.className = 'crossing-input-display';
                enableCrossingNumpad(true);
            }, 700);
        }
    } else {
        // Wrong answer for step
        inputDisplay.className = 'crossing-input-display wrong-flash';
        inputDisplay.textContent = '✗ ' + userAnswer;
        
        const eqEl = document.getElementById('crossing-equation');
        eqEl.classList.add('shake');
        setTimeout(() => eqEl.classList.remove('shake'), 500);

        // Show correct answer briefly, then let them continue
        setTimeout(() => {
            inputDisplay.textContent = 'Відповідь: ' + currentAns;
        }, 600);

        setTimeout(() => {
            if (state.crossingStep >= 3) {
                // Final step was wrong — still finish the problem
                state.answered = true;
                state.combo = 0;
                recordStat(state.crossingData && state.crossingData.factKey, false, Date.now() - state.problemStartTime);
                updateEconomyUI();
                saveGame();

                renderCrossingSteps();

                setTimeout(nextProblem, CONFIG.pace.wrong);
            } else {
                state.crossingStep++;
                state.crossingInputValue = '';
                renderCrossingSteps();
                inputDisplay.textContent = '?';
                inputDisplay.className = 'crossing-input-display';
                enableCrossingNumpad(true);
            }
        }, 1400);

        enableCrossingNumpad(false);
    }
}

function enableCrossingNumpad(enabled) {
    document.querySelectorAll('.crossing-numpad-grid .numpad-btn').forEach(btn => {
        btn.disabled = !enabled;
    });
}

// Shared reward pipeline for a correct answer (both normal and "через десяток" modes).
// Handles combo, coins (+ ×/÷ anti-abuse), the daily goal/bonus/streak, achievements,
// the economy UI and persistence. Returns coins earned. Single source of truth.
function awardCorrect(timeTaken) {
    state.combo++;

    const meta = MODE_META[state.mode] || {};
    let earned = state.crossingTens ? (meta.crossingReward || 2) : (meta.reward || 1);

    // Multiplication / division anti-abuse: cap coins per single fixed operand per day
    if ((state.mode === 'multiplication' || state.mode === 'division') && state.minA === state.maxA) {
        if (!state.daily.multLimits) state.daily.multLimits = {};
        const num = state.minA;
        const key = state.mode === 'division' ? 'd' + num : num; // keep legacy mult key, separate div key
        if (!state.daily.multLimits[key]) state.daily.multLimits[key] = 0;

        if (state.daily.multLimits[key] >= CONFIG.multDivDailyLimit) {
            earned = 0; // limit reached
            if (state.daily.multLimits[key] === CONFIG.multDivDailyLimit) {
                showNotification('Ліміт вичерпано!', `Ти вже багато розв'язав на ${num}. Обирай інші приклади, щоб отримувати монети.`, '🚫');
                state.daily.multLimits[key]++; // increment to not show msg again
            }
        } else {
            state.daily.multLimits[key]++;
        }
    }

    state.coins += earned;

    // Daily goal → bonus + streak
    if (state.daily && state.daily.count < CONFIG.dailyGoal) {
        state.daily.count++;
        if (state.daily.count === CONFIG.dailyGoal) {
            state.daily.streak++;
            state.coins += CONFIG.dailyBonus;
            setTimeout(() => showNotification('Завдання дня виконано!', `+${CONFIG.dailyBonus} монет! Серія: ${state.daily.streak} дн.`, '🎯'), 500);
        }
        updateDailyUI();
    }

    if (typeof checkAchievements === 'function') checkAchievements(timeTaken);
    updateEconomyUI();
    saveGame();
    return earned;
}

function handleResult(correct, userAnswer, btnElement) {
    const answerDisplay = document.getElementById('answer-display');
    const feedback = document.getElementById('feedback');
    const problemContainer = document.getElementById('problem-container');

    // Adaptivity: log this attempt against its fact
    const timeTaken = Date.now() - state.problemStartTime;
    recordStat(state.currentProblem && state.currentProblem.factKey, correct, timeTaken);

    if (correct) {
        state.score++;
        state.sessionCorrect++;
        document.getElementById('score-value').textContent = state.score;

        awardCorrect(timeTaken);

        answerDisplay.textContent = state.currentProblem.answer;
        answerDisplay.className = 'problem-answer correct';

        if (btnElement) btnElement.classList.add('correct');

        if (state.inputMode === 'numpad') {
            document.getElementById('numpad-display').textContent = '✓ ' + state.currentProblem.answer;
        }

        const emojis = ['🎉', '⭐', '🌟', '💫', '✨', '🎊', '💖', '🦄', '🌈', '🎀'];
        feedback.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        feedback.className = 'feedback show';

        createStarBurst();

        if (state.sessionCorrect % 3 === 0 && state.mode !== 'blitz') {
            launchConfetti();
        }

        disableChoices();
        setTimeout(nextProblem, state.mode === 'blitz' ? CONFIG.pace.blitzCorrect : CONFIG.pace.correct);

    } else {
        // Economy
        state.combo = 0;
        updateEconomyUI();
        saveGame();

        answerDisplay.textContent = userAnswer;
        answerDisplay.className = 'problem-answer wrong';

        if (btnElement) btnElement.classList.add('wrong');

        if (state.inputMode === 'numpad') {
            document.getElementById('numpad-display').textContent = '✗ ' + userAnswer;
        }

        problemContainer.classList.add('shake');

        const sadEmojis = ['😅', '🤔', '💪', '🙈'];
        feedback.textContent = sadEmojis[Math.floor(Math.random() * sadEmojis.length)];
        feedback.className = 'feedback show';

        setTimeout(() => {
            answerDisplay.textContent = state.currentProblem.answer;
            answerDisplay.className = 'problem-answer correct';

            if (state.inputMode === 'choices') {
                for (let i = 0; i < 4; i++) {
                    const btn = document.getElementById(`choice-${i}`);
                    if (parseInt(btn.dataset.value) === state.currentProblem.answer) {
                        btn.classList.add('correct');
                    }
                }
            }

            if (state.inputMode === 'numpad') {
                document.getElementById('numpad-display').textContent = 'Відповідь: ' + state.currentProblem.answer;
            }
        }, 800);

        disableChoices();
        setTimeout(nextProblem, state.mode === 'blitz' ? CONFIG.pace.blitzWrong : CONFIG.pace.wrong);
    }
}

function disableChoices() {
    for (let i = 0; i < 4; i++) {
        document.getElementById(`choice-${i}`).disabled = true;
    }
    enableNumpad(false);
}

// ===== COMPLETION SCREEN =====
function showCompletion() {
    const correct = state.sessionCorrect;
    const total = state.mode === 'blitz' ? state.round - 1 : state.totalRounds;
    let percent = total > 0 ? Math.round((correct / total) * 100) : 0;

    // Save to history
    saveSession(state.mode, state.difficultyLabel || modeLabel(state.mode), correct, total);

    document.getElementById('stat-correct').textContent = correct;
    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-percent').textContent = percent + '%';

    const completeEmoji = document.getElementById('complete-emoji');
    const subtitle = document.getElementById('complete-subtitle');

    if (state.mode === 'blitz') {
        if (correct > state.blitzRecord) {
            completeEmoji.textContent = '🔥';
            subtitle.textContent = `Новий рекорд! Ти перевершив себе (Минулий: ${state.blitzRecord})`;
            state.blitzRecord = correct;
            saveGame(true);
        } else {
            completeEmoji.textContent = '⏱️';
            subtitle.textContent = `Час вийшов! Твій рекорд: ${state.blitzRecord}`;
        }
    } else {
        if (percent === 100) {
            completeEmoji.textContent = '🏆';
            subtitle.textContent = 'Ідеально! Ти справжня зірка! 🌟';
        } else if (percent >= 80) {
            completeEmoji.textContent = '🎉';
            subtitle.textContent = 'Відмінно! Так тримати! 💪';
        } else if (percent >= 60) {
            completeEmoji.textContent = '😊';
            subtitle.textContent = 'Добре! Ще трохи практики! 📚';
        } else {
            completeEmoji.textContent = '💪';
            subtitle.textContent = 'Не здавайся! Спробуй ще раз! 🌈';
        }
    }

    const starsContainer = document.getElementById('complete-stars');
    starsContainer.innerHTML = '';
    for (let i = 0; i < total; i++) {
        const star = document.createElement('span');
        star.className = 'star';
        star.textContent = i < correct ? '⭐' : '☆';
        star.style.animationDelay = `${i * 0.08}s`;
        starsContainer.appendChild(star);
    }

    showScreen('screen-complete');

    if (percent >= 60) {
        setTimeout(launchConfetti, 300);
        if (percent === 100) {
            setTimeout(launchConfetti, 800);
            setTimeout(launchConfetti, 1300);
        }
    }

    document.getElementById('progress-bar').style.width = '100%';
}

function playAgain() {
    startGame();
}

// ===== CALENDAR =====
const MONTH_NAMES = [
    'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
    'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
];

const MONTH_NAMES_GEN = [
    'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
    'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'
];

const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

function showCalendar() {
    renderCalendar();
    showScreen('screen-calendar');
}

function calendarPrevMonth() {
    state.calendarMonth--;
    if (state.calendarMonth < 0) {
        state.calendarMonth = 11;
        state.calendarYear--;
    }
    renderCalendar();
}

function calendarNextMonth() {
    state.calendarMonth++;
    if (state.calendarMonth > 11) {
        state.calendarMonth = 0;
        state.calendarYear++;
    }
    renderCalendar();
}

function renderCalendar() {
    const year = state.calendarYear;
    const month = state.calendarMonth;

    document.getElementById('cal-month-label').textContent =
        `${MONTH_NAMES[month]} ${year}`;

    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';

    // Day headers
    DAY_NAMES.forEach(day => {
        const header = document.createElement('div');
        header.className = 'cal-day-header';
        header.textContent = day;
        grid.appendChild(header);
    });

    // First day of month (0 = Sun, adjust to Monday-first)
    const firstDay = new Date(year, month, 1).getDay();
    const startOffset = firstDay === 0 ? 6 : firstDay - 1; // Mon = 0

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const datesWithHistory = getDatesWithHistory();
    const today = new Date().toISOString().split('T')[0];

    // Empty cells before start
    for (let i = 0; i < startOffset; i++) {
        const empty = document.createElement('div');
        empty.className = 'cal-day empty';
        grid.appendChild(empty);
    }

    // Day cells
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const cell = document.createElement('div');
        cell.className = 'cal-day';

        if (dateStr === today) cell.classList.add('today');

        if (datesWithHistory.has(dateStr)) {
            cell.classList.add('has-data');
            cell.onclick = () => showDayDetails(dateStr, d);
        }

        cell.innerHTML = `<span class="cal-day-num">${d}</span>`;

        if (datesWithHistory.has(dateStr)) {
            const sessions = getHistoryForDate(dateStr);
            const dot = document.createElement('div');
            dot.className = 'cal-day-dots';
            const count = Math.min(sessions.length, 5);
            for (let i = 0; i < count; i++) {
                const d2 = document.createElement('span');
                d2.className = 'cal-dot';
                const modeClass = sessions[i].mode || 'addition';
                d2.classList.add('dot-' + modeClass);
                dot.appendChild(d2);
            }
            cell.appendChild(dot);
        }

        grid.appendChild(cell);
    }

    // Hide day details when switching months
    document.getElementById('day-details').style.display = 'none';

    // Show/hide empty message
    const allHistory = getHistory();
    const monthHistory = allHistory.filter(h => {
        const d = new Date(h.date);
        return d.getFullYear() === year && d.getMonth() === month;
    });
    document.getElementById('calendar-empty').style.display =
        monthHistory.length === 0 ? 'block' : 'none';
}

function showDayDetails(dateStr, dayNum) {
    const sessions = getHistoryForDate(dateStr);
    const month = parseInt(dateStr.split('-')[1]) - 1;

    document.getElementById('day-details-title').textContent =
        `${dayNum} ${MONTH_NAMES_GEN[month]}`;

    const list = document.getElementById('day-details-list');
    list.innerHTML = '';

    sessions.sort((a, b) => a.timestamp - b.timestamp);

    sessions.forEach(session => {
        const meta = MODE_META[session.mode] || {};
        const percent = Math.round((session.correct / session.total) * 100);
        const item = document.createElement('div');
        item.className = 'day-detail-item';
        item.style.borderLeftColor = meta.color || 'var(--pink-light)';

        let emoji = '💪';
        if (percent === 100) emoji = '🏆';
        else if (percent >= 80) emoji = '🎉';
        else if (percent >= 60) emoji = '😊';

        item.innerHTML = `
            <div class="detail-header">
                <span class="detail-mode">${(meta.icon ? meta.icon + ' ' : '') + (meta.label || session.mode)}</span>
                <span class="detail-time">${session.time || ''}</span>
            </div>
            <div class="detail-body">
                <span class="detail-emoji">${emoji}</span>
                <span class="detail-score">${session.correct}/${session.total}</span>
                <span class="detail-percent">${percent}%</span>
                <span class="detail-difficulty">${session.difficulty || ''}</span>
            </div>
        `;
        list.appendChild(item);
    });

    document.getElementById('day-details').style.display = 'block';
    document.getElementById('day-details').scrollIntoView({ behavior: 'smooth' });
}

// ===== VISUAL EFFECTS =====

function createStarBurst() {
    const stars = ['⭐', '🌟', '✨', '💫', '🎀'];
    const container = document.body;

    for (let i = 0; i < 6; i++) {
        const star = document.createElement('div');
        star.className = 'star-burst';
        star.textContent = stars[Math.floor(Math.random() * stars.length)];

        const problemRect = document.getElementById('problem-container').getBoundingClientRect();
        star.style.left = `${problemRect.left + problemRect.width / 2}px`;
        star.style.top = `${problemRect.top + problemRect.height / 2}px`;

        const angle = (Math.PI * 2 * i) / 6 + Math.random() * 0.5;
        const distance = 60 + Math.random() * 80;
        star.style.setProperty('--tx', `${Math.cos(angle) * distance}px`);
        star.style.setProperty('--ty', `${Math.sin(angle) * distance}px`);

        container.appendChild(star);
        setTimeout(() => star.remove(), 1000);
    }
}

// --- Confetti ---
const confettiCanvas = document.getElementById('confetti-canvas');
const confettiCtx = confettiCanvas.getContext('2d');
let confettiPieces = [];
let confettiAnimating = false;

function resizeConfetti() {
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
}
resizeConfetti();
window.addEventListener('resize', resizeConfetti);

function launchConfetti() {
    const colors = [
        '#FF8FA3', '#FFB6C1', '#C9A8E8', '#E8D5F5',
        '#7DD4B0', '#B5EAD7', '#FFE066', '#FFF3B0',
        '#84C9F5', '#BAE1FF', '#FFDAB9', '#FFB87A',
    ];

    for (let i = 0; i < 50; i++) {
        confettiPieces.push({
            x: Math.random() * confettiCanvas.width,
            y: -20 - Math.random() * 100,
            w: 8 + Math.random() * 6,
            h: 6 + Math.random() * 4,
            color: colors[Math.floor(Math.random() * colors.length)],
            vx: (Math.random() - 0.5) * 6,
            vy: 2 + Math.random() * 4,
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 10,
            opacity: 1,
        });
    }

    if (!confettiAnimating) {
        confettiAnimating = true;
        animateConfetti();
    }
}

function animateConfetti() {
    confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);

    confettiPieces = confettiPieces.filter(p => p.opacity > 0);

    if (confettiPieces.length === 0) {
        confettiAnimating = false;
        return;
    }

    confettiPieces.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05;
        p.rotation += p.rotationSpeed;
        p.vx *= 0.99;

        if (p.y > confettiCanvas.height - 50) {
            p.opacity -= 0.02;
        }

        confettiCtx.save();
        confettiCtx.translate(p.x, p.y);
        confettiCtx.rotate((p.rotation * Math.PI) / 180);
        confettiCtx.globalAlpha = Math.max(0, p.opacity);
        confettiCtx.fillStyle = p.color;
        confettiCtx.beginPath();
        confettiCtx.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, 2);
        confettiCtx.fill();
        confettiCtx.restore();
    });

    requestAnimationFrame(animateConfetti);
}

// --- Floating Decorations ---
function createFloatingDecorations() {
    const container = document.getElementById('floating-decorations');
    const items = ['🌸', '⭐', '🌈', '💖', '✨', '🦋', '🎀', '🌷', '🍀', '🎵'];

    for (let i = 0; i < 12; i++) {
        const item = document.createElement('div');
        item.className = 'floating-item';
        item.textContent = items[Math.floor(Math.random() * items.length)];
        item.style.left = `${Math.random() * 100}%`;
        item.style.top = `${Math.random() * 100}%`;
        item.style.animationDelay = `${Math.random() * 20}s`;
        item.style.animationDuration = `${15 + Math.random() * 15}s`;
        item.style.fontSize = `${1 + Math.random() * 1.5}rem`;
        container.appendChild(item);
    }
}

// ===== ACHIEVEMENTS =====
const ACHIEVEMENTS_DEF = [
    { id: 'first_blood', title: 'Перший крок', desc: 'Виріши 1 приклад', emoji: '🐣', requirement: { type: 'total', count: 1 } },
    { id: 'master_100', title: 'Майстер', desc: 'Виріши 100 прикладів', emoji: '🎓', requirement: { type: 'total', count: 100 } },
    { id: 'combo_10', title: 'Нестримний', desc: 'Збери комбо 10', emoji: '🔥', requirement: { type: 'combo', count: 10 } },
    { id: 'streak_3', title: 'Марафонець', desc: 'Виконай Завдання дня 3 дні поспіль', emoji: '🏃', requirement: { type: 'streak', count: 3 } },
    { id: 'speed_3', title: 'Блискавка', desc: 'Дай відповідь швидше ніж за 3 сек', emoji: '⚡', requirement: { type: 'speed', time: 3000 } }
];

function checkAchievements(timeTaken = 999999) {
    if (!state.achievements) state.achievements = [];
    const unlocked = new Set(state.achievements);
    let newUnlock = false;

    let totalCorrect = state.sessionCorrect || 0;
    if (state.history) {
        state.history.forEach(h => totalCorrect += (h.correct || 0));
    }

    ACHIEVEMENTS_DEF.forEach(ach => {
        if (!unlocked.has(ach.id)) {
            let met = false;
            if (ach.requirement.type === 'total' && totalCorrect >= ach.requirement.count) met = true;
            if (ach.requirement.type === 'combo' && state.combo >= ach.requirement.count) met = true;
            if (ach.requirement.type === 'streak' && state.daily && state.daily.streak >= ach.requirement.count) met = true;
            if (ach.requirement.type === 'speed' && timeTaken <= ach.requirement.time) met = true;

            if (met) {
                state.achievements.push(ach.id);
                newUnlock = true;
                setTimeout(() => showNotification('🏆 ' + ach.title, ach.desc, ach.emoji), 1000);
            }
        }
    });

    if (newUnlock) {
        saveGame();
    }
}

function showAchievements() {
    const list = document.getElementById('achievements-list');
    list.innerHTML = '';
    
    if (!state.achievements) state.achievements = [];
    const unlocked = new Set(state.achievements);

    ACHIEVEMENTS_DEF.forEach((ach, i) => {
        const isUnlocked = unlocked.has(ach.id);
        const card = document.createElement('div');
        card.className = 'achievement-card ' + (isUnlocked ? 'unlocked' : 'locked');
        card.style.animationDelay = `${i * 0.1}s`;
        
        card.innerHTML = `
            <div class="ach-emoji">${isUnlocked ? ach.emoji : '🔒'}</div>
            <div class="ach-info">
                <div class="ach-title">${ach.title}</div>
                <div class="ach-desc">${ach.desc}</div>
            </div>
        `;
        list.appendChild(card);
    });

    showScreen('screen-achievements');
}

// ===== SHOP =====
function showShop() {
    updateEconomyUI();
    document.getElementById('msg-time-15-success').style.display = 'none';
    document.getElementById('msg-time-15-error').style.display = 'none';
    document.getElementById('msg-time-60-success').style.display = 'none';
    document.getElementById('msg-time-60-error').style.display = 'none';
    
    // update button text
    const btn15 = document.getElementById('btn-buy-time-15');
    if (state.coins >= 30) {
        btn15.textContent = 'Обміняти (30 💰)';
        btn15.classList.remove('disabled');
        btn15.disabled = false;
    } else {
        btn15.textContent = 'Не вистачає монет';
        btn15.classList.add('disabled');
        btn15.disabled = true;
    }

    const btn60 = document.getElementById('btn-buy-time-60');
    if (state.coins >= 100) {
        btn60.textContent = 'Обміняти (100 💰)';
        btn60.classList.remove('disabled');
        btn60.disabled = false;
    } else {
        btn60.textContent = 'Не вистачає монет';
        btn60.classList.add('disabled');
        btn60.disabled = true;
    }
    
    showScreen('screen-shop');
}

function buyRobloxTime(minutes, cost) {
    const buyBtn = document.getElementById(`btn-buy-time-${minutes}`);
    const successMsg = document.getElementById(`msg-time-${minutes}-success`);
    const errorMsg = document.getElementById(`msg-time-${minutes}-error`);
    
    if (state.coins >= cost) {
        state.coins -= cost;
        state.robloxTime += minutes;
        updateEconomyUI();
        saveGame(true);
        
        successMsg.style.display = 'block';
        errorMsg.style.display = 'none';
        
        // Fireworks
        setTimeout(launchConfetti, 100);
        setTimeout(launchConfetti, 500);
        setTimeout(launchConfetti, 900);
        
        // Disable button briefly or update states
        setTimeout(() => {
            showShop(); // refreshes UI
            successMsg.style.display = 'block'; // keep it visible for a bit
            setTimeout(() => successMsg.style.display = 'none', 3000);
        }, 100);
    } else {
        successMsg.style.display = 'none';
        errorMsg.style.display = 'block';
        
        buyBtn.classList.add('shake');
        setTimeout(() => buyBtn.classList.remove('shake'), 400);
    }
}

// ===== INIT =====
createFloatingDecorations();

// Polyfill roundRect if needed
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
        if (w < 2 * r) r = w / 2;
        if (h < 2 * r) r = h / 2;
        this.moveTo(x + r, y);
        this.arcTo(x + w, y, x + w, y + h, r);
        this.arcTo(x + w, y + h, x, y + h, r);
        this.arcTo(x, y + h, x, y, r);
        this.arcTo(x, y, x + w, y, r);
        this.closePath();
    };
}

// Flush any pending debounced save when the tab is hidden or closed
window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && saveTimer && state.userId) saveGame(true);
});
window.addEventListener('beforeunload', () => {
    if (saveTimer && state.userId) saveGame(true);
});

// Start auth flow
setTimeout(initAuth, 100);

