import React, { useState } from 'react';
import { ragAPI } from '../../services/ragApi';
import { Database, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface DocumentIndexButtonProps {
  documentId: string;
  documentName: string;
  onIndexed?: () => void;
}

const DocumentIndexButton: React.FC<DocumentIndexButtonProps> = ({ 
  documentId, 
  documentName,
  onIndexed 
}) => {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleIndex = async () => {
    setStatus('loading');
    try {
      const result = await ragAPI.indexDocument(documentId);
      if (result.success) {
        setStatus('success');
        setMessage(`Indexed ${result.chunksCreated} chunks`);
        onIndexed?.();
      } else {
        throw new Error('Indexing failed');
      }
    } catch (err) {
      setStatus('error');
      setMessage('Failed to index');
    }
    
    setTimeout(() => {
      setStatus('idle');
      setMessage('');
    }, 3000);
  };

  return (
    <button
      onClick={handleIndex}
      disabled={status === 'loading'}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium
                transition-all ${
                  status === 'success' ? 'bg-green-100 text-green-700' :
                  status === 'error' ? 'bg-red-100 text-red-700' :
                  'bg-amber-100 text-amber-700 hover:bg-amber-200'
                }`}
      title={`Index ${documentName} for AI search`}
    >
      {status === 'loading' ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : status === 'success' ? (
        <CheckCircle className="w-4 h-4" />
      ) : status === 'error' ? (
        <AlertCircle className="w-4 h-4" />
      ) : (
        <Database className="w-4 h-4" />
      )}
      {status === 'idle' ? 'Index for AI' : message}
    </button>
  );
};

export default DocumentIndexButton;