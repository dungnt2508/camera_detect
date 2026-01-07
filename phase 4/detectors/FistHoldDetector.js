import { GESTURES } from '../constants.js';

export class FistHoldDetector {
  constructor() {
    this.state = 'OPEN';
    this.holdStartTime = 0;
    this.holdDuration = 1000; // Hold 1s
    this.minFrames = 5; // Cần 5 frames liên tiếp là FIST
    this.fistFrames = 0;
  }

  detect(isFist) {
    const now = Date.now();

    switch (this.state) {
      case 'OPEN':
        if (isFist) {
          this.fistFrames++;
          if (this.fistFrames >= this.minFrames) {
            this.state = 'HOLDING';
            this.holdStartTime = now;
            this.fistFrames = 0;
          }
        } else {
          this.fistFrames = 0;
        }
        break;

      case 'HOLDING':
        if (!isFist) {
          this.state = 'OPEN';
          this.holdStartTime = 0;
        } else {
          const holdTime = now - this.holdStartTime;
          if (holdTime >= this.holdDuration) {
            this.state = 'COMMITTED';
            return { gesture: GESTURES.FIST_HOLD, confidence: 0.9 };
          }
        }
        break;

      case 'COMMITTED':
        if (!isFist) {
          this.state = 'OPEN';
          this.holdStartTime = 0;
        }
        break;
    }

    return { gesture: GESTURES.NONE, confidence: 0 };
  }

  reset() {
    this.state = 'OPEN';
    this.holdStartTime = 0;
    this.fistFrames = 0;
  }

  getState() {
    return this.state;
  }

  getDebugInfo() {
    return {
      state: this.state,
      fistFrames: this.fistFrames,
      holdTime: this.holdStartTime > 0 ? Date.now() - this.holdStartTime : 0
    };
  }
}

