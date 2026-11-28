import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import type { AvatarState } from '../avatar/AvatarController';
import type { QueryResponse, SourceReference } from '../types/api';
import { nextUserTranscript } from '../kiosk/transcript';
import {
  canStartVoiceSession,
  level,
  shouldStopManualRecording,
  updateManualVad,
} from '../audio/voiceSession';

/** Metadata shared by normal query responses and camera capture responses. */
export interface AssistantMeta {
  answer_source?: string | null;
  document_support?: string | null;
  uncertain?: boolean;
}

export interface KioskTurn {
  question: string;
  answer: string;
  sources: SourceReference[];
  response: AssistantMeta;
}

const VAD_INTERVAL_MS = 100;
const SILENCE_MS = 1200;
const NO_SPEECH_MS = 5000;
const MAX_RECORDING_MS = 30000;
const VOICE_THRESHOLD = 0.02;
const VAD_LIMITS = { silenceMs: SILENCE_MS, noSpeechMs: NO_SPEECH_MS, maxMs: MAX_RECORDING_MS };

interface ActiveSession {
  kind: 'manual' | 'camera';
  id: string;
  submitted: boolean;
}

function base64ToBytes(value: string): number[] {
  const binary = atob(value);
  const bytes = new Array<number>(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function newSessionId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Source labels are metadata only — the assistant's words are never rendered. */
export function sourceNote(turn: KioskTurn | null): string {
  if (!turn) return '';
  if (turn.response.uncertain) return 'The assistant was not certain about this answer';
  switch (turn.response.answer_source) {
    case 'documents': return 'Based on your course material';
    case 'mixed': return 'Course material with additional explanation';
    case 'general_knowledge': return 'General knowledge';
    case 'unknown': return 'The assistant was not certain about this answer';
    default: return turn.response.document_support === 'none' ? 'General knowledge' : '';
  }
}

/** Owns the single audio element and the single microphone session. */
export function useKioskConversation(courseId: string | null, language?: string) {
  const [state, setState] = useState<AvatarState>('idle');
  const [isGreeting, setGreeting] = useState(false);
  const [userTranscript, setUserTranscript] = useState('');
  const [assistantResponse, setAssistantResponse] = useState<KioskTurn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const stateRef = useRef<AvatarState>('idle');
  const disposed = useRef(false);
  const starting = useRef(false);
  const greetingInFlight = useRef(false);
  const greetingBytes = useRef<number[] | null>(null);
  const active = useRef<ActiveSession | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const vadContext = useRef<AudioContext | null>(null);
  const vadSource = useRef<MediaStreamAudioSourceNode | null>(null);
  const vadAnalyser = useRef<AnalyserNode | null>(null);
  const samples = useRef(new Uint8Array(1024));
  const vadTimer = useRef<number | null>(null);
  const cameraTimer = useRef<number | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const source = useRef<MediaElementAudioSourceNode | null>(null);
  const objectUrl = useRef<string | null>(null);

  const setKioskState = useCallback((next: AvatarState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const stopAudio = useCallback(() => {
    audio.current?.pause();
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
    source.current?.disconnect();
    source.current = null;
    audio.current = null;
    setAnalyser(null);
  }, []);

  /** The ONE place that plays generated audio and feeds the avatar analyser. */
  const playAudio = useCallback(async (bytes: number[], greeting: boolean): Promise<boolean> => {
    stopAudio();
    try {
      objectUrl.current = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'audio/wav' }));
      const element = new Audio(objectUrl.current);
      audio.current = element;

      const context = audioContext.current ?? new AudioContext();
      audioContext.current = context;
      await context.resume();
      source.current = context.createMediaElementSource(element);
      const node = context.createAnalyser();
      node.fftSize = 1024;
      source.current.connect(node);
      node.connect(context.destination);
      setAnalyser(node);

      element.onended = () => {
        stopAudio();
        if (greeting) setGreeting(false);
        setKioskState('idle');
      };
      element.onerror = () => {
        stopAudio();
        if (greeting) setGreeting(false);
        setError('Audio playback failed.');
        setKioskState('error');
      };
      setKioskState('speaking');
      await element.play();
      return true;
    } catch (reason) {
      stopAudio();
      if (greeting) setGreeting(false);
      setError(reason instanceof Error ? reason.message : String(reason));
      setKioskState('error');
      return false;
    }
  }, [setKioskState, stopAudio]);

  const ask = useCallback(async (question: string): Promise<KioskTurn | null> => {
    const clean = question.replace(/\s+/g, ' ').trim();
    if (!clean || !courseId) return null;
    setKioskState('processing');
    setError(null);
    setPlaybackError(null);
    setUserTranscript((current) => nextUserTranscript(current, clean));
    try {
      const response: QueryResponse = await api.query({
        question: clean,
        owner_id: 'kiosk',
        course_id: courseId,
        include_sources: true,
      });
      const turn: KioskTurn = {
        question: clean,
        answer: response.answer,
        sources: response.sources,
        response,
      };
      setAssistantResponse(turn);
      try {
        const bytes = await api.synthesize({ text: response.answer });
        const played = await playAudio(bytes, false);
        if (!played) throw new Error('playback failed');
      } catch {
        setError(null);
        setPlaybackError('Audio unavailable — the answer is shown below.');
        setKioskState('idle');
      }
      return turn;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setKioskState('error');
      return null;
    }
  }, [courseId, playAudio, setKioskState]);

  const clearTimers = useCallback(() => {
    if (vadTimer.current !== null) window.clearInterval(vadTimer.current);
    vadTimer.current = null;
    if (cameraTimer.current !== null) window.clearTimeout(cameraTimer.current);
    cameraTimer.current = null;
  }, []);

  const releaseMicrophone = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    vadSource.current?.disconnect();
    vadSource.current = null;
    void vadContext.current?.close().catch(() => undefined);
    vadContext.current = null;
    vadAnalyser.current = null;
  }, []);

  const stopRecording = useCallback(() => {
    clearTimers();
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
    else releaseMicrophone();
  }, [clearTimers, releaseMicrophone]);

  const handleCameraCapture = useCallback(async (sessionId: string, data: number[]) => {
    const response = await api.captureVoice(
      sessionId,
      { fileName: 'question.webm', type: 'audio/webm', data },
      courseId,
      language,
    );
    if (response.status === 'no_speech') {
      setUserTranscript('');
      setError('No speech was detected. Please try again.');
      setKioskState('idle');
      return;
    }
    if (response.status === 'error' || !response.answer) {
      setError(response.warning || 'The recording could not be processed.');
      setKioskState('error');
      return;
    }
    setUserTranscript((current) => nextUserTranscript(current, response.text));
    setError(null);
    setAssistantResponse({
      question: response.text,
      answer: response.answer,
      sources: response.sources,
      response,
    });
    setPlaybackError(response.warning ? 'Audio unavailable — the answer is shown below.' : null);
    if (response.audio_base64) {
      const played = await playAudio(base64ToBytes(response.audio_base64), false);
      if (!played) setPlaybackError('Audio unavailable — the answer is shown below.');
    } else {
      setKioskState('idle');
    }
  }, [courseId, language, playAudio, setKioskState]);

  const finalizeSession = useCallback(async (session: ActiveSession) => {
    clearTimers();
    releaseMicrophone();
    if (disposed.current || active.current?.id !== session.id || session.submitted) return;
    session.submitted = true;
    const blob = new Blob(chunks.current, { type: chunks.current[0]?.type || 'audio/webm' });
    const data = Array.from(new Uint8Array(await blob.arrayBuffer()));
    if (!data.length) {
      active.current = null;
      setError('No audio was recorded. Please try again.');
      setKioskState('idle');
      return;
    }
    setKioskState('processing');
    try {
      if (session.kind === 'camera') {
        await handleCameraCapture(session.id, data);
      } else {
        const result = await api.transcribe(
          { fileName: 'question.webm', type: blob.type, data },
          language,
        );
        if (!result.text.trim()) {
          setError('No speech was detected. Please try again.');
          setKioskState('idle');
          return;
        }
        await ask(result.text);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setKioskState('error');
    } finally {
      active.current = null;
    }
  }, [ask, clearTimers, handleCameraCapture, language, releaseMicrophone, setKioskState]);

  /** Shared guard: only one microphone session, manual or camera, may exist. */
  const beginSession = useCallback(async (
    kind: ActiveSession['kind'],
    id: string,
    listenMs = 5000,
  ): Promise<boolean> => {
    if (
      disposed.current || starting.current
      || !canStartVoiceSession(Boolean(active.current), stateRef.current, Boolean(audio.current))
    ) return false;
    starting.current = true;
    setError(null);
    setPlaybackError(null);
    if (kind === 'manual') {
      setAssistantResponse(null);
      setUserTranscript('');
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (
        disposed.current
        || !canStartVoiceSession(Boolean(active.current), stateRef.current, Boolean(audio.current))
      ) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }
      const mediaRecorder = new MediaRecorder(stream);
      const session: ActiveSession = { kind, id, submitted: false };
      chunks.current = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      mediaRecorder.onstop = () => { void finalizeSession(session); };
      recorder.current = mediaRecorder;
      streamRef.current = stream;
      active.current = session;

      if (kind === 'manual') {
        const context = new AudioContext();
        void context.resume().catch(() => undefined);
        vadContext.current = context;
        const sourceNode = context.createMediaStreamSource(stream);
        const node = context.createAnalyser();
        node.fftSize = 1024;
        sourceNode.connect(node);
        vadSource.current = sourceNode;
        vadAnalyser.current = node;
        const vadState = { startedAt: performance.now(), lastVoiceAt: null, heardSpeech: false };
        vadTimer.current = window.setInterval(() => {
          if (!vadAnalyser.current || !active.current) return;
          vadAnalyser.current.getByteTimeDomainData(samples.current);
          const currentLevel = level(samples.current);
          const now = performance.now();
          if (shouldStopManualRecording(vadState, now, currentLevel, VOICE_THRESHOLD, VAD_LIMITS)) {
            stopRecording();
          } else {
            updateManualVad(vadState, now, currentLevel, VOICE_THRESHOLD);
          }
        }, VAD_INTERVAL_MS);
      } else {
        cameraTimer.current = window.setTimeout(stopRecording, Math.max(1000, listenMs));
      }

      mediaRecorder.start();
      setKioskState('listening');
      return true;
    } catch (reason) {
      releaseMicrophone();
      setError(`Microphone unavailable: ${reason instanceof Error ? reason.message : String(reason)}`);
      setKioskState('error');
      return false;
    } finally {
      starting.current = false;
    }
  }, [finalizeSession, releaseMicrophone, setKioskState, stopRecording]);

  const startListening = useCallback(() => beginSession('manual', newSessionId()), [beginSession]);

  /** Camera-triggered session uses the backend-provided window, not VAD. */
  const startAutomaticSession = useCallback(
    (sessionId: string, listenMs: number) => beginSession('camera', sessionId, listenMs),
    [beginSession],
  );

  /** Automatic greeting. Refuses to interrupt answers, recording or another greeting. */
  const greet = useCallback(async (text: string): Promise<boolean> => {
    if (greetingInFlight.current || active.current || audio.current) return false;
    if (stateRef.current !== 'idle') return false;
    greetingInFlight.current = true;
    try {
      setError(null);
      setPlaybackError(null);
      setAssistantResponse(null);
      setGreeting(true);
      const bytes = greetingBytes.current ?? await api.synthesize({ text });
      greetingBytes.current = bytes;
      return await playAudio(bytes, true);
    } catch {
      setGreeting(false);
      setKioskState('idle');
      return false;
    } finally {
      greetingInFlight.current = false;
    }
  }, [playAudio, setKioskState]);

  const cancelSession = useCallback(() => {
    clearTimers();
    if (recorder.current) {
      recorder.current.onstop = null;
      if (recorder.current.state !== 'inactive') recorder.current.stop();
      recorder.current = null;
    }
    active.current = null;
    releaseMicrophone();
  }, [clearTimers, releaseMicrophone]);

  // Course switches must not retain the previous course's question, answer
  // or citations. Stop any in-flight playback or recording on transition.
  useEffect(() => {
    cancelSession();
    stopAudio();
    setUserTranscript('');
    setAssistantResponse(null);
    setError(null);
    setPlaybackError(null);
    setGreeting(false);
    setKioskState('idle');
  }, [courseId, cancelSession, setKioskState, stopAudio]);

  const stopListening = useCallback(() => stopRecording(), [stopRecording]);

  const stopSpeaking = useCallback(() => {
    stopAudio();
    setGreeting(false);
    setKioskState('idle');
  }, [setKioskState, stopAudio]);

  const retry = useCallback(() => {
    setError(null);
    setPlaybackError(null);
    setKioskState('idle');
  }, [setKioskState]);

  useEffect(() => () => {
    disposed.current = true;
    cancelSession();
    stopAudio();
    void audioContext.current?.close();
  }, [cancelSession, stopAudio]);

  return {
    state,
    isListening: state === 'listening',
    isProcessing: state === 'processing',
    isSpeaking: state === 'speaking',
    isGreeting,
    userTranscript,
    assistantResponse,
    note: sourceNote(assistantResponse),
    error,
    playbackError,
    analyser,
    startListening,
    startAutomaticSession,
    stopListening,
    stopSpeaking,
    retry,
    ask,
    greet,
  };
}
