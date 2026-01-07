// Carousel settings
export const CAROUSEL_CENTER_Z = -2; // Vị trí Z của item chính
export const CAROUSEL_BOTTOM_Y = -1.5; // Vị trí Y của items phụ (phía dưới)
export const CAROUSEL_BOTTOM_Z = -1.5; // Vị trí Z của items phụ
export const CAROUSEL_ITEM_SPACING = 0.4; // Khoảng cách giữa các items phụ
export const CAROUSEL_CENTER_SCALE = 1.0; // Scale của item chính giữa
export const CAROUSEL_SIDE_SCALE = 0.3; // Scale của items phụ (nhỏ hơn)

export function updateCarousel(loadedModels, currentItemIndex) {
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

