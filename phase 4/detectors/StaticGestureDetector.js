import { GESTURES } from '../constants.js';

export class StaticGestureDetector {
  constructor() {
    this.fingerAngleThreshold = 150;
    this.staticMinFrames = 5;
    this.gestureHistory = [];
  }

  angle(a, b, c) {
    const ab = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
    const cb = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
    const dot = ab.x * cb.x + ab.y * cb.y + ab.z * cb.z;
    const magAB = Math.hypot(ab.x, ab.y, ab.z);
    const magCB = Math.hypot(cb.x, cb.y, cb.z);
    if (magAB === 0 || magCB === 0) return 0;
    return Math.acos(Math.max(-1, Math.min(1, dot / (magAB * magCB)))) * 180 / Math.PI;
  }

  distance(p1, p2) {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);
  }

  isFingerExtended(landmarks, fingerIndices) {
    const [mcpIdx, pipIdx, dipIdx, tipIdx] = fingerIndices;
    const mcp = landmarks[mcpIdx];
    const pip = landmarks[pipIdx];
    const dip = landmarks[dipIdx];
    const tip = landmarks[tipIdx];
    const anglePIP = this.angle(mcp, pip, dip);
    const angleDIP = this.angle(pip, dip, tip);
    return anglePIP > this.fingerAngleThreshold && angleDIP > this.fingerAngleThreshold;
  }

  isThumbExtended(landmarks, handScale) {
    const thumbTip = landmarks[4];
    const indexMCP = landmarks[5];
    return this.distance(thumbTip, indexMCP) > handScale * 0.6;
  }

  detect(landmarks, handScale) {
    if (!landmarks || landmarks.length < 21) {
      return { gesture: GESTURES.NONE, confidence: 0 };
    }

    const thumbExtended = this.isThumbExtended(landmarks, handScale);
    const indexExtended = this.isFingerExtended(landmarks, [5, 6, 7, 8]);
    const middleExtended = this.isFingerExtended(landmarks, [9, 10, 11, 12]);
    const ringExtended = this.isFingerExtended(landmarks, [13, 14, 15, 16]);
    const pinkyExtended = this.isFingerExtended(landmarks, [17, 18, 19, 20]);

    const extendedFingers = [
      indexExtended,
      middleExtended,
      ringExtended,
      pinkyExtended
    ].filter(Boolean).length;

    let gesture = GESTURES.NONE;

    // Priority-based finger selection
    if (ringExtended) gesture = GESTURES.RING_UP;
    else if (middleExtended) gesture = GESTURES.MIDDLE_UP;
    else if (indexExtended) gesture = GESTURES.INDEX_UP;
    else if (pinkyExtended) gesture = GESTURES.PINKY_UP;
    else if (thumbExtended) gesture = GESTURES.THUMB_UP;
    else gesture = GESTURES.FIST; // No fingers extended

    const last = this.gestureHistory.at(-1);
    if (last && last !== gesture) {
      this.gestureHistory = [];
    }
    this.gestureHistory.push(gesture);
    if (this.gestureHistory.length > this.staticMinFrames) {
      this.gestureHistory.shift();
    }

    if (this.gestureHistory.length >= this.staticMinFrames) {
      const allSame = this.gestureHistory.every(g => g === gesture);
      const confidence = allSame ? 0.85 : 0.5;
      return { gesture, confidence };
    }

    return { gesture: GESTURES.NONE, confidence: 0 };
  }

  reset() {
    this.gestureHistory = [];
  }
}

