/* ============================================================
   classifier.js — Model loading, inference, warm-up, confidence threshold
   ============================================================ */

import * as tf from '@tensorflow/tfjs';

export const CLASSES = ['fresh', 'rotten', 'unripe', 'ripe', 'overripe'];
export const IMAGE_SIZE = 224;
export const CONFIDENCE_THRESHOLD = 0.35;

export class Classifier {
  constructor() {
    this.model = null;
    this.modelLoaded = false;
    this.modelFailed = false;
  }

  async loadModel(modelPath = '/models/model.json') {
    try {
      this.model = await tf.loadLayersModel(modelPath);
      this.modelLoaded = true;
      console.log('✅ TF.js model loaded successfully');
      await this.warmUp();
    } catch (err) {
      this.modelFailed = true;
      console.warn('⚠️ Model not found — using color-analysis fallback:', err.message);
    }
  }

  async warmUp() {
    if (!this.model) return;
    const dummy = tf.zeros([1, IMAGE_SIZE, IMAGE_SIZE, 3]);
    const pred = this.model.predict(dummy);
    await pred.data();
    dummy.dispose();
    pred.dispose();
    console.log('✅ Model warmed up');
  }

  async predict(canvas) {
    if (!this.modelLoaded || !this.model) {
      throw new Error('Model not loaded');
    }
    return tf.tidy(() => {
      const imgTensor = tf.browser.fromPixels(canvas)
        .resizeBilinear([IMAGE_SIZE, IMAGE_SIZE])
        .toFloat()
        .div(tf.scalar(255.0))
        .expandDims(0);

      const rawOutput = this.model.predict(imgTensor);
      let probs;
      if (rawOutput.shape[rawOutput.shape.length - 1] === CLASSES.length) {
        const softmax = tf.softmax(rawOutput.squeeze());
        probs = softmax.arraySync();
      } else {
        probs = rawOutput.squeeze().arraySync().slice(0, CLASSES.length);
      }
      return this._buildPredictions(probs);
    });
  }

  _buildPredictions(rawProbs) {
    const predictions = CLASSES.map((cls, i) => ({
      class: cls,
      prob: rawProbs[i] || 0
    })).sort((a, b) => b.prob - a.prob);

    // Apply confidence threshold: hide low-confidence predictions
    return predictions.filter(p => p.prob >= CONFIDENCE_THRESHOLD);
  }

  isModelReady() {
    return this.modelLoaded && !this.modelFailed;
  }

  isModelFailed() {
    return this.modelFailed;
  }
}