import { chatRepository } from "./chat.repository";
import { AppError } from "../../errors/AppError";
import { AIProvider, ChatMessage } from "./ai.provider";
import { MockAIProvider } from "./mock.provider";
import { OllamaProvider } from "./ollama.provider";
import { OpenAIProvider } from "./openai.provider";
import { env } from "../../config/env.config";
import logger from "../../utils/logger";
const SYSTEM_PROMPT = `You are an internal logistics operations assistant. Help employees with customer management, shipment tracking, and platform usage. Be professional and accurate. Never invent shipment or customer details you don't have access to.`;
function getProvider(): AIProvider {
  switch (env.AI_PROVIDER) {
    case "ollama":
      return new OllamaProvider();
    case "openai":
      return new OpenAIProvider();
    case "mock":
      return new MockAIProvider();
    default:
      throw new Error(`Unsupported AI_PROVIDER: ${env.AI_PROVIDER}`);
  }
}
export const chatService = {
  async sendMessage(
    userId: string,
    conversationId: string | null,
    message: string,
  ) {
    if (conversationId) {
      const conversation = await chatRepository.findConversation(
        conversationId,
        userId,
      );
      if (!conversation) throw new AppError("Conversation not found", 404);
    }
    const history = conversationId
      ? await chatRepository.getMessages(conversationId, 20)
      : [];
    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: message },
    ];
    let aiContent: string;
    try {
      aiContent = await getProvider().generateResponse(messages);
    } catch (error) {
      logger.warn("AI provider request failed", {
        error:
          error instanceof Error ? error.message : "Unknown provider error",
      });
      throw new AppError(
        "AI provider unavailable. Please try again later.",
        503,
      );
    }
    return chatRepository.addTurn(
      userId,
      conversationId,
      message.slice(0, 50),
      message,
      aiContent,
    );
  },
  async getConversationMessages(conversationId: string, userId: string) {
    const conv = await chatRepository.findConversation(conversationId, userId);
    if (!conv) throw new AppError("Conversation not found", 404);
    return chatRepository.getMessages(conversationId);
  },
  async getUserConversations(userId: string) {
    return chatRepository.getUserConversations(userId);
  },
};
