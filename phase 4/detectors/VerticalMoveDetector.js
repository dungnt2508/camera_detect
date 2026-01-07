import { GESTURES } from '../constants.js';

export class VerticalMoveDetector {
  constructor() {
    this.startThreshold = 0.04;
    this.commitThreshold = 0.15;
    this.maxDuration = 400;
    this.cooldownDuration = 250;

    this.state = 'IDLE';
    this.startY = 0;
    this.startTime = 0;
    this.cooldownStartTime = 0;
  }

  getWristY(landmarks) {
    const wrist = landmarks[0];
    return wrist.y;
  }

  update(landmarks, handScale) {
    if (!landmarks || landmarks.length < 21) {
      return { gesture: GESTURES.NONE, confidence: 0 };
    }

    const currentY = this.getWristY(landmarks);
    const now = Date.now();

    // Reset cooldown nếu đã hết
    if (this.cooldownStartTime > 0 && now - this.cooldownStartTime >= this.cooldownDuration) {
      this.cooldownStartTime = 0;
    }

    // Nếu đang trong cooldown và không phải IDLE, không xử lý gesture
    if (this.cooldownStartTime > 0 && this.state !== 'IDLE') {
      return { gesture: GESTURES.NONE, confidence: 0 };
    }

    switch (this.state) {
      case 'IDLE': {
        if (this.startTime === 0) {
          this.startY = currentY;
          this.startTime = now;
          break;
        }
      
        const dy = currentY - this.startY;
        const dyNorm = Math.abs(dy) / Math.max(0.01, handScale);
      
        if (dyNorm >= this.startThreshold) {
          this.state = 'TRACKING';
        }
        break;
      }

      case 'TRACKING': {
        const dy = currentY - this.startY;
        const dyNorm = dy / Math.max(0.01, handScale);
        const elapsed = now - this.startTime;
      
        if (Math.abs(dyNorm) >= this.commitThreshold && elapsed <= this.maxDuration) {
          this.cooldownStartTime = now;
          this.reset();
          return {
            gesture: dyNorm < 0 ? GESTURES.MOVE_UP : GESTURES.MOVE_DOWN,
            confidence: 1.0
          };
        }
      
        if (elapsed > this.maxDuration) {
          this.reset();
        }
        break;
      }

      default: {
        return { gesture: GESTURES.NONE, confidence: 0 };
      }
    }
    
    return { gesture: GESTURES.NONE, confidence: 0 };
  }

  reset() {
    this.state = 'IDLE';
    this.startY = 0;
    this.startTime = 0;
  }

  getState() {
    const now = Date.now();
    if (this.cooldownStartTime > 0 && now - this.cooldownStartTime < this.cooldownDuration) {
      return 'COOLDOWN';
    }
    
    if (this.cooldownStartTime > 0 && now - this.cooldownStartTime >= this.cooldownDuration) {
      this.cooldownStartTime = 0;
    }
    
    return this.state;
  }
}

