import { GESTURES } from '../constants.js';

export class MoveStateMachine {
  constructor() {
    this.startThreshold = 0.04;
    this.commitThreshold = 0.20;
    this.cancelThreshold = 0.10;
    this.maxDuration = 400;
    this.cooldownDuration = 250;

    this.state = 'IDLE';
    this.startX = 0;
    this.startTime = 0;
    this.direction = null;
    this.cooldownStartTime = 0;
  }

  getWristX(landmarks, handedness) {
    const wrist = landmarks[0];
    let x = wrist.x;
    if (handedness === 'Left') {
      x = 1 - x;
    }
    return x;
  }

  update(landmarks, handScale, handedness) {
    if (!landmarks || landmarks.length < 21) {
      return { gesture: GESTURES.NONE, confidence: 0 };
    }

    const currentX = this.getWristX(landmarks, handedness);
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
          this.startX = currentX;
          this.startTime = now;
          break;
        }
      
        const dx = currentX - this.startX;
        const dxNorm = dx / Math.max(0.01, handScale);
      
        if (Math.abs(dxNorm) >= this.startThreshold) {
          this.state = 'TRACKING';
        }
        break;
      }

      case 'TRACKING': {
        const dx = currentX - this.startX;
        const dxNorm = dx / Math.max(0.01, handScale);
        const elapsed = now - this.startTime;
      
        if (Math.abs(dxNorm) >= this.commitThreshold && elapsed <= this.maxDuration) {
          this.cooldownStartTime = now;
          this.reset();
          return {
            gesture: dxNorm > 0 ? GESTURES.MOVE_RIGHT : GESTURES.MOVE_LEFT,
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

  resetTracking() {
    this.startX = 0;
    this.startTime = 0;
    this.direction = null;
  }

  reset() {
    this.state = 'IDLE';
    this.startX = 0;
    this.startTime = 0;
  }

  getState() {
    const now = Date.now();
    if (this.cooldownStartTime > 0 && now - this.cooldownStartTime < this.cooldownDuration) {
      return 'COOLDOWN';
    }
    
    // Reset cooldown nếu đã hết
    if (this.cooldownStartTime > 0 && now - this.cooldownStartTime >= this.cooldownDuration) {
      this.cooldownStartTime = 0;
    }
    
    return this.state;
  }

  getDebugInfo(landmarks, handScale, handedness) {
    if (!landmarks || landmarks.length < 21) {
      return null;
    }

    const currentX = this.getWristX(landmarks, handedness);
    const now = Date.now();
    const dx = currentX - this.startX;
    const dxNorm = dx / Math.max(0.01, handScale);
    const elapsedTime = this.startTime > 0 ? now - this.startTime : 0;
    const cooldownRemaining = this.cooldownStartTime > 0 ? 
      Math.max(0, this.cooldownDuration - (now - this.cooldownStartTime)) : 0;

    return {
      state: this.getState(),
      dxNorm: dxNorm,
      elapsedTime: elapsedTime,
      direction: this.direction,
      cooldownRemaining: cooldownRemaining
    };
  }
}

