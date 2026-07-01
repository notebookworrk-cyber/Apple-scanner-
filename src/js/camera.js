/* ============================================================
   camera.js — Camera capture, stream management, permission handling, gallery upload
   ============================================================ */

export class CameraManager {
  constructor(videoElement, canvasElement, statusElement, permissionOverlay, capturedBadge) {
    this.video = videoElement;
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.statusEl = statusElement;
    this.permissionOverlay = permissionOverlay;
    this.capturedBadge = capturedBadge;
    this.stream = null;
    this.captured = false;
    this.galleryInput = document.getElementById('galleryInput');
    this._bindGallery();
  }

  _bindGallery() {
    if (this.galleryInput) {
      this.galleryInput.addEventListener('change', (e) => this.handleGalleryFile(e));
    }
  }

  async init() {
    this.hidePermissionOverlay();
    const constraints = {
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };

    try {
      if (this.stream) {
        this.stream.getTracks().forEach(t => t.stop());
      }
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.video.srcObject = this.stream;
      await new Promise(resolve => {
        this.video.onloadedmetadata = () => {
          this.video.play();
          resolve();
        };
      });
      this.video.style.display = 'block';
      this.canvas.style.display = 'none';
      this.captured = false;
      this.capturedBadge.style.display = 'none';
      this.setStatus('Point camera at an apple');
    } catch (err) {
      console.warn('Camera error:', err);
      this.showPermissionOverlay();
      this.setStatus('Camera unavailable');
      if (err.name === 'NotAllowedError') {
        this.setStatus('Camera permission denied');
      } else if (err.name === 'NotFoundError') {
        this.setStatus('No camera found on this device');
      }
      throw err;
    }
  }

  showPermissionOverlay() {
    this.permissionOverlay.style.display = 'flex';
  }

  hidePermissionOverlay() {
    this.permissionOverlay.style.display = 'none';
  }

  setStatus(text) {
    this.statusEl.textContent = text;
  }

  captureFrame() {
    const w = this.video.videoWidth || 224;
    const h = this.video.videoHeight || 224;
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx.drawImage(this.video, 0, 0, w, h);
    this.canvas.style.display = 'block';
    this.video.style.display = 'none';
    this.capturedBadge.style.display = 'flex';
    this.captured = true;
    return this.canvas;
  }

  handleGalleryFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    this.video.srcObject = null;
    this.video.src = url;
    this.video.onloadedmetadata = () => {
      this.video.play();
      this.setStatus('Image loaded from gallery');
    };
    this.captured = false;
    this.capturedBadge.style.display = 'none';
    this.canvas.style.display = 'none';
    this.video.style.display = 'block';
    // Reset file input to allow same file again
    event.target.value = '';
  }

  reset() {
    this.captured = false;
    this.capturedBadge.style.display = 'none';
    this.canvas.style.display = 'none';
    this.video.style.display = 'block';
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    this.video.srcObject = null;
  }
}