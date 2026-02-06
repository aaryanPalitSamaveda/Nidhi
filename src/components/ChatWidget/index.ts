// Chat Components - Export all chat-related components
export { default as ChatWidget } from './ChatWidget';
export { default as ChatWindow } from './ChatWindow';
export { default as ChatMessage } from './ChatMessage';
export { default as ChatInput } from './ChatInput';
export { default as FeedbackForm } from './FeedbackForm';
export { default as FinancialTerms } from './FinancialTerms';

// Re-export types
export type { Message, UseChatReturn } from '../../hooks/useChat';