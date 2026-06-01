const { app, BrowserWindow, ipcMain, screen, dialog } = require("electron");
const path = require("path");
const fsExtra = require("fs-extra");
const { exec } = require("child_process");
const os = require("os");

let mainWindow;
let sessions = new Map();
let sessionIdCounter = 0;
let replayTimeout = null;
let isReplaying = false;

function createSession(id, label) {
  return {
    id,
    label: label || ("Session " + id),
    recordingEvents: [],
    fullEvents: [],
    isRecording: false,
    recordStartTime: 0,
    mouseMoveInterval: null,
    lastMousePos: { x: 0, y: 0 },
    recordDPI: null,
    lastEventState: { mouseX: 0, mouseY: 0, keys: {}, buttons: {} }
  };
}

function getDisplayInfo() {
  const primary = screen.getPrimaryDisplay();
  const displays = screen.getAllDisplays();
  return {
    primary: { width: primary.size.width, height: primary.size.height, dpi: primary.scaleFactor, workArea: primary.workArea },
    displays: displays.map(d => ({ id: d.id, width: d.size.width, height: d.size.height, dpi: d.scaleFactor, bounds: d.bounds }))
  };
}

function compressEventDelta(evt, session) {
  const prev = session.recordingEvents.length > 0 ? session.recordingEvents[session.recordingEvents.length - 1] : null;
  const prevT = prev ? (prev.t || prev.timestamp || 0) : 0;
  const delta = { t: evt.timestamp - prevT };
  const st = session.lastEventState;
  switch (evt.type) {
    case "mouse_move":
      const dx = evt.x - st.mouseX;
      const dy = evt.y - st.mouseY;
      if (dx === 0 && dy === 0) return null;
      delta.type = "mm"; delta.dx = dx; delta.dy = dy;
      st.mouseX = evt.x; st.mouseY = evt.y;
      break;
    case "mouse_click": delta.type = "mc"; delta.b = evt.button || "left"; delta.d = evt.double || false; delta.x = evt.x; delta.y = evt.y; break;
    case "mouse_down": delta.type = "md"; delta.b = evt.button || "left"; st.buttons[evt.button || "left"] = true; break;
    case "mouse_up": delta.type = "mu"; delta.b = evt.button || "left"; st.buttons[evt.button || "left"] = false; break;
    case "key_down":
      if (st.keys[evt.key]) return null;
      delta.type = "kd"; delta.k = evt.key;
      st.keys[evt.key] = true;
      break;
    case "key_up":
      if (!st.keys[evt.key]) return null;
      delta.type = "ku"; delta.k = evt.key;
      st.keys[evt.key] = false;
      break;
    default: return null;
  }
  return delta;
}

function decompressDeltaEvents(compressedEvents, dpiInfo) {
  const events = [];
  let currentTime = 0; let currentX = 0; let currentY = 0;
  const currentDPI = getDisplayInfo();
  const targetScaleX = dpiInfo ? currentDPI.primary.width / dpiInfo.primary.width : 1;
  const targetScaleY = dpiInfo ? currentDPI.primary.height / dpiInfo.primary.height : 1;
  const targetDPI = dpiInfo ? currentDPI.primary.dpi / dpiInfo.primary.dpi : 1;
  const maxScale = Math.max(targetScaleX, targetScaleY, targetDPI);
  for (const delta of compressedEvents) {
    currentTime += delta.t || 0;
    let evt = { timestamp: currentTime };
    switch (delta.type) {
      case "mm": currentX += delta.dx || 0; currentY += delta.dy || 0; evt.type = "mouse_move"; evt.x = Math.round(currentX * maxScale); evt.y = Math.round(currentY * maxScale); break;
      case "mc": evt.type = "mouse_click"; evt.button = delta.b; evt.double = delta.d; evt.x = Math.round((delta.x || currentX) * maxScale); evt.y = Math.round((delta.y || currentY) * maxScale); break;
      case "md": evt.type = "mouse_down"; evt.button = delta.b; break;
      case "mu": evt.type = "mouse_up"; evt.button = delta.b; break;
      case "kd": evt.type = "key_down"; evt.key = delta.k; break;
      case "ku": evt.type = "key_up"; evt.key = delta.k; break;
      default: continue;
    }
    events.push(evt);
  }
  return events;
}

function createWindow() {
  mainWindow = new BrowserWindow({ width: 1400, height: 900, webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false } });
  mainWindow.loadFile(path.join(__dirname, "src", "renderer", "index.html"));
  mainWindow.webContents.openDevTools();
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => process.platform !== "darwin" && app.quit());
app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());

ipcMain.handle("rdp:connect", async (e, config) => {
  try {
    const { host, username, password, port = 3389 } = config;
    let cmd;
    if (process.platform === "win32") {
      const rdpFile = path.join(os.tmpdir(), "rdp_" + Date.now() + ".rdp");
      await fsExtra.writeFile(rdpFile, "full address:s:" + host + ":" + port + "\nusername:s:" + username + "\n");
      cmd = "mstsc.exe \"" + rdpFile + "\"";
    } else if (process.platform === "darwin") {
      cmd = "open \"rdp://" + username + ":" + password + "@" + host + ":" + port + "\"";
    } else {
      cmd = "xfreerdp /u:" + username + " /p:" + password + " /v:" + host + ":" + port;
    }
    exec(cmd, err => err && console.error("RDP Error:", err));
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});


ipcMain.handle("session:create", async (e, label) => {
  const id = ++sessionIdCounter;
  const session = createSession(id, label);
  sessions.set(id, session);
  return { success: true, sessionId: id, label: session.label };
});

ipcMain.handle("session:list", async () => {
  const list = [];
  for (const [id, s] of sessions) {
    list.push({ id: s.id, label: s.label, isRecording: s.isRecording, eventCount: s.fullEvents.length, compressedCount: s.recordingEvents.length });
  }
  return { success: true, sessions: list };
});

ipcMain.handle("session:remove", async (e, sessionId) => {
  const session = sessions.get(sessionId);
  if (!session) return { success: false, error: "Session not found" };
  if (session.isRecording) { session.isRecording = false; session.mouseMoveInterval && clearInterval(session.mouseMoveInterval); }
  sessions.delete(sessionId);
  return { success: true };
});


ipcMain.handle("recording:start", async (e, sessionId) => {
  const session = sessions.get(sessionId);
  if (!session) return { success: false, error: "Session not found" };
  if (session.isRecording) return { success: false, error: "Already recording" };
  session.recordingEvents = [];
  session.fullEvents = [];
  session.isRecording = true;
  session.recordStartTime = Date.now();
  session.recordDPI = getDisplayInfo();
  session.lastMousePos = screen.getCursorScreenPoint();
  session.lastEventState = { mouseX: session.lastMousePos.x, mouseY: session.lastMousePos.y, keys: {}, buttons: {} };
  session.mouseMoveInterval = setInterval(() => {
    const pos = screen.getCursorScreenPoint();
    if (pos.x !== session.lastMousePos.x || pos.y !== session.lastMousePos.y) {
      const fullEvt = { type: "mouse_move", timestamp: Date.now() - session.recordStartTime, x: pos.x, y: pos.y };
      const delta = compressEventDelta(fullEvt, session);
      if (delta) session.recordingEvents.push(delta);
      session.fullEvents.push(fullEvt);
      session.lastMousePos = pos;
      mainWindow.webContents.send("session:events", { sessionId: session.id, eventCount: session.fullEvents.length, compressedCount: session.recordingEvents.length });
    }
  }, 50);
  return { success: true, dpi: session.recordDPI, sessionId: session.id };
});

ipcMain.handle("recording:stop", async (e, sessionId) => {
  const session = sessions.get(sessionId);
  if (!session) return { success: false, error: "Session not found" };
  if (!session.isRecording) return { success: false, error: "Not recording" };
  session.isRecording = false;
  session.mouseMoveInterval && clearInterval(session.mouseMoveInterval);
  return { success: true, sessionId: session.id, count: session.fullEvents.length, compressedCount: session.recordingEvents.length, events: session.fullEvents, compressedEvents: session.recordingEvents, dpi: session.recordDPI, compressionRatio: session.fullEvents.length > 0 ? ((1 - session.recordingEvents.length / session.fullEvents.length) * 100).toFixed(1) : 0 };
});

ipcMain.handle("recording:addEvent", async (e, sessionId, data) => {
  const session = sessions.get(sessionId);
  if (!session || !session.isRecording) return { success: false };
  const fullEvt = { type: data.type, timestamp: Date.now() - session.recordStartTime, ...data.data };
  const delta = compressEventDelta(fullEvt, session);
  if (delta) session.recordingEvents.push(delta);
  session.fullEvents.push(fullEvt);
  return { success: true };
});


ipcMain.handle("recording:save", async (e, sessionId, filePath) => {
  const session = sessions.get(sessionId);
  if (!session) return { success: false, error: "Session not found" };
  try {
    const header = { version: "3.0", format: "delta_compressed", sessionId: session.id, label: session.label, createdAt: new Date().toISOString(), duration: session.fullEvents.length > 0 ? session.fullEvents[session.fullEvents.length - 1].timestamp : 0, dpi: session.recordDPI, eventCount: session.fullEvents.length, compressedCount: session.recordingEvents.length, compressionRatio: session.fullEvents.length > 0 ? ((1 - session.recordingEvents.length / session.fullEvents.length) * 100).toFixed(1) : 0 };
    let content = JSON.stringify(header) + "\n";
    for (const evt of session.recordingEvents) { content += JSON.stringify(evt) + "\n"; }
    await fsExtra.writeFile(filePath, content);
    return { success: true, header };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle("recording:load", async (e, filePath) => {
  try {
    const content = await fsExtra.readFile(filePath, "utf-8");
    const lines = content.trim().split("\n");
    if (lines.length === 0) return { success: false, error: "Empty file" };
    let header; let compressedEvents;
    try {
      header = JSON.parse(lines[0]);
      if (header.format === "delta_compressed") { compressedEvents = lines.slice(1).map(l => JSON.parse(l)); } else { compressedEvents = lines.map(l => JSON.parse(l)); }
    } catch (err) { return { success: false, error: "Invalid format" }; }
    const dpiInfo = header.dpi || null;
    const events = header.format === "delta_compressed" ? decompressDeltaEvents(compressedEvents, dpiInfo) : compressedEvents;
    return { success: true, events, header, compressedEvents, dpiInfo };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle("recording:getDPI", () => ({ success: true, dpi: getDisplayInfo() }));


function generateReplayHTML(events, header) {
  const eventsJSON = JSON.stringify(events);
  const headerJSON = JSON.stringify(header || {});
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Replay - ${header && header.label ? header.label : "Recording"}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0a0a1a;color:#eee;overflow:hidden;height:100vh;display:flex;flex-direction:column}
.header{background:#16213e;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #533483}
.header h1{font-size:16px;color:#00d4ff}
.header .info{font-size:12px;color:#888}
.canvas-wrap{flex:1;position:relative;overflow:hidden;background:#111}
#replayCanvas{width:100%;height:100%;display:block}
.cursor{position:absolute;width:20px;height:20px;pointer-events:none;transition:left 0.03s linear,top 0.03s linear;z-index:10}
.cursor::before{content:"";position:absolute;width:0;height:0;border-left:8px solid #00d4ff;border-right:8px solid transparent;border-bottom:8px solid transparent;border-top:12px solid #00d4ff}
.click-ring{position:absolute;width:30px;height:30px;border:2px solid #e94560;border-radius:50%;pointer-events:none;animation:ringFade 0.4s ease-out forwards;z-index:9}
@keyframes ringFade{0%{transform:scale(0.5);opacity:1}100%{transform:scale(2);opacity:0}}
.key-flash{position:fixed;bottom:80px;right:20px;padding:8px 16px;background:#e94560;color:#fff;border-radius:6px;font-size:14px;font-weight:bold;pointer-events:none;animation:keyFade 0.6s ease-out forwards;z-index:20}
@keyframes keyFade{0%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-20px)}}
.controls{background:#16213e;padding:12px 20px;border-top:2px solid #533483}
.progress-wrap{position:relative;height:24px;background:#0f3460;border-radius:12px;cursor:pointer;margin-bottom:8px;user-select:none}
.progress-track{position:absolute;top:0;left:0;height:100%;background:linear-gradient(90deg,#533483,#00d4ff);border-radius:12px;transition:width 0.05s linear;pointer-events:none}
.progress-thumb{position:absolute;top:50%;width:16px;height:16px;background:#00d4ff;border-radius:50%;transform:translate(-50%,-50%);pointer-events:none;box-shadow:0 0 8px #00d4ff88}
.btn-row{display:flex;align-items:center;gap:8px}
.btn{padding:6px 14px;border:none;border-radius:5px;cursor:pointer;font-size:13px;font-weight:600}
.btn-play{background:#00ff88;color:#000}.btn-pause{background:#ffd93d;color:#000}.btn-stop{background:#e94560;color:#fff}
.btn-speed{background:#0f3460;color:#00d4ff;border:1px solid #533483}
.btn-speed.active{background:#533483;color:#fff}
.time-display{font-size:13px;color:#aaa;margin-left:12px;font-family:monospace}
</style>
</head>
<body>
<div class="header">
  <h1>&#9654; Replay Player</h1>
  <div class="info" id="headerInfo"></div>
</div>
<div class="canvas-wrap" id="canvasWrap">
  <canvas id="replayCanvas"></canvas>
  <div class="cursor" id="cursor"></div>
</div>
<div class="controls">
  <div class="progress-wrap" id="progressWrap">
    <div class="progress-track" id="progressTrack"></div>
    <div class="progress-thumb" id="progressThumb"></div>
  </div>
  <div class="btn-row">
    <button class="btn btn-play" id="btnPlay">Play</button>
    <button class="btn btn-stop" id="btnStop">Stop</button>
    <button class="btn btn-speed" data-speed="0.5">0.5x</button>
    <button class="btn btn-speed active" data-speed="1">1x</button>
    <button class="btn btn-speed" data-speed="2">2x</button>
    <button class="btn btn-speed" data-speed="4">4x</button>
    <span class="time-display" id="timeDisplay">00:00.000 / 00:00.000</span>
  </div>
</div>
<script>
const EVENTS = ${eventsJSON};
const HEADER = ${headerJSON};
const canvas = document.getElementById("replayCanvas");
const ctx = canvas.getContext("2d");
const cursorEl = document.getElementById("cursor");
const progressWrap = document.getElementById("progressWrap");
const progressTrack = document.getElementById("progressTrack");
const progressThumb = document.getElementById("progressThumb");
const timeDisplay = document.getElementById("timeDisplay");
const headerInfo = document.getElementById("headerInfo");
const btnPlay = document.getElementById("btnPlay");
const btnStop = document.getElementById("btnStop");
let playing = false; let currentIdx = 0; let playStartWall = 0; let playStartEvtTime = 0; let speed = 1; let rafId = null; let dragging = false;
const totalDuration = EVENTS.length > 0 ? EVENTS[EVENTS.length - 1].timestamp : 0;
function resizeCanvas() { const wrap = document.getElementById("canvasWrap"); canvas.width = wrap.clientWidth; canvas.height = wrap.clientHeight; drawFrame(); }
window.addEventListener("resize", resizeCanvas);
function formatTime(ms) { const m = Math.floor(ms / 60000); const s = Math.floor((ms % 60000) / 1000); const d = Math.floor(ms % 1000); return String(m).padStart(2,"0") + ":" + String(s).padStart(2,"0") + "." + String(d).padStart(3,"0"); }
function findEventIndexAtTime(t) {
  let lo = 0, hi = EVENTS.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (EVENTS[mid].timestamp <= t) lo = mid; else hi = mid - 1; }
  return lo;
}

function drawFrame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const evt = EVENTS[currentIdx]; if (!evt) return;
  ctx.fillStyle = "#1a1a2e"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#888"; ctx.font = "12px monospace";
  const y = 30;
  ctx.fillText("Event: " + evt.type + " @ " + evt.timestamp + "ms", 10, y);
  if (evt.x !== undefined) ctx.fillText("Position: (" + evt.x + ", " + evt.y + ")", 10, y + 18);
  if (evt.key) ctx.fillText("Key: " + evt.key, 10, y + 36);
  const cw = canvas.width, ch = canvas.height;
  if (evt.x !== undefined) {
    const nx = evt.x / (HEADER.dpi ? HEADER.dpi.primary.width : 1920) * cw;
    const ny = evt.y / (HEADER.dpi ? HEADER.dpi.primary.height : 1080) * ch;
    cursorEl.style.left = nx + "px"; cursorEl.style.top = ny + "px";
  }
  const t = EVENTS[currentIdx].timestamp;
  const pct = totalDuration > 0 ? (t / totalDuration * 100) : 0;
  progressTrack.style.width = pct + "%";
  progressThumb.style.left = pct + "%";
  timeDisplay.textContent = formatTime(t) + " / " + formatTime(totalDuration);
}

function showClickRing(x, y) {
  const cw = canvas.width, ch = canvas.height;
  const nx = x / (HEADER.dpi ? HEADER.dpi.primary.width : 1920) * cw;
  const ny = y / (HEADER.dpi ? HEADER.dpi.primary.height : 1080) * ch;
  const ring = document.createElement("div"); ring.className = "click-ring"; ring.style.left = (nx - 15) + "px"; ring.style.top = (ny - 15) + "px";
  document.getElementById("canvasWrap").appendChild(ring); setTimeout(() => ring.remove(), 500);
}

function showKeyFlash(key) { const flash = document.createElement("div"); flash.className = "key-flash"; flash.textContent = key; document.body.appendChild(flash); setTimeout(() => flash.remove(), 700); }

function tick() {
  if (!playing) return;
  const wallElapsed = (performance.now() - playStartWall) * speed;
  const targetTime = playStartEvtTime + wallElapsed;
  while (currentIdx < EVENTS.length - 1 && EVENTS[currentIdx + 1].timestamp <= targetTime) {
    currentIdx++; const evt = EVENTS[currentIdx];
    if (evt.type === "mouse_click" && evt.x !== undefined) showClickRing(evt.x, evt.y);
    if (evt.type === "key_down" && evt.key) showKeyFlash(evt.key);
  }
  drawFrame();
  if (currentIdx >= EVENTS.length - 1) { playing = false; btnPlay.textContent = "Play"; btnPlay.className = "btn btn-play"; return; }
  rafId = requestAnimationFrame(tick);
}

btnPlay.addEventListener("click", () => {
  if (playing) { playing = false; cancelAnimationFrame(rafId); btnPlay.textContent = "Play"; btnPlay.className = "btn btn-play"; }
  else { if (currentIdx >= EVENTS.length - 1) currentIdx = 0; playing = true; playStartWall = performance.now(); playStartEvtTime = EVENTS[currentIdx].timestamp; btnPlay.textContent = "Pause"; btnPlay.className = "btn btn-pause"; tick(); }
});

btnStop.addEventListener("click", () => { playing = false; cancelAnimationFrame(rafId); currentIdx = 0; btnPlay.textContent = "Play"; btnPlay.className = "btn btn-play"; drawFrame(); });

document.querySelectorAll(".btn-speed").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".btn-speed").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const newSpeed = parseFloat(btn.dataset.speed);
    if (playing) { playStartEvtTime = EVENTS[currentIdx].timestamp; playStartWall = performance.now(); }
    speed = newSpeed;
  });
});

function seekToMouse(e) {
  const rect = progressWrap.getBoundingClientRect();
  let pct = (e.clientX - rect.left) / rect.width; pct = Math.max(0, Math.min(1, pct));
  const targetTime = pct * totalDuration; currentIdx = findEventIndexAtTime(targetTime);
  if (playing) { playStartWall = performance.now(); playStartEvtTime = targetTime; }
  drawFrame();
}

progressWrap.addEventListener("mousedown", (e) => { dragging = true; seekToMouse(e); });
document.addEventListener("mousemove", (e) => { if (dragging) seekToMouse(e); });
document.addEventListener("mouseup", () => { dragging = false; });

function init() { resizeCanvas();
  const info = []; if (HEADER.label) info.push("Session: " + HEADER.label);
  info.push(EVENTS.length + " events");
  if (HEADER.compressionRatio) info.push("Compression: " + HEADER.compressionRatio + "% saved");
  if (HEADER.duration) info.push("Duration: " + formatTime(HEADER.duration));
  headerInfo.textContent = info.join(" | ");
  drawFrame();
}
init();
</script>
</body>
</html>`;
}


ipcMain.handle("recording:exportHTML", async (e, sessionId, filePath) => {
  const session = sessions.get(sessionId);
  if (!session) return { success: false, error: "Session not found" };
  try {
    const events = decompressDeltaEvents(session.recordingEvents, session.recordDPI);
    const header = { version: "3.0", format: "delta_compressed", sessionId: session.id, label: session.label, createdAt: new Date().toISOString(), duration: session.fullEvents.length > 0 ? session.fullEvents[session.fullEvents.length - 1].timestamp : 0, dpi: session.recordDPI, eventCount: session.fullEvents.length, compressedCount: session.recordingEvents.length, compressionRatio: session.fullEvents.length > 0 ? ((1 - session.recordingEvents.length / session.fullEvents.length) * 100).toFixed(1) : 0 };
    const html = generateReplayHTML(events, header);
    await fsExtra.writeFile(filePath, html);
    return { success: true, path: filePath };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle("recording:exportHTMLFromFile", async (e, jsonlPath, htmlPath) => {
  try {
    const content = await fsExtra.readFile(jsonlPath, "utf-8");
    const lines = content.trim().split("\n");
    if (lines.length === 0) return { success: false, error: "Empty file" };
    const header = JSON.parse(lines[0]);
    const compressedEvents = header.format === "delta_compressed" ? lines.slice(1).map(l => JSON.parse(l)) : lines.map(l => JSON.parse(l));
    const events = header.format === "delta_compressed" ? decompressDeltaEvents(compressedEvents, header.dpi) : compressedEvents;
    const html = generateReplayHTML(events, header);
    await fsExtra.writeFile(htmlPath, html);
    return { success: true, path: htmlPath };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle("dialog:save", () => dialog.showSaveDialog(mainWindow, { filters: [{ name: "JSONL", extensions: ["jsonl"] }], defaultPath: "recording_" + Date.now() + ".jsonl" }));

ipcMain.handle("dialog:saveHTML", () => dialog.showSaveDialog(mainWindow, { filters: [{ name: "HTML", extensions: ["html"] }], defaultPath: "replay_" + Date.now() + ".html" }));

ipcMain.handle("dialog:open", () => dialog.showOpenDialog(mainWindow, { filters: [{ name: "JSONL", extensions: ["jsonl"] }], properties: ["openFile"] }));

ipcMain.handle("replay:start", async (e, events) => {
  if (isReplaying) return { success: false };
  isReplaying = true;
  const replay = (i) => {
    if (i >= events.length || !isReplaying) { isReplaying = false; mainWindow.webContents.send("replay:complete"); return; }
    const evt = events[i];
    const delay = i < events.length - 1 ? events[i + 1].timestamp - evt.timestamp : 0;
    mainWindow.webContents.send("replay:event", evt);
    mainWindow.webContents.send("replay:progress", { current: i + 1, total: events.length });
    if (delay > 0) replayTimeout = setTimeout(() => replay(i + 1), delay);
    else setImmediate(() => replay(i + 1));
  };
  replay(0);
  return { success: true };
});

ipcMain.handle("replay:stop", () => { isReplaying = false; replayTimeout && clearTimeout(replayTimeout); return { success: true }; });

