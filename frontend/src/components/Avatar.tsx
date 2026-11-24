import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AvatarController, type AvatarState } from '../avatar/AvatarController';

interface Props {
  state: AvatarState;
  analyser: AnalyserNode | null;
}

const CAMERA_FOV = 32;
const FRAME_PADDING = 1.2;
// Kiosk framing: head and upper body are the subject. Keep the full width
// (arms) and the upper ~68% of the model; the model asset itself is untouched.
const UPPER_BODY_START = 0.32;

/** Renderer owns only Three.js; RAG/audio logic lives in the kiosk hooks. */
export function Avatar({ state, analyser }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<AvatarController | null>(null);
  const frameModel = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [detail, setDetail] = useState('');

  useEffect(() => {
    const element = host.current;
    if (!element) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.01, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Textures are authored in sRGB; neutral tone mapping preserves them
    // without the blown-out white look of the previous untonemapped setup.
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    element.appendChild(renderer.domElement);

    // Balanced, low-intensity lights: the GLB's PBR materials carry the look.
    scene.add(new THREE.HemisphereLight(0xc9dcff, 0x202936, 0.55));
    scene.add(new THREE.AmbientLight(0xffffff, 0.25));
    const key = new THREE.DirectionalLight(0xfff5e8, 1.5);
    key.position.set(3, 5, 6);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xbcd4ff, 0.45);
    fill.position.set(-4, 2, 4);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0x9bb8ff, 0.55);
    rim.position.set(-2, 3, -4);
    scene.add(rim);

    const modelUrl = (import.meta.env.VITE_AVATAR_MODEL_URL as string | undefined)
      || new URL('avatar/sabrina_3d_avatar.glb', document.baseURI).href;
    let disposed = false;
    let animationId = 0;
    const clock = new THREE.Clock();
    let bounds: THREE.Box3 | null = null;

    const frame = () => {
      if (!bounds) return;
      // Derive a focus box from the measured bounds instead of hardcoding
      // camera coordinates; robust to a different GLB or pivot.
      const focusMin = bounds.min.clone();
      focusMin.y = bounds.min.y + bounds.getSize(new THREE.Vector3()).y * UPPER_BODY_START;
      const focusMax = bounds.max.clone();
      const size = focusMax.clone().sub(focusMin);
      const center = focusMin.clone().add(focusMax).multiplyScalar(0.5);
      const verticalFov = THREE.MathUtils.degToRad(camera.fov);
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
      const fitHeight = (size.y / 2) / Math.tan(verticalFov / 2);
      const fitWidth = (size.x / 2) / Math.tan(horizontalFov / 2);
      const distance = Math.max(fitHeight, fitWidth) * FRAME_PADDING;
      camera.position.set(center.x, center.y, center.z + distance + size.z / 2);
      camera.lookAt(center.x, center.y, center.z);
      camera.updateProjectionMatrix();
    };
    frameModel.current = frame;

    new GLTFLoader().load(
      modelUrl,
      (gltf) => {
        if (disposed) return;
        const model = gltf.scene;
        scene.add(model);
        // precise=true gives skinned meshes a tighter, accurate box.
        bounds = new THREE.Box3().setFromObject(model, true);
        frame();

        controller.current = new AvatarController(model, gltf.animations);
        setStatus('ready');
      },
      undefined,
      (error) => {
        setStatus('error');
        setDetail(String(error));
      },
    );

    const resize = () => {
      const width = element.clientWidth || 1;
      const height = element.clientHeight || 1;
      // updateStyle=true keeps the CSS size equal to the layout size. The old
      // `false` left a 2x-DPR canvas overflowing and clipping the avatar.
      renderer.setSize(width, height);
      camera.aspect = width / height;
      frame();
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();

    const renderFrame = () => {
      animationId = requestAnimationFrame(renderFrame);
      controller.current?.update(clock.getDelta(), clock.elapsedTime);
      renderer.render(scene, camera);
    };
    renderFrame();

    return () => {
      disposed = true;
      cancelAnimationFrame(animationId);
      observer.disconnect();
      frameModel.current = null;
      controller.current?.dispose();
      controller.current = null;
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => {
    controller.current?.setState(state, analyser);
  }, [state, analyser]);

  return (
    <div className="avatar-host" ref={host} aria-label="Holobox avatar">
      {status === 'loading' && <div className="avatar-status">Loading avatar…</div>}
      {status === 'error' && <div className="avatar-status">Avatar failed to load: {detail}</div>}
    </div>
  );
}
