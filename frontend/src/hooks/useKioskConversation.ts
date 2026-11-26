import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import type { AvatarState } from '../avatar/AvatarController';
import type { QueryResponse, SourceReference } from '../types/api';
import { nextUserTranscript } from '../kiosk/transcript';

export interface KioskTurn {
  question: string;
  answer: string;
  sources: SourceReference[];
  response: QueryResponse;
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

/** Owns the single audio element and drives avatar state from real events. */
export function useKioskConversation(courseId: string | null, language?: string) {
  const [state, setState] = useState<AvatarState>('idle');
  const [isGreeting, setGreeting] = useState(false);
  // Speech captured from the student's microphone. This is the only text the
  // kiosk is allowed to display as a question.
  const [userTranscript, setUserTranscript] = useState('');
  // Internal only: the generated answer, citations and source metadata. Never
  // rendered in the student-facing transcript area.
  const [assistantResponse, setAssistantResponse] = useState<KioskTurn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const stateRef = useRef<AvatarState>('idle');
  const greetingInFlight = useRef(false);
  const greetingBytes = useRef<number[] | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
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
      const response = await api.query({
        question: clean,
        owner_id: 'kiosk', // identity comes from the kiosk token on the backend
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
      // TTS is optional: a synthesis or playback failure must not turn a
      // successful text answer into an AI error.
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

  /** Automatic greeting. Refuses to interrupt answers, recording or another greeting. */
  const greet = useCallback(async (text: string): Promise<boolean> => {
    if (greetingInFlight.current) return false;
    if (stateRef.current !== 'idle' || recorder.current || audio.current) return false;
    greetingInFlight.current = true;
    try {
      setError(null);
      setPlaybackError(null);
      setAssistantResponse(null);
      setGreeting(true);
      const bytes = greetingBytes.current ?? await api.synthesize({ text });
      greetingBytes.current = bytes; // backend also caches by text; this avoids repeat calls
      return await playAudio(bytes, true);
    } catch {
      // A greeting failure is non-fatal: stay silent and let normal kiosk use continue.
      setGreeting(false);
      setKioskState('idle');
      return false;
    } finally {
      greetingInFlight.current = false;
    }
  }, [playAudio, setKioskState]);

  const startListening = useCallback(async () => {
    setError(null);
    setPlaybackError(null);
    setAssistantResponse(null);
    setUserTranscript('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      chunks.current = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks.current, { type: 'audio/webm' });
        setKioskState('processing');
        try {
          if (!blob.size) throw new Error('No audio was recorded');
          const result = await api.transcribe(
            { fileName: 'question.webm', type: blob.type, data: Array.from(new Uint8Array(await blob.arrayBuffer())) },
            language,
          );
          if (!result.text.trim()) throw new Error('No speech was detected. Please try again.');
          await ask(result.text);
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason));
          setKioskState('error');
        }
      };
      recorder.current = mediaRecorder;
      mediaRecorder.start();
      setKioskState('listening');
    } catch (reason) {
      setError(`Microphone unavailable: ${reason instanceof Error ? reason.message : String(reason)}`);
      setKioskState('error');
    }
  }, [ask, language, setKioskState]);

  // Course switches must not retain the previous course's question, answer
  // or citations. Stop any in-flight playback as part of the transition.
  useEffect(() => {
    stopAudio();
    setUserTranscript('');
    setAssistantResponse(null);
    setError(null);
    setPlaybackError(null);
    setGreeting(false);
    setKioskState('idle');
  }, [courseId, setKioskState, stopAudio]);

  const stopListening = useCallback(() => {
    recorder.current?.stop();
    recorder.current = null;
  }, []);

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
    recorder.current?.stop();
    stopAudio();
    void audioContext.current?.close();
  }, [stopAudio]);

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
    stopListening,
    stopSpeaking,
    retry,
    ask,
    greet,
  };
}
