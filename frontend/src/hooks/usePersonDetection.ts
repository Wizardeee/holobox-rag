import { useEffect, useRef, useState } from 'react';
import type { AppSettings } from '../types/api';

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

/**
 * Optional, self-contained camera presence detector.
 *
 * Failures never propagate to the kiosk: a missing camera, denied permission or
 * model load error disables this module only and leaves the existing microphone,
 * RAG and audio pipeline untouched. Frames are processed locally and discarded.
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
    if (terminalFailure.current) return; // never re-prompt or retry after a real failure

    const confidence = settings.personDetectionConfidence;
    const intervalMs = Math.max(200, settings.personDetectionIntervalMs);
    const presenceMs = Math.max(0, settings.personPresenceMs);
    const absenceMs = Math.max(0, settings.personAbsenceMs);

    let disposed = false;
    let stream: MediaStream | null = null;
    let detector: Detector | null = null;
    let timer: number | null = null;
    let detecting = false;
    let lastTimestamp = 0;
    let personSince: number | null = null;
    let absentSince: number | null = null;
    let greeted = false;

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.style.display = 'none';
    document.body.appendChild(video);

    const shutdown = (next: CameraStatus) => {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      video.srcObject = null;
      try { detector?.close(); } catch { /* detector cleanup is best-effort */ }
      detector = null;
      if (!disposed) setStatus(next);
    };

    const run = async () => {
      setStatus('starting');
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('camera unavailable');
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 10, max: 15 } },
        });
        if (disposed) { shutdown('disabled'); return; }

        stream.getVideoTracks()[0].addEventListener('ended', () => {
          if (!disposed) {
            terminalFailure.current = true;
            shutdown('unavailable');
          }
        });

        video.srcObject = stream;
        await video.play();
        if (disposed) { shutdown('disabled'); return; }

        const { FilesetResolver, ObjectDetector } = await import('@mediapipe/tasks-vision');
        const vision = await FilesetResolver.forVisionTasks(assetUrl('mediapipe/wasm'));
        detector = await ObjectDetector.createFromOptions(vision, {
          baseOptions: { modelAssetPath: assetUrl('mediapipe/models/efficientdet_lite0_uint8.tflite') },
          runningMode: 'VIDEO',
          scoreThreshold: confidence,
          maxResults: 5,
        }) as unknown as Detector;
        if (disposed) { shutdown('disabled'); return; }

        setStatus('active');
        timer = window.setInterval(() => {
          if (detecting || !detector || !stream?.active || video.readyState < 2) return;
          detecting = true;
          const now = Date.now();
          let timestamp = performance.now();
          if (timestamp <= lastTimestamp) timestamp = lastTimestamp + 1;
          lastTimestamp = timestamp;

          try {
            const result = detector.detectForVideo(video, timestamp);
            const person = (result.detections ?? []).some((item) =>
              item.categories?.some((category) =>
                category.categoryName === 'person' && (category.score ?? 0) >= confidence,
              ),
            );
            if (person) {
              absentSince = null;
              if (!greeted) {
                if (personSince === null) personSince = now;
                if (now - personSince >= presenceMs) {
                  greeted = true; // one greeting per visit, even if the kiosk is busy
                  personSince = null;
                  if (!busyRef.current) void greetRef.current();
                }
              }
            } else {
              personSince = null;
              if (greeted) {
                if (absentSince === null) absentSince = now;
                if (now - absentSince >= absenceMs) {
                  greeted = false;
                  absentSince = null;
                }
              }
            }
          } catch {
            // A single dropped frame must never break the kiosk.
          } finally {
            detecting = false;
          }
        }, intervalMs);
      } catch (error) {
        terminalFailure.current = true; // no retry / no repeated permission prompt
        const message = error instanceof Error ? error.message : String(error);
        const denied = /denied|permission|notallowed/i.test(message);
        shutdown(denied ? 'denied' : 'unavailable');
      }
    };

    void run();
    return () => {
      disposed = true;
      shutdown('disabled');
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
