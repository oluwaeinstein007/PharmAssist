'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface Message {
  id: string;
  type: 'user' | 'assistant' | 'system' | 'error';
  content: string;
  timestamp: Date;
  isLoading?: boolean;
}

interface ProductOption {
  barcode: string;
  name: string;
  price: number;
  available: number;
}

const QUICK_ACTIONS = [
  { label: '🔍 Search Paracetamol', query: 'search for paracetamol' },
  { label: '🤒 Fever Medicine', query: 'I have fever, what medicine should I take?' },
  { label: '🤕 Headache Relief', query: 'I have a headache' },
  { label: '🦟 Malaria Treatment', query: 'I have malaria with fever' },
  { label: '📦 Check Stock', query: 'Is amoxicillin in stock?' },
  { label: '💊 Antibiotics', query: 'Find antibiotics' },
];

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      type: 'system',
      content: `👋 Welcome to PharmAssist!

**How it works:**
• Just tell me what you need: "Find paracetamol" or "I want 2 paracetamol"
• Click a product to select it
• Confirm quantity and that's it!

No barcodes, no complicated steps. Just simple medicine ordering! 🚀`,
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState<{
    barcode: string;
    name: string;
    available: number;
    quantity: number | null;
    messageId: string;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const quantityInputRef = useRef<HTMLInputElement>(null);

  // Check API connection on mount
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const response = await fetch('/api/chat');
        if (response.ok) {
          setIsConnected(true);
        }
      } catch (error) {
        console.error('API connection check failed:', error);
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

  const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  const addMessage = useCallback((content: string, type: Message['type'], isLoading = false) => {
    const id = generateUUID();
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

  const extractProducts = (content: string): ProductOption[] => {
    const products: ProductOption[] = [];
    const productBlocks = content.split(/\n(?=\d+\.)/);
    
    for (const block of productBlocks) {
      // Match product name with or without bold formatting
      let nameMatch = block.match(/\d+\.\s*\*\*([^*]+)\*\*/);
      if (!nameMatch) {
        // Try without bold formatting
        nameMatch = block.match(/\d+\.\s*([^\n]+)/);
      }
      
      const barcodeMatch = block.match(/Barcode:\s*([^\n]+)/);
      const priceMatch = block.match(/Price:\s*[₦N]?([\d.]+)/);
      const quantityMatch = block.match(/Available:\s*(\d+)\s*units/);

      if (nameMatch && barcodeMatch) {
        const productName = nameMatch[1].trim().replace(/\*\*/g, '');
        const barcode = barcodeMatch[1].trim();
        
        products.push({
          barcode: barcode,
          name: productName,
          price: parseFloat(priceMatch?.[1] || '0'),
          available: parseInt(quantityMatch?.[1] || '0'),
        });
      }
    }

    return products;
  };

  const extractQuantityFromText = (text: string): number | null => {
    // Match patterns like "2 paracetamol", "3x aspirin", "buy 5", etc.
    const matches = text.match(/(?:^|[^\d])(\d+)\s*(?:x|of|tabs?|pills?)?(?:\s|$)/i);
    return matches ? parseInt(matches[1]) : null;
  };

  const handleProductSelect = (product: ProductOption, userQuantity?: number) => {
    if (userQuantity && userQuantity > 0) {
      // User mentioned quantity, show confirmation button
      if (userQuantity > product.available) {
        addMessage(`⚠️ Only ${product.available} units available. Would you like to order that instead?`, 'assistant');
        userQuantity = product.available;
      }
      
      const messageId = generateUUID();
      setAwaitingConfirmation({
        barcode: product.barcode,
        name: product.name,
        available: product.available,
        quantity: userQuantity,
        messageId
      });

      addMessage(
        `✅ Selected: **${product.name}** @ ₦${product.price}\n\nReady to order ${userQuantity} unit${userQuantity > 1 ? 's' : ''}?`,
        'system'
      );
    } else {
      // No quantity mentioned, ask for it
      addMessage(`✅ Selected: **${product.name}** @ ₦${product.price}\n\n**${product.available} units available**`, 'system');
      
      const messageId = generateUUID();
      setAwaitingConfirmation({
        barcode: product.barcode,
        name: product.name,
        available: product.available,
        quantity: null,
        messageId
      });
    }
  };

  const handleConfirmOrder = async () => {
    if (!awaitingConfirmation) return;

    const { barcode, name, quantity } = awaitingConfirmation;
    addMessage(`Confirming order for ${quantity}x ${name}...`, 'user');
    const loadingId = addMessage('Processing your order...', 'assistant', true);
    setIsLoading(true);
    setAwaitingConfirmation(null);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Create cart with barcode ${barcode} qty ${quantity}`
        })
      });

      const data = await response.json();
      
      if (data.error && !data.response) {
        updateMessage(loadingId, `❌ Error: ${data.error}`, false);
      } else {
        updateMessage(loadingId, data.response || '✅ Order created successfully!', false);
      }
      setIsConnected(true);
    } catch (error) {
      updateMessage(loadingId, `❌ Failed: ${error instanceof Error ? error.message : 'Unknown error'}`, false);
      setIsConnected(false);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleQuantitySubmit = (quantity: string) => {
    const qty = parseInt(quantity);
    if (!awaitingConfirmation || qty <= 0) {
      addMessage('❌ Please enter a valid quantity', 'error');
      return;
    }

    const { barcode, name, available } = awaitingConfirmation;
    if (qty > available) {
      addMessage(`⚠️ Only ${available} units available. Max allowed: ${available}`, 'error');
      return;
    }

    // Update confirmation with actual quantity - this triggers the confirmation UI directly
    setAwaitingConfirmation(prev => 
      prev ? { ...prev, quantity: qty } : null
    );
  };

  const sendMessage = async (messageText?: string) => {
    if (awaitingConfirmation) {
      // User is entering quantity
      const text = messageText || input.trim();
      if (!text) return;

      setInput('');
      handleQuantitySubmit(text);
      return;
    }

    const text = messageText || input.trim();
    if (!text || isLoading) return;

    setInput('');
    addMessage(text, 'user');
    
    // Extract quantity from user input
    const mentionedQuantity = extractQuantityFromText(text);
    
    const loadingId = addMessage('Searching...', 'assistant', true);
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });

      const data = await response.json();
      const responseText = data.response || 'No response received';
      
      if (data.error && !data.response) {
        updateMessage(loadingId, `❌ Error: ${data.error}`, false);
      } else {
        updateMessage(loadingId, responseText, false);

        // Auto-select if user mentioned quantity and there's only one product
        const products = extractProducts(responseText);
        if (mentionedQuantity && products.length === 1) {
          // Auto-select the single product with mentioned quantity
          setTimeout(() => {
            handleProductSelect(products[0], mentionedQuantity);
          }, 500);
        } else if (products.length === 1 && !mentionedQuantity) {
          // Single product found, ask for quantity
          setTimeout(() => {
            handleProductSelect(products[0]);
          }, 500);
        }
      }
      setIsConnected(true);
    } catch (error) {
      updateMessage(loadingId, `❌ Failed: ${error instanceof Error ? error.message : 'Unknown error'}`, false);
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
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    
    return content
      .split('\n')
      .map((line, i) => {
        line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        if (line.startsWith('## ')) {
          return <h3 key={i} className="text-lg font-semibold mt-2 mb-1">{line.substring(3)}</h3>;
        }
        if (line.startsWith('# ')) {
          return <h2 key={i} className="text-xl font-bold mt-2 mb-1">{line.substring(2)}</h2>;
        }
        if (line.startsWith('- ')) {
          return <li key={i} className="ml-4" dangerouslySetInnerHTML={{ __html: line.substring(2) }} />;
        }
        
        // Check if line contains a URL
        const urlMatch = line.match(urlRegex);
        if (urlMatch) {
          const parts = line.split(urlRegex);
          return (
            <div key={i} className="my-2">
              <p className="text-sm text-gray-800 mb-2">
                {parts.map((part, idx) => 
                  part.match(urlRegex) ? null : <span key={idx}>{part}</span>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                {urlMatch.map((url, idx) => (
                  <a
                    key={idx}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg font-semibold transition-all shadow-md hover:shadow-lg text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Complete Purchase
                  </a>
                ))}
              </div>
            </div>
          );
        }
        
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
                disabled={isLoading || !!awaitingConfirmation}
                className="flex-shrink-0 px-3 py-1.5 bg-gray-100 hover:bg-blue-100 hover:text-blue-700 rounded-full text-sm text-black transition-all disabled:opacity-50"
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
          {messages.map((message) => {
            const products = message.type === 'assistant' ? extractProducts(message.content) : [];
            
            return (
              <div key={message.id}>
                <div className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
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

                {/* Product Selection Buttons - Always Visible */}
                {products.length > 0 && (
                  <div className="flex justify-start mt-4 flex-wrap gap-2 w-full">
                    <div className="w-full mb-2">
                      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Pick an option:</p>
                    </div>
                    {products.map((product, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleProductSelect(product)}
                        disabled={isLoading}
                        className="flex-1 min-w-[200px] px-3 py-2 bg-white hover:bg-blue-50 border-2 border-blue-300 hover:border-blue-600 text-left rounded-lg text-xs transition-all shadow-md hover:shadow-lg disabled:opacity-50 font-medium text-gray-800 hover:text-blue-700"
                      >
                        <div className="font-bold text-blue-600 text-sm">{product.name}</div>
                        <div className="text-xs text-gray-600 mt-0.5">₦{product.price.toLocaleString()} • {product.available} units</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input / Confirmation Area */}
      <div className="bg-white border-t px-4 py-4 shadow-lg">
        <div className="max-w-4xl mx-auto">
          {awaitingConfirmation ? (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-400 rounded-xl p-5 mb-4 shadow-lg">
              {awaitingConfirmation.quantity === null ? (
                <>
                  <p className="text-sm font-semibold text-gray-800 mb-4">
                    📦 How many units of <span className="text-blue-700">{awaitingConfirmation.name}</span> do you want?
                  </p>
                  <div className="flex gap-2">
                    <input
                      ref={quantityInputRef}
                      type="number"
                      min="1"
                      defaultValue="1"
                      autoFocus
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          handleQuantitySubmit(e.currentTarget.value);
                        }
                      }}
                      placeholder="Enter quantity"
                      className="flex-1 px-4 py-3 border-2 border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-gray-900 font-semibold text-lg"
                    />
                    <button
                      onClick={() => {
                        if (quantityInputRef.current) {
                          handleQuantitySubmit(quantityInputRef.current.value);
                        }
                      }}
                      className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all shadow-md font-semibold"
                    >
                      Next →
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-4 p-3 bg-white rounded-lg border border-blue-200">
                    <p className="text-xs text-gray-600 font-semibold uppercase tracking-wide">Order Summary</p>
                    <p className="text-lg font-bold text-gray-800 mt-2">
                      {awaitingConfirmation.quantity}x {awaitingConfirmation.name}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleConfirmOrder}
                      disabled={isLoading}
                      className="flex-1 px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 font-bold text-lg"
                    >
                      {isLoading ? '⏳ Processing...' : '✅ Confirm & Order'}
                    </button>
                    <button
                      onClick={() => {
                        setAwaitingConfirmation(null);
                      }}
                      disabled={isLoading}
                      className="px-4 py-3 bg-gray-400 hover:bg-gray-500 text-white rounded-lg transition-all disabled:opacity-50 font-semibold"
                    >
                      ← Back
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : null}

          <div className="flex gap-3 items-end">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder={awaitingConfirmation ? "Enter quantity..." : "Find medicines... e.g., 'paracetamol' or 'I want 2 aspirin'"}
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
            Press Enter to send
          </p>
        </div>
      </div>
    </div>
  );
}
