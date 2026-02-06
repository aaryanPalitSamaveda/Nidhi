import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import { supabase } from '@/integrations/supabase/client';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Types
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ChatResponse {
  success: boolean;
  message?: string;
  error?: string;
  hasDocumentContext?: boolean;
}

export interface DocumentInfo {
  id: string;
  name: string;
  file_type: string;
  created_at: string;
  vaults: {
    id: string;
    name: string;
  };
}

export interface AccessibleDocumentsResponse {
  success: boolean;
  documents: DocumentInfo[];
  message?: string;
}

export interface DocumentQAResponse {
  success: boolean;
  answer?: string;
  documentName?: string;
  error?: string;
}

export interface ChatHistoryResponse {
  success: boolean;
  messages: ChatMessage[];
}

export interface FinancialTermResponse {
  success: boolean;
  term?: string;
  definition?: string;
  error?: string;
}

export interface FeedbackData {
  name: string;
  email: string;
  subject: string;
  message: string;
  rating: number;
}

export interface FeedbackResponse {
  success: boolean;
  error?: string;
}

export interface ClearChatResponse {
  success: boolean;
  error?: string;
}

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      console.log('🔑 Session:', session ? 'Found' : 'Not found');
      console.log('🎫 Token:', session?.access_token ? 'Yes' : 'No');
      if (session?.access_token) {
        config.headers.Authorization = `Bearer ${session.access_token}`;
      }
    } catch (error) {
      console.error('Error getting session:', error);
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
  (response: AxiosResponse) => {
    console.log(`📥 API Response: ${response.status}`);
    return response;
  },
  (error: AxiosError) => {
    console.error('❌ API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export const chatAPI = {
  // 👈 UPDATED: Added vaultId parameter
  sendMessage: async (
    message: string, 
    sessionId: string, 
    vaultId?: string  // Changed from userId to vaultId
  ): Promise<ChatResponse> => {
    const response = await api.post<ChatResponse>('/chat/message', { 
      message, 
      sessionId, 
      vaultId  // 👈 Send vaultId to backend
    });
    return response.data;
  },

  askAboutDocument: async (
    documentId: string, 
    question: string, 
    userId: string
  ): Promise<DocumentQAResponse> => {
    const response = await api.post<DocumentQAResponse>('/chat/document/ask', { 
      documentId, 
      question, 
      userId 
    });
    return response.data;
  },

  getAccessibleDocuments: async (userId: string): Promise<AccessibleDocumentsResponse> => {
    const response = await api.get<AccessibleDocumentsResponse>(`/chat/documents/${userId}`);
    return response.data;
  },

  getFinancialTerm: async (term: string): Promise<FinancialTermResponse> => {
    const response = await api.get<FinancialTermResponse>(`/chat/term/${encodeURIComponent(term)}`);
    return response.data;
  },

  getChatHistory: async (sessionId: string): Promise<ChatHistoryResponse> => {
    const response = await api.get<ChatHistoryResponse>(`/chat/history/${sessionId}`);
    return response.data;
  },

  clearChat: async (sessionId: string): Promise<ClearChatResponse> => {
    const response = await api.delete<ClearChatResponse>(`/chat/clear/${sessionId}`);
    return response.data;
  },
};

export const feedbackAPI = {
  submit: async (feedbackData: FeedbackData): Promise<FeedbackResponse> => {
    const response = await api.post<FeedbackResponse>('/feedback/submit', feedbackData);
    return response.data;
  },
};

export default api;