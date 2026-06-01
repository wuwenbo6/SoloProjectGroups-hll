let currentType = 'all';
let currentPage = 1;
let currentSearch = '';
let totalPages = 1;
let allStats = { total: 0, video: 0, audio: 0, image: 0 };

const typeIcons = {
    video: '🎬',
    audio: '🎵',
    image: '🖼️'
};

const typeLabels = {
    video: '视频',
    audio: '音频',
    image: '图片'
};

function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

async function loadStats() {
    try {
        const response = await fetch('/api/stats');
        const stats = await response.json();
        allStats = stats;
        
        document.getElementById('videoCount').textContent = stats.video;
        document.getElementById('audioCount').textContent = stats.audio;
        document.getElementById('imageCount').textContent = stats.image;
        
        document.getElementById('countAll').textContent = stats.total;
        document.getElementById('countVideo').textContent = stats.video;
        document.getElementById('countAudio').textContent = stats.audio;
        document.getElementById('countImage').textContent = stats.image;
    } catch (err) {
        console.error('Failed to load stats:', err);
    }
}

async function loadConfig() {
    try {
        const response = await fetch('/api/config');
        const config = await response.json();
        
        document.getElementById('serverName').textContent = config.serverName;
        document.getElementById('serverAddress').textContent = `${config.host}:${config.port}`;
    } catch (err) {
        console.error('Failed to load config:', err);
    }
}

async function loadMedia() {
    const loading = document.getElementById('loading');
    const emptyState = document.getElementById('emptyState');
    const mediaGrid = document.getElementById('mediaGrid');
    
    loading.style.display = 'flex';
    emptyState.style.display = 'none';
    mediaGrid.innerHTML = '';
    
    try {
        const params = new URLSearchParams({
            type: currentType,
            page: currentPage,
            limit: 48
        });
        
        if (currentSearch) {
            params.append('search', currentSearch);
        }
        
        const response = await fetch(`/api/media?${params.toString()}`);
        const data = await response.json();
        
        loading.style.display = 'none';
        
        if (data.data.length === 0) {
            emptyState.style.display = 'flex';
            return;
        }
        
        totalPages = data.pagination.pages;
        renderMediaCards(data.data);
        renderPagination();
    } catch (err) {
        console.error('Failed to load media:', err);
        loading.style.display = 'none';
        emptyState.style.display = 'flex';
    }
}

function renderMediaCards(media) {
    const grid = document.getElementById('mediaGrid');
    
    grid.innerHTML = media.map(item => `
        <div class="media-card" onclick="showMediaDetail('${item.id}')">
            <div class="media-thumbnail">
                ${item.type === 'image' 
                    ? `<img src="/thumbnail/${item.id}" alt="${item.title}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">`
                    : ''
                }
                <div class="media-placeholder" style="${item.type === 'image' ? 'display: none;' : ''}">
                    ${typeIcons[item.type]}
                </div>
                <div class="media-type-badge">${typeLabels[item.type]}</div>
            </div>
            <div class="media-info">
                <div class="media-title" title="${item.name}">${item.title}</div>
                <div class="media-meta">
                    <span>${item.extension.toUpperCase()}</span>
                    <span class="media-size">📦 ${formatSize(item.size)}</span>
                </div>
            </div>
        </div>
    `).join('');
}

function renderPagination() {
    const pagination = document.getElementById('pagination');
    
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }
    
    let html = '';
    
    html += `<button class="page-btn" onclick="goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>‹</button>`;
    
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    
    if (endPage - startPage < maxVisible - 1) {
        startPage = Math.max(1, endPage - maxVisible + 1);
    }
    
    if (startPage > 1) {
        html += `<button class="page-btn" onclick="goToPage(1)">1</button>`;
        if (startPage > 2) {
            html += `<span style="color: var(--text-secondary); padding: 0 0.5rem;">...</span>`;
        }
    }
    
    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    }
    
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            html += `<span style="color: var(--text-secondary); padding: 0 0.5rem;">...</span>`;
        }
        html += `<button class="page-btn" onclick="goToPage(${totalPages})">${totalPages}</button>`;
    }
    
    html += `<button class="page-btn" onclick="goToPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>›</button>`;
    
    pagination.innerHTML = html;
}

function goToPage(page) {
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    loadMedia();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function filterByType(type) {
    currentType = type;
    currentPage = 1;
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === type);
    });
    
    loadMedia();
}

let searchTimeout;
function handleSearch(value) {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        currentSearch = value;
        currentPage = 1;
        loadMedia();
    }, 300);
}

async function rescan() {
    const btn = document.getElementById('scanBtn');
    btn.disabled = true;
    btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spinner">
            <path d="M23 4v6h-6"></path>
            <path d="M1 20v-6h6"></path>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"></path>
            <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"></path>
        </svg>
        扫描中...
    `;
    
    try {
        const response = await fetch('/api/scan');
        const result = await response.json();
        
        if (result.success) {
            await loadStats();
            await loadMedia();
        }
    } catch (err) {
        console.error('Failed to rescan:', err);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M23 4v6h-6"></path>
                <path d="M1 20v-6h6"></path>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"></path>
                <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"></path>
            </svg>
            重新扫描
        `;
    }
}

async function showMediaDetail(id) {
    try {
        const response = await fetch(`/api/media/${id}`);
        const item = await response.json();
        
        if (!item) return;
        
        const modal = document.getElementById('modal');
        const modalBody = document.getElementById('modalBody');
        
        modalBody.innerHTML = `
            <div class="media-detail-header">
                <div class="media-detail-thumbnail">
                    ${item.type === 'image' 
                        ? `<img src="/stream/${item.id}" alt="${item.title}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">`
                        : ''
                    }
                    <div class="media-detail-placeholder" style="${item.type === 'image' ? 'display: none;' : ''}">
                        ${typeIcons[item.type]}
                    </div>
                </div>
                <div class="media-detail-info">
                    <h2 class="media-detail-title">${item.title}</h2>
                    <div class="media-detail-stats">
                        <div class="detail-stat">
                            <span class="detail-stat-label">类型</span>
                            <span class="detail-stat-value">${typeLabels[item.type]}</span>
                        </div>
                        <div class="detail-stat">
                            <span class="detail-stat-label">格式</span>
                            <span class="detail-stat-value">${item.extension.toUpperCase()}</span>
                        </div>
                        <div class="detail-stat">
                            <span class="detail-stat-label">大小</span>
                            <span class="detail-stat-value">${formatSize(item.size)}</span>
                        </div>
                        <div class="detail-stat">
                            <span class="detail-stat-label">目录</span>
                            <span class="detail-stat-value">${item.directory}</span>
                        </div>
                    </div>
                    <div class="media-detail-actions">
                        <a href="/stream/${item.id}" target="_blank" class="btn btn-success">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polygon points="5 3 19 12 5 21 5 3"></polygon>
                            </svg>
                            播放
                        </a>
                        <a href="/stream/${item.id}" download class="btn btn-secondary">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                            下载
                        </a>
                    </div>
                </div>
            </div>
            <div class="media-detail-section">
                <h3>文件路径</h3>
                <div class="media-detail-path">${item.path}</div>
            </div>
            <div class="media-detail-section">
                <h3>文件信息</h3>
                <div class="media-detail-stats">
                    <div class="detail-stat">
                        <span class="detail-stat-label">创建时间</span>
                        <span class="detail-stat-value">${formatDate(item.createdAt)}</span>
                    </div>
                    <div class="detail-stat">
                        <span class="detail-stat-label">修改时间</span>
                        <span class="detail-stat-value">${formatDate(item.modifiedAt)}</span>
                    </div>
                    <div class="detail-stat">
                        <span class="detail-stat-label">文件 ID</span>
                        <span class="detail-stat-value" style="font-family: monospace;">${item.id}</span>
                    </div>
                </div>
            </div>
        `;
        
        modal.style.display = 'flex';
    } catch (err) {
        console.error('Failed to load media detail:', err);
    }
}

function closeModal() {
    document.getElementById('modal').style.display = 'none';
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal();
    }
});

async function init() {
    await loadConfig();
    await loadStats();
    await loadMedia();
    
    setInterval(loadStats, 30000);
}

init();
