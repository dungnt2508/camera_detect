import * as THREE from 'three';

const SPRING_STRENGTH = 80.0;
const DAMPING_FACTOR = 0.4;
const ROTATION_SPRING = 40.0;
const ROTATION_DAMPING = 0.6;
const MAX_TWIST_VELOCITY = 50.0;

const LOCAL_OFFSET_Y = 0.25;
const LOCAL_OFFSET_Z = 0.05;
const RING_TILT_MAX = 0.35;
const RING_TILT_FACTOR = 0.5;

const EMA_ALPHA_NORMAL = 0.5; // Tăng lên để bám sát hơn, bù lại bằng physics damping
const EMA_ALPHA_SCALE = 0.3;
const EMA_ALPHA_WIDTH = 0.1;
const EMA_ALPHA_DEPTH = 0.1;

function createState() {
  return {
    position: new THREE.Vector3(0, 0, 0),
    velocity: new THREE.Vector3(0, 0, 0),
    forward: new THREE.Vector3(0, 0, 1),
    twist: 0,
    twistVelocity: 0,
    scale: 1.0,
    lastTime: performance.now(),
    emaPalmNormal: new THREE.Vector3(0, 0, 1),
    emaFingerWidth: 0.04,
    emaDepthZ: 0.5
  };
}

export class RingAttachmentController {
  constructor(cameraProjection) {
    this.cameraProjection = cameraProjection || { fov: 45, aspect: 1, near: 0.1, far: 100 };
    this.state = createState();
  }

  setProjection(proj) {
    this.cameraProjection = proj;
  }

  normalizedToWorld(normalized) {
    const fovRad = (this.cameraProjection.fov * Math.PI) / 180;
    const h = 2 * Math.tan(fovRad / 2);
    const w = h * this.cameraProjection.aspect;

    const depthScale = 1.5;
    const zDist = Math.max(0.5, 2.0 + normalized.z * depthScale);

    const worldX = (0.5 - normalized.x) * w * zDist;
    const worldY = (0.5 - normalized.y) * h * zDist;
    const worldZ = 3.0 - zDist;

    return new THREE.Vector3(worldX, worldY, worldZ);
  }

  reset(initialPosition = null) {
    this.state = createState();
    if (initialPosition) {
      this.state.position.copy(initialPosition);
    }
  }

  initialize(landmarks, model) {
    if (!landmarks || landmarks.length < 21 || !model) return;
    const finger = this.getFingerLandmarks(landmarks);
    if (!finger) return;

    const palmNormal = this.calculatePalmNormal(landmarks) || new THREE.Vector3(0, 0, 1);
    const transform = this.calculateFingerTransform(finger, palmNormal);
    if (!transform) return;

    const localPos = this.applyLocalOffset(transform, LOCAL_OFFSET_Y, LOCAL_OFFSET_Z);
    const worldPos = this.normalizedToWorld(localPos);

    this.reset(worldPos);
    this.state.forward.copy(transform.forward);
    this.state.emaPalmNormal.copy(palmNormal);
    this.state.twist = this.calculateTwist(transform.forward, transform.right, palmNormal);

    model.position.copy(worldPos);
    if (!model.userData.baseScale) {
      model.userData.baseScale = model.scale.x;
    }
  }

  update(landmarks, model, fingerType = 'INDEX') {
    if (!landmarks || !model) return;

    const now = performance.now();
    const dt = Math.min((now - this.state.lastTime) / 1000, 0.033);
    this.state.lastTime = now;

    const finger = this.getFingerLandmarks(landmarks, fingerType);
    if (!finger) return;

    const palmNormalRaw = this.calculatePalmNormal(landmarks);
    if (palmNormalRaw) {
      this.state.emaPalmNormal.lerp(palmNormalRaw, EMA_ALPHA_NORMAL).normalize();
    }
    const palmNormal = this.state.emaPalmNormal;

    const transform = this.calculateFingerTransform(finger, palmNormal);
    if (!transform) return;

    this.state.forward = this.smoothForward(this.state.forward, transform.forward);
    transform.forward.copy(this.state.forward);

    const stableFingerNormal = new THREE.Vector3().crossVectors(palmNormal, this.state.forward).normalize();
    if (stableFingerNormal.lengthSq() < 0.0001) stableFingerNormal.copy(transform.fingerNormal);
    transform.fingerNormal.copy(stableFingerNormal);

    const localPos = this.applyLocalOffset(transform, LOCAL_OFFSET_Y, LOCAL_OFFSET_Z);
    const targetWorld = this.normalizedToWorld(localPos);

    // Physics update
    const posError = targetWorld.clone().sub(this.state.position);
    const posForce = posError.multiplyScalar(SPRING_STRENGTH);
    this.state.velocity.add(posForce.multiplyScalar(dt)).multiplyScalar(DAMPING_FACTOR);
    this.state.position.add(this.state.velocity.clone().multiplyScalar(dt));

    const targetTwist = this.calculateTwist(this.state.forward, transform.right, palmNormal);
    let twistError = targetTwist - this.state.twist;
    while (twistError > Math.PI) twistError -= 2 * Math.PI;
    while (twistError < -Math.PI) twistError += 2 * Math.PI;
    const twistTorque = twistError * ROTATION_SPRING;
    this.state.twistVelocity = (this.state.twistVelocity + twistTorque * dt) * ROTATION_DAMPING;
    if (Math.abs(this.state.twistVelocity) > MAX_TWIST_VELOCITY) {
      this.state.twistVelocity = Math.sign(this.state.twistVelocity) * MAX_TWIST_VELOCITY;
    }
    this.state.twist += this.state.twistVelocity * dt;

    const fingerWidthScale = this.calculateScale(finger, localPos.z);
    const baseScale = model.userData.baseScale || 1.0;
    const zoomScale = model.userData.zoomScale || 1.0;

    model.scale.setScalar(baseScale * fingerWidthScale * zoomScale);
    model.position.copy(this.state.position);
    model.quaternion.copy(this.buildQuaternionFromForwardTwist(this.state.forward, this.state.twist, palmNormal));
  }

  updateBracelet(landmarks, model) {
    if (!landmarks || !model) return;
    const wrist = landmarks[0];
    const middleMCP = landmarks[9];
    const now = performance.now();
    const dt = Math.min((now - this.state.lastTime) / 1000, 0.033);
    this.state.lastTime = now;

    const targetWorld = this.normalizedToWorld(wrist);

    // Position physics (Ultra-Sticky)
    const posError = targetWorld.clone().sub(this.state.position);
    this.state.velocity.add(posError.multiplyScalar(SPRING_STRENGTH * dt)).multiplyScalar(DAMPING_FACTOR);
    this.state.position.add(this.state.velocity.clone().multiplyScalar(dt));
    if (posError.lengthSq() < 0.0001) this.state.position.copy(targetWorld);

    // Orientation physics (Bracelet)
    const armDir = new THREE.Vector3(middleMCP.x - wrist.x, middleMCP.y - wrist.y, middleMCP.z - wrist.z).normalize();
    const palmNormalRaw = this.calculatePalmNormal(landmarks);
    if (palmNormalRaw) {
      this.state.emaPalmNormal.lerp(palmNormalRaw, EMA_ALPHA_NORMAL).normalize();
    }

    // Create orientation matrix: Z = arm direction, Y = palm normal
    const zAxis = armDir.clone();
    const yAxis = this.state.emaPalmNormal.clone();
    const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
    yAxis.crossVectors(zAxis, xAxis).normalize();

    const targetQuat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
    model.quaternion.slerp(targetQuat, 0.2); // Smooth orientation slightly

    const baseScale = model.userData.baseScale || 1.0;
    const zoomScale = model.userData.zoomScale || 1.0;

    model.scale.setScalar(baseScale * zoomScale);
    model.position.copy(this.state.position);
  }

  getFingerLandmarks(landmarks, fingerType = 'INDEX') {
    if (!landmarks || landmarks.length < 21) return null;

    let baseIdx = 5; // Default INDEX
    let refIdx = 9;  // Neighbor for "right" vector

    if (fingerType === 'MIDDLE') {
      baseIdx = 9;
      refIdx = 13;
    } else if (fingerType === 'RING') {
      baseIdx = 13;
      refIdx = 17;
    } else if (fingerType === 'PINKY') {
      baseIdx = 17;
      refIdx = 13;
    } else if (fingerType === 'THUMB') {
      return {
        mcp: landmarks[2],
        pip: landmarks[3],
        dip: landmarks[4],
        tip: landmarks[4],
        refMCP: landmarks[5],
        fingerType
      };
    }

    return {
      mcp: landmarks[baseIdx],
      pip: landmarks[baseIdx + 1],
      dip: landmarks[baseIdx + 2],
      tip: landmarks[baseIdx + 3],
      refMCP: landmarks[refIdx],
      fingerType
    };
  }

  calculatePalmNormal(landmarks) {
    if (!landmarks || landmarks.length < 21) return null;
    const wrist = landmarks[0];
    const indexMCP = landmarks[5];
    const pinkyMCP = landmarks[17];
    const v1 = new THREE.Vector3(indexMCP.x - wrist.x, indexMCP.y - wrist.y, indexMCP.z - wrist.z);
    const v2 = new THREE.Vector3(pinkyMCP.x - wrist.x, pinkyMCP.y - wrist.y, pinkyMCP.z - wrist.z);
    const normal = new THREE.Vector3().crossVectors(v1, v2);
    if (normal.lengthSq() < 0.0001) return null;
    return normal.normalize();
  }

  calculateFingerTransform(finger, palmNormal) {
    const forward = new THREE.Vector3(finger.pip.x - finger.mcp.x, finger.pip.y - finger.mcp.y, finger.pip.z - finger.mcp.z);
    const forwardLength = forward.length();
    if (forwardLength < 0.001) return null;
    forward.normalize();

    // Calculate "right" vector relative to the neighbor finger
    const right = new THREE.Vector3(finger.refMCP.x - finger.mcp.x, finger.refMCP.y - finger.mcp.y, finger.refMCP.z - finger.mcp.z);

    // If it's the pinky, the neighbor (ring) is to the left, so we flip the "right" vector
    if (finger.fingerType === 'PINKY') {
      right.multiplyScalar(-1);
    }

    if (right.lengthSq() < 0.0001) {
      right.copy(new THREE.Vector3().crossVectors(palmNormal, forward)).normalize();
    } else {
      const proj = forward.clone().multiplyScalar(right.dot(forward));
      right.sub(proj).normalize();
    }

    const fingerNormal = new THREE.Vector3().crossVectors(palmNormal, forward).normalize();
    if (fingerNormal.lengthSq() < 0.0001) fingerNormal.crossVectors(right, forward).normalize();

    return { position: finger.mcp, forward, right, fingerNormal, forwardLength };
  }

  applyLocalOffset(transform, localOffsetY, localOffsetZ) {
    const offset = transform.forward.clone().multiplyScalar(localOffsetY * transform.forwardLength)
      .add(transform.fingerNormal.clone().multiplyScalar(localOffsetZ));
    return {
      x: transform.position.x + offset.x,
      y: transform.position.y + offset.y,
      z: transform.position.z + offset.z
    };
  }

  calculateTwist(forward, right, palmNormal) {
    const rightProj = right.clone().sub(forward.clone().multiplyScalar(right.dot(forward))).normalize();
    const refRight = new THREE.Vector3().crossVectors(palmNormal, forward).normalize();
    if (refRight.lengthSq() < 0.0001) refRight.set(1, 0, 0).crossVectors(refRight, forward).normalize();

    const cross = new THREE.Vector3().crossVectors(refRight, rightProj);
    const sin = cross.dot(forward);
    const cos = refRight.dot(rightProj);
    return Math.atan2(sin, cos);
  }

  buildQuaternionFromForwardTwist(forward, twist, palmNormal) {
    // Basis construction for more stable rotation
    const zAxis = forward.clone().normalize();
    const refUp = palmNormal ? palmNormal.clone() : new THREE.Vector3(0, 1, 0);
    const xAxis = new THREE.Vector3().crossVectors(refUp, zAxis).normalize();
    const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();

    const baseQuat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
    const twistQuat = new THREE.Quaternion().setFromAxisAngle(zAxis, twist);

    // Combine and apply a subtle tilt towards the finger normal for "wearing" feel
    let tiltAngle = 0;
    if (palmNormal) {
      const cosAng = Math.max(-1, Math.min(1, palmNormal.dot(forward)));
      tiltAngle = (Math.acos(cosAng) - Math.PI / 2) * RING_TILT_FACTOR;
    }
    const tiltQuat = new THREE.Quaternion().setFromAxisAngle(xAxis, tiltAngle);

    return baseQuat.multiply(twistQuat).multiply(tiltQuat);
  }

  calculateScale(finger, depthZ) {
    const width = Math.hypot(finger.refMCP.x - finger.mcp.x, finger.refMCP.y - finger.mcp.y, finger.refMCP.z - finger.mcp.z);
    this.state.emaFingerWidth = EMA_ALPHA_WIDTH * width + (1 - EMA_ALPHA_WIDTH) * this.state.emaFingerWidth;
    this.state.emaDepthZ = EMA_ALPHA_DEPTH * depthZ + (1 - EMA_ALPHA_DEPTH) * this.state.emaDepthZ;

    const t = Math.max(0, Math.min(1, (this.state.emaFingerWidth - 0.03) / 0.03));
    const widthScale = 0.8 + t * t * (3 - 2 * t) * 0.4;
    const depthT = (Math.max(0.3, Math.min(0.7, this.state.emaDepthZ)) - 0.3) / 0.4;
    const depthScale = 0.9 + Math.log(1 + depthT * 0.2) / Math.log(1.2) * 0.2;

    const target = Math.max(0.7, Math.min(1.3, widthScale * depthScale));
    this.state.scale = EMA_ALPHA_SCALE * target + (1 - EMA_ALPHA_SCALE) * this.state.scale;
    return this.state.scale;
  }

  smoothForward(current, target, maxStepRad = 0.8) {
    const angle = current.angleTo(target);
    if (angle < 0.001) return target.clone();
    const clampedAngle = Math.min(angle, maxStepRad);
    const axis = new THREE.Vector3().crossVectors(current, target).normalize();
    return current.clone().applyQuaternion(new THREE.Quaternion().setFromAxisAngle(axis, clampedAngle));
  }
}
