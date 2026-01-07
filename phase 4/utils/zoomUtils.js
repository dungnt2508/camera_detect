export const MIN_SCALE = 0.5;
export const MAX_SCALE = 2.0;
export const SCALE_STEP = 0.1;
export const AUTO_ZOOM_SPEED = 0.005; // Tốc độ zoom mỗi frame

export function resetZoom(currentModel) {
  const itemScale = 1.0;
  const autoZoomState = 'STOPPED';
  if (currentModel) {
    currentModel.scale.setScalar(1.0);
  }
  return { itemScale, autoZoomState };
}

export function zoomIn(itemScale, currentModel) {
  const newScale = Math.min(MAX_SCALE, itemScale + SCALE_STEP);
  if (currentModel) {
    currentModel.scale.setScalar(newScale);
  }
  return newScale;
}

export function zoomOut(itemScale, currentModel) {
  const newScale = Math.max(MIN_SCALE, itemScale - SCALE_STEP);
  if (currentModel) {
    currentModel.scale.setScalar(newScale);
  }
  return newScale;
}

export function updateAutoZoom(autoZoomState, itemScale, currentModel) {
  let newScale = itemScale;
  
  if (autoZoomState === 'ZOOM_IN') {
    newScale = Math.min(MAX_SCALE, itemScale + AUTO_ZOOM_SPEED);
    if (currentModel) {
      currentModel.scale.setScalar(newScale);
    }
  } else if (autoZoomState === 'ZOOM_OUT') {
    newScale = Math.max(MIN_SCALE, itemScale - AUTO_ZOOM_SPEED);
    if (currentModel) {
      currentModel.scale.setScalar(newScale);
    }
  }
  
  return newScale;
}

