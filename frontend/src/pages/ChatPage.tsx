import { useState } from 'react';
import { ChatMessageView } from '../components/ChatMessageView';
import { Spinner } from '../components/Spinner';
import type { useChat } from '../hooks/useChat';
import { useVoice } from '../hooks/useVoice';
import { errorMessage } from '../services/api';
import type { AppSettings } from '../types/api';

interface Props {
  settings: AppSettings;
  chat: ReturnType<typeof useChat>;
}

export function ChatPage({ settings, chat }: Props) {
  const [draft, setDraft] = useState('');
  const voice = useVoice((text) => setDraft(text), settings.language || undefined);

  const submit = async () => {
    const question = draft.trim();
    if (!question || chat.loading) return;
    setDraft('');
    const answer = await chat.send(question);
    if (answer && settings.voiceOutputEnabled) {
      await voice.speak(answer.content, settings.ttsVoice || undefined);
    }
  };

  return (
    <section className="page chat-page">
      <header className="page-header">
        <div>
          <h1>Chat</h1>
          <p>Ask questions about your knowledge base.</p>
        </div>
        <button className="secondary" onClick={chat.reset}>
          New conversation
        </button>
      </header>

      <div className="messages" aria-live="polite">
        {chat.messages.length === 0 && (
          <div className="empty-state">
            <h2>Start a conversation</h2>
            <p>Upload documents in the Knowledge Base, then ask a question below.</p>
          </div>
        )}
        {chat.messages.map((message) => (
          <ChatMessageView
            key={message.id}
            message={message}
            onSpeak={settings.voiceOutputEnabled ? voice.speak : undefined}
            speaking={voice.speaking}
          />
        ))}
        {chat.loading && <Spinner label="Retrieving documents and generating an answer…" />}
        {voice.transcribing && <Spinner label="Transcribing your recording…" />}
      </div>

      {chat.error && <div className="banner banner-error">{chat.error}</div>}
      {voice.error && <div className="banner banner-error">{voice.error}</div>}

      <div className="composer">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder={voice.recording ? 'Recording… review the transcription when it appears' : 'Type your question…'}
          rows={3}
        />
        <div className="composer-actions">
          <button
            className={`mic ${voice.recording ? 'recording' : ''}`}
            disabled={!settings.voiceInputEnabled}
            onClick={() => (voice.recording ? voice.stopRecording() : void voice.startRecording())}
            title={settings.voiceInputEnabled ? 'Microphone' : 'Voice input is disabled in Settings'}
          >
            {voice.recording ? 'Stop recording' : 'Microphone'}
          </button>
          {voice.speaking && (
            <button className="secondary" onClick={voice.stopSpeaking}>
              Stop audio
            </button>
          )}
          <button className="primary" onClick={() => void submit()} disabled={chat.loading || !draft.trim()}>
            Send
          </button>
        </div>
        <p className="hint">Enter sends · Shift+Enter adds a new line · Transcriptions are editable before sending.</p>
      </div>
    </section>
  );
}
