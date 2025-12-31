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

  // Object 3D (sẽ di chuyển theo tay)
  const geometry = new THREE.TorusGeometry(0.5, 0.15, 16, 100);
  const material = new THREE.MeshStandardMaterial({ color: 0xffd700 });
  const ring = new THREE.Mesh(geometry, material);
  scene.add(ring);

  // ========== MEDIAPIPE HANDS SETUP ==========
  // Kiểm tra xem Hands đã được load chưa
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
    maxNumHands: 1,  // Chỉ detect 1 tay
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });

  // Callback khi detect được tay
  hands.onResults((results) => {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const landmarks = results.multiHandLandmarks[0]; // Lấy tay đầu tiên
      
      // Log keypoints để hiểu cấu trúc
      logKeypoints(landmarks);
      
      // Map tọa độ normalized [0-1] sang world space của Three.js
      mapToWorldSpace(landmarks, ring, debugDiv);
    } else {
      // Không có tay → ẩn object hoặc đặt về vị trí mặc định
      debugDiv.textContent = "Không detect được tay";
    }
  });

  // ========== MAPPING TỌA ĐỘ ==========
  // Hiểu: từ pixel (normalized [0-1]) → world space của Three.js
  function mapToWorldSpace(landmarks, ring, debugDiv) {
    // Sử dụng WRIST (keypoint 0) hoặc INDEX_FINGER_MCP (keypoint 5)
    // Wrist là điểm dễ track nhất - cổ tay
    const wrist = landmarks[0]; // x, y, z đều normalized [0-1]
    
    // MediaPipe: x từ trái sang phải [0-1], y từ trên xuống [0-1]
    // Video bị flip ngang (scaleX(-1)) nên cần đảo ngược X
    // Three.js: x từ -1 đến 1 (trái sang phải), y từ 1 đến -1 (dưới lên trên)
    
    // Map x: [0-1] → [-2, 2] nhưng đảo ngược vì video bị flip
    // Khi tay ở bên trái video (x=0), object nên ở bên trái Three.js (x=-2)
    // Khi tay ở bên phải video (x=1), object nên ở bên phải Three.js (x=2)
    // Nhưng vì video flip, nên đảo ngược: (1 - wrist.x) thay vì wrist.x
    const worldX = ((1 - wrist.x) - 0.5) * 4;  // Đảo ngược X để khớp với video flip
    
    // Map y: [0-1] → [2, -2] (đảo ngược vì Three.js y đi lên)
    const worldY = (0.5 - wrist.y) * 4;  // 0 → 2, 0.5 → 0, 1 → -2
    
    // Z depth từ MediaPipe (khoảng -0.5 đến 0.5), map sang Three.js
    const worldZ = wrist.z * 2;  // Điều chỉnh độ sâu
    
    // Cập nhật vị trí object
    ring.position.set(worldX, worldY, worldZ);
    
    // Debug info
    debugDiv.innerHTML = `
      <strong>Hand Detected</strong><br>
      Wrist (normalized): x=${wrist.x.toFixed(3)}, y=${wrist.y.toFixed(3)}, z=${wrist.z.toFixed(3)}<br>
      World position: x=${worldX.toFixed(2)}, y=${worldY.toFixed(2)}, z=${worldZ.toFixed(2)}
    `;
  }

  // ========== LOG KEYPOINTS ==========
  function logKeypoints(landmarks) {
    // MediaPipe Hands có 21 keypoints
    // Log một vài keypoint quan trọng để hiểu cấu trúc
    const keyPoints = [
      { name: "WRIST_COTAY", idx: 0 },
      { name: "INDEX_FINGER_MCP_NGONTRO", idx: 5 },
      { name: "MIDDLE_FINGER_MCP_NGONGIUA", idx: 9 },
      { name: "RING_FINGER_MCP_NGONAPUT", idx: 13 },
      { name: "PINKY_MCP_NGONUT", idx: 17 }
    ];
    
    console.log("=== KEYPOINTS ===");
    keyPoints.forEach(kp => {
      const point = landmarks[kp.idx];
      console.log(`${kp.name} (${kp.idx}): x=${point.x.toFixed(3)}, y=${point.y.toFixed(3)}, z=${point.z.toFixed(3)}`);
    });
    console.log("=================");
  }

  // ========== CAMERA PROCESSING ==========
  // Kiểm tra Camera đã được load chưa
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
    
    // Object vẫn có thể xoay nhẹ để dễ nhìn
    ring.rotation.y += 0.005;
    
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

