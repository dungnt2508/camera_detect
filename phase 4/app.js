// Đợi tất cả script load xong
window.addEventListener("load", () => {
  init();
});

// ========== GESTURE TYPES ==========
const GESTURES = {
  NONE: 'NONE',
  FIST: 'FIST',           // Nắm tay
  MOVE_LEFT: 'MOVE_LEFT', // Di chuyển qua trái
  MOVE_RIGHT: 'MOVE_RIGHT', // Di chuyển qua phải
  THUMB_UP: 'THUMB_UP',   // Giơ ngón cái
  MIDDLE_UP: 'MIDDLE_UP', // Giơ ngón giữa
  INDEX_UP: 'INDEX_UP',   // Giơ ngón trỏ
  RING_UP: 'RING_UP',     // Giơ ngón áp út
  PINKY_UP: 'PINKY_UP'    // Giơ ngón út
};

// ========== GESTURE DETECTOR ==========
class GestureDetector {
  constructor() {
    // Lịch sử vị trí để detect di chuyển
    this.positionHistory = [];
    this.positionHistoryMaxLength = 10;
    this.moveThreshold = 0.1; // Ngưỡng để detect di chuyển (normalized)
    
    // Keypoints của MediaPipe Hands (21 điểm)
    // 0: WRIST
    // 1-4: THUMB
    // 5-8: INDEX
    // 9-12: MIDDLE
    // 13-16: RING
    // 17-20: PINKY
  }

  // Tính khoảng cách giữa 2 điểm
  distance(p1, p2) {
    return Math.sqrt(
      Math.pow(p1.x - p2.x, 2) +
      Math.pow(p1.y - p2.y, 2) +
      Math.pow(p1.z - p2.z, 2)
    );
  }

  // Kiểm tra ngón tay có duỗi ra không
  isFingerExtended(landmarks, fingerIndices) {
    // fingerIndices: [MCP, PIP, DIP, TIP]
    const [mcp, pip, dip, tip] = fingerIndices;
    
    // Kiểm tra: TIP phải cao hơn PIP, và PIP phải cao hơn MCP
    // (trong normalized coordinates, y nhỏ hơn = cao hơn)
    const tipY = landmarks[tip].y;
    const pipY = landmarks[pip].y;
    const mcpY = landmarks[mcp].y;
    
    return tipY < pipY && pipY < mcpY;
  }

  // Detect gesture từ landmarks
  detect(landmarks) {
    if (!landmarks || landmarks.length < 21) {
      return GESTURES.NONE;
    }

    const wrist = landmarks[0];
    
    // Cập nhật position history
    this.positionHistory.push({
      x: wrist.x,
      y: wrist.y,
      timestamp: Date.now()
    });
    
    if (this.positionHistory.length > this.positionHistoryMaxLength) {
      this.positionHistory.shift();
    }

    // 1. Detect nắm tay (FIST)
    // Tất cả các ngón đều gập (không duỗi)
    const thumbExtended = this.isFingerExtended(landmarks, [1, 2, 3, 4]);
    const indexExtended = this.isFingerExtended(landmarks, [5, 6, 7, 8]);
    const middleExtended = this.isFingerExtended(landmarks, [9, 10, 11, 12]);
    const ringExtended = this.isFingerExtended(landmarks, [13, 14, 15, 16]);
    const pinkyExtended = this.isFingerExtended(landmarks, [17, 18, 19, 20]);
    
    const extendedFingers = [
      thumbExtended,
      indexExtended,
      middleExtended,
      ringExtended,
      pinkyExtended
    ].filter(Boolean).length;
    
    // Nếu không có ngón nào duỗi → nắm tay
    if (extendedFingers === 0) {
      return GESTURES.FIST;
    }

    // 2. Detect giơ từng ngón (chỉ 1 ngón duỗi)
    if (extendedFingers === 1) {
      if (thumbExtended) return GESTURES.THUMB_UP;
      if (indexExtended) return GESTURES.INDEX_UP;
      if (middleExtended) return GESTURES.MIDDLE_UP;
      if (ringExtended) return GESTURES.RING_UP;
      if (pinkyExtended) return GESTURES.PINKY_UP;
    }

    // 3. Detect di chuyển trái/phải (khi có nhiều ngón duỗi hoặc nắm tay)
    if (this.positionHistory.length >= 5) {
      const recent = this.positionHistory.slice(-5);
      const first = recent[0];
      const last = recent[recent.length - 1];
      
      const deltaX = last.x - first.x;
      const absDeltaX = Math.abs(deltaX);
      const deltaTime = last.timestamp - first.timestamp;
      
      // Phải di chuyển đủ xa và đủ nhanh
      if (absDeltaX > this.moveThreshold && deltaTime < 500) {
        // Kiểm tra direction consistency
        let consistent = true;
        for (let i = 1; i < recent.length - 1; i++) {
          const dir = recent[i].x - first.x;
          if ((dir > 0) !== (deltaX > 0)) {
            consistent = false;
            break;
          }
        }
        
        if (consistent) {
          return deltaX > 0 ? GESTURES.MOVE_RIGHT : GESTURES.MOVE_LEFT;
        }
      }
    }

    return GESTURES.NONE;
  }

  reset() {
    this.positionHistory = [];
  }
}

function init() {
  const video = document.getElementById("video");
  const debugDiv = document.getElementById("debug");
  const stateDiv = document.getElementById("state");

  // Khởi tạo camera
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
    {
      name: "Nhẫn Vàng",
      type: "ring",
      color: 0xffd700,
      size: 0.15,
      thickness: 0.05
    },
    {
      name: "Nhẫn Bạc",
      type: "ring",
      color: 0xc0c0c0,
      size: 0.15,
      thickness: 0.05
    },
    {
      name: "Nhẫn Đồng",
      type: "ring",
      color: 0xcd7f32,
      size: 0.15,
      thickness: 0.05
    },
    {
      name: "Vòng Vàng",
      type: "bracelet",
      color: 0xffd700,
      size: 0.6,
      thickness: 0.2
    },
    {
      name: "Vòng Bạc",
      type: "bracelet",
      color: 0xc0c0c0,
      size: 0.6,
      thickness: 0.2
    }
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

  // Hàm cập nhật item hiện tại
  function updateCurrentItem() {
    const item = items[currentItemIndex];
    
    if (item.type === "bracelet") {
      bracelet.geometry.dispose();
      bracelet.geometry = new THREE.TorusGeometry(item.size, item.thickness, 16, 100);
      bracelet.material.color.setHex(item.color);
      bracelet.visible = true;
      ring.visible = false;
    } else if (item.type === "ring") {
      ring.geometry.dispose();
      ring.geometry = new THREE.TorusGeometry(item.size, item.thickness, 16, 100);
      ring.material.color.setHex(item.color);
      ring.visible = true;
      bracelet.visible = false;
    }
    
    console.log(`Current item: ${item.name} (${currentItemIndex + 1}/${items.length})`);
  }

  updateCurrentItem();

  // ========== GESTURE DETECTOR ==========
  const gestureDetector = new GestureDetector();
  let lastGesture = GESTURES.NONE;
  let lastGestureTime = 0;
  const gestureCooldown = 300; // 300ms cooldown giữa các gesture

  // ========== EMA SMOOTHING ==========
  const SMOOTHING_ALPHA = 0.3;
  let smoothedWrist = { x: 0, y: 0, z: 0 };
  let smoothedIndexMCP = { x: 0, y: 0, z: 0 };

  function smoothPosition(current, previous, alpha) {
    return {
      x: previous.x * (1 - alpha) + current.x * alpha,
      y: previous.y * (1 - alpha) + current.y * alpha,
      z: previous.z * (1 - alpha) + current.z * alpha
    };
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

  // Callback khi detect được tay
  hands.onResults((results) => {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const landmarks = results.multiHandLandmarks[0];
      const wrist = landmarks[0];
      const indexMCP = landmarks[5];
      
      // Smoothing
      smoothedWrist = smoothPosition(
        { x: wrist.x, y: wrist.y, z: wrist.z },
        smoothedWrist,
        SMOOTHING_ALPHA
      );
      
      smoothedIndexMCP = smoothPosition(
        { x: indexMCP.x, y: indexMCP.y, z: indexMCP.z },
        smoothedIndexMCP,
        SMOOTHING_ALPHA
      );
      
      // Update objects position
      updateBraceletPosition(smoothedWrist, bracelet);
      updateRingPosition(smoothedIndexMCP, ring);
      
      // Detect gesture
      const now = Date.now();
      const currentGesture = gestureDetector.detect(landmarks);
      
      // Cooldown để tránh trigger liên tục
      if (currentGesture !== GESTURES.NONE && 
          (currentGesture !== lastGesture || now - lastGestureTime > gestureCooldown)) {
        handleGesture(currentGesture);
        lastGesture = currentGesture;
        lastGestureTime = now;
      }
      
      // Debug info
      updateDebug(debugDiv, smoothedWrist, currentGesture, landmarks);
      
    } else {
      debugDiv.textContent = "Không detect được tay";
      gestureDetector.reset();
      bracelet.visible = false;
      ring.visible = false;
    }
  });

  // ========== GESTURE HANDLER ==========
  function handleGesture(gesture) {
    console.log(`Gesture detected: ${gesture}`);
    
    switch (gesture) {
      case GESTURES.FIST:
        // Nắm tay → có thể dùng để select/confirm
        console.log('Nắm tay - Select item');
        break;
        
      case GESTURES.MOVE_LEFT:
        // Di chuyển trái → item trước
        currentItemIndex = (currentItemIndex - 1 + items.length) % items.length;
        updateCurrentItem();
        console.log(`← Item: ${items[currentItemIndex].name}`);
        break;
        
      case GESTURES.MOVE_RIGHT:
        // Di chuyển phải → item tiếp theo
        currentItemIndex = (currentItemIndex + 1) % items.length;
        updateCurrentItem();
        console.log(`→ Item: ${items[currentItemIndex].name}`);
        break;
        
      case GESTURES.THUMB_UP:
        console.log('👍 Ngón cái');
        break;
        
      case GESTURES.INDEX_UP:
        console.log('👆 Ngón trỏ');
        break;
        
      case GESTURES.MIDDLE_UP:
        console.log('🖕 Ngón giữa');
        break;
        
      case GESTURES.RING_UP:
        console.log('💍 Ngón áp út');
        break;
        
      case GESTURES.PINKY_UP:
        console.log('🤙 Ngón út');
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
  function updateDebug(debugDiv, wrist, gesture, landmarks) {
    const currentItem = items[currentItemIndex];
    
    // Đếm số ngón duỗi
    const thumbExtended = gestureDetector.isFingerExtended(landmarks, [1, 2, 3, 4]);
    const indexExtended = gestureDetector.isFingerExtended(landmarks, [5, 6, 7, 8]);
    const middleExtended = gestureDetector.isFingerExtended(landmarks, [9, 10, 11, 12]);
    const ringExtended = gestureDetector.isFingerExtended(landmarks, [13, 14, 15, 16]);
    const pinkyExtended = gestureDetector.isFingerExtended(landmarks, [17, 18, 19, 20]);
    
    let info = `<strong>Hand Detected</strong><br>`;
    info += `Wrist: x=${wrist.x.toFixed(3)}, y=${wrist.y.toFixed(3)}<br>`;
    info += `Item: ${currentItem.name} (${currentItemIndex + 1}/${items.length})<br>`;
    info += `<br><strong>Gesture: ${gesture}</strong><br>`;
    info += `<br>Ngón tay:<br>`;
    info += `Cái: ${thumbExtended ? '✓' : '✗'}<br>`;
    info += `Trỏ: ${indexExtended ? '✓' : '✗'}<br>`;
    info += `Giữa: ${middleExtended ? '✓' : '✗'}<br>`;
    info += `Áp út: ${ringExtended ? '✓' : '✗'}<br>`;
    info += `Út: ${pinkyExtended ? '✓' : '✗'}<br>`;
    
    debugDiv.innerHTML = info;
    stateDiv.textContent = `Gesture: ${gesture}`;
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

  // Resize handler
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}
