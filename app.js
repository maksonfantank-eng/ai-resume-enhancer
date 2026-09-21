// ===================== STATE =====================
var defaultAtriaKey = 'atr_QH0hvLLGd-3JG-GwWz-tAW7ren6R_eh2';
var apiKey = localStorage.getItem('resume_ai_key') || defaultAtriaKey;
var apiProvider = localStorage.getItem('resume_ai_provider') || 'atria';
var apiModel = localStorage.getItem('resume_ai_model') || 'Atria-Dawn-Preview';
var PROXY_URL = localStorage.getItem('resume_ai_proxy') || '';
var selectedPlatform = 'hh';
var currentTone = 'business';
var isProcessing = false;
var lastResult = null;
var lastChanges = null;

// ===================== AUTH STATE =====================
var currentUser = JSON.parse(localStorage.getItem('resume_current_user') || 'null');
var pendingRegistration = null;
var ADMIN_EMAIL = 'maksonfantank@gmail.ru';
var ADMIN_PASSWORD = '7777';

function getUsers() {
    var users = JSON.parse(localStorage.getItem('resume_users') || '[]');
    if (!users.some(function(u) { return u.email === ADMIN_EMAIL; })) {
        users.push({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: 'admin', confirmed: true });
        localStorage.setItem('resume_users', JSON.stringify(users));
    }
    return users;
}

function saveUsers(users) { localStorage.setItem('resume_users', JSON.stringify(users)); }

// ===================== INIT =====================
document.addEventListener('DOMContentLoaded', function() {
    lucide.createIcons();
    updateAuthUI();
    if (apiModel) document.getElementById('apiModel') && (document.getElementById('apiModel').value = apiModel);
    if (PROXY_URL) document.getElementById('apiProxy') && (document.getElementById('apiProxy').value = PROXY_URL);
});

// ===================== UTILITY =====================
function updateCharCount() {
    var len = document.getElementById('resumeInput').value.length;
    document.getElementById('charCount').textContent = len + ' \u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432';
    document.getElementById('charCount').className = len < 50 ? 'text-xs text-yellow-500' : 'text-xs text-gray-500';
}

function showToast(message, type) {
    type = type || 'success';
    var container = document.getElementById('toastContainer');
    var toast = document.createElement('div');
    var colorMap = {
        success: 'border-neon-emerald/40 text-neon-emerald',
        error: 'border-red-500/40 text-red-400',
        info: 'border-neon-cyan/40 text-neon-cyan'
    };
    var iconMap = { success: 'check-circle', error: 'alert-circle', info: 'info' };
    toast.className = 'toast glass-card rounded-xl px-4 py-3 text-sm font-medium border ' + (colorMap[type] || colorMap.info) + ' flex items-center gap-2';
    toast.innerHTML = '<i data-lucide="' + (iconMap[type] || 'info') + '" class="w-4 h-4 flex-shrink-0"></i><span>' + message + '</span>';
    container.appendChild(toast);
    lucide.createIcons({ nodes: [toast] });
    setTimeout(function() { toast.remove(); }, 3200);
}

// ===================== PLATFORM =====================
function togglePlatform(el) {
    document.querySelectorAll('.platform-chip').forEach(function(c) { c.classList.remove('active'); });
    el.classList.add('active');
    selectedPlatform = el.dataset.platform;
}

// ===================== SETTINGS (legacy API) =====================
function openSettings() { openAuthModal('profile'); }
function closeSettings() { closeAuthModal(); }

// ===================== AUTH =====================
function openAuthModal(tab) {
    document.getElementById('authModal').classList.remove('hidden');
    document.getElementById('authLoginForm').classList.add('hidden');
    document.getElementById('authRegisterForm').classList.add('hidden');
    document.getElementById('authConfirmForm').classList.add('hidden');
    document.getElementById('authProfileForm').classList.add('hidden');
    ['loginError', 'regError', 'confirmError'].forEach(function(id) {
        var el = document.getElementById(id); if (el) el.classList.add('hidden');
    });
    if (tab === 'login') document.getElementById('authLoginForm').classList.remove('hidden');
    else if (tab === 'register') document.getElementById('authRegisterForm').classList.remove('hidden');
    else if (tab === 'confirm') document.getElementById('authConfirmForm').classList.remove('hidden');
    else if (tab === 'profile') showProfile();
}

function closeAuthModal() { document.getElementById('authModal').classList.add('hidden'); }

function showLogin() {
    document.getElementById('authLoginForm').classList.remove('hidden');
    document.getElementById('authRegisterForm').classList.add('hidden');
    document.getElementById('authConfirmForm').classList.add('hidden');
}

function showRegister() {
    document.getElementById('authLoginForm').classList.add('hidden');
    document.getElementById('authRegisterForm').classList.remove('hidden');
    document.getElementById('authConfirmForm').classList.add('hidden');
}

function showConfirm() {
    document.getElementById('authLoginForm').classList.add('hidden');
    document.getElementById('authRegisterForm').classList.add('hidden');
    document.getElementById('authConfirmForm').classList.remove('hidden');
}

function showProfile() {
    if (!currentUser) { showLogin(); return; }
    document.getElementById('authLoginForm').classList.add('hidden');
    document.getElementById('authRegisterForm').classList.add('hidden');
    document.getElementById('authConfirmForm').classList.add('hidden');
    document.getElementById('authProfileForm').classList.remove('hidden');
    document.getElementById('profileEmail').textContent = currentUser.email;
    document.getElementById('profileRole').textContent = currentUser.role === 'admin' ? '\u0410\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u043e\u0440' : '\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c';
    document.getElementById('profileAvatar').textContent = currentUser.email.charAt(0).toUpperCase();
}

function generateConfirmCode() {
    return String(Math.floor(1000 + Math.random() * 9000));
}

function doRegister() {
    var email = document.getElementById('regEmail').value.trim().toLowerCase();
    var pass = document.getElementById('regPassword').value;
    var pass2 = document.getElementById('regPassword2').value;
    var errEl = document.getElementById('regError');
    errEl.classList.add('hidden');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errEl.textContent = '\u041d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 email';
        errEl.classList.remove('hidden'); return;
    }
    if (pass.length < 4) {
        errEl.textContent = '\u041f\u0430\u0440\u043e\u043b\u044c \u043c\u0438\u043d\u0438\u043c\u0443\u043c 4 \u0441\u0438\u043c\u0432\u043e\u043b\u0430';
        errEl.classList.remove('hidden'); return;
    }
    if (pass !== pass2) {
        errEl.textContent = '\u041f\u0430\u0440\u043e\u043b\u0438 \u043d\u0435 \u0441\u043e\u0432\u043f\u0430\u0434\u0430\u044e\u0442';
        errEl.classList.remove('hidden'); return;
    }
    var users = getUsers();
    if (users.some(function(u) { return u.email === email; })) {
        errEl.textContent = '\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u0443\u0436\u0435 \u0437\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043e\u0432\u0430\u043d';
        errEl.classList.remove('hidden'); return;
    }
    var code = generateConfirmCode();
    pendingRegistration = { email: email, password: pass, code: code };
    document.getElementById('confirmEmailDisplay').textContent = email;
    document.getElementById('confirmCodeValue').textContent = code;
    showConfirm();
    showToast('\u041a\u043e\u0434 \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d (\u0434\u0435\u043c\u043e-\u0440\u0435\u0436\u0438\u043c)', 'info');
}

function doConfirm() {
    var code = document.getElementById('confirmCode').value.trim();
    var errEl = document.getElementById('confirmError');
    errEl.classList.add('hidden');
    if (!pendingRegistration) { errEl.textContent = '\u041d\u0435\u0442 \u0430\u043a\u0442\u0438\u0432\u043d\u043e\u0439 \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u0438'; errEl.classList.remove('hidden'); return; }
    if (code !== pendingRegistration.code) {
        errEl.textContent = '\u041d\u0435\u0432\u0435\u0440\u043d\u044b\u0439 \u043a\u043e\u0434';
        errEl.classList.remove('hidden'); return;
    }
    var users = getUsers();
    users.push({ email: pendingRegistration.email, password: pendingRegistration.password, role: 'user', confirmed: true });
    saveUsers(users);
    currentUser = { email: pendingRegistration.email, role: 'user' };
    localStorage.setItem('resume_current_user', JSON.stringify(currentUser));
    pendingRegistration = null;
    closeAuthModal();
    updateAuthUI();
    showToast('\u0410\u043a\u043a\u0430\u0443\u043d\u0442 \u0441\u043e\u0437\u0434\u0430\u043d! \u0414\u043e\u0431\u0440\u043e \u043f\u043e\u0436\u0430\u043b\u043e\u0432\u0430\u0442\u044c!', 'success');
}

function doLogin() {
    var email = document.getElementById('loginEmail').value.trim().toLowerCase();
    var pass = document.getElementById('loginPassword').value;
    var errEl = document.getElementById('loginError');
    errEl.classList.add('hidden');
    if (!email || !pass) {
        errEl.textContent = '\u0417\u0430\u043f\u043e\u043b\u043d\u0438\u0442\u0435 \u0432\u0441\u0435 \u043f\u043e\u043b\u044f';
        errEl.classList.remove('hidden'); return;
    }
    var users = getUsers();
    var user = users.find(function(u) { return u.email === email && u.password === pass; });
    if (!user) {
        errEl.textContent = '\u041d\u0435\u0432\u0435\u0440\u043d\u044b\u0439 email \u0438\u043b\u0438 \u043f\u0430\u0440\u043e\u043b\u044c';
        errEl.classList.remove('hidden'); return;
    }
    if (!user.confirmed) {
        errEl.textContent = '\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435 email';
        errEl.classList.remove('hidden'); return;
    }
    currentUser = { email: user.email, role: user.role };
    localStorage.setItem('resume_current_user', JSON.stringify(currentUser));
    closeAuthModal();
    updateAuthUI();
    showToast('\u0414\u043e\u0431\u0440\u043e \u043f\u043e\u0436\u0430\u043b\u043e\u0432\u0430\u0442\u044c, ' + user.email + '!', 'success');
}

function logout() {
    currentUser = null;
    localStorage.removeItem('resume_current_user');
    updateAuthUI();
    closeAuthModal();
    showToast('\u0412\u044b \u0432\u044b\u0448\u043b\u0438 \u0438\u0437 \u0430\u043a\u043a\u0430\u0443\u043d\u0442\u0430', 'info');
}

function updateAuthUI() {
    var loggedOut = document.getElementById('authLoggedOut');
    var loggedIn = document.getElementById('authLoggedIn');
    var emailEl = document.getElementById('authUserEmail');
    if (currentUser) {
        loggedOut.classList.add('hidden');
        loggedIn.classList.remove('hidden');
        emailEl.textContent = currentUser.email;
    } else {
        loggedOut.classList.remove('hidden');
        loggedIn.classList.add('hidden');
    }
}

// ===================== TABS =====================
function switchTab(tab) {
    document.getElementById('tabResume').className = tab === 'resume'
        ? 'tab-btn active flex-1 py-3.5 text-sm font-medium text-gray-500 hover:text-gray-300 transition-colors'
        : 'tab-btn flex-1 py-3.5 text-sm font-medium text-gray-500 hover:text-gray-300 transition-colors';
    document.getElementById('tabChanges').className = tab === 'changes'
        ? 'tab-btn active flex-1 py-3.5 text-sm font-medium text-gray-500 hover:text-gray-300 transition-colors'
        : 'tab-btn flex-1 py-3.5 text-sm font-medium text-gray-500 hover:text-gray-300 transition-colors';
    document.getElementById('tabResumeContent').classList.toggle('hidden', tab !== 'resume');
    document.getElementById('tabChangesContent').classList.toggle('hidden', tab !== 'changes');
}

// ===================== TONE =====================
function toggleToneMenu() { document.getElementById('toneMenu').classList.toggle('hidden'); }
function changeTone(tone) {
    currentTone = tone;
    document.getElementById('toneMenu').classList.add('hidden');
    showToast('\u0422\u043e\u043d \u0438\u0437\u043c\u0435\u043d\u0451\u043d. \u041d\u0430\u0436\u043c\u0438\u0442\u0435 \u00ab\u0423\u043b\u0443\u0447\u0448\u0438\u0442\u044c\u00bb \u0434\u043b\u044f \u043f\u043e\u0432\u0442\u043e\u0440\u043d\u043e\u0439 \u043e\u0431\u0440\u0430\u0431\u043e\u0442\u043a\u0438.', 'info');
}

document.addEventListener('click', function(e) {
    if (!e.target.closest('#toneMenu') && !e.target.closest('[onclick*="toggleToneMenu"]')) {
        document.getElementById('toneMenu').classList.add('hidden');
    }
});

// ===================== ATS SCORE =====================
function calculateATSScore(text, platform) {
    var score = 30;
    if (text.length > 200) score += 5;
    if (text.length > 500) score += 5;
    if (text.length > 1000) score += 5;
    if (/[\w.-]+@[\w.-]+\.\w+/.test(text)) score += 4;
    if (/[\+]?[\d\-\(\)\s]{7,}/.test(text)) score += 3;
    var platformKeywords = {
        hh: ['\u043e\u043f\u044b\u0442', '\u0440\u0430\u0437\u0440\u0430\u0431\u043e\u0442', '\u043d\u0430\u0432\u044b\u043a', '\u043f\u0440\u043e\u0435\u043a\u0442', '\u043e\u0431\u0440\u0430\u0437\u043e\u0432', '\u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442', '\u0442\u0435\u0445\u043d\u043e\u043b\u043e\u0433', '\u043a\u043e\u043c\u0430\u043d\u0434'],
        linkedin: ['experience', 'skills', 'achieved', 'led', 'developed', 'managed', 'improved', 'result'],
        habr: ['\u0440\u0430\u0437\u0440\u0430\u0431\u043e\u0442', 'stack', 'api', 'code', 'github', '\u0440\u0435\u0430\u043b\u0438\u0437', '\u043e\u043f\u0442\u0438\u043c\u0438\u0437', '\u0430\u0440\u0445\u0438\u0442\u0435\u043a\u0442'],
        ats: ['experience', 'skills', 'education', 'certification', 'proficient', 'managed', 'delivered', 'achieved']
    };
    var keywords = platformKeywords[platform] || platformKeywords.hh;
    var lower = text.toLowerCase();
    var matched = 0;
    keywords.forEach(function(kw) { if (lower.indexOf(kw) !== -1) matched++; });
    score += Math.floor((matched / keywords.length) * 20);
    var lines = text.split('\n').filter(function(l) { return l.trim().length > 0; });
    if (lines.length > 5) score += 3;
    if (lines.length > 15) score += 2;
    if (/[\u2022\-\*]\s/.test(text)) score += 3;
    if (/\d+[%x]|\d+\+?/.test(text)) score += 3;
    ['\u0437\u0430\u043d\u0438\u043c\u0430\u043b\u0441\u044f', '\u043e\u0441\u0443\u0447\u0435\u0441\u0442\u0432\u043b\u044f\u043b', '\u0432\u044b\u043f\u043e\u043b\u043d\u044f\u043b', '\u043f\u0440\u043e\u0432\u043e\u0434\u0438\u043b', '\u0434\u0435\u043b\u0430\u043b'].forEach(function(pw) {
        if (lower.indexOf(pw) !== -1) score -= 2;
    });
    return Math.min(Math.max(score, 10), 98);
}

function setATSScore(newScore) {
    var circumference = 283;
    var offset = circumference - (circumference * newScore / 100);
    document.getElementById('atsScoreBefore').textContent = '--';
    document.getElementById('atsScoreAfter').textContent = '--';
    document.getElementById('atsRingBefore').style.strokeDashoffset = '283';
    document.getElementById('atsRingAfter').style.strokeDashoffset = '283';
    document.getElementById('atsPlaceholder').classList.add('hidden');
    document.getElementById('atsContent').classList.remove('hidden');
    setTimeout(function() {
        document.getElementById('atsRingBefore').style.strokeDashoffset = '170';
        document.getElementById('atsScoreBefore').textContent = '42';
        document.getElementById('atsScoreBefore').className = 'text-2xl font-bold text-gray-400';
    }, 300);
    setTimeout(function() {
        document.getElementById('atsRingAfter').style.strokeDashoffset = String(offset);
        document.getElementById('atsScoreAfter').textContent = String(newScore);
        document.getElementById('atsScoreAfter').className = newScore >= 80 ? 'text-2xl font-bold text-neon-emerald' : newScore >= 60 ? 'text-2xl font-bold text-yellow-400' : 'text-2xl font-bold text-red-400';
    }, 800);
}

// ===================== SYSTEM PROMPT =====================
function buildSystemPrompt() {
    var pNames = { hh: 'hh.ru', linkedin: 'LinkedIn', habr: 'Habr Career', ats: 'ATS (Workday, Greenhouse)' };
    var tones = {
        business: '\u0421\u0442\u0440\u043e\u0433\u0438\u0439 \u0434\u0435\u043b\u043e\u0432\u043e\u0439 \u0441\u0442\u0438\u043b\u044c.',
        creative: '\u041a\u0440\u0435\u0430\u0442\u0438\u0432\u043d\u044b\u0439 \u0441\u0442\u0438\u043b\u044c.',
        concise: '\u041c\u0430\u043a\u0441\u0438\u043c\u0430\u043b\u044c\u043d\u043e \u043b\u0430\u043a\u043e\u043d\u0438\u0447\u043d\u044b\u0439.'
    };
    return 'You are an expert ATS resume optimizer for ' + pNames[selectedPlatform] + '. TASK: Given a resume and a target job title, deeply analyze and rewrite the resume specifically tailored for that position. RULES: 1) Parse the resume into sections: header, summary/objective, experience, skills, education. 2) Rewrite each section to highlight relevance to the target job. 3) Replace ALL passive verbs with strong action verbs. 4) Apply STAR method (Situation, Task, Action, Result) to every experience bullet. 5) Add quantified metrics where missing. 6) Eliminate weak filler phrases. 7) Inject keywords from the target job title into relevant sections. 8) Reorder skills to prioritize those matching the job title. 9) Rewrite summary/objective to directly address the target position. 10) Keep ALL original factual information. TONE: ' + tones[currentTone] + '. Return EXACTLY in this format:\n===IMPROVED_RESUME===\n[complete rewritten resume]\n\n===CHANGES===\n[+ added, - removed, ~ modified]\n\n===MISSING_SECTIONS===\n[sections that were missing and added, e.g. summary, certifications]';
}

// ===================== DEEP ANALYSIS ENGINE =====================
function parseResumeSections(text) {
    var lines = text.split('\n');
    var sections = { header: [], summary: [], experience: [], skills: [], education: [], other: [] };
    var currentSection = 'header';
    var sectionKeywords = {
        summary: ['\u0446\u0435\u043b\u044c', '\u043e \u043c\u043d\u0435', '\u043f\u0440\u043e \u0441\u0435\u0431\u044f', '\u043f\u0440\u043e\u0444\u0438\u043b\u044c', '\u0432\u0432\u0435\u0434\u0435\u043d\u0438\u0435', 'summary', 'about', 'profile', 'objective', '\u043e\u0431\u0437\u043e\u0440 \u0440\u0435\u0437\u044e\u043c\u0435'],
        experience: ['\u043e\u043f\u044b\u0442', '\u0440\u0430\u0431\u043e\u0442\u0430', '\u0434\u043e\u043b\u0436\u043d\u043e\u0441\u0442\u0438', '\u043a\u0430\u0440\u044c\u0435\u0440\u0430', 'experience', 'work', 'position', 'employment', '\u043f\u043e\u0434\u0440\u044f\u0434\u043e\u043a'],
        skills: ['\u043d\u0430\u0432\u044b\u043a', '\u0443\u043c\u0435\u043d\u0438\u044f', '\u043d\u0430\u0432\u044b\u043a\u0438', '\u0442\u0435\u0445\u043d\u043e\u043b\u043e\u0433\u0438\u0438', '\u0438\u043d\u0441\u0442\u0440\u0443\u043c\u0435\u043d\u0442\u044b', 'skills', 'technologies', 'tools', 'competencies', '\u0441\u0442\u0435\u043a'],
        education: ['\u043e\u0431\u0440\u0430\u0437\u043e\u0432\u0430\u043d\u0438\u0435', '\u0443\u0447\u0451\u0431\u0430', '\u0432\u044b\u0441\u0448\u0435\u0435', '\u0443\u043d\u0438\u0432\u0435\u0440', 'education', 'university', 'degree', '\u0444\u0430\u043a\u0443\u043b\u044c\u0442\u0435\u0442']
    };

    lines.forEach(function(line) {
        var trimmed = line.trim();
        if (!trimmed) return;
        var lower = trimmed.toLowerCase();
        var matched = false;
        Object.keys(sectionKeywords).forEach(function(section) {
            if (!matched) {
                var isHeader = sectionKeywords[section].some(function(kw) {
                    return lower === kw || lower.indexOf(kw) === 0 || (lower.indexOf(kw) !== -1 && trimmed.length < 30);
                });
                if (isHeader) { currentSection = section; matched = true; }
            }
        });
        if (!matched) sections[currentSection].push(trimmed);
    });
    return sections;
}

function extractSkills(text) {
    var techPatterns = [
        'JavaScript', 'TypeScript', 'Python', 'Java', 'C\\+\\+', 'C#', 'PHP', 'Ruby', 'Go', 'Rust', 'Swift', 'Kotlin',
        'React', 'Vue', 'Angular', 'Node', 'Django', 'Flask', 'Spring', 'Express', 'Laravel', 'Rails',
        'SQL', 'NoSQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP',
        'Git', 'CI/CD', 'Jenkins', 'Linux', 'Windows', 'MacOS', 'Figma', 'Photoshop', 'Illustrator',
        'HTML', 'CSS', 'SASS', 'LESS', 'Webpack', 'Vite', 'REST', 'GraphQL', 'API', 'microservices',
        'Agile', 'Scrum', 'Kanban', 'Jira', 'Confluence', 'Notion', 'Excel', 'PowerPoint', 'Word',
        '1C', 'SAP', 'Bitrix', 'WordPress', 'Drupal', 'Joomla', 'Magento', 'Shopify',
        '\u0441\u043e\u0431\u0441\u0442\u0432\u0435\u043d\u043d\u043e', '\u043a\u043e\u043c\u043c\u0443\u043d\u0438\u043a\u0430\u0446\u0438', '\u0430\u043d\u0430\u043b\u0438\u0442\u0438\u043a', '\u043f\u0440\u043e\u0435\u043a\u0442', '\u043c\u0435\u043d\u0435\u0434\u0436\u043c\u0435\u043d\u0442', '\u043f\u0440\u043e\u0434\u0430\u0436\u0438', '\u043c\u0430\u0440\u043a\u0435\u0442\u0438\u043d\u0433', '\u043b\u043e\u0433\u0438\u0441\u0442\u0438\u043a\u0430', '\u0434\u0438\u0437\u0430\u0439\u043d', '\u0431\u0443\u0445\u0433\u0430\u043b\u0442\u0435\u0440\u0438\u044f', '\u043f\u0440\u0430\u0432\u043e', '\u0444\u0438\u043d\u0430\u043d\u0441\u044b', '\u043b\u043e\u0433\u0438\u0441\u0442\u0438\u043a\u0430', '\u0441\u0442\u0440\u0430\u0442\u0435\u0433\u0438\u044f', '\u043e\u043f\u0442\u0438\u043c\u0438\u0437\u0430\u0446\u0438\u044f', '\u0430\u0443\u0442\u0441\u043e\u0440\u0438\u043d\u0433'
    ];
    var found = [];
    techPatterns.forEach(function(p) {
        var re = new RegExp(p, 'gi');
        var m = text.match(re);
        if (m) found = found.concat(m);
    });
    return found.map(function(s) { return s.trim(); }).filter(function(v, i, a) { return a.indexOf(v) === i; });
}

function extractMetrics(text) {
    var patterns = [
        /(\d+[\.\,]?\d*)\s*(%|\u043f\u0440\u043e\u0446\u0435\u043d\u0442|\u043c\u043b\u043d|\u0442\u044b\u0441\.|\u043c\u043b\u043d \u0440\u0443\u0431)/gi,
        /(\d+)\s*(\+|\u0440\u0430\u0437|\u043f\u0440\u043e\u0435\u043a\u0442|\u043a\u043e\u043c\u043f\u0430\u043d\u0438\u0439|\u043a\u043b\u0438\u0435\u043d\u0442|\u0447\u0435\u043b\u043e\u0432\u0435\u043a|\u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a|\u0441\u0442\u0440\u0430\u043d)/gi
    ];
    var metrics = [];
    patterns.forEach(function(p) {
        var m = text.match(p);
        if (m) metrics = metrics.concat(m);
    });
    return metrics;
}

function detectWeakPhrases(text) {
    var weaknesses = [
        { pattern: /(\u0437\u0430\u043d\u0438\u043c\u0430\u043b\u0441\u044f|\u0437\u0430\u043d\u0438\u043c\u0430\u043b\u0430\u0441\u044c)/gi, fix: '\u0443\u0441\u043f\u0435\u0448\u043d\u043e \u0432\u044b\u043f\u043e\u043b\u043d\u044f\u043b' },
        { pattern: /(\u043e\u0441\u0443\u0449\u0435\u0441\u0442\u0432\u043b\u044f\u043b|\u043e\u0441\u0443\u0449\u0435\u0441\u0442\u0432\u043b\u044f\u043b\u0430)/gi, fix: '\u0440\u0435\u0430\u043b\u0438\u0437\u043e\u0432\u0430\u043b' },
        { pattern: /(\u0432\u044b\u043f\u043e\u043b\u043d\u044f\u043b|\u0432\u044b\u043f\u043e\u043b\u043d\u044f\u043b\u0430)/gi, fix: '\u043e\u0431\u0435\u0441\u043f\u0435\u0447\u0438\u043b' },
        { pattern: /(\u043f\u0440\u043e\u0432\u043e\u0434\u0438\u043b|\u043f\u0440\u043e\u0432\u043e\u0434\u0438\u043b\u0430)/gi, fix: '\u043e\u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0438\u043b' },
        { pattern: /(\u0434\u0435\u043b\u0430\u043b|\u0434\u0435\u043b\u0430\u043b\u0430)/gi, fix: '\u0432\u044b\u043f\u043e\u043b\u043d\u044f\u043b' },
        { pattern: /(\u0431\u044b\u043b \u043e\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043d\u043d\u044b\u0439 \u0437\u0430)/gi, fix: '\u0443\u0441\u043f\u0435\u0448\u043d\u043e \u043f\u0440\u0438\u0432\u0435\u043b \u043f\u0440\u043e\u0435\u043a\u0442' },
        { pattern: /(\u0438\u043c\u0435\u043b \u043e\u043f\u044b\u0442)/gi, fix: '\u0440\u0430\u0441\u043f\u043e\u043b\u0430\u0433\u0430\u043b \u0432\u043b\u0430\u0434\u0435\u043d\u0438\u044f\u043c\u0438 \u0432' },
        { pattern: /(\u0443\u0447\u0430\u0441\u0442\u0432\u043e\u0432\u0430\u043b(\u0430|\u0438)?)/gi, fix: '\u043e\u0431\u0435\u0441\u043f\u0435\u0447\u0438\u043b \u0443\u0447\u0430\u0441\u0442\u0438\u0435 \u0432' }
    ];
    return weaknesses.filter(function(w) { return w.pattern.test(text); });
}

function extractJobKeywords(jobTitle) {
    if (!jobTitle) return [];
    var parts = jobTitle.toLowerCase().split(/[\s,\/]+/).filter(function(p) { return p.length > 2; });
    var relatedSkills = {
        '\u043f\u0440\u043e\u0434\u0430\u0436\u0438': ['\u043f\u0440\u043e\u0434\u0430\u0436\u0438', 'CRM', '\u0432\u043e\u0440\u043e\u043d\u043a\u0438', '\u043b\u0438\u0434\u044b', '\u043a\u043e\u043d\u0432\u0435\u0440\u0441\u0438\u044f', '\u0434\u0435\u043b\u043e', '\u0442\u0435\u043b\u0435\u0444\u043e\u043d\u043d\u044b\u0435 \u043f\u0435\u0440\u0435\u0433\u043e\u0432\u043e\u0440\u044b', '1C', '\u043f\u043b\u0430\u043d\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435 \u043f\u0440\u043e\u0434\u0430\u0436', '\u043e\u0431\u0440\u0430\u0431\u043e\u0442\u043a\u0430 \u0437\u0430\u044f\u0432\u043e\u043a', '\u0430\u043d\u0430\u043b\u0438\u0437 \u0440\u044b\u043d\u043a\u0430', '\u0432\u044b\u0441\u0442\u0440\u043e\u0439\u043a\u0430 \u043a\u043b\u0438\u0435\u043d\u0442\u043e\u0432', '\u0443\u0434\u0435\u0440\u0436\u0430\u043d\u0438\u0435 \u043b\u043e\u044f\u043b\u044c\u043d\u043e\u0441\u0442\u0438'],
        '\u043c\u0435\u043d\u0435\u0434\u0436\u0435\u0440': ['\u0443\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u0435 \u043a\u043e\u043c\u0430\u043d\u0434\u043e\u0439', '\u0442\u0430\u0439\u043c-\u043c\u0435\u043d\u0435\u0434\u0436\u043c\u0435\u043d\u0442', 'KPI', '\u0441\u0442\u0440\u0430\u0442\u0435\u0433\u0438\u044f', '\u043f\u043b\u0430\u043d\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435', '\u0434\u0435\u043b\u0435\u0433\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435', '\u043e\u0442\u0447\u0451\u0442\u043d\u043e\u0441\u0442\u044c', 'OKR', '\u0440\u0435\u0442\u0440\u043e\u0441\u043f\u0435\u043a\u0442\u0438\u0432\u043d\u043e\u0441\u0442\u044c', '\u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u0438', '\u0440\u0435\u0441\u0443\u0440\u0441\u043d\u044b\u0439 \u043f\u043b\u0430\u043d\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435'],
        '\u0440\u0430\u0437\u0440\u0430\u0431\u043e\u0442\u0447\u0438\u043a': ['\u0440\u0430\u0437\u0440\u0430\u0431\u043e\u0442\u043a\u0430', 'API', 'Git', '\u0442\u0435\u0441\u0442\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435', '\u0430\u0440\u0445\u0438\u0442\u0435\u043a\u0442\u0443\u0440\u0430', 'CI/CD', '\u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u0430\u0446\u0438\u044f', '\u043e\u043f\u0442\u0438\u043c\u0438\u0437\u0430\u0446\u0438\u044f', '\u0440\u0435\u0444\u0430\u043a\u0442\u043e\u0440\u0438\u043d\u0433', 'code review', 'Agile', 'Scrum', '\u0440\u0435\u0430\u043b\u0438\u0437\u0430\u0446\u0438\u044f \u043f\u0440\u043e\u0435\u043a\u0442\u043e\u0432'],
        '\u043c\u0430\u0440\u043a\u0435\u0442\u043e\u043b\u043e\u0433': ['\u043c\u0430\u0440\u043a\u0435\u0442\u0438\u043d\u0433', 'SEO', 'SMM', 'PPC', '\u043a\u043e\u043d\u0442\u0435\u043d\u0442', '\u0430\u043d\u0430\u043b\u0438\u0442\u0438\u043a\u0430', '\u0432\u043e\u0440\u043e\u043d\u043a\u0438', '\u043a\u043e\u043d\u0432\u0435\u0440\u0441\u0438\u044f', '\u0442\u0430\u0440\u0433\u0435\u0442\u0438\u043d\u0433', 'Yandex.Metrica', 'Google Analytics', 'CRM', '\u0432\u043e\u0440\u043e\u043d\u043a\u0438', '\u043f\u0440\u043e\u0434\u0432\u0438\u0436\u0435\u043d\u0438\u0435'],
        '\u0431\u0443\u0445\u0433\u0430\u043b\u0442\u0435\u0440': ['\u0431\u0443\u0445\u0433\u0430\u043b\u0442\u0435\u0440\u0438\u044f', '1C', '\u043d\u0430\u043b\u043e\u0433\u0438', '\u043e\u0442\u0447\u0451\u0442', '\u0430\u0443\u0434\u0438\u0442', '\u043f\u0435\u0440\u0432\u0438\u0447\u043d\u044b\u0435 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u044b', '\u0437\u0430\u043a\u043e\u043d\u043e\u043c\u0438\u0447\u0435\u0441\u043a\u0438\u0439 \u0430\u043d\u0430\u043b\u0438\u0437', 'Excel', '\u0444\u0438\u043d\u0430\u043d\u0441\u043e\u0432\u044b\u0439 \u043c\u043e\u0434\u0435\u043b\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435', '\u0441\u043e\u0432\u0435\u0440\u0448\u0435\u043d\u0441\u0442\u0432\u043e\u0432\u0430\u043d\u0438\u0435'],
        '\u0442\u0435\u0445\u043f\u043e\u0434\u0434\u0435\u0440\u0436\u0438\u044f': ['\u0442\u0435\u0445\u043f\u043e\u0434\u0434\u0435\u0440\u0436\u0438\u044f', 'Linux', 'Docker', 'Windows Server', 'VMware', 'сети', '\u0431\u0435\u0437\u043e\u043f\u0430\u0441\u043d\u043e\u0441\u0442\u044c', '\u043c\u043e\u043d\u0438\u0442\u043e\u0440\u0438\u043d\u0433', '\u0430\u0440\u0445\u0438\u0442\u0435\u043a\u0442\u0443\u0440\u0430', 'ITIL', 'ticketing']
    };
    var keywords = parts.slice();
    Object.keys(relatedSkills).forEach(function(role) {
        if (jobTitle.toLowerCase().indexOf(role) !== -1) {
            keywords = keywords.concat(relatedSkills[role]);
        }
    });
    return keywords.filter(function(v, i, a) { return a.indexOf(v) === i; });
}

function analyzeWeaknesses(resumeText, jobTitle) {
    var issues = [];
    var lower = resumeText.toLowerCase();
    var lines = resumeText.split('\n').filter(function(l) { return l.trim().length > 0; });

    var weakVerbs = detectWeakPhrases(resumeText);
    if (weakVerbs.length > 0) {
        issues.push({ type: 'passive_verbs', count: weakVerbs.length, detail: weakVerbs.map(function(v) { return v.pattern.source; }).join(', ') });
    }

    var hasSummary = false;
    var sectionHeaders = ['\u043e \u043c\u043d\u0435', '\u0446\u0435\u043b\u044c', '\u043f\u0440\u043e \u0441\u0435\u0431\u044f', 'summary', 'about', 'profile', '\u043e\u0431\u0437\u043e\u0440'];
    sectionHeaders.forEach(function(h) { if (lower.indexOf(h) !== -1) hasSummary = true; });
    if (!hasSummary && lines.length > 5) {
        issues.push({ type: 'missing_summary', detail: '\u041d\u0435\u0442 \u0432\u0432\u0435\u0434\u0435\u043d\u0438\u044f/\u0441\u0430\u043c\u043c\u0430\u0440\u0438' });
    }

    var bulletCount = (resumeText.match(/[\u2022\-\*]\s/g) || []).length;
    if (bulletCount < 3 && lines.length > 8) {
        issues.push({ type: 'no_bullets', detail: '\u041c\u0430\u043b\u043e \u0441\u0442\u0440\u043e\u043a \u0441\u043e \u0441\u043f\u0438\u0441\u043a\u0430\u043c\u0438' });
    }

    var metrics = extractMetrics(resumeText);
    if (metrics.length === 0 && lines.length > 5) {
        issues.push({ type: 'no_metrics', detail: '\u041d\u0435\u0442 \u0446\u0438\u0444\u0440\u043e\u0432\u044b\u0445 \u043c\u0435\u0442\u0440\u0438\u043a' });
    }

    var skills = extractSkills(resumeText);
    if (skills.length < 3 && jobTitle) {
        issues.push({ type: 'few_skills', detail: '\u041c\u0430\u043b\u043e \u043d\u0430\u0432\u044b\u043a\u043e\u0432 \u0434\u043b\u044f \u043f\u043e\u0437\u0438\u0446\u0438\u0438 ' + jobTitle });
    }

    var hasEmail = /[\w.-]+@[\w.-]+\.\w+/.test(resumeText);
    var hasPhone = /[\+]?[\d\-\(\)\s]{7,}/.test(resumeText);
    if (!hasEmail || !hasPhone) {
        issues.push({ type: 'missing_contacts', detail: '\u041d\u0435 \u0432\u0441\u0435 \u043a\u043e\u043d\u0442\u0430\u043a\u0442\u044b' });
    }

    return issues;
}

function rewriteLine(line, jobKeywords, passiveFixes) {
    var newLine = line;
    passiveFixes.forEach(function(pf) {
        var re = new RegExp(pf.pattern.source, 'gi');
        if (re.test(newLine)) {
            newLine = newLine.replace(re, pf.fix);
        }
    });
    return newLine;
}

function generateJobSummary(jobTitle, skills, experience) {
    var skillList = skills.length > 0 ? skills.slice(0, 5).join(', ') : '\u043f\u0440\u043e\u0444\u0435\u0441\u0441\u0438\u043e\u043d\u0430\u043b\u044c\u043d\u044b\u0435 \u043d\u0430\u0432\u044b\u043a\u0438';
    var years = experience.length > 0 ? '\u0441 \u043e\u043f\u044b\u0442\u043e\u043c \u0440\u0430\u0431\u043e\u0442\u044b' : '';
    return '\u0426\u0435\u043b\u0435\u0432\u043e\u0435 \u0440\u0435\u0437\u044e\u043c\u0435: \u041f\u0440\u043e\u0444\u0435\u0441\u0441\u0438\u043e\u043d\u0430\u043b \u043d\u0430 \u043f\u043e\u0437\u0438\u0446\u0438\u044e \u00ab' + (jobTitle || '\u0441\u043f\u0435\u0446\u0438\u0430\u043b\u0438\u0441\u0442') + '\u00bb. \u0412\u043b\u0430\u0434\u0435\u044e \u043a\u043e\u043c\u043f\u0435\u0442\u0435\u043d\u0446\u0438\u044f\u043c\u0438 \u0432 \u043e\u0431\u043b\u0430\u0441\u0442\u0438: ' + skillList + '. ' + (years ? '\u0418\u043c\u0435\u044e ' + years + '.' : '') + ' \u0421\u0442\u0440\u0435\u043c\u043b\u044e\u0441\u044c \u043a \u0434\u043e\u0441\u0442\u0438\u0436\u0435\u043d\u0438\u044e \u0438\u0437\u043c\u0435\u0440\u044f\u0435\u043c\u044b\u0445 \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442\u043e\u0432 \u0438 \u043f\u0440\u043e\u0444\u0435\u0441\u0441\u0438\u043e\u043d\u0430\u043b\u044c\u043d\u043e\u0433\u043e \u0440\u043e\u0441\u0442\u0430.';
}

function generateEnhancedResume(resumeText, jobTitle) {
    var sections = parseResumeSections(resumeText);
    var jobKeywords = extractJobKeywords(jobTitle);
    var skills = extractSkills(resumeText);
    var issues = analyzeWeaknesses(resumeText, jobTitle);
    var allChanges = [];
    var missingSections = [];
    var passiveFixes = detectWeakPhrases(resumeText);

    var enhanced = [];
    var jobUpper = jobTitle ? jobTitle.toUpperCase() : '\u041f\u0420\u041e\u0424\u0415\u0421\u0421\u0418\u041e\u041d\u0410\u041b\u042c\u041d\u041e\u0415 \u0420\u0415\u0417\u042e\u041c\u0415';

    enhanced.push(jobUpper);
    enhanced.push('');

    if (!sections.summary.length && !sections.header.length) {
        enhanced.push('\u0426\u0415\u041b\u0415\u0412\u041e\u0415 \u0420\u0415\u0417\u042e\u041c\u0415 \u2014 ' + (jobTitle || '\u0421\u043f\u0435\u0446\u0438\u0430\u043b\u0438\u0441\u0442'));
        enhanced.push('');
    }

    if (sections.header.length) {
        sections.header.forEach(function(line) {
            enhanced.push(line);
        });
        enhanced.push('');
    }

    if (sections.summary.length) {
        enhanced.push('\u0426\u0415\u041b\u0415\u0412\u041e\u0415 \u0420\u0415\u0417\u042e\u041c\u0415');
        var summaryText = sections.summary.join(' ');
        if (jobTitle && summaryText.toLowerCase().indexOf(jobTitle.toLowerCase()) === -1) {
            summaryText = '\u041f\u0440\u043e\u0444\u0435\u0441\u0441\u0438\u043e\u043d\u0430\u043b \u0432 \u043e\u0431\u043b\u0430\u0441\u0442\u0438 ' + (jobTitle || '\u043f\u0440\u043e\u0444\u0438\u043b\u044f') + '. ' + summaryText;
            allChanges.push({ type: 'modify', text: '\u0412 \u0432\u0432\u0435\u0434\u0435\u043d\u0438\u0438 \u0434\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u043e \u0443\u043f\u043e\u043c\u0438\u043d\u0430\u043d\u0438\u0435 \u043e \u0446\u0435\u043b\u0435\u0432\u043e\u0439 \u043f\u043e\u0437\u0438\u0446\u0438\u0438: ' + (jobTitle || '\u0441\u043f\u0435\u0446\u0438\u0430\u043b\u0438\u0441\u0442') });
        }
        enhanced.push(summaryText);
        enhanced.push('');
    } else {
        enhanced.push('\u0426\u0415\u041b\u0415\u0412\u041e\u0415 \u0420\u0415\u0417\u042e\u041c\u0415');
        enhanced.push(generateJobSummary(jobTitle, skills, sections.experience));
        enhanced.push('');
        missingSections.push('\u0414\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u043e \u0432\u0432\u0435\u0434\u0435\u043d\u0438\u0435/\u0441\u0430\u043c\u043c\u0430\u0440\u0438');
        allChanges.push({ type: 'add', text: '\u0421\u043e\u0437\u0434\u0430\u043d\u043e \u0432\u0432\u0435\u0434\u0435\u043d\u0438\u0435 \u0441 \u0430\u043a\u0446\u0435\u043d\u0442\u043e\u043c \u043d\u0430 \u0446\u0435\u043b\u0435\u0432\u0443\u044e \u043f\u043e\u0437\u0438\u0446\u0438\u044e: ' + (jobTitle || '\u0441\u043f\u0435\u0446\u0438\u0430\u043b\u0438\u0441\u0442') });
    }

    if (sections.experience.length) {
        enhanced.push('\u041e\u041f\u042b\u0422 \u0420\u0410\u0411\u041e\u0422\u042b');
        sections.experience.forEach(function(line) {
            var enhancedLine = rewriteLine(line, jobKeywords, passiveFixes);
            var lower = enhancedLine.toLowerCase();
            if (/[1-9]\d*\s*(%|\u043f\u0440\u043e\u0446\u0435\u043d\u0442|\u043c\u043b\u043d)/.test(enhancedLine)) {
                allChanges.push({ type: 'modify', text: '\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0430 \u043c\u0435\u0442\u0440\u0438\u043a\u0430: "' + enhancedLine.substring(0, 60) + '..."' });
            }
            if (enhancedLine !== line) {
                allChanges.push({ type: 'modify', text: '\u041f\u0435\u0440\u0435\u0444\u043e\u0440\u043c\u0443\u043b\u0438\u0440\u043e\u0432\u0430\u043d\u043e: "' + line.substring(0, 50) + '" \u2192 "' + enhancedLine.substring(0, 50) + '"' });
            }
            if (jobKeywords.length > 0) {
                var matched = jobKeywords.filter(function(kw) { return lower.indexOf(kw.toLowerCase()) !== -1; });
                if (matched.length > 0) {
                    allChanges.push({ type: 'add', text: '\u0414\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u044b \u043a\u043b\u044e\u0447\u0435\u0432\u044b\u0435 \u0441\u043b\u043e\u0432\u0430: ' + matched.join(', ') });
                }
            }
            enhanced.push(enhancedLine);
        });
        enhanced.push('');
    }

    if (skills.length) {
        enhanced.push('\u041a\u0412\u0410\u041b\u0418\u0424\u0418\u041a\u0410\u0426\u0418\u0418');
        var prioritized = skills.slice();
        if (jobKeywords.length > 0) {
            prioritized.sort(function(a, b) {
                var aMatch = jobKeywords.some(function(kw) { return a.toLowerCase().indexOf(kw.toLowerCase()) !== -1; });
                var bMatch = jobKeywords.some(function(kw) { return b.toLowerCase().indexOf(kw.toLowerCase()) !== -1; });
                if (aMatch && !bMatch) return -1;
                if (!aMatch && bMatch) return 1;
                return 0;
            });
        }
        enhanced.push('\u2022 ' + prioritized.join(' \u2022 '));
        enhanced.push('');
        allChanges.push({ type: 'modify', text: '\u041d\u0430\u0432\u044b\u043a\u0438 \u043f\u0435\u0440\u0435\u0443\u043f\u043e\u0440\u044f\u0434\u043e\u0447\u0435\u043d\u044b \u043f\u043e \u0440\u0435\u043b\u0435\u0432\u0430\u043d\u0442\u043d\u043e\u0441\u0442\u0438 \u043a \u043f\u043e\u0437\u0438\u0446\u0438\u0438' });
    }

    if (sections.education.length) {
        enhanced.push('\u041e\u0411\u0420\u0410\u0417\u041e\u0412\u0410\u041d\u0418\u0415');
        sections.education.forEach(function(line) { enhanced.push(line); });
        enhanced.push('');
    }

    if (sections.skills.length && !skills.length) {
        enhanced.push('\u041d\u0410\u0412\u042b\u041a\u0418');
        sections.skills.forEach(function(line) {
            enhanced.push('\u2022 ' + line);
        });
        enhanced.push('');
    }

    if (jobKeywords.length > 0 && skills.length < 5) {
        var missing = jobKeywords.filter(function(kw) {
            return skills.some(function(s) { return s.toLowerCase().indexOf(kw.toLowerCase()) !== -1; }) === false;
        }).slice(0, 5);
        if (missing.length > 0) {
            allChanges.push({ type: 'add', text: '\u0420\u0435\u043a\u043e\u043c\u0435\u043d\u0434\u0443\u0435\u0442\u0441\u044f \u0434\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u043d\u0430\u0432\u044b\u043a\u0438 \u0434\u043b\u044f \u043f\u043e\u0437\u0438\u0446\u0438\u0438: ' + missing.join(', ') });
        }
    }

    passiveFixes.forEach(function(pf) {
        allChanges.push({ type: 'modify', text: '\u0417\u0430\u043c\u0435\u043d\u0435\u043d\u044b \u043f\u0430\u0441\u0441\u0438\u0432\u043d\u044b\u0435 \u0433\u043b\u0430\u0433\u043e\u043b\u044b: "' + pf.pattern.source + '" \u2192 "' + pf.fix + '"' });
    });

    if (missingSections.length) {
        missingSections.forEach(function(ms) {
            allChanges.push({ type: 'add', text: '\u0414\u043e\u0431\u0430\u0432\u043b\u0435\u043d \u043d\u0435\u0434\u043e\u0441\u0442\u0430\u044e\u0449\u0438\u0439 \u0440\u0430\u0437\u0434\u0435\u043b: ' + ms });
        });
    }

    allChanges.push({ type: 'modify', text: '\u0421\u0442\u0440\u0443\u043a\u0442\u0443\u0440\u0430 \u0440\u0435\u0437\u044e\u043c\u0435 \u043e\u043f\u0442\u0438\u043c\u0438\u0437\u0438\u0440\u043e\u0432\u0430\u043d\u0430 \u043f\u043e\u0434 \u043f\u043e\u0437\u0438\u0446\u0438\u044e: ' + (jobTitle || '\u0441\u043f\u0435\u0446\u0438\u0430\u043b\u0438\u0441\u0442') });

    return { resume: enhanced.join('\n'), changes: allChanges, missingSections: missingSections };
}

// ===================== DEMO MODE =====================
function generateDemoResult(resumeText, jobTitle) {
    return new Promise(function(resolve) {
        var delay = 1500 + Math.random() * 1500;
        var result = generateEnhancedResume(resumeText, jobTitle);
        var score = calculateATSScore(result.resume, selectedPlatform);
        setTimeout(function() {
            resolve({ resume: result.resume, changes: result.changes, score: score });
        }, delay);
    });
}

// ===================== AI REQUEST =====================
async function callAI(resume, jobTitle) {
    var systemPrompt = buildSystemPrompt();
    var userMessage = 'Resume:\n\n' + resume + '\n\nTarget position: ' + (jobTitle || 'Not specified') + '\n\nAnalyze and rewrite this resume specifically for the target position.';

    var url = '';
    var model = '';
    var extraHeaders = {};

    if (apiProvider === 'atria') {
        var targetUrl = 'https://api.atria-asi.ai/v1/chat/completions';
        url = PROXY_URL ? PROXY_URL + encodeURIComponent(targetUrl) : targetUrl;
        model = apiModel || 'Atria-Dawn-Preview';
    } else if (apiProvider === 'openai') {
        url = 'https://api.openai.com/v1/chat/completions';
        model = apiModel || 'gpt-4o';
    } else if (apiProvider === 'openrouter') {
        url = 'https://openrouter.ai/api/v1/chat/completions';
        model = apiModel || 'openai/gpt-4o';
        extraHeaders['HTTP-Referer'] = window.location.href;
    }

    var headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey };
    Object.keys(extraHeaders).forEach(function(k) { headers[k] = extraHeaders[k]; });

    var response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
            model: model,
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
            temperature: 0.7,
            max_tokens: 4000
        })
    });
    if (!response.ok) throw new Error('API Error: ' + response.status);
    var data = await response.json();
    return parseAIResponse(data.choices[0].message.content);
}

function parseAIResponse(text) {
    var resumeMatch = text.match(/===IMPROVED_RESUME===\s*([\s\S]*?)(?====CHANGES===|$)/i);
    var changesMatch = text.match(/===CHANGES===\s*([\s\S]*?)$/i);
    var resume = resumeMatch ? resumeMatch[1].trim() : text.trim();
    var changes = [];
    if (changesMatch) {
        var lines = changesMatch[1].trim().split('\n');
        lines.forEach(function(line) {
            line = line.trim();
            if (!line) return;
            if (line.charAt(0) === '+') changes.push({ type: 'add', text: line.substring(1).trim() });
            else if (line.charAt(0) === '-') changes.push({ type: 'remove', text: line.substring(1).trim() });
            else if (line.charAt(0) === '~') changes.push({ type: 'modify', text: line.substring(1).trim() });
            else if (line.length > 5) changes.push({ type: 'modify', text: line });
        });
    }
    return { resume: resume, changes: changes, score: calculateATSScore(resume, selectedPlatform) };
}

// ===================== MAIN ENHANCE =====================
async function enhanceResume() {
    var resume = document.getElementById('resumeInput').value.trim();
    var jobTitle = document.getElementById('jobTitle').value.trim();
    if (!resume) { showToast('\u0412\u0441\u0442\u0430\u0432\u044c\u0442\u0435 \u0442\u0435\u043a\u0441\u0442 \u0440\u0435\u0437\u044e\u043c\u0435', 'error'); return; }
    if (resume.length < 50) { showToast('\u0420\u0435\u0437\u044e\u043c\u0435 \u0441\u043b\u0438\u0448\u043a\u043e\u043c \u043a\u043e\u0440\u043e\u0442\u043a\u043e\u0435 (\u043c\u0438\u043d. 50 \u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432)', 'error'); return; }
    if (isProcessing) return;
    isProcessing = true;
    var btn = document.getElementById('enhanceBtn');
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin-slow"></i> \u0410\u043d\u0430\u043b\u0438\u0437\u0438\u0440\u0443\u0435\u043c...';
    lucide.createIcons({ nodes: [btn] });
    document.getElementById('tabPlaceholder').classList.add('hidden');
    document.getElementById('skeletonLoader').classList.remove('hidden');
    document.getElementById('tabResumeContent').classList.add('hidden');
    document.getElementById('tabChangesContent').classList.add('hidden');
    document.getElementById('actionButtons').classList.add('hidden');
    try {
        var result;
        if (apiKey) {
            try {
                result = await callAI(resume, jobTitle);
            } catch (apiErr) {
                console.warn('API call failed, falling back to demo:', apiErr);
                showToast('API \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d (\u0441\u0435\u0440\u0432\u0435\u0440 CORS). \u0418\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u0435\u0442\u0441\u044f \u043b\u043e\u043a\u0430\u043b\u044c\u043d\u044b\u0439 \u0430\u043d\u0430\u043b\u0438\u0437.', 'info');
                result = await generateDemoResult(resume, jobTitle);
            }
        } else {
            showToast('\u0414\u0435\u043c\u043e-\u0440\u0435\u0436\u0438\u043c: \u0430\u043d\u0430\u043b\u0438\u0437 \u0432\u0430\u0448\u0435\u0433\u043e \u0440\u0435\u0437\u044e\u043c\u0435', 'info');
            result = await generateDemoResult(resume, jobTitle);
        }
        lastResult = result.resume;
        lastChanges = result.changes;
        setATSScore(result.score);
        document.getElementById('tabResumeContent').textContent = result.resume;
        var changesHtml = '';
        result.changes.forEach(function(c) {
            var cls = c.type === 'add' ? 'change-add' : c.type === 'remove' ? 'change-remove' : 'change-modify';
            var icon = c.type === 'add' ? 'plus-circle' : c.type === 'remove' ? 'minus-circle' : 'pencil';
            var color = c.type === 'add' ? 'text-neon-emerald' : c.type === 'remove' ? 'text-red-400' : 'text-yellow-400';
            changesHtml += '<div class="change-item ' + cls + '"><div class="flex items-start gap-2"><i data-lucide="' + icon + '" class="w-4 h-4 mt-0.5 flex-shrink-0 ' + color + '"></i><div><p class="text-sm text-gray-300">' + c.text + '</p></div></div></div>';
        });
        document.getElementById('tabChangesContent').innerHTML = changesHtml;
        lucide.createIcons();
        switchTab('resume');
        document.getElementById('skeletonLoader').classList.add('hidden');
        document.getElementById('tabResumeContent').classList.remove('hidden');
        document.getElementById('actionButtons').classList.remove('hidden');
        showToast('\u0420\u0435\u0437\u044e\u043c\u0435 \u0443\u0441\u043f\u0435\u0448\u043d\u043e \u0443\u043b\u0443\u0447\u0448\u0435\u043d\u043e!', 'success');
    } catch (err) {
        console.error(err);
        document.getElementById('skeletonLoader').classList.add('hidden');
        document.getElementById('tabPlaceholder').classList.remove('hidden');
        showToast('\u041e\u0448\u0438\u0431\u043a\u0430: ' + err.message, 'error');
    } finally {
        isProcessing = false;
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="wand-2" class="w-5 h-5"></i> \u0423\u043b\u0443\u0447\u0448\u0438\u0442\u044c \u0440\u0435\u0437\u044e\u043c\u0435 \u0447\u0435\u0440\u0435\u0437 \u0418\u0418';
        lucide.createIcons({ nodes: [btn] });
    }
}

// ===================== ACTIONS =====================
function copyResult() {
    if (!lastResult) return;
    navigator.clipboard.writeText(lastResult).then(function() {
        showToast('\u0421\u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u043d\u043e \u0432 \u0431\u0443\u0444\u0435\u0440 \u043e\u0431\u043c\u0435\u043d\u0430!', 'success');
    }).catch(function() {
        var ta = document.createElement('textarea');
        ta.value = lastResult;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('\u0421\u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u043d\u043e \u0432 \u0431\u0443\u0444\u0435\u0440 \u043e\u0431\u043c\u0435\u043d\u0430!', 'success');
    });
}

function downloadResult(format) {
    if (!lastResult) return;
    var mime = format === 'md' ? 'text/markdown' : 'text/plain';
    var blob = new Blob([lastResult], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'resume_enhanced.' + format;
    a.click();
    URL.revokeObjectURL(url);
    showToast('\u0424\u0430\u0439\u043b \u0441\u043a\u0430\u0447\u0430\u043d!', 'success');
}
