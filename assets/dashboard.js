// ── Theme System ─────────────────────────────────────────────────────────────
// To add a theme:
//   1. Add a CSS block in dashboard.css: html[data-theme="id"] { --var: val; }
//   2. Add an entry in THEMES below.
// Nothing else needed.
const THEMES = [
    { id: 'amber', label: 'Amber Night',  accent: '#C8923A' },
    { id: 'ocean', label: 'Ocean Depths', accent: '#2daaaa' },
    { id: 'dusk',  label: 'Graphite',     accent: '#8b9fc4' },
];

let activeTheme = localStorage.getItem('DASHBOARD_THEME') || 'amber';

function applyTheme(id) {
    activeTheme = id;
    if (id === 'amber') {
        delete document.documentElement.dataset.theme;
    } else {
        document.documentElement.dataset.theme = id;
    }
    localStorage.setItem('DASHBOARD_THEME', id);
    document.querySelectorAll('.theme-opt').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === id);
    });
}

function buildThemePicker() {
    const picker = document.getElementById('themePicker');
    THEMES.forEach(t => {
        const btn = document.createElement('button');
        btn.className = 'theme-opt';
        btn.dataset.theme = t.id;
        const dot = document.createElement('span');
        dot.className = 'theme-dot';
        dot.style.background = t.accent;
        btn.appendChild(dot);
        btn.appendChild(document.createTextNode(t.label));
        btn.addEventListener('click', () => {
            applyTheme(t.id);
            picker.classList.add('hidden');
        });
        picker.appendChild(btn);
    });
}

document.getElementById('themeBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('themePicker').classList.toggle('hidden');
});

document.addEventListener('click', () => {
    document.getElementById('themePicker').classList.add('hidden');
});

buildThemePicker();
applyTheme(activeTheme);

// ── App State ─────────────────────────────────────────────────────────────────
const API_BASE = '/api';
let tmaAuth = '';
let currentEmails = [];
let selectedEmailId = null;
let readIds = new Set(JSON.parse(localStorage.getItem('DASHBOARD_READ_IDS') || '[]'));

const el = {
    loginView:        document.getElementById('loginView'),
    dashboardView:    document.getElementById('dashboardView'),
    loginForm:        document.getElementById('loginForm'),
    apiKeyInput:      document.getElementById('apiKey'),
    loginError:       document.getElementById('loginError'),
    logoutBtn:        document.getElementById('logoutBtn'),
    hdrCount:         document.getElementById('hdrCount'),
    emailSidebar:     document.getElementById('emailSidebar'),
    emailMain:        document.getElementById('emailMain'),
    emailList:        document.getElementById('emailList'),
    refreshBtn:       document.getElementById('refreshBtn'),
    emptyState:       document.getElementById('emptyState'),
    emailDetailView:  document.getElementById('emailDetailView'),
    detailSubject:    document.getElementById('detailSubject'),
    detailFrom:       document.getElementById('detailFrom'),
    detailTo:         document.getElementById('detailTo'),
    detailDate:       document.getElementById('detailDate'),
    detailBody:       document.getElementById('detailBody'),
    deleteBtn:        document.getElementById('deleteBtn'),
    deleteConfirm:    document.getElementById('deleteConfirm'),
    deleteConfirmYes: document.getElementById('deleteConfirmYes'),
    deleteConfirmNo:  document.getElementById('deleteConfirmNo'),
    backBtn:          document.getElementById('backBtn'),
    replyBtn:         document.getElementById('replyBtn'),
    fabCompose:       document.getElementById('fabCompose'),
    composeView:      document.getElementById('composeView'),
    closeComposeBtn:  document.getElementById('closeComposeBtn'),
    composeForm:      document.getElementById('composeForm'),
    composeTo:        document.getElementById('composeTo'),
    composeSubject:   document.getElementById('composeSubject'),
    composeBody:      document.getElementById('composeBody'),
    composeInReplyTo: document.getElementById('composeInReplyTo'),
    composeTitle:     document.getElementById('composeTitle'),
    composeStatus:    document.getElementById('composeStatus'),
};

const isMobile = () => window.innerWidth < 768;
const saveReadIds = () => localStorage.setItem('DASHBOARD_READ_IDS', JSON.stringify([...readIds]));

// ── View Management ───────────────────────────────────────────────────────────
function showLogin() {
    el.loginView.classList.remove('hidden');
    el.dashboardView.classList.add('hidden');
    el.logoutBtn.classList.add('hidden');
}

function showDashboard() {
    el.loginView.classList.add('hidden');
    el.dashboardView.classList.remove('hidden');
    el.logoutBtn.classList.remove('hidden');
}

function showEmailDetail() {
    el.emptyState.classList.add('hidden');
    el.emailDetailView.classList.remove('hidden');
    el.composeView.classList.add('hidden');
    hideDeleteConfirm();
    if (isMobile()) {
        el.emailSidebar.classList.add('hidden');
        el.emailMain.classList.remove('hidden');
        el.emailMain.classList.add('flex');
    }
}

function showSidebar() {
    el.emailSidebar.classList.remove('hidden');
    el.emailMain.classList.add('hidden');
    el.emailMain.classList.remove('flex');
    selectedEmailId = null;
}

function showCompose() {
    el.composeView.classList.remove('hidden');
    el.composeStatus.textContent = '';
    el.composeStatus.className = '';
    if (isMobile()) {
        el.emailSidebar.classList.add('hidden');
        el.emailMain.classList.remove('hidden');
        el.emailMain.classList.add('flex');
    }
}

function hideCompose() { el.composeView.classList.add('hidden'); }

function showDeleteConfirm() {
    el.deleteBtn.classList.add('hidden');
    el.deleteConfirm.classList.remove('hidden');
    el.deleteConfirm.classList.add('flex');
}

function hideDeleteConfirm() {
    el.deleteBtn.classList.remove('hidden');
    el.deleteConfirm.classList.add('hidden');
    el.deleteConfirm.classList.remove('flex');
}

// ── API ───────────────────────────────────────────────────────────────────────
async function api(path, options = {}) {
    const res = await fetch(API_BASE + path, {
        ...options,
        headers: {
            'Authorization': `tma ${tmaAuth}`,
            'Content-Type': 'application/json',
            ...(options.headers || {})
        }
    });
    if (!res.ok) {
        if (res.status === 401) throw new Error('Unauthorized');
        throw new Error(`API Error: ${res.status}`);
    }
    return res.json();
}

// ── Event Listeners ───────────────────────────────────────────────────────────
el.refreshBtn.addEventListener('click', fetchEmails);

el.emailList.addEventListener('click', (e) => {
    const item = e.target.closest('.email-item');
    if (item) selectEmail(item.dataset.id);
});

el.backBtn.addEventListener('click', () => {
    showSidebar();
    el.emailDetailView.classList.add('hidden');
    el.emptyState.classList.remove('hidden');
});

el.deleteBtn.addEventListener('click', showDeleteConfirm);
el.deleteConfirmNo.addEventListener('click', hideDeleteConfirm);

el.deleteConfirmYes.addEventListener('click', async () => {
    if (!selectedEmailId) return;
    hideDeleteConfirm();
    try {
        await api(`/emails/${selectedEmailId}`, { method: 'DELETE' });
        readIds.delete(selectedEmailId);
        saveReadIds();
        selectedEmailId = null;
        if (isMobile()) {
            showSidebar();
        } else {
            el.emptyState.classList.remove('hidden');
            el.emailDetailView.classList.add('hidden');
        }
        await fetchEmails();
    } catch (err) {
        hideDeleteConfirm();
        const errSpan = document.createElement('span');
        errSpan.className = 'inline-err';
        errSpan.textContent = 'Delete failed';
        el.deleteBtn.insertAdjacentElement('afterend', errSpan);
        setTimeout(() => errSpan.remove(), 3000);
    }
});

el.fabCompose.addEventListener('click', () => {
    el.composeTitle.textContent = 'New Message';
    el.composeForm.reset();
    el.composeInReplyTo.value = '';
    showCompose();
});

el.closeComposeBtn.addEventListener('click', () => {
    hideCompose();
    if (isMobile() && !selectedEmailId) showSidebar();
});

el.replyBtn.addEventListener('click', () => {
    const email = currentEmails.find(e => e.id === selectedEmailId);
    if (!email) return;
    el.composeTitle.textContent = 'Reply';
    el.composeTo.value = email.from;
    el.composeSubject.value = email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`;
    const quotedBody = email.body.split('\n').map(line => `> ${line}`).join('\n');
    el.composeBody.value = `\n\n\nOn ${new Date(email.date).toLocaleString()}, ${email.fromName || email.from} wrote:\n${quotedBody}`;
    el.composeInReplyTo.value = email.messageId || '';
    showCompose();
    el.composeBody.focus();
    el.composeBody.setSelectionRange(0, 0);
});

el.composeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = el.composeForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.classList.add('opacity-50');
    el.composeStatus.textContent = 'Sending...';
    el.composeStatus.className = 'st-sending';
    try {
        await api('/emails/send', {
            method: 'POST',
            body: JSON.stringify({
                to: el.composeTo.value,
                subject: el.composeSubject.value,
                body: el.composeBody.value,
                inReplyTo: el.composeInReplyTo.value || null
            })
        });
        el.composeStatus.textContent = 'Sent.';
        el.composeStatus.className = 'st-ok';
        setTimeout(() => {
            hideCompose();
            if (isMobile() && !selectedEmailId) showSidebar();
            submitBtn.disabled = false;
            submitBtn.classList.remove('opacity-50');
        }, 1500);
    } catch (err) {
        el.composeStatus.textContent = `Failed: ${err.message}`;
        el.composeStatus.className = 'st-err';
        submitBtn.disabled = false;
        submitBtn.classList.remove('opacity-50');
    }
});

// ── Data ──────────────────────────────────────────────────────────────────────
async function fetchEmails() {
    el.emailList.textContent = '';
    const ph = document.createElement('div');
    ph.className = 'list-msg';
    ph.textContent = 'Loading...';
    el.emailList.appendChild(ph);

    try {
        const emails = await api('/emails');
        currentEmails = emails.sort((a, b) => new Date(b.date) - new Date(a.date));
        updateHeaderCount();
        renderEmailList();
        const hash = location.hash.slice(1);
        if (hash && currentEmails.find(e => e.id === hash)) selectEmail(hash);
    } catch (err) {
        el.emailList.textContent = '';
        const errDiv = document.createElement('div');
        errDiv.className = 'list-msg';
        errDiv.style.color = 'var(--danger)';
        errDiv.textContent = `Error: ${err.message}`;
        el.emailList.appendChild(errDiv);
    }
}

function updateHeaderCount() {
    const unread = currentEmails.filter(e => !readIds.has(e.id)).length;
    if (currentEmails.length === 0) {
        el.hdrCount.classList.add('hidden');
    } else {
        el.hdrCount.textContent = unread > 0 ? `${unread} unread` : `${currentEmails.length} emails`;
        el.hdrCount.classList.remove('hidden');
    }
}

function makeEmailItem(email, index) {
    const isRead = readIds.has(email.id);
    const isSelected = selectedEmailId === email.id;

    const item = document.createElement('div');
    item.className = `email-item${isSelected ? ' selected' : ''}${!isRead ? ' unread' : ''}`;
    item.dataset.id = email.id;
    item.style.animationDelay = `${index * 30}ms`;

    const top = document.createElement('div');
    top.className = 'item-top';

    const sender = document.createElement('span');
    sender.className = 'item-sender';
    if (!isRead) {
        const pip = document.createElement('span');
        pip.className = 'unread-pip';
        sender.appendChild(pip);
    }
    sender.appendChild(document.createTextNode(email.fromName || email.from));

    const date = document.createElement('span');
    date.className = 'item-date';
    date.textContent = formatDate(email.date);

    top.appendChild(sender);
    top.appendChild(date);

    const subject = document.createElement('div');
    subject.className = 'item-subject';
    subject.textContent = email.subject || '(No Subject)';

    const preview = document.createElement('div');
    preview.className = 'item-preview';
    preview.textContent = (email.body || '').substring(0, 90) + '…';

    item.appendChild(top);
    item.appendChild(subject);
    item.appendChild(preview);
    return item;
}

function renderEmailList() {
    el.emailList.textContent = '';
    if (currentEmails.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'list-msg';
        empty.textContent = 'No emails.';
        el.emailList.appendChild(empty);
        return;
    }
    const frag = document.createDocumentFragment();
    currentEmails.forEach((email, i) => frag.appendChild(makeEmailItem(email, i)));
    el.emailList.appendChild(frag);
}

function selectEmail(id) {
    selectedEmailId = id;
    const email = currentEmails.find(e => e.id === id);
    if (!email) return;

    readIds.add(id);
    saveReadIds();
    updateHeaderCount();
    renderEmailList();

    el.detailSubject.textContent = email.subject || '(No Subject)';
    el.detailFrom.textContent = email.fromName ? `${email.fromName} <${email.from}>` : email.from;
    el.detailTo.textContent = email.to;
    el.detailDate.textContent = new Date(email.date).toLocaleString();
    el.detailBody.textContent = email.body || '(Empty)';

    showEmailDetail();
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const today = new Date();
    if (date.toDateString() === today.toDateString())
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ── Init ──────────────────────────────────────────────────────────────────────
function init() {
    if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.ready();
        tmaAuth = window.Telegram.WebApp.initData;
        if (tmaAuth) {
            showDashboard();
            fetchEmails();
        } else {
            document.body.innerHTML = '<div style="padding: 2rem; color: var(--fg); text-align: center;">Must be opened inside Telegram</div>';
        }
    } else {
        document.body.innerHTML = '<div style="padding: 2rem; color: var(--fg); text-align: center;">Must be opened inside Telegram</div>';
    }
}

init();
