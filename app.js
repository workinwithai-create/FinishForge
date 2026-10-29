// FinishForge – WorkinWithAI compliant arrangement desk
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;
const SAMPLE_RATE = 48000;

const state = {
  bpm: 92,
  key: 0, // semitones from C
  bars: 32,
  chords: ['Am', 'F', 'C', 'G'],
  playing: false,
  muted: { drums: false, bass: false, keys: false, pad: false },
  patterns: {
    drums: Array(16).fill(false).map((_, i) => i % 4 === 0 || i === 4 || i === 12),
    // simple kick/snare/hat encoded as numbers later
  }
};

let ctx, master, compressor, timerId, nextStepTime, step, activeSources = [];
let playheadRaf;

const chairs = ['drums', 'bass', 'keys', 'pad'];

function initUI() {
  const chairsEl = document.getElementById('chairs');
  chairs.forEach(name => {
    const div = document.createElement('div');
    div.className = 'chair';
    div.innerHTML = `<h3>${name.charAt(0).toUpperCase() + name.slice(1)} <button data-mute="${name}">Mute</button></h3>
      <div class="grid" id="grid-${name}"></div>`;
    chairsEl.appendChild(div);
    const grid = document.getElementById(`grid-${name}`);
    for (let i = 0; i < 16; i++) {
      const s = document.createElement('div');
      s.className = 'step' + (name === 'drums' && (i % 4 === 0 || i === 4 || i === 12) ? ' on' : '');
      s.dataset.step = i;
      s.onclick = () => { s.classList.toggle('on'); };
      grid.appendChild(s);
    }
  });

  document.getElementById('bpm').onchange = e => { state.bpm = +e.target.value; localStorage.setItem('ff-bpm', state.bpm); };
  document.getElementById('key').onchange = e => { state.key = e.target.selectedIndex; localStorage.setItem('ff-key', state.key); };
  document.getElementById('bars').onchange = e => { state.bars = +e.target.value; };
  ['c1','c2','c3','c4'].forEach((id, i) => {
    document.getElementById(id).onchange = e => { state.chords[i] = e.target.value; };
  });

  document.querySelectorAll('[data-mute]').forEach(btn => {
    btn.onclick = () => {
      const n = btn.dataset.mute;
      state.muted[n] = !state.muted[n];
      btn.parentElement.parentElement.classList.toggle('muted', state.muted[n]);
    };
  });

  document.getElementById('play').onclick = start;
  document.getElementById('stop').onclick = stop;
  document.getElementById('export').onclick = exportAudio;

  // load persist
  if (localStorage.getItem('ff-bpm')) document.getElementById('bpm').value = state.bpm = +localStorage.getItem('ff-bpm');
  if (localStorage.getItem('ff-key')) {
    state.key = +localStorage.getItem('ff-key');
    document.getElementById('key').selectedIndex = state.key;
  }
}

function ensureCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE });
    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -1;
    compressor.knee.value = 0;
    compressor.ratio.value = 20;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(compressor);
    compressor.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  document.getElementById('status').textContent = 'Audio ready';
  return ctx;
}

function noteFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function scheduleStep(s, time) {
  const barStep = s % 16;
  const chordIdx = Math.floor((s / 16) % 4);
  const root = chordRoot(state.chords[chordIdx]) + state.key;

  // Drums
  if (!state.muted.drums) {
    if (barStep % 4 === 0) playKick(time);
    if (barStep === 4 || barStep === 12) playSnare(time);
    if (barStep % 2 === 0) playHat(time);
  }
  // Bass
  if (!state.muted.bass && barStep % 4 === 0) playBass(root - 12, time, 0.25);
  // Keys
  if (!state.muted.keys && barStep === 0) playChord(root, time, 0.9);
  // Pad
  if (!state.muted.pad && barStep === 0) playPad(root, time, 3.9);
}

function playKick(time) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(150, time);
  o.frequency.exponentialRampToValueAtTime(40, time + 0.1);
  g.gain.setValueAtTime(1, time);
  g.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
  o.connect(g); g.connect(master);
  o.start(time); o.stop(time + 0.35);
  activeSources.push(o);
}
function playSnare(time) {
  const b = ctx.createBufferSource();
  const buffer = ctx.createBuffer(1, SAMPLE_RATE * 0.2, SAMPLE_RATE);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  b.buffer = buffer;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass'; f.frequency.value = 1000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.6, time);
  g.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
  b.connect(f); f.connect(g); g.connect(master);
  b.start(time); b.stop(time + 0.22);
  activeSources.push(b);
}
function playHat(time) {
  const b = ctx.createBufferSource();
  const buffer = ctx.createBuffer(1, SAMPLE_RATE * 0.05, SAMPLE_RATE);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  b.buffer = buffer;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.3, time);
  g.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
  b.connect(g); g.connect(master);
  b.start(time); b.stop(time + 0.05);
  activeSources.push(b);
}
function playBass(midi, time, dur) {
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = noteFreq(midi);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(0.5, time + 0.02);
  g.gain.linearRampToValueAtTime(0, time + dur);
  o.connect(g); g.connect(master);
  o.start(time); o.stop(time + dur + 0.02);
  activeSources.push(o);
}
function playChord(root, time, dur) {
  [0, 3, 7].forEach(int => { // minor-ish, simple
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = noteFreq(root + int + 12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(0.2, time + 0.01);
    g.gain.linearRampToValueAtTime(0, time + dur);
    o.connect(g); g.connect(master);
    o.start(time); o.stop(time + dur + 0.02);
    activeSources.push(o);
  });
}
function playPad(root, time, dur) {
  [0, 4, 7].forEach(int => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = noteFreq(root + int + 24);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(0.15, time + 0.4); // swell
    g.gain.linearRampToValueAtTime(0.1, time + dur - 0.2);
    g.gain.linearRampToValueAtTime(0, time + dur);
    o.connect(g); g.connect(master);
    o.start(time); o.stop(time + dur + 0.02);
    activeSources.push(o);
  });
}

function chordRoot(sym) {
  const map = { C:0, 'C#':1, D:2, 'D#':3, E:4, F:5, 'F#':6, G:7, 'G#':8, A:9, 'A#':10, B:11, Am:9, F:5, C:0, G:7, Dm:2, Em:4 };
  return map[sym] || 0;
}

function scheduler() {
  while (nextStepTime < ctx.currentTime + SCHEDULE_AHEAD) {
    scheduleStep(step, nextStepTime);
    const stepDur = 60 / state.bpm / 4;
    nextStepTime += stepDur;
    step = (step + 1) % (state.bars * 16);
  }
}

function start() {
  ensureCtx();
  if (state.playing) return;
  state.playing = true;
  nextStepTime = ctx.currentTime + 0.1;
  step = 0;
  timerId = setInterval(scheduler, LOOKAHEAD_MS);
  playheadRaf = requestAnimationFrame(updatePlayhead);
  document.getElementById('status').textContent = 'Playing';
}

function stop() {
  state.playing = false;
  if (timerId) clearInterval(timerId);
  activeSources.forEach(s => { try { s.stop(); } catch(e){} });
  activeSources = [];
  if (playheadRaf) cancelAnimationFrame(playheadRaf);
  document.getElementById('playhead').style.width = '0';
  document.getElementById('status').textContent = 'Stopped';
}

function updatePlayhead() {
  if (!state.playing) return;
  const progress = (ctx.currentTime % (state.bars * 4 * 60 / state.bpm)) / (state.bars * 4 * 60 / state.bpm);
  document.getElementById('playhead').style.width = (progress * 100) + '%';
  playheadRaf = requestAnimationFrame(updatePlayhead);
}

async function exportAudio() {
  ensureCtx();
  const bars = state.bars;
  const bpm = state.bpm;
  const length = Math.round(bars * 4 * 60 / bpm * SAMPLE_RATE);
  const offline = new OfflineAudioContext(2, length + SAMPLE_RATE, SAMPLE_RATE); // extra for tail
  // recreate graph... simplified: render by scheduling into offline
  // For MVP, note that full render would replay the scheduler into offline context.
  // Here we generate a simple stereo buffer and download.
  const buffer = offline.createBuffer(2, length, SAMPLE_RATE);
  // Fill with silence + note that real implementation schedules the same voices into offline.
  const blob = await bufferToWav(buffer, SAMPLE_RATE);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `finishforge-recipe-${bpm}bpm-${document.getElementById('key').value}.wav`;
  a.click();
  // MIDI similarly
  alert('WAV exported (MVP: silence placeholder – full engine render in production). MIDI track per chair would follow.');
}

function bufferToWav(buffer, rate) {
  // minimal 16-bit WAV writer
  const numCh = buffer.numberOfChannels;
  const len = buffer.length * numCh * 2 + 44;
  const view = new DataView(new ArrayBuffer(len));
  writeString(view, 0, 'RIFF');
  view.setUint32(4, len - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * numCh * 2, true);
  view.setUint16(32, numCh * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, len - 44, true);
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }
  return new Blob([view], { type: 'audio/wav' });
}
function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.playing) stop();
});

initUI();
console.log('FinishForge loaded. Audio engine: lookahead scheduler, live state, OfflineAudioContext exports.');
