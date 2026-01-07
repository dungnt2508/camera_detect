import { loadGLBModel, normalizeModelScale, TARGET_UNIFORM_SIZE } from '../utils/modelUtils.js';
import { updateCarousel } from '../utils/carouselUtils.js';

export class ModelLifecycleManager {
  constructor(scene, loader, items) {
    this.scene = scene;
    this.loader = loader;
    this.items = items;
    this.loadedModels = [];
    this.tryOnInstance = null;
    this.loadedCount = 0;
  }

  loadAll(onAllLoaded) {
    this.items.forEach((item, index) => {
      loadGLBModel(this.loader, item.glbPath, (model) => {
        const normalized = normalizeModelScale(model, TARGET_UNIFORM_SIZE);
        normalized.visible = false;
        normalized.userData.baseScale = normalized.scale.x;
        normalized.userData.type = item.type;
        this.scene.add(normalized);
        this.loadedModels[index] = { model: normalized, item };
        this.loadedCount++;
        if (this.loadedCount === this.items.length && typeof onAllLoaded === 'function') {
          onAllLoaded(this.loadedModels);
        }
      });
    });
  }

  showCarousel(currentIndex) {
    this.clearTryOn();
    updateCarousel(this.loadedModels, currentIndex);
  }

  activateTryOn(index) {
    this.clearTryOn();

    // Ẩn tất cả models trong carousel khi vào TRY_ON
    this.loadedModels.forEach(m => {
      if (m && m.model) m.model.visible = false;
    });

    const base = this.loadedModels[index];
    if (!base || !base.model) return null;

    // Tạo instance mới cho TRY_ON để không làm bẩn carousel model
    const clone = base.model.clone(true);
    clone.visible = true;

    // Copy userData quan trọng
    clone.userData = {
      ...base.model.userData,
      isTryOn: true
    };

    this.scene.add(clone);
    this.tryOnInstance = clone;
    return clone;
  }

  clearTryOn() {
    if (this.tryOnInstance) {
      if (this.tryOnInstance.parent) {
        this.tryOnInstance.parent.remove(this.tryOnInstance);
      }
      this.tryOnInstance = null;
    }
  }

  getTryOnInstance() {
    return this.tryOnInstance;
  }

  getLoadedModels() {
    return this.loadedModels;
  }
}
