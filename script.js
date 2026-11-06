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

// Visuals follow metadata order, so renamed or additional classes work automatically.
function setTheme(index) {
  if (activeTheme === index) return;
  activeTheme = index;
  $('effects').replaceChildren();
  if (index === null) { delete document.body.dataset.theme; $('result-symbol').textContent = '✧'; return; }
  const theme = index % 4;
  document.body.dataset.theme = theme;
  const symbols = ['♥', '✦', '○', '✿'];
  const effects = ['hearts', 'stars', 'bubbles', 'confetti'];
  $('result-symbol').textContent = symbols[theme];
  for (let i = 0; i < 16; i++) {
    const particle = document.createElement('span');
    particle.className = 'particle ' + effects[theme];
    particle.textContent = theme === 2 ? '' : symbols[theme];
    particle.style.setProperty('--x', `${(i * 37) % 100}%`);
    particle.style.setProperty('--y', `${(i * 23) % 100}%`);
    particle.style.setProperty('--duration', `${5 + i % 5}s`);
    particle.style.setProperty('--delay', `${-i * 0.7}s`);
    particle.style.setProperty('--size', `${14 + i % 4 * 7}px`);
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
  $('prediction').textContent = bestIndex < 0 ? 'Searching...' : labels[bestIndex];
  $('confidence').textContent = bestIndex < 0 ? 'Keep your subject in view — looking for a confident match.' : `${(bestProbability * 100).toFixed(1)}% confidence · Hello, you!`;
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
  $('prediction').textContent = 'A little mystery…';
  $('confidence').textContent = 'Your next discovery is one click away.';
  rows.forEach(({ value, fill }) => { value.textContent = '—'; fill.style.width = '0%'; });
  setTheme(null); setStatus('Camera stopped. Come back for more little discoveries.');
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
