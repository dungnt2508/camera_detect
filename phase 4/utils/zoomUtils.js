export const MIN_SCALE = 0.5;
export const MAX_SCALE = 2.0;
export const SCALE_STEP = 0.1;
export const AUTO_ZOOM_SPEED = 0.005; // Tốc độ zoom mỗi frame

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function resetZoom(currentModel) {
  const itemScale = 1.0;
  const autoZoomState = 'STOPPED';
  if (currentModel) {
    // Lưu zoom scale vào userData, không set trực tiếp (để ringAttachment xử lý)
    currentModel.userData.zoomScale = 1.0;
    // Apply scale ngay để không bị delay
    applyCombinedScale(currentModel);
  }
  return { itemScale, autoZoomState };
}

export function zoomIn(itemScale, currentModel) {
  const newScale = Math.min(MAX_SCALE, itemScale + SCALE_STEP);
  if (currentModel) {
    currentModel.userData.zoomScale = newScale;
    applyCombinedScale(currentModel);
  }
  return newScale;
}

export function zoomOut(itemScale, currentModel) {
  const newScale = Math.max(MIN_SCALE, itemScale - SCALE_STEP);
  if (currentModel) {
    currentModel.userData.zoomScale = newScale;
    applyCombinedScale(currentModel);
  }
  return newScale;
}

export function updateAutoZoom(autoZoomState, itemScale, currentModel) {
  let newScale = itemScale;
  
  if (autoZoomState === 'ZOOM_IN') {
    newScale = Math.min(MAX_SCALE, itemScale + AUTO_ZOOM_SPEED);
  } else if (autoZoomState === 'ZOOM_OUT') {
    newScale = Math.max(MIN_SCALE, itemScale - AUTO_ZOOM_SPEED);
  }
  
  if (currentModel) {
    currentModel.userData.zoomScale = newScale;
    applyCombinedScale(currentModel);
  }
  
  return newScale;
}

// Apply combined scale: baseScale * zoomScale * fingerWidthScale
export function applyCombinedScale(model) {
  const baseScale = model.userData.baseScale || 1.0;
  const zoomScale = clamp(model.userData.zoomScale !== undefined ? model.userData.zoomScale : 1.0, MIN_SCALE, MAX_SCALE);
  const fingerWidthScale = model.userData.fingerWidthScale !== undefined ? model.userData.fingerWidthScale : 1.0;
  const total = baseScale * zoomScale * fingerWidthScale;
  model.scale.setScalar(total);
}

