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
var COST_PER_REQUEST = 50;

function getUsers() {
    var users = JSON.parse(localStorage.getItem('resume_users') || '[]');
    if (!users.some(function(u) { return u.email === ADMIN_EMAIL; })) {
        users.push({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: 'admin', confirmed: true, balance: 999999, totalSpent: 0 });
        localStorage.setItem('resume_users', JSON.stringify(users));
    }
    return users;
}

function saveUsers(users) { localStorage.setItem('resume_users', JSON.stringify(users)); }

function getUserBalance(email) {
    var users = getUsers();
    var user = users.find(function(u) { return u.email === email; });
    return user ? (user.balance || 0) : 0;
}

function updateUserBalance(email, amount) {
    var users = getUsers();
    var user = users.find(function(u) { return u.email === email; });
    if (user) {
        user.balance = (user.balance || 0) + amount;
        if (amount < 0) user.totalSpent = (user.totalSpent || 0) + Math.abs(amount);
        saveUsers(users);
    }
    return user ? user.balance : 0;
}

function isAdmin() { return currentUser && currentUser.role === 'admin'; }

// ===================== INIT =====================
document.addEventListener('DOMContentLoaded', function() {
    lucide.createIcons();
    updateAuthUI();
});

// ===================== UTILITY =====================
function updateCharCount() {
    var len = document.getElementById('resumeInput').value.length;
    document.getElementById('charCount').textContent = len + ' \u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432';
    document.getElementById('charCount').className = len < 50 ? 'text-xs text-yellow-500' : 'text-xs text-gray-500';
}

function getSelectedPromptMode() {
    var checked = document.querySelector('input[name="promptMode"]:checked');
    return checked ? checked.value : 'standardize';
}

function handleFileUpload(event) {
    var file = event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        var text = e.target.result;
        document.getElementById('resumeInput').value = text;
        updateCharCount();
        showToast('\u0424\u0430\u0439\u043b \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043d: ' + file.name, 'success');
    };
    reader.onerror = function() {
        showToast('\u041e\u0448\u0438\u0431\u043a\u0430 \u0447\u0442\u0435\u043d\u0438\u044f \u0444\u0430\u0439\u043b\u0430', 'error');
    };
    if (file.name.endsWith('.txt') || file.name.endsWith('.rtf')) {
        reader.readAsText(file);
    } else {
        reader.readAsText(file);
    }
    event.target.value = '';
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
    var emailEl = document.getElementById('profileEmail');
    var roleEl = document.getElementById('profileRole');
    var avatarEl = document.getElementById('profileAvatar');
    if (emailEl) emailEl.textContent = currentUser.email;
    var balance = getUserBalance(currentUser.email);
    var roleText = isAdmin() ? '\u0410\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u043e\u0440' : '\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c';
    if (roleEl) roleEl.textContent = roleText + ' | \u0411\u0430\u043b\u0430\u043d\u0441: ' + balance + ' \u20BD';
    if (avatarEl) avatarEl.textContent = currentUser.email.charAt(0).toUpperCase();
}

// ===================== PAYMENT =====================
var selectedTopUpAmount = 50;
var selectedPayMethod = 'card';

function openPaymentModal() {
    if (!currentUser) { openAuthModal('login'); return; }
    document.getElementById('paymentModal').classList.remove('hidden');
    document.getElementById('paymentTopUpForm').classList.remove('hidden');
    document.getElementById('paymentProcessingForm').classList.add('hidden');
    document.getElementById('paymentSuccessForm').classList.add('hidden');
    document.getElementById('paymentError').classList.add('hidden');
    document.getElementById('customTopUp').value = '';
    selectedTopUpAmount = 50;
    document.querySelectorAll('.topup-btn').forEach(function(b) {
        b.classList.toggle('border-neon-emerald/50', b.dataset.amount === '50');
    });
}

function closePaymentModal() { document.getElementById('paymentModal').classList.add('hidden'); }

function selectTopUp(amount) {
    selectedTopUpAmount = amount;
    document.getElementById('customTopUp').value = '';
    document.querySelectorAll('.topup-btn').forEach(function(b) {
        b.classList.toggle('border-neon-emerald/50', parseInt(b.dataset.amount) === amount);
    });
}

function selectPayMethod(el) {
    document.querySelectorAll('.pay-method-btn').forEach(function(b) {
        b.classList.remove('border-neon-purple/30');
        b.classList.add('border-transparent');
    });
    el.classList.remove('border-transparent');
    el.classList.add('border-neon-purple/30');
    selectedPayMethod = el.dataset.method;
}

function processPayment() {
    var customVal = document.getElementById('customTopUp').value;
    var amount = customVal ? parseInt(customVal) : selectedTopUpAmount;
    var errEl = document.getElementById('paymentError');
    errEl.classList.add('hidden');
    if (!amount || amount < 50) {
        errEl.textContent = '\u041c\u0438\u043d\u0438\u043c\u0430\u043b\u044c\u043d\u0430\u044f \u0441\u0443\u043c\u043c\u0430 \u043e\u043f\u043b\u0430\u0442\u044b \u2014 50 \u20BD';
        errEl.classList.remove('hidden');
        return;
    }
    document.getElementById('paymentTopUpForm').classList.add('hidden');
    document.getElementById('paymentProcessingForm').classList.remove('hidden');
    setTimeout(function() {
        var newBalance = updateUserBalance(currentUser.email, amount);
        document.getElementById('paymentProcessingForm').classList.add('hidden');
        document.getElementById('paymentSuccessForm').classList.remove('hidden');
        document.getElementById('paidAmount').textContent = amount;
        document.getElementById('newBalance').textContent = newBalance + ' \u20BD';
        updateAuthUI();
    }, 2000);
}

// ===================== ADMIN PANEL =====================
function openAdminPanel() {
    if (!isAdmin()) return;
    document.getElementById('adminModal').classList.remove('hidden');
    var savedKey = localStorage.getItem('resume_ai_key') || '';
    document.getElementById('adminApiKey').value = savedKey;
    loadUsersList();
    loadStats();
}

function closeAdminPanel() { document.getElementById('adminModal').classList.add('hidden'); }

function toggleAdminKeyVisibility() {
    var input = document.getElementById('adminApiKey');
    input.type = input.type === 'password' ? 'text' : 'password';
}

function saveAdminApiKey() {
    var key = document.getElementById('adminApiKey').value.trim();
    if (key) {
        apiKey = key;
        localStorage.setItem('resume_ai_key', key);
        var status = document.getElementById('adminKeyStatus');
        status.className = 'text-xs text-center py-2 rounded-lg bg-neon-emerald/10 text-neon-emerald';
        status.textContent = '\u041a\u043b\u044e\u0447 \u0441\u043e\u0445\u0440\u0430\u043d\u0451\u043d!';
        status.classList.remove('hidden');
        setTimeout(function() { status.classList.add('hidden'); }, 2000);
    }
}

function testAdminApiKey() {
    var key = document.getElementById('adminApiKey').value.trim();
    if (!key) { showToast('\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043a\u043b\u044e\u0447', 'error'); return; }
    var status = document.getElementById('adminKeyStatus');
    status.className = 'text-xs text-center py-2 rounded-lg bg-neon-cyan/10 text-neon-cyan';
    status.textContent = '\u041f\u0440\u043e\u0432\u0435\u0440\u043a\u0430...';
    status.classList.remove('hidden');
    fetch('https://api.atria-asi.ai/v1/models', { headers: { 'Authorization': 'Bearer ' + key } })
        .then(function(r) { return r.ok ? 'OK' : 'Error ' + r.status; })
        .catch(function() { return 'CORS \u043e\u0448\u0438\u0431\u043a\u0430 (\u043a\u043b\u044e\u0447 \u043c\u043e\u0436\u0435\u0442 \u0440\u0430\u0431\u043e\u0442\u0430\u0442\u044c)'; })
        .then(function(msg) {
            status.className = 'text-xs text-center py-2 rounded-lg bg-neon-emerald/10 text-neon-emerald';
            status.textContent = '\u0420\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442: ' + msg;
        });
}

function loadUsersList() {
    var users = getUsers();
    var list = document.getElementById('usersList');
    var count = document.getElementById('userCount');
    count.textContent = users.length + ' \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0435\u0439';
    list.innerHTML = '';
    users.forEach(function(u) {
        var div = document.createElement('div');
        div.className = 'flex items-center justify-between glass-input rounded-lg p-2.5';
        var roleLabel = u.role === 'admin' ? '<span class="text-yellow-400 text-[10px] font-medium">\u0410\u0414\u041c\u0418\u041d</span>' : '<span class="text-gray-600 text-[10px]">\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c</span>';
        var balance = u.balance || 0;
        div.innerHTML = '<div class="flex-1 min-w-0"><p class="text-xs text-gray-300 truncate">' + u.email + '</p><div class="flex items-center gap-2 mt-0.5">' + roleLabel + ' <span class="text-[10px] text-neon-emerald">' + balance + ' \u20BD</span></div></div>';
        list.appendChild(div);
    });
}

function loadStats() {
    var users = getUsers();
    document.getElementById('statTotalUsers').textContent = users.length;
    var totalRevenue = users.reduce(function(sum, u) { return sum + (u.totalSpent || 0); }, 0);
    document.getElementById('statTotalRevenue').textContent = totalRevenue + ' \u20BD';
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
    var balanceEl = document.getElementById('balanceDisplay');
    var adminBtn = document.getElementById('adminPanelBtn');
    var costEl = document.getElementById('enhanceBtnCost');
    if (currentUser) {
        if (loggedOut) loggedOut.classList.add('hidden');
        if (loggedIn) loggedIn.classList.remove('hidden');
        var balance = getUserBalance(currentUser.email);
        if (balanceEl) balanceEl.textContent = balance + ' \u20BD';
        if (isAdmin()) {
            if (adminBtn) adminBtn.classList.remove('hidden');
            if (costEl) costEl.textContent = '(Admin \u2014 \u0431\u0435\u0441\u043f\u043b\u0430\u0442\u043d\u043e)';
        } else {
            if (adminBtn) adminBtn.classList.add('hidden');
            if (costEl) costEl.textContent = '(\u0441\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u044c: 50 \u20BD)';
        }
    } else {
        if (loggedOut) loggedOut.classList.remove('hidden');
        if (loggedIn) loggedIn.classList.add('hidden');
        if (costEl) costEl.textContent = '';
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
function buildSystemPrompt(mode, jobTitle, platform) {
    var pNames = { hh: 'hh.ru', linkedin: 'LinkedIn', habr: 'Habr Career', ats: 'ATS (Workday, Greenhouse)' };
    var pName = pNames[platform] || 'hh.ru';

    var baseRules = 'RESPONSE FORMAT: Return EXACTLY in this format:\n===IMPROVED_RESUME===\n[resume]\n\n===CHANGES===\n[+ added, - removed, ~ modified]\n\nRULES:\n- Keep ALL original facts (names, dates, companies, projects)\n- Never invent work experience that wasn\'t in the original\n- You MAY invent realistic supplementary details (certifications, soft skills, brief objective) ONLY if clearly missing\n- Output in the SAME language as the input resume';

    var prompts = {
        standardize: 'You are an expert resume writer specializing in ' + pName + '. TASK: Standardize the resume to match ' + pName + ' best practices. ' +
            '1) STRUCTURE: Add missing standard sections: Professional Summary (if missing), Experience (with company/dates/bullets), Skills (as keyword list), Education. Reorder sections to match ' + pName + ' format.\n' +
            '2) HEADER: Ensure name, contact (email, phone), city are present. If missing, add placeholders like "[Укажите email]" or "[Город]".\n' +
            '3) SUMMARY: If no professional summary exists, write a 2-3 sentence summary tailored to the resume content' + (jobTitle ? ' and target position: ' + jobTitle : '') + '.\n' +
            '4) EXPERIENCE: Each job must have: Company name, Position, Dates (month/year format), 3-5 bullet points starting with action verbs. If bullets are weak, rewrite them using STAR method.\n' +
            '5) SKILLS: Create a dedicated skills section as a comma-separated list. Extract skills from the text and add relevant keywords for ' + pName + '.\n' +
            '6) EDUCATION: Ensure education section exists. If only university is listed, add "[Год окончания]" if missing.\n' +
            '7) FILL MISSING: For clearly missing non-critical fields, add realistic placeholder data in [brackets] or brief realistic additions. Example: if no LinkedIn URL, add "[LinkedIn: ...]". If no photo instruction, add "(фото не требуется)" for ' + pName + '.\n' +
            '8) FORMATTING: Use ' + (platform === 'ats' ? 'plain text, no special characters' : 'clean bullet points with dashes') + '. No markdown tables.' +
            baseRules,

        optimize: 'You are an ATS optimization expert for ' + pName + '. TASK: Optimize the resume for maximum ATS score and recruiter impact.\n' +
            '1) VERBS: Replace ALL passive/weak verbs with strong action verbs: "осуществлял" -> "реализовал", "занимался" -> "успешно выполнил", "делал" -> "обеспечил", "участвовал" -> "внёс вклад".\n' +
            '2) METRICS: Add quantified metrics to EVERY experience bullet where possible. Use realistic numbers: percentages, revenue amounts, team sizes, time saved. Format: "Increased X by Y%" or "Reduced Z by N%".\n' +
            '3) STAR: Rewrite each experience bullet using STAR: Situation (brief context) + Task (what was needed) + Action (what you did) + Result (measurable outcome).\n' +
            '4) KEYWORDS: Inject relevant keywords for ' + pName + ' naturally into the text. For hh.ru: "опыт", "разработка", "проект", "результат". For LinkedIn: "achieved", "led", "developed", "managed".\n' +
            '5) WEAK PHRASES: Remove: "имел опыт", "осуществлял деятельность", " принимал участие", "был ответственным за". Replace with direct action statements.\n' +
            '6) LENGTH: Ensure each bullet is 1-2 sentences. Remove fluff words: "также", "непосредственно", "в рамках".\n' +
            '7) If ' + pName + ' is ATS, avoid: tables, graphics, special characters, headers/footers.' +
            baseRules,

        tailor: 'You are a career coach. TASK: Rewrite the resume specifically for the target position' + (jobTitle ? ': ' + jobTitle : '') + '.\n' +
            '1) SUMMARY: Rewrite professional summary to directly address the target position. Mention key requirements from the job title.\n' +
            '2) SKILLS: Reorder skills to put the most relevant ones for the target position first. Add missing skills that are typically required for ' + (jobTitle || 'this position') + '.\n' +
            '3) EXPERIENCE: Rewrite each job bullet to highlight relevance to the target position. Emphasize transferable skills and achievements that match the role.\n' +
            '4) KEYWORDS: Extract keywords from the job title and weave them naturally into the resume. For example, if target is "Product Manager", use: roadmap, stakeholder, metrics, A/B testing, user stories.\n' +
            '5) RELEVANCE: De-emphasize or remove experience that is not relevant to the target position. Keep it brief (1 line) if included.\n' +
            '6) OBJECTIVE: If there is no career objective, add one that states: "Seeking a position as [target title] to leverage [key skills from resume]."\n' +
            '7) LANGUAGE: Match the tone and terminology commonly used in ' + (jobTitle || 'this field') + '.' +
            baseRules,

        rewrite: 'You are a professional resume writer. TASK: Completely rewrite the resume from scratch while preserving ALL factual information.\n' +
            '1) PARSE: First, extract ALL factual data: name, contacts, companies, positions, dates, projects, skills, education.\n' +
            '2) REWRITE: Create a completely new resume using professional language, strong structure, and modern formatting.\n' +
            '3) STRUCTURE: Header -> Professional Summary -> Core Skills -> Professional Experience -> Education -> Additional.\n' +
            '4) TONE: Professional but engaging. Use active voice throughout. Every sentence should demonstrate value.\n' +
            '5) IMPROVEMENTS:\n' +
            '   - Convert duties to achievements ("Managed team of 5" not "Responsible for team")\n' +
            '   - Add metrics to every possible bullet\n' +
            '   - Use STAR format for experience\n' +
            '   - Create a compelling 2-3 sentence summary\n' +
            '   - List 8-15 relevant skills\n' +
            '6) FORMATTING: Clean, ATS-friendly for ' + pName + '. No tables, no graphics, consistent formatting.' +
            (jobTitle ? '\n7) TARGET: Optimize for position: ' + jobTitle + '. Highlight relevant experience and skills for this role.' : '') +
            baseRules
    };

    return prompts[mode] || prompts.standardize;
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
        var mode = getSelectedPromptMode();
        var result;
        if (mode === 'rewrite') {
            result = generateEnhancedResume(resumeText, jobTitle);
        } else if (mode === 'optimize') {
            result = generateOptimizedResume(resumeText, jobTitle);
        } else if (mode === 'tailor') {
            result = generateTailoredResume(resumeText, jobTitle);
        } else {
            result = generateEnhancedResume(resumeText, jobTitle);
        }
        var score = calculateATSScore(result.resume, selectedPlatform);
        setTimeout(function() {
            resolve({ resume: result.resume, changes: result.changes, score: score });
        }, delay);
    });
}

function generateOptimizedResume(resumeText, jobTitle) {
    var lines = resumeText.split('\n');
    var enhanced = [];
    var changes = [];
    var passiveMap = {
        '\u0437\u0430\u043d\u0438\u043c\u0430\u043b\u0441\u044f': '\u0443\u0441\u043f\u0435\u0448\u043d\u043e \u0432\u044b\u043f\u043e\u043b\u043d\u044f\u043b',
        '\u043e\u0441\u0443\u0449\u0435\u0441\u0442\u0432\u043b\u044f\u043b': '\u0440\u0435\u0430\u043b\u0438\u0437\u043e\u0432\u0430\u043b',
        '\u0432\u044b\u043f\u043e\u043b\u043d\u044f\u043b': '\u043e\u0431\u0435\u0441\u043f\u0435\u0447\u0438\u043b',
        '\u043f\u0440\u043e\u0432\u043e\u0434\u0438\u043b': '\u043e\u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0438\u043b',
        '\u0434\u0435\u043b\u0430\u043b': '\u0432\u044b\u043f\u043e\u043b\u043d\u044f\u043b',
        '\u0437\u0430\u043d\u0438\u043c\u0430\u043b\u0430\u0441\u044c': '\u0443\u0441\u043f\u0435\u0448\u043d\u043e \u0432\u044b\u043f\u043e\u043b\u043d\u044f\u043b',
        '\u0431\u044b\u043b \u043e\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043d\u043d\u044b\u0439': '\u0443\u0441\u043f\u0435\u0448\u043d\u043e \u043f\u0440\u0438\u0432\u0435\u043b \u043f\u0440\u043e\u0435\u043a\u0442',
        '\u0443\u0447\u0430\u0441\u0442\u0432\u043e\u0432\u0430\u043b': '\u043e\u0431\u0435\u0441\u043f\u0435\u0447\u0438\u043b \u0443\u0447\u0430\u0441\u0442\u0438\u0435 \u0432',
        '\u0438\u043c\u0435\u043b \u043e\u043f\u044b\u0442': '\u0440\u0430\u0441\u043f\u043e\u043b\u0430\u0433\u0430\u043b \u0432\u043b\u0430\u0434\u0435\u043d\u0438\u044f\u043c\u0438 \u0432'
    };
    var jobUpper = jobTitle ? jobTitle.toUpperCase() : '\u041f\u0420\u041e\u0424\u0415\u0421\u0421\u0418\u041e\u041d\u0410\u041b\u042c\u041d\u041e\u0415 \u0420\u0415\u0417\u042e\u041c\u0415';
    enhanced.push(jobUpper);
    enhanced.push('');
    lines.forEach(function(line) {
        var trimmed = line.trim();
        if (!trimmed) { enhanced.push(''); return; }
        var newLine = trimmed;
        Object.keys(passiveMap).forEach(function(passive) {
            if (newLine.toLowerCase().indexOf(passive) !== -1) {
                newLine = newLine.replace(new RegExp(passive, 'i'), passiveMap[passive]);
                changes.push({ type: 'modify', text: '\u00ab' + passive + '\u00bb \u2192 \u00ab' + passiveMap[passive] + '\u00bb \u2014 \u0437\u0430\u043c\u0435\u043d\u0430 \u0433\u043b\u0430\u0433\u043e\u043b\u0430' });
            }
        });
        if (/\d/.test(trimmed) && /[\u2022\-\*]\s/.test(trimmed) && trimmed.length > 30 && trimmed.length < 200) {
            if (trimmed.indexOf('%') === -1 && trimmed.indexOf('\u2014') === -1) {
                var m = Math.floor(Math.random() * 40 + 20);
                if (newLine.indexOf('\u0441\u043e\u043a\u0440\u0430\u0442') === -1) {
                    newLine = newLine + ', \u0434\u043e\u0441\u0442\u0438\u0433\u043d\u0443\u0432 ' + m + '%';
                    changes.push({ type: 'add', text: '\u0414\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u0430 \u043c\u0435\u0442\u0440\u0438\u043a\u0430: +' + m + '%' });
                }
            }
        }
        enhanced.push(newLine);
    });
    changes.push({ type: 'modify', text: '\u041e\u043f\u0442\u0438\u043c\u0438\u0437\u0430\u0446\u0438\u044f \u0434\u043b\u044f ' + selectedPlatform.toUpperCase() });
    return { resume: enhanced.join('\n'), changes: changes };
}

function generateTailoredResume(resumeText, jobTitle) {
    var result = generateEnhancedResume(resumeText, jobTitle);
    if (jobTitle) {
        result.changes.unshift({ type: 'add', text: '\u0420\u0435\u0437\u044e\u043c\u0435 \u043f\u0435\u0440\u0441\u043e\u043d\u0430\u043b\u0438\u0437\u0438\u0440\u043e\u0432\u0430\u043d\u043e \u043f\u043e\u0434 \u043f\u043e\u0437\u0438\u0446\u0438\u044e: ' + jobTitle });
        var lines = result.resume.split('\n');
        lines[0] = jobTitle.toUpperCase();
        result.resume = lines.join('\n');
    }
    return result;
}

// ===================== AI REQUEST =====================
async function callAI(resume, jobTitle) {
    var mode = getSelectedPromptMode();
    var systemPrompt = buildSystemPrompt(mode, jobTitle, selectedPlatform);
    var userMessage = 'Resume:\n\n' + resume + '\n\nTarget position: ' + (jobTitle || 'Not specified') + '\n\nPlatform: ' + selectedPlatform;

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

    // Balance check for non-admin users
    if (currentUser && !isAdmin()) {
        var balance = getUserBalance(currentUser.email);
        if (balance < COST_PER_REQUEST) {
            showToast('\u041d\u0435\u0434\u043e\u0441\u0442\u0430\u0442\u043e\u0447\u043d\u043e \u0441\u0440\u0435\u0434\u0441\u0442\u0432. \u041d\u0443\u0436\u043d\u043e ' + COST_PER_REQUEST + ' \u20BD, \u0431\u0430\u043b\u0430\u043d\u0441: ' + balance + ' \u20BD', 'error');
            openPaymentModal();
            return;
        }
    } else if (!currentUser) {
        showToast('\u0412\u043e\u0439\u0434\u0438\u0442\u0435 \u0438\u043b\u0438 \u0437\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u0443\u0439\u0442\u0435\u0441\u044c \u0434\u043b\u044f \u0434\u043e\u0441\u0442\u0443\u043f\u0430', 'error');
        openAuthModal('login');
        return;
    }

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
            result = await generateDemoResult(resume, jobTitle);
        }

        // Deduct balance for non-admin users
        if (currentUser && !isAdmin()) {
            updateUserBalance(currentUser.email, -COST_PER_REQUEST);
            updateAuthUI();
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
        btn.innerHTML = '<i data-lucide="wand-2" class="w-5 h-5"></i> <span id="enhanceBtnText">\u0423\u043b\u0443\u0447\u0448\u0438\u0442\u044c \u0440\u0435\u0437\u044e\u043c\u0435 \u0447\u0435\u0440\u0435\u0437 \u0418\u0418</span> <span id="enhanceBtnCost" class="text-xs opacity-70 font-normal"></span>';
        lucide.createIcons({ nodes: [btn] });
        updateAuthUI();
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
