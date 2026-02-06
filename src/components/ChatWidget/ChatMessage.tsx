import React from "react";
import ReactMarkdown from 'react-markdown';
import { SparkleIcon } from '../Icons/Icons';
import type { Message } from '../../hooks/useChat';

interface ChatMessageProps {
  message: Message;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      {/* Bot Avatar */}
      {!isUser && (
        <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-yellow-500 flex items-center justify-center mr-2 shadow-md">
          <SparkleIcon className="w-4 h-4 text-white" />
        </div>
      )}

      {/* Message Bubble */}
      <div className={`max-w-[80%] ${isUser ? 'order-1' : 'order-2'}`}>
        <div
          className={`px-4 py-3 rounded-2xl ${
            isUser
              ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-white rounded-br-md shadow-md'
              : 'bg-white border border-slate-200 text-slate-800 rounded-bl-md shadow-sm'
          }`}
        >
          {/* Markdown Rendered Content */}
          <div className="text-sm leading-relaxed">
            <ReactMarkdown
              components={{
                p: ({ children }) => (
                  <p className={`mb-2 last:mb-0 ${isUser ? 'text-white' : 'text-slate-700'}`}>
                    {children}
                  </p>
                ),
                strong: ({ children }) => (
                  <strong className={`font-bold ${isUser ? 'text-white' : 'text-slate-900'}`}>
                    {children}
                  </strong>
                ),
                ul: ({ children }) => (
                  <ul className="list-none space-y-1 my-2">{children}</ul>
                ),
                li: ({ children }) => (
                  <li className={`flex items-start gap-2 ${isUser ? 'text-white' : 'text-slate-700'}`}>
                    <span className={`inline-block w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${
                      isUser ? 'bg-white/70' : 'bg-amber-500'
                    }`} />
                    <span>{children}</span>
                  </li>
                ),
                a: ({ href, children }) => (
                  <a 
                    href={href} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className={`underline ${isUser ? 'text-white' : 'text-amber-600 hover:text-amber-700'}`}
                  >
                    {children}
                  </a>
                ),
                code: ({ children }) => (
                  <code className={`px-1 py-0.5 rounded text-xs ${
                    isUser ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-800'
                  }`}>
                    {children}
                  </code>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        </div>
        
        {/* Timestamp */}
        <p className={`text-xs mt-1 text-slate-400 ${isUser ? 'text-right' : 'text-left'}`}>
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
          })}
        </p>
      </div>

      {/* User Avatar */}
      {isUser && (
        <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center ml-2 shadow-md">
          <span className="text-white text-xs font-semibold">U</span>
        </div>
      )}
    </div>
  );
};

export default ChatMessage;