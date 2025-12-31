// Đợi tất cả script load xong
window.addEventListener("load", () => {
  init();
});

function init() {
  const video = document.getElementById("video");
  const debugDiv = document.getElementById("debug");

  // Khởi tạo camera
  navigator.mediaDevices.getUserMedia({
    video: { width: 1280, height: 720 }
  }).then(stream => {
    video.srcObject = stream;
  });

  // ========== THREE.JS SETUP ==========
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.z = 3;

  const renderer = new THREE.WebGLRenderer({ alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Ánh sáng
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const light = new THREE.DirectionalLight(0xffffff, 0.8);
  light.position.set(0, 0, 5);
  scene.add(light);

  // ========== OBJECTS 3D ==========
  // Vòng (bracelet) - anchor tại WRIST (keypoint 0)
  const braceletGeometry = new THREE.TorusGeometry(0.6, 0.2, 16, 100);
  const braceletMaterial = new THREE.MeshStandardMaterial({ color: 0xffd700 });
  const bracelet = new THREE.Mesh(braceletGeometry, braceletMaterial);
  bracelet.rotation.x = Math.PI / 2; // Xoay để nằm ngang như vòng tay
  scene.add(bracelet);

  // Nhẫn (ring) - anchor tại INDEX_FINGER_MCP (keypoint 5)
  const ringGeometry = new THREE.TorusGeometry(0.15, 0.05, 16, 100);
  const ringMaterial = new THREE.MeshStandardMaterial({ color: 0xc0c0c0 });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = Math.PI / 2; // Xoay để nằm ngang như nhẫn
  scene.add(ring);

  // ========== EMA SMOOTHING ==========
  // Exponential Moving Average để chống rung
  // Alpha càng nhỏ = càng mượt nhưng phản ứng chậm hơn
  const SMOOTHING_ALPHA = 0.3; // 0.3 = cân bằng tốt giữa mượt và responsive

  // State cho smoothing: lưu vị trí đã được smooth
  let smoothedWrist = { x: 0, y: 0, z: 0 };
  let smoothedIndexMCP = { x: 0, y: 0, z: 0 };

  // Hàm EMA smoothing
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
      
      // Lấy keypoints cần thiết
      const wrist = landmarks[0]; // WRIST - anchor cho vòng
      const indexMCP = landmarks[5]; // INDEX_FINGER_MCP - anchor cho nhẫn
      
      // Áp dụng smoothing
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
      
      // Map tọa độ và cập nhật objects
      updateBraceletPosition(smoothedWrist, bracelet, debugDiv);
      updateRingPosition(smoothedIndexMCP, ring, debugDiv);
      
    } else {
      debugDiv.textContent = "Không detect được tay";
    }
  });

  // ========== MAPPING TỌA ĐỘ ==========
  // Map từ normalized [0-1] sang world space của Three.js
  function normalizedToWorld(normalized) {
    // Video bị flip ngang (scaleX(-1)) nên đảo ngược X
    const worldX = ((1 - normalized.x) - 0.5) * 4;
    const worldY = (0.5 - normalized.y) * 4; // Đảo ngược Y
    const worldZ = normalized.z * 2;
    
    return { x: worldX, y: worldY, z: worldZ };
  }

  // Cập nhật vị trí vòng (bracelet) - anchor tại WRIST
  function updateBraceletPosition(wrist, bracelet, debugDiv) {
    const world = normalizedToWorld(wrist);
    bracelet.position.set(world.x, world.y, world.z);
  }

  // Cập nhật vị trí nhẫn (ring) - anchor tại INDEX_FINGER_MCP
  function updateRingPosition(indexMCP, ring, debugDiv) {
    const world = normalizedToWorld(indexMCP);
    ring.position.set(world.x, world.y, world.z);
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
    
    // Objects có thể xoay nhẹ để dễ nhìn
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

