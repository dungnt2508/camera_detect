export function normalizedToWorld(normalized) {
  const worldX = ((1 - normalized.x) - 0.5) * 4;
  const worldY = (0.5 - normalized.y) * 4;
  const worldZ = normalized.z * 2;
  return { x: worldX, y: worldY, z: worldZ };
}

export function updateBraceletPosition(wrist, bracelet) {
  const world = normalizedToWorld(wrist);
  bracelet.position.set(world.x, world.y, world.z);
}

export function updateRingPosition(landmarks, ring) {
  if (!landmarks || landmarks.length < 21) {
    return;
  }

  // Lấy các điểm trên ngón trỏ để tính hướng
  const indexMCP = landmarks[5];   // MCP (Metacarpophalangeal joint)
  const indexPIP = landmarks[6];    // PIP (Proximal Interphalangeal joint)
  
  // Tính vector hướng của ngón trỏ (từ MCP đến PIP)
  const fingerDir = {
    x: indexPIP.x - indexMCP.x,
    y: indexPIP.y - indexMCP.y,
    z: indexPIP.z - indexMCP.z
  };

  // Tính độ dài vector để normalize
  const length = Math.hypot(fingerDir.x, fingerDir.y, fingerDir.z);
  if (length < 0.001) {
    // Fallback: chỉ đặt vị trí nếu không tính được hướng
    const world = normalizedToWorld(indexMCP);
    ring.position.set(world.x, world.y, world.z);
    return;
  }

  // Normalize vector
  fingerDir.x /= length;
  fingerDir.y /= length;
  fingerDir.z /= length;

  // Vị trí nhẫn: đặt ở giữa đốt ngón tay (giữa MCP và PIP)
  const offsetFactor = 0.3; // Điều chỉnh vị trí dọc theo ngón tay
  const ringPos = {
    x: indexMCP.x + fingerDir.x * offsetFactor * length,
    y: indexMCP.y + fingerDir.y * offsetFactor * length,
    z: indexMCP.z + fingerDir.z * offsetFactor * length
  };

  const world = normalizedToWorld(ringPos);
  ring.position.set(world.x, world.y, world.z);

  // Tính rotation để nhẫn fit với ngón tay
  // Vector hướng ngón tay trong world space
  const worldDir = {
    x: fingerDir.x * 4, // Scale tương tự normalizedToWorld
    y: -fingerDir.y * 4, // Đảo ngược Y
    z: fingerDir.z * 2
  };

  // Tính góc rotation để nhẫn vuông góc với ngón tay
  // Nhẫn cần xoay quanh trục Z để align với hướng ngón tay
  const angleZ = Math.atan2(worldDir.y, worldDir.x);
  
  // Tính góc nghiêng của ngón tay (tilt)
  const horizontalLength = Math.hypot(worldDir.x, worldDir.y);
  const angleX = Math.atan2(-worldDir.z, horizontalLength) + Math.PI / 2;

  // Áp dụng rotation để nhẫn fit với ngón tay
  ring.rotation.z = angleZ;
  ring.rotation.x = angleX;
  ring.rotation.y = 0; // Giữ Y rotation = 0
}

export function getIndexFingerDirection(landmarks) {
  if (!landmarks || landmarks.length < 21) {
    return null;
  }
  
  const indexTip = landmarks[8]; // Index finger tip
  const indexMCP = landmarks[5]; // Index finger MCP
  
  // Trong camera space, y tăng từ trên xuống
  // Nếu index tip y < index MCP y → ngón trỏ hướng lên
  // Nếu index tip y > index MCP y → ngón trỏ hướng xuống
  const dy = indexTip.y - indexMCP.y;
  
  if (dy < -0.05) {
    return 'UP'; // Ngón trỏ hướng lên
  } else if (dy > 0.05) {
    return 'DOWN'; // Ngón trỏ hướng xuống
  }
  
  return null; // Không xác định được
}

export function smoothLandmarks(currentLandmarks, previousSmoothed, alpha) {
  if (!previousSmoothed || previousSmoothed.length !== 21) {
    return currentLandmarks.map(lm => ({ x: lm.x, y: lm.y, z: lm.z }));
  }
  return currentLandmarks.map((lm, idx) => {
    const prev = previousSmoothed[idx];
    return {
      x: prev.x * (1 - alpha) + lm.x * alpha,
      y: prev.y * (1 - alpha) + lm.y * alpha,
      z: prev.z * (1 - alpha) + lm.z * alpha
    };
  });
}

