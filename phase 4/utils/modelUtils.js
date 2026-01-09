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

export function preprocessNecklaceModel(model) {
  // 1. Detect Flat Geometry
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());

  const dims = [
    { axis: 'x', val: size.x },
    { axis: 'y', val: size.y },
    { axis: 'z', val: size.z }
  ].sort((a, b) => a.val - b.val);

  const thickness = dims[0].val;
  const maxWidthHeight = Math.max(dims[1].val, dims[2].val);
  const isPlanar = thickness < maxWidthHeight * 0.15; // 15% threshold

  if (!isPlanar) return;

  console.log(`[AssetEngine] Planar necklace detected (thickness: ${thickness.toFixed(4)}). Applying corrections.`);

  // 2. Correct Local Orientation (Rotate mesh so Front is -Z, Up is Y, Width is X)
  const thinAxis = dims[0].axis;
  if (thinAxis === 'y') {
    model.rotateX(Math.PI / 2);
  } else if (thinAxis === 'x') {
    model.rotateY(Math.PI / 2);
  }
  model.updateMatrixWorld(true);

  // 3. Add Artificial Curvature (Geometry Bend)
  // Approximate neck radius for a normalized model (targetSize=0.3)
  // Standard neck circumference ~40cm, radius ~6.3cm. 
  // If model is 30cm wide (targetSize=0.3), R should be proportional.
  const R = 0.18;

  model.traverse((child) => {
    if (child.isMesh) {
      const geometry = child.geometry;
      // Tránh việc curve lại nhiều lần nếu dùng clone từ cache (dù LifecycleManager dùng clone(true))
      if (geometry.userData.isCurved) return;

      const position = geometry.attributes.position;
      const v = new THREE.Vector3();

      for (let i = 0; i < position.count; i++) {
        v.fromBufferAttribute(position, i);

        // Bend along X axis (cylindrical projection)
        const x = v.x;
        const z = v.z;

        // theta = x / R
        const theta = x / R;
        v.x = R * Math.sin(theta);
        // depth displacement + original Z richness
        v.z = (R * Math.cos(theta) - R) + z;

        position.setXYZ(i, v.x, v.y, v.z);
      }

      position.needsUpdate = true;
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
      geometry.userData.isCurved = true;
    }
  });

  // 4. Depth Offset Enforcement
  // Pushing geometry slightly back to prevent "floating flat" look
  model.position.z -= 0.02;
}
