import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import type { AvatarState } from '../avatar/AvatarController';
import type { SourceReference } from '../types/api';

export interface KioskTurn {
  question: string;
  answer: string;
  sources: SourceReference[];
}

/** Owns the single audio element and drives avatar state from real events. */
export function useKioskConversation(courseId: string | null, language?: string) {
  const [state, setState] = useState<AvatarState>('idle');
  const [transcript, setTranscript] = useState('');
  const [turn, setTurn] = useState<KioskTurn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const audio = useRef<HTMLAudioElement | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const source = useRef<MediaElementAudioSourceNode | null>(null);
  const objectUrl = useRef<string | null>(null);

  const stopAudio = useCallback(() => {
    audio.current?.pause();
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
    source.current?.disconnect();
    source.current = null;
    audio.current = null;
    setAnalyser(null);
  }, []);

  const ask = useCallback(async (question: string) => {
    const clean = question.trim();
    if (!clean || !courseId) return;
    setState('processing');
    setError(null);
    setTranscript(clean);
    try {
      const response = await api.query({
        question: clean,
        owner_id: 'kiosk', // identity comes from the kiosk token on the backend
        course_id: courseId,
        include_sources: true,
      });
      setTurn({ question: clean, answer: response.answer, sources: response.sources });

      const bytes = await api.synthesize({ text: response.answer });
      stopAudio();
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
        setState('idle');
      };
      element.onerror = () => {
        stopAudio();
        setError('Audio playback failed.');
        setState('error');
      };
      setState('speaking');
      await element.play();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setState('error');
    }
  }, [courseId, stopAudio]);

  const startListening = useCallback(async () => {
    setError(null);
    setTurn(null);
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
        setState('processing');
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
          setState('error');
        }
      };
      recorder.current = mediaRecorder;
      mediaRecorder.start();
      setState('listening');
    } catch (reason) {
      setError(`Microphone unavailable: ${reason instanceof Error ? reason.message : String(reason)}`);
      setState('error');
    }
  }, [ask, language]);

  const stopListening = useCallback(() => {
    recorder.current?.stop();
    recorder.current = null;
  }, []);

  const stopSpeaking = useCallback(() => {
    stopAudio();
    setState('idle');
  }, [stopAudio]);

  const retry = useCallback(() => {
    setError(null);
    setState('idle');
  }, []);

  useEffect(() => () => {
    recorder.current?.stop();
    stopAudio();
    void audioContext.current?.close();
  }, [stopAudio]);

  return { state, transcript, turn, error, analyser, startListening, stopListening, stopSpeaking, retry, ask };
}
