import * as THREE from 'three';
import { createMouthMorph, type MouthMorph } from './mouthMorph';

export type AvatarState = 'idle' | 'listening' | 'thinking' | 'processing' | 'speaking' | 'error';

interface EyeRig {
  bone: THREE.Object3D;
  restLocal: THREE.Quaternion;
  forwardAxis: THREE.Vector3;
  // Controller-owned smoothed rotation. The Idle clip also animates eye bones,
  // so we must assign this AFTER the mixer rather than slerp from whatever the
  // mixer wrote — otherwise the gaze never accumulates across frames.
  currentLocal: THREE.Quaternion;
}

/**
 * State/motion controller for the Sabrina GLB.
 *
 * Speech uses a runtime morph on the existing lip geometry, driven by the real
 * Piper audio analyser — amplitude-driven mouth movement, NOT phoneme lip sync.
 * Eye tracking steers the actual eye bones toward the cursor using a damped
 * quaternion, applied after the Idle mixer so the clip cannot overwrite it.
 */
export class AvatarController {
  private mixer: THREE.AnimationMixer | null = null;
  private readonly model: THREE.Object3D;
  private readonly camera: THREE.PerspectiveCamera;
  private head: THREE.Object3D | null = null;
  private neck: THREE.Object3D | null = null;
  private eyes: EyeRig[] = [];
  private readonly headBase = new THREE.Euler();
  private readonly neckBase = new THREE.Euler();
  private mouth: MouthMorph | null = null;
  private analyser: AnalyserNode | null = null;
  private readonly samples = new Uint8Array(1024);
  private state: AvatarState = 'idle';
  private amplitude = 0;
  private mouthOpen = 0;
  private expression: 'neutral' | 'happy' | 'confused' = 'neutral';
  private cursor: { x: number; y: number } | null = null;

  private readonly identity = new THREE.Quaternion();
  private readonly maxEyeAngle = THREE.MathUtils.degToRad(14);

  constructor(model: THREE.Object3D, clips: THREE.AnimationClip[], camera: THREE.PerspectiveCamera) {
    this.model = model;
    this.camera = camera;
    model.updateMatrixWorld(true);

    model.traverse((object) => {
      const name = object.name || '';
      if (/^Head_06$/.test(name)) this.head = object;
      else if (/^Neck_05$/.test(name)) this.neck = object;
      else if (/^LeftEye_08$/.test(name) || /^RightEye_09$/.test(name)) {
        const restLocal = object.quaternion.clone();
        const parentWorld = new THREE.Quaternion();
        object.parent?.getWorldQuaternion(parentWorld);
        const baseWorld = parentWorld.clone().multiply(restLocal);
        const eyePosition = object.getWorldPosition(new THREE.Vector3());
        const toCamera = camera.position.clone().sub(eyePosition).normalize();

        // Discover which LOCAL bone axis points toward the camera: glTF/FBX
        // eye bones are not guaranteed to use +Z as forward.
        const candidates = [
          new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1),
          new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, -1),
        ];
        let forwardAxis = candidates[2];
        let best = -Infinity;
        for (const candidate of candidates) {
          const score = candidate.clone().applyQuaternion(baseWorld).dot(toCamera);
          if (score > best) {
            best = score;
            forwardAxis = candidate;
          }
        }
        this.eyes.push({ bone: object, restLocal, forwardAxis, currentLocal: restLocal.clone() });
      }
    });

    if (this.head) this.headBase.copy(this.head.rotation);
    if (this.neck) this.neckBase.copy(this.neck.rotation);
    this.mouth = createMouthMorph(model);

    if (clips.length) {
      this.mixer = new THREE.AnimationMixer(model);
      const action = this.mixer.clipAction(clips[0]);
      action.timeScale = 0.85;
      action.play();
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
      this.mouthOpen = 0;
      this.mouth?.setOpen(0);
    }
  }

  setExpression(expression: 'neutral' | 'happy' | 'confused'): void {
    this.expression = expression;
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

  private updateEyes(delta: number, elapsed: number): void {
    if (!this.eyes.length) return;
    this.model.updateMatrixWorld(true);

    for (const eye of this.eyes) {
      const parentWorld = new THREE.Quaternion();
      eye.bone.parent?.getWorldQuaternion(parentWorld);
      const baseWorld = parentWorld.clone().multiply(eye.restLocal);
      let desiredLocal: THREE.Quaternion;

      if (this.cursor) {
        const eyePosition = eye.bone.getWorldPosition(new THREE.Vector3());
        const distance = this.camera.position.distanceTo(eyePosition);
        const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
        const ray = new THREE.Vector3(
          this.cursor.x * this.camera.aspect * tanHalfFov,
          this.cursor.y * tanHalfFov,
          -1,
        ).normalize().applyQuaternion(this.camera.quaternion);
        const targetPoint = this.camera.position.clone().addScaledVector(ray, distance);
        const gaze = targetPoint.sub(eyePosition).normalize();
        const forward = eye.forwardAxis.clone().applyQuaternion(baseWorld).normalize();

        const rotation = new THREE.Quaternion().setFromUnitVectors(forward, gaze);
        const angle = 2 * Math.acos(THREE.MathUtils.clamp(rotation.w, -1, 1));
        // Use a separate target: slerpQuaternions(identity, rotation, t) with
        // `rotation` as `this` aliases source and destination and collapses to identity.
        const clamped = angle > this.maxEyeAngle
          ? new THREE.Quaternion().slerpQuaternions(this.identity, rotation, this.maxEyeAngle / angle)
          : rotation;
        const desiredWorld = clamped.multiply(baseWorld);
        desiredLocal = parentWorld.clone().invert().multiply(desiredWorld);
      } else {
        // Gentle, irregular idle gaze when the cursor is unavailable.
        const glance = new THREE.Euler(
          Math.sin(elapsed * 0.23) * 0.012,
          Math.sin(elapsed * 0.17) * 0.018,
          0,
        );
        desiredLocal = eye.restLocal.clone().multiply(new THREE.Quaternion().setFromEuler(glance));
      }
      eye.currentLocal.slerp(desiredLocal, Math.min(1, delta * 8));
      eye.bone.quaternion.copy(eye.currentLocal);
    }
  }

  update(delta: number, elapsed: number): void {
    this.mixer?.update(delta);
    const target = this.measureAmplitude();
    this.amplitude += (target - this.amplitude) * Math.min(1, delta * 12);

    // Mouth: intensity from the analyser, with a small natural variation so it
    // does not behave like a binary on/off switch. Closes fast on silence/stop.
    const speechLevel = this.state === 'speaking' ? Math.min(1, this.amplitude * 2.4) : 0;
    const variation = 0.84 + 0.16 * Math.sin(elapsed * 11.7) * Math.sin(elapsed * 4.3);
    const mouthTarget = speechLevel * variation;
    const mouthRate = mouthTarget > this.mouthOpen ? 18 : 28;
    this.mouthOpen += (mouthTarget - this.mouthOpen) * Math.min(1, delta * mouthRate);
    this.mouth?.setOpen(this.mouthOpen);

    if (this.head) {
      const idleX = Math.sin(elapsed * 0.47) * 0.012 + Math.sin(elapsed * 0.19) * 0.008;
      const idleY = Math.sin(elapsed * 0.31) * 0.018;
      const listening = this.state === 'listening' ? -0.035 : 0;
      const thinking = this.state === 'thinking' || this.state === 'processing' ? 0.045 : 0;
      const speaking = this.state === 'speaking' ? this.amplitude * 0.075 : 0;
      const expressionX = this.expression === 'happy' ? -0.02 : this.expression === 'confused' ? 0.025 : 0;
      this.head.rotation.set(
        this.headBase.x + idleX + listening + speaking + expressionX,
        this.headBase.y + idleY + (this.expression === 'confused' ? 0.06 : 0),
        this.headBase.z + thinking + idleY * 0.3,
      );
    }
    if (this.neck) {
      const nod = this.state === 'speaking' ? this.amplitude * 0.02 : 0;
      this.neck.rotation.set(this.neckBase.x + nod, this.neckBase.y, this.neckBase.z);
    }

    // Applied after the Idle mixer and head offsets: never overwritten by the clip.
    this.updateEyes(delta, elapsed);
  }

  dispose(): void {
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.analyser = null;
    this.mouth?.setOpen(0);
  }

  /** Read-only snapshot for runtime verification/debugging. */
  debugSnapshot() {
    return {
      state: this.state,
      mouthOpen: Math.round(this.mouthOpen * 1000) / 1000,
      amplitude: Math.round(this.amplitude * 1000) / 1000,
      cursor: this.cursor,
      eyes: this.eyes.map((eye) => ({
        name: eye.bone.name,
        axis: eye.forwardAxis.toArray(),
        rotation: eye.bone.quaternion.toArray().map((value) => Math.round(value * 1000) / 1000),
      })),
      morphTarget: this.mouth?.index ?? null,
    };
  }
}
