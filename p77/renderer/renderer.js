const { ipcRenderer } = require('electron');
const easymidi = require('easymidi');
const MidiWriter = require('midi-writer-js');

let currentMidiInput = null;
let activeNotes = new Set();
let detectedChords = [];
let generatedMidiData = null;

let midiClockEnabled = false;
let midiClockCount = 0;
let lastClockTime = 0;
let detectedBPM = 120;
let isPlaying = false;
let playbackPosition = 0;
let playbackInterval = null;
let currentTrackData = null;
let midiOutput = null;

const CHORD_NOTES = {
  'Cmaj7': [60, 64, 67, 71],
  'C7': [60, 64, 67, 70],
  'Cm7': [60, 63, 67, 70],
  'C': [60, 64, 67],
  'Cm': [60, 63, 67],
  'C#maj7': [61, 65, 68, 72],
  'C#7': [61, 65, 68, 71],
  'C#m7': [61, 64, 68, 71],
  'C#': [61, 65, 68],
  'C#m': [61, 64, 68],
  'Dbmaj7': [61, 65, 68, 72],
  'Db7': [61, 65, 68, 71],
  'Dbm7': [61, 64, 68, 71],
  'Db': [61, 65, 68],
  'Dbm': [61, 64, 68],
  'Dmaj7': [62, 66, 69, 73],
  'D7': [62, 66, 69, 72],
  'Dm7': [62, 65, 69, 72],
  'D': [62, 66, 69],
  'Dm': [62, 65, 69],
  'D#maj7': [63, 67, 70, 74],
  'D#7': [63, 67, 70, 73],
  'D#m7': [63, 66, 70, 73],
  'D#': [63, 67, 70],
  'D#m': [63, 66, 70],
  'Ebmaj7': [63, 67, 70, 74],
  'Eb7': [63, 67, 70, 73],
  'Ebm7': [63, 66, 70, 73],
  'Eb': [63, 67, 70],
  'Ebm': [63, 66, 70],
  'Emaj7': [64, 68, 71, 75],
  'E7': [64, 68, 71, 74],
  'Em7': [64, 67, 71, 74],
  'E': [64, 68, 71],
  'Em': [64, 67, 71],
  'Fmaj7': [65, 69, 72, 76],
  'F7': [65, 69, 72, 75],
  'Fm7': [65, 68, 72, 75],
  'F': [65, 69, 72],
  'Fm': [65, 68, 72],
  'F#maj7': [66, 70, 73, 77],
  'F#7': [66, 70, 73, 76],
  'F#m7': [66, 69, 73, 76],
  'F#': [66, 70, 73],
  'F#m': [66, 69, 73],
  'Gbmaj7': [66, 70, 73, 77],
  'Gb7': [66, 70, 73, 76],
  'Gbm7': [66, 69, 73, 76],
  'Gb': [66, 70, 73],
  'Gbm': [66, 69, 73],
  'Gmaj7': [55, 59, 62, 66],
  'G7': [55, 59, 62, 65],
  'Gm7': [55, 58, 62, 65],
  'G': [55, 59, 62],
  'Gm': [55, 58, 62],
  'G#maj7': [56, 60, 63, 67],
  'G#7': [56, 60, 63, 66],
  'G#m7': [56, 59, 63, 66],
  'G#': [56, 60, 63],
  'G#m': [56, 59, 63],
  'Abmaj7': [56, 60, 63, 67],
  'Ab7': [56, 60, 63, 66],
  'Abm7': [56, 59, 63, 66],
  'Ab': [56, 60, 63],
  'Abm': [56, 59, 63],
  'Amaj7': [57, 61, 64, 68],
  'A7': [57, 61, 64, 67],
  'Am7': [57, 60, 64, 67],
  'A': [57, 61, 64],
  'Am': [57, 60, 64],
  'A#maj7': [58, 62, 65, 69],
  'A#7': [58, 62, 65, 68],
  'A#m7': [58, 61, 65, 68],
  'A#': [58, 62, 65],
  'A#m': [58, 61, 65],
  'Bbmaj7': [58, 62, 65, 69],
  'Bb7': [58, 62, 65, 68],
  'Bbm7': [58, 61, 65, 68],
  'Bb': [58, 62, 65],
  'Bbm': [58, 61, 65],
  'Bmaj7': [59, 63, 66, 70],
  'B7': [59, 63, 66, 69],
  'Bm7': [59, 62, 66, 69],
  'B': [59, 63, 66],
  'Bm': [59, 62, 66]
};

function initMidiInputs() {
  const inputs = easymidi.getInputs();
  const select = document.getElementById('midiInput');
  select.innerHTML = '<option value="">选择MIDI输入设备</option>';
  
  inputs.forEach(input => {
    const option = document.createElement('option');
    option.value = input;
    option.textContent = input;
    select.appendChild(option);
  });
  
  const outputs = easymidi.getOutputs();
  const outputSelect = document.getElementById('midiOutput');
  if (outputSelect) {
    outputSelect.innerHTML = '<option value="">选择MIDI输出设备</option>';
    outputs.forEach(output => {
      const option = document.createElement('option');
      option.value = output;
      option.textContent = output;
      outputSelect.appendChild(option);
    });
  }
}

function identifyChord(notes) {
  const normalizedNotes = new Set([...notes].map(n => n % 12));
  
  let bestMatch = null;
  let bestMatchCount = 0;
  
  for (const [chord, chordNotes] of Object.entries(CHORD_NOTES)) {
    const normalizedChord = new Set(chordNotes.map(n => n % 12));
    
    let matchCount = 0;
    for (const note of normalizedChord) {
      if (normalizedNotes.has(note)) {
        matchCount++;
      }
    }
    
    if (matchCount === normalizedChord.size && matchCount > bestMatchCount) {
      bestMatch = chord;
      bestMatchCount = matchCount;
    }
  }
  
  return bestMatch;
}

function connectMidiInput(deviceName) {
  if (currentMidiInput) {
    currentMidiInput.close();
    currentMidiInput = null;
  }
  
  midiClockEnabled = false;
  midiClockCount = 0;
  
  if (!deviceName) {
    document.getElementById('midiStatus').textContent = '未连接';
    document.getElementById('midiStatus').classList.remove('connected');
    return;
  }
  
  try {
    currentMidiInput = new easymidi.Input(deviceName);
    currentMidiInput.on('noteon', (msg) => {
      if (msg.velocity > 0) {
        activeNotes.add(msg.note);
        updateDetectedChord();
      }
    });
    
    currentMidiInput.on('noteoff', (msg) => {
      activeNotes.delete(msg.note);
      updateDetectedChord();
    });
    
    currentMidiInput.on('clock', () => {
      if (midiClockEnabled) {
        handleMidiClock();
      }
    });
    
    currentMidiInput.on('start', () => {
      if (midiClockEnabled) {
        playbackPosition = 0;
        startPlayback();
      }
    });
    
    currentMidiInput.on('stop', () => {
      stopPlayback();
    });
    
    document.getElementById('midiStatus').textContent = '已连接';
    document.getElementById('midiStatus').classList.add('connected');
  } catch (err) {
    console.error('MIDI连接失败:', err);
    document.getElementById('midiStatus').textContent = '连接失败';
  }
}

function connectMidiOutput(deviceName) {
  if (midiOutput) {
    midiOutput.close();
    midiOutput = null;
  }
  
  if (!deviceName) {
    return;
  }
  
  try {
    midiOutput = new easymidi.Output(deviceName);
  } catch (err) {
    console.error('MIDI输出连接失败:', err);
  }
}

function handleMidiClock() {
  midiClockCount++;
  const now = Date.now();
  
  if (midiClockCount % 24 === 0) {
    if (lastClockTime > 0) {
      const interval = now - lastClockTime;
      detectedBPM = Math.round(60000 / interval);
      updateClockDisplay();
    }
    lastClockTime = now;
    
    if (isPlaying && currentTrackData) {
      advancePlayback();
    }
  }
}

function updateClockDisplay() {
  const clockDisplay = document.getElementById('clockDisplay');
  if (clockDisplay) {
    clockDisplay.textContent = `BPM: ${detectedBPM}`;
  }
}

function toggleMidiClock() {
  midiClockEnabled = !midiClockEnabled;
  const btn = document.getElementById('clockToggleBtn');
  if (btn) {
    btn.textContent = midiClockEnabled ? '⏸ 时钟同步中' : '⏱ 启用时钟同步';
    btn.classList.toggle('active', midiClockEnabled);
  }
}

function startPlayback() {
  if (isPlaying) return;
  isPlaying = true;
  playbackPosition = 0;
  
  const bpm = midiClockEnabled ? detectedBPM : parseInt(document.getElementById('bpmInput').value);
  const intervalMs = (60000 / bpm) / 4;
  
  if (!midiClockEnabled) {
    playbackInterval = setInterval(() => {
      advancePlayback();
    }, intervalMs);
  }
  
  document.getElementById('playBtn').textContent = '⏸ 暂停';
  document.getElementById('playBtn').classList.add('playing');
}

function stopPlayback() {
  isPlaying = false;
  if (playbackInterval) {
    clearInterval(playbackInterval);
    playbackInterval = null;
  }
  document.getElementById('playBtn').textContent = '▶ 播放';
  document.getElementById('playBtn').classList.remove('playing');
  
  if (midiOutput) {
    for (let i = 0; i < 127; i++) {
      midiOutput.send('noteoff', { note: i, velocity: 0, channel: 0 });
      midiOutput.send('noteoff', { note: i, velocity: 0, channel: 9 });
    }
  }
}

function togglePlayback() {
  if (isPlaying) {
    stopPlayback();
  } else {
    if (currentTrackData) {
      startPlayback();
    }
  }
}

function advancePlayback() {
  if (!currentTrackData || !midiOutput) return;
  
  const tick = playbackPosition;
  const ticksPerBeat = 480;
  const currentBeat = tick / ticksPerBeat;
  
  Object.keys(currentTrackData).forEach(trackName => {
    const track = currentTrackData[trackName];
    const channel = trackName === 'drums' ? 9 : trackName === 'bass' ? 1 : 0;
    
    track.events.forEach(event => {
      if (Math.abs(event.time - currentBeat) < 0.01) {
        if (event.type === 'noteon') {
          midiOutput.send('noteon', { 
            note: event.note, 
            velocity: event.velocity, 
            channel: channel 
          });
        } else if (event.type === 'noteoff') {
          midiOutput.send('noteoff', { 
            note: event.note, 
            velocity: 0, 
            channel: channel 
          });
        }
      }
    });
  });
  
  playbackPosition += ticksPerBeat / 4;
  updatePlaybackDisplay();
}

function updatePlaybackDisplay() {
  const display = document.getElementById('playbackPosition');
  if (display) {
    const beats = Math.floor(playbackPosition / 480);
    display.textContent = `位置: ${beats} 拍`;
  }
}

function updateDetectedChord() {
  if (activeNotes.size >= 3) {
    const chord = identifyChord(activeNotes);
    if (chord) {
      document.getElementById('chordDisplay').textContent = chord;
      
      if (!detectedChords.includes(chord)) {
        detectedChords.push(chord);
        const textarea = document.getElementById('chordProgression');
        textarea.value = detectedChords.join('\n');
      }
    }
  }
}

async function generateAccompaniment() {
  const chordProgression = document.getElementById('chordProgression').value.trim();
  const style = document.getElementById('styleSelect').value;
  const bpm = parseInt(document.getElementById('bpmInput').value);
  const length = parseInt(document.getElementById('lengthInput').value);
  
  if (!chordProgression) {
    alert('请输入和弦进行');
    return;
  }
  
  const chords = chordProgression.split(/[\s,]+/).filter(c => c);
  
  document.getElementById('generateBtn').disabled = true;
  document.getElementById('stopBtn').disabled = false;
  document.getElementById('previewStatus').textContent = '正在生成...';
  
  try {
    const response = await fetch('http://localhost:5000/generate_full', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chords,
        style,
        bpm,
        length
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      generatedMidiData = data.midi_data;
      currentTrackData = data.tracks_data;
      displayTrackPreview(data.tracks);
      displaySheetMusic(chords, data.tracks_data, length, bpm);
      document.getElementById('previewStatus').textContent = '生成完成！';
      document.getElementById('exportBtn').disabled = false;
      document.getElementById('exportStemBtn').disabled = false;
      document.getElementById('playBtn').disabled = false;
    } else {
      document.getElementById('previewStatus').textContent = '生成失败: ' + data.error;
    }
  } catch (err) {
    console.error('生成失败:', err);
    document.getElementById('previewStatus').textContent = '生成失败，请检查Python后端';
    
    generateMockData(chords, style, bpm, length);
  } finally {
    document.getElementById('generateBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
  }
}

function displaySheetMusic(chords, tracksData, length, bpm) {
  const container = document.getElementById('sheetMusicContainer');
  if (!container) return;
  
  container.innerHTML = `
    <div class="sheet-header">
      <h3>📜 乐谱预览</h3>
      <div class="sheet-info">
        <span>调: C大调</span>
        <span>拍号: 4/4</span>
        <span>速度: ${bpm} BPM</span>
        <span>小节数: ${length}</span>
      </div>
    </div>
    <div class="chord-progression-display">
      <h4>和弦进行:</h4>
      <div class="chord-bar">
        ${chords.map((chord, i) => `
          <div class="chord-cell ${i % 4 === 0 ? 'bar-start' : ''}">
            <span class="chord-name">${chord}</span>
            <span class="chord-number">${i + 1}</span>
          </div>
        `).join('')}
      </div>
    </div>
    <div class="tracks-sheet">
      ${renderTrackSheet('drums', '🥁 鼓组', tracksData.drums, length)}
      ${renderTrackSheet('bass', '🎸 贝斯', tracksData.bass, length)}
      ${renderTrackSheet('piano', '🎹 钢琴', tracksData.piano, length)}
    </div>
  `;
}

function renderTrackSheet(trackName, trackLabel, trackData, totalBars) {
  const notesPerBar = Math.ceil(trackData.events.length / totalBars);
  
  return `
    <div class="track-sheet">
      <div class="track-sheet-label">${trackLabel}</div>
      <div class="track-sheet-staff">
        ${Array(totalBars).fill(0).map((_, bar) => `
          <div class="bar-line ${bar === 0 ? 'first' : ''}">
            <div class="staff-lines">
              <div class="staff-line"></div>
              <div class="staff-line"></div>
              <div class="staff-line"></div>
              <div class="staff-line"></div>
              <div class="staff-line"></div>
            </div>
            <div class="bar-notes">
              ${renderBarNotes(trackData.events, bar, notesPerBar)}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderBarNotes(events, barIndex, notesPerBar) {
  const barStart = barIndex * 4;
  const barEnd = (barIndex + 1) * 4;
  const barEvents = events.filter(e => e.type === 'noteon' && e.time >= barStart && e.time < barEnd);
  
  if (barEvents.length === 0) {
    return '<div class="rest">♩</div>';
  }
  
  return barEvents.slice(0, 8).map(event => {
    const noteName = getNoteName(event.note);
    const position = ((event.time - barStart) / 4) * 100;
    return `
      <div class="note-marker" style="left: ${position}%">
        <span class="note-name">${noteName}</span>
        <div class="note-head"></div>
      </div>
    `;
  }).join('');
}

function getNoteName(midiNote) {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midiNote / 12) - 1;
  const note = notes[midiNote % 12];
  return `${note}${octave}`;
}

async function exportStems() {
  if (!currentTrackData) {
    alert('没有可导出的分轨数据');
    return;
  }
  
  const result = await ipcRenderer.invoke('export-stems', {
    tracks: currentTrackData,
    bpm: parseInt(document.getElementById('bpmInput').value)
  });
  
  if (result.success) {
    alert(`分轨文件已保存到: ${result.path}`);
  }
}

function generateMockData(chords, style, bpm, length) {
  const track = new MidiWriter.Track();
  track.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: 1 }));
  track.setTempo(bpm);
  
  chords.forEach((chord, i) => {
    const notes = CHORD_NOTES[chord] || [60, 64, 67];
    notes.forEach(note => {
      track.addEvent(new MidiWriter.NoteEvent({
        pitch: note,
        duration: '4',
        startTick: i * 128
      }));
    });
  });
  
  const writer = new MidiWriter.Writer([track]);
  generatedMidiData = btoa(writer.buildFile());
  
  displayTrackPreview({
    drums: { notes: length * 4, type: style },
    bass: { notes: length * 2, type: style },
    piano: { notes: chords.length * 3, type: style }
  });
  
  document.getElementById('previewStatus').textContent = '生成完成（演示模式）';
  document.getElementById('exportBtn').disabled = false;
}

function displayTrackPreview(tracks) {
  const container = document.getElementById('tracksPreview');
  container.innerHTML = '';
  
  const trackInfo = [
    { key: 'drums', name: '🥁 鼓组', color: 'red' },
    { key: 'bass', name: '🎸 贝斯', color: 'yellow' },
    { key: 'piano', name: '🎹 钢琴', color: 'green' }
  ];
  
  trackInfo.forEach(info => {
    const card = document.createElement('div');
    card.className = `track-card ${info.key}`;
    card.innerHTML = `
      <h4>${info.name}</h4>
      <p>音符数: ${tracks[info.key]?.notes || 0}</p>
      <p>风格: ${tracks[info.key]?.type || 'default'}</p>
    `;
    container.appendChild(card);
  });
}

async function exportMidi() {
  if (!generatedMidiData) {
    alert('没有可导出的MIDI数据');
    return;
  }
  
  const result = await ipcRenderer.invoke('export-midi', generatedMidiData);
  if (result.success) {
    alert(`MIDI文件已保存到: ${result.path}`);
  }
}

async function loadPresets() {
  try {
    const response = await fetch('http://localhost:3001/api/presets');
    const presets = await response.json();
    displayPresets(presets);
  } catch (err) {
    console.error('加载预设失败:', err);
  }
}

function displayPresets(presets) {
  const container = document.getElementById('presetsList');
  container.innerHTML = '';
  
  presets.forEach(preset => {
    const item = document.createElement('div');
    item.className = 'preset-item';
    item.innerHTML = `
      <div class="preset-info">
        <h4>${preset.name}</h4>
        <p>${preset.style} | ${preset.bpm} BPM</p>
      </div>
      <div class="preset-actions">
        <button class="preset-load" data-id="${preset.id}">加载</button>
        <button class="preset-delete" data-id="${preset.id}">删除</button>
      </div>
    `;
    
    item.querySelector('.preset-load').addEventListener('click', () => loadPreset(preset));
    item.querySelector('.preset-delete').addEventListener('click', () => deletePreset(preset.id));
    
    container.appendChild(item);
  });
}

async function savePreset() {
  const name = document.getElementById('presetName').value.trim();
  const chordProgression = document.getElementById('chordProgression').value.trim();
  const style = document.getElementById('styleSelect').value;
  const bpm = parseInt(document.getElementById('bpmInput').value);
  
  if (!name || !chordProgression) {
    alert('请输入预设名称和和弦进行');
    return;
  }
  
  try {
    await fetch('http://localhost:3001/api/presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, style, chord_progression: chordProgression, bpm })
    });
    document.getElementById('presetName').value = '';
    loadPresets();
  } catch (err) {
    console.error('保存预设失败:', err);
  }
}

function loadPreset(preset) {
  document.getElementById('chordProgression').value = preset.chord_progression;
  document.getElementById('styleSelect').value = preset.style;
  document.getElementById('bpmInput').value = preset.bpm;
}

async function deletePreset(id) {
  if (confirm('确定要删除这个预设吗？')) {
    try {
      await fetch(`http://localhost:3001/api/presets/${id}`, { method: 'DELETE' });
      loadPresets();
    } catch (err) {
      console.error('删除预设失败:', err);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initMidiInputs();
  loadPresets();
  
  document.getElementById('enableMidi').addEventListener('click', () => {
    const select = document.getElementById('midiInput');
    connectMidiInput(select.value);
  });
  
  document.getElementById('enableMidiOutput').addEventListener('click', () => {
    const select = document.getElementById('midiOutput');
    connectMidiOutput(select.value);
  });
  
  document.getElementById('clockToggleBtn').addEventListener('click', toggleMidiClock);
  
  document.getElementById('generateBtn').addEventListener('click', generateAccompaniment);
  document.getElementById('stopBtn').addEventListener('click', () => {
    document.getElementById('previewStatus').textContent = '已停止';
    document.getElementById('generateBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
  });
  
  document.getElementById('playBtn').addEventListener('click', togglePlayback);
  document.getElementById('stopPlaybackBtn').addEventListener('click', () => {
    stopPlayback();
    playbackPosition = 0;
    updatePlaybackDisplay();
  });
  
  document.getElementById('exportBtn').addEventListener('click', exportMidi);
  document.getElementById('exportStemBtn').addEventListener('click', exportStems);
  document.getElementById('savePresetBtn').addEventListener('click', savePreset);
});
