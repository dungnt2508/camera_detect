import * as THREE from 'three';

const SPRING_STRENGTH = 60.0;
const DAMPING_FACTOR = 0.45;
const ROTATION_SPRING = 30.0;
const ROTATION_DAMPING = 0.65;

// Offset for necklace relative to necklace center
const NECKLACE_Y_OFFSET = -0.15; // Phía dưới cổ một chút
const NECKLACE_Z_OFFSET = 0.05;  // Đưa về phía trước ngực

export class NecklaceAttachmentController {
    constructor(cameraProjection) {
        this.cameraProjection = cameraProjection || { fov: 45, aspect: 1, near: 0.1, far: 100 };
        this.state = {
            position: new THREE.Vector3(0, 0, 0),
            velocity: new THREE.Vector3(0, 0, 0),
            forward: new THREE.Vector3(0, 0, 1),
            lastTime: performance.now(),
            emaShoulderWidth: 0.4,
            emaNormal: new THREE.Vector3(0, 0, 1)
        };
    }

    normalizedToWorld(normalized) {
        const fovRad = (this.cameraProjection.fov * Math.PI) / 180;
        const h = 2 * Math.tan(fovRad / 2);
        const w = h * this.cameraProjection.aspect;

        // Depth estimation based on shoulder width or z (approximate)
        const zDist = Math.max(0.5, 2.5 + normalized.z);

        const worldX = (0.5 - normalized.x) * w * zDist;
        const worldY = (0.5 - normalized.y) * h * zDist;
        const worldZ = 3.0 - zDist;

        return new THREE.Vector3(worldX, worldY, worldZ);
    }

    reset() {
        this.state.position.set(0, 0, 0);
        this.state.velocity.set(0, 0, 0);
    }

    update(poseLandmarks, model) {
        if (!poseLandmarks || poseLandmarks.length < 13 || !model) return;

        const now = performance.now();
        const dt = Math.min((now - this.state.lastTime) / 1000, 0.033);
        this.state.lastTime = now;

        const leftShoulder = poseLandmarks[11];
        const rightShoulder = poseLandmarks[12];

        // Neck center
        const neckCenter = {
            x: (leftShoulder.x + rightShoulder.x) / 2,
            y: (leftShoulder.y + rightShoulder.y) / 2,
            z: (leftShoulder.z + rightShoulder.z) / 2
        };

        const targetWorld = this.normalizedToWorld({
            x: neckCenter.x,
            y: neckCenter.y + NECKLACE_Y_OFFSET, // Dịch xuống ngực
            z: neckCenter.z + NECKLACE_Z_OFFSET   // Đưa ra phía trước
        });

        // Physics update for position
        const posError = targetWorld.clone().sub(this.state.position);
        this.state.velocity.add(posError.multiplyScalar(SPRING_STRENGTH * dt)).multiplyScalar(DAMPING_FACTOR);
        this.state.position.add(this.state.velocity.clone().multiplyScalar(dt));

        // Calculate rotation based on shoulders
        const shoulderDir = new THREE.Vector3(
            leftShoulder.x - rightShoulder.x,
            leftShoulder.y - rightShoulder.y,
            leftShoulder.z - rightShoulder.z
        ).normalize();

        // Orientation: Forward is normalized shoulder cross UP
        const up = new THREE.Vector3(0, -1, 0); // MediaPipe Y is down
        const side = shoulderDir.clone();
        const forward = new THREE.Vector3().crossVectors(side, up).normalize();
        const finalUp = new THREE.Vector3().crossVectors(forward, side).normalize();

        const targetQuat = new THREE.Quaternion().setFromRotationMatrix(
            new THREE.Matrix4().makeBasis(side, finalUp, forward)
        );

        model.quaternion.slerp(targetQuat, 0.15);
        model.position.copy(this.state.position);

        // Scaling based on shoulder width
        const currentWidth = Math.hypot(leftShoulder.x - rightShoulder.x, leftShoulder.y - rightShoulder.y);
        this.state.emaShoulderWidth = 0.1 * currentWidth + 0.9 * this.state.emaShoulderWidth;

        const baseScale = model.userData.baseScale || 1.0;
        const zoomScale = model.userData.zoomScale || 1.0;
        const widthFactor = this.state.emaShoulderWidth / 0.35; // Normalized relative to average shoulder width

        model.scale.setScalar(baseScale * zoomScale * widthFactor);
    }
}
