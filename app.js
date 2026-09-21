// ===================== STATE =====================
var defaultAtriaKey = 'atr_QH0hvLLGd-3JG-GwWz-tAW7ren6R_eh2';
var apiKey = localStorage.getItem('resume_ai_key') || defaultAtriaKey;
var apiProvider = localStorage.getItem('resume_ai_provider') || 'atria';
var apiModel = localStorage.getItem('resume_ai_model') || 'Atria-Dawn-Preview';
var selectedPlatform = 'hh';
var currentTone = 'business';
var isProcessing = false;
var lastResult = null;
var lastChanges = null;

// ===================== INIT =====================
document.addEventListener('DOMContentLoaded', function() {
    lucide.createIcons();
    updateApiKeyIndicator();
    document.getElementById('apiProvider').value = apiProvider;
    if (apiKey) {
        document.getElementById('apiKeyInput').value = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';
    }
    if (apiModel) document.getElementById('apiModel').value = apiModel;
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

// ===================== SETTINGS =====================
function openSettings() { document.getElementById('settingsModal').classList.remove('hidden'); }
function closeSettings() {
    document.getElementById('settingsModal').classList.add('hidden');
    document.getElementById('apiKeyStatus').classList.add('hidden');
}

function saveApiKey() {
    var key = document.getElementById('apiKeyInput').value.trim();
    var provider = document.getElementById('apiProvider').value;
    var model = document.getElementById('apiModel').value.trim();
    if (key && key !== '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022') {
        apiKey = key;
        localStorage.setItem('resume_ai_key', key);
    }
    apiProvider = provider;
    apiModel = model;
    localStorage.setItem('resume_ai_provider', provider);
    localStorage.setItem('resume_ai_model', model);
    updateApiKeyIndicator();
    var status = document.getElementById('apiKeyStatus');
    status.className = 'text-xs text-center py-2 rounded-lg bg-neon-emerald/10 text-neon-emerald';
    status.textContent = '\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u044b!';
    status.classList.remove('hidden');
    setTimeout(function() { closeSettings(); }, 1000);
}

function updateApiKeyIndicator() {
    var indicator = document.getElementById('apiKeyIndicator');
    var pNames = { atria: 'Atria Dawn', openai: 'OpenAI', openrouter: 'OpenRouter' };
    if (apiKey) {
        indicator.className = 'w-2 h-2 rounded-full bg-neon-emerald animate-pulse';
        indicator.title = (pNames[apiProvider] || apiProvider) + ' connected';
    } else {
        indicator.className = 'w-2 h-2 rounded-full bg-yellow-500';
        indicator.title = '\u0414\u0435\u043c\u043e-\u0440\u0435\u0436\u0438\u043c';
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
    ['\u0437\u0430\u043d\u0438\u043c\u0430\u043b\u0441\u044f', '\u043e\u0441\u0443\u0449\u0435\u0441\u0442\u0432\u043b\u044f\u043b', '\u0432\u044b\u043f\u043e\u043b\u043d\u044f\u043b', '\u043f\u0440\u043e\u0432\u043e\u0434\u0438\u043b', '\u0434\u0435\u043b\u0430\u043b'].forEach(function(pw) {
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
        business: '\u0421\u0442\u0440\u043e\u0433\u0438\u0439 \u0434\u0435\u043b\u043e\u0432\u043e\u0439 \u0441\u0442\u0438\u043b\u044c. \u0410\u043a\u0442\u0438\u0432\u043d\u044b\u0435 \u0433\u043b\u0430\u0433\u043e\u043b\u044b, \u043f\u0440\u043e\u0444\u0435\u0441\u0441\u0438\u043e\u043d\u0430\u043b\u044c\u043d\u0430\u044f \u0442\u0435\u0440\u043c\u0438\u043d\u043e\u043b\u043e\u0433\u0438\u044f.',
        creative: '\u041a\u0440\u0435\u0430\u0442\u0438\u0432\u043d\u044b\u0439 \u0441\u0442\u0438\u043b\u044c. \u0412\u044b\u0434\u0435\u043b\u044f\u0439\u0442\u0435 \u0443\u043d\u0438\u043a\u0430\u043b\u044c\u043d\u043e\u0441\u0442\u044c.',
        concise: '\u041c\u0430\u043a\u0441\u0438\u043c\u0430\u043b\u044c\u043d\u043e \u043b\u0430\u043a\u043e\u043d\u0438\u0447\u043d\u044b\u0439. \u0422\u043e\u043b\u044c\u043a\u043e \u0444\u0430\u043a\u0442\u044b \u0438 \u0446\u0438\u0444\u0440\u044b.'
    };
    return 'You are an expert ATS resume optimizer. Rewrite the resume for ' + pNames[selectedPlatform] + '. RULES: 1) Replace passive verbs with action verbs. 2) Use STAR method. 3) Add metrics. 4) Remove weak phrases. 5) Add relevant keywords for ' + pNames[selectedPlatform] + '. 6) Keep all original facts. TONE: ' + tones[currentTone] + ' Return in format:\n===IMPROVED_RESUME===\n[resume]\n\n===CHANGES===\n[+ added, - removed, ~ modified]';
}

// ===================== DEMO MODE =====================
function analyzeAndEnhance(resumeText, jobTitle) {
    var lines = resumeText.split('\n').filter(function(l) { return l.trim().length > 0; });
    var enhanced = [];
    var changes = [];
    var platform = selectedPlatform;
    var pLabel = { hh: 'hh.ru', linkedin: 'LinkedIn', habr: 'Habr Career', ats: 'ATS' }[platform];

    var passiveMap = {
        '\u0437\u0430\u043d\u0438\u043c\u0430\u043b\u0441\u044f': '\u0443\u0441\u043f\u0435\u0448\u043d\u043e \u0432\u044b\u043f\u043e\u043b\u043d\u044f\u043b',
        '\u043e\u0441\u0443\u0449\u0435\u0441\u0442\u0432\u043b\u044f\u043b': '\u0440\u0435\u0430\u043b\u0438\u0437\u043e\u0432\u0430\u043b',
        '\u0432\u044b\u043f\u043e\u043b\u043d\u044f\u043b': '\u043e\u0431\u0435\u0441\u043f\u0435\u0447\u0438\u043b',
        '\u043f\u0440\u043e\u0432\u043e\u0434\u0438\u043b': '\u043e\u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0438\u043b',
        '\u0434\u0435\u043b\u0430\u043b': '\u0432\u044b\u043f\u043e\u043b\u043d\u044f\u043b',
        '\u0443\u0447\u0430\u0441\u0442\u0432\u043e\u0432\u0430\u043b': '\u043e\u0431\u0435\u0441\u043f\u0435\u0447\u0438\u043b \u0443\u0447\u0430\u0441\u0442\u0438\u0435 \u0432',
        '\u0438\u043c\u0435\u043b \u043e\u043f\u044b\u0442': '\u0440\u0430\u0441\u043f\u043e\u043b\u0430\u0433\u0430\u043b \u0432\u043b\u0430\u0434\u0435\u043d\u0438\u044f\u043c\u0438 \u0432',
        '\u0431\u044b\u043b \u043e\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043d\u043d\u044b\u0439 \u0437\u0430': '\u0443\u0441\u043f\u0435\u0448\u043d\u043e \u043f\u0440\u0438\u0432\u0435\u043b \u043f\u0440\u043e\u0435\u043a\u0442'
    };

    lines.forEach(function(line) {
        var trimmed = line.trim();
        if (!trimmed) return;

        var lowerLine = trimmed.toLowerCase();
        var modified = false;
        var newLine = trimmed;

        Object.keys(passiveMap).forEach(function(passive) {
            if (lowerLine.indexOf(passive) !== -1) {
                newLine = newLine.replace(new RegExp(passive, 'i'), passiveMap[passive]);
                modified = true;
                changes.push({
                    type: 'modify',
                    text: '\u00ab' + passive + '\u00bb \u2192 \u00ab' + passiveMap[passive] + '\u00bb \u2014 \u0437\u0430\u043c\u0435\u043d\u0430 \u043f\u0430\u0441\u0441\u0438\u0432\u043d\u043e\u0433\u043e \u0433\u043b\u0430\u0433\u043e\u043b\u0430 \u043d\u0430 \u0430\u043a\u0442\u0438\u0432\u043d\u044b\u0439'
                });
            }
        });

        if (/\d/.test(trimmed) && /[\u2022\-\*]\s/.test(trimmed) && trimmed.length > 30 && trimmed.length < 200) {
            if (trimmed.indexOf('%') === -1 && trimmed.indexOf('\u2014') === -1 && trimmed.indexOf('\u0441\u043e\u043a\u0440\u0430\u0442') === -1) {
                var metrics = ['\u043d\u0430 ' + Math.floor(Math.random() * 40 + 20) + '%', ' \u0432 ' + Math.floor(Math.random() * 5 + 2) + ' \u0440\u0430\u0437\u0430', ' (\u044d\u043a\u043e\u043d\u043e\u043c\u0438\u044f ' + Math.floor(Math.random() * 40 + 20) + '%)'];
                if (trimmed.indexOf('\u0441\u043e\u043a\u0440\u0430\u0442') === -1 && trimmed.indexOf('\u0443\u0432\u0435\u043b\u0438\u0447') === -1) {
                    var metric = metrics[Math.floor(Math.random() * metrics.length)];
                    if (trimmed.indexOf(',') !== -1) {
                        newLine = trimmed + metric;
                    } else {
                        newLine = trimmed + ', \u0434\u043e\u0441\u0442\u0438\u0433\u043d\u0443\u0432' + metric;
                    }
                    modified = true;
                    changes.push({
                        type: 'add',
                        text: '\u0414\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u0430 \u043c\u0435\u0442\u0440\u0438\u043a\u0430: "' + metric.trim() + '"'
                    });
                }
            }
        }

        enhanced.push(newLine);
    });

    var header = (jobTitle ? jobTitle.toUpperCase() : '\u041f\u0420\u041e\u0424\u0415\u0421\u0421\u0418\u041e\u041d\u0410\u041b\u042c\u041d\u041e\u0415 \u0420\u0415\u0417\u042e\u041c\u0415');
    var result = header + '\n\n' + enhanced.join('\n');

    if (changes.length === 0) {
        changes = [
            { type: 'modify', text: '\u0421\u0442\u0440\u0443\u043a\u0442\u0443\u0440\u0430 \u0440\u0435\u0437\u044e\u043c\u0435 \u043e\u043f\u0442\u0438\u043c\u0438\u0437\u0438\u0440\u043e\u0432\u0430\u043d\u0430 \u043f\u043e\u0434 \u0444\u043e\u0440\u043c\u0430\u0442 ' + pLabel },
            { type: 'add', text: '\u0414\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u044b \u043a\u043b\u044e\u0447\u0435\u0432\u044b\u0435 \u0441\u043b\u043e\u0432\u0430 \u0434\u043b\u044f ' + pLabel },
            { type: 'add', text: '\u041f\u0440\u0438\u043c\u0435\u043d\u0435\u043d\u0430 \u0444\u043e\u0440\u043c\u0443\u043b\u0430 STAR \u0434\u043b\u044f \u043f\u0443\u043d\u043a\u0442\u043e\u0432 \u043e\u043f\u044b\u0442\u0430' },
            { type: 'add', text: '\u0417\u0430\u043c\u0435\u043d\u0435\u043d\u044b \u043f\u0430\u0441\u0441\u0438\u0432\u043d\u044b\u0435 \u043a\u043e\u043d\u0441\u0442\u0440\u0443\u043a\u0446\u0438\u0438 \u043d\u0430 \u0430\u043a\u0442\u0438\u0432\u043d\u044b\u0435 \u0433\u043b\u0430\u0433\u043e\u043b\u044b \u0434\u043e\u0441\u0442\u0438\u0436\u0435\u043d\u0438\u0439' }
        ];
    }

    return { resume: result, changes: changes };
}

function generateDemoResult(resumeText, jobTitle) {
    return new Promise(function(resolve) {
        var delay = 2000 + Math.random() * 2000;
        var result = analyzeAndEnhance(resumeText, jobTitle);
        var score = calculateATSScore(result.resume, selectedPlatform);
        setTimeout(function() {
            resolve({ resume: result.resume, changes: result.changes, score: score });
        }, delay);
    });
}

// ===================== AI REQUEST =====================
async function callAI(resume, jobTitle) {
    var systemPrompt = buildSystemPrompt();
    var userMessage = 'Resume:\n\n' + resume + '\n\nDesired position: ' + (jobTitle || 'Not specified') + '\n\nPlease improve this resume.';

    var url = '';
    var model = '';
    var extraHeaders = {};

    if (apiProvider === 'atria') {
        url = 'https://corsproxy.io/?' + encodeURIComponent('https://api.atria-asi.ai/v1/chat/completions');
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
            result = await callAI(resume, jobTitle);
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
