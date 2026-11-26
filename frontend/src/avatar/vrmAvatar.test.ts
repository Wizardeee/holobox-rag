import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { AvatarController } from './AvatarController.ts';

const assetPath = fileURLToPath(new URL('../../public/avatar/business-female-04.vrm', import.meta.url));
const file = readFileSync(assetPath);
const jsonLength = file.readUInt32LE(12);
const asset = JSON.parse(file.subarray(20, 20 + jsonLength).toString('utf8'));

function makeHarness() {
  const head = new THREE.Object3D();
  head.name = 'VRM head';
  const neck = new THREE.Object3D();
  neck.name = 'VRM neck';
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
  const names: string[] = asset.meshes[0].extras.targetNames;
  geometry.morphAttributes.position = names.map((name) => {
    const attribute = new THREE.Float32BufferAttribute([0, 0, 0], 3);
    attribute.name = name;
    return attribute;
  });
  const mesh = new THREE.Mesh(geometry);
  const model = new THREE.Group();
  model.add(mesh, head, neck);
  const associations = new Map<THREE.Object3D, { nodes?: number; meshes?: number }>([
    [head, { nodes: 28 }],
    [neck, { nodes: 67 }],
    [mesh, { meshes: 0 }],
  ]);
  const gltf = { parser: { json: asset, associations } } as never;
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
  return { controller: new AvatarController(model, [], camera, gltf), mesh, head, neck, names };
}

function loudAnalyser(): AnalyserNode {
  return {
    getByteTimeDomainData(array: Uint8Array) {
      for (let i = 0; i < array.length; i += 1) array[i] = 128 + Math.round(90 * Math.sin(i * 0.3));
    },
  } as AnalyserNode;
}

test('asset is VRM 0.x with a skinned mesh and the expected morph names', () => {
  assert.ok(asset.extensions.VRM);
  assert.equal(asset.extensions.VRM.specVersion, '0.0');
  assert.equal(asset.skins.length, 1);
  assert.ok(asset.meshes[0].primitives.some((p: { targets?: unknown[] }) => (p.targets?.length ?? 0) > 100));
  assert.ok(asset.meshes[0].extras.targetNames.includes('AA_VI_10_aa'));
  assert.ok(asset.meshes[0].extras.targetNames.includes('AU_45_Blink'));
});

test('controller resolves head and neck from the VRM humanoid map', () => {
  const { controller, head, neck } = makeHarness();
  const snapshot = controller.debugSnapshot();
  assert.equal(snapshot.headBone, head.name);
  assert.equal(snapshot.neckBone, neck.name);
  assert.deepEqual(snapshot.morphMeshes, [asset.meshes[0].extras.targetNames.length]);
});

test('speaking drives the model vowel morphs from the audio analyser', () => {
  const { controller, mesh, names } = makeHarness();
  controller.setState('speaking', loudAnalyser());
  let elapsed = 0;
  for (let frame = 0; frame < 20; frame += 1) {
    elapsed += 1 / 60;
    controller.update(1 / 60, elapsed);
  }
  const snapshot = controller.debugSnapshot();
  assert.ok(snapshot.visemeLevel > 0, `viseme level was ${snapshot.visemeLevel}`);
  const visemeIndices = names
    .map((name, index) => (/^AA_VI_1[0-4]_/.test(name) ? index : -1))
    .filter((index) => index >= 0);
  assert.ok(
    visemeIndices.some((index) => mesh.morphTargetInfluences![index] > 0),
    'no vowel morph was moved',
  );
  const jawIndex = names.findIndex((name) => /JawDrop|LipsPart/.test(name));
  assert.ok(mesh.morphTargetInfluences![jawIndex] > 0, 'jaw opening morph did not move');
});

test('blink and cursor-driven gaze use the model expressions', () => {
  const { controller, mesh, names } = makeHarness();
  controller.setState('idle');
  controller.update(1 / 60, 3);
  const blinkIndex = names.indexOf('AU_45_Blink');
  assert.ok(mesh.morphTargetInfluences![blinkIndex] > 0, 'blink morph did not move');

  controller.setCursor(1, 0);
  for (let frame = 0; frame < 30; frame += 1) controller.update(1 / 60, 4 + frame / 60);
  // Cursor on the viewer's right drives the model's local "look left" target
  // because the avatar is turned 180° toward the camera.
  const leftIndex = names.findIndex((name) => /EyesTurnLeft/.test(name));
  assert.ok(mesh.morphTargetInfluences![leftIndex] > 0, 'gaze morph did not move');
});

test('stopping speech closes the mouth morphs', () => {
  const { controller, mesh, names } = makeHarness();
  controller.setState('speaking', loudAnalyser());
  for (let frame = 0; frame < 20; frame += 1) controller.update(1 / 60, 1 + frame / 60);
  controller.setState('idle');
  for (let frame = 0; frame < 60; frame += 1) controller.update(1 / 60, 2 + frame / 60);
  const visemeIndices = names
    .map((name, index) => (/^AA_VI_1[0-4]_/.test(name) ? index : -1))
    .filter((index) => index >= 0);
  assert.ok(visemeIndices.every((index) => mesh.morphTargetInfluences![index] === 0));
  const jawIndex = names.findIndex((name) => /JawDrop|LipsPart/.test(name));
  assert.equal(mesh.morphTargetInfluences![jawIndex], 0);
});
