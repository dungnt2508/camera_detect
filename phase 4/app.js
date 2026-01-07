import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GESTURES } from './constants.js';
import { GestureDetector } from './detectors/GestureDetector.js';
import { ApplicationStateMachine } from './state/ApplicationStateMachine.js';
import { TARGET_UNIFORM_SIZE, loadGLBModel, normalizeModelScale } from './utils/modelUtils.js';
import { updateCarousel, CAROUSEL_CENTER_Z } from './utils/carouselUtils.js';
import { updateBraceletPosition, updateRingPosition, getIndexFingerDirection, smoothLandmarks } from './utils/positionUtils.js';
import { resetZoom, updateAutoZoom } from './utils/zoomUtils.js';
import { updateDebug } from './utils/debugUtils.js';

window.addEventListener("load", () => {
  init();
});

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
    { name: "Nhẫn Kim cương", type: "ring", glbPath: "assets/ring/ring-nhankc.glb" },
    { name: "Nhẫn Kim cương 14k", type: "ring", glbPath: "assets/ring/ring-nhankc-14k.glb" },
    { name: "Nhẫn Kim cương 18k", type: "ring", glbPath: "assets/ring/ring-nhankc-18k.glb" },
    { name: "Nhẫn Cầu hôn", type: "ring", glbPath: "assets/ring/ring-nhancauhon.glb" },
    // { name: "Nhẫn Main", type: "ring", glbPath: "assets/ring/Main_model.glb" },
    { name: "Vòng 1", type: "bracelet", glbPath: "assets/bracelet/1.glb" }
  ];

  let currentItemIndex = 0;
  let itemScale = 1.0; // Zoom scale cho item
  let autoZoomState = 'STOPPED'; // 'ZOOM_IN', 'ZOOM_OUT', 'STOPPED'

  // GLB models containers
  const loader = new GLTFLoader();
  const loadedModels = []; // Mảng chứa tất cả models đã load
  let currentModel = null; // Model hiện tại đang try-on

  function loadAllModels() {
    let loadedCount = 0;
    
    items.forEach((item, index) => {
      // Sử dụng target size chung cho tất cả items
      loadGLBModel(loader, item.glbPath, (model) => {
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
          updateCarousel(loadedModels, currentItemIndex);
        }
      });
    });
  }

  function updateCurrentItem() {
    // Chỉ update carousel, không update try-on model
    updateCarousel(loadedModels, currentItemIndex);
  }

  function handleResetZoom() {
    const result = resetZoom(currentModel);
    itemScale = result.itemScale;
    autoZoomState = result.autoZoomState;
  }

  function handleUpdateAutoZoom() {
    itemScale = updateAutoZoom(autoZoomState, itemScale, currentModel);
  }

  // Khởi tạo load tất cả models
  loadAllModels();
  updateCurrentItem();

  const gestureDetector = new GestureDetector();
  const appStateMachine = new ApplicationStateMachine();
  
  // Track current app state for animate function
  let currentAppState = 'IDLE';

  const SMOOTHING_ALPHA = 0.3;
  let smoothedLandmarks = null;
  let lastFistState = 'OPEN';

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
        updateCarousel(loadedModels, currentItemIndex);
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
            handleResetZoom();
          }
        }
        
        // Cập nhật vị trí item trên tay
        if (currentModel) {
          const item = items[currentItemIndex];
          if (item.type === "bracelet") {
            updateBraceletPosition(smoothedWrist, currentModel);
          } else {
            // Nhẫn: fit với ngón tay, tính rotation dựa trên hướng ngón tay
            updateRingPosition(smoothedLandmarks, currentModel);
          }
        }
      }
      // ACTIVE, IDLE, RESET: Ẩn tất cả
      else {
        updateCarousel(loadedModels, currentItemIndex);
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
        handleResetZoom();
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
      
      const moveDebug = gestureDetector.moveStateMachine.getDebugInfo(smoothedLandmarks, gestureDetector.handScale, handedness);
      const pinchDebug = gestureDetector.pinchDetector.getDebugInfo();
      const fistHoldDebug = gestureDetector.fistHoldDetector.getDebugInfo();
      
      updateDebug(
        debugDiv,
        stateDiv,
        smoothedWrist,
        result,
        smoothedLandmarks,
        handedness,
        currentAppState,
        gestureDetector,
        moveDebug,
        pinchDebug,
        fistHoldDebug,
        items[currentItemIndex],
        currentItemIndex,
        items,
        itemScale,
        autoZoomState
      );
      
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
      updateCarousel(loadedModels, currentItemIndex);
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
          handleResetZoom(); // Reset zoom khi vào TRY_ON
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
    
    // Không rotate try-on model khi TRY_ON (nhẫn sẽ fit với ngón tay)
    // Chỉ rotate trong BROWSE mode
    if (currentModel && currentModel.visible && currentAppState !== 'TRY_ON') {
      currentModel.rotation.z += 0.005;
    }
    
    // Auto zoom update
    handleUpdateAutoZoom();
    renderer.render(scene, camera);
  }

  animate();

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}
