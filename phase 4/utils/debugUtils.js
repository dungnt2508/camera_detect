import { getIndexFingerDirection } from './positionUtils.js';

export function updateDebug(
  debugDiv,
  stateDiv,
  wrist,
  result,
  landmarks,
  handedness,
  appState,
  gestureDetector,
  moveDebug,
  pinchDebug,
  fistHoldDebug,
  currentItem,
  currentItemIndex,
  items,
  itemScale,
  autoZoomState
) {
  const staticDetector = gestureDetector.staticDetector;
  const thumbExtended = staticDetector.isThumbExtended(landmarks, gestureDetector.handScale);
  const indexExtended = staticDetector.isFingerExtended(landmarks, [5, 6, 7, 8]);
  const middleExtended = staticDetector.isFingerExtended(landmarks, [9, 10, 11, 12]);
  const ringExtended = staticDetector.isFingerExtended(landmarks, [13, 14, 15, 16]);
  const pinkyExtended = staticDetector.isFingerExtended(landmarks, [17, 18, 19, 20]);
  
  let info = `<strong>APP STATE: ${appState}</strong><br>`;
  info += `<br><strong>Hand Detected</strong><br>`;
  info += `Hand: ${handedness}<br>`;
  info += `Scale: ${gestureDetector.handScale.toFixed(3)}<br>`;
  info += `Wrist: x=${wrist.x.toFixed(3)}, y=${wrist.y.toFixed(3)}<br>`;
  
  if (appState === 'BROWSE' || appState === 'TRY_ON') {
    info += `Item: ${currentItem.name} (${currentItemIndex + 1}/${items.length})<br>`;
    if (appState === 'TRY_ON') {
      info += `Zoom: ${(itemScale * 100).toFixed(0)}%<br>`;
      info += `Auto Zoom: ${autoZoomState}<br>`;
      const indexDir = getIndexFingerDirection(landmarks);
      if (indexDir) {
        info += `Index Direction: ${indexDir}<br>`;
      }
    }
  }
  
  info += `<br><strong>Gesture: ${result.gesture}</strong><br>`;
  info += `Confidence: ${(result.confidence * 100).toFixed(0)}%<br>`;
  
  if (fistHoldDebug) {
    info += `<br><strong>FIST HOLD State: ${fistHoldDebug.state}</strong><br>`;
    info += `Fist Frames: ${fistHoldDebug.fistFrames}<br>`;
    info += `Hold Time: ${Math.round(fistHoldDebug.holdTime)}ms<br>`;
  }
  
  if (pinchDebug) {
    info += `<br><strong>PINCH State: ${pinchDebug.state}</strong><br>`;
    info += `Candidate Frames: ${pinchDebug.candidateFrames}<br>`;
    info += `Time Since Candidate: ${Math.round(pinchDebug.timeSinceCandidate)}ms<br>`;
    info += `Release Gating: ${Math.round(pinchDebug.releaseGating)}ms<br>`;
  }
  
  if (moveDebug) {
    info += `<br><strong>MOVE State: ${moveDebug.state}</strong><br>`;
    info += `dxNorm: ${moveDebug.dxNorm.toFixed(3)}<br>`;
    info += `elapsedTime: ${Math.round(moveDebug.elapsedTime)}ms<br>`;
    info += `direction: ${moveDebug.direction || 'N/A'}<br>`;
    info += `cooldownRemaining: ${Math.round(moveDebug.cooldownRemaining)}ms<br>`;
  }
  
  info += `<br>Ngón tay:<br>`;
  info += `Cái: ${thumbExtended ? '✓' : '✗'}<br>`;
  info += `Trỏ: ${indexExtended ? '✓' : '✗'}<br>`;
  info += `Giữa: ${middleExtended ? '✓' : '✗'}<br>`;
  info += `Áp út: ${ringExtended ? '✓' : '✗'}<br>`;
  info += `Út: ${pinkyExtended ? '✓' : '✗'}<br>`;
  
  debugDiv.innerHTML = info;
  stateDiv.textContent = `${appState} | ${result.gesture} (${(result.confidence * 100).toFixed(0)}%)`;
}

