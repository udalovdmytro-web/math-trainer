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
    // Multiplication specifics
    minA: 2,
    maxA: 4,
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
    problemStartTime: 0
};

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
            history: state.history
        });
    } catch (e) {
        console.error("Ошибка сохранения в Firebase: ", e);
    }
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
        let pct = Math.min(100, Math.round((state.daily.count / 100) * 100));
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
        
        if (state.daily.date !== yesterdayStr || state.daily.count < 100) {
            state.daily.streak = 0;
        }
        state.daily.count = 0;
        state.daily.date = today;
        state.daily.multLimits = {};
        saveToFirebase();
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
    state.history = history;
    saveToFirebase();
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
        } else {
            // New user
            state.coins = 0;
            state.combo = 0;
            state.robloxTime = 0;
            state.daily = { date: '', count: 0, streak: 0, multLimits: {} };
            state.achievements = [];
            state.blitzRecord = 0;
            state.history = [];
            await docRef.set({ coins: 0, combo: 0, robloxTime: 0, daily: state.daily, achievements: [], blitzRecord: 0, history: [] });
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
                { emoji: '🦋', label: 'Вся таблиця (2-5)', desc: 'Вся таблиця', minA: 2, maxA: 5, reward: 1 },
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
            if (mode === 'multiplication') {
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
        return { a, b, answer, opSymbol };
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

        case 'multiplication':
            // a × b = ?, no multiplying by 1
            a = randomInt(state.minA, state.maxA);
            b = randomInt(2, 10);
            answer = a * b;
            opSymbol = '×';
            break;

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

    return { a, b, answer, opSymbol };
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
            answers: [10, remainder, answer]
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
            answers: [10, remainder, answer]
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

            // Economy
            state.combo++;
            let earned = state.mode === 'subtraction' ? 3 : 2;
            state.coins += earned;

            if (state.daily && state.daily.count < 100) {
                state.daily.count++;
                if (state.daily.count === 100) {
                    state.daily.streak++;
                    state.coins += 50;
                    setTimeout(() => showNotification('Завдання дня виконано!', '+50 монет! Серія: ' + state.daily.streak + ' дн.', '🎯'), 500);
                }
                updateDailyUI();
            }

            const timeTaken = Date.now() - state.problemStartTime;
            if (typeof checkAchievements === 'function') checkAchievements(timeTaken);
            updateEconomyUI();
            saveToFirebase();

            const feedback = document.getElementById('feedback');
            const emojis = ['🎉', '⭐', '🌟', '💫', '✨', '🎊', '💖', '🦄', '🌈', '🎀'];
            feedback.textContent = emojis[Math.floor(Math.random() * emojis.length)];
            feedback.className = 'feedback show';

            if (state.sessionCorrect % 3 === 0) launchConfetti();

            setTimeout(nextProblem, 1500);
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
                updateEconomyUI();
                saveToFirebase();

                renderCrossingSteps();

                setTimeout(nextProblem, 1500);
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

function handleResult(correct, userAnswer, btnElement) {
    const answerDisplay = document.getElementById('answer-display');
    const feedback = document.getElementById('feedback');
    const problemContainer = document.getElementById('problem-container');

    if (correct) {
        state.score++;
        state.sessionCorrect++;
        document.getElementById('score-value').textContent = state.score;

        // Economy
        state.combo++;
        let earned = 1;
        if (state.mode === 'subtraction') earned = 2;
        if (state.mode === 'logic') earned = 3;

        // Multiplication anti-abuse
        if (state.mode === 'multiplication' && state.minA === state.maxA) {
            if (!state.daily.multLimits) state.daily.multLimits = {};
            const num = state.minA;
            if (!state.daily.multLimits[num]) state.daily.multLimits[num] = 0;
            
            if (state.daily.multLimits[num] >= 60) {
                earned = 0; // limit reached
                if (state.daily.multLimits[num] === 60) {
                    showNotification('Ліміт вичерпано!', `Ти вже багато розв'язав на ${num}. Обирай інші приклади, щоб отримувати монети.`, '🚫');
                    state.daily.multLimits[num]++; // increment to not show msg again
                }
            } else {
                state.daily.multLimits[num]++;
            }
        }

        state.coins += earned;
        
        // Daily logic
        if (state.daily && state.daily.count < 100) {
            state.daily.count++;
            if (state.daily.count === 100) {
                state.daily.streak++;
                state.coins += 50; 
                setTimeout(() => showNotification('Завдання дня виконано!', '+50 монет! Серія: ' + state.daily.streak + ' дн.', '🎯'), 500);
            }
            updateDailyUI();
        }
        
        const timeTaken = Date.now() - state.problemStartTime;
        if (typeof checkAchievements === 'function') checkAchievements(timeTaken);

        updateEconomyUI();
        saveToFirebase();

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
        setTimeout(nextProblem, state.mode === 'blitz' ? 600 : 1200);

    } else {
        // Economy
        state.combo = 0;
        updateEconomyUI();
        saveToFirebase();

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
        setTimeout(nextProblem, state.mode === 'blitz' ? 1000 : 2200);
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
    const modeLabels = { addition: 'Додавання', subtraction: 'Віднімання', multiplication: 'Множення', blitz: 'Бліц-Турнір', logic: 'Логіка' };
    saveSession(state.mode, state.difficultyLabel || modeLabels[state.mode], correct, total);

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
            saveToFirebase();
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

    const modeLabels = {
        addition: '➕ Додавання',
        subtraction: '➖ Віднімання',
        multiplication: '✖️ Множення',
    };

    const modeColors = {
        addition: 'var(--pink-light)',
        subtraction: 'var(--lavender)',
        multiplication: 'var(--mint)',
    };

    sessions.sort((a, b) => a.timestamp - b.timestamp);

    sessions.forEach(session => {
        const percent = Math.round((session.correct / session.total) * 100);
        const item = document.createElement('div');
        item.className = 'day-detail-item';
        item.style.borderLeftColor = modeColors[session.mode] || 'var(--pink-light)';

        let emoji = '💪';
        if (percent === 100) emoji = '🏆';
        else if (percent >= 80) emoji = '🎉';
        else if (percent >= 60) emoji = '😊';

        item.innerHTML = `
            <div class="detail-header">
                <span class="detail-mode">${modeLabels[session.mode] || session.mode}</span>
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
        saveToFirebase();
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
        saveToFirebase();
        
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

// Start auth flow
setTimeout(initAuth, 100);

