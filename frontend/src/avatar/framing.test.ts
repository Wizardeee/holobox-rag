import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { centerModelAtFeet, computeCameraFrame } from './framing.ts';

const modelBox = new THREE.Box3(
  new THREE.Vector3(-0.43, 0, -0.16),
  new THREE.Vector3(0.43, 1.73, 0.16),
);

test('whole model including feet fits at common kiosk aspect ratios', () => {
  for (const aspect of [1536 / 960, 1366 / 768, 1024 / 768, 1920 / 1080, 768 / 1024]) {
    const view = computeCameraFrame(modelBox, 32, aspect);
    const camera = new THREE.PerspectiveCamera(32, aspect, 0.01, 100);
    camera.position.copy(view.position);
    camera.lookAt(view.target);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    for (const x of [modelBox.min.x, modelBox.max.x]) {
      for (const y of [modelBox.min.y, modelBox.max.y]) {
        for (const z of [modelBox.min.z, modelBox.max.z]) {
          const ndc = new THREE.Vector3(x, y, z).project(camera);
          assert.ok(Math.abs(ndc.x) <= 1, `x ${ndc.x} outside frame at aspect ${aspect}`);
          assert.ok(Math.abs(ndc.y) <= 1, `y ${ndc.y} outside frame at aspect ${aspect}`);
        }
      }
    }
  }
});

test('feet and head stay inside the frame with a small margin', () => {
  const view = computeCameraFrame(modelBox, 32, 1536 / 960);
  const camera = new THREE.PerspectiveCamera(32, 1536 / 960, 0.01, 100);
  camera.position.copy(view.position);
  camera.lookAt(view.target);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  const feet = new THREE.Vector3(0, modelBox.min.y, 0).project(camera).y;
  const head = new THREE.Vector3(0, modelBox.max.y, 0).project(camera).y;
  assert.ok(feet < -0.7, `feet too high in frame: ${feet}`);
  assert.ok(head > 0.7, `head too low in frame: ${head}`);
  assert.ok(view.position.y > modelBox.max.y - 0.9, 'camera target drifted below the subject');
});

test('pivot correction puts the model centre at X/Z zero and feet at Y zero', () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1));
  mesh.position.set(0.3, 1.2, -0.2);
  const model = new THREE.Group();
  model.add(mesh);
  model.updateMatrixWorld(true);
  const before = new THREE.Box3().setFromObject(model, true);
  const after = centerModelAtFeet(model, before);
  assert.ok(Math.abs(after.min.y) < 1e-6);
  assert.ok(Math.abs(after.getCenter(new THREE.Vector3()).x) < 1e-6);
  assert.ok(Math.abs(after.getCenter(new THREE.Vector3()).z) < 1e-6);
  assert.equal(after.max.y - after.min.y, 2);
});
