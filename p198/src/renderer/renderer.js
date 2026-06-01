const sessionsGrid = document.getElementById("sessionsGrid");
const sessionNameInput = document.getElementById("sessionName");
const btnCreate = document.getElementById("btnCreateSession");
const btnLoad = document.getElementById("btnLoad");
const dpiInfoEl = document.getElementById("dpiInfo");
const activeCountEl = document.getElementById("activeCount");
const recordingCountEl = document.getElementById("recordingCount");
let currentDPI = null;
let sessions = [];

async function init() {
  const dpiRes = await api.getDPI();
  if (dpiRes.success) { currentDPI = dpiRes.dpi; const p = dpiRes.dpi.primary; dpiInfoEl.textContent = p.width + "x" + p.height + " @ " + p.scaleFactor + "x"; }
  await refreshSessions();
}

async function refreshSessions() {
  const res = await api.sessionList();
  if (res.success) { sessions = res.sessions; renderSessions(); }
}

function renderSessions() {
  sessionsGrid.innerHTML = "";
  for (const s of sessions) {
    const card = document.createElement("div");
    card.className = "session-card" + (s.isRecording ? " recording" : "");
    const statusText = s.isRecording ? "RECORDING" : "Idle";
    const statusClass = s.isRecording ? "status-recording" : "status-idle";
    card.innerHTML = `
      <div class="session-header">
        <div class="session-label">${s.label}</div>
        <span class="session-status ${statusClass}">${statusText}</span>
      </div>
      <div class="session-meta">
        ID: ${s.id.slice(0,8)} | Events: ${s.eventCount} | Compressed: ${s.compressedCount} | Saved: ${s.compressionRatio}%
      </div>
      <div class="session-actions">
        <button class="btn btn-sm btn-green" onclick="startRecord(\"${s.id}\")" ${s.isRecording ? "disabled" : ""}>Start</button>
        <button class="btn btn-sm btn-red" onclick="stopRecord(\"${s.id}\")" ${!s.isRecording ? "disabled" : ""}>Stop</button>
        <button class="btn btn-sm btn-yellow" onclick="saveRecord(\"${s.id}\")">Save JSONL</button>
        <button class="btn btn-sm btn-primary" onclick="exportHTML(\"${s.id}\")">Export HTML</button>
        <button class="btn btn-sm btn-primary" onclick="removeSession(\"${s.id}\")">Delete</button>
      </div>
    `;
    sessionsGrid.appendChild(card);
  }
  updateCounts();
}

function updateCounts() {
  activeCountEl.textContent = sessions.length;
  recordingCountEl.textContent = sessions.filter(s => s.isRecording).length;
}


btnCreate.addEventListener("click", async () => {
  const name = sessionNameInput.value.trim() || "Session " + Date.now().toString(36);
  await api.sessionCreate(name); sessionNameInput.value = ""; await refreshSessions();
});

async function startRecord(id) { await api.startRecord(id); await refreshSessions(); }
async function stopRecord(id) { await api.stopRecord(id); await refreshSessions(); }
async function removeSession(id) { await api.sessionRemove(id); await refreshSessions(); }

async function saveRecord(id) {
  const d = await api.showSaveDialog(); if (d.canceled || !d.filePath) return;
  await api.saveRecord(id, d.filePath);
}

async function exportHTML(id) {
  const d = await api.showSaveHTMLDialog(); if (d.canceled || !d.filePath) return;
  await api.exportHTML(id, d.filePath);
}

btnLoad.addEventListener("click", async () => {
  const d = await api.showOpenDialog(); if (d.canceled || !d.filePaths) return;
  const res = await api.loadRecord(d.filePaths[0]);
  if (res.success) {
    const htmlRes = await api.showSaveHTMLDialog();
    if (!htmlRes.canceled && htmlRes.filePath) {
      await api.exportHTMLFromFile(d.filePaths[0], htmlRes.filePath);
    }
  }
});

document.addEventListener("mousemove", (e) => {
  for (const s of sessions) {
    if (s.isRecording) {
      api.addEvent(s.id, { type: "mouse_move", x: e.clientX, y: e.clientY, target: e.target.tagName });
    }
  }
});

document.addEventListener("click", (e) => {
  for (const s of sessions) {
    if (s.isRecording) {
      api.addEvent(s.id, { type: "mouse_click", x: e.clientX, y: e.clientY, button: e.button, target: e.target.tagName });
    }
  }
});

document.addEventListener("keydown", (e) => {
  for (const s of sessions) {
    if (s.isRecording) {
      api.addEvent(s.id, { type: "key_down", key: e.key, code: e.code, alt: e.altKey, ctrl: e.ctrlKey, shift: e.shiftKey });
    }
  }
});

document.addEventListener("keyup", (e) => {
  for (const s of sessions) {
    if (s.isRecording) {
      api.addEvent(s.id, { type: "key_up", key: e.key, code: e.code });
    }
  }
});

init();

