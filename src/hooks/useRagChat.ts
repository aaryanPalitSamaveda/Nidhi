import { useState, useCallback, useRef } from 'react';
import { ragAPI, ChatMessage, ChatSession, DocumentSource } from '../services/ragApi';

interface UseRagChatProps {
  vaultId: string;
}

interface UseRagChatReturn {
  messages: ChatMessage[];
  sessions: ChatSession[];
  currentSession: ChatSession | null;
  isLoading: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<void>;
  loadSessions: () => Promise<void>;
  selectSession: (session: ChatSession) => Promise<void>;
  createNewSession: () => void;
  deleteSession: (sessionId: string) => Promise<void>;
  clearError: () => void;
}

export const useRagChat = ({ vaultId }: UseRagChatProps): UseRagChatReturn => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      const response = await ragAPI.getSessions(vaultId);
      if (response.success) {
        setSessions(response.sessions);
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  }, [vaultId]);

  const selectSession = useCallback(async (session: ChatSession) => {
    setCurrentSession(session);
    setIsLoading(true);
    try {
      const response = await ragAPI.getMessages(session.id);
      if (response.success) {
        setMessages(response.messages);
      }
    } catch (err) {
      setError('Failed to load messages');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createNewSession = useCallback(() => {
    setCurrentSession(null);
    setMessages([]);
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      await ragAPI.deleteSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (currentSession?.id === sessionId) {
        createNewSession();
      }
    } catch (err) {
      setError('Failed to delete session');
    }
  }, [currentSession, createNewSession]);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    // Add optimistic user message
    const userMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      session_id: currentSession?.id || '',
      role: 'user',
      content,
      sources: [],
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);

    try {
      const response = await ragAPI.chat(vaultId, content, currentSession?.id);
      
      if (response.success && response.message) {
        // Update session if new
        if (response.sessionId && !currentSession) {
          const newSession: ChatSession = {
            id: response.sessionId,
            vault_id: vaultId,
            user_id: '',
            title: content.slice(0, 50),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          setCurrentSession(newSession);
          setSessions(prev => [newSession, ...prev]);
        }

        // Add assistant message
        const assistantMessage: ChatMessage = {
          id: `msg-${Date.now()}`,
          session_id: response.sessionId || currentSession?.id || '',
          role: 'assistant',
          content: response.message,
          sources: response.sources || [],
          created_at: new Date().toISOString()
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        throw new Error(response.error || 'Failed to get response');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to send message');
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => m.id !== userMessage.id));
    } finally {
      setIsLoading(false);
    }
  }, [vaultId, currentSession, isLoading]);

  const clearError = useCallback(() => setError(null), []);

  return {
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
  };
};