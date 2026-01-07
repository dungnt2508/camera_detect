import { GESTURES } from '../constants.js';

export class DoublePinchDetector {
    constructor() {
        this.state = 'OPEN';
        this.pinchCount = 0;
        this.lastPinchTime = 0;
        this.lastReleaseTime = 0;

        // Configs
        this.pinchThreshold = 0.25; // Khoảng cách pinch
        this.releaseThreshold = 0.4; // Khoảng cách buông
        this.maxTapInterval = 400; // Thời gian tối đa giữa 2 lần chạm (ms)
        this.minPinchFrames = 2; // Frame tối thiểu để tính là 1 lần chạm
        this.pinchFrameCounter = 0;
    }

    detect(landmarks, handScale) {
        if (!landmarks || landmarks.length < 21) {
            this.reset();
            return { gesture: GESTURES.NONE, confidence: 0 };
        }

        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        const dist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y, thumbTip.z - indexTip.z);
        const normalizedDist = dist / Math.max(0.01, handScale);
        const now = Date.now();

        const isPinching = normalizedDist < this.pinchThreshold;
        const isReleased = normalizedDist > this.releaseThreshold;

        switch (this.state) {
            case 'OPEN':
                if (isPinching) {
                    this.pinchFrameCounter++;
                    if (this.pinchFrameCounter >= this.minPinchFrames) {
                        this.state = 'PINCHED';
                        this.pinchFrameCounter = 0;

                        // Nếu đây là lần chạm thứ 2
                        if (this.pinchCount === 1) {
                            if (now - this.lastReleaseTime < this.maxTapInterval) {
                                this.reset();
                                return { gesture: GESTURES.DOUBLE_PINCH, confidence: 1.0 };
                            } else {
                                // Quá lâu, reset coi như lần chạm đầu tiên mới
                                this.pinchCount = 1;
                            }
                        } else {
                            this.pinchCount = 1;
                        }
                        this.lastPinchTime = now;
                    }
                }
                break;

            case 'PINCHED':
                if (isReleased) {
                    this.state = 'OPEN';
                    this.lastReleaseTime = now;
                }
                break;
        }

        // Timeout reset nếu không có lần chạm thứ 2
        if (this.pinchCount === 1 && now - this.lastPinchTime > this.maxTapInterval + 200) {
            this.pinchCount = 0;
        }

        return { gesture: GESTURES.NONE, confidence: 0 };
    }

    reset() {
        this.state = 'OPEN';
        this.pinchCount = 0;
        this.pinchFrameCounter = 0;
        this.lastPinchTime = 0;
        this.lastReleaseTime = 0;
    }
}
