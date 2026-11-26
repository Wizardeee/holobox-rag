import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type AvatarState = 'idle' | 'listening' | 'thinking' | 'processing' | 'speaking' | 'error';

interface MorphBinding {
  mesh: THREE.Mesh;
  index: number;
  weight: number;
}

interface VrmBind {
  mesh: number;
  index: number;
  weight: number;
}

interface VrmGroup {
  presetName?: string;
  name?: string;
  binds?: VrmBind[];
}

const VISEMES = ['a', 'e', 'i', 'o', 'u'] as const;
type Viseme = typeof VISEMES[number];

/**
 * Drives the Business Female 04 VRM using the rig and expressions that model
 * actually ships with: VRM humanBones for the head, VRM blendShape binds and
 * the mesh's own morph-target names for speech, blinking and gaze. The asset
 * has no animation clips, so idle motion is procedural. Speech is amplitude
 * driven (viseme cycling), NOT phoneme-level lip sync.
 */
export class AvatarController {
  private mixer: THREE.AnimationMixer | null = null;
  private readonly model: THREE.Object3D;
  private readonly camera: THREE.PerspectiveCamera;
  private head: THREE.Object3D | null = null;
  private neck: THREE.Object3D | null = null;
  private readonly headBase = new THREE.Euler();
  private readonly neckBase = new THREE.Euler();
  private readonly expressions = new Map<string, MorphBinding[]>();
  private readonly morphMeshes: THREE.Mesh[] = [];
  private analyser: AnalyserNode | null = null;
  private readonly samples = new Uint8Array(1024);
  private state: AvatarState = 'idle';
  private amplitude = 0;
  private visemeLevel = 0;
  private activeViseme: Viseme = 'a';
  private lastVisemeChange = 0;
  private blinkLevel = 0;
  private nextBlink = 2.5;
  private blinkingUntil = 0;
  private expression: 'neutral' | 'happy' | 'confused' = 'neutral';
  private cursor: { x: number; y: number } | null = null;

  constructor(model: THREE.Object3D, clips: THREE.AnimationClip[], camera: THREE.PerspectiveCamera, gltf: GLTF) {
    this.model = model;
    this.camera = camera;
    model.updateMatrixWorld(true);

    const nodeObjects = new Map<number, THREE.Object3D>();
    const meshObjects = new Map<number, THREE.Mesh>();
    for (const [object, refs] of gltf.parser.associations) {
      if (refs.nodes !== undefined) nodeObjects.set(refs.nodes, object as THREE.Object3D);
      if (refs.meshes !== undefined && (object as THREE.Mesh).isMesh) {
        meshObjects.set(refs.meshes, object as THREE.Mesh);
      }
    }

    const vrm = (gltf.parser.json.extensions as Record<string, any> | undefined)?.VRM as
      | { humanoid?: { humanBones?: Array<{ bone: string; node: number }> }; blendShapeMaster?: { blendShapeGroups?: VrmGroup[] } }
      | undefined;

    // Head/neck come from the model's own humanoid map, never from hardcoded names.
    for (const bone of vrm?.humanoid?.humanBones ?? []) {
      if (bone.bone === 'head') this.head = nodeObjects.get(bone.node) ?? null;
      if (bone.bone === 'neck') this.neck = nodeObjects.get(bone.node) ?? null;
    }
    // Older exports map the neck as 'upperChest' parent; fall back to walking up.
    if (!this.neck && this.head?.parent) this.neck = this.head.parent;
    if (this.head) this.headBase.copy(this.head.rotation);
    if (this.neck) this.neckBase.copy(this.neck.rotation);
    this.applyRestingPose(vrm?.humanoid?.humanBones ?? [], nodeObjects);

    model.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh && mesh.morphTargetInfluences?.length) this.morphMeshes.push(mesh);
    });

    this.readVrmGroups(vrm?.blendShapeMaster?.blendShapeGroups ?? [], meshObjects);
    if (clips.length) {
      this.mixer = new THREE.AnimationMixer(model);
      this.mixer.clipAction(clips[0]).play();
    }
  }

  /**
   * Correct the bind-pose arms, which are a straight horizontal T-pose.
   * Targets are WORLD directions after the model is turned to face the student:
   * +X is the viewer's right, +Z is toward the camera. The arms are angled
   * outward, forward at the elbow, and the hands are pitched forward so they
   * hang beside the hips instead of intersecting the thighs.
   */
  private applyRestingPose(
    humanBones: Array<{ bone: string; node: number }>,
    nodeObjects: Map<number, THREE.Object3D>,
  ): void {
    const bones = new Map<string, THREE.Object3D>();
    for (const entry of humanBones) {
      const object = nodeObjects.get(entry.node);
      if (object) bones.set(entry.bone, object);
    }
    const rotateToward = (bone: THREE.Object3D, child: THREE.Object3D, target: THREE.Vector3) => {
      this.model.updateMatrixWorld(true);
      const from = child.getWorldPosition(new THREE.Vector3()).sub(bone.getWorldPosition(new THREE.Vector3())).normalize();
      const parentWorld = new THREE.Quaternion();
      bone.parent?.getWorldQuaternion(parentWorld);
      const delta = new THREE.Quaternion().setFromUnitVectors(from, target.clone().normalize());
      bone.quaternion.copy(parentWorld.clone().invert().multiply(delta).multiply(parentWorld).multiply(bone.quaternion));
      this.model.updateMatrixWorld(true);
    };
    for (const side of ['left', 'right'] as const) {
      const upper = bones.get(`${side}UpperArm`);
      const lower = bones.get(`${side}LowerArm`);
      const hand = bones.get(`${side}Hand`);
      const finger = bones.get(`${side}MiddleProximal`);
      if (!upper || !lower || !hand) continue;
      // In world space the left arm is on +X after the 180° model turn.
      const sign = side === 'left' ? 1 : -1;
      rotateToward(upper, lower, new THREE.Vector3(sign * 0.24, -0.95, 0.2));
      rotateToward(lower, hand, new THREE.Vector3(sign * 0.12, -0.86, 0.5));
      if (finger) rotateToward(hand, finger, new THREE.Vector3(sign * 0.02, -0.72, 0.69));
    }
  }

  /** VRM 0.x preset groups. Bind weights are 0..100 per the spec. */
  private readVrmGroups(groups: VrmGroup[], meshObjects: Map<number, THREE.Mesh>): void {
    for (const group of groups) {
      const preset = (group.presetName || group.name || '').toLowerCase();
      if (!preset || !group.binds?.length) continue;
      const bindings: MorphBinding[] = [];
      for (const bind of group.binds) {
        const mesh = meshObjects.get(bind.mesh);
        if (!mesh?.morphTargetInfluences || bind.index >= mesh.morphTargetInfluences.length) continue;
        bindings.push({ mesh, index: bind.index, weight: (bind.weight ?? 100) / 100 });
      }
      if (bindings.length) {
        const key = preset.replace(/^preset_/, '');
        this.expressions.set(key, [...(this.expressions.get(key) ?? []), ...bindings]);
      }
    }
  }

  /**
   * Selects morphs by the target names this asset actually exposes. Some VRM
   * 0.x preset binds point at empty placeholder morphs (e.g. blink), so real
   * named ARKit-style targets take precedence where they exist.
   */
  private byName(pattern: RegExp): MorphBinding[] {
    const found: MorphBinding[] = [];
    for (const mesh of this.morphMeshes) {
      const influences = mesh.morphTargetInfluences;
      if (!influences) continue;
      const dictionary = mesh.morphTargetDictionary ?? {};
      for (const [name, index] of Object.entries(dictionary)) {
        if (!pattern.test(name)) continue;
        if (index < influences.length) found.push({ mesh, index, weight: 1 });
      }
    }
    return found;
  }

  private readonly bindingCache = new Map<string, MorphBinding[]>();

  private bindings(key: string, namePattern?: RegExp): MorphBinding[] {
    const cacheKey = namePattern ? `${key}:${namePattern.source}` : key;
    const cached = this.bindingCache.get(cacheKey);
    if (cached) return cached;
    const named = namePattern ? this.byName(namePattern) : [];
    const result = named.length ? named : this.expressions.get(key) ?? [];
    this.bindingCache.set(cacheKey, result);
    return result;
  }

  private setMorph(bindings: MorphBinding[], value: number): void {
    const level = THREE.MathUtils.clamp(value, 0, 1);
    for (const binding of bindings) {
      const influences = binding.mesh.morphTargetInfluences;
      if (!influences) continue;
      influences[binding.index] = THREE.MathUtils.clamp(level * binding.weight, 0, 1);
    }
  }

  /** Normalized device coordinates (-1..1) from the kiosk viewport. */
  setCursor(x: number | null, y: number | null): void {
    this.cursor = x === null || y === null ? null : { x, y };
  }

  setState(state: AvatarState, analyser: AnalyserNode | null = null): void {
    this.state = state;
    this.analyser = state === 'speaking' ? analyser : null;
    if (state !== 'speaking') {
      this.amplitude = 0;
      this.visemeLevel = 0;
      this.setMouth('a', 0);
    }
  }

  setExpression(expression: 'neutral' | 'happy' | 'confused'): void {
    this.expression = expression;
  }

  private setViseme(viseme: Viseme, level: number): void {
    for (const value of VISEMES) {
      const bindings = this.bindings(value, new RegExp(`AA_VI_\\d+_${value === 'a' ? 'aa' : value}`, 'i'));
      this.setMorph(bindings, value === viseme ? level : 0);
    }
    this.activeViseme = viseme;
  }

  /** Subtle vowel shape plus a small jaw drop — speech should not look like a yawn. */
  private setMouth(viseme: Viseme, level: number): void {
    this.setViseme(viseme, level * 0.4);
    const jaw = this.bindings('jaw', /JawDrop|JawOpen|LipsPart/i);
    this.setMorph(jaw, level * 0.22);
  }

  private measureAmplitude(): number {
    if (!this.analyser) return 0;
    this.analyser.getByteTimeDomainData(this.samples);
    let sum = 0;
    for (let i = 0; i < this.samples.length; i += 1) {
      const value = (this.samples[i] - 128) / 128;
      sum += value * value;
    }
    return Math.min(1, Math.sqrt(sum / this.samples.length) * 4);
  }

  private updateBlink(elapsed: number): void {
    if (elapsed >= this.nextBlink) {
      this.blinkingUntil = elapsed + 0.14;
      this.nextBlink = elapsed + 2.6 + Math.random() * 2.4;
    }
    const target = elapsed < this.blinkingUntil ? 1 : 0;
    this.blinkLevel += (target - this.blinkLevel) * 0.35;
    const bindings = this.bindings('blink', /45_Blink|EyeBlink|EyeClosed/i);
    this.setMorph(bindings, this.blinkLevel);
  }

  private updateGaze(delta: number): void {
    const lookup = this.bindings('lookup', /EyesTurnUp|EyeLookUp/i);
    const lookdown = this.bindings('lookdown', /EyesTurnDown|EyeLookDown/i);
    const lookleft = this.bindings('lookleft', /EyesTurnLeft|EyeLookLeft|EyeLookOutLeft/i);
    const lookright = this.bindings('lookright', /EyesTurnRight|EyeLookRight|EyeLookOutRight/i);
    const x = this.cursor?.x ?? 0;
    const y = this.cursor?.y ?? 0;
    const smooth = Math.min(1, delta * 6);
    const blend = (current: number, target: number) => current + (target - current) * smooth;
    this.gaze.left = blend(this.gaze.left, Math.max(0, -x) * 0.8);
    this.gaze.right = blend(this.gaze.right, Math.max(0, x) * 0.8);
    this.gaze.up = blend(this.gaze.up, Math.max(0, y) * 0.7);
    this.gaze.down = blend(this.gaze.down, Math.max(0, -y) * 0.7);
    // The model is turned 180° to face the student, so its local left/right
    // gaze targets are swapped relative to the cursor.
    this.setMorph(lookleft, this.gaze.right);
    this.setMorph(lookright, this.gaze.left);
    this.setMorph(lookup, this.gaze.up);
    this.setMorph(lookdown, this.gaze.down);
  }

  private readonly gaze = { left: 0, right: 0, up: 0, down: 0 };

  update(delta: number, elapsed: number): void {
    this.mixer?.update(delta);
    const target = this.measureAmplitude();
    this.amplitude += (target - this.amplitude) * Math.min(1, delta * 12);

    // Amplitude-driven visemes: the mouth shape follows the audio envelope and
    // cycles between the model's own vowel morphs. No phoneme recognition.
    if (this.state === 'speaking' && this.amplitude > 0.015) {
      if (elapsed - this.lastVisemeChange > 0.24) {
        const next = VISEMES[(VISEMES.indexOf(this.activeViseme) + 1) % VISEMES.length];
        this.setViseme(this.activeViseme, 0);
        this.activeViseme = next;
        this.lastVisemeChange = elapsed;
      }
      this.visemeLevel += (Math.min(1, this.amplitude * 3) - this.visemeLevel) * Math.min(1, delta * 18);
      this.setMouth(this.activeViseme, this.visemeLevel);
    } else if (this.visemeLevel > 0) {
      this.visemeLevel += (0 - this.visemeLevel) * Math.min(1, delta * 24);
      this.setMouth(this.activeViseme, this.visemeLevel);
      if (this.visemeLevel < 0.01) this.visemeLevel = 0;
    }

    this.updateBlink(elapsed);
    this.updateGaze(delta);

    const happy = this.bindings('joy', /LipCornerPuller|MouthSmile/i);
    this.setMorph(happy, this.expression === 'happy' ? 0.7 : 0);

    if (this.head) {
      const idleX = Math.sin(elapsed * 0.47) * 0.012 + Math.sin(elapsed * 0.19) * 0.008;
      const idleY = Math.sin(elapsed * 0.31) * 0.018;
      const listening = this.state === 'listening' ? -0.035 : 0;
      const thinking = this.state === 'thinking' || this.state === 'processing' ? 0.045 : 0;
      const speaking = this.state === 'speaking' ? this.amplitude * 0.07 : 0;
      const expressionX = this.expression === 'happy' ? -0.02 : this.expression === 'confused' ? 0.025 : 0;
      this.head.rotation.set(
        this.headBase.x + idleX + listening + speaking + expressionX,
        this.headBase.y + idleY + (this.expression === 'confused' ? 0.06 : 0),
        this.headBase.z + thinking + idleY * 0.3,
      );
    }
    if (this.neck) {
      const nod = this.state === 'speaking' ? this.amplitude * 0.018 : 0;
      this.neck.rotation.set(this.neckBase.x + nod, this.neckBase.y, this.neckBase.z);
    }
  }

  dispose(): void {
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.analyser = null;
    for (const mesh of this.morphMeshes) mesh.morphTargetInfluences?.fill(0);
  }

  /** Read-only snapshot for runtime verification/debugging. */
  debugSnapshot() {
    return {
      state: this.state,
      amplitude: Math.round(this.amplitude * 1000) / 1000,
      viseme: this.activeViseme,
      visemeLevel: Math.round(this.visemeLevel * 1000) / 1000,
      blink: Math.round(this.blinkLevel * 1000) / 1000,
      gaze: this.gaze,
      headBone: this.head?.name ?? null,
      neckBone: this.neck?.name ?? null,
      morphMeshes: this.morphMeshes.map((mesh) => mesh.morphTargetInfluences?.length ?? 0),
      expressionGroups: [...this.expressions.keys()],
      cursor: this.cursor,
    };
  }
}
