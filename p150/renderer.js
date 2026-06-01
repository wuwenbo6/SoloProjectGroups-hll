const events = [];
const eventMap = new Map();
let filteredEvents = [];
let selectedEvent = null;

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const clearBtn = document.getElementById('clearBtn');
const eventIdFilter = document.getElementById('eventIdFilter');
const levelFilter = document.getElementById('levelFilter');
const eventsBody = document.getElementById('eventsBody');
const eventCount = document.getElementById('event-count');
const statusIndicator = document.getElementById('status');
const platformInfo = document.getElementById('platform-info');
const eventModal = document.getElementById('eventModal');
const modalBody = document.getElementById('modalBody');
const closeModal = document.getElementById('closeModal');
const tableContainer = document.querySelector('.table-container');

const stats = {
  loginSuccess: document.getElementById('stat-login-success'),
  loginFail: document.getElementById('stat-login-fail'),
  processCreate: document.getElementById('stat-process-create'),
  logout: document.getElementById('stat-logout'),
  threatMedium: document.getElementById('stat-threat-medium'),
  threatHigh: document.getElementById('stat-threat-high')
};

let statsCount = {
  loginSuccess: 0,
  loginFail: 0,
  processCreate: 0,
  logout: 0,
  threatMedium: 0,
  threatHigh: 0
};

const ROW_HEIGHT = 52;
const BUFFER_ROWS = 10;
let scrollTop = 0;
let containerHeight = 0;
let visibleStartIndex = 0;
let visibleEndIndex = 0;
let isFiltering = false;
let renderFrameId = null;

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

const debouncedApplyFilters = debounce(() => {
  applyFilters();
}, 150);

const throttledUpdateVirtualScroll = throttle(() => {
  updateVirtualScroll();
}, 16);

async function init() {
  const status = await window.electronAPI.getStatus();
  updatePlatformInfo(status.platform);
  
  window.electronAPI.onSecurityEvent((event) => {
    addEvent(event);
  });

  window.electronAPI.onAdminStatus((data) => {
    updateAdminStatus(data);
  });

  startBtn.addEventListener('click', startMonitoring);
  stopBtn.addEventListener('click', stopMonitoring);
  clearBtn.addEventListener('click', clearEvents);
  eventIdFilter.addEventListener('change', debouncedApplyFilters);
  levelFilter.addEventListener('change', debouncedApplyFilters);
  closeModal.addEventListener('click', () => eventModal.classList.add('hidden'));
  eventModal.addEventListener('click', (e) => {
    if (e.target === eventModal) eventModal.classList.add('hidden');
  });

  tableContainer.addEventListener('scroll', throttledUpdateVirtualScroll, { passive: true });
  window.addEventListener('resize', throttledUpdateVirtualScroll);

  updateContainerHeight();
}

function updateAdminStatus(data) {
  if (data.platform === 'win32' && !data.isAdmin) {
    platformInfo.textContent += ' | ⚠️ 非管理员模式';
    platformInfo.style.color = '#fbbf24';
  }
}

function updatePlatformInfo(platform) {
  const platformNames = {
    win32: 'Windows',
    darwin: 'macOS',
    linux: 'Linux'
  };
  platformInfo.textContent = `平台: ${platformNames[platform] || platform}`;
  
  if (platform !== 'win32') {
    platformInfo.textContent += ' (演示模式)';
  }
}

async function startMonitoring() {
  startBtn.disabled = true;
  stopBtn.disabled = false;
  statusIndicator.textContent = '运行中';
  statusIndicator.className = 'status-indicator status-running';
  
  await window.electronAPI.startMonitoring();
}

async function stopMonitoring() {
  startBtn.disabled = false;
  stopBtn.disabled = true;
  statusIndicator.textContent = '已停止';
  statusIndicator.className = 'status-indicator status-stopped';
  
  await window.electronAPI.stopMonitoring();
}

function clearEvents() {
  events.length = 0;
  eventMap.clear();
  filteredEvents.length = 0;
  statsCount = { loginSuccess: 0, loginFail: 0, processCreate: 0, logout: 0, threatMedium: 0, threatHigh: 0 };
  updateStats();
  scrollTop = 0;
  tableContainer.scrollTop = 0;
  applyFilters();
}

function addEvent(event) {
  if (event.aggregated && event.aggregationKey && eventMap.has(event.aggregationKey)) {
    const existingEvent = eventMap.get(event.aggregationKey);
    existingEvent.aggregationCount = event.aggregationCount;
    existingEvent.lastSeen = event.lastSeen;
    existingEvent.time = event.time;
    
    if (event.threatMatch && !existingEvent.threatMatch) {
      existingEvent.threatMatch = event.threatMatch;
      existingEvent.level = event.level;
      updateThreatStats(event.threatMatch);
    }
    
    requestVirtualRender();
    updateEventCount();
    return;
  }
  
  eventMap.set(event.aggregationKey, event);
  events.unshift(event);
  updateStatCounters(event);
  
  if (event.threatMatch) {
    updateThreatStats(event.threatMatch);
  }
  
  const eventIdValue = eventIdFilter.value;
  const levelValue = levelFilter.value;
  
  let matchesFilter = true;
  if (eventIdValue) matchesFilter = event.id === parseInt(eventIdValue);
  if (levelValue && matchesFilter) matchesFilter = event.level === levelValue;
  
  if (matchesFilter) {
    filteredEvents.unshift(event);
    requestVirtualRender();
  }
  
  updateEventCount();
}

function updateStatCounters(event) {
  switch (event.id) {
    case 4624:
      statsCount.loginSuccess++;
      break;
    case 4625:
      statsCount.loginFail++;
      break;
    case 4688:
      statsCount.processCreate++;
      break;
    case 4634:
    case 4647:
      statsCount.logout++;
      break;
  }
  updateStats();
}

function updateThreatStats(threatMatch) {
  if (!threatMatch || !threatMatch.maxSeverity) return;
  
  if (threatMatch.maxSeverity === 'medium' || threatMatch.maxSeverity === 'low') {
    statsCount.threatMedium++;
  } else if (threatMatch.maxSeverity === 'high' || threatMatch.maxSeverity === 'critical') {
    statsCount.threatHigh++;
  }
  
  updateStats();
}

function updateStats() {
  stats.loginSuccess.textContent = statsCount.loginSuccess;
  stats.loginFail.textContent = statsCount.loginFail;
  stats.processCreate.textContent = statsCount.processCreate;
  stats.logout.textContent = statsCount.logout;
  stats.threatMedium.textContent = statsCount.threatMedium;
  stats.threatHigh.textContent = statsCount.threatHigh;
}

function applyFilters() {
  isFiltering = true;
  
  const eventIdValue = eventIdFilter.value;
  const levelValue = levelFilter.value;

  filteredEvents = events.filter(event => {
    let matchEventId = true;
    let matchLevel = true;

    if (eventIdValue) {
      matchEventId = event.id === parseInt(eventIdValue);
    }

    if (levelValue) {
      matchLevel = event.level === levelValue;
    }

    return matchEventId && matchLevel;
  });

  scrollTop = 0;
  tableContainer.scrollTop = 0;
  updateEventCount();
  updateVirtualScroll();
  
  isFiltering = false;
}

function updateEventCount() {
  const totalRawCount = events.reduce((sum, e) => sum + (e.aggregationCount || 1), 0);
  eventCount.textContent = `事件总数: ${totalRawCount} (去重: ${events.length})${filteredEvents.length !== events.length ? ` (已过滤: ${filteredEvents.length})` : ''}`;
}

function updateContainerHeight() {
  containerHeight = tableContainer.clientHeight;
}

function updateVirtualScroll() {
  if (isFiltering) return;
  
  scrollTop = tableContainer.scrollTop;
  updateContainerHeight();
  
  const totalVisibleRows = Math.ceil(containerHeight / ROW_HEIGHT) + BUFFER_ROWS * 2;
  const newStartIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
  const newEndIndex = Math.min(filteredEvents.length, newStartIndex + totalVisibleRows);
  
  if (newStartIndex !== visibleStartIndex || newEndIndex !== visibleEndIndex) {
    visibleStartIndex = newStartIndex;
    visibleEndIndex = newEndIndex;
    renderVisibleRows();
  }
}

function requestVirtualRender() {
  if (renderFrameId) {
    cancelAnimationFrame(renderFrameId);
  }
  renderFrameId = requestAnimationFrame(() => {
    updateVirtualScroll();
    renderFrameId = null;
  });
}

function renderVisibleRows() {
  if (filteredEvents.length === 0) {
    renderEmptyState();
    return;
  }

  const topSpacerHeight = visibleStartIndex * ROW_HEIGHT;
  const bottomSpacerHeight = Math.max(0, (filteredEvents.length - visibleEndIndex) * ROW_HEIGHT);
  
  const visibleEvents = filteredEvents.slice(visibleStartIndex, visibleEndIndex);
  
  let html = '';
  
  if (topSpacerHeight > 0) {
    html += `<tr style="height: ${topSpacerHeight}px;"><td colspan="8"></td></tr>`;
  }
  
  html += visibleEvents.map((event, i) => {
    const actualIndex = visibleStartIndex + i;
    const levelClass = getLevelClass(event.level);
    const idClass = getIdClass(event.id);
    const threatClass = getThreatClass(event.threatMatch);
    const threatBadge = getThreatBadge(event.threatMatch);
    
    return `
      <tr class="event-row ${event.threatMatch ? 'event-row-threat' : ''}" data-index="${actualIndex}" onclick="showEventDetails(${actualIndex})" style="height: ${ROW_HEIGHT}px;">
        <td class="time-cell">${event.time}</td>
        <td class="count-cell">
          <span class="count-badge ${event.aggregationCount > 1 ? 'count-badge-multiple' : ''}">${event.aggregationCount || 1}</span>
        </td>
        <td class="event-id-cell"><span class="event-id-badge ${idClass}">${event.id}</span></td>
        <td><span class="level-badge ${levelClass}">${event.level}</span></td>
        <td class="threat-cell">${threatBadge}</td>
        <td class="message-cell">${event.message}</td>
        <td class="description-cell">${event.description || event.message}</td>
        <td class="computer-cell">${event.computer}</td>
      </tr>
    `;
  }).join('');
  
  if (bottomSpacerHeight > 0) {
    html += `<tr style="height: ${bottomSpacerHeight}px;"><td colspan="8"></td></tr>`;
  }
  
  eventsBody.innerHTML = html;
}

function renderEmptyState() {
  eventsBody.innerHTML = `
    <tr class="empty-row">
      <td colspan="8" class="empty-cell">
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <p>${events.length === 0 ? '点击"开始监控"按钮开始接收安全日志事件' : '没有符合过滤条件的事件'}</p>
          <p class="empty-hint">支持登录事件 (4624/4625) 和进程创建 (4688) 等安全事件</p>
        </div>
      </td>
    </tr>
  `;
}

function getLevelClass(level) {
  switch (level) {
    case '信息': return 'level-info';
    case '警告': return 'level-warning';
    case '错误': return 'level-error';
    case '严重': return 'level-critical';
    default: return 'level-info';
  }
}

function getIdClass(id) {
  switch (id) {
    case 4624: return 'id-success';
    case 4625: return 'id-danger';
    case 4688: return 'id-primary';
    case 4634:
    case 4647: return 'id-secondary';
    default: return 'id-default';
  }
}

function getThreatClass(threatMatch) {
  if (!threatMatch) return '';
  return `threat-${threatMatch.maxSeverity}`;
}

function getThreatBadge(threatMatch) {
  if (!threatMatch) {
    return '<span class="threat-badge threat-safe">-</span>';
  }
  
  const severityLabels = {
    info: '信息',
    low: '低危',
    medium: '中危',
    high: '高危',
    critical: '严重'
  };
  
  const label = severityLabels[threatMatch.maxSeverity] || '未知';
  const firstThreat = threatMatch.matches[0];
  
  return `<span class="threat-badge threat-${threatMatch.maxSeverity}" title="${firstThreat.threat}">${label}</span>`;
}

function showEventDetails(index) {
  selectedEvent = filteredEvents[index];
  if (!selectedEvent) return;

  const detailsHtml = Object.entries(selectedEvent.details || {})
    .map(([key, value]) => `
      <div class="detail-row">
        <span class="detail-key">${key}:</span>
        <span class="detail-value">${value}</span>
      </div>
    `).join('');

  const aggregationHtml = selectedEvent.aggregationCount > 1 ? `
    <h4>聚合信息</h4>
    <div class="detail-section">
      <div class="detail-row">
        <span class="detail-key">重复次数:</span>
        <span class="detail-value">${selectedEvent.aggregationCount} 次 (5分钟内)</span>
      </div>
      <div class="detail-row">
        <span class="detail-key">首次出现:</span>
        <span class="detail-value">${selectedEvent.firstSeen}</span>
      </div>
      <div class="detail-row">
        <span class="detail-key">最近出现:</span>
        <span class="detail-value">${selectedEvent.lastSeen}</span>
      </div>
    </div>
  ` : '';

  const threatHtml = selectedEvent.threatMatch ? `
    <h4>⚠️ 威胁情报匹配</h4>
    <div class="detail-section threat-section">
      <div class="detail-row">
        <span class="detail-key">匹配数量:</span>
        <span class="detail-value">${selectedEvent.threatMatch.matches.length} 项</span>
      </div>
      <div class="detail-row">
        <span class="detail-key">最高严重级别:</span>
        <span class="detail-value threat-${selectedEvent.threatMatch.maxSeverity}">${selectedEvent.threatMatch.maxSeverity.toUpperCase()}</span>
      </div>
      ${selectedEvent.threatMatch.matches.map(m => `
        <div class="threat-match">
          <div class="detail-row">
            <span class="detail-key">类型:</span>
            <span class="detail-value">${m.type === 'process_name' ? '可疑进程名' : m.type === 'hash' ? `${m.hashType}哈希匹配` : '暴力破解'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-key">威胁:</span>
            <span class="detail-value">${m.threat}</span>
          </div>
          <div class="detail-row">
            <span class="detail-key">描述:</span>
            <span class="detail-value">${m.description}</span>
          </div>
        </div>
      `).join('')}
    </div>
  ` : '';

  modalBody.innerHTML = `
    <div class="detail-section">
      <div class="detail-row">
        <span class="detail-key">事件ID:</span>
        <span class="detail-value">${selectedEvent.id}</span>
      </div>
      <div class="detail-row">
        <span class="detail-key">时间:</span>
        <span class="detail-value">${selectedEvent.time}</span>
      </div>
      <div class="detail-row">
        <span class="detail-key">级别:</span>
        <span class="detail-value">${selectedEvent.level}</span>
      </div>
      <div class="detail-row">
        <span class="detail-key">类型:</span>
        <span class="detail-value">${selectedEvent.message}</span>
      </div>
      <div class="detail-row">
        <span class="detail-key">描述:</span>
        <span class="detail-value">${selectedEvent.description || selectedEvent.message}</span>
      </div>
      <div class="detail-row">
        <span class="detail-key">来源:</span>
        <span class="detail-value">${selectedEvent.provider}</span>
      </div>
      <div class="detail-row">
        <span class="detail-key">计算机:</span>
        <span class="detail-value">${selectedEvent.computer}</span>
      </div>
    </div>
    ${aggregationHtml}
    ${threatHtml}
    ${detailsHtml ? `
      <h4>详细信息</h4>
      <div class="detail-section">
        ${detailsHtml}
      </div>
    ` : ''}
  `;

  eventModal.classList.remove('hidden');
}

window.showEventDetails = showEventDetails;

init();
