/* ============================================================
   ui.js — DOM updates, result cards, confidence %, animations
   ============================================================ */

import { CLASSES } from './classifier.js';

const $ = id => document.getElementById(id);

export function showLoading(subtext) {
  const section = $('loadingSection');
  const sub = $('loadingSubText');
  if (subtext === false) {
    section.style.display = 'none';
    return;
  }
  sub.textContent = subtext || '';
  section.style.display = 'flex';
}

export function hideResults() {
  $('resultsSection').style.display = 'none';
}

export function hideError() {
  $('errorSection').style.display = 'none';
}

export function showError(title, message) {
  $('errorTitle').textContent = title;
  $('errorMessage').textContent = message;
  $('errorSection').style.display = 'flex';
  $('retakeBtn').style.display = 'flex';
  $('scanBtn').style.display = 'none';
}

export function startScanAnimation() {
  $('scanLine').classList.add('active');
}

export function stopScanAnimation() {
  $('scanLine').classList.remove('active');
}

export function setCameraStatus(text) {
  $('cameraStatus').textContent = text;
}

export function setRetakeState() {
  $('scanBtn').style.display = 'flex';
  $('retakeBtn').style.display = 'flex';
}

export function setScanState() {
  $('scanBtn').style.display = 'flex';
  $('retakeBtn').style.display = 'none';
}

export function displayResults(predictions, modelFailed) {
  const top = predictions[0];
  const topClass = top.class;
  const topProb = top.prob;

  const condition = deriveCondition(topClass, topProb);
  const ripeness = deriveRipeness(topClass);
  const sweetness = deriveSweetness(topClass);
  const verdict = deriveVerdict(topClass, topProb);
  const emoji = deriveEmoji(topClass);

  $('resultIcon').textContent = emoji;
  $('resultTitle').textContent = capitalize(condition.label);
  $('resultConfidence').textContent = `${Math.round(topProb * 100)}% confidence · ${modelFailed ? 'Color analysis mode' : 'AI model'}`;

  const badge = $('resultBadge');
  badge.textContent = condition.badgeText;
  badge.className = `result-badge ${condition.badgeClass}`;

  $('metricCondition').textContent = condition.label;
  $('metricRipeness').textContent = ripeness.label;

  requestAnimationFrame(() => {
    setTimeout(() => {
      $('metricConditionBar').style.width = `${condition.barPct}%`;
      $('metricRipenessBar').style.width = `${ripeness.barPct}%`;
    }, 100);
  });

  renderSweetnessDots(sweetness);

  $('verdictIcon').textContent = verdict.icon;
  $('verdictText').textContent = verdict.text;
  $('verdictBox').style.background = verdict.bg;
  $('verdictBox').style.borderColor = verdict.border;

  renderProbsList(predictions);

  $('retakeBtn').style.display = 'flex';
  $('scanBtn').style.display = 'none';
  $('resultsSection').style.display = 'block';

  setTimeout(() => {
    $('resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 150);
}

function deriveCondition(cls, prob) {
  const pct = Math.round(prob * 100);
  switch (cls) {
    case 'fresh': return { label: 'Fresh', badgeText: '✓ Fresh', badgeClass: 'badge-fresh', barPct: pct };
    case 'rotten': return { label: 'Rotten', badgeText: '✗ Rotten', badgeClass: 'badge-rotten', barPct: pct };
    case 'unripe': return { label: 'Unripe · Fresh', badgeText: 'Unripe', badgeClass: 'badge-warn', barPct: Math.round(pct * 0.7) };
    case 'ripe': return { label: 'Ripe · Perfect', badgeText: '★ Ripe', badgeClass: 'badge-fresh', barPct: pct };
    case 'overripe': return { label: 'Overripe', badgeText: 'Overripe', badgeClass: 'badge-warn', barPct: Math.round(pct * 0.6) };
    default: return { label: 'Unknown', badgeText: '?', badgeClass: 'badge-warn', barPct: 50 };
  }
}

function deriveRipeness(cls) {
  const map = {
    fresh: { label: 'Ripe', barPct: 75 },
    rotten: { label: 'Overripe', barPct: 100 },
    unripe: { label: 'Unripe', barPct: 20 },
    ripe: { label: 'Ripe', barPct: 85 },
    overripe: { label: 'Overripe', barPct: 95 }
  };
  return map[cls] || { label: 'Unknown', barPct: 50 };
}

function deriveSweetness(cls) {
  const map = {
    fresh: { dots: 4, max: 5, label: 'High', color: 'green' },
    ripe: { dots: 5, max: 5, label: 'Very High', color: 'amber' },
    overripe: { dots: 5, max: 5, label: 'Very sweet, soft texture', color: 'amber' },
    unripe: { dots: 1, max: 5, label: 'Low sweetness', color: 'green' },
    rotten: { dots: 0, max: 5, label: 'Not edible', color: 'red' }
  };
  return map[cls] || { dots: 2, max: 5, label: 'Moderate', color: 'amber' };
}

function deriveVerdict(cls, prob) {
  const pct = Math.round(prob * 100);
  const map = {
    fresh: { icon: '✓', text: `This apple looks fresh and ready to eat. Quality score: ${pct}%.`, bg: 'rgba(45,140,69,0.08)', border: 'rgba(111,207,127,0.2)' },
    ripe: { icon: '★', text: `Perfect ripeness! Ideal time to eat for maximum flavor. Confidence: ${pct}%.`, bg: 'rgba(45,140,69,0.1)', border: 'rgba(111,207,127,0.25)' },
    unripe: { icon: '⏱', text: `This apple needs more time to ripen. Wait a few more days. Detection: ${pct}%.`, bg: 'rgba(232,168,58,0.06)', border: 'rgba(232,168,58,0.15)' },
    overripe: { icon: '⚠️', text: `Apple is overripe. Still safe to eat but texture will be soft. Score: ${pct}%.`, bg: 'rgba(232,168,58,0.08)', border: 'rgba(232,168,58,0.2)' },
    rotten: { icon: '✗', text: `Do not eat this apple. Signs of rot detected. Confidence: ${pct}%.`, bg: 'rgba(232,69,69,0.08)', border: 'rgba(232,69,69,0.2)' }
  };
  return map[cls] || { icon: '?', text: `Analysis complete. Please re-scan for better results.`, bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)' };
}

function deriveEmoji(cls) {
  return { fresh: '🍎', ripe: '🍎', unripe: '🍏', overripe: '🍂', rotten: '🚫' }[cls] || '🍎';
}

function renderSweetnessDots(sweetness) {
  const container = $('sweetnessDots');
  container.innerHTML = '';
  for (let i = 0; i < sweetness.max; i++) {
    const dot = document.createElement('div');
    dot.className = 's-dot';
    if (i < sweetness.dots) {
      setTimeout(() => dot.classList.add('active', sweetness.color), i * 120 + 300);
    }
    container.appendChild(dot);
  }
  $('sweetnessLabel').textContent = sweetness.label;
}

function renderProbsList(predictions) {
  const list = $('probsList');
  list.innerHTML = '';
  const colorMap = { fresh: 'p-fresh', rotten: 'p-rotten', unripe: 'p-unripe', ripe: 'p-ripe', overripe: 'p-overripe' };
  predictions.forEach((pred, idx) => {
    const pct = Math.round(pred.prob * 100);
    const row = document.createElement('div');
    row.className = 'prob-row';
    row.innerHTML = `
      <span class="prob-label">${capitalize(pred.class)}</span>
      <div class="prob-bar-wrap">
        <div class="prob-bar-fill ${colorMap[pred.class] || ''}" id="pbar-${idx}" style="width:0%"></div>
      </div>
      <span class="prob-percent">${pct}%</span>
    `;
    list.appendChild(row);
    setTimeout(() => {
      const fill = document.getElementById(`pbar-${idx}`);
      if (fill) fill.style.width = `${pct}%`;
    }, 200 + idx * 100);
  });
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}