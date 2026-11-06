// No build step: these globals come from the two CDN scripts in index.html.
const MODEL_URL = 'https://teachablemachine.withgoogle.com/models/987HOFcWM/';
const CONFIDENCE_THRESHOLD = 0.8;
const $ = (id) => document.getElementById(id);
const video = $('webcam');
const inputCanvas = document.createElement('canvas');
inputCanvas.width = inputCanvas.height = 224;
const context = inputCanvas.getContext('2d');
let modelPromise, model, labels = [], rows = [];
let stream = null, frameId = null, session = 0, activeTheme = null;
const MATCH_STREAK = 3;
const CHARACTER_PALETTES = {
  Coco: ['#E8B8B4', '#FFF9F1', '#B88764', '#DF658B'],
  Nono: ['#F6A34F', '#FFD85A', '#FFF9F1', '#EE8151'],
  Mimi: ['#A9DBF0', '#A5DFCA', '#C3B4E7', '#688ED7'],
  CoNoMi: ['#795548', '#E8B8B4', '#DBAF48', '#FFF9F1']
};
let candidate = null, candidateCount = 0, confirmedCharacter = null;
let visibleDecorationLayer = 0;
const motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
const mobilePreference = window.matchMedia?.('(max-width: 760px)');

function characterFor(index) {
  return index === null ? null : labels[index]?.trim().split(/\s+/).pop();
}

// Two bounded layers crossfade; CSS moves their small reusable particle pools.
function drawDecorations(character) {
  const layers = [$('decoration-a'), $('decoration-b')];
  const previous = layers[visibleDecorationLayer];
  visibleDecorationLayer = 1 - visibleDecorationLayer;
  const next = layers[visibleDecorationLayer];
  next.replaceChildren();
  previous.classList.remove('visible');
  if (motionPreference?.matches) {
    previous.replaceChildren();
    return;
  }
  const kind = { Coco: 'cookie', Nono: 'egg', Mimi: 'bubble', CoNoMi: 'heart' }[character] || 'ambient';
  const count = kind === 'bubble' ? (mobilePreference?.matches ? 12 : 24) : (mobilePreference?.matches ? 10 : 20);
  for (let i = 0; i < count; i++) {
    const floater = document.createElement('span');
    floater.className = 'floater floater-' + kind;
    floater.style.setProperty('--left', `${(i + Math.random()) / count * 100}%`);
    floater.style.setProperty('--size', `${kind === 'bubble' ? 20 + Math.random() * (mobilePreference?.matches ? 36 : 55) : 22 + Math.random() * 26}px`);
    const duration = (12 + Math.random() * 8) / 1.4;
    floater.style.setProperty('--duration', `${duration}s`);
    // Spread the reusable particles through the whole journey from the first frame.
    floater.style.setProperty('--delay', `${-(i + Math.random()) / count * duration}s`);
    floater.style.setProperty('--drift', `${Math.random() * 130 - 65}px`);
    floater.style.setProperty('--turn', `${Math.random() * 100 - 50}deg`);
    const shape = document.createElement('i');
    shape.className = 'floating-shape ' + kind;
    floater.append(shape);
    next.append(floater);
  }
  next.classList.add('visible');
}

function celebrate(character) {
  const container = $('confetti');
  container.replaceChildren(); // Rapid confirmed changes never accumulate bursts.
  if (motionPreference?.matches) return;
  const palette = CHARACTER_PALETTES[character];
  if (!palette) return;
  const count = mobilePreference?.matches ? 30 : 54;
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('span');
    const right = i % 2 === 1;
    piece.className = 'confetti-piece ' + ['paper', 'ribbon', 'dot', 'star'][i % 4];
    piece.style.setProperty('--edge', right ? '100%' : '0%');
    piece.style.setProperty('--travel', `${(right ? -1 : 1) * (22 + Math.random() * 40)}vw`);
    piece.style.setProperty('--lift', `${-120 - Math.random() * 180}px`);
    piece.style.setProperty('--fall', `${160 + Math.random() * 160}px`);
    piece.style.setProperty('--spin', `${Math.random() * 720 - 360}deg`);
    piece.style.setProperty('--color', palette[Math.floor(Math.random() * palette.length)]);
    piece.style.setProperty('--delay', `${Math.random() * 0.15}s`);
    piece.addEventListener('animationend', () => piece.remove(), { once: true });
    container.append(piece);
  }
}

function confirmCharacter(index) {
  const next = characterFor(index);
  if (!next || !CHARACTER_PALETTES[next]) { candidate = null; candidateCount = 0; return; }
  if (candidate === next) candidateCount = Math.min(MATCH_STREAK, candidateCount + 1);
  else { candidate = next; candidateCount = 1; }
  if (candidateCount < MATCH_STREAK || confirmedCharacter === next) return;
  confirmedCharacter = next;
  document.body.dataset.character = next;
  drawDecorations(next);
  celebrate(next);
}

function resetCharacterBackground() {
  candidate = null; candidateCount = 0; confirmedCharacter = null;
  delete document.body.dataset.character;
  $('confetti').replaceChildren();
  drawDecorations(null);
}

motionPreference?.addEventListener('change', () => {
  $('confetti').replaceChildren();
  drawDecorations(confirmedCharacter);
});
mobilePreference?.addEventListener('change', () => drawDecorations(confirmedCharacter));

function setStatus(message, error = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
}

async function loadModel() {
  if (!window.tf || !window.tmImage) throw new Error('The image libraries could not load. Check your internet connection and refresh.');
  // tmImage loads metadata.json and exposes its exact labels through getClassLabels().
  if (!modelPromise) {
    modelPromise = tmImage.load(MODEL_URL + 'model.json', MODEL_URL + 'metadata.json')
      .catch(() => { modelPromise = null; throw new Error('The model could not load. Check your internet connection and try again.'); });
  }
  return modelPromise;
}

function createScoreRows() {
  $('scores').replaceChildren();
  rows = labels.map((label) => {
    const row = document.createElement('div'); row.className = 'score';
    const heading = document.createElement('div'); heading.className = 'score-label';
    const name = document.createElement('span'); name.textContent = label;
    const value = document.createElement('span'); value.textContent = '—';
    heading.append(name, value);
    const track = document.createElement('div'); track.className = 'track';
    const fill = document.createElement('div'); fill.className = 'fill';
    track.append(fill); row.append(heading, track); $('scores').append(row);
    return { value, fill };
  });
}

// Presentation only: recognition and camera processing remain independent.
function setTheme(index) {
  if (activeTheme === index) return;
  activeTheme = index;
  $('effects').replaceChildren();
  // Match the English part of the metadata label, independent of class order.
  const avatarFiles = { Coco: 'Coco.jpg', Nono: 'Nono.jpg', Mimi: 'Mimi.jpg', CoNoMi: 'CoNoMi.jpg' };
  const messages = {
    Coco: 'Coco is here to watch over Mimi!',
    Nono: 'Nono brings a little more magic to C929!',
    Mimi: "Here's Mimi, the luckiest one on C929!",
    CoNoMi: 'Together, they make C929 feel like home.'
  };
  const className = index === null ? '' : labels[index];
  const character = className.trim().split(/\s+/).pop();
  const avatarFile = avatarFiles[character];
  $('character-message').textContent = messages[character] || 'A familiar face makes this little planet feel like home.';
  $('result-avatar').hidden = !avatarFile;
  $('result-symbol').hidden = Boolean(avatarFile);
  if (avatarFile) {
    $('result-avatar').src = avatarFile;
    $('result-avatar').alt = className;
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      $('result-avatar').animate?.([{ opacity: 0.3, transform: 'translateY(3px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 300, easing: 'ease-out' });
    }
  }
  if (index === null) { delete document.body.dataset.theme; $('result-symbol').textContent = '♡'; return; }
  const theme = index % 4;
  document.body.dataset.theme = theme;
  for (let i = 0; i < 3; i++) {
    const particle = document.createElement('span');
    particle.className = 'particle';
    particle.textContent = '✦';
    $('effects').append(particle);
  }
}

function renderPredictions(predictions) {
  let bestIndex = -1, bestProbability = CONFIDENCE_THRESHOLD;
  labels.forEach((label, index) => {
    const probability = predictions.find((item) => item.className === label)?.probability || 0;
    rows[index].value.textContent = `${(probability * 100).toFixed(1)}%`;
    rows[index].fill.style.width = `${probability * 100}%`;
    if (probability > bestProbability) { bestIndex = index; bestProbability = probability; }
  });
  confirmCharacter(bestIndex < 0 ? null : bestIndex);
  // Scores stay live; a new avatar/name waits for the short confirmation streak.
  if (bestIndex >= 0 && CHARACTER_PALETTES[characterFor(bestIndex)] && characterFor(bestIndex) !== confirmedCharacter) bestIndex = -1;
  $('prediction').textContent = bestIndex < 0 ? 'Searching...' : labels[bestIndex];
  $('confidence').textContent = bestIndex < 0 ? 'Someone sweet is on their way...' : `${(bestProbability * 100).toFixed(1)}% confidence`;
  setTheme(bestIndex < 0 ? null : bestIndex);
}

async function predictLoop(token) {
  if (token !== session || !stream) return;
  try {
    if (video.readyState >= 2 && video.videoWidth) {
      // Center-crop the camera frame to the square input used in training.
      const size = Math.min(video.videoWidth, video.videoHeight);
      context.drawImage(video, (video.videoWidth - size) / 2, (video.videoHeight - size) / 2, size, size, 0, 0, 224, 224);
      const predictions = await model.predict(inputCanvas);
      if (token !== session) return; // Ignore an inference finishing after Stop.
      renderPredictions(predictions);
    }
    if (token === session) frameId = requestAnimationFrame(() => predictLoop(token));
  } catch (error) {
    if (token !== session) return;
    stopCamera(); setStatus('Prediction paused. Please try starting the camera again.', true);
    console.error(error);
  }
}

function stopCamera() {
  session++; // Invalidates all pending startup and prediction work.
  cancelAnimationFrame(frameId); frameId = null;
  if (stream) stream.getTracks().forEach((track) => track.stop());
  stream = null; video.pause(); video.srcObject = null; video.hidden = true;
  $('placeholder').hidden = false;
  $('start').disabled = false; $('stop').disabled = true;
  $('camera-state').textContent = '● Camera off'; $('camera-state').classList.remove('live');
  $('prediction').textContent = 'Someone sweet is on their way...';
  $('confidence').textContent = 'Waiting for a little camera magic.';
  rows.forEach(({ value, fill }) => { value.textContent = '—'; fill.style.width = '0%'; });
  setTheme(null); setStatus('Camera stopped. Come back for more little discoveries.');
  resetCharacterBackground();
}

async function startCamera() {
  const token = ++session;
  $('start').disabled = true; $('stop').disabled = false;
  setStatus('Loading your recognition model…');
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera access needs HTTPS or localhost. Open this site with Live Server on this computer, or use an HTTPS deployment.');
    }
    const loadedModel = await loadModel();
    if (token !== session) return;
    model = loadedModel; labels = model.getClassLabels(); createScoreRows();
    setStatus('Allow camera access in your browser to begin.');
    const requestedStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    // Permission dialogs may finish after the user presses Stop.
    if (token !== session) { requestedStream.getTracks().forEach((track) => track.stop()); return; }
    stream = requestedStream; video.srcObject = stream; video.hidden = false;
    $('placeholder').hidden = true;
    await video.play();
    if (token !== session) return;
    stream.getVideoTracks().forEach((track) => track.addEventListener('ended', () => {
      if (token === session) { stopCamera(); setStatus('The camera disconnected. Reconnect it and try again.', true); }
    }));
    $('camera-state').textContent = '● Camera live'; $('camera-state').classList.add('live');
    $('prediction').textContent = 'Searching...';
    setStatus('You’re live! Hold your subject steady in the center of the frame.');
    frameId = requestAnimationFrame(() => predictLoop(token));
  } catch (error) {
    if (token !== session) return;
    stopCamera();
    const messages = {
      NotAllowedError: 'Camera permission was denied. Allow camera access in your browser’s site settings, then try again.',
      NotFoundError: 'No camera was found. Connect a camera and try again.',
      NotReadableError: 'Your camera is unavailable. Close other apps using it and try again.'
    };
    setStatus(messages[error.name] || error.message || 'Something went wrong. Please try again.', true);
  }
}

$('start').addEventListener('click', startCamera);
$('stop').addEventListener('click', stopCamera);
window.addEventListener('pagehide', stopCamera);
document.addEventListener('visibilitychange', () => { if (document.hidden && $('start').disabled) stopCamera(); });
drawDecorations(null);
