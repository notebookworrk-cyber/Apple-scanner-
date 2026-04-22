/* ============================================================
   APPLE QUALITY SCANNER — app.js
   Full TensorFlow.js browser app
   - Camera via getUserMedia
   - TF.js model inference (model/model.json + weights.bin)
   - Smart color-analysis fallback if no model found
   - Complete result display with animations
   ============================================================ */

'use strict';

/* ── Constants ── */
const MODEL_PATH     = 'model/model.json';   // Relative path to your TF.js model
const IMAGE_SIZE     = 224;                   // Expected input size (MobileNet-style)
const CLASSES        = ['fresh', 'rotten', 'unripe', 'ripe', 'overripe'];
const CONFIDENCE_MIN = 0.35;                  // Min confidence threshold

/* ── State ── */
const state = {
  model:       null,
  stream:      null,
  captured:    false,
  loading:     false,
  modelLoaded: false,
  modelFailed: false,
};

/* ── DOM References ── */
const $  = id => document.getElementById(id);
const $$ = sel => document.querySelector(sel);

const video         = $('videoFeed');
const canvas        = $('captureCanvas');
const ctx           = canvas.getContext('2d');

const scanBtn       = $('scanBtn');
const retakeBtn     = $('retakeBtn');
const requestCamBtn = $('requestCameraBtn');
const errorRetryBtn = $('errorRetryBtn');

const permissionOverlay = $('permissionOverlay');
const capturedBadge     = $('capturedBadge');
const cameraStatus      = $('cameraStatus');
const scanLine          = $('scanLine');

const loadingSection    = $('loadingSection');
const loadingSubText    = $('loadingSubText');
const resultsSection    = $('resultsSection');
const errorSection      = $('errorSection');
const errorTitle        = $('errorTitle');
const errorMessage      = $('errorMessage');

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  initCamera();
  preloadModel();   // Start loading in background
});

/* ── Event Binding ── */
function bindEvents() {
  scanBtn.addEventListener('click', handleScan);
  retakeBtn.addEventListener('click', handleRetake);
  requestCamBtn.addEventListener('click', initCamera);
  errorRetryBtn.addEventListener('click', handleRetake);
}

/* ═══════════════════════════════════════════
   CAMERA
═══════════════════════════════════════════ */
async function initCamera() {
  hidePermissionOverlay();

  const constraints = {
    video: {
      facingMode: { ideal: 'environment' },  // Use back camera on mobile
      width:  { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  };

  try {
    // Stop existing stream
    if (state.stream) {
      state.stream.getTracks().forEach(t => t.stop());
    }

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    state.stream = stream;
    video.srcObject = stream;

    video.onloadedmetadata = () => {
      video.play();
      setStatus('Point camera at an apple');
    };

    video.style.display = 'block';
    canvas.style.display = 'none';

  } catch (err) {
    console.warn('Camera error:', err);
    showPermissionOverlay();
    setStatus('Camera unavailable');

    // If camera fails entirely, still allow using a fallback demo
    if (err.name === 'NotAllowedError') {
      setStatus('Camera permission denied');
    } else if (err.name === 'NotFoundError') {
      setStatus('No camera found on this device');
    }
  }
}

function showPermissionOverlay() {
  permissionOverlay.style.display = 'flex';
}

function hidePermissionOverlay() {
  permissionOverlay.style.display = 'none';
}

function setStatus(text) {
  cameraStatus.textContent = text;
}

/* ── Capture Frame ── */
function captureFrame() {
  const w = video.videoWidth  || IMAGE_SIZE;
  const h = video.videoHeight || IMAGE_SIZE;

  canvas.width  = w;
  canvas.height = h;

  ctx.drawImage(video, 0, 0, w, h);

  // Show captured image, hide video
  canvas.style.display  = 'block';
  video.style.display   = 'none';

  capturedBadge.style.display = 'flex';
  state.captured = true;

  return canvas;
}

/* ═══════════════════════════════════════════
   MODEL LOADING
═══════════════════════════════════════════ */
async function preloadModel() {
  try {
    state.model      = await tf.loadLayersModel(MODEL_PATH);
    state.modelLoaded = true;
    console.log('✅ TF.js model loaded successfully');

    // Warm up the model
    const dummy = tf.zeros([1, IMAGE_SIZE, IMAGE_SIZE, 3]);
    await state.model.predict(dummy).data();
    dummy.dispose();
    console.log('✅ Model warmed up');

  } catch (err) {
    state.modelFailed = true;
    console.warn('⚠️  Model not found — using color-analysis fallback:', err.message);
  }
}

/* ═══════════════════════════════════════════
   SCAN HANDLER
═══════════════════════════════════════════ */
async function handleScan() {
  if (state.loading) return;

  // Check camera is working
  if (!state.stream && !state.captured) {
    showError('No Camera', 'Please allow camera access and try again.');
    return;
  }

  state.loading = true;
  scanBtn.disabled = true;
  hideResults();
  hideError();

  // 1. Capture frame
  captureFrame();
  setStatus('Analyzing...');
  startScanAnimation();
  showLoading('Preparing image...');

  // Small delay for UX feel
  await sleep(600);

  try {
    let predictions;

    if (state.modelLoaded && state.model) {
      // ── Real TF.js Inference ──
      updateLoadingText('Running AI model...');
      predictions = await runModelInference(canvas);
    } else {
      // ── Color-Analysis Fallback ──
      updateLoadingText('Running color analysis...');
      await sleep(800);
      predictions = await runColorAnalysisFallback(canvas);
    }

    await sleep(400);
    stopScanAnimation();
    showLoading(false);
    displayResults(predictions);

  } catch (err) {
    console.error('Prediction error:', err);
    stopScanAnimation();
    showLoading(false);
    showError('Analysis Failed', `Could not analyze the apple. ${err.message || 'Please try again.'}`);
    handleRetakeState();
  } finally {
    state.loading = false;
    scanBtn.disabled = false;
  }
}

/* ── Retake ── */
function handleRetake() {
  state.captured = false;
  capturedBadge.style.display = 'none';
  canvas.style.display        = 'none';
  video.style.display         = 'block';

  hideResults();
  hideError();
  stopScanAnimation();

  scanBtn.style.display   = 'flex';
  retakeBtn.style.display = 'none';

  setStatus('Point camera at an apple');
}

function handleRetakeState() {
  scanBtn.style.display   = 'flex';
  retakeBtn.style.display = 'flex';
}

/* ═══════════════════════════════════════════
   TF.JS INFERENCE
═══════════════════════════════════════════ */
async function runModelInference(canvasEl) {
  return tf.tidy(() => {
    // Preprocess: resize → normalize → batch
    const imgTensor = tf.browser.fromPixels(canvasEl)
      .resizeBilinear([IMAGE_SIZE, IMAGE_SIZE])
      .toFloat()
      .div(tf.scalar(255.0))
      .expandDims(0);

    const rawOutput = state.model.predict(imgTensor);

    // Handle both sigmoid (multi-label) and softmax (multi-class) outputs
    let probs;
    if (rawOutput.shape[rawOutput.shape.length - 1] === CLASSES.length) {
      // If output shape matches class count, treat as softmax/sigmoid
      const softmax = tf.softmax(rawOutput.squeeze());
      probs = softmax.arraySync();
    } else {
      // Generic: take first N outputs
      probs = rawOutput.squeeze().arraySync().slice(0, CLASSES.length);
    }

    return buildPredictions(probs);
  });
}

/* ═══════════════════════════════════════════
   COLOR ANALYSIS FALLBACK
   Works when no model.json exists.
   Samples pixel colors from the canvas and
   makes a heuristic quality prediction.
═══════════════════════════════════════════ */
async function runColorAnalysisFallback(canvasEl) {
  const imgData = canvasEl
    .getContext('2d')
    .getImageData(0, 0, canvasEl.width, canvasEl.height);

  const pixels = imgData.data;

  let rTotal = 0, gTotal = 0, bTotal = 0;
  let darkPixels = 0, brownPixels = 0;
  const sampleStep = 4 * 8; // Sample every 8th pixel for speed

  for (let i = 0; i < pixels.length; i += sampleStep) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    rTotal += r;
    gTotal += g;
    bTotal += b;

    // Dark/brown indicates rot
    if (r < 80 && g < 60 && b < 60) darkPixels++;
    if (r > 100 && g < 80 && b < 60 && r > g * 1.5) brownPixels++;
  }

  const pixelCount = pixels.length / sampleStep;
  const avgR = rTotal / pixelCount;
  const avgG = gTotal / pixelCount;
  const avgB = bTotal / pixelCount;

  const rotRatio   = (darkPixels + brownPixels) / pixelCount;
  const greenRatio = avgG / (avgR + avgG + avgB + 1);
  const redRatio   = avgR / (avgR + avgG + avgB + 1);
  const brightness = (avgR + avgG + avgB) / 3;

  // Build probability distribution
  let probs = [0, 0, 0, 0, 0]; // [fresh, rotten, unripe, ripe, overripe]

  if (rotRatio > 0.15 || brightness < 55) {
    // Likely rotten
    probs = [0.05, 0.70, 0.03, 0.10, 0.12];
  } else if (greenRatio > 0.38) {
    // Very green = unripe
    probs = [0.25, 0.05, 0.55, 0.12, 0.03];
  } else if (redRatio > 0.40 && avgR > 150) {
    // Deep red = ripe
    probs = [0.55, 0.05, 0.05, 0.28, 0.07];
  } else if (rotRatio > 0.06 || brightness > 190) {
    // Overripe / very bright yellow-brown
    probs = [0.12, 0.10, 0.04, 0.24, 0.50];
  } else {
    // Default: mostly fresh/ripe
    probs = [0.45, 0.08, 0.10, 0.30, 0.07];
  }

  // Add small random variance so it doesn't feel static
  probs = probs.map(p => Math.max(0.01, p + (Math.random() - 0.5) * 0.05));

  // Normalize
  const sum = probs.reduce((a, b) => a + b, 0);
  probs = probs.map(p => p / sum);

  return buildPredictions(probs);
}

/* ── Build Predictions Object ── */
function buildPredictions(rawProbs) {
  // Map probabilities to class names
  const predictions = CLASSES.map((cls, i) => ({
    class: cls,
    prob: rawProbs[i] || 0,
  })).sort((a, b) => b.prob - a.prob);

  return predictions;
}

/* ═══════════════════════════════════════════
   DISPLAY RESULTS
═══════════════════════════════════════════ */
function displayResults(predictions) {
  const top      = predictions[0];
  const topClass = top.class;
  const topProb  = top.prob;

  // ── Derive composite labels ──
  const condition  = deriveCondition(topClass, topProb);
  const ripeness   = deriveRipeness(topClass);
  const sweetness  = deriveSweetness(topClass);
  const verdict    = deriveVerdict(topClass, topProb);
  const emoji      = deriveEmoji(topClass);

  // ── Populate DOM ──
  $('resultIcon').textContent = emoji;
  $('resultTitle').textContent = capitalise(condition.label);
  $('resultConfidence').textContent = `${Math.round(topProb * 100)}% confidence · ${state.modelFailed ? 'Color analysis mode' : 'AI model'}`;

  // Badge
  const badge = $('resultBadge');
  badge.textContent = condition.badgeText;
  badge.className   = `result-badge ${condition.badgeClass}`;

  // Metrics
  $('metricCondition').textContent = condition.label;
  $('metricRipeness').textContent  = ripeness.label;

  // Animate bars after a tick
  requestAnimationFrame(() => {
    setTimeout(() => {
      $('metricConditionBar').style.width = `${condition.barPct}%`;
      $('metricRipenessBar').style.width  = `${ripeness.barPct}%`;
    }, 100);
  });

  // Sweetness dots
  renderSweetnessDots(sweetness);

  // Verdict
  $('verdictIcon').textContent = verdict.icon;
  $('verdictText').textContent = verdict.text;
  $('verdictBox').style.background = verdict.bg;
  $('verdictBox').style.borderColor = verdict.border;

  // All class probabilities
  renderProbsList(predictions);

  // Show section
  retakeBtn.style.display = 'flex';
  scanBtn.style.display   = 'none';
  resultsSection.style.display = 'block';

  // Scroll to results
  setTimeout(() => {
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 150);
}

/* ── Condition ── */
function deriveCondition(cls, prob) {
  const pct = Math.round(prob * 100);
  switch (cls) {
    case 'fresh':
      return { label: 'Fresh', badgeText: '✓ Fresh', badgeClass: 'badge-fresh', barPct: pct };
    case 'rotten':
      return { label: 'Rotten', badgeText: '✗ Rotten', badgeClass: 'badge-rotten', barPct: pct };
    case 'unripe':
      return { label: 'Unripe · Fresh', badgeText: 'Unripe', badgeClass: 'badge-warn', barPct: Math.round(pct * 0.7) };
    case 'ripe':
      return { label: 'Ripe · Perfect', badgeText: '★ Ripe', badgeClass: 'badge-fresh', barPct: pct };
    case 'overripe':
      return { label: 'Overripe', badgeText: 'Overripe', badgeClass: 'badge-warn', barPct: Math.round(pct * 0.6) };
    default:
      return { label: 'Unknown', badgeText: '?', badgeClass: 'badge-warn', barPct: 50 };
  }
}

/* ── Ripeness ── */
function deriveRipeness(cls) {
  const map = {
    fresh:    { label: 'Ripe',     barPct: 75 },
    rotten:   { label: 'Overripe', barPct: 100 },
    unripe:   { label: 'Unripe',   barPct: 20 },
    ripe:     { label: 'Ripe',     barPct: 85 },
    overripe: { label: 'Overripe', barPct: 95 },
  };
  return map[cls] || { label: 'Unknown', barPct: 50 };
}

/* ── Sweetness ── */
function deriveSweetness(cls) {
  const map = {
    fresh:    { dots: 4, max: 5, label: 'High',                  color: 'green' },
    ripe:     { dots: 5, max: 5, label: 'Very High',              color: 'amber' },
    overripe: { dots: 5, max: 5, label: 'Very sweet, soft texture', color: 'amber' },
    unripe:   { dots: 1, max: 5, label: 'Low sweetness',          color: 'green' },
    rotten:   { dots: 0, max: 5, label: 'Not edible',             color: 'red'   },
  };
  return map[cls] || { dots: 2, max: 5, label: 'Moderate', color: 'amber' };
}

/* ── Verdict ── */
function deriveVerdict(cls, prob) {
  const pct = Math.round(prob * 100);
  const map = {
    fresh: {
      icon: '✓',
      text: `This apple looks fresh and ready to eat. Quality score: ${pct}%.`,
      bg: 'rgba(45,140,69,0.08)',
      border: 'rgba(111,207,127,0.2)',
    },
    ripe: {
      icon: '★',
      text: `Perfect ripeness! Ideal time to eat for maximum flavor. Confidence: ${pct}%.`,
      bg: 'rgba(45,140,69,0.1)',
      border: 'rgba(111,207,127,0.25)',
    },
    unripe: {
      icon: '⏱',
      text: `This apple needs more time to ripen. Wait a few more days. Detection: ${pct}%.`,
      bg: 'rgba(232,168,58,0.06)',
      border: 'rgba(232,168,58,0.15)',
    },
    overripe: {
      icon: '⚠️',
      text: `Apple is overripe. Still safe to eat but texture will be soft. Score: ${pct}%.`,
      bg: 'rgba(232,168,58,0.08)',
      border: 'rgba(232,168,58,0.2)',
    },
    rotten: {
      icon: '✗',
      text: `Do not eat this apple. Signs of rot detected. Confidence: ${pct}%.`,
      bg: 'rgba(232,69,69,0.08)',
      border: 'rgba(232,69,69,0.2)',
    },
  };
  return map[cls] || {
    icon: '?',
    text: `Analysis complete. Please re-scan for better results.`,
    bg: 'rgba(255,255,255,0.04)',
    border: 'rgba(255,255,255,0.08)',
  };
}

/* ── Emoji ── */
function deriveEmoji(cls) {
  return {
    fresh:    '🍎',
    ripe:     '🍎',
    unripe:   '🍏',
    overripe: '🍂',
    rotten:   '🚫',
  }[cls] || '🍎';
}

/* ── Sweetness Dots ── */
function renderSweetnessDots(sweetness) {
  const container = $('sweetnessDots');
  container.innerHTML = '';

  for (let i = 0; i < sweetness.max; i++) {
    const dot = document.createElement('div');
    dot.className = 's-dot';
    if (i < sweetness.dots) {
      // Animate dots in staggered
      setTimeout(() => {
        dot.classList.add('active', sweetness.color);
      }, i * 120 + 300);
    }
    container.appendChild(dot);
  }

  $('sweetnessLabel').textContent = sweetness.label;
}

/* ── Probabilities List ── */
function renderProbsList(predictions) {
  const list = $('probsList');
  list.innerHTML = '';

  const colorMap = {
    fresh:    'p-fresh',
    rotten:   'p-rotten',
    unripe:   'p-unripe',
    ripe:     'p-ripe',
    overripe: 'p-overripe',
  };

  predictions.forEach((pred, idx) => {
    const pct = Math.round(pred.prob * 100);
    const row = document.createElement('div');
    row.className = 'prob-row';
    row.innerHTML = `
      <span class="prob-label">${capitalise(pred.class)}</span>
      <div class="prob-bar-wrap">
        <div class="prob-bar-fill ${colorMap[pred.class] || ''}" id="pbar-${idx}" style="width:0%"></div>
      </div>
      <span class="prob-percent">${pct}%</span>
    `;
    list.appendChild(row);

    // Animate bar
    setTimeout(() => {
      const fill = document.getElementById(`pbar-${idx}`);
      if (fill) fill.style.width = `${pct}%`;
    }, 200 + idx * 100);
  });
}

/* ═══════════════════════════════════════════
   UI HELPERS
═══════════════════════════════════════════ */
function showLoading(subtextOrFalse) {
  if (subtextOrFalse === false) {
    loadingSection.style.display = 'none';
    return;
  }
  loadingSubText.textContent   = subtextOrFalse || '';
  loadingSection.style.display = 'flex';
}

function updateLoadingText(text) {
  loadingSubText.textContent = text;
}

function hideResults() {
  resultsSection.style.display = 'none';
}

function hideError() {
  errorSection.style.display = 'none';
}

function showError(title, message) {
  errorTitle.textContent   = title;
  errorMessage.textContent = message;
  errorSection.style.display = 'flex';
  retakeBtn.style.display = 'flex';
  scanBtn.style.display   = 'none';
}

function startScanAnimation() {
  scanLine.classList.add('active');
}

function stopScanAnimation() {
  scanLine.classList.remove('active');
}

/* ── Utilities ── */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function capitalise(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
