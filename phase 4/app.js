window.addEventListener("load", () => {
  init();
});

const GESTURES = {
  NONE: 'NONE',
  FIST: 'FIST',
  INDEX_UP: 'INDEX_UP',
  MIDDLE_UP: 'MIDDLE_UP',
  RING_UP: 'RING_UP',
  PINKY_UP: 'PINKY_UP',
  THUMB_UP: 'THUMB_UP',
  PINCH: 'PINCH',
  MOVE_LEFT: 'MOVE_LEFT',
  MOVE_RIGHT: 'MOVE_RIGHT',
  MOVE_UP: 'MOVE_UP',
  MOVE_DOWN: 'MOVE_DOWN',
  FIST_HOLD: 'FIST_HOLD' // FIST hold 1s
};

class StaticGestureDetector {
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
    if (extendedFingers === 0 && !thumbExtended) {
      gesture = GESTURES.FIST;
    } else if (extendedFingers === 0 && thumbExtended) {
      gesture = GESTURES.THUMB_UP;
    } else if (extendedFingers === 1) {
      if (indexExtended) gesture = GESTURES.INDEX_UP;
      else if (middleExtended) gesture = GESTURES.MIDDLE_UP;
      else if (ringExtended) gesture = GESTURES.RING_UP;
      else if (pinkyExtended) gesture = GESTURES.PINKY_UP;
    }
    
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

class FistHoldDetector {
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

class PinchDetector {
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

class VerticalMoveDetector {
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

class MoveStateMachine {
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

class ApplicationStateMachine {
  constructor() {
    this.state = 'IDLE';
    this.noHandTimeout = 2000; // 2s không có tay → RESET
    this.lastHandTime = 0;
    this.resetTimeout = 500; // 0.5s trong RESET → IDLE
    this.resetStartTime = 0;
  }

  update(hasHand) {
    const now = Date.now();

    switch (this.state) {
      case 'IDLE':
        if (hasHand) {
          this.state = 'ACTIVE';
          this.lastHandTime = now;
        }
        break;

      case 'ACTIVE':
        if (hasHand) {
          this.lastHandTime = now;
        } else {
          if (now - this.lastHandTime >= this.noHandTimeout) {
            this.state = 'RESET';
            this.resetStartTime = now;
          }
        }
        break;

      case 'BROWSE':
        if (hasHand) {
          this.lastHandTime = now;
        } else {
          if (now - this.lastHandTime >= this.noHandTimeout) {
            this.state = 'RESET';
            this.resetStartTime = now;
          }
        }
        break;

      case 'TRY_ON':
        if (hasHand) {
          this.lastHandTime = now;
        } else {
          if (now - this.lastHandTime >= this.noHandTimeout) {
            this.state = 'RESET';
            this.resetStartTime = now;
          }
        }
        break;

      case 'RESET':
        if (hasHand) {
          this.state = 'ACTIVE';
          this.lastHandTime = now;
          this.resetStartTime = 0;
        } else {
          if (now - this.resetStartTime >= this.resetTimeout) {
            this.state = 'IDLE';
            this.resetStartTime = 0;
          }
        }
        break;
    }

    return this.state;
  }

  transitionTo(newState) {
    const validTransitions = {
      'IDLE': ['ACTIVE'],
      'ACTIVE': ['BROWSE', 'RESET'],
      'BROWSE': ['TRY_ON', 'RESET'],
      'TRY_ON': ['BROWSE', 'RESET'],
      'RESET': ['IDLE', 'ACTIVE']
    };

    if (validTransitions[this.state] && validTransitions[this.state].includes(newState)) {
      this.state = newState;
      if (newState !== 'RESET') {
        this.lastHandTime = Date.now();
      }
      return true;
    }
    return false;
  }

  getState() {
    return this.state;
  }

  reset() {
    this.state = 'IDLE';
    this.lastHandTime = 0;
    this.resetStartTime = 0;
  }
}

class GestureDetector {
  constructor() {
    this.handScale = 1.0;
    this.staticDetector = new StaticGestureDetector();
    this.pinchDetector = new PinchDetector();
    this.fistHoldDetector = new FistHoldDetector();
    this.moveStateMachine = new MoveStateMachine();
    this.verticalMoveDetector = new VerticalMoveDetector();
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
    
    // TRY_ON: Chỉ detect vertical move cho zoom
    if (appState === 'TRY_ON') {
      const verticalResult = this.verticalMoveDetector.update(landmarks, this.handScale);
      if (verticalResult.gesture !== GESTURES.NONE) {
        return verticalResult;
      }
      // Trong TRY_ON, không detect gesture khác
      return { gesture: GESTURES.NONE, confidence: 0 };
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

function init() {
  const video = document.getElementById("video");
  const debugDiv = document.getElementById("debug");
  const stateDiv = document.getElementById("state");

  navigator.mediaDevices.getUserMedia({
    video: { width: 1280, height: 720 }
  }).then(stream => {
    video.srcObject = stream;
  }).catch(error => {
    console.error('Lỗi khi truy cập camera:', error);
    debugDiv.textContent = `Lỗi: Không thể truy cập camera. ${error.message}`;
  });

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.z = 3;
  const renderer = new THREE.WebGLRenderer({ alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const light = new THREE.DirectionalLight(0xffffff, 0.8);
  light.position.set(0, 0, 5);
  scene.add(light);

  const items = [
    { name: "Nhẫn Vàng", type: "ring", color: 0xffd700, size: 0.15, thickness: 0.05 },
    { name: "Nhẫn Bạc", type: "ring", color: 0xc0c0c0, size: 0.15, thickness: 0.05 },
    { name: "Nhẫn Đồng", type: "ring", color: 0xcd7f32, size: 0.15, thickness: 0.05 },
    { name: "Vòng Vàng", type: "bracelet", color: 0xffd700, size: 0.6, thickness: 0.2 },
    { name: "Vòng Bạc", type: "bracelet", color: 0xc0c0c0, size: 0.6, thickness: 0.2 }
  ];

  let currentItemIndex = 0;
  let itemScale = 1.0; // Zoom scale cho item
  const MIN_SCALE = 0.5;
  const MAX_SCALE = 2.0;
  const SCALE_STEP = 0.1;

  const braceletGeometry = new THREE.TorusGeometry(0.6, 0.2, 16, 100);
  const braceletMaterial = new THREE.MeshStandardMaterial({ color: 0xffd700 });
  const bracelet = new THREE.Mesh(braceletGeometry, braceletMaterial);
  bracelet.rotation.x = Math.PI / 2;
  bracelet.visible = false;
  scene.add(bracelet);

  const ringGeometry = new THREE.TorusGeometry(0.15, 0.05, 16, 100);
  const ringMaterial = new THREE.MeshStandardMaterial({ color: 0xc0c0c0 });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = Math.PI / 2;
  ring.visible = false;
  scene.add(ring);

  function updateCurrentItem() {
    const item = items[currentItemIndex];
    if (item.type === "bracelet") {
      if (bracelet.geometry) {
        bracelet.geometry.dispose();
      }
      bracelet.geometry = new THREE.TorusGeometry(item.size, item.thickness, 16, 100);
      bracelet.material.color.setHex(item.color);
      bracelet.visible = true;
      ring.visible = false;
      bracelet.scale.set(itemScale, itemScale, itemScale);
    } else {
      if (ring.geometry) {
        ring.geometry.dispose();
      }
      ring.geometry = new THREE.TorusGeometry(item.size, item.thickness, 16, 100);
      ring.material.color.setHex(item.color);
      ring.visible = true;
      bracelet.visible = false;
      ring.scale.set(itemScale, itemScale, itemScale);
    }
  }
  
  function resetZoom() {
    itemScale = 1.0;
    bracelet.scale.set(1, 1, 1);
    ring.scale.set(1, 1, 1);
  }
  
  function zoomIn() {
    itemScale = Math.min(MAX_SCALE, itemScale + SCALE_STEP);
    bracelet.scale.set(itemScale, itemScale, itemScale);
    ring.scale.set(itemScale, itemScale, itemScale);
  }
  
  function zoomOut() {
    itemScale = Math.max(MIN_SCALE, itemScale - SCALE_STEP);
    bracelet.scale.set(itemScale, itemScale, itemScale);
    ring.scale.set(itemScale, itemScale, itemScale);
  }

  updateCurrentItem();

  const gestureDetector = new GestureDetector();
  const appStateMachine = new ApplicationStateMachine();

  const SMOOTHING_ALPHA = 0.3;
  let smoothedLandmarks = null;
  let lastFistState = 'OPEN';

  function smoothLandmarks(currentLandmarks, previousSmoothed, alpha) {
    if (!previousSmoothed || previousSmoothed.length !== 21) {
      return currentLandmarks.map(lm => ({ x: lm.x, y: lm.y, z: lm.z }));
    }
    return currentLandmarks.map((lm, idx) => {
      const prev = previousSmoothed[idx];
      return {
        x: prev.x * (1 - alpha) + lm.x * alpha,
        y: prev.y * (1 - alpha) + lm.y * alpha,
        z: prev.z * (1 - alpha) + lm.z * alpha
      };
    });
  }

  if (typeof Hands === 'undefined') {
    console.error('MediaPipe Hands chưa được load!');
    debugDiv.textContent = 'Lỗi: MediaPipe Hands chưa được load';
    return;
  }

  const hands = new Hands({
    locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    }
  });

  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });

  hands.onResults((results) => {
    const hasHand = results.multiHandLandmarks && results.multiHandLandmarks.length > 0;
    const currentAppState = appStateMachine.update(hasHand);
    
    if (hasHand) {
      const rawLandmarks = results.multiHandLandmarks[0];
      const handedness = results.multiHandedness?.[0]?.categoryName || 'Unknown';
      
      smoothedLandmarks = smoothLandmarks(rawLandmarks, smoothedLandmarks, SMOOTHING_ALPHA);
      
      // Chỉ detect gesture khi ở state phù hợp
      let result = { gesture: GESTURES.NONE, confidence: 0 };
      
      if (currentAppState === 'ACTIVE' || currentAppState === 'BROWSE' || currentAppState === 'TRY_ON') {
        result = gestureDetector.detect(smoothedLandmarks, handedness, currentAppState);
      }
      
      const smoothedWrist = smoothedLandmarks[0];
      const smoothedIndexMCP = smoothedLandmarks[5];
      
      // Chỉ hiển thị item khi ở BROWSE hoặc TRY_ON
      if (currentAppState === 'BROWSE' || currentAppState === 'TRY_ON') {
        updateBraceletPosition(smoothedWrist, bracelet);
        updateRingPosition(smoothedIndexMCP, ring);
      } else {
        bracelet.visible = false;
        ring.visible = false;
      }
      
      // Track FIST state change để xử lý release trong TRY_ON
      const currentFistState = gestureDetector.fistHoldDetector.getState();
      if (currentAppState === 'TRY_ON' && lastFistState === 'COMMITTED' && currentFistState === 'OPEN') {
        // FIST released → quay về BROWSE và reset zoom
        resetZoom();
        appStateMachine.transitionTo('BROWSE');
      }
      lastFistState = currentFistState;
      
      // Xử lý gesture dựa trên state - logic không chồng chéo
      if (result.gesture !== GESTURES.NONE) {
        handleGesture(result.gesture, result.confidence, currentAppState);
      }
      
      updateDebug(debugDiv, smoothedWrist, result, smoothedLandmarks, handedness, currentAppState);
      
    } else {
      // Không có tay
      if (currentAppState === 'IDLE' || currentAppState === 'RESET') {
        debugDiv.textContent = "Chờ tay xuất hiện...";
      } else {
        debugDiv.textContent = "Không detect được tay";
      }
      gestureDetector.reset();
      smoothedLandmarks = null;
      bracelet.visible = false;
      ring.visible = false;
      lastFistState = 'OPEN';
    }
  });

  function handleGesture(gesture, confidence, appState) {
    console.log(`[${appState}] Gesture: ${gesture} (confidence: ${confidence.toFixed(2)})`);
    
    // Logic không chồng chéo - mỗi state chỉ xử lý gesture phù hợp
    switch (appState) {
      case 'ACTIVE':
        // ACTIVE → BROWSE: Swipe trái/phải
        if (gesture === GESTURES.MOVE_LEFT || gesture === GESTURES.MOVE_RIGHT) {
          appStateMachine.transitionTo('BROWSE');
          if (gesture === GESTURES.MOVE_LEFT) {
            currentItemIndex = (currentItemIndex - 1 + items.length) % items.length;
          } else {
            currentItemIndex = (currentItemIndex + 1) % items.length;
          }
          updateCurrentItem();
        }
        break;

      case 'BROWSE':
        // BROWSE: Chỉ xử lý swipe để đổi item
        if (gesture === GESTURES.MOVE_LEFT) {
          currentItemIndex = (currentItemIndex - 1 + items.length) % items.length;
          updateCurrentItem();
        } else if (gesture === GESTURES.MOVE_RIGHT) {
          currentItemIndex = (currentItemIndex + 1) % items.length;
          updateCurrentItem();
        }
        // BROWSE → TRY_ON: Nắm tay (FIST) hold 1s
        else if (gesture === GESTURES.FIST_HOLD) {
          resetZoom(); // Reset zoom khi vào TRY_ON
          appStateMachine.transitionTo('TRY_ON');
        }
        break;

      case 'TRY_ON':
        // TRY_ON: Zoom-in/zoom-out với swipe lên/xuống
        if (gesture === GESTURES.MOVE_UP) {
          zoomIn();
          console.log(`Zoom in: ${itemScale.toFixed(2)}`);
        } else if (gesture === GESTURES.MOVE_DOWN) {
          zoomOut();
          console.log(`Zoom out: ${itemScale.toFixed(2)}`);
        }
        // FIST release được xử lý ở onResults
        break;

      default:
        // IDLE, RESET: Không xử lý gesture
        break;
    }
  }

  function normalizedToWorld(normalized) {
    const worldX = ((1 - normalized.x) - 0.5) * 4;
    const worldY = (0.5 - normalized.y) * 4;
    const worldZ = normalized.z * 2;
    return { x: worldX, y: worldY, z: worldZ };
  }

  function updateBraceletPosition(wrist, bracelet) {
    const world = normalizedToWorld(wrist);
    bracelet.position.set(world.x, world.y, world.z);
  }

  function updateRingPosition(indexMCP, ring) {
    const world = normalizedToWorld(indexMCP);
    ring.position.set(world.x, world.y, world.z);
  }

  function updateDebug(debugDiv, wrist, result, landmarks, handedness, appState) {
    const currentItem = items[currentItemIndex];
    const staticDetector = gestureDetector.staticDetector;
    const thumbExtended = staticDetector.isThumbExtended(landmarks, gestureDetector.handScale);
    const indexExtended = staticDetector.isFingerExtended(landmarks, [5, 6, 7, 8]);
    const middleExtended = staticDetector.isFingerExtended(landmarks, [9, 10, 11, 12]);
    const ringExtended = staticDetector.isFingerExtended(landmarks, [13, 14, 15, 16]);
    const pinkyExtended = staticDetector.isFingerExtended(landmarks, [17, 18, 19, 20]);
    
    const moveDebug = gestureDetector.moveStateMachine.getDebugInfo(landmarks, gestureDetector.handScale, handedness);
    const pinchDebug = gestureDetector.pinchDetector.getDebugInfo();
    const fistHoldDebug = gestureDetector.fistHoldDetector.getDebugInfo();
    
    let info = `<strong>APP STATE: ${appState}</strong><br>`;
    info += `<br><strong>Hand Detected</strong><br>`;
    info += `Hand: ${handedness}<br>`;
    info += `Scale: ${gestureDetector.handScale.toFixed(3)}<br>`;
    info += `Wrist: x=${wrist.x.toFixed(3)}, y=${wrist.y.toFixed(3)}<br>`;
    
    if (appState === 'BROWSE' || appState === 'TRY_ON') {
      info += `Item: ${currentItem.name} (${currentItemIndex + 1}/${items.length})<br>`;
      if (appState === 'TRY_ON') {
        info += `Zoom: ${(itemScale * 100).toFixed(0)}%<br>`;
      }
    }
    
    info += `<br><strong>Gesture: ${result.gesture}</strong><br>`;
    info += `Confidence: ${(result.confidence * 100).toFixed(0)}%<br>`;
    
    if (fistHoldDebug) {
      info += `<br><strong>FIST HOLD State: ${fistHoldDebug.state}</strong><br>`;
      info += `Fist Frames: ${fistHoldDebug.fistFrames}<br>`;
      info += `Hold Time: ${Math.round(fistHoldDebug.holdTime)}ms<br>`;
    }
    
    if (pinchDebug) {
      info += `<br><strong>PINCH State: ${pinchDebug.state}</strong><br>`;
      info += `Candidate Frames: ${pinchDebug.candidateFrames}<br>`;
      info += `Time Since Candidate: ${Math.round(pinchDebug.timeSinceCandidate)}ms<br>`;
      info += `Release Gating: ${Math.round(pinchDebug.releaseGating)}ms<br>`;
    }
    
    if (moveDebug) {
      info += `<br><strong>MOVE State: ${moveDebug.state}</strong><br>`;
      info += `dxNorm: ${moveDebug.dxNorm.toFixed(3)}<br>`;
      info += `elapsedTime: ${Math.round(moveDebug.elapsedTime)}ms<br>`;
      info += `direction: ${moveDebug.direction || 'N/A'}<br>`;
      info += `cooldownRemaining: ${Math.round(moveDebug.cooldownRemaining)}ms<br>`;
    }
    
    info += `<br>Ngón tay:<br>`;
    info += `Cái: ${thumbExtended ? '✓' : '✗'}<br>`;
    info += `Trỏ: ${indexExtended ? '✓' : '✗'}<br>`;
    info += `Giữa: ${middleExtended ? '✓' : '✗'}<br>`;
    info += `Áp út: ${ringExtended ? '✓' : '✗'}<br>`;
    info += `Út: ${pinkyExtended ? '✓' : '✗'}<br>`;
    
    debugDiv.innerHTML = info;
    stateDiv.textContent = `${appState} | ${result.gesture} (${(result.confidence * 100).toFixed(0)}%)`;
  }

  if (typeof Camera === 'undefined') {
    console.error('MediaPipe Camera chưa được load!');
    debugDiv.textContent = 'Lỗi: MediaPipe Camera chưa được load';
    return;
  }

  const camera_utils = new Camera(video, {
    onFrame: async () => {
      await hands.send({ image: video });
    },
    width: 1280,
    height: 720
  });
  camera_utils.start();

  function animate() {
    requestAnimationFrame(animate);
    bracelet.rotation.z += 0.005;
    ring.rotation.z += 0.005;
    renderer.render(scene, camera);
  }

  animate();

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}
