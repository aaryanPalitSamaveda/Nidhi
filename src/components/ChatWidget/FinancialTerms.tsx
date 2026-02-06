import React, { useState, KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import { BookIcon, LoadingSpinner } from '../Icons/Icons';
import { chatAPI } from '../../services/api';

interface TermItem {
  term: string;
  description: string;
}

interface TermResult {
  term?: string;
  definition?: string;
  error?: string;
}

const popularTerms: TermItem[] = [
  { term: 'EBITDA', description: 'Earnings before interest, taxes, depreciation & amortization' },
  { term: 'Valuation Multiple', description: 'Price relative to financial metrics' },
  { term: 'Due Diligence', description: 'Investigation before a deal' },
  { term: 'LOI', description: 'Letter of Intent in M&A' },
  { term: 'Earnout', description: 'Contingent payment based on performance' },
  { term: 'Strategic Buyer', description: 'Acquirer from same industry' },
  { term: 'Financial Buyer', description: 'PE/VC investment firms' },
  { term: 'Exit Strategy', description: 'Plan to sell or transfer ownership' },
  { term: 'Term Sheet', description: 'Key deal terms summary' },
  { term: 'Working Capital', description: 'Current assets minus liabilities' },
  { term: 'Enterprise Value', description: 'Total company value' },
  { term: 'DCF', description: 'Discounted Cash Flow valuation' },
];

const FinancialTerms: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<TermResult | null>(null);

  const handleSearch = async (term: string): Promise<void> => {
    if (!term.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const response = await chatAPI.getFinancialTerm(term);
      if (response.success) {
        setResult({ term: response.term, definition: response.definition });
      }
    } catch {
      setResult({ error: 'Failed to fetch definition. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') handleSearch(searchTerm);
  };

  const handleTermClick = (term: string): void => {
    setSearchTerm(term);
    handleSearch(term);
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 bg-gradient-to-r from-amber-50 to-yellow-50 shrink-0">
        <h3 className="font-semibold flex items-center gap-2 text-slate-800">
          <BookIcon className="w-5 h-5 text-amber-600" />
          IB Dictionary
        </h3>
        <p className="text-xs mt-1 text-slate-500">
          Investment banking terms explained simply
        </p>
      </div>

      {/* Search Bar */}
      <div className="p-4 border-b border-slate-200 shrink-0 bg-white">
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search IB terms..."
            className="w-full px-4 py-3 pl-10 bg-slate-50 border border-slate-300 rounded-xl text-sm
                       text-slate-800 placeholder:text-slate-400
                       focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
          />
          <BookIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <button
            onClick={() => handleSearch(searchTerm)}
            disabled={loading || !searchTerm.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-amber-500 
                       text-white text-xs rounded-lg hover:bg-amber-600 
                       disabled:opacity-50 transition-colors cursor-pointer font-medium"
          >
            {loading ? <LoadingSpinner className="w-4 h-4" /> : 'Search'}
          </button>
        </div>
      </div>

      {/* Results or Popular Terms */}
      <div className="flex-1 overflow-y-auto p-4 bg-slate-50 chat-scrollbar-light">
        {result ? (
          <div className="animate-fade-in">
            {result.error ? (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm font-medium text-red-600">
                {result.error}
              </div>
            ) : (
              <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                <h3 className="font-bold text-lg mb-3 flex items-center gap-2 text-slate-800">
                  <span className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
                    <BookIcon className="w-4 h-4 text-white" />
                  </span>
                  {result.term}
                </h3>

                <div className="text-sm leading-relaxed">
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => (
                        <p className="mb-2 last:mb-0 text-slate-600">{children}</p>
                      ),
                      strong: ({ children }) => (
                        <strong className="font-bold text-slate-800">{children}</strong>
                      ),
                      ul: ({ children }) => (
                        <ul className="list-none space-y-1 my-2">{children}</ul>
                      ),
                      li: ({ children }) => (
                        <li className="flex items-start gap-2 text-slate-600">
                          <span className="inline-block w-1.5 h-1.5 rounded-full mt-2 shrink-0 bg-amber-500" />
                          <span>{children}</span>
                        </li>
                      ),
                    }}
                  >
                    {result.definition || ''}
                  </ReactMarkdown>
                </div>

                <button
                  onClick={() => { setResult(null); setSearchTerm(''); }}
                  className="mt-4 text-amber-600 text-sm hover:underline cursor-pointer flex items-center gap-1 font-medium"
                >
                  ← Back to terms
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-3 text-slate-500">
              Popular IB Terms
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {popularTerms.map((item) => (
                <button
                  key={item.term}
                  onClick={() => handleTermClick(item.term)}
                  className="p-3 bg-white border border-slate-200 rounded-xl text-left
                             hover:border-amber-300 hover:bg-amber-50 hover:shadow-sm
                             transition-all duration-200 group cursor-pointer"
                >
                  <p className="font-medium text-sm text-slate-700 group-hover:text-amber-600">
                    {item.term}
                  </p>
                  <p className="text-xs mt-0.5 line-clamp-1 text-slate-400">
                    {item.description}
                  </p>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default FinancialTerms;