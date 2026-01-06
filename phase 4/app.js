// Đợi tất cả script load xong
window.addEventListener("load", () => {
  init();
});

// ========== GESTURE TYPES ==========
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
  MOVE_RIGHT: 'MOVE_RIGHT'
};

// ========== STATIC GESTURE DETECTOR ==========
class StaticGestureDetector {
  constructor() {
    this.fingerAngleThreshold = 150; // độ
    this.staticMinFrames = 3;
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
    
    // Update history
    if (gesture === GESTURES.NONE) {
      this.gestureHistory = [];
      return { gesture: GESTURES.NONE, confidence: 0 };
    }
    
    const last = this.gestureHistory.at(-1);
    if (last && last !== gesture) {
      this.gestureHistory = [];
    }
    this.gestureHistory.push(gesture);
    if (this.gestureHistory.length > this.staticMinFrames) {
      this.gestureHistory.shift();
    }
    
    // Chỉ return nếu ổn định đủ frame
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

// ========== PINCH DETECTOR ==========
class PinchDetector {
  constructor() {
    this.state = 'OPEN';
    this.startFrames = 0;
    this.holdStartTime = 0;
    this.holdDuration = 150;
    this.startThreshold = 0.25;
    this.endThreshold = 0.35;
    this.committed = false;
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
        this.committed = false;
        if (normalizedDist < this.startThreshold) {
          this.startFrames++;
          if (this.startFrames >= 3) {
            this.state = 'PINCH_START';
            this.startFrames = 0;
          }
        } else {
          this.startFrames = 0;
        }
        break;
        
      case 'PINCH_START':
        if (normalizedDist < this.startThreshold) {
          this.state = 'PINCH_HOLD';
          this.holdStartTime = now;
        } else {
          this.state = 'OPEN';
        }
        break;
        
      case 'PINCH_HOLD':
        if (normalizedDist > this.endThreshold) {
          this.state = 'RELEASE';
        } else {
          const holdTime = now - this.holdStartTime;
          if (holdTime >= this.holdDuration && !this.committed) {
            this.committed = true;
            return { gesture: GESTURES.PINCH, confidence: 0.8 };
          }
        }
        break;
        
      case 'RELEASE':
        this.state = 'OPEN';
        break;
    }
    
    return { gesture: GESTURES.NONE, confidence: 0 };
  }

  reset() {
    this.state = 'OPEN';
    this.startFrames = 0;
    this.committed = false;
  }
}

// ========== MOVE STATE MACHINE ==========
class MoveStateMachine {
  constructor() {
    // ===== PARAMETERS =====
    this.minVelocity = 0.06;          // mean vx (raw, đã flip handedness)
    this.minDisplacement = 0.12;      // NORMALIZED (đã chia handScale)
    this.velocityRatio = 1.5;         // |vx| > ratio * |vy|
    this.minMovingDuration = 50;      // milliseconds
    this.velocityWindowDuration = 200; // milliseconds
    this.directionChangeThreshold = 0.1;

    // ===== STATE =====
    this.state = 'IDLE';              // IDLE → MOVING → COMMIT → COOLDOWN
    this.direction = null;            // 'LEFT' | 'RIGHT'
    this.cooldownDuration = 600;
    this.cooldownStartTime = 0;

    // ===== TRACKING =====
    this.rawPalmHistory = [];
    this.palmHistoryWithTime = [];
    this.windowSize = 20;
    this.frameCount = 0;

    this.totalDisplacement = 0;       // NORMALIZED, có dấu
    this.movingStartTime = 0;
    this.moveHandScale = 1.0;
  }

  computePalmCenter(landmarks) {
    const ids = [0, 5, 9, 13, 17];
    const p = ids.map(i => landmarks[i]);
    return {
      x: p.reduce((s, v) => s + v.x, 0) / 5,
      y: p.reduce((s, v) => s + v.y, 0) / 5,
      z: p.reduce((s, v) => s + v.z, 0) / 5
    };
  }

  computeMoveHandScale(landmarks) {
    const a = landmarks[5];
    const b = landmarks[17];
    return Math.max(
      0.01,
      Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
    );
  }

  update(landmarks, handScale, handedness) {
    const palm = this.computePalmCenter(landmarks);
    const now = Date.now();
    this.frameCount++;

    this.moveHandScale = this.computeMoveHandScale(landmarks);

    this.rawPalmHistory.push({ x: palm.x, y: palm.y });
    this.palmHistoryWithTime.push({ x: palm.x, y: palm.y, t: now });
    if (this.rawPalmHistory.length > this.windowSize) {
      this.rawPalmHistory.shift();
    }
    while (this.palmHistoryWithTime.length > 0 && 
           now - this.palmHistoryWithTime[0].t > this.velocityWindowDuration) {
      this.palmHistoryWithTime.shift();
    }
    if (this.palmHistoryWithTime.length < 2) {
      return { gesture: GESTURES.NONE, confidence: 0 };
    }

    // ===== VELOCITY (TIME-BASED) =====
    const velocities = [];
    for (let i = 1; i < this.palmHistoryWithTime.length; i++) {
      const dt = (this.palmHistoryWithTime[i].t - this.palmHistoryWithTime[i - 1].t) / 1000.0;
      if (dt <= 0) continue;
      let vx = (this.palmHistoryWithTime[i].x - this.palmHistoryWithTime[i - 1].x) / dt;
      const vy = (this.palmHistoryWithTime[i].y - this.palmHistoryWithTime[i - 1].y) / dt;
      if (handedness === 'Left') vx = -vx;
      velocities.push({ vx, vy, t: this.palmHistoryWithTime[i].t });
    }

    if (velocities.length === 0) {
      return { gesture: GESTURES.NONE, confidence: 0 };
    }

    const meanVx = velocities.reduce((s, v) => s + v.vx, 0) / velocities.length;
    const meanVy = velocities.reduce((s, v) => s + v.vy, 0) / velocities.length;
    const absMeanVx = Math.abs(meanVx);
    const absMeanVy = Math.abs(meanVy);
    const lastVx = velocities[velocities.length - 1].vx;

    // ===== STATE MACHINE =====
    switch (this.state) {
      case 'IDLE': {
        if (
          absMeanVx > this.minVelocity &&
          absMeanVx > this.velocityRatio * absMeanVy
        ) {
          this.state = 'MOVING';
          this.direction = meanVx > 0 ? 'RIGHT' : 'LEFT';
          this.totalDisplacement = 0;
          this.movingStartTime = now;
        }
        return { gesture: GESTURES.NONE, confidence: 0 };
      }

      case 'MOVING': {
        const expectedSign = this.direction === 'RIGHT' ? 1 : -1;

        // đổi hướng mạnh → reset
        if (
          Math.sign(meanVx) !== expectedSign &&
          absMeanVx > this.directionChangeThreshold
        ) {
          this.reset();
          return { gesture: GESTURES.NONE, confidence: 0 };
        }

        // tích lũy displacement (NORMALIZED, TIME-BASED)
        if (Math.sign(lastVx) === expectedSign && velocities.length >= 2) {
          const dt = (velocities[velocities.length - 1].t - velocities[velocities.length - 2].t) / 1000.0;
          if (dt > 0) {
            this.totalDisplacement += (lastVx * dt) / this.moveHandScale;
          }
        }

        const movingDuration = now - this.movingStartTime;
        const absDisp = Math.abs(this.totalDisplacement);

        if (
          absDisp >= this.minDisplacement &&
          absMeanVx >= this.minVelocity &&
          movingDuration >= this.minMovingDuration
        ) {
          this.state = 'COMMIT';
        }

        return { gesture: GESTURES.NONE, confidence: 0 };
      }

      case 'COMMIT': {
        const absDisp = Math.abs(this.totalDisplacement);
        const dispRatio = Math.min(1, absDisp / this.minDisplacement);
        const velRatio = Math.min(1, absMeanVx / this.minVelocity);
        const confidence = Math.max(0.7, (dispRatio + velRatio) / 2);

        const gesture =
          this.direction === 'RIGHT'
            ? GESTURES.MOVE_RIGHT
            : GESTURES.MOVE_LEFT;

        this.state = 'COOLDOWN';
        this.cooldownStartTime = Date.now();
        this.resetMotion();

        return { gesture, confidence };
      }

      case 'COOLDOWN': {
        if (Date.now() - this.cooldownStartTime >= this.cooldownDuration) {
          this.state = 'IDLE';
        }
        return { gesture: GESTURES.NONE, confidence: 0 };
      }

      default: {
        return { gesture: GESTURES.NONE, confidence: 0 };
      }
    }
  }

  resetMotion() {
    this.direction = null;
    this.totalDisplacement = 0;
    this.movingStartTime = 0;
  }

  reset() {
    this.state = 'IDLE';
    this.resetMotion();
    this.cooldownStartTime = 0;
  }

  getState() {
    return this.state;
  }

  getDebugInfo(handedness) {
    if (this.palmHistoryWithTime.length < 2) {
      return null;
    }

    const now = Date.now();
    const velocities = [];
    for (let i = 1; i < this.palmHistoryWithTime.length; i++) {
      const dt = (this.palmHistoryWithTime[i].t - this.palmHistoryWithTime[i - 1].t) / 1000.0;
      if (dt <= 0) continue;
      let vx = (this.palmHistoryWithTime[i].x - this.palmHistoryWithTime[i - 1].x) / dt;
      const vy = (this.palmHistoryWithTime[i].y - this.palmHistoryWithTime[i - 1].y) / dt;
      if (handedness === 'Left') vx = -vx;
      velocities.push({ vx, vy });
    }

    if (velocities.length === 0) {
      return null;
    }

    const meanVx = velocities.reduce((s, v) => s + v.vx, 0) / velocities.length;
    const instantVx = velocities[velocities.length - 1].vx;
    const absMeanVx = Math.abs(meanVx);
    const absDisp = Math.abs(this.totalDisplacement);
    const movingDuration = this.movingStartTime > 0 ? now - this.movingStartTime : 0;

    let failureReasons = [];
    if (this.state === 'MOVING') {
      if (absMeanVx < this.minVelocity) {
        failureReasons.push('velocity_fail');
      }
      if (absDisp < this.minDisplacement) {
        failureReasons.push('displacement_fail');
      }
      if (movingDuration < this.minMovingDuration) {
        failureReasons.push('duration_fail');
      }
    }

    return {
      state: this.state,
      moveHandScale: this.moveHandScale,
      meanVx: meanVx,
      instantVx: instantVx,
      minVelocity: this.minVelocity,
      displacement: this.totalDisplacement,
      minDisplacement: this.minDisplacement,
      movingDuration: movingDuration,
      minMovingDuration: this.minMovingDuration,
      frames: this.frameCount,
      direction: this.direction,
      failureReasons: failureReasons
    };
  }
}


// ========== GESTURE DETECTOR (ORCHESTRATOR) ==========
class GestureDetector {
  constructor() {
    this.handScale = 1.0;
    this.staticDetector = new StaticGestureDetector();
    this.pinchDetector = new PinchDetector();
    this.moveStateMachine = new MoveStateMachine();
  }

  computeHandScale(landmarks) {
    const wrist = landmarks[0];
    const middleMCP = landmarks[9];
    const dx = wrist.x - middleMCP.x;
    const dy = wrist.y - middleMCP.y;
    const dz = wrist.z - middleMCP.z;
    return Math.hypot(dx, dy, dz);
  }

  detect(landmarks, handedness) {
    if (!landmarks || landmarks.length < 21) {
      return { gesture: GESTURES.NONE, confidence: 0 };
    }

    this.handScale = Math.max(0.01, this.computeHandScale(landmarks));
    
    // TÁCH TUYỆT ĐỐI: Dynamic trước, static sau
    const moveResult = this.moveStateMachine.update(landmarks, this.handScale, handedness);
    const moveState = this.moveStateMachine.getState();
    
    // Reset pinch khi MOVE đang active
    if (moveState === 'MOVING' || moveState === 'COMMIT') {
      this.pinchDetector.reset();
    }
    
    // Chỉ detect static/pinch khi MOVE ở IDLE hoặc COOLDOWN
    let staticResult = { gesture: GESTURES.NONE, confidence: 0 };
    let pinchResult = { gesture: GESTURES.NONE, confidence: 0 };
    
    if (moveState === 'IDLE' || moveState === 'COOLDOWN') {
      staticResult = this.staticDetector.detect(landmarks, this.handScale);
      pinchResult = this.pinchDetector.detect(landmarks, this.handScale);
    }
    
    // MOVE dominates: nếu có MOVE result, return ngay
    if (moveResult.gesture !== GESTURES.NONE) {
      return moveResult;
    }
    
    // PINCH next priority
    if (pinchResult.gesture !== GESTURES.NONE) {
      return pinchResult;
    }
    
    // STATIC fallback
    if (staticResult.gesture !== GESTURES.NONE) {
      return staticResult;
    }
    
    return { gesture: GESTURES.NONE, confidence: 0 };
  }

  reset() {
    this.staticDetector.reset();
    this.pinchDetector.reset();
    this.moveStateMachine.reset();
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
  });

  // ========== THREE.JS SETUP ==========
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

  // ========== ITEMS CAROUSEL ==========
  const items = [
    { name: "Nhẫn Vàng", type: "ring", color: 0xffd700, size: 0.15, thickness: 0.05 },
    { name: "Nhẫn Bạc", type: "ring", color: 0xc0c0c0, size: 0.15, thickness: 0.05 },
    { name: "Nhẫn Đồng", type: "ring", color: 0xcd7f32, size: 0.15, thickness: 0.05 },
    { name: "Vòng Vàng", type: "bracelet", color: 0xffd700, size: 0.6, thickness: 0.2 },
    { name: "Vòng Bạc", type: "bracelet", color: 0xc0c0c0, size: 0.6, thickness: 0.2 }
  ];

  let currentItemIndex = 0;

  // ========== OBJECTS 3D ==========
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
      bracelet.geometry.dispose();
      bracelet.geometry = new THREE.TorusGeometry(item.size, item.thickness, 16, 100);
      bracelet.material.color.setHex(item.color);
      bracelet.visible = true;
      ring.visible = false;
    } else {
      ring.geometry.dispose();
      ring.geometry = new THREE.TorusGeometry(item.size, item.thickness, 16, 100);
      ring.material.color.setHex(item.color);
      ring.visible = true;
      bracelet.visible = false;
    }
  }

  updateCurrentItem();

  // ========== GESTURE DETECTOR ==========
  const gestureDetector = new GestureDetector();

  // ========== EMA SMOOTHING (CHỈ CHO RENDER) ==========
  const SMOOTHING_ALPHA = 0.3;
  let smoothedLandmarks = null;

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

  // ========== MEDIAPIPE HANDS SETUP ==========
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
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const rawLandmarks = results.multiHandLandmarks[0];
      const handedness = results.multiHandedness?.[0]?.categoryName || 'Unknown';
      
      // EMA smoothing CHỈ cho render (không cho gesture detection)
      smoothedLandmarks = smoothLandmarks(rawLandmarks, smoothedLandmarks, SMOOTHING_ALPHA);
      
      // Gesture detection dùng RAW landmarks (không smooth)
      const result = gestureDetector.detect(rawLandmarks, handedness);
      
      // Render dùng smoothed landmarks
      const smoothedWrist = smoothedLandmarks[0];
      const smoothedIndexMCP = smoothedLandmarks[5];
      updateBraceletPosition(smoothedWrist, bracelet);
      updateRingPosition(smoothedIndexMCP, ring);
      
      // Handle gesture
      if (result.gesture !== GESTURES.NONE) {
        handleGesture(result.gesture, result.confidence);
      }
      
      // Debug
      updateDebug(debugDiv, smoothedWrist, result, smoothedLandmarks, handedness);
      
    } else {
      debugDiv.textContent = "Không detect được tay";
      gestureDetector.reset();
      smoothedLandmarks = null;
      bracelet.visible = false;
      ring.visible = false;
    }
  });

  // ========== GESTURE HANDLER ==========
  function handleGesture(gesture, confidence) {
    console.log(`Gesture: ${gesture} (confidence: ${confidence.toFixed(2)})`);
    
    switch (gesture) {
      case GESTURES.FIST:
        console.log('Nắm tay');
        break;
      case GESTURES.MOVE_LEFT:
        console.log('di chuyển trái');
        currentItemIndex = (currentItemIndex - 1 + items.length) % items.length;
        updateCurrentItem();
        break;
      case GESTURES.MOVE_RIGHT:
        console.log('di chuyển phải');
        currentItemIndex = (currentItemIndex + 1) % items.length;
        updateCurrentItem();
        break;
      case GESTURES.PINCH:
        console.log('Pinch');
        break;
      case GESTURES.THUMB_UP:
      case GESTURES.INDEX_UP:
      case GESTURES.MIDDLE_UP:
      case GESTURES.RING_UP:
      case GESTURES.PINKY_UP:
        console.log(`Ngón: ${gesture}`);
        break;
    }
  }

  // ========== MAPPING TỌA ĐỘ ==========
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

  // ========== DEBUG ==========
  function updateDebug(debugDiv, wrist, result, landmarks, handedness) {
    const currentItem = items[currentItemIndex];
    const staticDetector = gestureDetector.staticDetector;
    const thumbExtended = staticDetector.isThumbExtended(landmarks, gestureDetector.handScale);
    const indexExtended = staticDetector.isFingerExtended(landmarks, [5, 6, 7, 8]);
    const middleExtended = staticDetector.isFingerExtended(landmarks, [9, 10, 11, 12]);
    const ringExtended = staticDetector.isFingerExtended(landmarks, [13, 14, 15, 16]);
    const pinkyExtended = staticDetector.isFingerExtended(landmarks, [17, 18, 19, 20]);
    
    // Debug info từ MoveStateMachine (khớp logic thật)
    const moveDebug = gestureDetector.moveStateMachine.getDebugInfo(handedness);
    
    let info = `<strong>Hand Detected</strong><br>`;
    info += `Hand: ${handedness}<br>`;
    info += `Scale: ${gestureDetector.handScale.toFixed(3)}<br>`;
    info += `Wrist: x=${wrist.x.toFixed(3)}, y=${wrist.y.toFixed(3)}<br>`;
    info += `Item: ${currentItem.name} (${currentItemIndex + 1}/${items.length})<br>`;
    info += `<br><strong>Gesture: ${result.gesture}</strong><br>`;
    info += `Confidence: ${(result.confidence * 100).toFixed(0)}%<br>`;
    info += `Pinch State: ${gestureDetector.pinchDetector.state}<br>`;
    
    if (moveDebug) {
      info += `<br><strong>MOVE State: ${moveDebug.state}</strong><br>`;
      info += `Direction: ${moveDebug.direction || 'N/A'}<br>`;
      info += `Move HandScale: ${moveDebug.moveHandScale.toFixed(3)}<br>`;
      info += `Mean Velocity: ${moveDebug.meanVx.toFixed(4)}<br>`;
      info += `Instant Velocity: ${moveDebug.instantVx.toFixed(4)}<br>`;
      info += `Min Velocity: ${moveDebug.minVelocity.toFixed(4)}<br>`;
      info += `Displacement: ${moveDebug.displacement.toFixed(3)}<br>`;
      info += `Min Displacement: ${moveDebug.minDisplacement.toFixed(3)}<br>`;
      info += `Moving Duration: ${Math.round(moveDebug.movingDuration)}ms<br>`;
      info += `Min Duration: ${moveDebug.minMovingDuration}ms<br>`;
      info += `Total Frames: ${moveDebug.frames}<br>`;
      if (moveDebug.failureReasons && moveDebug.failureReasons.length > 0) {
        info += `Failures: ${moveDebug.failureReasons.join(', ')}<br>`;
      }
      if (moveDebug.state === 'COOLDOWN') {
        const remaining = gestureDetector.moveStateMachine.cooldownDuration - 
          (Date.now() - gestureDetector.moveStateMachine.cooldownStartTime);
        info += `Cooldown: ${Math.max(0, Math.round(remaining))}ms<br>`;
      }
    }
    
    info += `<br>Ngón tay:<br>`;
    info += `Cái: ${thumbExtended ? '✓' : '✗'}<br>`;
    info += `Trỏ: ${indexExtended ? '✓' : '✗'}<br>`;
    info += `Giữa: ${middleExtended ? '✓' : '✗'}<br>`;
    info += `Áp út: ${ringExtended ? '✓' : '✗'}<br>`;
    info += `Út: ${pinkyExtended ? '✓' : '✗'}<br>`;
    
    debugDiv.innerHTML = info;
    stateDiv.textContent = `${result.gesture} (${(result.confidence * 100).toFixed(0)}%)`;
  }

  // ========== CAMERA PROCESSING ==========
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

  // ========== ANIMATION LOOP ==========
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
