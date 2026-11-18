import { http } from '../lib/api';
import type { ApiResult } from '../lib/api';
import type { ChatConversation, ChatMessage } from '../types';

export type SendChatResult = {
  conversationId: string;
  message: ChatMessage;
};

export const chatService = {
  send: (
    conversationId: string | null,
    message: string,
  ): Promise<ApiResult<SendChatResult>> =>
    http.post<SendChatResult>('/chat', { conversationId, message }),

  messages: (conversationId: string): Promise<ApiResult<ChatMessage[]>> =>
    http.get<ChatMessage[]>(`/chat/${conversationId}/messages`),

  conversations: (): Promise<ApiResult<ChatConversation[]>> =>
    http.get<ChatConversation[]>('/chat/conversations'),
};
