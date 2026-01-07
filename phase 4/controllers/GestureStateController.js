import { GESTURES } from '../constants.js';

export class GestureStateController {
  constructor(appStateMachine, lifecycle, ringAttachment, helpers) {
    this.appStateMachine = appStateMachine;
    this.lifecycle = lifecycle;
    this.ringAttachment = ringAttachment;
    this.helpers = helpers; // { resetZoom, setCarouselIndex }
    this.lastFistTime = 0;
    this.fistHoldGraceMs = 400; // tránh tụt state do noise FIST
  }

  handle({ appState, gestureResult, landmarks, handedness, currentItemIndex, items, gestureDetector, autoZoomState, itemScale, hasHand }) {
    let nextState = appState;
    let nextIndex = currentItemIndex;
    let nextAutoZoom = autoZoomState;
    let nextItemScale = itemScale;
    let tryOnModel = this.lifecycle.getTryOnInstance();

    const gesture = gestureResult?.gesture || GESTURES.NONE;

    // Nếu mất tay hoàn toàn
    if (!hasHand) {
      if (appState === 'TRY_ON' || appState === 'BROWSE') {
        const now = Date.now();
        if (!this.handLostStartTime) this.handLostStartTime = now;

        // Chỉ reset về BROWSE/IDLE sau 1.5s mất tay thực sự
        if (now - this.handLostStartTime > 1500) {
          this.lifecycle.showCarousel(currentItemIndex);
          this.ringAttachment.reset();
          this.handLostStartTime = null;
          this.tryOnExitTimer = null;
          // State machine sẽ tự về RESET/IDLE qua appStateMachine.update(false) ở app.js
        }
      }
      return { nextState, nextIndex, nextAutoZoom, nextItemScale, tryOnModel };
    }

    // Nếu có tay, reset timer mất tay
    this.handLostStartTime = null;

    switch (appState) {
      case 'ACTIVE':
        if (gesture === GESTURES.MOVE_LEFT || gesture === GESTURES.MOVE_RIGHT) {
          this.appStateMachine.transitionTo('BROWSE');
          nextState = 'BROWSE';
          nextIndex = this._applySwipe(currentItemIndex, items.length, gesture);
          this.lifecycle.showCarousel(nextIndex);
        }
        break;

      case 'BROWSE':
        if (gesture === GESTURES.MOVE_LEFT || gesture === GESTURES.MOVE_RIGHT) {
          nextIndex = this._applySwipe(currentItemIndex, items.length, gesture);
          this.lifecycle.showCarousel(nextIndex);
        } else if (gesture === GESTURES.DOUBLE_PINCH) {
          const model = this.lifecycle.activateTryOn(currentItemIndex);
          if (model) {
            this.helpers.resetZoom(model);
            this.ringAttachment.reset();
            if (items[currentItemIndex].type === 'ring') {
              this.ringAttachment.initialize(landmarks, model);
            }
            this.appStateMachine.transitionTo('TRY_ON');
            nextState = 'TRY_ON';
            tryOnModel = model;
          }
        }
        break;

      case 'TRY_ON': {
        // Thoát TRY_ON theo yêu cầu: Double Pinch
        if (gesture === GESTURES.DOUBLE_PINCH) {
          this.tryOnExitTimer = null;
          this.lifecycle.clearTryOn();
          this.helpers.resetZoom(null);
          this.ringAttachment.reset();
          this.appStateMachine.transitionTo('BROWSE');
          nextState = 'BROWSE';
          this.lifecycle.showCarousel(currentItemIndex);
          tryOnModel = null;
          break;
        }

        // ALLOWED gestures in TRY_ON: FIST, INDEX_UP, MIDDLE_UP, RING_UP, PINKY_UP, THUMB_UP, NONE, DOUBLE_PINCH
        // Không còn tự động thoát khi gặp gesture lạ (như Palm/Open). 
        // Chỉ thoát khi người dùng chủ động Double Pinch hoặc mất tay hoàn toàn.

        // Auto zoom logic
        const indexDir = this.helpers.getIndexDirection(landmarks);
        const thumbExtended = gestureDetector.staticDetector.isThumbExtended(landmarks, gestureDetector.handScale);
        const indexExtended = gestureDetector.staticDetector.isFingerExtended(landmarks, [5, 6, 7, 8]);
        if (thumbExtended) {
          nextAutoZoom = 'STOPPED';
        } else if (indexExtended && indexDir === 'DOWN') {
          nextAutoZoom = 'ZOOM_IN';
        } else if (indexExtended && indexDir === 'UP') {
          nextAutoZoom = 'ZOOM_OUT';
        } else {
          nextAutoZoom = 'STOPPED';
        }
        if (typeof this.helpers.applyAutoZoom === 'function') {
          nextItemScale = this.helpers.applyAutoZoom(nextAutoZoom, nextItemScale, tryOnModel);
        }
        break;
      }

      default:
        break;
    }

    return {
      nextState,
      nextIndex,
      nextAutoZoom,
      nextItemScale,
      tryOnModel
    };
  }

  _applySwipe(currentIndex, length, gesture) {
    if (gesture === GESTURES.MOVE_LEFT) {
      return (currentIndex - 1 + length) % length;
    }
    return (currentIndex + 1) % length;
  }
}


