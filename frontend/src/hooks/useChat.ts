import { useCallback, useEffect, useState } from 'react';
import { chatService } from '../services/chat.service';
import { getErrorMessage } from '../lib/utils';
import type { ChatConversation, ChatMessage } from '../types';

export function useChat() {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    setIsLoadingConversations(true);
    try {
      const result = await chatService.conversations();
      setConversations(result.data ?? []);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load conversations'));
    } finally {
      setIsLoadingConversations(false);
    }
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    setIsLoadingMessages(true);
    setError(null);
    try {
      const result = await chatService.messages(id);
      setMessages(result.data ?? []);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load messages'));
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  const selectConversation = useCallback(
    (id: string) => {
      setConversationId(id);
      void loadMessages(id);
    },
    [loadMessages],
  );

  const startNewConversation = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setError(null);
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || isSending) return false;

      setIsSending(true);
      setError(null);

      const optimistic: ChatMessage = {
        id: `local-${Date.now()}`,
        role: 'user',
        content: trimmed,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);

      try {
        const result = await chatService.send(conversationId, trimmed);
        setConversationId(result.data.conversationId);
        setMessages((prev) => [...prev, result.data.message]);
        void loadConversations();
        return true;
      } catch (err) {
        setMessages((prev) => prev.filter((msg) => msg.id !== optimistic.id));
        setError(getErrorMessage(err, 'Failed to send message'));
        return false;
      } finally {
        setIsSending(false);
      }
    },
    [conversationId, isSending, loadConversations],
  );

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  return {
    conversations,
    conversationId,
    messages,
    isSending,
    isLoadingConversations,
    isLoadingMessages,
    error,
    sendMessage,
    selectConversation,
    startNewConversation,
  };
}
