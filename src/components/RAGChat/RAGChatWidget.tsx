import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRagChat } from '../../hooks/useRagChat';
import { ChatMessage, DocumentSource } from '../../services/ragApi';
import ReactMarkdown from 'react-markdown';
import { 
  MessageSquare, Send, Plus, Trash2, ChevronLeft, 
  FileText, Sparkles, X, Loader2, BookOpen 
} from 'lucide-react';

interface RAGChatWidgetProps {
  vaultId: string;
  vaultName?: string;
  onClose?: () => void;
}

const RAGChatWidget: React.FC<RAGChatWidgetProps> = ({ vaultId, vaultName, onClose }) => {
  const {
    messages,
    sessions,
    currentSession,
    isLoading,
    error,
    sendMessage,
    loadSessions,
    selectSession,
    createNewSession,
    deleteSession,
    clearError
  } = useRagChat({ vaultId });

  const [input, setInput] = useState('');
  const [showSidebar, setShowSidebar] = useState(true);
  const [expandedSources, setExpandedSources] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      sendMessage(input);
      setInput('');
    }
  };

  const toggleSources = (messageId: string) => {
    setExpandedSources(prev => prev === messageId ? null : messageId);
  };

  return (
    <div className="flex h-full bg-white rounded-2xl overflow-hidden shadow-2xl border border-slate-200">
      {/* Sidebar - Chat Sessions */}
      <AnimatePresence>
        {showSidebar && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="border-r border-slate-200 bg-slate-50 flex flex-col"
          >
            <div className="p-4 border-b border-slate-200">
              <button
                onClick={createNewSession}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 
                         bg-gradient-to-r from-amber-500 to-yellow-500 text-white 
                         rounded-xl font-medium hover:from-amber-600 hover:to-yellow-600 
                         transition-all shadow-md"
              >
                <Plus className="w-4 h-4" />
                New Chat
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2">
              {sessions.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">No chat history</p>
              ) : (
                sessions.map(session => (
                  <div
                    key={session.id}
                    className={`group flex items-center gap-2 p-3 rounded-xl cursor-pointer mb-1
                              transition-all ${currentSession?.id === session.id 
                                ? 'bg-amber-100 text-amber-800' 
                                : 'hover:bg-slate-100'}`}
                    onClick={() => selectSession(session)}
                  >
                    <MessageSquare className="w-4 h-4 shrink-0" />
                    <span className="flex-1 truncate text-sm">{session.title}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 
                               rounded-lg transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-slate-200 bg-gradient-to-r from-amber-500 to-yellow-500 text-white">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <ChevronLeft className={`w-5 h-5 transition-transform ${showSidebar ? '' : 'rotate-180'}`} />
          </button>
          
          <div className="flex items-center gap-2 flex-1">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Document Assistant</h3>
              <p className="text-xs text-white/80">{vaultName || 'Ask questions about your documents'}</p>
            </div>
          </div>
          
          {onClose && (
            <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mb-4">
                <BookOpen className="w-8 h-8 text-amber-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-700 mb-2">Ask About Your Documents</h3>
              <p className="text-sm text-slate-500 max-w-sm">
                I can answer questions based on the documents in this vault. 
                Try asking about specific topics, data, or summaries.
              </p>
              <div className="flex flex-wrap gap-2 mt-4 max-w-md justify-center">
                {['Summarize the key points', 'What are the main financials?', 'List important dates'].map(q => (
                  <button
                    key={q}
                    onClick={() => setInput(q)}
                    className="px-3 py-1.5 text-xs bg-white border border-slate-200 
                             rounded-full hover:border-amber-300 hover:bg-amber-50 transition-all"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] ${message.role === 'user' ? 'order-1' : ''}`}>
                <div className={`px-4 py-3 rounded-2xl ${
                  message.role === 'user'
                    ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-white rounded-br-md'
                    : 'bg-white border border-slate-200 text-slate-800 rounded-bl-md shadow-sm'
                }`}>
                  <div className="text-sm leading-relaxed prose prose-sm max-w-none">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                </div>

                {/* Sources */}
                {message.role === 'assistant' && message.sources && message.sources.length > 0 && (
                  <div className="mt-2">
                    <button
                      onClick={() => toggleSources(message.id)}
                      className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700"
                    >
                      <FileText className="w-3 h-3" />
                      {message.sources.length} source{message.sources.length > 1 ? 's' : ''}
                      <ChevronLeft className={`w-3 h-3 transition-transform ${
                        expandedSources === message.id ? 'rotate-90' : '-rotate-90'
                      }`} />
                    </button>
                    
                    <AnimatePresence>
                      {expandedSources === message.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-2 space-y-2">
                            {message.sources.map((source, idx) => (
                              <div key={idx} className="p-2 bg-amber-50 border border-amber-200 rounded-lg">
                                <div className="flex items-center gap-2 mb-1">
                                  <FileText className="w-3 h-3 text-amber-600" />
                                  <span className="text-xs font-medium text-amber-800">{source.document_name}</span>
                                  <span className="text-xs text-amber-600 ml-auto">
                                    {(source.similarity * 100).toFixed(0)}% match
                                  </span>
                                </div>
                                <p className="text-xs text-slate-600 line-clamp-2">{source.chunk_content}</p>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                <p className={`text-xs mt-1 text-slate-400 ${message.role === 'user' ? 'text-right' : ''}`}>
                  {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-yellow-500 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                  <span className="text-sm text-slate-500">Searching documents...</span>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm flex items-center justify-between">
              {error}
              <button onClick={clearError} className="text-red-500 hover:text-red-700">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="p-4 border-t border-slate-200 bg-white">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your documents..."
              disabled={isLoading}
              className="flex-1 px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm
                       focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100
                       disabled:opacity-50 transition-all"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="w-12 h-12 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 
                       text-white flex items-center justify-center
                       hover:from-amber-600 hover:to-yellow-600 
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all shadow-md"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RAGChatWidget;