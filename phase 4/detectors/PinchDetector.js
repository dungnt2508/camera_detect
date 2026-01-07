import { GESTURES } from '../constants.js';

export class PinchDetector {
  constructor() {
    this.state = 'OPEN';
    this.candidateFrames = 0;
    this.holdStartTime = 0;
    this.releaseStartTime = 0;
    this.holdDuration = 1000; // Hold 1s
    this.releaseDuration = 100;
    this.startThreshold = 0.25;
    this.endThreshold = 0.35;
    this.candidateMinFrames = 3;
  }

  distance(p1, p2) {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);
  }

  detect(landmarks, handScale) {
    if (!landmarks || landmarks.length < 21) {
      return { gesture: GESTURES.NONE, confidence: 0 };
    }

    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const dist = this.distance(thumbTip, indexTip);
    const normalizedDist = dist / Math.max(0.1, handScale);
    const now = Date.now();
    
    switch (this.state) {
      case 'OPEN':
        if (normalizedDist < this.startThreshold) {
          this.candidateFrames++;
          if (this.candidateFrames >= this.candidateMinFrames) {
            this.state = 'CANDIDATE';
            this.holdStartTime = now;
            this.candidateFrames = 0;
          }
        } else {
          this.candidateFrames = 0;
        }
        break;
        
      case 'CANDIDATE':
        if (normalizedDist >= this.startThreshold) {
          this.state = 'OPEN';
          this.candidateFrames = 0;
        } else {
          const holdTime = now - this.holdStartTime;
          if (holdTime >= this.holdDuration) {
            this.state = 'COMMITTED';
            return { gesture: GESTURES.PINCH, confidence: 0.8 };
          }
        }
        break;
        
      case 'COMMITTED':
        if (normalizedDist > this.endThreshold) {
          this.state = 'WAIT_RELEASE';
          this.releaseStartTime = now;
        }
        break;
        
      case 'WAIT_RELEASE':
        if (normalizedDist <= this.endThreshold) {
          this.state = 'COMMITTED';
          this.releaseStartTime = 0;
        } else {
          const releaseTime = now - this.releaseStartTime;
          if (releaseTime >= this.releaseDuration) {
            this.state = 'OPEN';
            this.releaseStartTime = 0;
          }
        }
        break;
    }
    
    return { gesture: GESTURES.NONE, confidence: 0 };
  }

  reset() {
    this.state = 'OPEN';
    this.candidateFrames = 0;
    this.holdStartTime = 0;
    this.releaseStartTime = 0;
  }

  getState() {
    return this.state;
  }

  getDebugInfo() {
    return {
      state: this.state,
      candidateFrames: this.candidateFrames,
      timeSinceCandidate: this.holdStartTime > 0 ? Date.now() - this.holdStartTime : 0,
      releaseGating: this.releaseStartTime > 0 ? Date.now() - this.releaseStartTime : 0
    };
  }
}

