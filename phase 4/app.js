import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GESTURES } from './constants.js';
import { GestureDetector } from './detectors/GestureDetector.js';
import { ApplicationStateMachine } from './state/ApplicationStateMachine.js';
import { TARGET_UNIFORM_SIZE, loadGLBModel, normalizeModelScale } from './utils/modelUtils.js';
import { updateCarousel, CAROUSEL_CENTER_Z } from './utils/carouselUtils.js';
import { getIndexFingerDirection } from './utils/positionUtils.js';
import { resetZoom, updateAutoZoom, applyCombinedScale } from './utils/zoomUtils.js';
import { updateDebug } from './utils/debugUtils.js';
import { RingAttachmentController } from './controllers/RingAttachmentController.js';
import { NecklaceAttachmentController } from './controllers/NecklaceAttachmentController.js';
import { ModelLifecycleManager } from './controllers/ModelLifecycleManager.js';
import { GestureStateController } from './controllers/GestureStateController.js';

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
    { name: "Vòng tay 1", type: "bracelet", glbPath: "assets/bracelet/vongtay1.glb" },
    { name: "Vòng tay 2", type: "bracelet", glbPath: "assets/bracelet/vongtay2.glb" },
    { name: "Vòng tay 3", type: "bracelet", glbPath: "assets/bracelet/vongtay3.glb" },
    { name: "Dây chuyền 1", type: "necklace", glbPath: "assets/daychuyen/daychuyen1.glb" },
    { name: "Dây chuyền 2", type: "necklace", glbPath: "assets/daychuyen/daychuyen2.glb" },
    { name: "Dây chuyền 3", type: "necklace", glbPath: "assets/daychuyen/daychuyen3.glb" },
  ];

  let currentItemIndex = 0;
  let itemScale = 1.0; // Zoom scale cho item
  let autoZoomState = 'STOPPED'; // 'ZOOM_IN', 'ZOOM_OUT', 'STOPPED'

  // GLB models containers
  const loader = new GLTFLoader();
  const lifecycleManager = new ModelLifecycleManager(scene, loader, items);
  let currentModel = null; // Model hiện tại đang try-on

  lifecycleManager.loadAll((models) => {
    updateCarousel(models, currentItemIndex);
  });

  function handleResetZoom() {
    const result = resetZoom(currentModel);
    itemScale = result.itemScale;
    autoZoomState = result.autoZoomState;
  }

  function handleUpdateAutoZoom() {
    itemScale = updateAutoZoom(autoZoomState, itemScale, currentModel);
  }

  const gestureDetector = new GestureDetector();
  const appStateMachine = new ApplicationStateMachine();
  const cameraProjection = {
    fov: camera.fov,
    aspect: camera.aspect,
    near: camera.near,
    far: camera.far
  };
  const ringAttachmentController = new RingAttachmentController(cameraProjection);
  const necklaceAttachmentController = new NecklaceAttachmentController(cameraProjection);
  const gestureStateController = new GestureStateController(
    appStateMachine,
    lifecycleManager,
    ringAttachmentController,
    {
      resetZoom: (model) => {
        const result = resetZoom(model);
        itemScale = result.itemScale;
        autoZoomState = result.autoZoomState;
      },
      applyAutoZoom: (autoState, currentScale, model) => {
        return updateAutoZoom(autoState, currentScale, model);
      },
      getIndexDirection: getIndexFingerDirection
    }
  );

  // Track current app state for animate function
  let currentAppState = 'IDLE';

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

  // Initialize Pose
  const PoseClass = window.Pose || (window.mpPose ? window.mpPose.Pose : null);
  if (!PoseClass) {
    console.error('MediaPipe Pose chưa được load!');
    debugDiv.textContent = 'Lỗi: MediaPipe Pose chưa được load';
    return;
  }

  const pose = new PoseClass({
    locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
    }
  });

  pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });

  let latestPoseResults = null;
  pose.onResults((results) => {
    latestPoseResults = results;
  });

  hands.onResults((results) => {
    const hasHand = results.multiHandLandmarks && results.multiHandLandmarks.length > 0;
    currentAppState = appStateMachine.update(hasHand);

    if (hasHand) {
      const rawLandmarks = results.multiHandLandmarks[0];
      const handedness = results.multiHandedness?.[0]?.categoryName || 'Unknown';

      // Gỡ bỏ smoothedLandmarks layer (Triple Smoothing Fix)
      const gestureResult = gestureDetector.detect(rawLandmarks, handedness, currentAppState);
      const handleResult = gestureStateController.handle({
        appState: currentAppState,
        gestureResult,
        landmarks: rawLandmarks,
        handedness,
        currentItemIndex,
        items,
        gestureDetector,
        autoZoomState,
        itemScale,
        hasHand // Ủy quyền xử lý mất tay cho controller
      });
      currentAppState = handleResult.nextState;
      currentItemIndex = handleResult.nextIndex;
      autoZoomState = handleResult.nextAutoZoom;
      itemScale = handleResult.nextItemScale;
      currentModel = handleResult.tryOnModel || lifecycleManager.getTryOnInstance();

      if (currentAppState === 'BROWSE') {
        lifecycleManager.showCarousel(currentItemIndex);
        currentModel = null;
      } else if (currentAppState === 'TRY_ON' && currentModel) {
        const item = items[currentItemIndex];
        currentModel.userData.zoomScale = itemScale;

        if (item.type === "bracelet") {
          ringAttachmentController.updateBracelet(rawLandmarks, currentModel);
        } else if (item.type === "necklace") {
          if (latestPoseResults && latestPoseResults.poseLandmarks) {
            necklaceAttachmentController.update(latestPoseResults.poseLandmarks, currentModel);
          }
        } else {
          // Xác định ngón tay đang giơ (INDEX, MIDDLE, RING, PINKY)
          let fingerType = currentModel.userData.activeFinger || 'INDEX';
          if (gestureResult.gesture === GESTURES.INDEX_UP) fingerType = 'INDEX';
          else if (gestureResult.gesture === GESTURES.MIDDLE_UP) fingerType = 'MIDDLE';
          else if (gestureResult.gesture === GESTURES.RING_UP) fingerType = 'RING';
          else if (gestureResult.gesture === GESTURES.PINKY_UP) fingerType = 'PINKY';
          else if (gestureResult.gesture === GESTURES.THUMB_UP) fingerType = 'THUMB';

          currentModel.userData.activeFinger = fingerType;
          ringAttachmentController.update(rawLandmarks, currentModel, fingerType);
        }
        applyCombinedScale(currentModel);
      }

      const moveDebug = gestureDetector.moveStateMachine.getDebugInfo(rawLandmarks, gestureDetector.handScale, handedness);
      const pinchDebug = gestureDetector.pinchDetector.getDebugInfo();
      const fistHoldDebug = gestureDetector.fistHoldDetector.getDebugInfo();

      updateDebug(
        debugDiv,
        stateDiv,
        rawLandmarks[0],
        gestureResult,
        rawLandmarks,
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
      // Không có tay - Không reset carousel ngay lập tức
      // Điều này cho phép grace period ở GestureStateController hoạt động
      // StateMachine sẽ tự về IDLE sau timeout dài (2s)
      debugDiv.textContent = currentAppState === 'IDLE' ? "Chờ tay xuất hiện..." : "Không detect được tay";

      // Vẫn gọi handle để controller xử lý handLost grace period
      gestureStateController.handle({
        appState: currentAppState,
        currentItemIndex,
        hasHand: false
      });

      gestureDetector.reset();
    }
  });

  if (typeof Camera === 'undefined') {
    console.error('MediaPipe Camera chưa được load!');
    debugDiv.textContent = 'Lỗi: MediaPipe Camera chưa được load';
    return;
  }

  const camera_utils = new Camera(video, {
    onFrame: async () => {
      await hands.send({ image: video });
      await pose.send({ image: video });
    },
    width: 1280,
    height: 720
  });
  camera_utils.start();

  function animate() {
    requestAnimationFrame(animate);

    // Chỉ rotate item chính ở giữa màn hình (không rotate items phụ)
    if (currentAppState === 'BROWSE') {
      const carouselModels = lifecycleManager.getLoadedModels();
      const mainItem = carouselModels[currentItemIndex];
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
