export interface ChatMessage { role: 'system'|'user'|'assistant'; content: string; }
export interface AIProvider { generateResponse(messages: ChatMessage[]): Promise<string>; }
