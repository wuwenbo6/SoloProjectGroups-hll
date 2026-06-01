const API_BASE = '/api/v1';

const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const keysList = document.getElementById('keysList');
const loading = document.getElementById('loading');
const emptyState = document.getElementById('emptyState');
const statsBar = document.getElementById('statsBar');
const totalKeysEl = document.getElementById('totalKeys');

const formatDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('zh-CN');
};

const renderKeyCard = (key) => {
  const card = document.createElement('div');
  card.className = 'key-card';
  card.onclick = () => window.location.href = `/key/${key.fingerprint}`;

  const usersHtml = key.userIds
    .filter(u => u && (u.name || u.email))
    .map(u => {
      let text = u.name || '';
      if (u.email) text += text ? ` <${u.email}>` : u.email;
      return `<span class="user-badge">${text}</span>`;
    })
    .join('');

  const algoText = key.keySize ? `${key.algorithm} ${key.keySize}bit` : key.algorithm;

  card.innerHTML = `
    <div class="key-header">
      <div class="key-fingerprint">${key.fingerprintFormatted}</div>
      <span class="key-algo">${algoText}</span>
    </div>
    <div class="key-meta">
      <span>Key ID: ${key.keyId}</span>
      <span>创建: ${formatDate(key.createdAt)}</span>
      ${key.expiresAt ? `<span>过期: ${formatDate(key.expiresAt)}</span>` : ''}
    </div>
    <div class="key-users">${usersHtml}</div>
  `;

  return card;
};

const loadStats = async () => {
  try {
    const response = await fetch(`${API_BASE}/stats`);
    const data = await response.json();
    if (data.success) {
      totalKeysEl.textContent = data.stats.totalKeys;
      statsBar.style.display = 'flex';
    }
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
};

const searchKeys = async (query) => {
  loading.style.display = 'block';
  keysList.innerHTML = '';
  emptyState.style.display = 'none';

  try {
    const url = query.trim() 
      ? `${API_BASE}/keys/search?q=${encodeURIComponent(query)}`
      : `${API_BASE}/keys`;
    
    const response = await fetch(url);
    const data = await response.json();

    loading.style.display = 'none';

    if (data.success && data.keys.length > 0) {
      data.keys.forEach(key => {
        keysList.appendChild(renderKeyCard(key));
      });
    } else {
      emptyState.style.display = 'block';
    }
  } catch (error) {
    loading.style.display = 'none';
    console.error('Search failed:', error);
    keysList.innerHTML = '<div class="alert alert-error">搜索失败，请稍后重试</div>';
  }
};

searchBtn.addEventListener('click', () => {
  searchKeys(searchInput.value);
});

searchInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    searchKeys(searchInput.value);
  }
});

let debounceTimer;
searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    searchKeys(searchInput.value);
  }, 300);
});

loadStats();
searchKeys('');
