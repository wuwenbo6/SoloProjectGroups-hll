const API_BASE = '/api';

let currentOU = null;
let directoryTree = null;

const virtualScrollConfig = {
    rowHeight: 57,
    buffer: 10,
    pageSize: 50
};

let allUsers = [];
let visibleRange = { start: 0, end: 0 };

document.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus();
    setupEventListeners();
    setupVirtualScroll();
});

function setupEventListeners() {
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    document.getElementById('refresh-tree-btn').addEventListener('click', loadDirectoryTree);
    document.getElementById('add-user-btn').addEventListener('click', openAddUserModal);
    document.getElementById('refresh-users-btn').addEventListener('click', loadUsers);
    document.getElementById('modal-close-btn').addEventListener('click', closeUserModal);
    document.getElementById('modal-cancel-btn').addEventListener('click', closeUserModal);
    document.getElementById('modal-save-btn').addEventListener('click', saveUser);
    document.getElementById('password-modal-close-btn').addEventListener('click', closePasswordModal);
    document.getElementById('password-modal-cancel-btn').addEventListener('click', closePasswordModal);
    document.getElementById('password-modal-save-btn').addEventListener('click', resetPassword);
    
    document.getElementById('import-ldif-btn').addEventListener('click', openImportLDIFModal);
    document.getElementById('export-ldif-btn').addEventListener('click', exportLDIF);
    document.getElementById('ldif-modal-close-btn').addEventListener('click', closeLDIFModal);
    document.getElementById('ldif-modal-cancel-btn').addEventListener('click', closeLDIFModal);
    document.getElementById('ldif-modal-import-btn').addEventListener('click', importLDIF);
    document.getElementById('ldif-browse-btn').addEventListener('click', () => document.getElementById('ldif-file-input').click());
    document.getElementById('ldif-file-input').addEventListener('change', handleLDIFFileSelect);
    document.getElementById('ldif-remove-file').addEventListener('click', clearLDIFFile);
    
    const dropZone = document.getElementById('ldif-drop-zone');
    if (dropZone) {
        dropZone.addEventListener('click', () => document.getElementById('ldif-file-input').click());
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
        dropZone.addEventListener('drop', handleLDIFDrop);
    }
    
    const userPasswordInput = document.getElementById('user-password');
    if (userPasswordInput) {
        userPasswordInput.addEventListener('input', validateUserPassword);
    }
    
    const newPasswordInput = document.getElementById('new-password');
    if (newPasswordInput) {
        newPasswordInput.addEventListener('input', validateResetPassword);
    }
    const confirmPasswordInput = document.getElementById('confirm-password');
    if (confirmPasswordInput) {
        confirmPasswordInput.addEventListener('input', validateResetPassword);
    }
}

function setupVirtualScroll() {
    const container = document.getElementById('virtual-scroll-container');
    if (container) {
        container.addEventListener('scroll', handleVirtualScroll, { passive: true });
    }
}

function handleVirtualScroll() {
    const container = document.getElementById('virtual-scroll-container');
    if (!container || allUsers.length === 0) return;
    
    const scrollTop = container.scrollTop;
    const viewportHeight = container.clientHeight;
    
    const startIndex = Math.max(0, Math.floor(scrollTop / virtualScrollConfig.rowHeight) - virtualScrollConfig.buffer);
    const visibleCount = Math.ceil(viewportHeight / virtualScrollConfig.rowHeight) + (virtualScrollConfig.buffer * 2);
    const endIndex = Math.min(allUsers.length, startIndex + visibleCount);
    
    if (startIndex !== visibleRange.start || endIndex !== visibleRange.end) {
        visibleRange = { start: startIndex, end: endIndex };
        renderVisibleRows();
    }
}

function renderVisibleRows() {
    const body = document.getElementById('users-table-body');
    const spacer = document.getElementById('virtual-scroll-spacer');
    
    if (!body || !spacer || allUsers.length === 0) return;
    
    spacer.style.height = `${allUsers.length * virtualScrollConfig.rowHeight}px`;
    
    const fragment = document.createDocumentFragment();
    
    for (let i = visibleRange.start; i < visibleRange.end; i++) {
        const user = allUsers[i];
        if (!user) continue;
        
        const row = document.createElement('div');
        row.className = 'user-row';
        row.style.transform = `translateY(${i * virtualScrollConfig.rowHeight}px)`;
        row.innerHTML = `
            <div class="user-cell" style="width: 120px;">${escapeHtml(user.uid || '')}</div>
            <div class="user-cell" style="width: 150px;">${escapeHtml(user.cn || '')}</div>
            <div class="user-cell" style="width: 200px;">${escapeHtml(user.mail || '')}</div>
            <div class="user-cell" style="width: 130px;">${escapeHtml(user.telephoneNumber || '')}</div>
            <div class="user-cell dn" style="flex: 1; min-width: 0;">${escapeHtml(user.dn)}</div>
            <div class="row-actions" style="width: 120px; justify-content: flex-end;">
                <button class="action-btn edit" title="编辑" onclick='editUser(${JSON.stringify(user).replace(/'/g, "&apos;")})'>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </button>
                <button class="action-btn password" title="重置密码" onclick="openPasswordModal('${encodeURIComponent(user.dn)}', '${escapeHtml(user.cn)}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                </button>
                <button class="action-btn delete" title="删除" onclick="deleteUser('${encodeURIComponent(user.dn)}', '${escapeHtml(user.cn)}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </div>
        `;
        fragment.appendChild(row);
    }
    
    body.innerHTML = '';
    body.appendChild(fragment);
}

async function checkAuthStatus() {
    try {
        const response = await fetch(`${API_BASE}/auth/status`);
        const data = await response.json();
        if (data.connected) {
            showMainView();
            loadDirectoryTree();
        } else {
            showLoginView();
        }
    } catch (err) {
        showLoginView();
    }
}

async function handleLogin(e) {
    e.preventDefault();
    
    const host = document.getElementById('host').value;
    const port = document.getElementById('port').value;
    const baseDn = document.getElementById('baseDn').value;
    const adminDn = document.getElementById('adminDn').value;
    const password = document.getElementById('password').value;
    
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = '';
    
    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ host, port, baseDn, adminDn, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('连接成功！', 'success');
            showMainView();
            loadDirectoryTree();
        } else {
            errorEl.textContent = data.message || '连接失败';
        }
    } catch (err) {
        errorEl.textContent = '网络错误，请重试';
    }
}

async function handleLogout() {
    try {
        await fetch(`${API_BASE}/auth/logout`, { method: 'POST' });
        showLoginView();
        showToast('已登出', 'success');
    } catch (err) {
        console.error('Logout error:', err);
    }
}

function showLoginView() {
    document.getElementById('login-view').classList.remove('hidden');
    document.getElementById('main-view').classList.add('hidden');
    document.getElementById('login-form').reset();
    document.getElementById('host').value = 'localhost';
    document.getElementById('port').value = '389';
}

function showMainView() {
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('main-view').classList.remove('hidden');
}

async function loadDirectoryTree() {
    try {
        const response = await fetch(`${API_BASE}/directory/tree`);
        const data = await response.json();
        
        if (data.success) {
            directoryTree = data.tree;
            renderDirectoryTree();
        } else {
            showToast(data.message || '加载目录树失败', 'error');
        }
    } catch (err) {
        showToast('加载目录树失败', 'error');
    }
}

function renderDirectoryTree() {
    const container = document.getElementById('directory-tree');
    container.innerHTML = '';
    
    if (directoryTree) {
        container.appendChild(renderTreeNode(directoryTree, true));
    }
}

function renderTreeNode(node, isRoot = false) {
    const div = document.createElement('div');
    div.className = 'tree-node';
    
    const hasChildren = node.children && node.children.length > 0;
    
    const content = document.createElement('div');
    content.className = 'tree-node-content';
    content.dataset.dn = node.dn;
    
    if (currentOU === node.dn) {
        content.classList.add('selected');
    }
    
    if (hasChildren) {
        const toggle = document.createElement('span');
        toggle.className = `tree-toggle ${isRoot || node.expanded ? 'expanded' : ''}`;
        toggle.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
        `;
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            toggle.classList.toggle('expanded');
            const children = div.querySelector('.tree-children');
            if (children) {
                children.classList.toggle('collapsed');
            }
        });
        content.appendChild(toggle);
    } else {
        const spacer = document.createElement('span');
        spacer.style.width = '16px';
        content.appendChild(spacer);
    }
    
    const icon = document.createElement('span');
    icon.className = `tree-icon ${node.type || 'container'}`;
    
    if (node.type === 'ou') {
        icon.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
        `;
    } else if (node.type === 'domain') {
        icon.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
            </svg>
        `;
    } else {
        icon.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
            </svg>
        `;
    }
    content.appendChild(icon);
    
    const name = document.createElement('span');
    name.className = 'tree-name';
    name.textContent = node.name;
    content.appendChild(name);
    
    content.addEventListener('click', () => {
        currentOU = node.dn;
        document.querySelectorAll('.tree-node-content.selected').forEach(el => el.classList.remove('selected'));
        content.classList.add('selected');
        document.getElementById('current-ou-title').textContent = node.name;
        document.getElementById('current-ou-dn').textContent = node.dn;
        loadUsers();
    });
    
    div.appendChild(content);
    
    if (hasChildren) {
        const children = document.createElement('div');
        children.className = `tree-children ${isRoot || node.expanded ? '' : 'collapsed'}`;
        node.children.forEach(child => {
            children.appendChild(renderTreeNode(child));
        });
        div.appendChild(children);
    }
    
    return div;
}

async function loadUsers() {
    if (!currentOU) {
        allUsers = [];
        renderEmptyState('请选择一个组织单元以查看用户');
        return;
    }
    
    showLoading(true);
    hideEmptyState();
    
    try {
        const response = await fetch(`${API_BASE}/users?ou=${encodeURIComponent(currentOU)}&pageSize=${virtualScrollConfig.pageSize}`);
        const data = await response.json();
        
        if (data.success) {
            allUsers = data.users || [];
            if (allUsers.length === 0) {
                renderEmptyState('该组织单元下没有用户');
            } else {
                hideEmptyState();
                visibleRange = { start: 0, end: 0 };
                const container = document.getElementById('virtual-scroll-container');
                if (container) {
                    container.scrollTop = 0;
                }
                handleVirtualScroll();
            }
        } else {
            showToast(data.message || '加载用户列表失败', 'error');
            renderEmptyState('加载失败');
        }
    } catch (err) {
        showToast('加载用户列表失败', 'error');
        renderEmptyState('加载失败');
    } finally {
        showLoading(false);
    }
}

function renderEmptyState(message) {
    allUsers = [];
    const body = document.getElementById('users-table-body');
    const spacer = document.getElementById('virtual-scroll-spacer');
    if (body) body.innerHTML = '';
    if (spacer) spacer.style.height = '0px';
    
    const emptyState = document.getElementById('empty-state');
    if (emptyState) {
        emptyState.classList.remove('hidden');
        emptyState.querySelector('p').textContent = message;
    }
}

function hideEmptyState() {
    const emptyState = document.getElementById('empty-state');
    if (emptyState) {
        emptyState.classList.add('hidden');
    }
}

function showLoading(show) {
    const loading = document.getElementById('loading-indicator');
    if (loading) {
        if (show) {
            loading.classList.remove('hidden');
        } else {
            loading.classList.add('hidden');
        }
    }
}

function openAddUserModal() {
    if (!currentOU) {
        showToast('请先选择一个组织单元', 'error');
        return;
    }
    
    document.getElementById('modal-title').textContent = '新增用户';
    document.getElementById('user-dn').value = '';
    document.getElementById('user-form').reset();
    document.getElementById('password-section').classList.remove('hidden');
    document.getElementById('user-password').required = true;
    document.getElementById('user-uid').disabled = false;
    clearUserPasswordError();
    document.getElementById('user-modal').classList.remove('hidden');
}

function editUser(user) {
    document.getElementById('modal-title').textContent = '编辑用户';
    document.getElementById('user-dn').value = user.dn;
    document.getElementById('user-uid').value = user.uid || '';
    document.getElementById('user-cn').value = user.cn || '';
    document.getElementById('user-sn').value = user.sn || '';
    document.getElementById('user-givenName').value = user.givenName || '';
    document.getElementById('user-mail').value = user.mail || '';
    document.getElementById('user-telephoneNumber').value = user.telephoneNumber || '';
    document.getElementById('password-section').classList.add('hidden');
    document.getElementById('user-password').required = false;
    document.getElementById('user-uid').disabled = true;
    clearUserPasswordError();
    document.getElementById('user-modal').classList.remove('hidden');
}

function closeUserModal() {
    document.getElementById('user-modal').classList.add('hidden');
    document.getElementById('user-form').reset();
    clearUserPasswordError();
}

function validatePassword(password) {
    if (!password || typeof password !== 'string') {
        return { valid: false, message: '密码不能为空' };
    }

    if (password.length < 8) {
        return { valid: false, message: '密码长度至少为8位' };
    }

    const hasLetter = /[a-zA-Z]/.test(password);
    if (!hasLetter) {
        return { valid: false, message: '密码必须包含字母' };
    }

    const hasDigit = /\d/.test(password);
    if (!hasDigit) {
        return { valid: false, message: '密码必须包含数字' };
    }

    return { valid: true, message: '密码强度符合要求' };
}

function validateUserPassword() {
    const password = document.getElementById('user-password').value;
    const errorEl = document.getElementById('user-password-error');
    
    if (!errorEl) {
        const passwordSection = document.getElementById('password-section');
        const existingError = passwordSection.querySelector('.error-message');
        if (existingError) {
            existingError.remove();
        }
        
        const errorDiv = document.createElement('div');
        errorDiv.id = 'user-password-error';
        errorDiv.className = 'error-message';
        errorDiv.style.textAlign = 'left';
        passwordSection.appendChild(errorDiv);
    }
    
    const errorElement = document.getElementById('user-password-error');
    
    if (!password) {
        errorElement.textContent = '';
        return true;
    }
    
    const result = validatePassword(password);
    errorElement.textContent = result.valid ? '' : result.message;
    errorElement.style.color = result.valid ? 'var(--success)' : 'var(--danger)';
    return result.valid;
}

function clearUserPasswordError() {
    const errorEl = document.getElementById('user-password-error');
    if (errorEl) {
        errorEl.textContent = '';
    }
}

function validateResetPassword() {
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const errorEl = document.getElementById('password-error');
    
    if (!newPassword && !confirmPassword) {
        errorEl.textContent = '';
        return true;
    }
    
    const passwordResult = validatePassword(newPassword);
    if (!passwordResult.valid) {
        errorEl.textContent = passwordResult.message;
        return false;
    }
    
    if (newPassword !== confirmPassword) {
        errorEl.textContent = '两次输入的密码不一致';
        return false;
    }
    
    errorEl.textContent = '';
    return true;
}

async function saveUser() {
    const dn = document.getElementById('user-dn').value;
    const uid = document.getElementById('user-uid').value;
    const cn = document.getElementById('user-cn').value;
    const sn = document.getElementById('user-sn').value;
    const givenName = document.getElementById('user-givenName').value;
    const mail = document.getElementById('user-mail').value;
    const telephoneNumber = document.getElementById('user-telephoneNumber').value;
    const userPassword = document.getElementById('user-password').value;
    
    if (!uid || !cn || !sn) {
        showToast('请填写必填字段', 'error');
        return;
    }
    
    if (!dn) {
        if (!userPassword) {
            showToast('请设置用户密码', 'error');
            return;
        }
        if (!validateUserPassword()) {
            showToast('密码强度不符合要求', 'error');
            return;
        }
    }
    
    try {
        let response;
        if (dn) {
            response = await fetch(`${API_BASE}/users/${encodeURIComponent(dn)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cn, sn, givenName, mail, telephoneNumber })
            });
        } else {
            response = await fetch(`${API_BASE}/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ou: currentOU,
                    uid,
                    cn,
                    sn,
                    givenName,
                    mail,
                    telephoneNumber,
                    userPassword
                })
            });
        }
        
        const data = await response.json();
        
        if (data.success) {
            closeUserModal();
            loadUsers();
            showToast(dn ? '用户已更新' : '用户已创建', 'success');
        } else {
            showToast(data.message || '操作失败', 'error');
        }
    } catch (err) {
        showToast('操作失败，请重试', 'error');
    }
}

function openPasswordModal(dn, name) {
    document.getElementById('password-user-dn').value = dn;
    document.getElementById('password-user-info').textContent = `为用户 "${name}" 设置新密码`;
    document.getElementById('password-form').reset();
    document.getElementById('password-error').textContent = '';
    document.getElementById('password-modal').classList.remove('hidden');
}

function closePasswordModal() {
    document.getElementById('password-modal').classList.add('hidden');
    document.getElementById('password-form').reset();
    document.getElementById('password-error').textContent = '';
}

async function resetPassword() {
    const dn = document.getElementById('password-user-dn').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const errorEl = document.getElementById('password-error');
    
    if (!validateResetPassword()) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/users/${dn}/password`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newPassword })
        });
        
        const data = await response.json();
        
        if (data.success) {
            closePasswordModal();
            showToast('密码已重置', 'success');
        } else {
            errorEl.textContent = data.message || '重置密码失败';
        }
    } catch (err) {
        errorEl.textContent = '重置密码失败，请重试';
    }
}

async function deleteUser(dn, name) {
    if (!confirm(`确定要删除用户 "${name}" 吗？此操作不可撤销。`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/users/${dn}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            loadUsers();
            showToast('用户已删除', 'success');
        } else {
            showToast(data.message || '删除失败', 'error');
        }
    } catch (err) {
        showToast('删除失败，请重试', 'error');
    }
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const messageEl = document.getElementById('toast-message');
    
    messageEl.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.remove('hidden');
    
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function openImportLDIFModal() {
    document.getElementById('ldif-modal').classList.remove('hidden');
    document.getElementById('ldif-content').value = '';
    document.getElementById('ldif-result').classList.add('hidden');
    clearLDIFFile();
}

function closeLDIFModal() {
    document.getElementById('ldif-modal').classList.add('hidden');
    document.getElementById('ldif-content').value = '';
    document.getElementById('ldif-result').classList.add('hidden');
    clearLDIFFile();
}

let selectedLDFFile = null;

function handleLDIFFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        selectedLDFFile = file;
        document.getElementById('ldif-file-name').textContent = file.name;
        document.getElementById('ldif-drop-zone').classList.add('hidden');
        document.getElementById('ldif-file-info').classList.remove('hidden');
    }
}

function handleLDIFDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.ldif') || file.name.endsWith('.txt'))) {
        selectedLDFFile = file;
        document.getElementById('ldif-file-name').textContent = file.name;
        document.getElementById('ldif-drop-zone').classList.add('hidden');
        document.getElementById('ldif-file-info').classList.remove('hidden');
    } else {
        showToast('请选择 .ldif 或 .txt 文件', 'error');
    }
}

function clearLDIFFile() {
    selectedLDFFile = null;
    document.getElementById('ldif-file-input').value = '';
    document.getElementById('ldif-file-name').textContent = '';
    document.getElementById('ldif-drop-zone').classList.remove('hidden');
    document.getElementById('ldif-file-info').classList.add('hidden');
}

async function importLDIF() {
    const resultEl = document.getElementById('ldif-result');
    const resultSummaryEl = document.getElementById('ldif-result-summary');
    const resultDetailsEl = document.getElementById('ldif-result-details');
    
    let ldifContent = document.getElementById('ldif-content').value.trim();
    
    if (selectedLDFFile) {
        try {
            ldifContent = await selectedLDFFile.text();
        } catch (err) {
            showToast('读取文件失败', 'error');
            return;
        }
    }
    
    if (!ldifContent) {
        showToast('请选择文件或输入LDIF内容', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/ldif/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ldifContent })
        });
        
        const data = await response.json();
        
        resultEl.classList.remove('hidden');
        
        if (data.success) {
            resultSummaryEl.className = 'ldif-result-summary success';
            resultSummaryEl.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px; color: var(--success);">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                    <span>导入成功：${data.successCount}/${data.total} 条记录</span>
                </div>
            `;
        } else {
            resultSummaryEl.className = 'ldif-result-summary error';
            resultSummaryEl.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px; color: var(--danger);">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="15" y1="9" x2="9" y2="15"></line>
                        <line x1="9" y1="9" x2="15" y2="15"></line>
                    </svg>
                    <span>导入完成：成功 ${data.successCount} 条，失败 ${data.failedCount} 条</span>
                </div>
            `;
        }
        
        if (data.results && data.results.length > 0) {
            resultDetailsEl.innerHTML = data.results.map(r => `
                <div class="ldif-result-item ${r.success ? 'success' : 'error'}">
                    <svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        ${r.success 
                            ? '<polyline points="20 6 9 17 4 12"></polyline>' 
                            : '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>'}
                    </svg>
                    <span class="dn" title="${escapeHtml(r.dn)}">${escapeHtml(r.dn)}</span>
                    ${!r.success ? `<span class="error-msg">${escapeHtml(r.error || '')}</span>` : ''}
                </div>
            `).join('');
        }
        
        if (data.successCount > 0) {
            loadUsers();
        }
    } catch (err) {
        showToast('导入失败：' + err.message, 'error');
    }
}

async function exportLDIF() {
    try {
        let url = `${API_BASE}/ldif/export-users`;
        if (currentOU) {
            url += `?ou=${encodeURIComponent(currentOU)}`;
        }
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('导出失败');
        }
        
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = response.headers.get('Content-Disposition')?.match(/filename="?([^"]+)"?/)?.[1] || `export-${Date.now()}.ldif`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(downloadUrl);
        
        showToast('导出成功', 'success');
    } catch (err) {
        showToast('导出失败：' + err.message, 'error');
    }
}
