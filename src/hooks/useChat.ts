// import { useState, useCallback, useRef, useEffect } from 'react';
// import { v4 as uuidv4 } from 'uuid';
// import { chatAPI } from '../services/api';

// export interface Message {
//   id: string;
//   role: 'user' | 'assistant';
//   content: string;
//   timestamp: Date;
//   hasDocumentContext?: boolean;
// }

// // Props interface for the hook
// export interface UseChatProps {
//   userId?: string;
//   vaultId?: string | null;
// }

// export interface UseChatReturn {
//   messages: Message[];
//   isLoading: boolean;
//   error: string | null;
//   sendMessage: (content: string) => Promise<void>;
//   clearChat: () => Promise<void>;
//   setError: React.Dispatch<React.SetStateAction<string | null>>;
// }

// // Helper to get session key based on vault
// const getSessionKey = (vaultId?: string | null): string => {
//   return vaultId ? `chatSessionId_vault_${vaultId}` : 'chatSessionId_global';
// };

// const useChat = ({ userId, vaultId }: UseChatProps = {}): UseChatReturn => {
//   const [messages, setMessages] = useState<Message[]>([]);
//   const [isLoading, setIsLoading] = useState<boolean>(false);
//   const [error, setError] = useState<string | null>(null);
//   const sessionIdRef = useRef<string | null>(null);
//   const currentVaultRef = useRef<string | null | undefined>(vaultId);

//   const addWelcomeMessage = useCallback((): void => {
//     const welcomeText = vaultId 
//       ? "Hello! 👋 I'm the AI assistant for Samaveda Capital. I can see you're viewing a specific vault - ask me anything about the documents here!"
//       : "Hello! 👋 I'm the AI assistant for Samaveda Capital. I can help you understand M&A concepts, answer questions about documents in your dataroom, and explain investment banking terms. What would you like to know?";
    
//     setMessages([{
//       id: uuidv4(),
//       role: 'assistant',
//       content: welcomeText,
//       timestamp: new Date(),
//     }]);
//   }, [vaultId]);

//   const loadChatHistory = useCallback(async (sessionId: string): Promise<void> => {
//     try {
//       const response = await chatAPI.getChatHistory(sessionId);
//       if (response.success && response.messages.length > 0) {
//         setMessages(response.messages.map(msg => ({
//           id: uuidv4(),
//           role: msg.role,
//           content: msg.content,
//           timestamp: new Date(msg.timestamp),
//         })));
//       } else {
//         addWelcomeMessage();
//       }
//     } catch (err) {
//       console.error('Failed to load chat history:', err);
//       addWelcomeMessage();
//     }
//   }, [addWelcomeMessage]);

//   // Initialize session - runs when vaultId changes
//   useEffect(() => {
//     const sessionKey = getSessionKey(vaultId);
//     const storedSessionId = localStorage.getItem(sessionKey);
    
//     // Check if vault changed
//     const vaultChanged = currentVaultRef.current !== vaultId;
//     currentVaultRef.current = vaultId;

//     if (storedSessionId && !vaultChanged) {
//       sessionIdRef.current = storedSessionId;
//       loadChatHistory(storedSessionId);
//     } else {
//       // New vault or no session - create new session
//       const newSessionId = uuidv4();
//       sessionIdRef.current = newSessionId;
//       localStorage.setItem(sessionKey, newSessionId);
//       addWelcomeMessage();
//     }
//   }, [vaultId, addWelcomeMessage, loadChatHistory]);

//   // Reset chat when vault changes
//   useEffect(() => {
//     if (currentVaultRef.current !== vaultId) {
//       const sessionKey = getSessionKey(vaultId);
//       const storedSessionId = localStorage.getItem(sessionKey);
      
//       if (storedSessionId) {
//         sessionIdRef.current = storedSessionId;
//         loadChatHistory(storedSessionId);
//       } else {
//         const newSessionId = uuidv4();
//         sessionIdRef.current = newSessionId;
//         localStorage.setItem(sessionKey, newSessionId);
//         addWelcomeMessage();
//       }
//       currentVaultRef.current = vaultId;
//     }
//   }, [vaultId, addWelcomeMessage, loadChatHistory]);

//   const sendMessage = useCallback(async (content: string): Promise<void> => {
//     if (!content.trim() || isLoading) return;

//     const userMessage: Message = {
//       id: uuidv4(),
//       role: 'user',
//       content: content.trim(),
//       timestamp: new Date(),
//     };

//     setMessages(prev => [...prev, userMessage]);
//     setIsLoading(true);
//     setError(null);

//     try {
//       const response = await chatAPI.sendMessage(
//         content, 
//         sessionIdRef.current!, 
//         vaultId || undefined
//       );
      
//       if (response.success && response.message) {
//         const assistantMessage: Message = {
//           id: uuidv4(),
//           role: 'assistant',
//           content: response.message,
//           timestamp: new Date(),
//           hasDocumentContext: response.hasDocumentContext,
//         };
//         setMessages(prev => [...prev, assistantMessage]);
//       } else {
//         throw new Error(response.error || 'Failed to get response');
//       }
//     } catch (err) {
//       setError('Failed to send message. Please try again.');
//       console.error('Send message error:', err);
//     } finally {
//       setIsLoading(false);
//     }
//   }, [isLoading, vaultId]);

//   const clearChat = useCallback(async (): Promise<void> => {
//     try {
//       if (sessionIdRef.current) {
//         await chatAPI.clearChat(sessionIdRef.current);
//       }
//       const sessionKey = getSessionKey(vaultId);
//       const newSessionId = uuidv4();
//       sessionIdRef.current = newSessionId;
//       localStorage.setItem(sessionKey, newSessionId);
//       addWelcomeMessage();
//     } catch (err) {
//       console.error('Failed to clear chat:', err);
//     }
//   }, [addWelcomeMessage, vaultId]);

//   return {
//     messages,
//     isLoading,
//     error,
//     sendMessage,
//     clearChat,
//     setError,
//   };
// };

// export default useChat;

import { useState, useCallback, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { chatAPI } from '../services/api';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  hasDocumentContext?: boolean;
}

// Props interface for the hook
export interface UseChatProps {
  userId?: string;
  vaultId?: string | null;
}

export interface UseChatReturn {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<void>;
  clearChat: () => Promise<void>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}

// Helper to get session key based on vault
const getSessionKey = (vaultId?: string | null): string => {
  return vaultId ? `chatSessionId_vault_${vaultId}` : 'chatSessionId_global';
};

const useChat = ({ userId, vaultId }: UseChatProps = {}): UseChatReturn => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  
  // Store current vaultId in ref for sendMessage
  const vaultIdRef = useRef<string | null | undefined>(vaultId);
  
  // Update ref when vaultId changes
  useEffect(() => {
    vaultIdRef.current = vaultId;
  }, [vaultId]);

  const addWelcomeMessage = useCallback((isDocumentMode: boolean): void => {
    const welcomeText = isDocumentMode 
      ? "Hello! 👋 I'm Veda, the AI assistant for Samaveda Capital. I can see you're viewing a specific vault, ask me anything about the documents here!"
      : "Hello! 👋 I'm Veda, the AI assistant for Samaveda Capital. I can help you understand investment banking concepts, answer questions about documents in your data room, and explain key financial terms. What would you like to know?";
    
    setMessages([{
      id: uuidv4(),
      role: 'assistant',
      content: welcomeText,
      timestamp: new Date(),
    }]);
  }, []);

  const loadChatHistory = useCallback(async (sessionId: string, isDocumentMode: boolean): Promise<void> => {
    try {
      const response = await chatAPI.getChatHistory(sessionId);
      if (response.success && response.messages.length > 0) {
        setMessages(response.messages.map(msg => ({
          id: uuidv4(),
          role: msg.role,
          content: msg.content,
          timestamp: new Date(msg.timestamp),
        })));
      } else {
        addWelcomeMessage(isDocumentMode);
      }
    } catch (err) {
      console.error('Failed to load chat history:', err);
      addWelcomeMessage(isDocumentMode);
    }
  }, [addWelcomeMessage]);

  // Initialize/reset session when vaultId changes (including toggle)
  useEffect(() => {
    const sessionKey = getSessionKey(vaultId);
    const storedSessionId = localStorage.getItem(sessionKey);
    const isDocumentMode = !!vaultId;

    console.log('🔄 useChat: vaultId changed to:', vaultId, '| Document mode:', isDocumentMode);

    if (storedSessionId) {
      sessionIdRef.current = storedSessionId;
      loadChatHistory(storedSessionId, isDocumentMode);
    } else {
      const newSessionId = uuidv4();
      sessionIdRef.current = newSessionId;
      localStorage.setItem(sessionKey, newSessionId);
      addWelcomeMessage(isDocumentMode);
    }
  }, [vaultId, addWelcomeMessage, loadChatHistory]);

  const sendMessage = useCallback(async (content: string): Promise<void> => {
    if (!content.trim() || isLoading) return;

    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);

    try {
      // Use ref to get current vaultId (handles toggle changes)
      const currentVaultId = vaultIdRef.current;
      console.log('📤 Sending message with vaultId:', currentVaultId);
      
      const response = await chatAPI.sendMessage(
        content, 
        sessionIdRef.current!, 
        currentVaultId || undefined
      );
      
      if (response.success && response.message) {
        const assistantMessage: Message = {
          id: uuidv4(),
          role: 'assistant',
          content: response.message,
          timestamp: new Date(),
          hasDocumentContext: response.hasDocumentContext,
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        throw new Error(response.error || 'Failed to get response');
      }
    } catch (err) {
      setError('Failed to send message. Please try again.');
      console.error('Send message error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  const clearChat = useCallback(async (): Promise<void> => {
    try {
      if (sessionIdRef.current) {
        await chatAPI.clearChat(sessionIdRef.current);
      }
      const currentVaultId = vaultIdRef.current;
      const sessionKey = getSessionKey(currentVaultId);
      const newSessionId = uuidv4();
      sessionIdRef.current = newSessionId;
      localStorage.setItem(sessionKey, newSessionId);
      addWelcomeMessage(!!currentVaultId);
    } catch (err) {
      console.error('Failed to clear chat:', err);
    }
  }, [addWelcomeMessage]);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearChat,
    setError,
  };
};

export default useChat;