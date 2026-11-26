import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AvatarController } from './AvatarController.ts';

// Minimal browser shims so GLTFLoader can resolve the embedded textures in Node.
const globalAny = globalThis as Record<string, unknown>;
globalAny.self = globalThis;
globalAny.document = {
  createElementNS(_ns: string, tag: string) {
    const element: Record<string, unknown> = {
      tag, width: 16, height: 16, _listeners: {} as Record<string, Array<() => void>>,
      addEventListener(event: string, cb: () => void) {
        ((this._listeners as Record<string, Array<() => void>>)[event] ||= []).push(cb);
      },
      removeEventListener() {},
      set src(_value: string) {
        queueMicrotask(() => {
          for (const cb of ((this._listeners as Record<string, Array<() => void>>).load ?? [])) cb();
        });
      },
    };
    return element;
  },
};

function loadVrm(): Promise<GLTF> {
  const path = fileURLToPath(new URL('../../public/avatar/business-female-04.vrm', import.meta.url));
  const file = readFileSync(path);
  const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  return new Promise((resolve, reject) => new GLTFLoader().parse(bytes, '', resolve, reject));
}

test('the VRM loads in Three.js with its rig, morphs and textures', async () => {
  const gltf = await loadVrm();
  let skinned = 0;
  let morphMeshes = 0;
  const materials = new Set<string>();
  gltf.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) skinned += 1;
    if (mesh.morphTargetInfluences?.length) morphMeshes += 1;
    materials.add(mesh.material instanceof THREE.Material ? mesh.material.name : 'multi');
  });
  assert.equal(skinned, 3);
  assert.equal(morphMeshes, 3);
  assert.equal(gltf.animations.length, 0);
  assert.ok(materials.has('f020_head'));
  assert.ok(gltf.parser.json.extensions?.VRM);
  const bounds = new THREE.Box3().setFromObject(gltf.scene, true);
  const size = bounds.getSize(new THREE.Vector3());
  assert.ok(size.y > 1.4 && size.y < 2, `unexpected model height ${size.y}`);
});

test('the model face is on -Z and the kiosk turns it toward the +Z camera', async () => {
  const gltf = await loadVrm();
  let faceZ = 0;
  let count = 0;
  gltf.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || mesh.geometry.morphAttributes.position?.length !== 175) return;
    const position = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    if (position.count !== 1911) return; // only the primitive with real face morphs
    const morph = mesh.geometry.morphAttributes.position[10] as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i += 1) {
      if (Math.abs(morph.getX(i)) + Math.abs(morph.getY(i)) + Math.abs(morph.getZ(i)) < 1e-4) continue;
      faceZ += position.getZ(i);
      count += 1;
    }
  });
  assert.ok(count > 0, 'no face morph vertices found');
  assert.ok(faceZ / count < 0, `face vertices are at z=${faceZ / count}, expected negative`);
  const component = readFileSync(
    fileURLToPath(new URL('../components/Avatar.tsx', import.meta.url)), 'utf8',
  );
  assert.match(component, /model\.rotation\.y = Math\.PI/);
});

test('the real loaded model responds to the controller', async () => {
  const gltf = await loadVrm();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
  // Match the kiosk: the VRM is turned 180° before posing and framing.
  gltf.scene.rotation.y = Math.PI;
  gltf.scene.updateMatrixWorld(true);
  const controller = new AvatarController(gltf.scene, gltf.animations, camera, gltf);
  const analyser = {
    getByteTimeDomainData(array: Uint8Array) {
      for (let i = 0; i < array.length; i += 1) array[i] = 128 + Math.round(90 * Math.sin(i * 0.3));
    },
  } as AnalyserNode;
  controller.setState('speaking', analyser);
  for (let frame = 0; frame < 20; frame += 1) controller.update(1 / 60, 1 + frame / 60);
  const snapshot = controller.debugSnapshot();
  assert.ok(snapshot.headBone, 'VRM head bone was not resolved');
  assert.ok(snapshot.visemeLevel > 0);
  assert.deepEqual(snapshot.morphMeshes, [175, 175, 175]);

  // Resting pose: arms hang down instead of staying in a T-pose.
  const humanBones = gltf.parser.json.extensions?.VRM?.humanoid?.humanBones as Array<{ bone: string; node: number }>;
  const boneNode = (name: string) => {
    const node = humanBones.find((item) => item.bone === name)?.node;
    let found: THREE.Object3D | undefined;
    for (const [object, refs] of gltf.parser.associations) {
      if (refs.nodes === node) found = object as THREE.Object3D;
    }
    if (!found) throw new Error(`missing bone ${name}`);
    return found;
  };
  gltf.scene.updateMatrixWorld(true);
  const upper = boneNode('rightUpperArm');
  const lower = boneNode('rightLowerArm');
  const upperY = upper.getWorldPosition(new THREE.Vector3()).y;
  const lowerY = lower.getWorldPosition(new THREE.Vector3()).y;
  assert.ok(lowerY < upperY - 0.1, `arm did not relax downward (${upperY} -> ${lowerY})`);

  // Hands sit beside the hips, forward of the thighs, and are mirrored.
  const handPositions = (['left', 'right'] as const).map((side) => {
    const hand = boneNode(`${side}Hand`);
    return hand.getWorldPosition(new THREE.Vector3());
  });
  const elbow = lower.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.abs(elbow.x) > 0.2, `elbow too close to torso: ${elbow.x}`);
  assert.ok(handPositions[0].x > 0.24 && handPositions[1].x < -0.24, 'hands are not separated from the torso');
  assert.ok(handPositions.every((hand) => hand.z > 0.08), 'hands are not forward of the thighs');
  assert.ok(handPositions.every((hand) => hand.y > 0.8 && hand.y < 1.1), 'hands are not beside the hips');
  assert.ok(Math.abs(handPositions[0].x + handPositions[1].x) < 0.01, 'arms are not symmetrical');

  // Speaking stays subtle even with a loud analyser.
  let maxJaw = 0;
  gltf.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && mesh.morphTargetInfluences?.length === 175) {
      maxJaw = Math.max(maxJaw, mesh.morphTargetInfluences[98], mesh.morphTargetInfluences[97]);
    }
  });
  assert.ok(maxJaw > 0 && maxJaw < 0.35, `jaw opening out of range: ${maxJaw}`);
});
