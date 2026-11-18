import { useEffect, useRef, useState } from 'react';
import { useChat } from '../hooks/useChat';
import { cn, formatDateTime } from '../lib/utils';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import Spinner from '../components/ui/Spinner';

export default function AiChatPage() {
  const {
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
  } = useChat();

  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, isSending]);

  const handleSend = async () => {
    const content = input.trim();
    if (!content || isSending) return;
    const sent = await sendMessage(content);
    if (sent) setInput('');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">AI Assistant</h2>
          <p className="text-sm text-slate-500">
            Ask questions about your logistics operations
          </p>
        </div>
        <Button variant="secondary" onClick={startNewConversation}>
          New conversation
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Card title="Conversations" className="h-[600px] overflow-y-auto">
          {isLoadingConversations ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : conversations.length === 0 ? (
            <p className="text-sm text-slate-500">No conversations yet.</p>
          ) : (
            <ul className="space-y-1">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => selectConversation(conversation.id)}
                    className={cn(
                      'w-full truncate rounded-md px-3 py-2 text-left text-sm transition',
                      conversation.id === conversationId
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-slate-600 hover:bg-slate-100',
                    )}
                  >
                    {conversation.title ??
                      conversation.lastMessage ??
                      `Conversation ${conversation.id.slice(0, 8)}`}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="flex h-[600px] flex-col">
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto pr-1">
            {isLoadingMessages ? (
              <div className="flex h-full items-center justify-center">
                <Spinner size="lg" />
              </div>
            ) : messages.length === 0 ? (
              <EmptyState
                title="Start the conversation"
                description="Send a message to ask the assistant about customers, shipments or analytics."
              />
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'flex',
                    message.role === 'user'
                      ? 'justify-end'
                      : 'justify-start',
                  )}
                >
                  <div
                    className={cn(
                      'max-w-[75%] rounded-2xl px-4 py-2 text-sm',
                      message.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-800',
                    )}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    <p
                      className={cn(
                        'mt-1 text-[10px]',
                        message.role === 'user'
                          ? 'text-blue-100'
                          : 'text-slate-400',
                      )}
                    >
                      {formatDateTime(message.createdAt)}
                    </p>
                  </div>
                </div>
              ))
            )}
            {isSending && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-slate-100 px-4 py-2 text-sm text-slate-500">
                  Assistant is typing…
                </div>
              </div>
            )}
          </div>

          {error && (
            <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="mt-4 flex items-end gap-2 border-t border-slate-200 pt-4">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
              rows={2}
              placeholder="Type your message… (Enter to send, Shift+Enter for a new line)"
              className="flex-1 resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            <Button onClick={handleSend} isLoading={isSending} disabled={!input.trim()}>
              Send
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
