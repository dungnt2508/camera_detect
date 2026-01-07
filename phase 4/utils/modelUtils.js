import * as THREE from 'three';

export const TARGET_UNIFORM_SIZE = 0.3; // Kích thước mục tiêu chung cho tất cả items

export function calculateBoundingBox(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  return { size, center };
}

export function normalizeModelScale(model, targetSize) {
  const { size, center } = calculateBoundingBox(model);
  const maxDimension = Math.max(size.x, size.y, size.z);
  const scale = targetSize / maxDimension;
  
  // Áp dụng scale
  model.scale.set(scale, scale, scale);
  
  // Điều chỉnh pivot về gốc (0,0,0)
  model.position.sub(center.multiplyScalar(scale));
  
  return model;
}

export function loadGLBModel(loader, path, onLoad) {
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

