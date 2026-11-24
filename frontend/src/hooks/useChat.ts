import { useCallback, useState } from 'react';
import { api } from '../services/api';
import type { QueryResponse, SourceReference } from '../types/api';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources: SourceReference[];
  generationMode?: QueryResponse['generation_mode'];
  warning?: string | null;
}

export function useChat(userId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (question: string): Promise<ChatMessage | null> => {
      const trimmed = question.trim();
      if (!trimmed || loading) return null;
      setError(null);
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: 'user', content: trimmed, sources: [] },
      ]);
      const activeConversation = conversationId ?? crypto.randomUUID();
      setConversationId(activeConversation);
      setLoading(true);
      try {
        const response = await api.query({
          question: trimmed,
          owner_id: userId,
          conversation_id: activeConversation,
          include_sources: true,
        });
        const answer: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: response.answer,
          sources: response.sources,
          generationMode: response.generation_mode,
          warning: response.warning,
        };
        setMessages((current) => [...current, answer]);
        if (response.conversation_id) setConversationId(response.conversation_id);
        return answer;
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [conversationId, loading, userId],
  );

  const reset = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setError(null);
  }, []);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const conversation = await api.getConversation(id);
      setConversationId(conversation.id);
      setMessages(
        conversation.messages.map((message) => ({
          id: message.id,
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: message.content,
          sources: message.sources,
        })),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  return { messages, conversationId, loading, error, send, reset, load };
}
