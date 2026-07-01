/* ============================================================
   color-analysis.js — Fallback heuristic analysis when model unavailable
   ============================================================ */

import { CLASSES } from './classifier.js';

export async function runColorAnalysis(canvas) {
  const ctx = canvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imgData.data;

  let rTotal = 0, gTotal = 0, bTotal = 0;
  let darkPixels = 0, brownPixels = 0;
  const sampleStep = 4 * 8; // sample every 8th pixel

  for (let i = 0; i < pixels.length; i += sampleStep) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    rTotal += r;
    gTotal += g;
    bTotal += b;

    if (r < 80 && g < 60 && b < 60) darkPixels++;
    if (r > 100 && g < 80 && b < 60 && r > g * 1.5) brownPixels++;
  }

  const pixelCount = pixels.length / sampleStep;
  const avgR = rTotal / pixelCount;
  const avgG = gTotal / pixelCount;
  const avgB = bTotal / pixelCount;

  const rotRatio = (darkPixels + brownPixels) / pixelCount;
  const greenRatio = avgG / (avgR + avgG + avgB + 1);
  const redRatio = avgR / (avgR + avgG + avgB + 1);
  const brightness = (avgR + avgG + avgB) / 3;

  let probs = [0, 0, 0, 0, 0]; // fresh, rotten, unripe, ripe, overripe

  if (rotRatio > 0.15 || brightness < 55) {
    probs = [0.05, 0.70, 0.03, 0.10, 0.12];
  } else if (greenRatio > 0.38) {
    probs = [0.25, 0.05, 0.55, 0.12, 0.03];
  } else if (redRatio > 0.40 && avgR > 150) {
    probs = [0.55, 0.05, 0.05, 0.28, 0.07];
  } else if (rotRatio > 0.06 || brightness > 190) {
    probs = [0.12, 0.10, 0.04, 0.24, 0.50];
  } else {
    probs = [0.45, 0.08, 0.10, 0.30, 0.07];
  }

  // Add small random variance
  probs = probs.map(p => Math.max(0.01, p + (Math.random() - 0.5) * 0.05));
  const sum = probs.reduce((a, b) => a + b, 0);
  probs = probs.map(p => p / sum);

  return buildPredictions(probs);
}

function buildPredictions(rawProbs) {
  return CLASSES.map((cls, i) => ({
    class: cls,
    prob: rawProbs[i] || 0
  })).sort((a, b) => b.prob - a.prob);
}