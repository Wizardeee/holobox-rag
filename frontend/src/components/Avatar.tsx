import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AvatarController, type AvatarState } from '../avatar/AvatarController';

interface Props {
  state: AvatarState;
  analyser: AnalyserNode | null;
}

/** Renderer owns only Three.js; RAG/audio logic lives in the kiosk hooks. */
export function Avatar({ state, analyser }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<AvatarController | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [detail, setDetail] = useState('');

  useEffect(() => {
    const element = host.current;
    if (!element) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    element.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(2, 4, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x9bb8ff, 1.1);
    rim.position.set(-3, 2, -3);
    scene.add(rim);

    const modelUrl = (import.meta.env.VITE_AVATAR_MODEL_URL as string | undefined)
      || new URL('avatar/sabrina_3d_avatar.glb', document.baseURI).href;
    let disposed = false;
    let animationId = 0;
    const clock = new THREE.Clock();

    new GLTFLoader().load(
      modelUrl,
      (gltf) => {
        if (disposed) return;
        const model = gltf.scene;
        scene.add(model);

        const bounds = new THREE.Box3().setFromObject(model);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        camera.position.set(center.x, center.y + size.y * 0.03, center.z + size.z + Math.max(size.y * 1.35, 1.6));
        camera.lookAt(center.x, center.y, center.z);

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
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();

    const frame = () => {
      animationId = requestAnimationFrame(frame);
      controller.current?.update(clock.getDelta(), clock.elapsedTime);
      renderer.render(scene, camera);
    };
    frame();

    return () => {
      disposed = true;
      cancelAnimationFrame(animationId);
      observer.disconnect();
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
