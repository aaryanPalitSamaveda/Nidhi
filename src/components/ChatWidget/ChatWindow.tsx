import React, { useState, useRef, useEffect } from "react";
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import FinancialTerms from './FinancialTerms';
import FeedbackForm from './FeedbackForm';
import {
  MinimizeIcon,
  RefreshIcon,
  ChatIcon,
  BookIcon,
  FeedbackIcon,
  SparkleIcon,
} from '../Icons/Icons';
import useChat from '../../hooks/useChat';

interface Tab {
  id: 'chat' | 'terms' | 'feedback';
  label: string;
  icon: React.FC<{ className?: string }>;
}

interface ChatWindowProps {
  onClose: () => void;
  userId?: string;
  vaultId?: string | null;
}

const tabs: Tab[] = [
  { id: 'chat', label: 'Chat', icon: ChatIcon },
  { id: 'terms', label: 'IB Terms', icon: BookIcon },
  { id: 'feedback', label: 'Feedback', icon: FeedbackIcon },
];

const ChatWindow: React.FC<ChatWindowProps> = ({ onClose, userId, vaultId }) => {
  const [activeTab, setActiveTab] = useState<'chat' | 'terms' | 'feedback'>('chat');
  const [useDocuments, setUseDocuments] = useState<boolean>(true); // Toggle state
  
  // Pass useDocuments to useChat - when false, don't send vaultId
  const effectiveVaultId = useDocuments ? vaultId : null;
  const { messages, isLoading, error, sendMessage, clearChat, setError } = useChat({ 
    userId, 
    vaultId: effectiveVaultId 
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = (): void => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl overflow-hidden shadow-2xl border border-slate-200">
      {/* Header - Gold gradient */}
      <div className="bg-gradient-to-r from-amber-600 via-yellow-500 to-amber-500 p-3 text-white shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <SparkleIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[15px] text-white/90 font-medium">
                Veda
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {activeTab === 'chat' && (
              <button
                onClick={clearChat}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors cursor-pointer"
                title="Clear chat"
              >
                <RefreshIcon className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors cursor-pointer"
              title="Minimize"
            >
              <MinimizeIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex mt-3 bg-white/10 rounded-lg p-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-medium transition-all duration-200 cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-white text-amber-600 shadow-sm'
                    : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Document Toggle - Only show when on a vault page */}
      {vaultId && activeTab === 'chat' && (
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${useDocuments ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`} />
              <span className="text-xs font-medium text-slate-600">
                {useDocuments ? 'Reading documents' : 'General IB assistant'}
              </span>
            </div>
            
            {/* Toggle Switch */}
            <div
              onClick={() => setUseDocuments(!useDocuments)}
              className={`relative w-9 h-5 rounded-full transition-colors duration-200 flex-shrink-0 cursor-pointer flex items-center ${
                useDocuments ? 'bg-green-500' : 'bg-slate-300'
              }`}
              title={useDocuments ? 'Switch to General Mode' : 'Switch to Document Mode'}
            >
              <span
                className={`absolute w-3.5 h-3.5 bg-white rounded-full shadow-md transition-all duration-200 ${
                  useDocuments ? 'left-[18px]' : 'left-[3px]'
                }`}
              />
            </div>
          </div>
        </div>
      )}

      {/* Content Area - Light background */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-slate-50">
        {/* Chat Tab */}
        {activeTab === 'chat' && (
          <>
            {/* Messages Container */}
            <div className="flex-1 overflow-y-auto p-4 min-h-0 chat-scrollbar-light">
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}

              {/* Typing Indicator */}
              {isLoading && (
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-yellow-500 flex items-center justify-center shrink-0 shadow-md">
                    <SparkleIcon className="w-4 h-4 text-white" />
                  </div>
                  <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                  {error}
                  <button
                    onClick={() => setError(null)}
                    className="ml-2 underline hover:no-underline cursor-pointer font-medium"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Chat Input */}
            <div className="shrink-0">
              <ChatInput onSend={sendMessage} isLoading={isLoading} />
            </div>
          </>
        )}

        {/* M&A Terms Tab */}
        {activeTab === 'terms' && (
          <div className="flex-1 overflow-y-auto min-h-0">
            <FinancialTerms />
          </div>
        )}

        {/* Feedback Tab */}
        {activeTab === 'feedback' && (
          <div className="flex-1 overflow-y-auto min-h-0">
            <FeedbackForm />
          </div>
        )}
      </div>

      {/* Footer - Light */}
      <div className="px-3 py-2 bg-slate-100 border-t border-slate-200 shrink-0">
        <div className="flex flex-row items-center justify-between w-full">
          <span className="text-[10px] font-medium text-slate-500">
            
          </span>
          <a 
            href="https://www.samavedacapital.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-[10px] font-medium text-amber-600 hover:text-amber-700 hover:underline cursor-pointer"
          >
            samavedacapital.com
          </a>
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;