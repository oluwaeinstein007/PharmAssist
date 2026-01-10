'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface Message {
  id: string;
  type: 'user' | 'assistant' | 'system' | 'error';
  content: string;
  timestamp: Date;
  isLoading?: boolean;
}

const QUICK_ACTIONS = [
  { label: '🔍 Search Paracetamol', query: 'search for paracetamol' },
  { label: '🤒 Fever Medicine', query: 'I have fever, what medicine should I take?' },
  { label: '🤕 Headache Relief', query: 'I have a headache' },
  { label: '🦟 Malaria Treatment', query: 'I have malaria with fever' },
  { label: '📦 Check Stock', query: 'Is amoxicillin in stock?' },
];

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      type: 'system',
      content: '👋 Welcome to PharmAssist! Ask me about medicines, check stock availability, or describe your symptoms.',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Check API connection on mount
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const response = await fetch('/api/chat');
        if (response.ok) {
          setIsConnected(true);
        }
      } catch {
        setIsConnected(false);
      }
    };
    checkConnection();
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const addMessage = useCallback((content: string, type: Message['type'], isLoading = false) => {
    const id = crypto.randomUUID();
    setMessages(prev => [...prev, {
      id,
      type,
      content,
      timestamp: new Date(),
      isLoading
    }]);
    return id;
  }, []);

  const updateMessage = useCallback((id: string, content: string, isLoading = false) => {
    setMessages(prev => prev.map(msg => 
      msg.id === id ? { ...msg, content, isLoading } : msg
    ));
  }, []);

  const sendMessage = async (messageText?: string) => {
    const text = messageText || input.trim();
    if (!text || isLoading) return;

    setInput('');
    addMessage(text, 'user');
    
    const loadingId = addMessage('Thinking...', 'assistant', true);
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });

      const data = await response.json();
      
      if (data.error && !data.response) {
        updateMessage(loadingId, `❌ Error: ${data.error}`, false);
      } else {
        updateMessage(loadingId, data.response || 'No response received', false);
      }
      setIsConnected(true);
    } catch (error) {
      updateMessage(loadingId, `❌ Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`, false);
      setIsConnected(false);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatContent = (content: string) => {
    // Simple markdown-like formatting
    return content
      .split('\n')
      .map((line, i) => {
        // Bold text
        line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        // Headers
        if (line.startsWith('## ')) {
          return <h3 key={i} className="text-lg font-semibold mt-2 mb-1">{line.substring(3)}</h3>;
        }
        if (line.startsWith('# ')) {
          return <h2 key={i} className="text-xl font-bold mt-2 mb-1">{line.substring(2)}</h2>;
        }
        // List items
        if (line.startsWith('- ')) {
          return <li key={i} className="ml-4" dangerouslySetInnerHTML={{ __html: line.substring(2) }} />;
        }
        // Regular lines
        return <p key={i} className="my-1" dangerouslySetInnerHTML={{ __html: line }} />;
      });
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-4 shadow-lg">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <div className="bg-white/20 p-2 rounded-lg">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold">PharmAssist</h1>
            <p className="text-blue-100 text-sm">Your AI Pharmacy Assistant</p>
          </div>
          <div className="ml-auto flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full text-sm">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
            <span>{isConnected ? 'Online' : 'Offline'}</span>
          </div>
        </div>
      </header>

      {/* Quick Actions */}
      <div className="bg-white/80 backdrop-blur border-b px-4 py-3">
        <div className="max-w-4xl mx-auto">
          <p className="text-xs text-gray-500 mb-2">Quick actions:</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {QUICK_ACTIONS.map((action, idx) => (
              <button
                key={idx}
                onClick={() => sendMessage(action.query)}
                disabled={isLoading}
                className="flex-shrink-0 px-3 py-1.5 bg-gray-100 hover:bg-blue-100 hover:text-blue-700 rounded-full text-sm transition-all disabled:opacity-50"
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.map(message => (
            <div
              key={message.id}
              className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] px-4 py-3 rounded-2xl shadow-sm ${
                  message.type === 'user'
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-br-md'
                    : message.type === 'assistant'
                    ? 'bg-white rounded-bl-md'
                    : message.type === 'error'
                    ? 'bg-red-50 border border-red-200 text-red-800'
                    : 'bg-amber-50 border border-amber-200 text-amber-800'
                } ${message.isLoading ? 'animate-pulse' : ''}`}
              >
                {message.type === 'assistant' && !message.isLoading ? (
                  <div className="text-gray-800 prose prose-sm max-w-none">
                    {formatContent(message.content)}
                  </div>
                ) : (
                  <p className={message.type === 'user' ? '' : 'text-gray-800'}>
                    {message.content}
                  </p>
                )}
                <span className={`text-xs mt-2 block ${
                  message.type === 'user' ? 'text-blue-100' : 'text-gray-400'
                }`}>
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="bg-white border-t px-4 py-4 shadow-lg">
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-3 items-end">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Describe your symptoms or ask about medicines..."
                className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-gray-900 bg-white placeholder-gray-400"
                rows={1}
                disabled={isLoading}
              />
            </div>
            <button
              onClick={() => sendMessage()}
              disabled={isLoading || !input.trim()}
              className="px-5 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
            >
              {isLoading ? (
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">
            Press Enter to send • Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}