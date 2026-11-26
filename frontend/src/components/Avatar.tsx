import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AvatarController, type AvatarState } from '../avatar/AvatarController';
import { centerModelAtFeet, computeCameraFrame } from '../avatar/framing';

interface Props {
  state: AvatarState;
  analyser: AnalyserNode | null;
}

const CAMERA_FOV = 32;

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
    // Opaque white matches the kiosk CSS in every state, including loading.
    scene.background = new THREE.Color(0xffffff);
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.01, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Textures are authored in sRGB; neutral tone mapping preserves them
    // without the blown-out white look of the previous untonemapped setup.
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    element.appendChild(renderer.domElement);

    // Neutral studio lighting for the VRM's PBR materials against white.
    scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe6ef, 0.9));
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const key = new THREE.DirectionalLight(0xfff7ef, 1.1);
    key.position.set(3, 5, 6);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xe8f0ff, 0.45);
    fill.position.set(-4, 2, 4);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.3);
    rim.position.set(-2, 3, -4);
    scene.add(rim);

    const modelUrl = (import.meta.env.VITE_AVATAR_MODEL_URL as string | undefined)
      || new URL('avatar/business-female-04.vrm', document.baseURI).href;
    let disposed = false;
    let animationId = 0;
    const clock = new THREE.Clock();
    let bounds: THREE.Box3 | null = null;

    const frame = () => {
      if (!bounds) return;
      const view = computeCameraFrame(bounds, camera.fov, camera.aspect);
      camera.position.copy(view.position);
      camera.lookAt(view.target);
      camera.updateProjectionMatrix();
    };
    frameModel.current = frame;

    new GLTFLoader().load(
      modelUrl,
      (gltf) => {
        if (disposed) return;
        const model = gltf.scene;
        // This VRM's face (eyes/mouth morph vertices) is on its -Z side, while
        // the kiosk camera frames from +Z. Turn the whole model so it faces the student.
        model.rotation.y = Math.PI;
        scene.add(model);
        // Apply the resting pose first, then measure and correct the pivot so
        // the camera frames the final silhouette, not the original T-pose.
        controller.current = new AvatarController(model, gltf.animations, camera, gltf);
        // precise=true gives skinned meshes a tighter, accurate box.
        bounds = centerModelAtFeet(model, new THREE.Box3().setFromObject(model, true));
        frame();
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

    // Eye tracking: normalize cursor to this viewport (NDC) and hand it to the
    // controller. Leaving the window returns the eyes to their rest direction.
    const onPointerMove = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      controller.current?.setCursor(x, y);
    };
    const onPointerLeave = () => controller.current?.setCursor(null, null);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('blur', onPointerLeave);

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
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('blur', onPointerLeave);
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
