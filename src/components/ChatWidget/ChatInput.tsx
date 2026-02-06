import React, { useState, useRef, useEffect, FormEvent } from 'react';
import { SendIcon, LoadingSpinner } from '../Icons/Icons';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  disabled?: boolean;
}

const ChatInput: React.FC<ChatInputProps> = ({ onSend, isLoading, disabled = false }) => {
  const [message, setMessage] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isLoading && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isLoading]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (message.trim() && !isLoading && !disabled) {
      onSend(message);
      setMessage('');
    }
  };

  const quickQuestions: string[] = ['About Us', 'Founding Team', 'Investment Sectors'];

  return (
    <div className="p-3 bg-white border-t border-slate-200">
      <form onSubmit={handleSubmit}>
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enter your message..."
              disabled={isLoading || disabled}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm
                         text-slate-800 placeholder:text-slate-400
                         focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all duration-200"
            />
          </div>
          <button
            type="submit"
            disabled={!message.trim() || isLoading || disabled}
            className="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 
                       text-white flex items-center justify-center
                       hover:from-amber-600 hover:to-yellow-600 
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transform hover:scale-105 active:scale-95
                       transition-all duration-200 shadow-md cursor-pointer"
          >
            {isLoading ? (
              <LoadingSpinner className="w-4 h-4" />
            ) : (
              <SendIcon className="w-4 h-4" />
            )}
          </button>
        </div>
      </form>

      {/* Quick Questions */}
      <div className="flex gap-1.5 mt-2 flex-wrap">
        {quickQuestions.map((question) => (
          <button
            key={question}
            type="button"
            onClick={() => onSend(question)}
            disabled={isLoading}
            className="px-2.5 py-1 text-xs bg-slate-100 text-slate-600 rounded-full
                       hover:bg-amber-50 hover:text-amber-700 border border-slate-200
                       hover:border-amber-200
                       transition-colors duration-200 disabled:opacity-50 cursor-pointer font-medium"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  );
};

export default ChatInput;