import { env } from "../../config/env.config";
import { AIProvider, ChatMessage } from "./ai.provider";

interface ChatCompletionResponse {
  choices?: { message?: { content?: unknown } }[];
}

export class OpenAIProvider implements AIProvider {
  async generateResponse(messages: ChatMessage[]): Promise<string> {
    if (!env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is required when AI_PROVIDER=openai.");
    }

    const baseUrl = env.OPENAI_BASE_URL.replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        messages,
        stream: false,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(
        `OpenAI-compatible provider returned HTTP ${response.status}.`,
      );
    }

    const result = (await response.json()) as ChatCompletionResponse;
    const content = result.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error(
        "OpenAI-compatible provider returned no message content.",
      );
    }

    return content.trim();
  }
}
