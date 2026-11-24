import * as THREE from 'three';

/**
 * Builds a non-destructive runtime morph target on the avatar's existing head
 * mesh. The GLB has no mouth morphs and no jaw bone, but its lip vertices and
 * teeth mesh are present. This morph parts the existing lip geometry so the
 * original teeth become visible when the mouth opens.
 *
 * The source GLB and its geometry are never written back to disk; we only add
 * an additional morph attribute to the in-memory BufferGeometry.
 */
export interface MouthMorph {
  mesh: THREE.Mesh;
  index: number;
  setOpen(value: number): void;
}

const MOUTH_CENTER_Y = 1.561;
const LOWER_LIP_Y = 1.553;
const UPPER_LIP_Y = 1.568;
const FRONT_Z_MIN = 0.108;
const FRONT_Z_FULL = 0.128;

export function createMouthMorph(model: THREE.Object3D): MouthMorph | null {
  let head: THREE.Mesh | null = null;
  model.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && (mesh.material as THREE.Material)?.name === 'Wolf3D_Skin') head = mesh;
  });
  if (!head) return null;

  const mesh = head as THREE.Mesh;
  const geometry = mesh.geometry as THREE.BufferGeometry;
  const position = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!position) return null;

  const index = geometry.morphAttributes.position?.length ?? 0;
  const morph = new Float32Array(position.count * 3);

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const horizontal = Math.exp(-((x / 0.026) ** 2));
    if (horizontal < 0.02) continue;
    const vertical = y < MOUTH_CENTER_Y
      ? Math.exp(-(((y - LOWER_LIP_Y) / 0.009) ** 2))
      : Math.exp(-(((y - UPPER_LIP_Y) / 0.008) ** 2));
    if (vertical < 0.02) continue;
    const front = THREE.MathUtils.smoothstep(z, FRONT_Z_MIN, FRONT_Z_FULL);
    if (front <= 0) continue;

    const weight = horizontal * vertical * front;
    morph[i * 3] = 0;
    // Lower lip drops more than the upper lip rises: a natural speech opening.
    morph[i * 3 + 1] = weight * (y < MOUTH_CENTER_Y ? -0.019 : 0.006);
    // Slight inward movement keeps the parted lips from clipping the teeth.
    morph[i * 3 + 2] = -weight * 0.004;
  }

  const attribute = new THREE.Float32BufferAttribute(morph, 3);
  attribute.name = 'speech_open';
  geometry.morphAttributes.position = [...(geometry.morphAttributes.position ?? []), attribute];
  // These values are displacements from the base pose, not absolute positions.
  geometry.morphTargetsRelative = true;
  mesh.updateMorphTargets();
  // The material was compiled before this morph attribute existed; force a
  // shader rebuild or the GPU misreads the morph buffer and corrupts the face.
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of materials) material.needsUpdate = true;

  return {
    mesh,
    index,
    setOpen(value: number) {
      if (!mesh.morphTargetInfluences) return;
      mesh.morphTargetInfluences[index] = THREE.MathUtils.clamp(value, 0, 1);
    },
  };
}
