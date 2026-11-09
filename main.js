// ===== MATH GAME STATE =====
const state = {
    mode: null,        // 'addition' | 'subtraction' | 'multiplication'
    maxNum: 20,        // limit for problems
    difficultyLabel: '',
    inputMode: 'numpad', // answers are always typed
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
    mixMode: null,     // which mode opened the custom-mix picker
    mixSelected: [],   // numbers the child chose for the custom mix
    examQueue: [],     // pre-built list of 100 facts for the exam mode
    examResults: [],   // per-question outcomes for end-of-exam analysis {a,b,answer,user,correct}
    session: null,     // active unfinished session snapshot (resumed on return; blocks restart)
    sessionCoins: 0,   // монети, нараховані в поточній сесії (для звіту батькам)
    sessionLog: [],    // per-question log for the +/- results table {label, answer, user, correct, timeMs}
    // Crossing tens mode
    crossingTens: false,
    crossingStep: 0,
    crossingData: null,
    crossingInputValue: '',
    crossingMiss: false, // у поточному прикладі «Крок за кроком» уже була помилка
    tensLevel: null,     // «Через десяток»: 'bonds' | 'steps' | 'self' | 'big'
    // Calendar
    calendarYear: new Date().getFullYear(),
    calendarMonth: new Date().getMonth(),
    // Economy & Auth
    userId: null,
    coins: 0,
    combo: 0,
    robloxTime: 0,
    robuxOwed: 0, // Robux the child has earned and the parent still owes (delivered manually)
    daily: { date: '', count: 0, streak: 0, tasksDone: 0, multLimits: {}, choicesUsed: 0 },
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
    dailyGoal: 100,          // legacy (v1 goal of 100 answers); kept to migrate old saves' streaks
    dailyBonus: 50,          // coins for the FIRST completed daily task each day (also grows the streak)
    dailyRepeatBonus: 15,    // coins for every following completed daily task the same day
    multRewardFull: 1,       // множення «Вся таблиця» — монет за відповідь
    multRewardOther: 1,      // окремі таблиці 3–9 і «Свій мікс»; за множення на 2 — 0 завжди
    easyDailyAnswers: 20,    // скільки відповідей на «легкому» контенті (2/5) оплачується за день ≈ одна сесія
    examMaxErrors: 2,        // exam is passed with fewer than 3 mistakes (i.e. ≤ this many)
    examPassBonus: 50,       // coins for passing the exam
    goatExamMax: 30,         // goat exam: +/− within this bound (crossing-ten only)
    goatOpMin: 3,            // «Тренування на Весну»: скільки додаємо / віднімаємо — від goatOpMin
    goatOpMax: 19,           //   до goatOpMax (25−8, 8+15, 24−13), завжди з переходом через десяток
    goatExamPassBonus: 100,
    tensStepsRounds: 10,     // «Через десяток → Крок за кроком»: прикладів у рівні (кожен — 3 відповіді)
    bondsDailyAnswers: 20,   // «Друзі числа 10» — легкий рівень: оплачується стільки відповідей на день  // coins for passing the goat exam (the real prize is the Goat Simulator DLC)
    // Ставки модуля англійської (english/english.js). Їх змінює лише математична сесія —
    // модуль читає ці числа й нараховує монети тільки через awardCoins().
    english: {
        rewardTyped: 2,      // відповідь, набрана самостійно (слово, літери)
        rewardChoice: 1,     // вибір із варіантів / тап по картинці — вгадується, тому дешевше
        rewardMastered: 0,   // уже вивчене слово (як «× 2» у множенні) — без монет
        firstTryOnly: true,  // монети лише за правильну відповідь з першої спроби
    },
    maxAwardPerCall: 200,    // запобіжник awardCoins(): більше за один виклик не нараховуємо (ловить баги)
    robuxRate: 10,           // coins per 1 Robux
    robuxDailyLimit: 30,     // max Robux the child can exchange per day (budget guard)
    saveDebounceMs: 2000,    // coalesce Firebase writes within this window
    historyCap: 400,         // keep only the most recent N sessions (Firestore doc size)
    // Delay (ms) after an answer before the next problem appears — tune the pacing here
    pace: {
        correct: 700,        // correct answer → next (normal modes)
        wrong: 1800,         // wrong answer → next (longer: time to read the right answer)
        blitzCorrect: 450,   // correct, blitz
        blitzWrong: 900,     // wrong, blitz
        crossingDone: 900,   // "через десяток" problem solved → next
        hint: 4200           // wrong +/- with a make-ten hint shown → time to read it
    }
};

// Per-mode metadata: label (UI/history), calendar color, and coin reward per correct answer.
// crossingReward applies to the step-by-step "через десяток" variant of add/sub.
const MODE_META = {
    addition:       { icon: '➕',  label: 'Додавання',   color: 'var(--pink-light)', reward: 1, crossingReward: 1 },
    subtraction:    { icon: '➖',  label: 'Віднімання',  color: 'var(--lavender)',   reward: 1, crossingReward: 1 },
    multiplication: { icon: '✖️', label: 'Множення',    color: 'var(--mint)',       reward: 1 },
    division:       { icon: '➗',  label: 'Ділення',     color: 'var(--sky)',        reward: 1 },
    plusminus:      { icon: '➕➖', label: 'Плюс-мінус',  color: 'var(--peach)',      reward: 1 },
    logic:          { icon: '🧩', label: 'Логіка',      color: 'var(--peach)',      reward: 1 },
    blitz:          { icon: '⏱️', label: 'Бліц-Турнір', color: 'var(--yellow)',     reward: 1 },
    exam:           { icon: '📝', label: 'Екзамен',     color: 'var(--gold)' }, // reward handled at completion
    goatexam:       { icon: '🌷', label: 'Тренування на Весну', color: '#CBE8A8' }, // бонус за проходження в кінці, як в екзамені
    tens:           { icon: '🔟', label: 'Через десяток', color: '#FFD8A8', reward: 1, crossingReward: 1 }
};

// Режими з готовою чергою на 100 прикладів і бонусом за проходження (без монет за відповідь).
// id «goatexam» лишився від «Екзамену козла» — зараз це «Тренування на Весну»; не перейменовуємо,
// щоб не зламати історію та статистику.
function isExamMode(mode) { return mode === 'exam' || mode === 'goatexam'; }

// «Тихий» екзамен — без підказок «правильно/ні» під час проходження. Тепер це лише множення:
// «Тренування на Весну» показує результат і пояснює кожну помилку.
function isSilentExam(mode) { return mode === 'exam'; }

function modeLabel(mode) { return (MODE_META[mode] && MODE_META[mode].label) || mode; }

// ===== ПРЕДМЕТИ (математика + модулі з інших сесій, напр. english/english.js) =====
// Математика вбудована. Інші предмети реєструються зі своїх файлів викликом registerSubject()
// під час завантаження скрипта. Поки зареєстровано лише математику, вибору предмета немає —
// після входу одразу відкривається меню, як і раніше.
const SUBJECTS = [
    { id: 'math', icon: '🧮', label: 'Математика', desc: 'Приклади, таблиця множення, логіка', start: () => goToMenu() }
];

// subj: { id, icon, label, desc, start(), onLogin(userDoc)?, onLogout()? }
function registerSubject(subj) {
    if (!subj || !subj.id || typeof subj.start !== 'function') {
        console.warn('registerSubject: потрібні id і start()', subj);
        return false;
    }
    if (SUBJECTS.some(x => x.id === subj.id)) {
        console.warn('registerSubject: такий предмет уже є', subj.id);
        return false;
    }
    SUBJECTS.push(subj);
    return true;
}

// Хуки предметів обгорнуті в try/catch: помилка в іншому модулі не має ламати вхід у математику.
function callSubjectHook(name, arg) {
    SUBJECTS.forEach(x => {
        if (typeof x[name] !== 'function') return;
        try { x[name](arg); } catch (e) { console.error(`Предмет «${x.id}»: помилка в ${name}()`, e); }
    });
}

// Куди йти після входу: вибір предмета, якщо їх більше одного, інакше — меню математики.
function enterApp() {
    if (SUBJECTS.length > 1) showSubjectPicker();
    else goToMenu();
}

function showSubjectPicker() {
    const list = document.getElementById('subject-list');
    list.innerHTML = '';
    SUBJECTS.forEach(x => {
        const card = document.createElement('div');
        card.className = 'subject-card';
        card.id = 'subject-' + x.id;
        card.innerHTML = `
            <div class="subject-icon">${x.icon || '📘'}</div>
            <div class="subject-text">
                <div class="subject-label">${x.label}</div>
                <div class="subject-desc">${x.desc || ''}</div>
            </div>`;
        card.onclick = () => {
            try { x.start(); }
            catch (e) {
                console.error(`Предмет «${x.id}»: помилка в start()`, e);
                showNotification('Ой, цей розділ ще не працює', 'Спробуй інший предмет 🙂', '🛠️');
            }
        };
        list.appendChild(card);
    });
    showScreen('screen-subject');
}

// Режими інших предметів — для історії, календаря і звіту батькам.
// id обов'язково з префіксом предмета («en-words», «en-letters»…), тож з математикою не перетнуться.
function registerMode(id, meta) {
    if (!/^[a-z]{2}-[a-z0-9-]+$/.test(id) || MODE_META[id]) {
        console.warn('registerMode: id має бути новим і з префіксом предмета (en-…)', id);
        return false;
    }
    MODE_META[id] = meta;
    return true;
}

// ЄДИНИЙ спосіб для інших предметів нарахувати монети. Баланс спільний (state.coins), а пише
// його в базу лише математика (saveGame) — тож він ніколи не роздвоюється між предметами.
// source — підпис для журналу, напр. 'en-words'.
function awardCoins(amount, source) {
    if (!Number.isInteger(amount) || amount < 0 || amount > CONFIG.maxAwardPerCall) {
        console.warn('awardCoins: відхилено', amount, source);
        return 0;
    }
    if (!state.userId || amount === 0) return 0;
    state.coins += amount;
    updateEconomyUI();
    saveGame();
    return amount;
}

// Завершена сесія іншого предмета → у спільну історію (календар, звіт батькам, досягнення).
// coins — скільки монет фактично нараховано за сесію через awardCoins().
function recordSubjectSession(mode, label, correct, total, coins, extra) {
    if (!MODE_META[mode]) console.warn('recordSubjectSession: спершу registerMode()', mode);
    saveSession(mode, label, correct, total, Object.assign({}, extra || {}, { coins: coins || 0 }));
}

// ===== FIREBASE & HISTORY =====
async function saveToFirebase() {
    if (!state.userId) return;
    const data = {
        coins: state.coins,
        combo: state.combo,
        robloxTime: state.robloxTime,
        robuxOwed: state.robuxOwed || 0,
        daily: state.daily,
        achievements: state.achievements,
        blitzRecord: state.blitzRecord,
        history: state.history,
        stats: state.stats,
        activeSession: state.session || null
    };
    try {
        // mergeFields: замінюємо цілком лише ці поля. Дані інших предметів (поле «english»)
        // лежать у тому ж документі — звичайний set() стирав би їх при кожному збереженні.
        await db.collection("users").doc(state.userId).set(data, { mergeFields: Object.keys(data) });
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
    if (gameCoins) gameCoins.textContent = '+' + (state.sessionCoins || 0); // за цей рівень, зарахується в кінці
    if (gameCombo) gameCombo.textContent = state.combo;
    
    // Shop
    const shopCoins = document.getElementById('shop-coins');
    if (shopCoins) shopCoins.textContent = state.coins;
    const shopRobux = document.getElementById('shop-robux');
    if (shopRobux) shopRobux.textContent = state.robuxOwed || 0;

    // Global Header
    const globCoins = document.getElementById('global-total-coins');
    if (globCoins) globCoins.textContent = state.coins;
    const globRobloxTime = document.getElementById('global-roblox-time');
    if (globRobloxTime) globRobloxTime.textContent = state.robloxTime;
}

// Режими, які по черзі стають «завданням дня» (бліц та екзамен — ні)
const DAILY_TASK_MODES = ['addition', 'multiplication', 'subtraction', 'logic', 'division', 'plusminus', 'tens'];

// Чи зараховується цей рівень у завдання дня. «Через десяток» — лише «Сам» і «Великі числа»:
// «Друзі числа 10» надто легкі, а «Крок за кроком» — це підказка, а не самостійний рахунок.
function isDailyTaskSession() {
    if (state.mode !== dailyTaskMode()) return false;
    if (state.mode === 'tens') return state.tensLevel === 'self' || state.tensLevel === 'big';
    return true;
}

// Який режим потрібен для поточного завдання дня. Порядок стабільний упродовж дня,
// але щодня починається з іншого режиму (зсув рахуємо з дати) — щоб не приїдалось.
function dailyTaskMode() {
    const d = (state.daily && state.daily.date) || new Date().toLocaleDateString('en-CA');
    let seed = 0;
    for (let i = 0; i < d.length; i++) seed = (seed * 31 + d.charCodeAt(i)) % 997;
    const done = (state.daily && state.daily.tasksDone) || 0;
    return DAILY_TASK_MODES[(seed + done) % DAILY_TASK_MODES.length];
}

function updateDailyUI() {
    const dailyTitle = document.getElementById('daily-title');
    const dailyDesc = document.getElementById('daily-task-desc');
    const dailyStreak = document.getElementById('daily-streak');
    const dailyMedals = document.getElementById('daily-medals');

    const done = (state.daily && state.daily.tasksDone) || 0;
    if (dailyTitle) dailyTitle.textContent = `🎯 Завдання дня №${done + 1}`;
    if (dailyDesc) {
        const meta = MODE_META[dailyTaskMode()] || {};
        const extra = dailyTaskMode() === 'tens' ? ' («Сам» або «Великі числа»)' : '';
        dailyDesc.innerHTML = `Пройди рівень <b>${meta.icon || ''} ${meta.label || ''}</b>${extra} без помилок!`;
    }
    if (dailyStreak) dailyStreak.textContent = state.daily.streak;
    if (dailyMedals) {
        if (done === 0) {
            dailyMedals.innerHTML = '<span class="daily-medals-empty">Тут з\'являться твої медалі</span>';
        } else if (done <= 12) {
            dailyMedals.textContent = '🏅'.repeat(done);
        } else {
            dailyMedals.textContent = `🏅 × ${done}`;
        }
    }
}

// «Завдання дня» — нескінченний ланцюжок: рівень ПОТРІБНОГО режиму (dailyTaskMode),
// пройдений повністю без помилок, закриває поточне завдання, і одразу з'являється
// наступне — вже з іншим режимом, щоб дитина не проходила одне й те саме.
// Перше виконане завдання за день дає dailyBonus і рухає серію, наступні — dailyRepeatBonus.
function completeDailyTask() {
    if (!state.daily) return;
    if (typeof state.daily.tasksDone !== 'number') state.daily.tasksDone = 0;
    const first = state.daily.tasksDone === 0;
    state.daily.tasksDone++;
    if (first) state.daily.streak++;
    const bonus = first ? CONFIG.dailyBonus : CONFIG.dailyRepeatBonus;
    state.coins += bonus;
    const n = state.daily.tasksDone;
    const nextMeta = MODE_META[dailyTaskMode()] || {};
    setTimeout(() => showNotification(
        `Завдання дня №${n} виконано! 🏅`,
        `+${bonus} монет!` + (first ? ` Серія: ${state.daily.streak} дн.` : '') +
        ` Наступне завдання: ${nextMeta.icon || ''} ${nextMeta.label || ''} 😉`,
        '🎯'), 600);
    updateDailyUI();
    updateEconomyUI();
    saveGame(true);
}

function checkDailyReset() {
    const today = new Date().toLocaleDateString('en-CA'); // e.g. "2026-04-11"
    if (state.daily.date !== today) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toLocaleDateString('en-CA');
        
        // Серія зберігається, якщо вчора було виконано хоча б одне завдання дня
        if (state.daily.date !== yesterdayStr || (state.daily.tasksDone || 0) < 1) {
            state.daily.streak = 0;
        }
        state.daily.count = 0;
        state.daily.tasksDone = 0;
        state.daily.date = today;
        state.daily.multLimits = {};
        state.daily.choicesUsed = 0;
        state.daily.robuxToday = 0;
        saveGame(true);
    }
    updateDailyUI();
}

function getHistory() {
    return state.history || [];
}

function saveSession(mode, difficultyLabel, correct, total, extra) {
    const history = getHistory();
    const now = new Date();
    const record = {
        date: now.toISOString().split('T')[0], // "2026-03-28"
        mode: mode,
        difficulty: difficultyLabel,
        correct: correct,
        total: total,
        timestamp: now.getTime(),
        time: now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    };
    if (extra) Object.assign(record, extra); // e.g. exam mistakes/passed
    history.push(record);
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
        let userDoc = {};   // увесь документ — іншим предметам (вони беруть своє поле, напр. english)
        if (docSnap.exists) {
            const data = docSnap.data();
            userDoc = data;
            state.coins = data.coins || 0;
            state.combo = data.combo || 0;
            state.robloxTime = data.robloxTime || data.robux || 0;
            state.robuxOwed = data.robuxOwed || 0;
            state.daily = data.daily || { date: '', count: 0, streak: 0, tasksDone: 0, multLimits: {}, choicesUsed: 0 };
            if (!state.daily.multLimits) state.daily.multLimits = {};
            if (typeof state.daily.tasksDone !== 'number') {
                // Міграція зі старої механіки (100 відповідей/день): досягнута стара ціль = 1 виконане завдання
                state.daily.tasksDone = (state.daily.count || 0) >= CONFIG.dailyGoal ? 1 : 0;
            }
            state.achievements = data.achievements || [];
            state.blitzRecord = data.blitzRecord || 0;
            state.history = data.history || [];
            state.stats = data.stats || {};
            state.session = data.activeSession || null;
        } else {
            // New user
            state.coins = 0;
            state.combo = 0;
            state.robloxTime = 0;
            state.robuxOwed = 0;
            state.daily = { date: '', count: 0, streak: 0, tasksDone: 0, multLimits: {}, choicesUsed: 0 };
            state.achievements = [];
            state.blitzRecord = 0;
            state.history = [];
            state.stats = {};
            state.session = null;
            await docRef.set({ coins: 0, combo: 0, robloxTime: 0, robuxOwed: 0, daily: state.daily, achievements: [], blitzRecord: 0, history: [], stats: {}, activeSession: null });
        }
        
        state.userId = pin;
        localStorage.setItem('savedPin', pin);
        checkDailyReset();
        updateEconomyUI();
        callSubjectHook('onLogin', userDoc);
        document.getElementById('btn-login').textContent = 'Увійти';
        document.getElementById('login-pin').value = '';
        enterApp();
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
    callSubjectHook('onLogout');
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
    window.scrollTo(0, 0); // always open a screen at the top (back button / title visible)
    screen.style.animation = 'none';
    screen.offsetHeight;
    screen.style.animation = '';
}

function goToMenu() {
    // Бліц не відновлюється: вийшла до кінця хвилини — накопичені монети не зараховуються.
    // Інші режими зберігають монети в знімку сесії й чекають «Продовжити».
    if (state.mode === 'blitz' && blitzTimer && (state.sessionCoins || 0) > 0) {
        showNotification('Бліц не завершено', `${state.sessionCoins} 💰 не зараховано — монети дають лише за повну хвилину`, '⏱️');
        state.sessionCoins = 0;
    }
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
    updateResumeBanner();
    const sw = document.getElementById('btn-switch-subject');
    if (sw) sw.style.display = SUBJECTS.length > 1 ? '' : 'none';
    showScreen('screen-menu');
}

// ===== SESSION PERSISTENCE (no restart loophole) =====
// A started 20-question game or exam is saved after every question and must be
// finished — pressing "back" no longer restarts it; the child resumes where they left off.
function isResumableMode() {
    return ['addition', 'subtraction', 'multiplication', 'division', 'logic', 'exam', 'goatexam', 'plusminus', 'tens'].includes(state.mode);
}

// Modes that get a per-question results table at the end (example / right-wrong / seconds)
function hasResultsTable(mode) {
    return ['addition', 'subtraction', 'plusminus', 'tens'].includes(mode);
}

function persistSession() {
    if (!isResumableMode()) return; // blitz etc. are not saved
    // Firestore rejects `undefined`, so coerce every optional field to null
    state.session = {
        mode: state.mode,
        round: state.round,
        score: state.score,
        sessionCorrect: state.sessionCorrect,
        totalRounds: state.totalRounds,
        difficultyLabel: state.difficultyLabel || null,
        inputMode: state.inputMode || 'numpad',
        minA: state.minA != null ? state.minA : null,
        maxA: state.maxA != null ? state.maxA : null,
        factors: state.factors || null,
        maxNum: state.maxNum != null ? state.maxNum : null,
        crossingTens: !!state.crossingTens,
        logicMode: state.logicMode || null,
        tensLevel: state.tensLevel || null,
        examQueue: isExamMode(state.mode) ? state.examQueue : null,
        examResults: isExamMode(state.mode) ? state.examResults : null,
        sessionCoins: state.sessionCoins || 0,
        coinsPending: true,   // монети знімка ще НЕ на рахунку (зараховуються в кінці рівня)
        sessionLog: state.sessionLog || []
    };
    saveGame();
}

function updateResumeBanner() {
    const banner = document.getElementById('resume-banner');
    if (!banner) return;
    const s = state.session;
    if (s && isResumableModeName(s.mode)) {
        banner.style.display = 'flex';
        const label = MODE_META[s.mode] ? MODE_META[s.mode].label : s.mode;
        document.getElementById('resume-sub').textContent = `${label} · питання ${s.round} з ${s.totalRounds}`;
    } else {
        banner.style.display = 'none';
    }
}

function isResumableModeName(mode) {
    return ['addition', 'subtraction', 'multiplication', 'division', 'logic', 'exam', 'goatexam', 'plusminus', 'tens'].includes(mode);
}

// Скидання незакінченої сесії — кнопка ✖ на банері «Продовжити» в меню.
// Для батьків: прогрес сесії згорає без нарахувань, тому питаємо підтвердження.
function resetActiveSession() {
    if (!state.session) return;
    const label = modeLabel(state.session.mode);
    const pending = state.session.sessionCoins || 0;
    if (!confirm(`Скинути незакінчену гру «${label}»? Її прогрес згорить` +
                 (pending ? ` разом із ${pending} 💰 за цей рівень.` : '.'))) return;
    state.session = null;
    state.sessionCoins = 0;
    state.examQueue = [];
    state.examResults = [];
    state.sessionLog = [];
    saveGame(true);
    updateResumeBanner();
    showNotification('Гру скинуто', 'Тепер можна почати будь-який режим 👍', '🗑️');
}

// Returns true and resumes if there's an unfinished session (used to block starting a new game)
function blockedBySession() {
    if (state.session && isResumableModeName(state.session.mode)) {
        resumeSession();
        return true;
    }
    return false;
}

function resumeSession() {
    const s = state.session;
    if (!s) return;
    state.mode = s.mode;
    state.difficultyLabel = s.difficultyLabel;
    state.inputMode = 'numpad';
    state.minA = s.minA; state.maxA = s.maxA; state.factors = s.factors;
    state.maxNum = s.maxNum; state.crossingTens = s.crossingTens; state.logicMode = s.logicMode;
    state.tensLevel = s.tensLevel || null;
    state.totalRounds = s.totalRounds;
    state.score = s.score;
    state.sessionCorrect = s.sessionCorrect;
    state.sessionLog = s.sessionLog || [];
    // Знімок зі старих правил (без coinsPending): ці монети вже зараховано одразу при відповідях —
    // не зараховуємо їх удруге в кінці рівня.
    state.sessionCoins = s.coinsPending ? (s.sessionCoins || 0) : 0;
    if (isExamMode(s.mode)) {
        state.examQueue = s.examQueue || [];
        state.examResults = s.examResults || [];
    }
    state.round = s.round - 1; // nextProblem() will ++ back to the saved question
    state.numpadValue = '';
    state.crossingStep = 0;
    state.crossingData = null;
    state.crossingInputValue = '';

    if (typeof blitzTimer !== 'undefined' && blitzTimer) clearInterval(blitzTimer);
    const btd = document.getElementById('blitz-timer-display');
    if (btd) btd.style.display = 'none';
    document.getElementById('progress-display').style.display = 'block';
    document.getElementById('score-value').textContent = state.score;
    document.getElementById('score-display').style.display = isSilentExam(s.mode) ? 'none' : '';
    document.getElementById('progress-total').textContent = state.totalRounds;

    showScreen('screen-game');
    nextProblem();
}

// ===== SUB-MENU =====
function showSubMenu(mode) {
    if (blockedBySession()) return; // must finish the active session first
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
                { emoji: '🌟', label: 'Двозначні', desc: 'До 100, без переходу через десяток', maxNum: 99, reward: 1 },
                // Тимчасово прихований — логіка збережена, повернути прибравши коментар:
                // { emoji: '🔟', label: 'Через десяток', desc: 'Розкладаємо через 10', crossing: true, reward: 2 },
            ]
        },
        subtraction: {
            icon: '➖',
            title: 'Віднімання',
            options: [
                { emoji: '🌟', label: 'Двозначні', desc: 'До 100, без переходу через десяток', maxNum: 99, reward: 1 },
                // Тимчасово прихований — логіка збережена, повернути прибравши коментар:
                // { emoji: '🔟', label: 'Через десяток', desc: 'Розкладаємо через 10', crossing: true, reward: 3 },
            ]
        },
        multiplication: {
            icon: '✖️',
            title: 'Множення',
            options: [
                { emoji: '🦋', label: 'Вся таблиця', desc: '2–9', minA: 2, maxA: 9, reward: 1 },
                { emoji: '🎛️', label: 'Свій мікс', desc: 'Обери числа', custom: true, reward: 1 },
                { emoji: '🦁', label: 'На 9', desc: 'Множення на 9', minA: 9, maxA: 9, reward: 1 },
                { emoji: '🐙', label: 'На 8', desc: 'Множення на 8', minA: 8, maxA: 8, reward: 1 },
                { emoji: '🦖', label: 'На 7', desc: 'Множення на 7', minA: 7, maxA: 7, reward: 1 },
                { emoji: '🐝', label: 'На 6', desc: 'Множення на 6', minA: 6, maxA: 6, reward: 1 },
                { emoji: '🦉', label: 'На 5', desc: 'Множення на 5', minA: 5, maxA: 5, reward: 1 },
                { emoji: '🦆', label: 'На 4', desc: 'Множення на 4', minA: 4, maxA: 4, reward: 1 },
                { emoji: '🐥', label: 'На 3', desc: 'Множення на 3', minA: 3, maxA: 3, reward: 1 },
                { emoji: '🐣', label: 'На 2', desc: 'Множення на 2', minA: 2, maxA: 2, reward: 1 },
            ]
        },
        division: {
            icon: '➗',
            title: 'Ділення',
            options: [
                { emoji: '🦋', label: 'Вся таблиця', desc: '2–9', minA: 2, maxA: 9, reward: 2 },
                { emoji: '🎛️', label: 'Свій мікс', desc: 'Обери числа', custom: true, reward: 2 },
                { emoji: '🦁', label: 'На 9', desc: 'Ділення на 9', minA: 9, maxA: 9, reward: 2 },
                { emoji: '🐙', label: 'На 8', desc: 'Ділення на 8', minA: 8, maxA: 8, reward: 2 },
                { emoji: '🦖', label: 'На 7', desc: 'Ділення на 7', minA: 7, maxA: 7, reward: 2 },
                { emoji: '🐝', label: 'На 6', desc: 'Ділення на 6', minA: 6, maxA: 6, reward: 2 },
                { emoji: '🦉', label: 'На 5', desc: 'Ділення на 5', minA: 5, maxA: 5, reward: 2 },
                { emoji: '🦆', label: 'На 4', desc: 'Ділення на 4', minA: 4, maxA: 4, reward: 2 },
                { emoji: '🐥', label: 'На 3', desc: 'Ділення на 3', minA: 3, maxA: 3, reward: 2 },
                { emoji: '🐣', label: 'На 2', desc: 'Ділення на 2', minA: 2, maxA: 2, reward: 2 },
            ]
        },
        tens: {
            icon: '🔟',
            title: 'Через десяток',
            options: [
                { emoji: '📖', label: 'Урок', desc: 'Як рахувати через 10 — з картинками', lesson: true },
                { emoji: '🤝', label: 'Друзі числа 10', desc: '10 = 7 + ?   6 = 4 + ?', level: 'bonds' },
                { emoji: '🪜', label: 'Крок за кроком', desc: '8 + 5: до 10, розклад, відповідь', level: 'steps', crossing: true },
                { emoji: '✍️', label: 'Сам', desc: '8 + 5, 13 − 7 — до 20', level: 'self' },
                { emoji: '🚀', label: 'Великі числа', desc: '27 + 5, 34 − 8 — до 100', level: 'big' },
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

    // Dense layout for long lists (×/÷) so every option fits on screen without scrolling
    const dense = config.options.length > 6;
    submenuContainer.classList.toggle('dense', dense);
    document.getElementById('screen-submenu').classList.toggle('dense', dense);

    // Бейдж показує справжні монети за відповідь для кожного варіанту
    const optionReward = opt => {
        if (mode === 'multiplication') {
            if (opt.minA === 2 && opt.maxA === 2) return 0;
            if (!opt.custom && opt.minA === 2 && opt.maxA === 9) return CONFIG.multRewardFull;
            return CONFIG.multRewardOther;
        }
        if (opt.lesson) return 0;
        return (MODE_META[mode] && MODE_META[mode].reward) || 1;
    };
    config.options.forEach((opt, i) => {
        const r = optionReward(opt);
        const card = document.createElement('div');
        card.className = 'difficulty-card slide-up' + (opt.lesson ? ' wide' : '');
        card.style.animationDelay = `${i * 0.05}s`;
        card.innerHTML = `
            <span class="diff-emoji">${opt.emoji}</span>
            <div class="diff-label">${opt.label}</div>
            <div class="diff-desc">${opt.desc}</div>
            <div class="diff-reward">${opt.lesson ? 'Почни звідси 👈' : (r ? '+' + r + ' 💰' : 'без монет')}</div>
        `;
        card.onclick = () => {
            if (opt.custom) { openMixModal(mode); return; } // let the child pick the numbers
            if (opt.lesson) { openTensLesson(0); return; }   // урок — не гра, без монет
            state.difficultyLabel = opt.label;
            state.crossingTens = opt.crossing || false;
            if (mode === 'multiplication' || mode === 'division') {
                state.factors = opt.factors || null;
                state.minA = opt.minA || 2;
                state.maxA = opt.maxA || 4;
            } else if (mode === 'logic') {
                state.logicMode = opt.type;
            } else if (mode === 'tens') {
                state.tensLevel = opt.level;
                state.maxNum = 20;
            } else {
                state.maxNum = opt.maxNum || 20;
            }
            startGame();
        };
        submenuContainer.appendChild(card);
    });

    showScreen('screen-submenu');
}

// ===== CUSTOM MIX (child picks which numbers to drill) =====
function openMixModal(mode) {
    state.mixMode = mode; // 'multiplication' | 'division'
    if (!state.mixSelected) state.mixSelected = [];
    const chips = document.getElementById('mix-chips');
    chips.innerHTML = '';
    for (let n = 2; n <= 9; n++) {
        const chip = document.createElement('button');
        const active = state.mixSelected.includes(n);
        chip.className = 'mix-chip' + (active ? ' active' : '');
        chip.textContent = n;
        chip.onclick = () => toggleMixChip(n, chip);
        chips.appendChild(chip);
    }
    document.getElementById('mix-modal-title').textContent =
        (mode === 'division' ? '➗' : '✖️') + ' Свій мікс';
    updateMixStartBtn();
    document.getElementById('mix-modal').style.display = 'flex';
}

function toggleMixChip(n, chip) {
    if (!state.mixSelected) state.mixSelected = [];
    const i = state.mixSelected.indexOf(n);
    if (i === -1) { state.mixSelected.push(n); chip.classList.add('active'); }
    else { state.mixSelected.splice(i, 1); chip.classList.remove('active'); }
    updateMixStartBtn();
}

function updateMixStartBtn() {
    const btn = document.getElementById('mix-start-btn');
    const n = (state.mixSelected || []).length;
    btn.disabled = n === 0;
    btn.textContent = n === 0 ? 'Обери числа' : `Почати (${n})`;
}

function closeMixModal() {
    document.getElementById('mix-modal').style.display = 'none';
}

function startCustomMix() {
    const factors = (state.mixSelected || []).slice().sort((a, b) => a - b);
    if (!factors.length) return;
    state.mode = state.mixMode;
    state.factors = factors;
    state.crossingTens = false;
    state.difficultyLabel = 'Мікс ' + factors.join('·');
    closeMixModal();
    startGame();
}

// ===== BLITZ MODE =====
let blitzTimer = null;
let blitzSeconds = 60;

function startBlitzMode() {
    state.sessionCoins = 0;
    state.maxNum = 20;   // пул прикладів для бліцу — в межах 20
    if (blockedBySession()) return; // finish the active session first
    state.mode = 'blitz';
    state.score = 0;
    state.sessionCorrect = 0;
    state.round = 0;
    state.difficultyLabel = 'Бліц';
    blitzSeconds = 60;

    document.getElementById('score-value').textContent = '0';
    document.getElementById('score-display').style.display = '';
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

// Core addition/subtraction facts within maxNum (single-digit operands 2..9,
// includes the crossing-the-ten facts that are the real weak spot).
// crossingOnly → keep only facts that cross the ten (sum > 10 / minuend > 10).
function buildAddSubPool(mode, crossingOnly) {
    const pool = [];
    const max = state.maxNum || 20;
    for (let x = 2; x <= 9; x++) {
        for (let y = 2; y <= 9; y++) {
            if (mode === 'addition') {
                const sum = x + y;
                if (sum <= max && (!crossingOnly || sum > 10)) {
                    pool.push({ a: x, b: y, answer: sum, factKey: `a:${x}+${y}` });
                }
            } else { // subtraction: (x + y) − x = y  → subtrahend and answer both 2..9
                const minu = x + y;
                if (minu <= max && (!crossingOnly || minu > 10)) {
                    pool.push({ a: minu, b: x, answer: y, factKey: `s:${minu}-${x}` });
                }
            }
        }
    }
    return pool;
}

// Числа, на яких зараз тренуємось: явний мікс має пріоритет над діапазоном minA..maxA.
function activeFactors() {
    if (state.factors && state.factors.length) return state.factors.slice();
    const out = [];
    for (let x = state.minA; x <= state.maxA; x++) out.push(x);
    return out;
}

// Тривіальний контент у діленні — лише на 2 і/або 5 (вивчено напам'ять, легко фармити монети).
// Працює і для «Свого міксу», бо дивиться на activeFactors(), а не на minA/maxA.
// Для множення діє власна шкала (multAnswerReward), тож ліміт тут — лише для ділення.
function isTrivialDrill() {
    if (state.mode !== 'division') return false;
    const f = activeFactors();
    return f.length > 0 && f.every(x => x === 2 || x === 5);
}

// Множення: за «× 2» монет немає взагалі; «Вся таблиця» — multRewardFull;
// окремі таблиці 3–9 і «Свій мікс» — multRewardOther.
function isFullTable() {
    return !(state.factors && state.factors.length) && state.minA === 2 && state.maxA === 9;
}

function multAnswerReward() {
    const p = state.currentProblem;
    if (p && (p.a === 2 || p.b === 2)) return 0;
    return isFullTable() ? CONFIG.multRewardFull : CONFIG.multRewardOther;
}

// Двозначні + і − БЕЗ переходу через десяток (Додавання, Віднімання, Плюс-мінус):
//   додавання — 25 + 43, 41 + 37: одиниці в сумі ≤ 9, десятки в сумі ≤ 9 (відповідь до 99);
//   віднімання — 87 − 62, 66 − 53: одиниці зменшуваного ≥ одиниць від'ємника, відповідь ≥ 10.
// Круглі числа (30, 40…) не беремо — 30 + 40 занадто легко.
function buildTwoDigitPool(mode) {
    const pool = [];
    for (let a = 11; a <= 99; a++) {
        if (a % 10 === 0) continue;
        for (let b = 11; b <= 99; b++) {
            if (b % 10 === 0) continue;
            const au = a % 10, bu = b % 10, at = Math.floor(a / 10), bt = Math.floor(b / 10);
            if (mode === 'addition') {
                if (au + bu <= 9 && at + bt <= 9) {
                    pool.push({ a, b, answer: a + b, factKey: `a:${a}+${b}` });
                }
            } else if (au >= bu && at > bt) {
                pool.push({ a, b, answer: a - b, factKey: `s:${a}-${b}` });
            }
        }
    }
    return pool;
}

// Пояснення для двозначного прикладу: десятки окремо, одиниці окремо.
function columnHint(a, b, op, answer) {
    const at = a - a % 10, bt = b - b % 10, au = a % 10, bu = b % 10;
    const tens = op === '+' ? at + bt : at - bt;
    const units = op === '+' ? au + bu : au - bu;
    return `💡 ${a} ${op} ${b}: десятки ${at} ${op} ${bt} = ${tens}, одиниці ${au} ${op} ${bu} = ${units} → ${tens} + ${units} = ${answer}`;
}

// Build the candidate pool for the current multiplication/division difficulty.
function buildFactPool(mode) {
    const pool = [];
    const factors = activeFactors(); // явний мікс має пріоритет над діапазоном minA..maxA
    // Без найлегших прикладів: множник / частка лише 3..9 (ні «× 2», ні «× 10», ні «4 ÷ 2»)
    for (const x of factors) {
        for (let q = 3; q <= 9; q++) {
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
    let logicKey = null; // для логіки ключ статистики — тип завдання

    if (state.mode === 'blitz') {
        // Тільки з переходом через десяток: інакше бліц — найшвидший спосіб фармити монети
        const op = randomInt(0, 1) === 1 ? 'addition' : 'subtraction';
        const pick = pickWeightedFact(buildAddSubPool(op, true));
        a = pick.a; b = pick.b; answer = pick.answer;
        opSymbol = op === 'addition' ? '+' : '−';
        state.lastFactKey = pick.factKey;
        return { a, b, answer, opSymbol, factKey: pick.factKey };
    }

    if (state.mode === 'tens') {
        const pick = generateTensProblem();
        state.lastFactKey = pick.factKey;
        return pick;
    }

    switch (state.mode) {
        case 'exam':
        case 'goatexam': {
            // Pull the pre-built fact for this question number
            const item = state.examQueue[state.round - 1] || state.examQueue[0];
            a = item.a; b = item.b; answer = item.answer;
            opSymbol = item.opSymbol || '×';
            break;
        }

        case 'addition': {
            // Crossing-the-ten only, weighted toward weak/slow facts
            const pick = pickWeightedFact(buildTwoDigitPool('addition'));
            a = pick.a; b = pick.b; answer = pick.answer;
            opSymbol = '+';
            break;
        }

        case 'subtraction': {
            const pick = pickWeightedFact(buildTwoDigitPool('subtraction'));
            a = pick.a; b = pick.b; answer = pick.answer;
            opSymbol = '−';
            break;
        }

        case 'plusminus': {
            // Mixed drill: alternate + and − (guarantees subtraction), each weighted by weakness
            const op = (state.round % 2 === 1) ? 'addition' : 'subtraction';
            const pick = pickWeightedFact(buildTwoDigitPool(op)); // двозначні, без переходу через десяток
            a = pick.a; b = pick.b; answer = pick.answer;
            opSymbol = op === 'addition' ? '+' : '−';
            break;
        }

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

        case 'logic': {
            // Адаптивно: обираємо ТИП завдання за статистикою (де були помилки чи довгі
            // роздуми — те й частіше), а конкретні числа — випадково в межах типу.
            const cat = pickWeightedFact(logicCategories(state.logicMode));
            const q = cat.gen();
            a = q.text; b = ''; opSymbol = ''; answer = q.answer;
            logicKey = cat.factKey;
            break;
        }
    }

    const factKey = logicKey || factKeyFor(state.mode, a, b, opSymbol);
    state.lastFactKey = factKey;
    return { a, b, answer, opSymbol, factKey };
}

// ===== ЛОГІКА: типи завдань для адаптивності =====
// Рівняння: 4 форми × 2 розміри чисел (до 20 / 21–30) = 8 типів.
// Ряди: зростаючі й спадні × крок 2..9 = 16 типів.
// Статистика ведеться по типах (ключі «le:…» / «ls:…»), бо окремих прикладів сотні.
function logicCategories(logicMode) {
    const cats = [];
    if (logicMode === 'equation') {
        const FORMS = [
            (s, r) => ({ text: `? + ${s} = ${r}`, answer: r - s, big: r }),
            (s, r) => ({ text: `${s} + ? = ${r}`, answer: r - s, big: r }),
            (s, r) => ({ text: `? − ${s} = ${r - s}`, answer: r, big: r }),      // шукаємо зменшуване
            (s, r) => ({ text: `${r} − ? = ${s}`, answer: r - s, big: r }),
        ];
        FORMS.forEach((form, fi) => {
            ['s', 'b'].forEach(band => {
                cats.push({
                    factKey: `le:${fi}:${band}`,
                    gen: () => {
                        const s = randomInt(3, 9);                     // однозначний доданок / від'ємник
                        const r = band === 's' ? randomInt(12, 20) : randomInt(21, 30);
                        return form(s, r);
                    }
                });
            });
        });
    } else {
        for (let step = 2; step <= 9; step++) {
            cats.push({ factKey: `ls:up:${step}`, gen: () => {
                const start = randomInt(1, 12);
                return { text: `${start}, ${start + step}, ${start + 2 * step},`, answer: start + 3 * step };
            } });
            cats.push({ factKey: `ls:down:${step}`, gen: () => {
                const start = randomInt(3 * step + 2, 40);
                return { text: `${start}, ${start - step}, ${start - 2 * step},`, answer: start - 3 * step };
            } });
        }
    }
    return cats;
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateChoices(correctAnswer) {
    const choices = new Set([correctAnswer]);
    const p = state.currentProblem;

    // Plausible distractors instead of random noise:
    //  × → neighbouring table products (e.g. 7×8=56 → 49, 64, 54)
    //  ÷ → neighbouring quotients (and the divisor, a common slip)
    let candidates = [];
    if (p && state.mode === 'multiplication' && typeof p.a === 'number' && typeof p.b === 'number') {
        const a = p.a, b = p.b;
        candidates = [
            a * (b - 1), a * (b + 1), (a - 1) * b, (a + 1) * b,
            (a - 1) * (b + 1), (a + 1) * (b - 1),
            a * (b - 2), a * (b + 2), (a - 2) * b, (a + 2) * b
        ];
    } else if (p && state.mode === 'division') {
        const q = correctAnswer;
        candidates = [q - 1, q + 1, q - 2, q + 2, q - 3, q + 3, p.b];
    }

    shuffleArray(candidates);
    for (const c of candidates) {
        if (choices.size >= 4) break;
        if (c > 0 && c !== correctAnswer) choices.add(c);
    }

    // Fallback for other modes (add/sub/logic) or if too few plausible ones: near-by numbers
    let attempts = 0;
    while (choices.size < 4 && attempts < 100) {
        const offset = randomInt(1, Math.max(5, Math.ceil(correctAnswer * 0.5)));
        const wrong = Math.random() > 0.5
            ? correctAnswer + randomInt(1, offset)
            : correctAnswer - randomInt(1, offset);
        if (wrong >= 0 && wrong !== correctAnswer) choices.add(wrong);
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
    state.sessionCoins = 0;
    state.totalRounds = (state.mode === 'tens' && state.tensLevel === 'steps')
        ? CONFIG.tensStepsRounds : CONFIG.totalRounds; // reset (exam may have set it to 100)
    state.score = 0;
    state.round = 0;
    state.sessionCorrect = 0;
    state.sessionLog = [];
    state.numpadValue = '';
    state.crossingStep = 0;
    state.crossingData = null;
    state.crossingInputValue = '';

    document.getElementById('score-value').textContent = '0';
    document.getElementById('score-display').style.display = '';
    document.getElementById('progress-total').textContent = state.totalRounds;
    showScreen('screen-game');
    nextProblem();
}

// Mixed +/- drill: alternates addition and subtraction, adaptive within each
function startPlusMinus() {
    if (blockedBySession()) return;
    state.mode = 'plusminus';
    state.crossingTens = false;
    state.factors = null;
    state.maxNum = 20;
    state.difficultyLabel = 'Плюс-мінус';
    startGame();
}

// ===== EXAM MODE =====
// 100 questions: all 64 table facts (2–9 × 2–9, no ×1/×10) at least once,
// plus 36 repeats of the statistically hardest facts.
function buildExamQueue() {
    const all = [];
    for (let a = 2; a <= 9; a++) {
        for (let b = 2; b <= 9; b++) {
            all.push({ a, b, answer: a * b, opSymbol: '×', factKey: `m:${a}x${b}` });
        }
    }
    // Rank by neediness (adaptive weight), tie-break by larger product (harder)
    const ranked = all.slice().sort((x, y) => {
        const d = factWeight(y.factKey) - factWeight(x.factKey);
        return d !== 0 ? d : (y.a * y.b) - (x.a * x.b);
    });
    const repeats = ranked.slice(0, 36).map(f => ({ ...f }));

    const queue = shuffleArray(all.concat(repeats));
    // Avoid the same fact appearing twice in a row
    for (let i = 1; i < queue.length; i++) {
        if (queue[i].factKey === queue[i - 1].factKey) {
            for (let j = i + 1; j < queue.length; j++) {
                if (queue[j].factKey !== queue[i - 1].factKey) {
                    [queue[i], queue[j]] = [queue[j], queue[i]];
                    break;
                }
            }
        }
    }
    return queue;
}

function startExam() {
    state.sessionCoins = 0;
    if (blockedBySession()) return; // resume the unfinished session instead of restarting
    state.mode = 'exam';
    state.inputMode = 'numpad';        // exam = type the answer, no options
    state.difficultyLabel = 'Екзамен';
    state.crossingTens = false;
    state.factors = null;
    state.examQueue = buildExamQueue();
    state.examResults = [];
    state.totalRounds = state.examQueue.length; // 100
    state.score = 0;
    state.round = 0;
    state.sessionCorrect = 0;
    state.numpadValue = '';

    if (blitzTimer) clearInterval(blitzTimer);
    const btd = document.getElementById('blitz-timer-display');
    if (btd) btd.style.display = 'none';
    document.getElementById('progress-display').style.display = 'block';
    // Hide the score counter during the exam — no right/wrong hints until the end
    document.getElementById('score-display').style.display = 'none';
    document.getElementById('score-value').textContent = '0';
    document.getElementById('progress-total').textContent = state.totalRounds;

    showScreen('screen-game');
    nextProblem();
}

// ===== 🌷 ТРЕНУВАННЯ НА ВЕСНУ (колишній «Симулятор екзамену козла», id — goatexam) =====
// 100 прикладів на + і − у межах goatExamMax (30); додаємо / віднімаємо goatOpMin..goatOpMax
// (3–19): 25−8, 8+15, 24−13. УСІ з переходом через десяток — дивимось на одиниці:
// додавання — одиниці a + одиниці b > 10; віднімання — позика (одиниці a < одиниць b).
// Тож 2+3, 15+1, 26−4 чи 25−15 не трапляються. На кожну помилку — пояснення (springHint).
function buildGoatCrossingPools() {
    const max = CONFIG.goatExamMax;
    const addPool = [], subPool = [];
    for (let b = CONFIG.goatOpMin; b <= CONFIG.goatOpMax; b++) {
        for (let a = 2; a + b <= max; a++) {
            if ((a % 10) + (b % 10) > 10) {
                addPool.push({ a, b, answer: a + b, opSymbol: '+', factKey: `a:${a}+${b}` });
            }
        }
        for (let a = b + 1; a <= max; a++) {
            if ((a % 10) < (b % 10)) {
                subPool.push({ a, b, answer: a - b, opSymbol: '−', factKey: `s:${a}-${b}` });
            }
        }
    }
    return { addPool, subPool };
}

// Покрокове пояснення «як треба було рахувати» для прикладу через десяток.
// Двоцифрове число розкладаємо: спершу десяток, потім одиниці через круглий десяток.
//   17 + 6  → 17 + 3 = 20, лишилось 3 → 20 + 3 = 23
//   8 + 15  → 8 + 10 = 18; 18 + 2 = 20, лишилось 3 → 20 + 3 = 23
//   24 − 15 → 24 − 10 = 14; 14 − 4 = 10, ще 1 → 10 − 1 = 9
function springHint(a, b, op, answer) {
    const tens = Math.floor(b / 10) * 10, units = b % 10;
    // один крок через круглий десяток: «до 20 → 17 + 3 = 20, лишилось 3 → 20 + 3 = 23»
    const viaTen = cur => {
        if (op === '+') {
            const toTen = 10 - (cur % 10), round = cur + toTen, rest = units - toTen;
            return `спочатку до ${round} → ${cur} + ${toTen} = ${round}, лишилось ${rest} → ${round} + ${rest} = ${answer}`;
        }
        const toTen = cur % 10, round = cur - toTen, rest = units - toTen;
        if (toTen === 0) return `${cur} − ${units} = ${answer}`;
        return `спочатку до ${round} → ${cur} − ${toTen} = ${round}, ще ${rest} → ${round} − ${rest} = ${answer}`;
    };
    if (!tens) return `💡 ${a} ${op} ${b}: ${viaTen(a)}`;
    const cur = op === '+' ? a + tens : a - tens;
    return [
        `💡 Як рахувати ${a} ${op} ${b}:`,
        `1) Спочатку десяток: ${a} ${op} ${tens} = ${cur}`,
        `2) Тепер ${cur} ${op} ${units}: ${viaTen(cur)}`,
    ].join('\n');
}

// Зважений відбір без повторів: слабкі/повільні факти мають більший шанс потрапити
function pickGoatHalf(pool, count) {
    const scored = pool.map(f => ({ f, s: factWeight(f.factKey) * (0.5 + Math.random()) }));
    scored.sort((x, y) => y.s - x.s);
    return scored.slice(0, count).map(e => ({ ...e.f }));
}

function buildGoatExamQueue() {
    const { addPool, subPool } = buildGoatCrossingPools();
    const queue = shuffleArray(pickGoatHalf(addPool, 50).concat(pickGoatHalf(subPool, 50)));
    // Avoid the same fact appearing twice in a row
    for (let i = 1; i < queue.length; i++) {
        if (queue[i].factKey === queue[i - 1].factKey) {
            for (let j = i + 1; j < queue.length; j++) {
                if (queue[j].factKey !== queue[i - 1].factKey) {
                    [queue[i], queue[j]] = [queue[j], queue[i]];
                    break;
                }
            }
        }
    }
    return queue;
}

function startGoatExam() {
    state.sessionCoins = 0;
    if (blockedBySession()) return; // resume the unfinished session instead of restarting
    state.mode = 'goatexam';
    state.inputMode = 'numpad';
    state.difficultyLabel = 'Тренування на Весну 🌷';
    state.crossingTens = false;
    state.factors = null;
    state.examQueue = buildGoatExamQueue();
    state.examResults = [];
    state.totalRounds = state.examQueue.length; // 100
    state.score = 0;
    state.round = 0;
    state.sessionCorrect = 0;
    state.numpadValue = '';

    if (blitzTimer) clearInterval(blitzTimer);
    const btd = document.getElementById('blitz-timer-display');
    if (btd) btd.style.display = 'none';
    document.getElementById('progress-display').style.display = 'block';
    // Тренування: рахунок видно, помилки пояснюємо одразу
    document.getElementById('score-display').style.display = '';
    document.getElementById('score-value').textContent = '0';
    document.getElementById('progress-total').textContent = state.totalRounds;

    showScreen('screen-game');
    nextProblem();
}

function nextProblem() {
    updateEconomyUI(); // фішка «+N за рівень» — і після «Продовжити», і на старті нового рівня
    state.round++;
    state.answered = false;
    state.numpadValue = '';

    if (state.mode !== 'blitz' && state.round > state.totalRounds) {
        showCompletion();
        return;
    }

    persistSession(); // save progress at the start of each question (resumable modes only)

    document.getElementById('progress-current').textContent = state.round;
    document.getElementById('progress-bar').style.width = `${((state.round - 1) / state.totalRounds) * 100}%`;

    document.getElementById('feedback').textContent = '';
    document.getElementById('feedback').className = 'feedback';
    const hintEl = document.getElementById('hint');
    if (hintEl) { hintEl.classList.remove('show'); document.getElementById('hint-text').textContent = ''; }
    const hintVis = document.getElementById('hint-visual');
    if (hintVis) { hintVis.innerHTML = ''; hintVis.style.display = 'none'; }

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
    const answerDisplay = document.getElementById('answer-display');

    answerDisplay.style.display = '';
    if (state.mode === 'logic') {
        if (eqSign) eqSign.style.display = 'none';
        if (numA) numA.style.marginRight = '15px';
    } else {
        if (eqSign) eqSign.style.display = 'inline';
        if (numA) numA.style.marginRight = '0';
    }
    if (eqSign) eqSign.textContent = state.currentProblem.eqSymbol || '=';

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

// ===== 🔟 ЧЕРЕЗ ДЕСЯТОК: рівні, картинки, підказки, «Крок за кроком» =====
// Метод — як у школі: 1) доповни до 10 (до круглого числа); 2) розклади друге число;
// 3) додай / відніми решту.   8 + 5 = 8 + 2 + 3 = 13;   13 − 5 = 13 − 3 − 2 = 8;
// 27 + 5 = 27 + 3 + 2 = 32;   34 − 8 = 34 − 4 − 4 = 26.
// Ключі статистики ті самі, що й в інших режимах (a:8+5, s:13-5), тож бліц, «Тренування
// на Весну» і цей режим навчаються на одних даних. «Друзі числа 10» — ключі k:10=7, k:6=4.

// Розбір прикладу через круглий десяток (b — однозначне, приклад справді переходить десяток):
// first — скільки до круглого числа, round — це кругле число, rest — решта від b.
function tensSplit(a, b, op) {
    const units = a % 10;
    if (op === '+') {
        const first = 10 - units, round = a + first, rest = b - first;
        return { first, round, rest, answer: round + rest };
    }
    const first = units, round = a - units, rest = b - units;
    return { first, round, rest, answer: round - rest };
}

// «Сам» і «Крок за кроком»: до 20 — 8 + 5, 13 − 5 (той самий набір, що й у бліці), + і − разом.
// Адаптивність сама підсуне слабке (зараз це віднімання: 13 − 9, 12 − 8, 11 − 7).
function tensSmallPool(onlyOp) {
    const saved = state.maxNum;
    state.maxNum = 20;
    let pool = buildAddSubPool('addition', true).map(f => ({ ...f, opSymbol: '+' }))
        .concat(buildAddSubPool('subtraction', true).map(f => ({ ...f, opSymbol: '−' })));
    state.maxNum = saved;
    if (onlyOp) pool = pool.filter(f => f.opSymbol === onlyOp);
    return pool;
}

// «Великі числа»: 27 + 5, 34 − 8 — двозначне ± однозначне з переходом через круглий десяток
// (одиниці в сумі > 10; у відніманні одиниць зменшуваного менше, ніж віднімаємо). До 100.
function tensBigPool() {
    const pool = [];
    for (let a = 21; a <= 98; a++) {
        const u = a % 10;
        if (u === 0) continue;
        for (let b = 2; b <= 9; b++) {
            if (u + b > 10 && a + b <= 99) pool.push({ a, b, answer: a + b, opSymbol: '+', factKey: `a:${a}+${b}` });
            if (u < b) pool.push({ a, b, answer: a - b, opSymbol: '−', factKey: `s:${a}-${b}` });
        }
    }
    return pool;
}

// «Друзі числа 10» (10 = 7 + ?) і розклад числа (6 = 4 + ?) — без цього через десяток не порахуєш.
// Показуємо як «10 = 7 + ?»: знак «=» стоїть на місці дії, «+» — на місці «=» (eqSymbol).
function tensBondsPool(kind) {
    const pool = [];
    const add = (n, k) => pool.push({ a: n, b: k, answer: n - k, opSymbol: '=', eqSymbol: '+',
        label: `${n} = ${k} + ${n - k}`, factKey: `k:${n}=${k}` });
    if (kind === 'ten') {
        for (let k = 1; k <= 9; k++) add(10, k);
    } else {
        for (let n = 3; n <= 9; n++) for (let k = 1; k < n; k++) add(n, k);
    }
    return pool;
}

function generateTensProblem() {
    switch (state.tensLevel) {
        case 'bonds': return { ...pickWeightedFact(tensBondsPool(state.round % 2 === 1 ? 'ten' : 'split')) };
        case 'big':   return { ...pickWeightedFact(tensBigPool()) };
        default:      return { ...pickWeightedFact(tensSmallPool()) };
    }
}

// Запуск рівня «Через десяток» не з підменю (кнопка в кінці уроку)
const TENS_LEVEL_LABELS = { bonds: 'Друзі числа 10', steps: 'Крок за кроком', self: 'Сам', big: 'Великі числа' };
function startTensLevel(level) {
    if (blockedBySession()) return;
    state.mode = 'tens';
    state.tensLevel = level;
    state.crossingTens = level === 'steps';
    state.factors = null;
    state.maxNum = 20;
    state.difficultyLabel = TENS_LEVEL_LABELS[level] || 'Через десяток';
    document.getElementById('progress-display').style.display = 'block';
    startGame();
}

// ----- Картинки: десяткова рамка (2 × 5 клітинок) і «палички» повних десятків -----
// cells: класи клітинок — 'orig' (було), 'add' (додаємо), 'take' (забираємо, закреслено), '' — порожня
function tenFrameHTML(cells, caption) {
    let html = '<div class="tf-group"><div class="tf">';
    for (let i = 0; i < 10; i++) html += `<span class="tf-cell ${cells[i] || ''}"></span>`;
    html += '</div>';
    if (caption !== undefined && caption !== '') html += `<div class="tf-cap">${caption}</div>`;
    return html + '</div>';
}

// [['orig', 8], ['add', 2]] → масив із 10 класів клітинок
function tfCells(spec) {
    const out = [];
    spec.forEach(([cls, n]) => { for (let i = 0; i < n; i++) out.push(cls); });
    while (out.length < 10) out.push('');
    return out.slice(0, 10);
}

function tenRodsHTML(count) {
    if (count <= 0) return '';
    let rods = '';
    for (let i = 0; i < count; i++) rods += '<span class="tf-rod"></span>';
    return `<div class="tf-group"><div class="tf-rods">${rods}</div><div class="tf-cap">${count * 10}</div></div>`;
}

// Картинка розв'язку по кроках (stage 0 — умова, 1 — після кроку 1, 2 — після кроку 2, 3 — усе).
//   8 + 5:  [8] [5] → [8 + 2 = повна рамка] [3]
//   13 − 5: [10] [3] → [10] [3 закреслено] → [10, з них 2 закреслено] [3 закреслено]
function tensPictureHTML(a, b, op, stage) {
    const t = tensSplit(a, b, op);
    const tens = Math.floor(a / 10), u = a % 10;
    let html = '';
    if (op === '+') {
        html += tenRodsHTML(tens);
        if (stage < 1) {
            html += tenFrameHTML(tfCells([['orig', u]]), u);
            html += tenFrameHTML(tfCells([['add', b]]), `+ ${b}`);
        } else {
            html += tenFrameHTML(tfCells([['orig', u], ['add', t.first]]), `${u} + ${t.first}`);
            html += tenFrameHTML(tfCells([['add', t.rest]]), `+ ${t.rest}`);
        }
    } else {
        html += tenRodsHTML(tens - 1);
        if (stage < 2) html += tenFrameHTML(tfCells([['orig', 10]]), '10');
        else html += tenFrameHTML(tfCells([['orig', 10 - t.rest], ['take', t.rest]]), `10 − ${t.rest}`);
        if (stage < 1) html += tenFrameHTML(tfCells([['orig', u]]), u);
        else html += tenFrameHTML(tfCells([['take', u]]), `− ${u}`);
    }
    return html;
}

// Три кроки прикладу: що спитати, правильна відповідь, підказка дитині
function tensStepLines(a, b, op) {
    const t = tensSplit(a, b, op);
    if (op === '+') return [
        { pre: `${a} + `, post: ` = ${t.round}`, ans: t.first, q: `${a} + ? = ${t.round}`, tip: `Скільки бракує до ${t.round}?` },
        { pre: `${b} = ${t.first} + `, post: '', ans: t.rest, q: `${b} = ${t.first} + ?`, tip: `Розклади ${b}: скільки лишилось?` },
        { pre: `${t.round} + ${t.rest} = `, post: '', ans: t.answer, q: `${t.round} + ${t.rest} = ?`, tip: 'Додай решту' },
    ];
    return [
        { pre: `${a} − `, post: ` = ${t.round}`, ans: t.first, q: `${a} − ? = ${t.round}`, tip: `Скільки забрати, щоб стало ${t.round}?` },
        { pre: `${b} = ${t.first} + `, post: '', ans: t.rest, q: `${b} = ${t.first} + ?`, tip: 'Скільки ще треба забрати?' },
        { pre: `${t.round} − ${t.rest} = `, post: '', ans: t.answer, q: `${t.round} − ${t.rest} = ?`, tip: 'Забери решту' },
    ];
}

function tensHintText(a, b, op) {
    const t = tensSplit(a, b, op);
    if (op === '+') return [
        `💡 ${a} + ${b} = ${t.answer}`,
        `1) До ${t.round} бракує ${t.first}: ${a} + ${t.first} = ${t.round}`,
        `2) ${b} = ${t.first} + ${t.rest}`,
        `3) ${t.round} + ${t.rest} = ${t.answer}`,
    ].join('\n');
    return [
        `💡 ${a} − ${b} = ${t.answer}`,
        `1) Спочатку до ${t.round}: ${a} − ${t.first} = ${t.round}`,
        `2) ${b} = ${t.first} + ${t.rest}`,
        `3) ${t.round} − ${t.rest} = ${t.answer}`,
    ].join('\n');
}

// Помилка в «Через десяток» — пояснення з картинкою; висить, доки дитина не закриє (×)
function showTensHint(p) {
    let text, pic;
    if (p.opSymbol === '=') {
        text = p.a === 10
            ? `💡 ${p.b} і ${p.answer} — друзі числа 10:\n${p.b} + ${p.answer} = 10`
            : `💡 ${p.a} — це ${p.b} і ще ${p.answer}:\n${p.b} + ${p.answer} = ${p.a}`;
        pic = tenFrameHTML(tfCells([['orig', p.b], ['add', p.answer]]), `${p.b} + ${p.answer}`);
    } else {
        text = tensHintText(p.a, p.b, p.opSymbol);
        pic = tensPictureHTML(p.a, p.b, p.opSymbol, 3);
    }
    document.getElementById('hint-text').textContent = text;
    const vis = document.getElementById('hint-visual');
    if (vis) { vis.innerHTML = pic; vis.style.display = 'flex'; }
    document.getElementById('hint').classList.add('show');
}

// ----- «Крок за кроком» (контейнер crossing-container; раніше — прихований варіант + / −) -----
function generateCrossingProblem() {
    const onlyOp = state.mode === 'addition' ? '+' : state.mode === 'subtraction' ? '−' : null;
    const f = { ...pickWeightedFact(tensSmallPool(onlyOp)) };
    const lines = tensStepLines(f.a, f.b, f.opSymbol);
    f.answers = lines.map(l => l.ans);
    return f;
}

function startCrossingProblem() {
    const problem = generateCrossingProblem();
    state.crossingData = problem;
    state.crossingStep = 1;
    state.crossingMiss = false;
    state.crossingInputValue = '';
    state.currentProblem = problem;
    state.lastFactKey = problem.factKey;

    renderCrossingVisual();
    renderCrossingSteps();
    document.getElementById('crossing-input-display').textContent = '?';
    document.getElementById('crossing-input-display').className = 'crossing-input-display';
    enableCrossingNumpad(true);
}

function renderCrossingVisual() {
    const el = document.getElementById('crossing-visual');
    const p = state.crossingData;
    if (!el || !p) return;
    el.innerHTML = tensPictureHTML(p.a, p.b, p.opSymbol, Math.min(3, state.crossingStep - 1));
}

function renderCrossingSteps() {
    const eqEl = document.getElementById('crossing-equation');
    const p = state.crossingData;
    const cur = state.crossingStep;
    const done = cur > 3;
    let html = `<div class="cs-task"><span class="crossing-num">${p.a}</span> <span class="crossing-op">${p.opSymbol}</span> ` +
        `<span class="crossing-num">${p.b}</span> <span class="crossing-eq">=</span> ` +
        (done ? `<span class="crossing-result filled">${p.answer}</span>` : '<span class="crossing-num-locked">?</span>') + '</div>';
    tensStepLines(p.a, p.b, p.opSymbol).forEach((ln, i) => {
        const n = i + 1;
        if (n > cur) { html += `<div class="cs-line locked"><span class="cs-n">${n}</span><span class="cs-expr">…</span></div>`; return; }
        const box = n < cur ? `<span class="crossing-num-filled">${ln.ans}</span>` : '<span class="crossing-num-active">?</span>';
        html += `<div class="cs-line${n === cur ? ' active' : ''}"><span class="cs-n">${n}</span>` +
            `<span class="cs-expr">${ln.pre}${box}${ln.post}</span></div>`;
        if (n === cur) html += `<div class="cs-tip">${ln.tip}</div>`;
    });
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
    enableCrossingNumpad(false);

    if (correct) {
        inputDisplay.className = 'crossing-input-display correct-flash';
        inputDisplay.textContent = '✓ ' + userAnswer;
        createStarBurst();
    } else {
        // Помилка в кроці: показуємо правильне число й ідемо далі — приклад уже не «чистий»
        if (!state.crossingMiss) state.crossingMissStep = state.crossingStep;
        state.crossingMiss = true;
        inputDisplay.className = 'crossing-input-display wrong-flash';
        inputDisplay.textContent = '✗ ' + userAnswer;
        const eqEl = document.getElementById('crossing-equation');
        eqEl.classList.add('shake');
        setTimeout(() => eqEl.classList.remove('shake'), 500);
        setTimeout(() => { inputDisplay.textContent = 'Правильно: ' + currentAns; }, 600);
    }

    setTimeout(() => {
        if (state.crossingStep >= 3) { finishCrossingProblem(); return; }
        state.crossingStep++;
        state.crossingInputValue = '';
        renderCrossingVisual();
        renderCrossingSteps();
        inputDisplay.textContent = '?';
        inputDisplay.className = 'crossing-input-display';
        enableCrossingNumpad(true);
    }, correct ? 700 : 1800);
}

// Приклад зараховується, лише якщо всі три кроки — з першої спроби
function finishCrossingProblem() {
    state.answered = true;
    const p = state.crossingData;
    const ok = !state.crossingMiss;
    state.crossingStep = 4;
    renderCrossingVisual();
    renderCrossingSteps();

    const timeTaken = Date.now() - state.problemStartTime;
    recordStat(p.factKey, ok, timeTaken);
    if (hasResultsTable(state.mode)) {
        state.sessionLog.push({ label: `${p.a} ${p.opSymbol} ${p.b} = ${p.answer}`, answer: p.answer,
            user: p.answer, note: ok ? null : `помилка в кроці ${state.crossingMissStep}`, correct: ok, timeMs: timeTaken });
    }

    const feedback = document.getElementById('feedback');
    if (ok) {
        state.score++;
        state.sessionCorrect++;
        document.getElementById('score-value').textContent = state.score;
        awardCorrect(timeTaken);
        const emojis = ['🎉', '⭐', '🌟', '💫', '✨', '🎊', '💖', '🦄', '🌈', '🎀'];
        feedback.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        if (state.sessionCorrect % 3 === 0) launchConfetti();
    } else {
        state.combo = 0;
        updateEconomyUI();
        saveGame();
        feedback.textContent = ['😅', '🤔', '💪'][Math.floor(Math.random() * 3)];
    }
    feedback.className = 'feedback show';
    setTimeout(nextProblem, ok ? CONFIG.pace.crossingDone : CONFIG.pace.wrong);
}

// ===== 📖 УРОК «ЧЕРЕЗ ДЕСЯТОК» =====
// Слайди з картинками; у прикладах дитина сама відповідає на 3 кроки (вибір із 3 кнопок),
// картинка після кожного кроку змінюється. Без монет — це пояснення, а не гра.
function lessonExample(a, b, op, title) {
    const t = tensSplit(a, b, op);
    const tens = Math.floor(a / 10), u = a % 10;
    const big = a >= 20;
    const say = op === '+'
        ? [
            big ? `${a} — це ${tens * 10} і ще ${u}. До круглого числа ${t.round} бракує кількох.`
                : `У рамці ${u}. Щоб рамка стала повною (10), бракує кількох кружечків.`,
            `Беремо ${t.first} з ${b} і доповнюємо рамку — маємо ${t.round}. А скільки лишилось від ${b}?`,
            `Тепер легко: ${t.round} і ще ${t.rest}.`,
            `${a} + ${b} = ${t.answer} 🎉`,
        ]
        : [
            `${a} — це ${t.round} і ще ${u}. Спочатку забираємо ці ${u}, щоб лишилось рівно ${t.round}.`,
            `Забрали ${t.first}, а треба забрати ${b}. Скільки ще треба забрати?`,
            `Тепер від ${t.round} забираємо ще ${t.rest}.`,
            `${a} − ${b} = ${t.answer} 🎉`,
        ];
    return {
        title: title || `${a} ${op} ${b} = ?`,
        pic: stage => tensPictureHTML(a, b, op, stage),
        say,
        asks: tensStepLines(a, b, op).map(l => ({ q: l.q, answer: l.ans, tip: l.tip })),
    };
}

const TENS_LESSON_CHAPTERS = ['➕ Додавання', '➖ Віднімання', '🚀 Великі числа'];

const TENS_LESSON = [
    { ch: 0, title: 'Десяток — це 10',
      pic: () => tenFrameHTML(tfCells([['orig', 10]]), '10'),
      text: 'Ось рамка на 10 клітинок. Коли вона повна — це <b>десяток</b>. З десятком рахувати найлегше: <b>10 + 3 = 13</b>, <b>10 + 6 = 16</b>, <b>10 − 2 = 8</b>.' },
    { ch: 0, title: 'Друзі числа 10',
      pic: () => [[9, 1], [8, 2], [7, 3], [6, 4], [5, 5]].map(([x, y]) => tenFrameHTML(tfCells([['orig', x], ['add', y]]), `${x} + ${y}`)).join(''),
      text: 'Ці пари разом дають 10. Це головний секрет — знай їх напам\'ять!',
      asks: [{ q: '7 + ? = 10', answer: 3 }, { q: '4 + ? = 10', answer: 6 }] },
    { ch: 0, title: 'Число — це дві частинки',
      pic: () => tenFrameHTML(tfCells([['orig', 2], ['add', 3]]), '5 = 2 + 3') + tenFrameHTML(tfCells([['orig', 4], ['add', 3]]), '7 = 4 + 3'),
      text: 'Будь-яке число можна розкласти на дві частинки: 5 — це 2 і 3, а 7 — це 4 і 3. Це теж знадобиться!',
      asks: [{ q: '6 = 4 + ?', answer: 2 }, { q: '8 = 5 + ?', answer: 3 }] },
    { ch: 0, ...lessonExample(8, 5, '+', 'Рахуємо 8 + 5') },
    { ch: 0, title: 'Запам\'ятай: 3 кроки', rule: '+' },
    { ch: 0, ...lessonExample(7, 6, '+', 'Тепер ти: 7 + 6') },
    { ch: 0, ...lessonExample(9, 4, '+', 'І ще: 9 + 4') },

    { ch: 1, title: 'Віднімаємо теж через 10',
      pic: () => tenFrameHTML(tfCells([['orig', 10]]), '10') + tenFrameHTML(tfCells([['orig', 3]]), '3'),
      text: '<b>13</b> — це повний десяток і ще 3. Коли треба забрати багато, спершу забираємо ці 3 — і лишається рівно 10. А від 10 відняти легко!' },
    { ch: 1, ...lessonExample(13, 5, '−', 'Рахуємо 13 − 5') },
    { ch: 1, title: 'Запам\'ятай: 3 кроки', rule: '−' },
    { ch: 1, ...lessonExample(12, 8, '−', 'Тепер ти: 12 − 8') },
    { ch: 1, ...lessonExample(13, 9, '−', 'І ще: 13 − 9') },
    { ch: 1, ...lessonExample(11, 7, '−', 'І ще: 11 − 7') },

    { ch: 2, title: 'Великі числа — так само',
      pic: () => tenRodsHTML(2) + tenFrameHTML(tfCells([['orig', 7]]), '7'),
      text: '<b>27</b> — це 2 десятки і ще 7. Рахуємо так само, тільки доповнюємо не до 10, а до круглого числа: <b>20, 30, 40…</b>' },
    { ch: 2, ...lessonExample(27, 5, '+', 'Рахуємо 27 + 5') },
    { ch: 2, ...lessonExample(34, 8, '−', 'Рахуємо 34 − 8') },
    { ch: 2, ...lessonExample(46, 7, '+', 'Тепер ти: 46 + 7') },
    { ch: 2, ...lessonExample(52, 6, '−', 'І ще: 52 − 6') },
    { ch: 2, title: 'Шпаргалка', rule: 'all', last: true },
];

let lessonIdx = 0;
let lessonStage = 0;

function openTensLesson(i) {
    lessonIdx = i || 0;
    lessonStage = 0;
    renderLesson();
    showScreen('screen-tens-lesson');
}

function lessonGo(i) {
    lessonIdx = Math.max(0, Math.min(TENS_LESSON.length - 1, i));
    lessonStage = 0;
    renderLesson();
    window.scrollTo(0, 0);
}

function lessonChapter(ch) { lessonGo(TENS_LESSON.findIndex(s => s.ch === ch)); }

function lessonRuleHTML(op) {
    const add = `<div class="lr-card lr-add"><div class="lr-title">➕ 8 + 5</div>
        <div class="lr-step"><span>1</span>Доповни до 10: <b>8 + 2 = 10</b></div>
        <div class="lr-step"><span>2</span>Розклади друге число: <b>5 = 2 + 3</b></div>
        <div class="lr-step"><span>3</span>Додай решту: <b>10 + 3 = 13</b></div></div>`;
    const sub = `<div class="lr-card lr-sub"><div class="lr-title">➖ 13 − 5</div>
        <div class="lr-step"><span>1</span>Забери до 10: <b>13 − 3 = 10</b></div>
        <div class="lr-step"><span>2</span>Розклади те, що віднімаєш: <b>5 = 3 + 2</b></div>
        <div class="lr-step"><span>3</span>Забери решту: <b>10 − 2 = 8</b></div></div>`;
    const big = `<div class="lr-card lr-big"><div class="lr-title">🚀 Великі числа</div>
        <div class="lr-step"><span>✓</span><b>27 + 5</b> = 27 + 3 + 2 = <b>32</b></div>
        <div class="lr-step"><span>✓</span><b>34 − 8</b> = 34 − 4 − 4 = <b>26</b></div></div>`;
    const friends = `<div class="lr-card lr-friends"><div class="lr-title">🤝 Друзі числа 10</div>
        <div class="lr-pairs">1 + 9 · 2 + 8 · 3 + 7 · 4 + 6 · 5 + 5</div></div>`;
    if (op === '+') return add + friends;
    if (op === '−') return sub + friends;
    return friends + add + sub + big;
}

function renderLesson() {
    const s = TENS_LESSON[lessonIdx];
    const asks = s.asks || [];
    const allDone = lessonStage >= asks.length;

    document.getElementById('lesson-chapters').innerHTML = TENS_LESSON_CHAPTERS.map((c, i) =>
        `<button class="lesson-chip${s.ch === i ? ' active' : ''}" onclick="lessonChapter(${i})">${c}</button>`).join('');
    document.getElementById('lesson-progress').textContent = `${lessonIdx + 1} / ${TENS_LESSON.length}`;

    let html = `<h3 class="lesson-title">${s.title}</h3>`;
    if (s.rule) {
        html += `<div class="lesson-rules">${lessonRuleHTML(s.rule)}</div>`;
    } else {
        if (s.pic) html += `<div class="lesson-pic">${s.pic(lessonStage)}</div>`;
        const text = s.say ? s.say[Math.min(lessonStage, s.say.length - 1)] : s.text;
        if (text) html += `<p class="lesson-text">${text}</p>`;
        // Уже розв'язані кроки — зеленим, поточний — питання з трьома кнопками
        asks.forEach((a, i) => {
            if (i < lessonStage) {
                html += `<div class="lesson-ask done">${a.q.replace('?', `<b>${a.answer}</b>`)} ✓</div>`;
            } else if (i === lessonStage) {
                const opts = shuffleArray([a.answer, a.answer + 1, Math.max(0, a.answer - 1) === a.answer ? a.answer + 2 : a.answer - 1]
                    .filter((v, k, arr) => arr.indexOf(v) === k));
                while (opts.length < 3) opts.push(a.answer + opts.length + 1);
                html += `<div class="lesson-ask current"><div class="lesson-q">${a.q}</div>` +
                    (a.tip ? `<div class="lesson-tip">${a.tip}</div>` : '') +
                    `<div class="lesson-opts">${opts.map(v => `<button class="lesson-opt" onclick="lessonPick(this, ${v})">${v}</button>`).join('')}</div>` +
                    `<div class="lesson-oops" id="lesson-oops"></div></div>`;
            }
        });
    }
    document.getElementById('lesson-card').innerHTML = html;

    document.getElementById('lesson-prev').disabled = lessonIdx === 0;
    const next = document.getElementById('lesson-next');
    next.disabled = !allDone;
    next.style.display = s.last ? 'none' : '';
    document.getElementById('lesson-train').style.display = s.last ? '' : 'none';
}

function lessonPick(btn, value) {
    const s = TENS_LESSON[lessonIdx];
    const ask = (s.asks || [])[lessonStage];
    if (!ask) return;
    if (value === ask.answer) {
        createStarBurst();
        lessonStage++;
        renderLesson();
    } else {
        btn.classList.add('wrong');
        btn.disabled = true;
        const oops = document.getElementById('lesson-oops');
        if (oops) oops.textContent = 'Майже! Подивись на рамку і спробуй ще 🙂';
    }
}

function enableCrossingNumpad(enabled) {
    document.querySelectorAll('.crossing-numpad-grid .numpad-btn').forEach(btn => {
        btn.disabled = !enabled;
    });
}

// Shared reward pipeline for a correct answer (both normal and "через десяток" modes).
// Handles combo, coins (+ ×/÷ anti-abuse), achievements, the economy UI and
// persistence. Daily-task credit lives in completeDailyTask(). Returns coins earned.
function awardCorrect(timeTaken) {
    state.combo++;

    const meta = MODE_META[state.mode] || {};
    let earned = state.crossingTens ? (meta.crossingReward || 2) : (meta.reward || 1);
    if (state.mode === 'multiplication') {
        earned = multAnswerReward();
        if (earned === 0) {
            if (!state.daily.multLimits) state.daily.multLimits = {};
            if (!state.daily.multLimits.twoNotice) {
                state.daily.multLimits.twoNotice = true; // раз на день, щоб не набридати
                showNotification('За множення на 2 монет немає 🙂', 'Це вже зовсім легко! Монети дають за таблиці від 3 і більше.', '💡');
            }
        }
    }
    if (isExamMode(state.mode)) earned = 0; // екзамени оплачуються бонусом у кінці, не за відповідь

    // Anti-farming: тривіальний контент (лише 2 і/або 5) оплачується обмежено за день —
    // і в окремих дриллах «На 2»/«На 5», і в «Своєму міксі», який раніше обходив ліміт.
    if (isTrivialDrill()) {
        if (!state.daily.multLimits) state.daily.multLimits = {};
        const used = state.daily.multLimits.easy || 0;
        if (used >= CONFIG.easyDailyAnswers) {
            earned = 0; // ліміт на сьогодні вичерпано
            if (used === CONFIG.easyDailyAnswers) {
                showNotification('Це вже зовсім легко 🙂', 'Монети за таблицю на 2 і 5 на сьогодні все. Обери складніше — там і платять більше!', '💡');
                state.daily.multLimits.easy = used + 1; // щоб повідомлення показалось один раз
            }
        } else {
            state.daily.multLimits.easy = used + 1;
        }
    }

    // «Друзі числа 10» — легкий рівень: оплачується лише bondsDailyAnswers відповідей на день
    if (state.mode === 'tens' && state.tensLevel === 'bonds') {
        if (!state.daily.multLimits) state.daily.multLimits = {};
        const used = state.daily.multLimits.bonds || 0;
        if (used >= CONFIG.bondsDailyAnswers) {
            earned = 0;
            if (used === CONFIG.bondsDailyAnswers) {
                showNotification('Друзі числа 10 — вже легко 🙂', 'Монети за цей рівень на сьогодні все. Далі — «Сам» або «Великі числа»!', '💡');
                state.daily.multLimits.bonds = used + 1; // повідомлення — один раз
            }
        } else {
            state.daily.multLimits.bonds = used + 1;
        }
    }

    // Монети НЕ йдуть на рахунок одразу: копляться в state.sessionCoins (і в знімку сесії)
    // й зараховуються лише в showCompletion(). Кинув рівень на складному прикладі — монет немає.
    state.sessionCoins = (state.sessionCoins || 0) + earned;

    // Лічильник правильних за день (сама нагорода за «завдання дня» — в completeDailyTask,
    // яке закривається лише рівнем без жодної помилки)
    if (state.daily) state.daily.count++;

    if (typeof checkAchievements === 'function') checkAchievements(timeTaken);
    updateEconomyUI();
    saveGame();
    return earned;
}

// Worked "make ten" explanation for a missed +/- fact (null if it doesn't cross the ten)
function makeTenHint(a, b, op, answer) {
    if (op === '+' && a < 10 && b < 10 && a + b > 10) {
        const toTen = 10 - a;        // add this much to reach 10
        const rest = b - toTen;      // the leftover
        return `💡 ${a} + ${b}: спочатку до 10 → ${a} + ${toTen} = 10, лишилось ${rest} → 10 + ${rest} = ${answer}`;
    }
    if (op === '−' && a > 10 && answer < 10 && b > (a - 10)) {
        const toTen = a - 10;        // subtract this much to reach 10
        const rest = b - toTen;      // still to subtract
        return `💡 ${a} − ${b}: спочатку до 10 → ${a} − ${toTen} = 10, ще ${rest} → 10 − ${rest} = ${answer}`;
    }
    return null;
}

// Exam answer: record the outcome silently and advance (no colour/emoji/reveal)
function handleExamResult(correct, userAnswer, timeMs) {
    if (correct) { state.score++; state.sessionCorrect++; }
    const p = state.currentProblem;
    state.examResults.push({ a: p.a, b: p.b, op: p.opSymbol || '×', answer: p.answer, user: userAnswer, correct, timeMs: timeMs || 0 });

    // brief neutral acknowledgement, then next question
    const numpadDisplay = document.getElementById('numpad-display');
    if (numpadDisplay) numpadDisplay.textContent = '…';
    enableNumpad(false);
    setTimeout(nextProblem, 250);
}

function handleResult(correct, userAnswer, btnElement) {
    const answerDisplay = document.getElementById('answer-display');
    const feedback = document.getElementById('feedback');
    const problemContainer = document.getElementById('problem-container');

    // Adaptivity: log this attempt against its fact
    const timeTaken = Date.now() - state.problemStartTime;
    recordStat(state.currentProblem && state.currentProblem.factKey, correct, timeTaken);

    // Тихий екзамен: без «правильно/ні» під час проходження — лише записуємо й далі
    if (isSilentExam(state.mode)) {
        handleExamResult(correct, userAnswer, timeTaken);
        return;
    }

    // Тренування на Весну веде той самий журнал, що й екзамен (таблиця, помилки, історія)
    if (state.mode === 'goatexam') {
        const p = state.currentProblem;
        state.examResults.push({ a: p.a, b: p.b, op: p.opSymbol, answer: p.answer, user: userAnswer, correct, timeMs: timeTaken });
    }

    // Per-question log for the end-of-session results table (+/- family)
    if (hasResultsTable(state.mode)) {
        const p = state.currentProblem;
        const label = p.label || `${p.a} ${p.opSymbol} ${p.b} = ${p.answer}`;
        state.sessionLog.push({ label, answer: p.answer, user: userAnswer, correct, timeMs: timeTaken });
    }

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

        // Teaching moment: show the "make ten" method for a missed +/- fact.
        // The hint stays until the child closes it (×) — no auto-advance while it's up.
        let hintPaused = false;
        if (state.mode === 'tens') {
            showTensHint(state.currentProblem);
            hintPaused = true;
        } else if (['addition', 'subtraction', 'plusminus', 'goatexam'].includes(state.mode)) {
            const p = state.currentProblem;
            const h = state.mode === 'goatexam'
                ? springHint(p.a, p.b, p.opSymbol, p.answer)
                : (p.a >= 10 && p.b >= 10
                    ? columnHint(p.a, p.b, p.opSymbol, p.answer)
                    : makeTenHint(p.a, p.b, p.opSymbol, p.answer));
            if (h) {
                document.getElementById('hint-text').textContent = h;
                document.getElementById('hint').classList.add('show');
                hintPaused = true;
            }
        }

        setTimeout(() => {
            answerDisplay.textContent = state.currentProblem.answer;
            answerDisplay.className = 'problem-answer correct';

            if (state.inputMode === 'numpad') {
                document.getElementById('numpad-display').textContent = 'Відповідь: ' + state.currentProblem.answer;
            }
        }, 800);

        disableChoices();
        // With a hint up we wait for dismissHint(); otherwise advance on a timer
        if (!hintPaused) {
            setTimeout(nextProblem, state.mode === 'blitz' ? CONFIG.pace.blitzWrong : CONFIG.pace.wrong);
        }
    }
}

// Close the make-ten hint and move on to the next problem
function dismissHint() {
    document.getElementById('hint').classList.remove('show');
    const hv = document.getElementById('hint-visual');
    if (hv) { hv.innerHTML = ''; hv.style.display = 'none'; }
    nextProblem();
}

function disableChoices() {
    for (let i = 0; i < 4; i++) {
        document.getElementById(`choice-${i}`).disabled = true;
    }
    enableNumpad(false);
}

// ===== COMPLETION SCREEN =====
function showCompletion() {
    state.session = null; // session finished — clear the resumable snapshot
    const correct = state.sessionCorrect;
    const total = state.mode === 'blitz' ? state.round - 1 : state.totalRounds;
    let percent = total > 0 ? Math.round((correct / total) * 100) : 0;

    const isExam = isExamMode(state.mode);
    const isGoat = state.mode === 'goatexam';
    const examErrors = total - correct;
    const examPassed = examErrors <= CONFIG.examMaxErrors;
    const examMistakes = isExam ? state.examResults.filter(r => !r.correct)
        .map(r => ({ a: r.a, b: r.b, op: r.op || '×', answer: r.answer, user: r.user, timeMs: r.timeMs || 0 })) : null;
    // Aggregate timing for later analysis (avg + slowest answers)
    const examAvgMs = isExam && state.examResults.length
        ? Math.round(state.examResults.reduce((s, r) => s + (r.timeMs || 0), 0) / state.examResults.length) : 0;

    // Рівень пройдено до кінця — тільки тепер зараховуємо монети, накопичені за відповіді
    const answerCoins = state.sessionCoins || 0;
    state.coins += answerCoins;
    state.sessionCoins = 0;
    if (answerCoins > 0) {
        setTimeout(() => showNotification(`+${answerCoins} 💰 за рівень`, 'Монети зараховано — ти пройшла рівень до кінця! 🎉', '✅'), 300);
    }

    // Save to history (exams also store mistakes + pass flag + avg time for later analysis)
    // Фактично нараховані монети за сесію (+ бонус за складений екзамен) — для звіту батькам
    const earnedCoins = answerCoins +
        (isExam && examPassed ? (isGoat ? CONFIG.goatExamPassBonus : CONFIG.examPassBonus) : 0);
    saveSession(state.mode, state.difficultyLabel || modeLabel(state.mode), correct, total,
        isExam ? { mistakes: examMistakes, passed: examPassed, avgMs: examAvgMs, coins: earnedCoins }
               : { coins: earnedCoins });

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
    } else if (isExam) {
        const passBonus = isGoat ? CONFIG.goatExamPassBonus : CONFIG.examPassBonus;
        if (examPassed) {
            completeEmoji.textContent = isGoat ? '🌷' : '🏆';
            if (isGoat) {
                subtitle.textContent = (examErrors === 0
                    ? 'Тренування на Весну пройдено без помилок! 🌷'
                    : `Тренування на Весну пройдено! Помилок: ${examErrors}. 🌷`)
                    + ` +${passBonus} 💰`;
            } else {
                subtitle.textContent = (examErrors === 0
                    ? 'Екзамен складено без помилок!'
                    : `Екзамен складено! Помилок: ${examErrors}.`) + ` +${passBonus} 💰`;
            }
            state.coins += passBonus;
            updateEconomyUI();
            saveGame(true);
        } else {
            completeEmoji.textContent = isGoat ? '🌱' : '💪';
            subtitle.textContent = isGoat
                ? `Помилок: ${examErrors} (щоб пройти — щонайбільше 2). Переглянь пояснення і спробуй ще! 💪`
                : `Не склав: ${examErrors} помилок (треба менше 3). Подивись, де саме, і спробуй ще!`;
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
    if (!isExam) { // 100 stars would be too many — exam shows the score/grade + mistakes instead
        for (let i = 0; i < total; i++) {
            const star = document.createElement('span');
            star.className = 'star';
            star.textContent = i < correct ? '⭐' : '☆';
            star.style.animationDelay = `${i * 0.08}s`;
            starsContainer.appendChild(star);
        }
    }

    // Exam: list the mistakes so they can be reviewed
    const mistakesEl = document.getElementById('complete-mistakes');
    if (mistakesEl) {
        mistakesEl.innerHTML = '';
        if (isExam) {
            if (examMistakes.length === 0) {
                mistakesEl.innerHTML = '<div class="mistakes-none">Жодної помилки! 🎉</div>';
            } else {
                mistakesEl.innerHTML = `<div class="mistakes-title">Помилки (${examMistakes.length}):</div>`;
                const list = document.createElement('div');
                list.className = 'mistakes-list';
                examMistakes.forEach(m => {
                    const chip = document.createElement('div');
                    chip.className = 'mistake-chip';
                    chip.innerHTML = `<b>${m.a} ${m.op || '×'} ${m.b} = ${m.answer}</b><span>ти: ${m.user}</span>`;
                    list.appendChild(chip);
                });
                mistakesEl.appendChild(list);
            }
        }
    }

    // +/- family: per-question results table (example / right-wrong / seconds).
    // The goat exam gets the same full table built from its exam log — повна статистика.
    const resultsEl = document.getElementById('complete-results');
    if (resultsEl) {
        resultsEl.innerHTML = '';
        const tableLog = isGoat
            ? state.examResults.map(r => ({ label: `${r.a} ${r.op} ${r.b} = ${r.answer}`, user: r.user, correct: r.correct, timeMs: r.timeMs || 0 }))
            : (hasResultsTable(state.mode) ? (state.sessionLog || []) : []);
        if (tableLog.length) {
            let rows = '';
            tableLog.forEach(r => {
                const sec = (r.timeMs / 1000).toFixed(1);
                const you = r.correct ? '' : ` <span class="rt-you">${r.note || 'ти: ' + r.user}</span>`;
                rows += `<tr class="${r.correct ? 'rt-ok' : 'rt-bad'}">
                    <td class="rt-ex">${r.label}${you}</td>
                    <td class="rt-sec">${sec}s</td>
                    <td class="rt-mark">${r.correct ? '✓' : '✗'}</td>
                </tr>`;
            });
            resultsEl.innerHTML = `<table class="results-table">
                <thead><tr><th>Приклад</th><th>Час</th><th></th></tr></thead>
                <tbody>${rows}</tbody></table>`;
        }
    }

    showScreen('screen-complete');

    const celebrate = isExam ? examPassed : percent >= 60;
    const perfect = total > 0 && correct === total; // жодної помилки за всю сесію
    if (perfect) {
        // Завдання дня закриває лише ідеальний рівень ПОТРІБНОГО режиму
        if (isDailyTaskSession()) {
            completeDailyTask();
        } else if (!isExam && state.mode !== 'blitz') {
            // Ідеально, але не той режим — підкажемо, де чекає медаль
            const meta = MODE_META[dailyTaskMode()] || {};
            setTimeout(() => showNotification('Ідеально! 🌟',
                `А завдання дня — ${meta.icon || ''} ${meta.label || ''}. Пройди його без помилок і отримай медаль 🏅`,
                '🎯'), 800);
        }
        // Великий салют на весь екран + конфеті — за будь-який ідеальний рівень
        setTimeout(launchConfetti, 300);
        setTimeout(launchFireworks, 400);
        setTimeout(launchConfetti, 1300);
    } else if (celebrate) {
        setTimeout(launchConfetti, 300);
    }

    document.getElementById('progress-bar').style.width = '100%';
}

function playAgain() {
    if (state.mode === 'exam') startExam();
    else if (state.mode === 'goatexam') startGoatExam();
    else startGame();
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

// ===== ЗВІТ ДЛЯ БАТЬКІВ (звідки взялися монети) =====
// Нові сесії зберігають фактично нараховані монети в history[].coins.
// Для старих записів рахуємо приблизно за поточними ставками MODE_META.
function sessionCoinsOf(h) {
    if (typeof h.coins === 'number') return { coins: h.coins, exact: true };
    const d = h.difficulty || '';
    const meta = MODE_META[h.mode] || {};
    let per = isExamMode(h.mode) ? (h.mode === 'goatexam' ? 1 : 0)
                                 : (d === 'Через десяток' ? (meta.crossingReward || 2) : (meta.reward || 1));
    if (h.mode === 'multiplication' && /^На [25]$/.test(d)) per = 0; // денний ліміт
    let c = (h.correct || 0) * per;
    if (h.mode === 'exam' && h.passed) c += CONFIG.examPassBonus;
    if (h.mode === 'goatexam' && h.passed) c += CONFIG.goatExamPassBonus;
    return { coins: c, exact: false };
}

// Режими, де дитина може «фармити» найлегший контент — підсвічуємо в звіті
function isFarmRow(mode, difficulty) {
    return (mode === 'multiplication' || mode === 'division') && /^Мікс [25]$/.test(difficulty || '');
}

function showParentReport() {
    const today = new Date().toLocaleDateString('en-CA');
    const hist = getHistory();
    const sess = hist.filter(h => h.date === today);

    const rows = {};
    let total = 0, answers = 0, approx = false;
    sess.forEach(h => {
        const r = sessionCoinsOf(h);
        if (!r.exact) approx = true;
        const label = (MODE_META[h.mode] ? MODE_META[h.mode].label : h.mode);
        const diff = (h.difficulty || '').trim();
        // не дублюємо назву режиму в підписі («Бліц-Турнір · Бліц»)
        const showDiff = diff && !label.startsWith(diff) && !diff.startsWith(label);
        const key = label + (showDiff ? ' · ' + diff : '');
        if (!rows[key]) rows[key] = { coins: 0, sessions: 0, correct: 0, farm: isFarmRow(h.mode, h.difficulty) };
        rows[key].coins += r.coins;
        rows[key].sessions++;
        rows[key].correct += (h.correct || 0);
        total += r.coins;
        answers += (h.correct || 0);
    });

    const tasks = (state.daily && state.daily.tasksDone) || 0;
    const taskCoins = tasks ? CONFIG.dailyBonus + (tasks - 1) * CONFIG.dailyRepeatBonus : 0;

    let html = '';
    const sorted = Object.entries(rows).sort((a, b) => b[1].coins - a[1].coins);
    if (!sorted.length) {
        html += '<div class="mistakes-none">Сьогодні ще не грали 🙂</div>';
    } else {
        html += '<table class="results-table"><thead><tr><th>Режим</th><th>Монет</th><th>Сес.</th><th>Прав.</th></tr></thead><tbody>';
        sorted.forEach(([k, v]) => {
            const share = total ? Math.round(v.coins / total * 100) : 0;
            html += `<tr class="${v.farm ? 'rt-bad' : 'rt-ok'}">
                <td class="rt-ex">${v.farm ? '⚠️ ' : ''}${k}</td>
                <td class="rt-sec"><b>${v.coins}</b> <span class="rp-share">${share}%</span></td>
                <td class="rt-sec">${v.sessions}</td>
                <td class="rt-mark">${v.correct}</td>
            </tr>`;
        });
        html += '</tbody></table>';
    }

    html += `<div class="rp-totals">
        <div>Сесій сьогодні: <b>${sess.length}</b>, правильних відповідей: <b>${answers}</b></div>
        <div>Монет за відповіді: <b>${total}</b> + завдання дня (${tasks}): <b>${taskCoins}</b> → <b>${total + taskCoins}</b></div>
        <div>Лічильник у грі (daily.count): <b>${(state.daily && state.daily.count) || 0}</b></div>
        <div>Баланс зараз: <b>${state.coins} 💰</b>, Robux до видачі: <b>${state.robuxOwed || 0}</b></div>
        ${approx ? '<div class="rp-note">Частина сесій — до введення обліку монет, для них сума приблизна.</div>' : ''}
    </div>`;

    // Останні 7 днів
    const byDay = {};
    hist.forEach(h => {
        if (!byDay[h.date]) byDay[h.date] = { coins: 0, sessions: 0, correct: 0 };
        byDay[h.date].coins += sessionCoinsOf(h).coins;
        byDay[h.date].sessions++;
        byDay[h.date].correct += (h.correct || 0);
    });
    const days = Object.keys(byDay).sort().reverse().slice(0, 7);
    if (days.length) {
        html += '<h3 class="rp-subtitle">Останні дні</h3><table class="results-table"><thead><tr><th>Дата</th><th>Монет</th><th>Сес.</th><th>Прав.</th></tr></thead><tbody>';
        days.forEach(d => {
            const v = byDay[d];
            html += `<tr class="${d === today ? 'rt-ok' : ''}"><td class="rt-ex">${d}</td><td class="rt-sec"><b>${v.coins}</b></td><td class="rt-sec">${v.sessions}</td><td class="rt-mark">${v.correct}</td></tr>`;
        });
        html += '</tbody></table>';
    }

    document.getElementById('parent-report-body').innerHTML = html;
    showScreen('screen-parent-report');
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
    fireworkParticles = fireworkParticles.filter(p => p.life > 0);

    if (confettiPieces.length === 0 && fireworkParticles.length === 0) {
        confettiAnimating = false;
        return;
    }

    drawFireworkParticles();

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

// --- Fireworks (великий салют за ідеальний результат) ---
// Shares the confetti canvas and animation loop: particles live in fireworkParticles
// and are drawn by drawFireworkParticles() inside animateConfetti().
let fireworkParticles = [];

const FIREWORK_COLORS = [
    '#FF5E7E', '#FFD447', '#7DFFB0', '#5ECBFF',
    '#C58BFF', '#FF9C5E', '#FFF7A1', '#FF7EEB',
];

function spawnFireworkBurst(x, y) {
    const color = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
    const color2 = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
    const count = 55 + Math.floor(Math.random() * 25);
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.2;
        const speed = 2.5 + Math.random() * 6;
        fireworkParticles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: 3 + Math.random() * 3,
            color: Math.random() < 0.5 ? color : color2,
            life: 1,
            decay: 0.007 + Math.random() * 0.011,
        });
    }
    // короткий яскравий спалах у центрі залпу
    fireworkParticles.push({
        x, y, vx: 0, vy: 0,
        size: 26 + Math.random() * 14,
        color: '#FFFFFF',
        life: 1,
        decay: 0.09,
        flash: true,
    });
}

function launchFireworks() {
    // 10 залпів по всьому екрану впродовж ~3 секунд
    const bursts = 10;
    for (let i = 0; i < bursts; i++) {
        setTimeout(() => {
            const x = confettiCanvas.width * (0.1 + Math.random() * 0.8);
            const y = confettiCanvas.height * (0.12 + Math.random() * 0.5);
            spawnFireworkBurst(x, y);
            if (!confettiAnimating) {
                confettiAnimating = true;
                animateConfetti();
            }
        }, i * 320);
    }
}

function drawFireworkParticles() {
    if (fireworkParticles.length === 0) return;
    confettiCtx.save();
    fireworkParticles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.985;
        p.vy = p.vy * 0.985 + 0.05; // drag + gravity
        p.life -= p.decay;

        // twinkle as the spark burns out
        const alpha = p.life < 0.35 && Math.random() < 0.3 ? p.life * 0.3 : p.life;
        const a = Math.max(0, alpha);
        const r = p.size * (0.5 + p.life * 0.5);
        confettiCtx.fillStyle = p.color;

        // soft halo behind the bright core (cheaper than shadowBlur on mobile)
        confettiCtx.globalAlpha = a * 0.3;
        confettiCtx.beginPath();
        confettiCtx.arc(p.x, p.y, r * 2.4, 0, Math.PI * 2);
        confettiCtx.fill();

        confettiCtx.globalAlpha = a;
        confettiCtx.beginPath();
        confettiCtx.arc(p.x, p.y, r, 0, Math.PI * 2);
        confettiCtx.fill();
    });
    confettiCtx.restore();
}

// --- Floating Decorations ---
function createFloatingDecorations() {
    const container = document.getElementById('floating-decorations');
    const items = ['🎃', '👻', '🦇', '🕷️', '🕸️', '🌙', '⭐', '💀', '🍬', '🦉'];

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

    // Robux cards
    const robuxUsed = (state.daily && state.daily.robuxToday) || 0;
    const robuxLeft = Math.max(0, CONFIG.robuxDailyLimit - robuxUsed);
    [[5, 50], [10, 100], [500, 8000], [1000, 15000]].forEach(([robux, cost]) => {
        const btn = document.getElementById(`btn-buy-robux-${robux}`);
        document.getElementById(`msg-robux-${robux}-success`).style.display = 'none';
        document.getElementById(`msg-robux-${robux}-error`).style.display = 'none';
        if (!btn) return;
        const smallExchange = robux <= CONFIG.robuxDailyLimit;
        if (state.coins < cost) {
            btn.textContent = 'Не вистачає монет';
            btn.classList.add('disabled'); btn.disabled = true;
        } else if (smallExchange && robux > robuxLeft) {
            btn.textContent = 'Ліміт на сьогодні';
            btn.classList.add('disabled'); btn.disabled = true;
        } else {
            btn.textContent = `Обміняти (${cost} 💰)`;
            btn.classList.remove('disabled'); btn.disabled = false;
        }
    });

    showScreen('screen-shop');
}

function buyRobux(robux, cost) {
    const buyBtn = document.getElementById(`btn-buy-robux-${robux}`);
    const successMsg = document.getElementById(`msg-robux-${robux}-success`);
    const errorMsg = document.getElementById(`msg-robux-${robux}-error`);
    const used = (state.daily && state.daily.robuxToday) || 0;

    const fail = (text) => {
        errorMsg.textContent = text;
        errorMsg.style.display = 'block';
        successMsg.style.display = 'none';
        buyBtn.classList.add('shake');
        setTimeout(() => buyBtn.classList.remove('shake'), 400);
    };

    // Small treats (≤ daily limit) are capped per day; big milestone packs are exempt
    // (they cost thousands of coins, so they're naturally rare).
    const smallExchange = robux <= CONFIG.robuxDailyLimit;

    if (state.coins < cost) { fail('Потрібно більше монет!'); return; }
    if (smallExchange && used + robux > CONFIG.robuxDailyLimit) {
        fail(`Ліміт: ${CONFIG.robuxDailyLimit} Robux на день. Приходь завтра!`);
        return;
    }

    state.coins -= cost;
    state.robuxOwed = (state.robuxOwed || 0) + robux;
    if (!state.daily) state.daily = {};
    if (smallExchange) state.daily.robuxToday = used + robux;
    updateEconomyUI();
    saveGame(true);

    successMsg.style.display = 'block';
    errorMsg.style.display = 'none';
    setTimeout(launchConfetti, 100);
    setTimeout(launchConfetti, 500);
    setTimeout(() => {
        showShop();
        successMsg.style.display = 'block';
        setTimeout(() => successMsg.style.display = 'none', 3000);
    }, 100);
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

