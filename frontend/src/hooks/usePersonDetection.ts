import { useEffect, useRef, useState } from 'react';
import type { AppSettings } from '../types/api';
import {
  canInfer,
  nextDetectionDelay,
  PresenceTracker,
} from '../detection/presenceTracker';

export type CameraStatus = 'disabled' | 'starting' | 'active' | 'unavailable' | 'denied';

type Detection = { categories?: Array<{ categoryName?: string; score?: number }> };
type Detector = {
  // MediaPipe VIDEO inference is synchronous; it returns a DetectionResult.
  detectForVideo(video: HTMLVideoElement, timestamp: number): { detections?: Detection[] };
  close(): void;
};

/** Local WASM/model assets. Never fetched from the backend or the internet. */
function assetUrl(path: string): string {
  return import.meta.env.DEV
    ? new URL(path, document.baseURI).href
    : `holobox://assets/${path}`;
}

const MAX_CAMERA_ATTEMPTS = 3;

/**
 * Optional, self-contained camera presence detector.
 *
 * Failures never propagate to the kiosk: a missing camera, denied permission or
 * model load error disables this module only. Frames are processed locally and
 * discarded. The model is unchanged; reliability comes from scheduling,
 * temporal confirmation, stale-frame rejection and bounded recovery.
 */
export function usePersonDetection(
  settings: AppSettings | null,
  isBusy: boolean,
  onGreet: () => void | Promise<void>,
) {
  const [status, setStatus] = useState<CameraStatus>('disabled');
  const busyRef = useRef(isBusy);
  const greetRef = useRef(onGreet);
  const terminalFailure = useRef(false);

  useEffect(() => { busyRef.current = isBusy; }, [isBusy]);
  useEffect(() => { greetRef.current = onGreet; }, [onGreet]);

  useEffect(() => {
    if (!settings?.personDetectionEnabled) {
      setStatus('disabled');
      return;
    }
    if (terminalFailure.current) return; // permission was denied: never re-prompt

    const confidence = settings.personDetectionConfidence;
    const baseInterval = Math.min(2000, Math.max(250, settings.personDetectionIntervalMs));
    const tracker = new PresenceTracker({
      presenceMs: Math.max(0, settings.personPresenceMs),
      absenceMs: Math.max(0, settings.personAbsenceMs),
    });

    let disposed = false;
    let stream: MediaStream | null = null;
    let detector: Detector | null = null;
    let timer: number | null = null;
    let recoveryTimer: number | null = null;
    let detecting = false;
    let attempts = 0;
    let lastTimestamp = 0;
    let lastVideoTime = -1;

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.style.display = 'none';
    document.body.appendChild(video);

    const clearTimer = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };

    const shutdown = (next: CameraStatus | null) => {
      clearTimer();
      if (recoveryTimer !== null) window.clearTimeout(recoveryTimer);
      recoveryTimer = null;
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      video.srcObject = null;
      try { detector?.close(); } catch { /* cleanup is best-effort */ }
      detector = null;
      tracker.reset();
      if (next && !disposed) setStatus(next);
    };

    const schedule = () => {
      if (disposed || !detector) return;
      clearTimer();
      timer = window.setTimeout(
        tick,
        nextDetectionDelay(baseInterval, tracker, busyRef.current),
      );
    };

    const tick = () => {
      timer = null;
      if (disposed || !detector) return;
      // No inference while answering/recording: greetings are suppressed then,
      // and this keeps the Three.js animation smooth on the mini PC.
      if (busyRef.current) {
        schedule();
        return;
      }
      if (!canInfer({
        detecting,
        streamActive: stream?.active ?? false,
        readyState: video.readyState,
        videoWidth: video.videoWidth,
        currentTime: video.currentTime,
        lastVideoTime,
      })) {
        schedule();
        return;
      }
      detecting = true;
      let timestamp = performance.now();
      if (timestamp <= lastTimestamp) timestamp = lastTimestamp + 1;
      lastTimestamp = timestamp;
      lastVideoTime = video.currentTime;
      try {
        const result = detector.detectForVideo(video, timestamp);
        const person = (result.detections ?? []).some((item) =>
          item.categories?.some((category) =>
            (category.categoryName ?? '').toLowerCase() === 'person'
            && (category.score ?? 0) >= confidence,
          ),
        );
        const state = tracker.update(person, Date.now());
        if (state.greetingDue) void greetRef.current();
      } catch {
        // A single dropped frame must never break the kiosk.
      } finally {
        detecting = false;
        schedule();
      }
    };

    const recover = (reason: 'ended' | 'error') => {
      if (disposed || terminalFailure.current || recoveryTimer !== null) return;
      shutdown(null);
      attempts += 1;
      if (attempts > MAX_CAMERA_ATTEMPTS) {
        terminalFailure.current = true;
        setStatus('unavailable');
        return;
      }
      if (reason === 'error') setStatus('starting');
      recoveryTimer = window.setTimeout(() => {
        recoveryTimer = null;
        void startCamera();
      }, 1500 * attempts);
    };

    const startCamera = async () => {
      if (disposed) return;
      setStatus('starting');
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('camera unavailable');
        // 4:3 is intentional: after MediaPipe letterboxes to a square input it
        // preserves more vertical detail for a standing person than 16:9.
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 10, max: 15 } },
        });
        if (disposed) { shutdown('disabled'); return; }

        stream.getVideoTracks()[0].addEventListener('ended', () => {
          if (!disposed) recover('ended');
        });

        video.srcObject = stream;
        await video.play();
        if (disposed) { shutdown('disabled'); return; }

        if (!detector) {
          const { FilesetResolver, ObjectDetector } = await import('@mediapipe/tasks-vision');
          const vision = await FilesetResolver.forVisionTasks(assetUrl('mediapipe/wasm'));
          detector = await ObjectDetector.createFromOptions(vision, {
            baseOptions: { modelAssetPath: assetUrl('mediapipe/models/efficientdet_lite0_uint8.tflite') },
            runningMode: 'VIDEO',
            scoreThreshold: confidence,
            maxResults: 5,
          }) as unknown as Detector;
        }
        if (disposed) { shutdown('disabled'); return; }

        setStatus('active');
        lastVideoTime = -1;
        schedule();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const denied = /denied|permission|notallowed|security/i.test(message);
        if (denied) {
          terminalFailure.current = true;
          shutdown('denied');
          return;
        }
        recover('error');
      }
    };

    void startCamera();
    return () => {
      disposed = true;
      shutdown(null);
      video.remove();
    };
  }, [
    settings?.personDetectionEnabled,
    settings?.personDetectionConfidence,
    settings?.personDetectionIntervalMs,
    settings?.personPresenceMs,
    settings?.personAbsenceMs,
  ]);

  return { cameraStatus: status };
}
