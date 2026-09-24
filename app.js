// ===================== STATE =====================
var APP_VERSION = 'v3-hh';
console.log('[AI Resume Enhancer] app.js ' + APP_VERSION + ' loaded');
var apiKey = localStorage.getItem('resume_ai_key') || '';
var apiProvider = localStorage.getItem('resume_ai_provider') || 'atria';
var apiModel = localStorage.getItem('resume_ai_model') || 'Atria-Dawn-Preview';
var PROXY_URL = localStorage.getItem('resume_ai_proxy') || '';
var selectedPlatform = 'hh';
var currentTone = 'business';
var isProcessing = false;
var lastResult = null;
var lastChanges = null;

// ===================== AUTH STATE =====================
var currentUser = null;
try { currentUser = JSON.parse(localStorage.getItem('resume_current_user') || 'null'); } catch (e) { currentUser = null; }
var pendingRegistration = null;
var COST_PER_REQUEST = 50;

function getUsers() {
    return JSON.parse(localStorage.getItem('resume_users') || '[]');
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

// cp1251 high-half mapping (bytes 0x80-0xFF -> unicode), shared by rtfToText and the RTF writer
var CP1251_HI = ['Ђ','Ѓ','‚','ѓ','„','…','†','‡','€','‰','Љ','‹','Њ','Ќ','Ћ','Џ',
    'ђ','\u2018','\u2019','\u201C','\u201D','\u2022','\u2013','\u2014','','\u2122','љ','›','њ','ќ','ћ','џ',
    '\u00A0','Ў','ў','','\u00A4','Ґ','\u00A6','\u00A7','Ё','\u00A9','Є','\u00AB','\u00AC','\u00AD','\u00AE','Ї',
    '\u00B0','\u00B1','І','і','ґ','\u00B5','\u00B6','\u00B7','ё','\u2116','є','\u00BB','ј','Ѕ','ї',''];

// Reverse lookup: unicode code point -> cp1251 byte, or -1 when the char is not in cp1251
function unicodeToCp1251(code) {
    if (code < 0x80) return code;
    if (code >= 0x0410 && code <= 0x044F) return code - 0x0410 + 0xC0;
    for (var i = 0; i < 128; i++) {
        if (CP1251_HI[i] && CP1251_HI[i].charCodeAt(0) === code) return i + 0x80;
    }
    return -1;
}

function rtfToText(rtf) {
    function byteToChar(code) {
        if (code < 0x80) return String.fromCharCode(code);
        if (code >= 0xC0) return String.fromCharCode(0x0410 + (code - 0xC0));
        return CP1251_HI[code - 0x80] || '';
    }
    var out = [];
    var len = rtf.length;
    var i = 0, depth = 0, skipFrom = -1;
    var reWord = /[a-zA-Z]/, reDigit = /[-0-9]/;
    var SKIP_GROUPS = { pict: 1, fonttbl: 1, colortbl: 1, stylesheet: 1, info: 1, generator: 1,
        xmlnstbl: 1, rsidtbl: 1, data: 1, datastore: 1, object: 1, objdata: 1, objclsid: 1,
        latentstyles: 1, listtable: 1, listoverridetable: 1, mmathPr: 1, ftnsep: 1, ftnsepc: 1,
        aftnsep: 1, aftnsepc: 1, wgrffmtfilter: 1, userprops: 1, docparts: 1, private: 1,
        footer: 1, footerl: 1, footerr: 1, header: 1, headerl: 1, headerf: 1, textbox: 1 };
    var LINE_BREAK_WORDS = { par: 1, line: 1, cell: 1, row: 1, nestrow: 1, sectd: 1 };
    var pendingDestination = false;
    while (i < len) {
        var ch = rtf.charAt(i);
        if (skipFrom >= 0) {
            if (ch === '{') depth++;
            else if (ch === '}') { depth--; if (depth < skipFrom) skipFrom = -1; }
            i++;
            continue;
        }
        if (ch === '\\' && rtf.charAt(i + 1) === "'") {
            var code = parseInt(rtf.substr(i + 2, 2), 16);
            if (!isNaN(code)) out.push(byteToChar(code));
            i += 4;
            continue;
        }
        if (ch === '\\') {
            var next = rtf.charAt(i + 1);
            if (next === '~' || next === ':') { out.push(' '); i += 2; continue; }
            if (next === '*') { pendingDestination = true; i += 2; continue; }
            if (next === '_' || next === '-') { i += 2; continue; }
            if (next === '{' || next === '}' || next === '\\') { out.push(next); i += 2; continue; }
            var word = '';
            var j = i + 1;
            while (j < len && reWord.test(rtf.charAt(j))) { word += rtf.charAt(j); j++; }
            while (j < len && reDigit.test(rtf.charAt(j))) j++;
            if (rtf.charAt(j) === ' ') j++;
            if (word) {
                if (word === 'u') {
                    var ustr = '';
                    var uj = i + 2;
                    while (uj < len && reDigit.test(rtf.charAt(uj))) { ustr += rtf.charAt(uj); uj++; }
                    if (ustr.length) {
                        var uni = parseInt(ustr, 10);
                        if (uni < 0) uni += 65536;
                        out.push(String.fromCharCode(uni));
                        if (rtf.charAt(uj) === '?') uj++;
                        i = uj;
                        continue;
                    }
                }
                if (pendingDestination || (SKIP_GROUPS[word] && i > 0 && rtf.charAt(i - 1) === '{')) {
                    skipFrom = depth;
                    pendingDestination = false;
                } else if (LINE_BREAK_WORDS[word]) {
                    out.push('\n');
                } else if (word === 'tab') {
                    out.push(' ');
                } else if (word === 'emdash' || word === 'endash') {
                    out.push(word === 'emdash' ? '—' : '–');
                }
            }
            i = j;
            continue;
        }
        if (ch === '{') { depth++; i++; continue; }
        if (ch === '}') { depth--; i++; continue; }
        if (ch.charCodeAt(0) < 32) { i++; continue; }
        out.push(ch);
        i++;
    }
    var joined = out.join('').replace(/\r/g, '\n');
    var parts = joined.split('\n').map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 0; });
    for (var p = parts.length - 1; p >= 0; p--) {
        if (/^(руб|руб\.|₽|\$|€)$/i.test(parts[p]) && p > 0) {
            parts[p - 1] = parts[p - 1] + ' ' + parts[p];
            parts.splice(p, 1);
        }
    }
    return parts.join('\n');
}

function handleFileUpload(event) {
    var file = event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        var text = e.target.result;
        if (file.name.toLowerCase().endsWith('.rtf')) {
            text = rtfToText(text);
            if (!text.replace(/\s/g, '').length) {
                showToast('\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0438\u0437\u0432\u043b\u0435\u0447\u044c \u0442\u0435\u043a\u0441\u0442 \u0438\u0437 RTF', 'error');
                return;
            }
        }
        document.getElementById('resumeInput').value = text;
        updateCharCount();
        showToast('\u0424\u0430\u0439\u043b \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043d: ' + file.name, 'success');
    };
    reader.onerror = function() {
        showToast('\u041e\u0448\u0438\u0431\u043a\u0430 \u0447\u0442\u0435\u043d\u0438\u044f \u0444\u0430\u0439\u043b\u0430', 'error');
    };
    reader.readAsText(file);
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
    var role = users.length === 0 ? 'admin' : 'user';
    users.push({ email: pendingRegistration.email, password: pendingRegistration.password, role: role, confirmed: true });
    saveUsers(users);
    currentUser = { email: pendingRegistration.email, role: role };
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

    var isEn = platform === 'linkedin';
    var formatSpec = isEn ?
        'TARGET OUTPUT FORMAT — plain-text resume, EXACTLY this section order and names:\n\n' +
        '{Full name}\n{Gender}, {age} years old\n{Phone}\n{Email}\nLives in: {City}\n\n' +
        'SUMMARY\n{2-3 sentences}\n\n' +
        'DESIRED POSITION\n{Position}\n{Field}\nFull-time\n{Salary expectation}\n\n' +
        'EXPERIENCE\n{Total experience}\n\n{Month Year} — {Present / Month Year}\n{Duration at this job}\n{Company}\n{City}\n{Industry}\n{Position}\n{3-6 lines of duties and achievements}\n\n' +
        'EDUCATION\n{Year}\n{University}, {City}\n{Faculty}, {Major}\n\n' +
        'COURSES / CERTIFICATIONS\n{Year}\n{Course}\n{Provider}\n\n' +
        'KEY SKILLS\nLANGUAGES\n{Language} {Level}\n\nSKILLS\n{Skill}\n\n' +
        'ADDITIONAL INFORMATION\nREFERENCES\n{Organization}\n{Name} ({Position}). {Phone}\n'
        :
        'TARGET OUTPUT FORMAT — резюме в стиле топ-резюме hh.ru. Выведи РОВНО в таком порядке разделов и с такими названиями разделов, простой текст, без markdown и таблиц:\n\n' +
        '{ФИО полностью}\n{Пол}, {возраст} лет, родился {дата рождения}\n{Статус поиска: Активно ищет работу / Предложили работу, решает / Рассматривает предложения}\n{Телефон}\n{Email}\n{Город}, {не готов к переезду или готов к переезду}, {не готов к командировкам или готов к командировкам}\n\n' +
        '{Сопроводительное письмо, если оно есть в исходнике}\n\n' +
        'Желаемая должность и зарплата\n{Желаемая должность}\n{Сумма} ₽ на руки\nСпециализации:\n{Специализация 1}\n{Специализация 2}\nТип занятости: {полная занятость, частичная занятость, проектная работа/разовое задание}\nФормат работы: {удалённо, на месте работодателя, гибрид}\n\n' +
        'Опыт работы\n{Общий стаж, например: 5 лет 3 месяца}\n\n{Месяц Год} — {настоящее время}\n{Длительность на этом месте}\n{Название компании}\n{Город}\n{Сфера деятельности компании}\n{Должность}\n{Обязанности и конкретные достижения, 3-6 строк}\n\n...{каждое место работы в обратном хронологическом порядке}\n\n' +
        'Навыки\nУровни владения навыками\nПродвинутый уровень: {навыки через запятую}\nСредний уровень: {навыки через запятую}\nБазовый уровень: {навыки через запятую}\n\n' +
        'Высшее образование\n{Год окончания}\n{Название ВУЗа}, {Город}\n{Факультет}, {Специальность}\n\n' +
        'Повышение квалификации, курсы\n{Год}\n{Название курса}\n{Учебный центр}\n\n' +
        'Знание языков\n{Язык} — {Уровень, например: Русский — Родной, Английский — B2 — Средне-продвинутый}\n\n' +
        'Гражданство, время в пути до работы\nГражданство: {Гражданство}\nРазрешение на работу: {Страна}\nЖелательное время в пути до работы: {Не имеет значения}\n\n' +
        'Дополнительная информация\nРекомендации\n{Организация}\n{ФИО} ({Должность}). {Телефон}\n\n' +
        'ПРАВИЛО КОНКРЕТНЫХ ДОСТИЖЕНИЙ: в описании КАЖДОГО места работы должен быть измеримый результат с цифрами или процентами. Если в исходном резюме по этому месту работы нет ни одной цифры, выведи отдельной строкой плейсхолдер «[Укажите результат: ...]» и НЕ придумывай цифры, которых не было в исходнике.\n';

    var baseRules = 'RESPONSE FORMAT: Return EXACTLY in this format:\n===IMPROVED_RESUME===\n[resume]\n\n===CHANGES===\n[+ added, - removed, ~ modified]\n\nRULES:\n- Keep ALL original facts (names, dates, companies, projects)\n- Never invent work experience that wasn\'t in the original\n- You MAY invent realistic supplementary details ONLY if clearly missing\n- If contact or personal data is missing, output a placeholder in [square brackets], e.g. [Укажите телефон]\n- Output in the SAME language as the input resume\n\n' + formatSpec;

    var prompts = {
        standardize: 'You are an expert resume writer specializing in ' + pName + '. TASK: Standardize the resume to match ' + pName + ' best practices. ' +
            '1) STRUCTURE: Add missing standard sections: Professional Summary (if missing), Experience (with company/dates/bullets), Skills (as keyword list), Education. Reorder sections to match ' + pName + ' format.\n' +
            '2) HEADER: Ensure name, contact (email, phone), city are present. If missing, add placeholders like "[Укажите email]" or "[Город]".\n' +
            '3) SUMMARY: If no professional summary exists, write a 2-3 sentence summary tailored to the resume content' + (jobTitle ? ' and target position: ' + jobTitle : '') + '.\n' +
            '4) EXPERIENCE: Each job must have: Company name, Position, Dates (month/year format), 3-5 bullet points starting with action verbs. If bullets are weak, rewrite them using STAR method.\n' +
            '5) SKILLS: Create a dedicated skills section as a comma-separated list. Extract skills from the text and add relevant keywords for ' + pName + '.\n' +
            '6) EDUCATION: Ensure education section exists. If only university is listed, add "[Год окончания]" if missing.\n' +
            '7) FILL MISSING: For clearly missing non-critical fields, add realistic placeholder data in [brackets] or brief realistic additions. Example: if no LinkedIn URL, add "[LinkedIn: ...]". If no photo instruction, add "(фото не требуется)" for ' + pName + '.\n' +
            '8) FORMATTING: Use ' + (platform === 'ats' ? 'plain text, no special characters' : 'clean bullet points with dashes') + '. No markdown tables.\n' +
            '9) hh.ru TOP-RESUME FIELDS (when the platform is hh.ru): add the search status («Активно ищет работу» / «Предложили работу, решает» / «Рассматривает предложения»), the salary as «N ₽ на руки», a list of specializations, the SEPARATE fields «Тип занятости» and «Формат работы», the relocation/business-trip readiness line «{Город}, {готов/не готов к переезду}, {готов/не готов к командировкам}», skill levels with the exact hh.ru labels «Продвинутый уровень», «Средний уровень», «Базовый уровень», languages with the CEFR code and its Russian descriptor («Английский — B2 — Средне-продвинутый», «Русский — Родной»), and the «Гражданство, время в пути до работы» block with «Желательное время в пути до работы: Не имеет значения». Keep every section in the order of the target format above.\n' +
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

// ===================== DEMO MODE =====================
function generateDemoResult(resumeText, jobTitle) {
    return new Promise(function(resolve) {
        var delay = 1200 + Math.random() * 1300;
        var mode = getSelectedPromptMode();
        var result = processHHResume(resumeText, jobTitle, mode);
        var score = calculateATSScore(result.resume, selectedPlatform);
        setTimeout(function() {
            resolve({ resume: result.resume, changes: result.changes, score: score });
        }, delay);
    });
}

// ===================== hh.ru FORMAT ENGINE =====================
var HH_MONTH_NAMES = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
var HH_MONTH_WORDS = [
    {re: /^янв/i, m: 1}, {re: /^фев/i, m: 2}, {re: /^мар/i, m: 3}, {re: /^апр/i, m: 4},
    {re: /^ма[йя]/i, m: 5}, {re: /^июн/i, m: 6}, {re: /^июл/i, m: 7}, {re: /^авг/i, m: 8},
    {re: /^сен/i, m: 9}, {re: /^окт/i, m: 10}, {re: /^ноя/i, m: 11}, {re: /^дек/i, m: 12}
];
var HH_MONTH_REGEX = /(?:^|[\s\-\u2014(])(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)[ьяеюа]?(?![а-яё])/;
var HH_CITIES = ['москва','санкт-петербург','спб','питер','волгоград','воронеж','екатеринбург','казань','калининград','краснодар','красноярск','нижний новгород','новосибирск','омск','пермь','ростов-на-дону','самара','саратов','тюмень','уфа','хабаровск','челябинск','ярославль','иркутск','владивосток','мурманск','тула','калуга','подольск','мытищи','долгопрудный','минск','киев','алматы','ташкент','тбилиси','еревань','бишкек','кишинёв'];
var HH_LANGUAGES = ['русский','английский','немецкий','французский','испанский','итальянский','китайский','японский','корейский','польский','украинский','белорусский','турецкий','арабский','португальский','чешский'];

function hhNorm(s) { return (s || '').trim().replace(/\s+/g, ' '); }
function hhCapitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function hhParseMonth(word) {
    if (!word) return 0;
    var w = word.toLowerCase();
    for (var i = 0; i < HH_MONTH_WORDS.length; i++) {
        if (HH_MONTH_WORDS[i].re.test(w)) return HH_MONTH_WORDS[i].m;
    }
    return 0;
}

function hhParseDate(str) {
    var s = hhNorm(str).toLowerCase();
    if (!s) return null;
    var year = null, month = 0;
    var dmy = s.match(/(\d{1,2})[\.\-/](\d{1,2})[\.\-/](\d{4})/);
    var my = s.match(/(\d{1,2})[\.\-/](\d{4})/);
    var ym = s.match(/(\d{4})[\.\-/](\d{1,2})/);
    var yOnly = s.match(/(\d{4})/);
    if (dmy) { month = parseInt(dmy[2], 10); year = parseInt(dmy[3], 10); }
    else if (my) { month = parseInt(my[1], 10); year = parseInt(my[2], 10); }
    else if (ym) { month = parseInt(ym[2], 10); year = parseInt(ym[1], 10); }
    else if (yOnly) { year = parseInt(yOnly[1], 10); }
    var mw = s.match(HH_MONTH_REGEX);
    if (mw) { var mm = hhParseMonth(mw[1]); if (mm) month = mm; }
    if (!year || year < 1900 || year > 2100) return null;
    if (month < 0 || month > 12) month = 0;
    return { month: month, year: year };
}

function hhParseDateRangeLine(line) {
    var s = hhNorm(line);
    if (!s || s.indexOf('@') !== -1) return null;
    var lower = s.toLowerCase();
    var present = /настоящ|наст\.\s*врем|текущ|сегодн|present|now\b/.test(lower);
    var body = s.replace(/^с\s+/i, '')
        .replace(/[—–−‒]/g, '|')
        .replace(/\sпо\s/gi, '|')
        .replace(/(\d)\s*-\s*(?=\d)/g, '$1|')
        .replace(/\s-\s/g, '|');
    var parts = body.split('|').map(function(p) { return p.trim(); }).filter(function(p) { return p.length; });
    if (!parts.length) return null;
    var start = hhParseDate(parts[0]);
    if (!start) return null;
    var end = null;
    if (parts.length > 1) {
        end = hhParseDate(parts[1]);
        if (!end && present) end = { present: true };
    } else if (present) {
        end = { present: true };
    }
    if (!end) return null;
    return { start: start, end: end };
}

function hhPlural(n, one, few, many) {
    var mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
    return many;
}

function hhFormatDuration(totalMonths) {
    if (totalMonths <= 0) return '';
    var years = Math.floor(totalMonths / 12);
    var months = totalMonths % 12;
    var parts = [];
    if (years) parts.push(years + ' ' + hhPlural(years, 'год', 'года', 'лет'));
    if (months) parts.push(months + ' ' + hhPlural(months, 'месяц', 'месяца', 'месяцев'));
    return parts.join(' ');
}

function hhParseDuration(line) {
    var s = hhNorm(line);
    var m = s.match(/(\d+)\s*(?:лет|года|год)\s*(?:(\d+)\s*(?:месяц|мес(?:яцев)?))?/i);
    if (m) return hhFormatDuration(parseInt(m[1], 10) * 12 + (m[2] ? parseInt(m[2], 10) : 0));
    m = s.match(/(\d+)\s*мес(?:яц|яцев)?/i);
    if (m) return hhFormatDuration(parseInt(m[1], 10));
    return null;
}

function hhMonthYear(d) {
    if (!d) return '';
    return (d.month ? hhCapitalize(HH_MONTH_NAMES[d.month - 1]) + ' ' : '') + d.year;
}

function hhFormatPeriod(job) {
    var s = hhMonthYear(job.start);
    var e = (job.end && job.end.present) ? 'настоящее время' : hhMonthYear(job.end);
    return s + ' — ' + e;
}

function hhIsCity(line) {
    var s = hhNorm(line).toLowerCase().replace(/[,.]/g, '');
    if (!s || s.length > 30 || /\d/.test(s)) return false;
    return HH_CITIES.indexOf(s) !== -1;
}

function hhExtractSalary(line) {
    var s = hhNorm(line);
    var m = s.match(/([\d][\d\s]{1,})\s*(руб|₽|\$|€|eur|usd)/i);
    if (m) {
        var cur = m[2].toLowerCase();
        return hhNorm(m[1]) + (cur === 'руб' ? ' руб.' : ' ' + cur);
    }
    m = s.match(/(\d[\d\s]*)/);
    return m ? hhNorm(m[1]) + ' руб.' : s;
}

function hhSalaryLine(salary) {
    var s = hhNorm(salary);
    if (/(руб|₽|\$|€|eur|usd)/i.test(s)) return s;
    return s + ' руб.';
}

function hhParseLanguage(line) {
    var s = hhNorm(line);
    var lower = s.toLowerCase();
    for (var i = 0; i < HH_LANGUAGES.length; i++) {
        if (lower.indexOf(HH_LANGUAGES[i]) === 0) {
            var level = s.substring(HH_LANGUAGES[i].length).replace(/^[\s•—:\-·]+/, '').trim();
            return { name: hhCapitalize(HH_LANGUAGES[i]), level: level };
        }
    }
    var m = s.match(/^([A-Za-zА-Яа-яЁё]{4,})\s*[—:\-]?\s*(.*)$/);
    if (m && m[1]) return { name: m[1], level: m[2] || '' };
    return null;
}

// ===================== hh.ru TOP-RESUME EXTENSIONS =====================
// Fields that separate a "top" hh.ru resume from a basic one: search status,
// salary "na ruki", specializations, separate employment / work-format fields,
// relocation readiness, skill levels, CEFR language levels, citizenship /
// work permit / commute time and measurable achievements for every job.

var HH_JOB_STATUSES = [
    { re: /активно\s+ищет|активно\s+ищу|ищу\s+работу|в\s+активном\s+поиске|active\s+search/i, value: 'Активно ищет работу' },
    { re: /предложили\s+работу|есть\s+оффер|с\s+оффером|оффер\s+на\s+руки/i, value: 'Предложили работу, решает' },
    { re: /рассматриваю\s+предложени|рассматривает\s+предложени|открыт\w*\s+к\s+предложени|открыт\w*\s+для\s+предложени/i, value: 'Рассматривает предложения' }
];

function hhDetectJobStatus(text) {
    var s = String(text || '').toLowerCase();
    for (var i = 0; i < HH_JOB_STATUSES.length; i++) {
        if (HH_JOB_STATUSES[i].re.test(s)) return HH_JOB_STATUSES[i].value;
    }
    return 'Активно ищет работу';
}

// Groups digits with a normal space the way hh.ru prints money (400 000).
function hhGroupDigits(num) {
    var parts = String(num).split('.');
    var intPart = parts[0];
    var grouped = '';
    while (intPart.length > 3) { grouped = ' ' + intPart.slice(-3) + grouped; intPart = intPart.slice(0, intPart.length - 3); }
    return intPart + grouped + (parts.length > 1 ? '.' + parts.slice(1).join('.') : '');
}

// "<sum> ₽ на руки" — hh.ru always quotes the net (hands) salary this way.
function hhSalaryHandsLine(salary) {
    var s = hhNorm(String(salary || ''));
    if (!s || /не\s+указан|договор|по\s+согласованию|нет/i.test(s)) return '';
    var lower = s.toLowerCase();
    var currency = '₽';
    if (/\$|usd/.test(lower)) currency = '$';
    else if (/€|eur/.test(lower)) currency = '€';
    var cleaned = s.replace(/на\s+руки|в\s+месяц|в\s+год|рублей|руб\.|руб|₽|rub|\$|€|usd|eur|от|до/gi, ' ');
    var m = cleaned.match(/[\d][\d\s\.]*/);
    if (!m) return hhSalaryLine(s);
    var num = m[0].replace(/\s+/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(/\.$/, '');
    if (!num) return hhSalaryLine(s);
    return hhGroupDigits(num) + ' ' + currency + ' на руки';
}

// hh.ru specializations are picked from a fixed catalogue; we map the title /
// sphere keywords onto the catalogue entries a top resume would show.
var HH_SPECIALIZATION_MAP = [
    { re: /\bcio\b|директор\s+по\s+информационн|it[-\s]?директор/i, value: 'Директор по информационным технологиям (CIO)' },
    { re: /\bcto\b|технический\s+директор/i, value: 'Технический директор (CTO)' },
    { re: /тим[-\s]?лид|team\s*lead|руководитель\s+группы|lead\s+developer|руководитель\s+отдела\s+разработк/i, value: 'Руководитель группы разработки' },
    { re: /devops|dev[-\s]?ops/i, value: 'DevOps-инженер' },
    { re: /системный\s+администратор|sysadmin|администратор\s+баз\s+данных/i, value: 'Системный администратор' },
    { re: /разработчик|программист|инженер[-\s]программист|разработка|\bdev\b|developer/i, value: 'Программист, разработчик' },
    { re: /тестировщик|\bqa\b|автоматизатор|инженер\s+по\s+тестирован|\btest\b/i, value: 'Тестировщик' },
    { re: /аналитик|analyst/i, value: 'Аналитик' },
    { re: /продакт|product\s*manager|менеджер\s+продукта/i, value: 'Менеджер продукта' },
    { re: /проджект|project\s*manager|руководитель\s+проект|менеджер\s+проекта/i, value: 'Менеджер проекта' },
    { re: /маркетолог|marketing|маркетинг/i, value: 'Маркетолог' },
    { re: /дизайнер|designer|ui[\/\s]ux|веб[-\s]дизайн/i, value: 'Дизайнер' },
    { re: /инженер|engineer/i, value: 'Инженер' }
];

function hhDetectSpecializations(jobTitle, sphere) {
    var src = ((jobTitle || '') + ' ' + (sphere || '')).toLowerCase();
    var list = [];
    var title = hhNorm(jobTitle);
    if (title) list.push(title);
    for (var i = 0; i < HH_SPECIALIZATION_MAP.length && list.length < 6; i++) {
        var spec = HH_SPECIALIZATION_MAP[i];
        if (!spec.re.test(src)) continue;
        var dup = false;
        for (var k = 0; k < list.length; k++) if (list[k].toLowerCase() === spec.value.toLowerCase()) dup = true;
        if (!dup) list.push(spec.value);
    }
    return list;
}

// "Тип занятости" and "Формат работы" are two separate hh.ru fields.
function hhDetectEmployment(employment) {
    var src = hhNorm(String(employment || '')).toLowerCase().replace(/тип\s+занятости\s*[:：]?\s*/, '');
    var parts = [];
    if (/полная|полный|full[-\s]?time/.test(src)) parts.push('полная занятость');
    if (/частичн|неполная|part[-\s]?time/.test(src)) parts.push('частичная занятость');
    if (/проектн|разов|project\b/.test(src)) parts.push('проектная работа/разовое задание');
    if (/стажиров|internship/.test(src)) parts.push('стажировка');
    if (!parts.length) parts.push('полная занятость');
    return parts.join(', ');
}

function hhDetectWorkFormat(text) {
    var src = String(text || '').toLowerCase().replace(/формат\s+работы\s*[:：]?\s*/, ' ');
    var parts = [];
    if (/удалён|удален|remote|фриланс|надомн/.test(src)) parts.push('удалённо');
    if (/гибрид|hybrid|смешанн/.test(src)) parts.push('гибрид');
    if (/на\s+месте\s+работодатель|на\s+территории\s+работодатель|офис/.test(src)) parts.push('на месте работодателя');
    if (!parts.length) parts.push('на месте работодателя');
    var ORDER = ['удалённо', 'на месте работодателя', 'гибрид'];
    var out = [];
    for (var i = 0; i < ORDER.length; i++) if (parts.indexOf(ORDER[i]) !== -1) out.push(ORDER[i]);
    return out;
}

// "<Город>, <не готов к переезду/готов к переезду>, <готов к командировкам/...>"
function hhParseRelocateOne(line, city) {
    var info = { city: '', move: null, trips: null };
    var s = hhNorm(String(line || ''));
    var lower = s.toLowerCase();
    if (!s) { info.city = hhNorm(city || ''); return info; }
    // explicit "<...>: <city>" form, e.g. "Хочу переехать: Москва"
    var cm = s.match(/[:：]\s*([А-Яа-яЁёA-Za-z][А-Яа-яЁёA-Za-z\s\.\-]{1,40}?)(?:[,;]|$)/);
    if (cm) info.city = hhNorm(cm[1]);
    if (!info.city) {
        // everything before the readiness part, e.g. "Санкт-Петербург, м. Невский проспект"
        var chunks = s.split(/[,;]/);
        var cityParts = [];
        for (var i = 0; i < chunks.length; i++) {
            var c = hhNorm(chunks[i]);
            var cl = c.toLowerCase();
            if (/готов|переезд|переезж|перееха|командиров/.test(cl)) break;
            if (!c || c.length > 40) continue;
            if (/[а-яёa-z]/i.test(c)) cityParts.push(c);
        }
        info.city = cityParts.join(', ');
    }
    if (/не\s+готов\s+к\s+переезду|переезд\s+не\s+рассматриваю|не\s+рассматриваю\s+переезд/.test(lower)) info.move = false;
    else if (/готов\s+к\s+переезду|переезд|переезж|перееха|перееду/.test(lower)) info.move = true;
    if (/не\s+готов\s+к\s+командировк/.test(lower)) info.trips = false;
    else if (/готов\s+к\s+командировк/.test(lower)) info.trips = true;
    if (!info.city) info.city = hhNorm(city || '');
    return info;
}

// A resume may carry several relocation lines (our own export keeps the
// residence line and the target-city line apart); merge them into one record.
function hhParseRelocate(line, city) {
    var info = { city: '', move: null, trips: null };
    var parts = String(line || '').split('\n');
    for (var p = 0; p < parts.length; p++) {
        var one = hhParseRelocateOne(parts[p], city);
        if (!info.city && one.city) info.city = one.city;
        if (info.move === null) info.move = one.move;
        if (info.trips === null) info.trips = one.trips;
    }
    return info;
}

function hhFormatRelocate(model) {
    var info = model.relocateInfo || {};
    var city = info.city || model.city || '';
    var parts = [];
    if (city) parts.push(city);
    parts.push(info.move ? 'готов к переезду' : 'не готов к переезду');
    parts.push(info.trips ? 'готов к командировкам' : 'не готов к командировкам');
    return parts.join(', ');
}

function hhParseCommute(line) {
    var s = hhNorm(String(line || '')).replace(/^[^:：]*[:：]\s*/, '');
    if (!s) return 'Не имеет значения';
    return s.charAt(0).toUpperCase() + s.slice(1);
}

// Language levels: hh.ru pairs the CEFR code with a Russian descriptor.
var HH_CEFR_LEVELS = [
    { code: 'A1', name: 'Начальный' }, { code: 'A2', name: 'Элементарный' },
    { code: 'B1', name: 'Средний' }, { code: 'B2', name: 'Средне-продвинутый' },
    { code: 'C1', name: 'Свободный' }, { code: 'C2', name: 'Совершенный' }
];
var HH_CEFR_LETTERS = { A: 'AА', B: 'BВ', C: 'CС' };

function hhCefrRegex(code) {
    return new RegExp('(^|[^a-zа-яё])[' + HH_CEFR_LETTERS[code.charAt(0)] + ']' + code.charAt(1) + '([^0-9]|$)', 'i');
}

function hhNormalizeLanguageLevel(level) {
    var s = hhNorm(String(level || ''));
    if (!s) return '';
    var lower = s.toLowerCase();
    if (/родн/.test(lower)) return 'Родной';
    for (var i = 0; i < HH_CEFR_LEVELS.length; i++) {
        if (hhCefrRegex(HH_CEFR_LEVELS[i].code).test(' ' + lower)) {
            return HH_CEFR_LEVELS[i].code + ' — ' + HH_CEFR_LEVELS[i].name;
        }
    }
    var WORD_MAP = [
        { re: /совершенн/, code: 'C2' }, { re: /свободн/, code: 'C1' },
        { re: /средне[-\s]?продвинут/, code: 'B2' }, { re: /средн/, code: 'B1' },
        { re: /элементарн/, code: 'A2' }, { re: /начальн|базов|основы/, code: 'A1' }
    ];
    for (var j = 0; j < WORD_MAP.length; j++) {
        if (WORD_MAP[j].re.test(lower)) {
            var lev = HH_CEFR_LEVELS;
            for (var k = 0; k < lev.length; k++) if (lev[k].code === WORD_MAP[j].code) return lev[k].code + ' — ' + lev[k].name;
        }
    }
    return s;
}

function hhFormatLanguage(lang) {
    var name = hhCapitalize(hhNorm(lang.name));
    var level = hhNormalizeLanguageLevel(lang.level);
    return level ? name + ' — ' + level : name;
}

// Skill levels: hh.ru tiers with the exact labels "Продвинутый уровень",
// "Средний уровень", "Базовый уровень".
var HH_SKILL_TIERS = ['Продвинутый уровень', 'Средний уровень', 'Базовый уровень'];
var HH_SKILL_TIER_EMPTY = {
    'Продвинутый уровень': '[укажите навыки продвинутого уровня]',
    'Средний уровень': '[укажите навыки среднего уровня]',
    'Базовый уровень': '[укажите навыки базового уровня]'
};
var HH_SKILL_WEAK = /начальн|основы|базов|школьн|университет|курс|хобби|увлекаюсь|поверхност|знаком|читаю|учил|обучал|студент|первый/;
var HH_SKILL_STRONG = /большой\s+опыт|многолетн|глубок|владею\s+в\s+совершенстве|твердые|свободно\s+владею|эксперт/;

function hhSkillOccurrences(skill, rawText) {
    var s = String(skill || '').toLowerCase();
    if (s.length < 2) return 0;
    var text = String(rawText || '').toLowerCase();
    var count = 0, idx = 0;
    while ((idx = text.indexOf(s, idx)) !== -1) { count++; idx += s.length; }
    return count;
}

function hhSkillContextWeak(skill, rawText) {
    var s = String(skill || '').toLowerCase();
    var text = String(rawText || '').toLowerCase();
    if (!s || text.indexOf(s) === -1) return false;
    var idx = text.indexOf(s);
    var allWeak = true;
    while (idx !== -1) {
        var lineStart = text.lastIndexOf('\n', idx);
        var lineEnd = text.indexOf('\n', idx);
        if (lineEnd === -1) lineEnd = text.length;
        var line = text.substring(lineStart === -1 ? 0 : lineStart, lineEnd);
        if (!HH_SKILL_WEAK.test(line)) allWeak = false;
        idx = text.indexOf(s, idx + s.length);
    }
    return allWeak;
}

function hhEnsureSkillLevels(model) {
    model.skillLevels = model.skillLevels || {};
    var title = String(model.jobTitle || '') + ' ' + String(model.sphere || '');
    var raw = String(model._rawText || '');
    for (var i = 0; i < model.skills.length; i++) {
        var key = String(model.skills[i]).toLowerCase();
        if (model.skillLevels[key]) continue;
        if (HH_SKILL_STRONG.test(String(model.skills[i]).toLowerCase())) model.skillLevels[key] = 'Продвинутый уровень';
        else if (title.toLowerCase().indexOf(key) !== -1) model.skillLevels[key] = 'Продвинутый уровень';
        else {
            var n = hhSkillOccurrences(key, raw);
            if (n >= 2) model.skillLevels[key] = 'Продвинутый уровень';
            else if (n === 1 && hhSkillContextWeak(key, raw)) model.skillLevels[key] = 'Базовый уровень';
            else model.skillLevels[key] = 'Средний уровень';
        }
    }
}

// Total months spent on a job, from the period or from the duration string.
function hhDurationMonths(line) {
    var s = hhNorm(String(line || ''));
    var m = s.match(/(\d+)\s*(?:лет|года|год)\s*(?:(\d+)\s*(?:месяц|мес(?:яцев)?))?/i);
    if (m) return parseInt(m[1], 10) * 12 + (m[2] ? parseInt(m[2], 10) : 0);
    m = s.match(/(\d+)\s*мес(?:яц|яцев)?/i);
    if (m) return parseInt(m[1], 10);
    return 0;
}

function hhJobMonths(job) {
    var months = hhDurationMonths(job.duration);
    if (months > 0) return months;
    if (job.start && job.start.year) {
        var end = job.end || {};
        if (end.present) { var n = new Date(); months = (n.getFullYear() - job.start.year) * 12 + (n.getMonth() - (job.start.month || 0)); }
        else if (end.year) months = (end.year - job.start.year) * 12 + ((end.month || 0) - (job.start.month || 0));
    }
    return months;
}

function hhJobHasAchievement(job) {
    var desc = job.description || [];
    for (var i = 0; i < desc.length; i++) {
        if (/\d/.test(desc[i])) return true;
        if (desc[i].indexOf('[Укажите результат') === 0) return true;
    }
    return false;
}

// Own appended achievement lines are standalone statements, never a wrapped
// continuation of the previous description.
function hhIsAchievementLine(line) {
    return /^Подтверждённый стаж|^Непрерывный стаж|^\[Укажите результат/.test(String(line || ''));
}

// "Конкретные достижения": every job needs a measurable result. When the
// description has no digits at all we only use facts that are really there
// (the tenure) or fall back to an explicit placeholder — never invented numbers.
function hhEnsureJobAchievements(job) {
    if (hhJobHasAchievement(job)) return null;
    var months = hhJobMonths(job);
    if (months >= 12) {
        var dur = hhFormatDuration(months);
        return job.position ? ('Подтверждённый стаж ' + dur + ' на позиции «' + job.position + '»')
            : 'Непрерывный стаж ' + dur + ' работы на данной позиции';
    }
    return '[Укажите результат: например, внедрил решение, повысившее эффективность на 20%]';
}

// Fills every top-resume field of the model; safe to call more than once.
function hhEnrichModel(model) {
    model = model || {};
    model.jobs = model.jobs || [];
    model.skills = model.skills || [];
    model.languages = model.languages || [];
    model.specializations = model.specializations || [];
    model.workFormat = model.workFormat || [];
    model.education = model.education || [];
    model.courses = model.courses || [];
    model.references = model.references || [];
    model.extra = model.extra || [];
    if (!model.jobStatus) model.jobStatus = hhDetectJobStatus(model._rawText || '');
    model.employment = hhDetectEmployment(model.employment || 'полная занятость');
    if (!model.workFormat.length) model.workFormat = hhDetectWorkFormat(model._rawText || '');
    if (!model.commuteTime) model.commuteTime = hhParseCommute('');
    model.relocateInfo = hhParseRelocate(model.relocate, model.city);
    // the residence city leads the line, the relocation target is kept apart
    if (model.city) model.relocateInfo.city = model.city;
    if (!model.relocateNote) {
        var relLines = String(model.relocate || '').split('\n');
        for (var ri = 0; ri < relLines.length; ri++) {
            var rl = relLines[ri];
            if (!/переезд|переезж|перееха/.test(rl.toLowerCase())) continue;
            var rInfo = hhParseRelocateOne(rl, model.city);
            var base = model.city || model.relocateInfo.city;
            if (rInfo.city && base && rInfo.city.toLowerCase() !== base.toLowerCase()) {
                model.relocateNote = rl;
                break;
            }
        }
    }
    // The user's own title is always the first specialization.
    var specs = [];
    var title = hhNorm(model.jobTitle);
    if (title) specs.push(title);
    for (var i = 0; i < model.specializations.length && specs.length < 6; i++) {
        var sp = hhNorm(model.specializations[i]);
        if (sp && specs.indexOf(sp) === -1) specs.push(sp);
    }
    var mapped = hhDetectSpecializations(model.jobTitle, model.sphere);
    for (var j = 0; j < mapped.length && specs.length < 6; j++) {
        if (specs.indexOf(mapped[j]) === -1) specs.push(mapped[j]);
    }
    model.specializations = specs;
    for (var li = 0; li < model.languages.length; li++) {
        model.languages[li].level = hhNormalizeLanguageLevel(model.languages[li].level);
    }
    hhEnsureSkillLevels(model);
    return model;
}

function parseToHHModel(text) {
    var raw = String(text || '');
    var lines = raw.replace(/\r/g, '').split('\n')
        .map(function(l) { return l.trim(); })
        .filter(function(l) { return l.length > 0; });

    var model = {
        name: '', personal: '', phone: '', email: '', city: '', citizenship: '', workPermit: '',
        relocate: '', relocateNote: '', relocateInfo: null, jobStatus: '', coverLetter: '',
        jobTitle: '', sphere: '', employment: 'Полная занятость, полный день', workFormat: [],
        specializations: [], salary: '', totalExperience: '', jobs: [], education: [], courses: [],
        languages: [], skills: [], skillLevels: {}, references: [], extra: [], commuteTime: '',
        _rawText: raw
    };

    model.email = (raw.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i) || [])[0] || '';
    model.phone = (raw.match(/\+?\d[\d\s\-()]{7,}\d/) || [])[0] || '';

    var section = 'header';
    var curJob = null;
    var expPreamble = [];
    var curRef = null;
    var skillsTier = null;

    var SECTION_HEADERS = {
        cover: { prefix: ['сопроводительное письмо'], exact: [] },
        desired: { prefix: ['желаемая должность', 'искомая должность', 'целевая должность'], exact: ['objective'] },
        experience: { prefix: ['опыт работы', 'трудовая деятельность', 'трудовой стаж', 'employment history', 'work experience'], exact: ['опыт', 'карьера'] },
        education: { prefix: ['высшее образование', 'среднее образование'], exact: ['образование', 'учёба', 'учеба'] },
        courses: { prefix: ['повышение квалификации'], exact: ['курсы', 'сертификаты', 'тренинги'] },
        skills: { prefix: ['ключевые навыки', 'навыки и умения', 'технологический стек', 'стек технологий', 'hard skills', 'soft skills'], exact: ['навыки', 'умения', 'компетенции', 'технологии'] },
        languages: { prefix: ['знание языков', 'иностранные языки', 'языки общения', 'languages'], exact: ['языки'] },
        refs: { prefix: [], exact: ['рекомендации', 'рекомендатели', 'references'] },
        skip: { prefix: ['комментарии к резюме', 'история общения'], exact: ['комментарии'] },
        docs: { prefix: [], exact: ['гражданство, время в пути до работы'] },
        extra: { prefix: ['дополнительная информация', 'личные качества'], exact: ['дополнительно', 'о себе', 'интересы', 'хобби'] }
    };

    function detectSection(line) {
        var lower = line.toLowerCase().replace(/[:;.]\s*$/, '').trim();
        if (!lower) return null;
        var keys = Object.keys(SECTION_HEADERS);
        for (var i = 0; i < keys.length; i++) {
            var sec = SECTION_HEADERS[keys[i]];
            for (var j = 0; j < sec.exact.length; j++) {
                if (lower === sec.exact[j]) return keys[i];
            }
            for (var k = 0; k < sec.prefix.length; k++) {
                if (lower.indexOf(sec.prefix[k]) === 0) return keys[i];
            }
        }
        return null;
    }

    lines.forEach(function(line) {
        var det = detectSection(line);
        if (det) {
            if (det === 'experience' && !model.totalExperience) {
                var detDur = hhParseDuration(line);
                if (detDur) model.totalExperience = detDur;
            }
            section = det;
            return;
        }

        if (section === 'header') {
            var hlower = line.toLowerCase();
            if (!model.name && !/\d|@/.test(line) && line.length < 60 && !/резюме|обновлено|curriculum| vitae/.test(hlower)) { model.name = line; return; }
            if (/^(мужчина|женщина)/.test(hlower)) { model.personal = model.personal || line; return; }
            if (/родил|дата рожд/.test(hlower)) { model.personal = model.personal ? model.personal + ', ' + line : line; return; }
            if (/прожива|место жительств|адрес|город:/.test(hlower)) { model.city = model.city || line.replace(/^[^:：]*[:：]\s*/, ''); return; }
            if (hhIsCity(line)) { model.city = model.city || line; return; }
            if (/активно\s+ищет|предложили\s+работу|рассматривае\w*\s+предложени/.test(hlower)) { model.jobStatus = model.jobStatus || hhDetectJobStatus(line); return; }
            if (/гражданство|разрешение\s+на\s+работу/.test(hlower)) {
                var cm = line.match(/гражданство\s*[:：]\s*([^,;]+)/i);
                if (cm) model.citizenship = model.citizenship || cm[1].trim();
                var wm = line.match(/разрешение\s+на\s+работу\s*[:：]?\s*([^,;]+)/i);
                if (wm) model.workPermit = model.workPermit || wm[1].trim();
                return;
            }
            if (/переезд|командиров/.test(hlower)) {
                if (!model.relocate) model.relocate = line;
                else if (model.relocate !== line) model.relocate += '\n' + line;
                return;
            }
            if (/руб|₽|\$|€|зарплата|оклад/.test(hlower)) { model.salary = model.salary || hhExtractSalary(line); return; }
            return;
        }

        if (section === 'cover') {
            model.coverLetter = model.coverLetter ? model.coverLetter + ' ' + line : line;
            return;
        }

        if (section === 'desired') {
            var dlower = line.toLowerCase();
            if (/руб|₽|\$|€|зарплата/.test(dlower)) { model.salary = model.salary || hhExtractSalary(line); return; }
            if (/время\s+в\s+пути/.test(dlower)) { model.commuteTime = model.commuteTime || hhParseCommute(line); return; }
            if (/формат\s+работы|удалён|удален|гибрид|на\s+месте\s+работодатель/.test(dlower)) {
                hhDetectWorkFormat(line).forEach(function(f) {
                    if (model.workFormat.indexOf(f) === -1) model.workFormat.push(f);
                });
                return;
            }
            if (/тип\s+занятости|занятость|график|полный|неполный|смен/.test(dlower)) { model.employment = line; return; }
            if (!model.jobTitle) { model.jobTitle = line; return; }
            if (!model.sphere) { model.sphere = line; return; }
            // hh.ru lists specializations under the desired position; collect them.
            if (line.length > 2 && line.length < 60 && !/\d|[.!?]/.test(line) && !/:$|—/.test(line) &&
                model.specializations.indexOf(line) === -1) {
                model.specializations.push(line);
            }
            return;
        }

        if (section === 'experience') {
            var range = hhParseDateRangeLine(line);
            if (range) {
                curJob = { start: range.start, end: range.end, duration: '', company: '', city: '', sphere: '', position: '', description: [] };
                model.jobs.push(curJob);
                return;
            }
            var dur = hhParseDuration(line);
            if (dur) {
                if (curJob && !curJob.duration) { curJob.duration = dur; return; }
                if (!curJob) { model.totalExperience = model.totalExperience || dur; return; }
            }
            if (!curJob) { expPreamble.push(line); return; }
            if (!curJob.company) { curJob.company = line; return; }
            if (!curJob.city) {
                var dashIdx = line.indexOf(' — ');
                if (dashIdx !== -1 && hhIsCity(line.substring(0, dashIdx))) {
                    curJob.city = line.substring(0, dashIdx);
                    var afterCity = line.substring(dashIdx + 3).trim();
                    if (afterCity && !curJob.sphere) curJob.sphere = afterCity;
                    return;
                }
                if (hhIsCity(line) || (!/\d|[()«»]/.test(line) && line.length < 25 && !/,/.test(line))) { curJob.city = line; return; }
            }
            if (!curJob.sphere && !curJob.position && curJob.description.length === 0 && /,/.test(line) && line.length < 70 && !/[.!?]/.test(line)) { curJob.sphere = line; return; }
            if (!curJob.position) { curJob.position = line; return; }
            var lastDesc = curJob.description.length ? curJob.description[curJob.description.length - 1] : null;
            if (lastDesc && !/[.!?…»"]$/.test(lastDesc) && !hhIsAchievementLine(line) && /^[а-яёa-z(«"•]/i.test(line)) {
                curJob.description[curJob.description.length - 1] = lastDesc + ' ' + line;
            } else {
                curJob.description.push(line);
            }
            return;
        }

        if (section === 'education') {
            if (/^\d{4}(-\d{4})?$/.test(line)) {
                model.education.push({ year: line, place: '', faculty: '' });
                return;
            }
            var last = model.education.length ? model.education[model.education.length - 1] : null;
            if (!last) { model.education.push({ year: '', place: line, faculty: '' }); return; }
            if (!last.place) { last.place = line; return; }
            if (!last.faculty) { last.faculty = line; return; }
            last.faculty += ' ' + line;
            return;
        }

        if (section === 'courses') {
            if (/^\d{4}$/.test(line)) {
                model.courses.push({ year: line, title: '', org: '' });
                return;
            }
            var lc = model.courses.length ? model.courses[model.courses.length - 1] : null;
            if (!lc) { model.courses.push({ year: '', title: line, org: '' }); return; }
            if (!lc.title) { lc.title = line; return; }
            if (!lc.org) { lc.org = line; return; }
            lc.org += ' ' + line;
            return;
        }

        if (section === 'languages') {
            var lang = hhParseLanguage(line);
            if (lang) model.languages.push(lang);
            return;
        }

        if (section === 'skills') {
            if (/^уровни\s+владения\s+навыками/.test(line.toLowerCase())) return;
            var tierM = line.match(/^(продвинутый\s+уровень|средний\s+уровень|базовый\s+уровень)\s*[:：]\s*(.*)$/i);
            if (tierM) {
                skillsTier = tierM[1].toLowerCase() === 'продвинутый уровень' ? 'Продвинутый уровень'
                    : tierM[1].toLowerCase() === 'базовый уровень' ? 'Базовый уровень' : 'Средний уровень';
                line = tierM[2];
            }
            if (line.length > 80) {
                if (line.length < 250 && model.skills.indexOf(line) === -1) model.skills.push(line);
                return;
            }
            line.split(/[,••]+/).forEach(function(part) {
                var t = part.replace(/^[-\s•]+|[\s•]+$/g, '').trim();
                if (!t || t.length < 2 || t.length > 80) return;
                if (/^\[укажите/i.test(t)) return;
                if (model.skills.indexOf(t) === -1) model.skills.push(t);
                if (skillsTier) model.skillLevels[t.toLowerCase()] = skillsTier;
            });
            return;
        }

        if (section === 'refs') {
            var phoneM = line.match(/\(?\+?\d[\d\s\-()]{6,}\d/);
            var posM = line.match(/\(([^)]+)\)/);
            var isOrg = /ООО|ЗАО|ПАО|АО |ИП |компания|«|»/i.test(line) || (!/\(/.test(line) && !/\d/.test(line) && curRef && curRef.name);
            if (isOrg && !phoneM) {
                curRef = { org: line, name: '', position: '', phone: '' };
                model.references.push(curRef);
                return;
            }
            var name = line.replace(/\([^)]*\)/g, '').replace(/\(?\+?\d[\d\s\-()]{4,}\d/g, '').replace(/[.·,]/g, ' ').replace(/\s+/g, ' ').trim();
            if (!curRef) { curRef = { org: '', name: '', position: '', phone: '' }; model.references.push(curRef); }
            if (!curRef.name && name) { curRef.name = name; curRef.position = posM ? posM[1] : ''; curRef.phone = phoneM ? phoneM[0] : ''; return; }
            if (!curRef.org) { curRef.org = line; return; }
            return;
        }

        if (section === 'extra') { model.extra.push(line); return; }
        if (section === 'docs') {
            var dlower2 = line.toLowerCase();
            if (/гражданство/.test(dlower2)) { model.citizenship = model.citizenship || line.replace(/^[^:：]*[:：]\s*/, ''); return; }
            if (/разрешение\s+на\s+работу/.test(dlower2)) { model.workPermit = model.workPermit || line.replace(/^[^:：]*[:：]\s*/, ''); return; }
            if (/время\s+в\s+пути/.test(dlower2)) { model.commuteTime = model.commuteTime || hhParseCommute(line); return; }
            return;
        }
        // section === 'skip' — employer-side notes, ignore
    });

    if (expPreamble.length && !model.jobs.length) {
        model.jobs.push({ start: null, end: null, duration: '', company: '', city: '', sphere: '', position: expPreamble[0], description: expPreamble.slice(1) });
    }

    hhEnrichModel(model);

    // "Конкретные достижения" — a top hh.ru resume shows a measurable result
    // for every job, so the model itself guarantees one per job.
    model.jobs.forEach(function(job) {
        var ach = hhEnsureJobAchievements(job);
        if (ach) {
            job.description = (job.description || []).concat([ach]);
            job.autoAchievement = true;
        }
    });

    return model;
}

function hhTotalMonths(model) {
    var total = 0;
    var now = new Date();
    model.jobs.forEach(function(job) {
        if (!job.start || !job.end) return;
        if (job.end.present) total += (now.getFullYear() - job.start.year) * 12 + (now.getMonth() - job.start.month);
        else total += (job.end.year - job.start.year) * 12 + (job.end.month - job.start.month);
    });
    return total;
}

// Builds the ordered list of [style, text, blank-line-before] rows for the
// full hh.ru top-resume layout. Both renderers use it so the plain and the RTF
// output can never drift apart.
function hhBuildRows(model) {
    hhEnrichModel(model);
    var m = model || {};
    var rows = [];
    function add(style, text, br) {
        var s = text === null || text === undefined ? '' : String(text);
        var trimmed = s.replace(/\s+$/g, '');
        if (!trimmed.length) return;
        rows.push([style, trimmed, br ? 1 : 0]);
    }

    add('name', m.name || '[Укажите ФИО]');
    add('body', m.personal);
    add('body', m.jobStatus || 'Активно ищет работу');
    add('body', m.phone);
    add('body', m.email);
    add('body', hhFormatRelocate(m));
    add('body', m.relocateNote);

    if (m.coverLetter) {
        add('head', 'Сопроводительное письмо', true);
        add('body', m.coverLetter);
    }

    if (m.jobTitle || m.sphere || m.salary || m.specializations.length) {
        add('head', 'Желаемая должность и зарплата', true);
        add('body', m.jobTitle);
        add('body', hhSalaryHandsLine(m.salary));
        if (m.specializations.length) {
            add('label', 'Специализации:');
            for (var i = 0; i < m.specializations.length; i++) add('body', m.specializations[i]);
        }
        add('body', 'Тип занятости: ' + (m.employment || 'полная занятость'));
        add('body', 'Формат работы: ' + (m.workFormat || []).join(', '));
    }

    if (m.jobs.length) {
        add('head', 'Опыт работы', true);
        if (m.totalExperience) add('body', m.totalExperience);
        m.jobs.forEach(function(job) {
            var period = job.start ? hhFormatPeriod(job) : '[Укажите период работы]';
            var dur = job.duration;
            if (!dur && job.start && job.end) {
                var months = 0;
                if (job.end.present) { var n = new Date(); months = (n.getFullYear() - job.start.year) * 12 + (n.getMonth() - job.start.month); }
                else months = (job.end.year - job.start.year) * 12 + (job.end.month - job.start.month);
                dur = hhFormatDuration(months);
            }
            add('period', period + (dur ? '\n' + dur : ''), true);
            add('company', job.company);
            add('city', job.city);
            add('body', job.sphere);
            add('position', job.position);
            (job.description || []).forEach(function(d) { add('body', d); });
        });
    }

    if (m.skills.length) {
        add('head', 'Навыки', true);
        add('label', 'Уровни владения навыками');
        for (var t = 0; t < HH_SKILL_TIERS.length; t++) {
            var tier = HH_SKILL_TIERS[t];
            var names = [];
            for (var si = 0; si < m.skills.length; si++) {
                var key = String(m.skills[si]).toLowerCase();
                if ((m.skillLevels || {})[key] === tier) names.push(m.skills[si]);
            }
            add('body', tier + ': ' + (names.length ? names.join(', ') : HH_SKILL_TIER_EMPTY[tier]));
        }
    }

    if (m.education.length) {
        add('head', 'Высшее образование', true);
        m.education.forEach(function(ed) {
            if (ed.year) add('body', ed.year);
            if (ed.place) add('body', ed.place);
            if (ed.faculty) add('body', ed.faculty);
        });
    }

    if (m.courses.length) {
        add('head', 'Повышение квалификации, курсы', true);
        m.courses.forEach(function(c) {
            if (c.year) add('body', c.year);
            if (c.title) add('body', c.title);
            if (c.org) add('body', c.org);
        });
    }

    add('head', 'Знание языков', true);
    if (m.languages.length) {
        m.languages.forEach(function(l) { add('body', hhFormatLanguage(l)); });
    } else {
        add('body', 'Русский — Родной');
    }

    add('head', 'Гражданство, время в пути до работы', true);
    add('body', 'Гражданство: ' + (m.citizenship || '[Укажите гражданство]'));
    if (m.workPermit) add('body', 'Разрешение на работу: ' + m.workPermit);
    add('body', 'Желательное время в пути до работы: ' + (m.commuteTime || 'Не имеет значения'));

    if (m.extra.length || m.references.length) {
        add('head', 'Дополнительная информация', true);
        m.extra.forEach(function(e) { add('body', e); });
        if (m.references.length) {
            add('label', 'Рекомендации');
            m.references.forEach(function(r) {
                if (r.org) add('body', r.org);
                if (r.name) add('body', r.name + (r.position ? ' (' + r.position + ')' : '') + (r.phone ? '. ' + r.phone : ''));
            });
        }
    }

    return rows;
}

function renderHHResume(model) {
    var rows = hhBuildRows(model);
    var out = [];
    for (var i = 0; i < rows.length; i++) {
        if (rows[i][2]) out.push('');
        out.push(rows[i][1]);
    }
    return out.join('\n');
}

// ===================== hh.ru RTF EXPORT =====================
// Layout mirrors the hh.ru resume export (see 12044770.rtf): Arial everywhere,
// 12pt for the name / company / position, 11pt bold gray section titles with a
// thin bottom rule, 9pt body, 8pt dark-gray labels for periods and durations.
var HH_RTF_FONTTABLE = '{\\fonttbl{\\f0\\froman\\fcharset204 Times New Roman;}{\\f1\\fswiss\\fcharset204 Arial;}}';
var HH_RTF_COLORTBL = '{\\colortbl;\\red0\\green0\\blue0;\\red0\\green0\\blue255;\\red0\\green255\\blue255;' +
    '\\red0\\green255\\blue0;\\red255\\green0\\blue255;\\red255\\green0\\blue0;\\red255\\green255\\blue0;' +
    '\\red255\\green255\\blue255;\\red0\\green0\\blue128;\\red0\\green128\\blue128;\\red0\\green128\\blue0;' +
    '\\red128\\green0\\blue128;\\red128\\green0\\blue0;\\red128\\green128\\blue0;\\red128\\green128\\blue128;' +
    '\\red192\\green192\\blue192;\\red174\\green174\\blue174;\\red255\\green255\\blue255;' +
    '\\red216\\green216\\blue216;\\red112\\green112\\blue112;\\red188\\green188\\blue188;}';
var HH_RTF_RUN = {
    name: '\\f1\\fs24',
    head: '\\f1\\fs22\\b\\cf17',
    period: '\\f1\\fs16\\cf20',
    company: '\\f1\\fs24\\b',
    position: '\\f1\\fs24',
    city: '\\f1\\fs18\\cf17',
    body: '\\f1\\fs18',
    label: '\\f1\\fs16\\cf20'
};
var HH_RTF_PAR = {
    name: '\\pard\\sb0\\sa40\\sl240\\slmult0',
    head: '\\pard\\sb500\\sa150\\brdrb\\brdrs\\brdrw15\\brdrcf19',
    period: '\\pard\\sb80\\sa40\\sl220\\slmult0',
    company: '\\pard\\sb80\\sa40\\sl280\\slmult0',
    position: '\\pard\\sb40\\sa40\\sl280\\slmult0',
    city: '\\pard\\sb0\\sa40\\sl260\\slmult0',
    body: '\\pard\\sb0\\sa80\\sl260\\slmult0',
    label: '\\pard\\sb120\\sa40\\sl220\\slmult0'
};

// Escapes RTF control characters and writes every non-ASCII symbol as a cp1251
// \'XX escape (matching \ansicpg1251), falling back to \uN? outside cp1251.
function rtfEscapeText(s) {
    var str = String(s === null || s === undefined ? '' : s);
    var out = '';
    for (var i = 0; i < str.length; i++) {
        var ch = str.charAt(i);
        if (ch === '\\' || ch === '{' || ch === '}') { out += '\\' + ch; continue; }
        var code = str.charCodeAt(i);
        if (code < 0x80) { out += ch; continue; }
        var b = unicodeToCp1251(code);
        if (b >= 0) out += "\\'" + (b < 16 ? '0' : '') + b.toString(16).toUpperCase();
        else out += '\\u' + code + '?';
    }
    return out;
}

function renderHHResumeRTF(model) {
    var rows = hhBuildRows(model);

    function emit(row) {
        var style = row[0];
        var par = HH_RTF_PAR[style] || HH_RTF_PAR.body;
        var run = HH_RTF_RUN[style] || HH_RTF_RUN.body;
        var segs = String(row[1]).split('\n');
        var s = par + ' {' + run + ' ';
        for (var k = 0; k < segs.length; k++) {
            if (k > 0) s += '\\line ';
            s += rtfEscapeText(segs[k]);
        }
        return s + '\\par}';
    }

    var doc = [];
    doc.push('{\\rtf1\\ansi\\ansicpg1251\\uc1\\deff0\\deflang1049\\langfe1049');
    doc.push(HH_RTF_FONTTABLE);
    doc.push(HH_RTF_COLORTBL);
    doc.push('\\paperw11906\\paperh16838\\margl1134\\margr1134\\margt1134\\margb1134\\widowctrl\\ftnbj\\aenddoc');
    var footName = rtfEscapeText(String((model && model.name) || '').trim());
    doc.push('{\\footer\\pard\\qr\\sa200\\f1\\fs16\\cf21 ' + (footName ? footName + ' \\bullet  ' : '') + '\\chpgn\\par}');
    doc.push('\\pard\\plain\\f1\\fs18\\lang1049\\langfe1049\\sa200\\sl276\\slmult1');
    for (var r = 0; r < rows.length; r++) doc.push(emit(rows[r]));
    doc.push('}');
    return doc.join('\n');
}

function processHHResume(resumeText, jobTitle, mode) {
    var model = parseToHHModel(resumeText);
    var changes = [];

    if (jobTitle && (!model.jobTitle || model.jobTitle.toLowerCase() !== jobTitle.toLowerCase())) {
        model.jobTitle = jobTitle;
        changes.push({ type: 'add', text: 'Указана желаемая должность: ' + jobTitle });
        hhEnrichModel(model);
    }

    // Log the per-job measurable achievements the model guaranteed.
    model.jobs.forEach(function(job) {
        if (!job.autoAchievement) return;
        delete job.autoAchievement;
        var last = (job.description || []).slice(-1)[0] || '';
        changes.push({ type: 'add', text: 'Добавлено конкретное достижение' + (job.company ? ' (' + job.company + ')' : '') + ': ' + last });
    });

    if (!model.totalExperience) {
        var total = hhTotalMonths(model);
        model.totalExperience = hhFormatDuration(total);
        if (total > 0) changes.push({ type: 'modify', text: 'Рассчитан общий стаж на основе дат мест работы: ' + model.totalExperience });
    }

    if (mode === 'optimize') {
        var passiveFixes = detectWeakPhrases(resumeText);
        var jobKeywords = extractJobKeywords(jobTitle || model.jobTitle);
        model.jobs.forEach(function(job) {
            job.description = (job.description || []).map(function(line) {
                var nl = rewriteLine(line, jobKeywords, passiveFixes);
                if (nl !== line) changes.push({ type: 'modify', text: 'Заменён слабый глагол: «' + line.substring(0, 50) + '»' });
                return nl;
            });
        });
        var optSkills = model.skills.length === 0 ? extractSkills(resumeText) : [];
        optSkills.forEach(function(s) {
            if (s.length > 3 && model.skills.indexOf(s) === -1 && model.skills.length < 25) {
                model.skills.push(s);
                changes.push({ type: 'add', text: 'Добавлен навык из текста резюме: ' + s });
            }
        });
    }

    if (mode === 'tailor' && (jobTitle || model.jobTitle)) {
        var kw = extractJobKeywords(jobTitle || model.jobTitle);
        if (model.skills.length && kw.length) {
            model.skills.sort(function(a, b) {
                var ai = kw.some(function(k) { return a.toLowerCase().indexOf(k.toLowerCase()) !== -1; }) ? 0 : 1;
                var bi = kw.some(function(k) { return b.toLowerCase().indexOf(k.toLowerCase()) !== -1; }) ? 0 : 1;
                return ai - bi;
            });
            changes.push({ type: 'modify', text: 'Навыки упорядочены по релевантности должности' });
        }
        if (jobTitle) changes.push({ type: 'modify', text: 'Резюме персонализировано под позицию: ' + jobTitle });
    }

    if (mode === 'rewrite' || mode === 'standardize') {
        var allSkills = model.skills.length === 0 ? extractSkills(resumeText) : [];
        allSkills.forEach(function(s) {
            if (s.length > 3 && model.skills.indexOf(s) === -1 && model.skills.length < 25) model.skills.push(s);
        });
    }

    var issues = analyzeWeaknesses(resumeText, jobTitle || model.jobTitle);
    issues.forEach(function(issue) {
        changes.push({ type: 'add', text: 'Рекомендация: ' + issue.detail });
    });

    if (!model.languages.length) changes.push({ type: 'add', text: 'Добавлен раздел «Знание языков» (русский — родной)' });
    changes.push({ type: 'add', text: 'Указан статус поиска: ' + model.jobStatus });
    changes.push({ type: 'modify', text: 'Зарплата приведена к виду hh.ru «на руки»: ' + (hhSalaryHandsLine(model.salary) || '[Укажите зарплату]') });
    changes.push({ type: 'add', text: 'Добавлены специализации (' + model.specializations.length + '), тип занятости и формат работы' });
    changes.push({ type: 'modify', text: 'Навыки распределены по уровням владения hh.ru: Продвинутый / Средний / Базовый уровень' });
    changes.push({ type: 'modify', text: 'Резюме приведено к полному формату топ-резюме hh.ru: контакты, переезд и командировки, желаемая должность и зарплата «на руки», специализации, тип занятости, формат работы, опыт работы с периодами и достижениями, навыки с уровнями, образование, курсы, языки, гражданство и желательное время в пути, рекомендации' });

    return { resume: renderHHResume(model), changes: changes };
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
            try {
                updateUserBalance(currentUser.email, -COST_PER_REQUEST);
                updateAuthUI();
            } catch (balErr) {
                console.warn('Balance update failed:', balErr);
            }
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
    if (format === 'pdf') { downloadResultPDF(); return; }
    if (format === 'doc') { downloadResultDoc(); return; }
    var content = lastResult;
    var mime = format === 'md' ? 'text/markdown' : 'text/plain';
    if (format === 'rtf') {
        try {
            content = renderHHResumeRTF(parseToHHModel(lastResult));
        } catch (e) {
            showToast('\u041e\u0448\u0438\u0431\u043a\u0430 \u0444\u043e\u0440\u043c\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u044f RTF: ' + (e && e.message || e), 'error');
            return;
        }
        mime = 'application/rtf';
    }
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'resume_enhanced.' + format;
    a.click();
    URL.revokeObjectURL(url);
    showToast('\u0424\u0430\u0439\u043b \u0441\u043a\u0430\u0447\u0430\u043d!', 'success');
}

function escapeHtml(s) {
    return String(s === null || s === undefined ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// DOC для Word: тот же шаблон hh.ru (как 12044770.rtf / renderHHResumeRTF),
// но в виде Word-HTML — открывается в Word и LibreOffice без потери структуры.
function buildDocHtml(model) {
    var rows = hhBuildRows(model);
    var html = [];
    rows.forEach(function(row) {
        var style = row[0], text = escapeHtml(row[1]).replace(/\n/g, '<br>');
        if (!text) return;
        if (style === 'name') html.push('<p style="font-size:18pt;font-weight:bold;margin:0 0 4pt 0;font-family:Arial">' + text + '</p>');
        else if (style === 'head') html.push('<h2 style="font-size:12pt;color:#444;margin:16pt 0 6pt 0;border-bottom:1px solid #999;font-family:Arial">' + text + '</h2>');
        else if (style === 'company') html.push('<p style="font-size:12pt;font-weight:bold;margin:8pt 0 0 0;font-family:Arial">' + text + '</p>');
        else if (style === 'position') html.push('<p style="font-size:12pt;margin:0 0 4pt 0;font-family:Arial">' + text + '</p>');
        else if (style === 'period' || style === 'label') html.push('<p style="font-size:9pt;color:#555;margin:4pt 0 0 0;font-family:Arial">' + text + '</p>');
        else if (style === 'city') html.push('<p style="font-size:9pt;color:#444;margin:0 0 4pt 0;font-family:Arial">' + text + '</p>');
        else html.push('<p style="font-size:10pt;margin:0 0 4pt 0;font-family:Arial">' + text + '</p>');
    });
    return '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>Resume</title></head><body>' + html.join('') + '</body></html>';
}

function downloadResultDoc() {
    try {
        var model = parseToHHModel(lastResult);
        var html = buildDocHtml(model);
        var blob = new Blob(['\ufeff' + html], { type: 'application/msword' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'resume_enhanced.doc';
        a.click();
        URL.revokeObjectURL(url);
        showToast('Файл скачан!', 'success');
    } catch (e) {
        showToast('Ошибка формирования DOC: ' + (e && e.message || e), 'error');
    }
}

function downloadResultPDF() {
    try {
        var model = parseToHHModel(lastResult);
        var html = buildDocHtml(model);
        var w = window.open('', '_blank');
        if (!w) { showToast('Разрешите всплывающие окна для PDF', 'error'); return; }
        w.document.write(html);
        w.document.close();
        w.focus();
        setTimeout(function() { w.print(); }, 500);
        showToast('Выберите «Сохранить как PDF» в окне печати', 'info');
    } catch (e) {
        showToast('Ошибка формирования PDF: ' + (e && e.message || e), 'error');
    }
}

// ===================== FORM -> FILE =====================
// Пошаговая анкета: пользователь вписывает свои данные, файл собирается
// по шаблону hh.ru (тот же hhBuildRows/renderHHResumeRTF, что повторяет
// 12044770.rtf). Что не вписано — придумывает подключенная нейросеть
// по профессии (callAI / Atria), без ключа — локальный демо-движок.
function getFormVal(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
}

function collectFormData() {
    return {
        fullName: getFormVal('f_fullName'),
        birth: getFormVal('f_birth'),
        phone: getFormVal('f_phone'),
        email: getFormVal('f_email'),
        city: getFormVal('f_city'),
        citizenship: getFormVal('f_citizenship'),
        profession: getFormVal('f_profession') || getFormVal('jobTitle'),
        salary: getFormVal('f_salary'),
        employment: getFormVal('f_employment'),
        experience: getFormVal('f_experience'),
        skills: getFormVal('f_skills'),
        education: getFormVal('f_education'),
        courses: getFormVal('f_courses'),
        languages: getFormVal('f_languages'),
        extra: getFormVal('f_extra')
    };
}

function buildDraftFromForm(d) {
    var lines = [];
    if (d.fullName) lines.push(d.fullName);
    if (d.birth) lines.push(d.birth);
    if (d.phone) lines.push(d.phone);
    if (d.email) lines.push(d.email);
    if (d.city) lines.push(d.city);
    if (d.citizenship) lines.push('Гражданство: ' + d.citizenship);
    lines.push('');
    lines.push('Желаемая должность');
    lines.push(d.profession);
    if (d.salary) lines.push(d.salary);
    if (d.employment) lines.push(d.employment);
    if (d.experience) { lines.push(''); lines.push('Опыт работы'); lines.push(d.experience); }
    if (d.skills) { lines.push(''); lines.push('Навыки'); lines.push(d.skills); }
    if (d.education) { lines.push(''); lines.push('Образование'); lines.push(d.education); }
    if (d.courses) { lines.push(''); lines.push('Курсы'); lines.push(d.courses); }
    if (d.languages) { lines.push(''); lines.push('Языки'); lines.push(d.languages); }
    if (d.extra) { lines.push(''); lines.push('Дополнительная информация'); lines.push(d.extra); }
    return lines.join('\n');
}

function formMissingList(d) {
    var missing = [];
    if (!d.fullName) missing.push('ФИО');
    if (!d.phone) missing.push('телефон');
    if (!d.email) missing.push('email');
    if (!d.city) missing.push('город');
    if (!d.salary) missing.push('зарплату');
    if (!d.experience) missing.push('опыт работы (должности, обязанности, достижения)');
    if (!d.skills) missing.push('навыки');
    if (!d.education) missing.push('образование');
    if (!d.courses) missing.push('курсы');
    if (!d.languages) missing.push('языки');
    if (!d.extra) missing.push('доп. информацию');
    return missing;
}

// ИИ-дозаполнение по профессии для анкеты: сохраняет ВСЕ введенные данные,
// недостающее генерирует реалистично под профессию.
async function callAIForForm(draft, profession, missing) {
    var mode = getSelectedPromptMode();
    var basePrompt = buildSystemPrompt(mode, profession, selectedPlatform);
    var extra = '\n\nFORM MODE: The user filled a step-by-step form. Draft resume below contains ONLY user-provided facts. '
        + 'You MUST keep every user-provided fact exactly (name, phone, email, city, salary, companies, dates). '
        + 'Target profession: ' + profession + '. '
        + 'Missing fields the user did NOT fill: ' + (missing.length ? missing.join(', ') : 'none') + '. '
        + 'Invent realistic content ONLY for those missing fields, tailored to the profession «' + profession + '». '
        + 'Never overwrite user data with invented data. Output in the SAME language as the draft (Russian).';
    var userMessage = 'Resume draft from form (user facts, keep them):\n\n' + draft
        + '\n\nTarget position: ' + profession + '\n\nPlatform: ' + selectedPlatform;
    var url = '', model = '', extraHeaders = {};
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
            messages: [{ role: 'system', content: basePrompt + extra }, { role: 'user', content: userMessage }],
            temperature: 0.7,
            max_tokens: 4000
        })
    });
    if (!response.ok) throw new Error('API Error: ' + response.status);
    var data = await response.json();
    return parseAIResponse(data.choices[0].message.content);
}

function displayEnhanceResult(result) {
    lastResult = result.resume;
    lastChanges = result.changes;
    setATSScore(result.score);
    document.getElementById('tabResumeContent').textContent = result.resume;
    var changesHtml = '';
    (result.changes || []).forEach(function(c) {
        var cls = c.type === 'add' ? 'change-add' : c.type === 'remove' ? 'change-remove' : 'change-modify';
        var icon = c.type === 'add' ? 'plus-circle' : c.type === 'remove' ? 'minus-circle' : 'pencil';
        var color = c.type === 'add' ? 'text-neon-emerald' : c.type === 'remove' ? 'text-red-400' : 'text-yellow-400';
        changesHtml += '<div class="change-item ' + cls + '"><div class="flex items-start gap-2"><i data-lucide="' + icon + '" class="w-4 h-4 mt-0.5 flex-shrink-0 ' + color + '"></i><div><p class="text-sm text-gray-300">' + escapeHtml(c.text) + '</p></div></div></div>';
    });
    document.getElementById('tabChangesContent').innerHTML = changesHtml;
    lucide.createIcons();
    switchTab('resume');
    document.getElementById('skeletonLoader').classList.add('hidden');
    document.getElementById('tabResumeContent').classList.remove('hidden');
    document.getElementById('actionButtons').classList.remove('hidden');
    var col = document.getElementById('resultColumn');
    if (col && col.scrollIntoView) col.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function generateFromForm() {
    var d = collectFormData();
    if (!d.profession) { showToast('Укажите профессию — по ней ИИ допишет недостающее', 'error'); return; }
    if (!d.fullName && !d.phone && !d.email && !d.experience && !d.skills) {
        showToast('Заполните хотя бы 1-2 поля кроме профессии', 'error'); return;
    }
    if (isProcessing) return;
    if (currentUser && !isAdmin()) {
        var balance = getUserBalance(currentUser.email);
        if (balance < COST_PER_REQUEST) {
            showToast('Недостаточно средств. Нужно ' + COST_PER_REQUEST + ' ₽, баланс: ' + balance + ' ₽', 'error');
            openPaymentModal();
            return;
        }
    } else if (!currentUser) {
        showToast('Войдите или зарегистрируйтесь для доступа', 'error');
        openAuthModal('login');
        return;
    }
    isProcessing = true;
    var btn = document.getElementById('formGenerateBtn');
    var oldHtml = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = 'Генерация файла...'; }
    document.getElementById('tabPlaceholder').classList.add('hidden');
    document.getElementById('skeletonLoader').classList.remove('hidden');
    document.getElementById('tabResumeContent').classList.add('hidden');
    document.getElementById('tabChangesContent').classList.add('hidden');
    document.getElementById('actionButtons').classList.add('hidden');
    try {
        var draft = buildDraftFromForm(d);
        var missing = formMissingList(d);
        var result;
        if (apiKey) {
            try {
                result = await callAIForForm(draft, d.profession, missing);
            } catch (apiErr) {
                console.warn('API call failed, falling back to demo:', apiErr);
                showToast('API недоступен (сервер CORS). Используется локальный анализ.', 'info');
                result = await generateDemoResult(draft, d.profession);
            }
        } else {
            result = await generateDemoResult(draft, d.profession);
        }
        if (currentUser && !isAdmin()) {
            try { updateUserBalance(currentUser.email, -COST_PER_REQUEST); updateAuthUI(); } catch (balErr) { console.warn('Balance update failed:', balErr); }
        }
        // Помечаем, что сгенерировано из анкеты и что дописал ИИ
        result.changes = (result.changes || []).concat(missing.map(function(m) {
            return { type: 'add', text: 'ИИ сгенерировал по профессии «' + d.profession + '»: ' + m };
        }));
        displayEnhanceResult(result);
        showToast('Файл готов! Скачайте RTF / DOC / PDF ниже', 'success');
    } catch (err) {
        console.error(err);
        document.getElementById('skeletonLoader').classList.add('hidden');
        document.getElementById('tabPlaceholder').classList.remove('hidden');
        showToast('Ошибка: ' + err.message, 'error');
    } finally {
        isProcessing = false;
        if (btn) { btn.disabled = false; btn.innerHTML = oldHtml; lucide.createIcons({ nodes: [btn] }); }
    }
}
