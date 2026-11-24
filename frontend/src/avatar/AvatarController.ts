import * as THREE from 'three';

export type AvatarState = 'idle' | 'listening' | 'thinking' | 'processing' | 'speaking' | 'error';

/**
 * State/motion controller for the Sabrina GLB.
 *
 * The asset has no morph targets and no jaw/mouth bone, so speaking animation
 * is amplitude-driven head motion from the real Piper audio — NOT phoneme lip
 * sync. No face mesh is displaced.
 */
export class AvatarController {
  private mixer: THREE.AnimationMixer | null = null;
  private head: THREE.Object3D | null = null;
  private neck: THREE.Object3D | null = null;
  private leftEye: THREE.Object3D | null = null;
  private rightEye: THREE.Object3D | null = null;
  private readonly headBase = new THREE.Euler();
  private readonly neckBase = new THREE.Euler();
  private readonly eyeBase = new THREE.Euler();
  private analyser: AnalyserNode | null = null;
  private readonly samples = new Uint8Array(1024);
  private state: AvatarState = 'idle';
  private amplitude = 0;
  private expression: 'neutral' | 'happy' | 'confused' = 'neutral';

  constructor(model: THREE.Group, clips: THREE.AnimationClip[]) {
    model.traverse((object) => {
      const name = object.name || '';
      if (/^Head_06$/.test(name)) this.head = object;
      else if (/^Neck_05$/.test(name)) this.neck = object;
      else if (/^LeftEye_08$/.test(name)) this.leftEye = object;
      else if (/^RightEye_09$/.test(name)) this.rightEye = object;
    });
    if (this.head) this.headBase.copy(this.head.rotation);
    if (this.neck) this.neckBase.copy(this.neck.rotation);
    if (this.leftEye) this.eyeBase.copy(this.leftEye.rotation);

    if (clips.length) {
      this.mixer = new THREE.AnimationMixer(model);
      const action = this.mixer.clipAction(clips[0]);
      action.timeScale = 0.85; // slightly slower than the source Idle clip
      action.play();
    }
  }

  setState(state: AvatarState, analyser: AnalyserNode | null = null): void {
    this.state = state;
    this.analyser = state === 'speaking' ? analyser : null;
    if (!analyser) this.amplitude = 0;
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

  update(delta: number, elapsed: number): void {
    this.mixer?.update(delta);
    const target = this.measureAmplitude();
    this.amplitude += (target - this.amplitude) * Math.min(1, delta * 12);

    if (this.head) {
      // Two detuned low frequencies avoid a metronomic idle loop.
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
    if (this.leftEye && this.rightEye) {
      const glance = Math.sin(elapsed * 0.23) * 0.03 + (this.state === 'thinking' ? 0.05 : 0);
      for (const eye of [this.leftEye, this.rightEye]) {
        eye.rotation.set(this.eyeBase.x, this.eyeBase.y + glance, this.eyeBase.z);
      }
    }
  }

  dispose(): void {
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.analyser = null;
  }
}
