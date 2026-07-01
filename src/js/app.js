/* ============================================================
   app.js — Bootstrap, wiring modules, event listeners, scan history (IndexedDB)
   ============================================================ */

import { CameraManager } from './camera.js';
import { Classifier, CONFIDENCE_THRESHOLD } from './classifier.js';
import { runColorAnalysis } from './color-analysis.js';
import { 
  showLoading, hideResults, hideError, showError,
  startScanAnimation, stopScanAnimation,
  setCameraStatus, setRetakeState, setScanState,
  displayResults
} from './ui.js';
import { openDB } from 'idb';

const SLEEP = ms => new Promise(r => setTimeout(r, ms));

/* ---- IndexedDB for scan history ---- */
const DB_NAME = 'apple-scanner-history';
const STORE_NAME = 'scans';

async function getDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    }
  });
}

async function saveScan(record) {
  const db = await getDB();
  await db.add(STORE_NAME, { ...record, timestamp: Date.now() });
}

async function loadHistory(limit = 20) {
  const db = await getDB();
  const all = await db.getAllFromIndex(STORE_NAME, null);
  return all.slice(-limit).reverse();
}

/* ---- DOM refs ---- */
const video = document.getElementById('videoFeed');
const canvas = document.getElementById('captureCanvas');
const permissionOverlay = document.getElementById('permissionOverlay');
const capturedBadge = document.getElementById('capturedBadge');

const scanBtn = document.getElementById('scanBtn');
const retakeBtn = document.getElementById('retakeBtn');
const requestCamBtn = document.getElementById('requestCameraBtn');
const errorRetryBtn = document.getElementById('errorRetryBtn');

/* ---- Managers ---- */
const camera = new CameraManager(
  video, canvas,
  document.getElementById('cameraStatus'),
  permissionOverlay,
  capturedBadge
);

const classifier = new Classifier();

let loading = false;

/* ---- Init ---- */
async function init() {
  bindEvents();
  await camera.init();
  await classifier.loadModel(); // loads local /models/model.json
  // Warm-up already done in loadModel
}

/* ---- Event binding ---- */
function bindEvents() {
  scanBtn.addEventListener('click', handleScan);
  retakeBtn.addEventListener('click', handleRetake);
  requestCamBtn.addEventListener('click', () => camera.init());
  errorRetryBtn.addEventListener('click', handleRetake);
}

/* ---- Scan handler ---- */
async function handleScan() {
  if (loading) return;
  if (!camera.captured && !camera.stream) {
    showError('No Camera', 'Please allow camera access or choose an image from gallery.');
    return;
  }

  loading = true;
  scanBtn.disabled = true;
  hideResults();
  hideError();

  camera.captureFrame();
  setCameraStatus('Analyzing...');
  startScanAnimation();
  showLoading('Preparing image...');
  await SLEEP(600);

  try {
    let predictions;
    if (classifier.isModelReady()) {
      showLoading('Running AI model...');
      predictions = await classifier.predict(canvas);
    } else {
      showLoading('Running color analysis...');
      await SLEEP(800);
      predictions = await runColorAnalysis(canvas);
    }

    await SLEEP(400);
    stopScanAnimation();
    showLoading(false);
    displayResults(predictions, classifier.isModelFailed());

    // Save to history
    const top = predictions[0];
    await saveScan({
      label: top.class,
      confidence: top.prob,
      modelUsed: classifier.isModelFailed() ? 'color-analysis' : 'tfjs'
    });

  } catch (err) {
    console.error('Prediction error:', err);
    stopScanAnimation();
    showLoading(false);
    showError('Analysis Failed', `Could not analyze the apple. ${err.message || 'Please try again.'}`);
    setRetakeState();
  } finally {
    loading = false;
    scanBtn.disabled = false;
  }
}

/* ---- Retake ---- */
function handleRetake() {
  camera.reset();
  hideResults();
  hideError();
  stopScanAnimation();
  setScanState();
  setCameraStatus('Point camera at an apple');
}

/* ---- Start ---- */
document.addEventListener('DOMContentLoaded', init);