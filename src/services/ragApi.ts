import axios from 'axios';
import { supabase } from '@/integrations/supabase/client';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // Longer timeout for RAG operations
});

// Add auth token to requests
api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

// Types
export interface ChatSession {
  id: string;
  vault_id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  sources: DocumentSource[];
  created_at: string;
}

export interface DocumentSource {
  document_id: string;
  document_name: string;
  chunk_content: string;
  similarity: number;
}

export interface RagChatResponse {
  success: boolean;
  message?: string;
  sources?: DocumentSource[];
  sessionId?: string;
  hasContext?: boolean;
  error?: string;
}

// API Functions
export const ragAPI = {
  // Index a document for RAG
  indexDocument: async (documentId: string): Promise<{ success: boolean; chunksCreated?: number }> => {
    const response = await api.post('/rag/index', { documentId });
    return response.data;
  },

  // Create chat session
  createSession: async (vaultId: string, title?: string): Promise<{ success: boolean; session?: ChatSession }> => {
    const response = await api.post('/rag/sessions', { vaultId, title });
    return response.data;
  },

  // Get chat sessions for a vault
  getSessions: async (vaultId: string): Promise<{ success: boolean; sessions: ChatSession[] }> => {
    const response = await api.get(`/rag/sessions/${vaultId}`);
    return response.data;
  },

  // Get messages for a session
  getMessages: async (sessionId: string): Promise<{ success: boolean; messages: ChatMessage[] }> => {
    const response = await api.get(`/rag/messages/${sessionId}`);
    return response.data;
  },

  // Send RAG chat message
  chat: async (vaultId: string, message: string, sessionId?: string): Promise<RagChatResponse> => {
    const response = await api.post('/rag/chat', { vaultId, message, sessionId });
    return response.data;
  },

  // Delete session
  deleteSession: async (sessionId: string): Promise<{ success: boolean }> => {
    const response = await api.delete(`/rag/sessions/${sessionId}`);
    return response.data;
  }
};