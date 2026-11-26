import * as THREE from 'three';

export interface CameraFrame {
  position: THREE.Vector3;
  target: THREE.Vector3;
  distance: number;
}

/**
 * Re-centres a loaded model whose pivot is not at the middle of its feet:
 * origin X/Z at the model centre, Y at the lowest point.
 */
export function centerModelAtFeet(model: THREE.Object3D, bounds: THREE.Box3): THREE.Box3 {
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.y -= bounds.min.y;
  model.position.z -= center.z;
  model.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(model, true);
}

/**
 * Fits the WHOLE measured box (feet included) into the current viewport.
 * Height normally drives the distance; on narrow viewports width does.
 */
export function computeCameraFrame(
  bounds: THREE.Box3,
  fovDegrees: number,
  aspect: number,
  padding = 1.06,
): CameraFrame {
  const size = bounds.getSize(new THREE.Vector3());
  const target = bounds.getCenter(new THREE.Vector3());
  const verticalFov = THREE.MathUtils.degToRad(fovDegrees);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(aspect, 0.2));
  const fitHeight = (size.y / 2) / Math.tan(verticalFov / 2);
  const fitWidth = (size.x / 2) / Math.tan(horizontalFov / 2);
  // Add half the depth so the front of the model is not closer than the fit.
  const distance = Math.max(fitHeight, fitWidth) * padding + size.z / 2;
  return {
    position: new THREE.Vector3(target.x, target.y, target.z + distance),
    target,
    distance,
  };
}
