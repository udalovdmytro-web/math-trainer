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
    minA: 1,
    maxA: 4,
    // Calendar
    calendarYear: new Date().getFullYear(),
    calendarMonth: new Date().getMonth(),
};

// ===== HISTORY (localStorage) =====
function getHistory() {
    try {
        const data = localStorage.getItem('mathHistory');
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
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
    localStorage.setItem('mathHistory', JSON.stringify(history));
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
            title: 'Сложение',
            options: [
                { emoji: '🌟', label: 'До 20', desc: 'Сложение в пределах 20', maxNum: 20 },
            ]
        },
        subtraction: {
            icon: '➖',
            title: 'Вычитание',
            options: [
                { emoji: '🌟', label: 'До 20', desc: 'Вычитание в пределах 20', maxNum: 20 },
            ]
        },
        multiplication: {
            icon: '✖️',
            title: 'Умножение',
            options: [
                { emoji: '🐣', label: 'На 1 и 2', desc: 'Таблица на 1 и 2', maxA: 2, minA: 1 },
                { emoji: '🐥', label: 'На 3 и 4', desc: 'Таблица на 3 и 4', maxA: 4, minA: 3 },
                { emoji: '🦋', label: 'На 1—4', desc: 'Вся таблица', maxA: 4, minA: 1 },
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
        `;
        card.onclick = () => {
            state.difficultyLabel = opt.label;
            if (mode === 'multiplication') {
                state.minA = opt.minA || 1;
                state.maxA = opt.maxA || 4;
            } else {
                state.maxNum = opt.maxNum;
            }
            startGame();
        };
        submenuContainer.appendChild(card);
    });

    // For addition/subtraction with only 1 option, go directly to game
    if (config.options.length === 1) {
        state.difficultyLabel = config.options[0].label;
        state.maxNum = config.options[0].maxNum;
        startGame();
        return;
    }

    showScreen('screen-submenu');
}

// ===== PROBLEM GENERATION =====
function generateProblem() {
    let a, b, answer, opSymbol;

    switch (state.mode) {
        case 'addition':
            // a + b = ?, both a,b >= 3, result <= maxNum
            // min sum = 6, max sum = maxNum
            answer = randomInt(6, state.maxNum);
            a = randomInt(3, answer - 3);
            b = answer - a;
            opSymbol = '+';
            break;

        case 'subtraction':
            // a - b = ?, both a,b >= 3, a >= b, a <= maxNum
            // a must be >= 6 (since b >= 3, a >= b >= 3, and a >= 3+3=6)
            a = randomInt(6, state.maxNum);
            b = randomInt(3, a);
            answer = a - b;
            opSymbol = '−';
            break;

        case 'multiplication':
            // a × b = ?, a is within minA..maxA (1-4)
            a = randomInt(state.minA, state.maxA);
            b = randomInt(1, 10);
            answer = a * b;
            opSymbol = '×';
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

    document.getElementById('score-value').textContent = '0';
    document.getElementById('progress-total').textContent = state.totalRounds;
    showScreen('screen-game');
    nextProblem();
}

function nextProblem() {
    state.round++;
    state.answered = false;
    state.numpadValue = '';

    if (state.round > state.totalRounds) {
        showCompletion();
        return;
    }

    state.currentProblem = generateProblem();
    const { a, b, answer, opSymbol } = state.currentProblem;

    document.getElementById('num-a').textContent = a;
    document.getElementById('op').textContent = opSymbol;
    document.getElementById('num-b').textContent = b;

    const answerDisplay = document.getElementById('answer-display');
    answerDisplay.textContent = '?';
    answerDisplay.className = 'problem-answer';

    document.getElementById('progress-current').textContent = state.round;
    document.getElementById('progress-bar').style.width = `${((state.round - 1) / state.totalRounds) * 100}%`;

    document.getElementById('feedback').textContent = '';
    document.getElementById('feedback').className = 'feedback';

    const problemContainer = document.getElementById('problem-container');
    problemContainer.classList.remove('shake');

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
    document.querySelectorAll('.numpad-btn').forEach(btn => {
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

        if (state.sessionCorrect % 3 === 0) {
            launchConfetti();
        }

        disableChoices();
        setTimeout(nextProblem, 1200);

    } else {
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
                document.getElementById('numpad-display').textContent = 'Ответ: ' + state.currentProblem.answer;
            }
        }, 800);

        disableChoices();
        setTimeout(nextProblem, 2200);
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
    const total = state.totalRounds;
    const percent = Math.round((correct / total) * 100);

    // Save to history
    const modeLabels = { addition: 'Сложение', subtraction: 'Вычитание', multiplication: 'Умножение' };
    saveSession(state.mode, state.difficultyLabel || modeLabels[state.mode], correct, total);

    document.getElementById('stat-correct').textContent = correct;
    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-percent').textContent = percent + '%';

    const completeEmoji = document.getElementById('complete-emoji');
    const subtitle = document.getElementById('complete-subtitle');

    if (percent === 100) {
        completeEmoji.textContent = '🏆';
        subtitle.textContent = 'Идеально! Ты настоящая звезда! 🌟';
    } else if (percent >= 80) {
        completeEmoji.textContent = '🎉';
        subtitle.textContent = 'Отлично! Так держать! 💪';
    } else if (percent >= 60) {
        completeEmoji.textContent = '😊';
        subtitle.textContent = 'Хорошо! Ещё немного практики! 📚';
    } else {
        completeEmoji.textContent = '💪';
        subtitle.textContent = 'Не сдавайся! Попробуй ещё раз! 🌈';
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
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

const MONTH_NAMES_GEN = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
];

const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

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
        addition: '➕ Сложение',
        subtraction: '➖ Вычитание',
        multiplication: '✖️ Умножение',
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
