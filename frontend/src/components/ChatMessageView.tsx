import type { ChatMessage } from '../hooks/useChat';
import { SourceList } from './SourceList';

interface Props {
  message: ChatMessage;
  onSpeak?: (text: string) => void;
  speaking?: boolean;
}

export function ChatMessageView({ message, onSpeak, speaking }: Props) {
  const isAssistant = message.role === 'assistant';
  return (
    <article className={`message message-${message.role}`}>
      <div className="message-avatar">{isAssistant ? 'H' : 'You'}</div>
      <div className="message-body">
        <div className="message-role">{isAssistant ? 'Assistant' : 'You'}</div>
        {isAssistant && message.generationMode === 'mock' && (
          <div className="mock-warning">Development test response — not an AI-generated answer.</div>
        )}
        {isAssistant && message.warning === 'no_relevant_context' && (
          <div className="info-warning">No relevant document excerpts were found.</div>
        )}
        <div className="message-content">{message.content}</div>
        {isAssistant && message.sources.length > 0 && <SourceList sources={message.sources} />}
        {isAssistant && onSpeak && (
          <button className="link-button" onClick={() => onSpeak(message.content)} disabled={speaking}>
            {speaking ? 'Speaking…' : 'Listen to response'}
          </button>
        )}
      </div>
    </article>
  );
}
