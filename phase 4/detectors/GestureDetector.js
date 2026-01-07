import { GESTURES } from '../constants.js';
import { StaticGestureDetector } from './StaticGestureDetector.js';
import { PinchDetector } from './PinchDetector.js';
import { FistHoldDetector } from './FistHoldDetector.js';
import { MoveStateMachine } from './MoveStateMachine.js';
import { VerticalMoveDetector } from './VerticalMoveDetector.js';
import { DoublePinchDetector } from './DoublePinchDetector.js';

export class GestureDetector {
  constructor() {
    this.handScale = 1.0;
    this.staticDetector = new StaticGestureDetector();
    this.pinchDetector = new PinchDetector();
    this.fistHoldDetector = new FistHoldDetector();
    this.moveStateMachine = new MoveStateMachine();
    this.verticalMoveDetector = new VerticalMoveDetector();
    this.doublePinchDetector = new DoublePinchDetector();
  }

  computeHandScale(landmarks) {
    const wrist = landmarks[0];
    const middleMCP = landmarks[9];
    const dx = wrist.x - middleMCP.x;
    const dy = wrist.y - middleMCP.y;
    const dz = wrist.z - middleMCP.z;
    return Math.hypot(dx, dy, dz);
  }

  detect(landmarks, handedness, appState = 'ACTIVE') {
    if (!landmarks || landmarks.length < 21) {
      return { gesture: GESTURES.NONE, confidence: 0 };
    }

    this.handScale = Math.max(0.01, this.computeHandScale(landmarks));

    // TRY_ON: Detect INDEX_UP và THUMB_UP cho auto zoom + DOUBLE_PINCH cho exit
    if (appState === 'TRY_ON') {
      const dpResult = this.doublePinchDetector.detect(landmarks, this.handScale);
      if (dpResult.gesture === GESTURES.DOUBLE_PINCH) {
        return dpResult;
      }
      // Detect static gestures để biết INDEX_UP và THUMB_UP
      const staticResult = this.staticDetector.detect(landmarks, this.handScale);
      return staticResult;
    }

    // BROWSE và ACTIVE: Detect horizontal move, FIST hold, và static gestures
    const moveResult = this.moveStateMachine.update(landmarks, this.handScale, handedness);
    const moveState = this.moveStateMachine.getState();

    if (moveResult.gesture !== GESTURES.NONE) {
      return moveResult;
    }

    if (moveState === 'TRACKING') {
      return { gesture: GESTURES.NONE, confidence: 0 };
    }

    let staticResult = { gesture: GESTURES.NONE, confidence: 0 };
    let pinchResult = { gesture: GESTURES.NONE, confidence: 0 };
    let fistHoldResult = { gesture: GESTURES.NONE, confidence: 0 };

    if (moveState === 'IDLE' || moveState === 'COOLDOWN') {
      // Ưu tiên Double Pinch trước các gesture khác
      const dpResult = this.doublePinchDetector.detect(landmarks, this.handScale);
      if (dpResult.gesture === GESTURES.DOUBLE_PINCH) {
        return dpResult;
      }

      // Detect static gesture trước để biết có FIST không
      staticResult = this.staticDetector.detect(landmarks, this.handScale);
      const isFist = staticResult.gesture === GESTURES.FIST;

      // Detect FIST hold (chỉ trong BROWSE)
      if (appState === 'BROWSE' && isFist) {
        fistHoldResult = this.fistHoldDetector.detect(true);
        if (fistHoldResult.gesture !== GESTURES.NONE) {
          return fistHoldResult;
        }
      } else {
        this.fistHoldDetector.detect(isFist);
      }

      // Detect PINCH
      pinchResult = this.pinchDetector.detect(landmarks, this.handScale);
      const pinchState = this.pinchDetector.getState();

      if (pinchState === 'COMMITTED') {
        return pinchResult;
      }

      // Nếu không phải PINCH, return static result
      if (pinchState === 'OPEN' && staticResult.gesture !== GESTURES.NONE) {
        return staticResult;
      }
    }

    if (pinchResult.gesture !== GESTURES.NONE) {
      return pinchResult;
    }

    if (fistHoldResult.gesture !== GESTURES.NONE) {
      return fistHoldResult;
    }

    if (staticResult.gesture !== GESTURES.NONE) {
      return staticResult;
    }

    return { gesture: GESTURES.NONE, confidence: 0 };
  }

  reset() {
    this.staticDetector.reset();
    this.pinchDetector.reset();
    this.fistHoldDetector.reset();
    this.moveStateMachine.reset();
    this.verticalMoveDetector.reset();
  }
}

