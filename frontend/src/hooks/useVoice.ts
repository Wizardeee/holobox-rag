import { useCallback, useRef, useState } from 'react';
import { api } from '../services/api';

function bytesToWavUrl(bytes: number[]): string {
  const blob = new Blob([new Uint8Array(bytes)], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

export function useVoice(onTranscript: (text: string) => void, language?: string) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const audio = useRef<HTMLAudioElement | null>(null);

  const startRecording = useCallback(async () => {
    setError(null);
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
        setTranscribing(true);
        try {
          const buffer = new Uint8Array(await blob.arrayBuffer());
          const result = await api.transcribe({
            fileName: 'recording.webm',
            type: blob.type,
            data: Array.from(buffer),
          }, language);
          onTranscript(result.text);
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
          setTranscribing(false);
        }
      };
      recorder.current = mediaRecorder;
      mediaRecorder.start();
      setRecording(true);
    } catch (reason) {
      setError(`Microphone unavailable: ${reason instanceof Error ? reason.message : String(reason)}`);
    }
  }, [language, onTranscript]);

  const stopRecording = useCallback(() => {
    recorder.current?.stop();
    recorder.current = null;
    setRecording(false);
  }, []);

  const speak = useCallback(async (text: string, voice?: string) => {
    setError(null);
    try {
      const bytes = await api.synthesize({ text, voice });
      audio.current?.pause();
      const element = new Audio(bytesToWavUrl(bytes));
      element.onended = () => setSpeaking(false);
      audio.current = element;
      setSpeaking(true);
      await element.play();
    } catch (reason) {
      setSpeaking(false);
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    audio.current?.pause();
    audio.current = null;
    setSpeaking(false);
  }, []);

  return {
    recording,
    transcribing,
    speaking,
    error,
    startRecording,
    stopRecording,
    speak,
    stopSpeaking,
  };
}
