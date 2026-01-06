import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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
    
    // TRY_ON: Detect INDEX_UP và THUMB_UP cho auto zoom
    if (appState === 'TRY_ON') {
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

  // Ánh sáng: Ambient + Directional (không shadow động)
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);
  
  const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight1.position.set(5, 5, 5);
  scene.add(directionalLight1);
  
  const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
  directionalLight2.position.set(-5, 3, -5);
  scene.add(directionalLight2);

  // Danh sách items từ assets
  const items = [
    { name: "Nhẫn Format2", type: "ring", glbPath: "assets/ring/Format2.glb" },
    // { name: "Nhẫn Main", type: "ring", glbPath: "assets/ring/Main_model.glb" },
    { name: "Vòng 1", type: "bracelet", glbPath: "assets/bracelet/1.glb" },
    { name: "Vòng Ball Bearing", type: "bracelet", glbPath: "assets/bracelet/ball_bearing.glb" }
  ];

  let currentItemIndex = 0;
  let itemScale = 1.0; // Zoom scale cho item
  const MIN_SCALE = 0.5;
  const MAX_SCALE = 2.0;
  const SCALE_STEP = 0.1;
  
  // Auto zoom state
  let autoZoomState = 'STOPPED'; // 'ZOOM_IN', 'ZOOM_OUT', 'STOPPED'
  const AUTO_ZOOM_SPEED = 0.005; // Tốc độ zoom mỗi frame

  // GLB models containers
  const loader = new GLTFLoader();
  const loadedModels = []; // Mảng chứa tất cả models đã load
  let currentModel = null; // Model hiện tại đang try-on
  
  // Carousel settings
  const CAROUSEL_CENTER_Z = -2; // Vị trí Z của item chính
  const CAROUSEL_BOTTOM_Y = -1.5; // Vị trí Y của items phụ (phía dưới)
  const CAROUSEL_BOTTOM_Z = -1.5; // Vị trí Z của items phụ
  const CAROUSEL_ITEM_SPACING = 0.4; // Khoảng cách giữa các items phụ
  const CAROUSEL_CENTER_SCALE = 1.0; // Scale của item chính giữa
  const CAROUSEL_SIDE_SCALE = 0.3; // Scale của items phụ (nhỏ hơn)
  
  // Target scale chung cho tất cả models (chuẩn hóa kích thước đồng đều)
  const TARGET_UNIFORM_SIZE = 0.3; // Kích thước mục tiêu chung cho tất cả items
  
  function calculateBoundingBox(object) {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    return { size, center };
  }
  
  function normalizeModelScale(model, targetSize) {
    const { size, center } = calculateBoundingBox(model);
    const maxDimension = Math.max(size.x, size.y, size.z);
    const scale = targetSize / maxDimension;
    
    // Áp dụng scale
    model.scale.set(scale, scale, scale);
    
    // Điều chỉnh pivot về gốc (0,0,0)
    model.position.sub(center.multiplyScalar(scale));
    
    return model;
  }
  
  function loadGLBModel(path, onLoad) {
    loader.load(
      path,
      (gltf) => {
        const model = gltf.scene.clone(); // Clone để có thể dùng nhiều instance
        // Traverse và đảm bảo PBR materials được giữ nguyên
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = false;
            // Giữ nguyên material từ GLB (PBR)
          }
        });
        onLoad(model);
      },
      (progress) => {
        console.log(`Loading ${path}: ${(progress.loaded / progress.total * 100)}%`);
      },
      (error) => {
        console.error(`Error loading ${path}:`, error);
      }
    );
  }
  
  function loadAllModels() {
    let loadedCount = 0;
    
    items.forEach((item, index) => {
      // Sử dụng target size chung cho tất cả items
      loadGLBModel(item.glbPath, (model) => {
        const normalizedModel = normalizeModelScale(model, TARGET_UNIFORM_SIZE);
        normalizedModel.visible = false;
        scene.add(normalizedModel);
        
        loadedModels[index] = {
          model: normalizedModel,
          item: item
        };
        
        loadedCount++;
        console.log(`Loaded ${item.name} (${loadedCount}/${items.length}) - Size normalized to ${TARGET_UNIFORM_SIZE}`);
        
        if (loadedCount === items.length) {
          console.log('All models loaded with uniform size!');
          updateCarousel();
        }
      });
    });
  }
  
  function updateCarousel() {
    // Ẩn tất cả models
    loadedModels.forEach((loadedItem) => {
      if (loadedItem && loadedItem.model) {
        loadedItem.model.visible = false;
      }
    });
    
    // Hiển thị item chính ở giữa màn hình
    const mainItem = loadedModels[currentItemIndex];
    if (mainItem && mainItem.model) {
      const mainModel = mainItem.model;
      mainModel.position.set(0, 0, CAROUSEL_CENTER_Z);
      mainModel.scale.setScalar(CAROUSEL_CENTER_SCALE);
      mainModel.visible = true;
      mainModel.rotation.y = 0;
      mainModel.rotation.z = 0;
    }
    
    // Hiển thị các items phụ ở phía dưới màn hình
    let sideItemIndex = 0;
    loadedModels.forEach((loadedItem, index) => {
      if (!loadedItem || !loadedItem.model) return;
      
      // Bỏ qua item chính
      if (index === currentItemIndex) return;
      
      const model = loadedItem.model;
      
      // Tính vị trí X để căn giữa các items phụ
      const totalSideItems = loadedModels.length - 1;
      const startX = -(totalSideItems - 1) * CAROUSEL_ITEM_SPACING / 2;
      
      // Vị trí items phụ ở phía dưới
      model.position.x = startX + sideItemIndex * CAROUSEL_ITEM_SPACING;
      model.position.y = CAROUSEL_BOTTOM_Y;
      model.position.z = CAROUSEL_BOTTOM_Z;
      
      // Scale nhỏ hơn
      model.scale.setScalar(CAROUSEL_SIDE_SCALE);
      model.visible = true;
      
      // Rotation
      model.rotation.y = 0;
      model.rotation.z = 0;
      
      sideItemIndex++;
    });
  }
  
  // Khởi tạo load tất cả models
  loadAllModels();

  function updateCurrentItem() {
    // Chỉ update carousel, không update try-on model
    updateCarousel();
  }
  
  function getCurrentModel() {
    const loadedItem = loadedModels[currentItemIndex];
    return loadedItem ? loadedItem.model : null;
  }
  
  function resetZoom() {
    itemScale = 1.0;
    autoZoomState = 'STOPPED';
    if (currentModel) {
      currentModel.scale.setScalar(1.0);
    }
  }
  
  function zoomIn() {
    itemScale = Math.min(MAX_SCALE, itemScale + SCALE_STEP);
    if (currentModel) {
      currentModel.scale.setScalar(itemScale);
    }
  }
  
  function zoomOut() {
    itemScale = Math.max(MIN_SCALE, itemScale - SCALE_STEP);
    if (currentModel) {
      currentModel.scale.setScalar(itemScale);
    }
  }
  
  function updateAutoZoom() {
    if (autoZoomState === 'ZOOM_IN') {
      itemScale = Math.min(MAX_SCALE, itemScale + AUTO_ZOOM_SPEED);
      if (currentModel) {
        currentModel.scale.setScalar(itemScale);
      }
    } else if (autoZoomState === 'ZOOM_OUT') {
      itemScale = Math.max(MIN_SCALE, itemScale - AUTO_ZOOM_SPEED);
      if (currentModel) {
        currentModel.scale.setScalar(itemScale);
      }
    }
  }
  
  function getIndexFingerDirection(landmarks) {
    if (!landmarks || landmarks.length < 21) {
      return null;
    }
    
    const indexTip = landmarks[8]; // Index finger tip
    const indexMCP = landmarks[5]; // Index finger MCP
    
    // Trong camera space, y tăng từ trên xuống
    // Nếu index tip y < index MCP y → ngón trỏ hướng lên
    // Nếu index tip y > index MCP y → ngón trỏ hướng xuống
    const dy = indexTip.y - indexMCP.y;
    
    if (dy < -0.05) {
      return 'UP'; // Ngón trỏ hướng lên
    } else if (dy > 0.05) {
      return 'DOWN'; // Ngón trỏ hướng xuống
    }
    
    return null; // Không xác định được
  }

  updateCurrentItem();

  const gestureDetector = new GestureDetector();
  const appStateMachine = new ApplicationStateMachine();
  
  // Track current app state for animate function
  let currentAppState = 'IDLE';

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
    currentAppState = appStateMachine.update(hasHand);
    
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
      
      // BROWSE: Hiển thị carousel, không hiển thị item trên tay
      if (currentAppState === 'BROWSE') {
        updateCarousel();
        if (currentModel) {
          currentModel.visible = false;
          currentModel = null;
        }
      }
      // TRY_ON: Ẩn carousel, hiển thị item trên tay
      else if (currentAppState === 'TRY_ON') {
        // Ẩn carousel
        loadedModels.forEach((loadedItem) => {
          if (loadedItem && loadedItem.model) {
            loadedItem.model.visible = false;
          }
        });
        
        // Tạo/clone model cho try-on nếu chưa có
        if (!currentModel) {
          const loadedItem = loadedModels[currentItemIndex];
          if (loadedItem && loadedItem.model) {
            currentModel = loadedItem.model.clone();
            currentModel.visible = true;
            scene.add(currentModel);
            resetZoom();
          }
        }
        
        // Cập nhật vị trí item trên tay
        if (currentModel) {
          const item = items[currentItemIndex];
          if (item.type === "bracelet") {
            updateBraceletPosition(smoothedWrist, currentModel);
          } else {
            updateRingPosition(smoothedIndexMCP, currentModel);
          }
        }
      }
      // ACTIVE, IDLE, RESET: Ẩn tất cả
      else {
        updateCarousel();
        if (currentModel) {
          currentModel.visible = false;
          currentModel = null;
        }
      }
      
      // Track FIST state change để xử lý release trong TRY_ON
      const currentFistState = gestureDetector.fistHoldDetector.getState();
      if (currentAppState === 'TRY_ON' && lastFistState === 'COMMITTED' && currentFistState === 'OPEN') {
        // FIST released → quay về BROWSE và reset zoom
        if (currentModel) {
          scene.remove(currentModel);
          currentModel = null;
        }
        resetZoom();
        appStateMachine.transitionTo('BROWSE');
      }
      lastFistState = currentFistState;
      
      // Xử lý auto zoom trong TRY_ON
      if (currentAppState === 'TRY_ON') {
        const indexDirection = getIndexFingerDirection(smoothedLandmarks);
        const thumbExtended = gestureDetector.staticDetector.isThumbExtended(smoothedLandmarks, gestureDetector.handScale);
        const indexExtended = gestureDetector.staticDetector.isFingerExtended(smoothedLandmarks, [5, 6, 7, 8]);
        
        // Ngón cái → dừng zoom
        if (thumbExtended) {
          autoZoomState = 'STOPPED';
        }
        // Ngón trỏ hướng lên → auto zoom in
        else if (indexExtended && indexDirection === 'DOWN') {
          autoZoomState = 'ZOOM_IN';
        }
        // Ngón trỏ hướng xuống → auto zoom out
        else if (indexExtended && indexDirection === 'UP') {
          autoZoomState = 'ZOOM_OUT';
        }
        // Không có ngón trỏ hoặc ngón cái → dừng
        else {
          autoZoomState = 'STOPPED';
        }
      } else {
        // Không ở TRY_ON → dừng zoom
        autoZoomState = 'STOPPED';
      }
      
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
      // Ẩn carousel và try-on model
      updateCarousel();
      if (currentModel) {
        currentModel.visible = false;
        currentModel = null;
      }
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
        // BROWSE: Chỉ xử lý swipe để đổi item trong carousel
        if (gesture === GESTURES.MOVE_LEFT) {
          currentItemIndex = (currentItemIndex - 1 + items.length) % items.length;
          updateCurrentItem(); // Update carousel
        } else if (gesture === GESTURES.MOVE_RIGHT) {
          currentItemIndex = (currentItemIndex + 1) % items.length;
          updateCurrentItem(); // Update carousel
        }
        // BROWSE → TRY_ON: Nắm tay (FIST) hold 1s
        else if (gesture === GESTURES.FIST_HOLD) {
          // Xóa currentModel cũ nếu có
          if (currentModel) {
            scene.remove(currentModel);
            currentModel = null;
          }
          resetZoom(); // Reset zoom khi vào TRY_ON
          appStateMachine.transitionTo('TRY_ON');
        }
        break;

      case 'TRY_ON':
        // TRY_ON: Auto zoom với ngón trỏ
        // Xử lý trong onResults với landmarks để xác định hướng
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
        info += `Auto Zoom: ${autoZoomState}<br>`;
        const indexDir = getIndexFingerDirection(landmarks);
        if (indexDir) {
          info += `Index Direction: ${indexDir}<br>`;
        }
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
    
    // Chỉ rotate item chính ở giữa màn hình (không rotate items phụ)
    if (currentAppState === 'BROWSE') {
      const mainItem = loadedModels[currentItemIndex];
      if (mainItem && mainItem.model && mainItem.model.visible) {
        // Chỉ rotate item chính (y=0, z=CAROUSEL_CENTER_Z)
        if (mainItem.model.position.y === 0 && mainItem.model.position.z === CAROUSEL_CENTER_Z) {
          mainItem.model.rotation.z += 0.005;
        }
      }
    }
    
    // Rotate try-on model
    if (currentModel && currentModel.visible) {
      currentModel.rotation.z += 0.005;
    }
    
    // Auto zoom update
    updateAutoZoom();
    renderer.render(scene, camera);
  }

  animate();

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}
