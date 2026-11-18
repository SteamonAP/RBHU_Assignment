import { AIProvider, ChatMessage } from './ai.provider';
import { env } from '../../config/env.config';
export class OllamaProvider implements AIProvider {
  async generateResponse(messages: ChatMessage[]): Promise<string> {
    const response = await fetch(`${env.OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: env.OLLAMA_MODEL, messages, stream: false }),
    });
    if (!response.ok) throw new Error('Ollama unavailable');
    const data = await response.json() as any;
    return data.message?.content || 'No response generated.';
  }
}
