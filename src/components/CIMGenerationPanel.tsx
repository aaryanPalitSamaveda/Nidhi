import React, { useState, useRef } from 'react';
import { runCIMGeneration, getFormattedCIM } from '@/services/CIM/cimGenerationController';
import type { CIMReport } from '@/services/CIM/types';

export const CIMGenerationPanel: React.FC = () => {
  const [vaultId, setVaultId] = useState('c9f09380-7010-476b-8c9c-df9f4f74d9ff');
  const [vaultName, setVaultName] = useState('D2C Apparel Brand');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<CIMReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState('');

  // ✅ NEW: Store abort controller to cancel requests
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleRunCIM = async () => {
    setLoading(true);
    setError(null);
    setProgress('Starting CIM generation...');

    // ✅ NEW: Create abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      const userId = localStorage.getItem('userId') || 'unknown-user';
      const cimReport = await runCIMGeneration(
        vaultId,
        vaultName,
        userId,
        abortControllerRef.current.signal // ✅ NEW: Pass the signal
      );
      setReport(cimReport);
      setProgress('CIM generation complete!');
    } catch (err) {
      // ✅ NEW: Handle abort error separately
      if (err instanceof Error && err.name === 'AbortError') {
        setError('CIM generation was cancelled');
        setProgress('Cancelled');
      } else {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
        setError(errorMessage);
        setProgress('');
      }
      console.error('CIM generation error:', err);
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  // ✅ NEW: Handle stop/cancel button
  const handleStopCIM = () => {
    if (abortControllerRef.current) {
      console.log('Stopping CIM generation...');
      abortControllerRef.current.abort();
      setLoading(false);
      setProgress('Stopping CIM generation...');
    }
  };

  const handleDownloadPDF = async () => {
    if (!report) return;
    try {
      setProgress('Generating PDF...');
      const html2pdf = (await import('html2pdf.js')).default;
      const element = document.getElementById('cim-report-content');
      if (!element) return;

      const options = {
        margin: 10,
        filename: `CIM_${vaultName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
      };

      html2pdf().set(options).from(element).save();
      setProgress('PDF downloaded successfully!');
      setTimeout(() => setProgress(''), 3000);
    } catch (err) {
      setError('Failed to generate PDF');
      console.error('PDF generation error:', err);
    }
  };

  const handleDownloadWord = async () => {
    if (!report) return;
    try {
      setProgress('Generating Word document...');
      const { Document, Packer, Paragraph, Heading } = await import('docx');

      const doc = new Document({
        sections: [{
          children: [
            new Paragraph({
              text: vaultName,
              heading: 'Heading1',
              size: 32,
              bold: true,
            }),
            new Paragraph({
              text: 'Confidential Information Memorandum',
              heading: 'Heading2',
              size: 24,
            }),
            new Paragraph({
              text: `Generated: ${new Date().toLocaleDateString()}`,
              size: 20,
              italics: true,
            }),
            new Paragraph({ text: '' }),
            new Paragraph({
              text: report.cimReport,
              size: 22,
            }),
          ],
        }],
      });

      const blob = await Packer.toBlob(doc);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `CIM_${vaultName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.docx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      setProgress('Word document downloaded successfully!');
      setTimeout(() => setProgress(''), 3000);
    } catch (err) {
      setError('Failed to generate Word document');
      console.error('Word generation error:', err);
    }
  };

  return (
    <div className="p-6 bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg border border-blue-500/20">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-blue-500 mb-4">📊 CIM Report Generation</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Vault Name
            </label>
            <input
              type="text"
              value={vaultName}
              onChange={(e) => setVaultName(e.target.value)}
              disabled={loading} // ✅ NEW: Disable while loading
              className="w-full px-4 py-2 bg-slate-800 border border-blue-500/30 rounded text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none disabled:opacity-50"
              placeholder="Enter company/vault name"
            />
            <p className="text-xs text-gray-400 mt-1">This will appear as the company name in the report</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Vault ID
            </label>
            <input
              type="text"
              value={vaultId}
              onChange={(e) => setVaultId(e.target.value)}
              disabled={loading} // ✅ NEW: Disable while loading
              className="w-full px-4 py-2 bg-slate-800 border border-blue-500/30 rounded text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none disabled:opacity-50"
              placeholder="Enter vault ID"
            />
          </div>

          {/* ✅ NEW: Show either Generate or Stop button based on loading state */}
          <div className="flex gap-3">
            <button
              onClick={handleRunCIM}
              disabled={loading}
              className={`flex-1 py-3 rounded font-semibold transition ${
                loading
                  ? 'bg-gray-600 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {loading ? '⏳ Generating CIM Report...' : '📊 Generate CIM Report'}
            </button>

            {/* ✅ NEW: Stop button appears only while loading */}
            {loading && (
              <button
                onClick={handleStopCIM}
                className="py-3 px-6 rounded font-semibold bg-red-600 hover:bg-red-700 text-white transition"
                title="Click to stop the CIM generation"
              >
                ⏹️ Stop
              </button>
            )}
          </div>

          {progress && (
            <div className="p-3 bg-blue-500/20 border border-blue-500 rounded text-blue-200 text-sm">
              {progress}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-500/20 border border-red-500 rounded text-red-200 mb-6">
          <p className="font-semibold">❌ Error:</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      )}

      {report && (
        <div className="mt-8 space-y-6">
          <div className="bg-slate-800 p-6 rounded border border-blue-500/20 max-h-96 overflow-y-auto">
            <h3 className="text-lg font-bold text-blue-500 mb-4">📋 Report Preview</h3>
            <div
  id="cim-report-content"
  className="bg-white text-gray-800"
  dangerouslySetInnerHTML={{ __html: report.cimReport }}
/>
          </div>

          <div className="bg-slate-800 p-4 rounded border border-blue-500/20">
            <h3 className="text-lg font-bold text-blue-500 mb-4">💾 Download Report</h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleDownloadPDF}
                className="py-2 px-4 bg-red-600 hover:bg-red-700 text-white rounded font-semibold transition text-sm"
              >
                📥 Download PDF
              </button>
              <button
                onClick={handleDownloadWord}
                className="py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold transition text-sm"
              >
                📄 Download Word
              </button>
            </div>
          </div>

          <div className="bg-slate-800 p-4 rounded border border-blue-500/20">
            <h3 className="text-lg font-bold text-blue-500 mb-3">📊 Report Details</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-slate-700 p-3 rounded">
                <p className="text-gray-400">Company</p>
                <p className="text-white font-semibold">{report.vaultName}</p>
              </div>
              <div className="bg-slate-700 p-3 rounded">
                <p className="text-gray-400">Files Analyzed</p>
                <p className="text-white font-semibold">{report.filesAnalyzed}</p>
              </div>
              <div className="bg-slate-700 p-3 rounded col-span-2">
                <p className="text-gray-400">Generated</p>
                <p className="text-white font-semibold">{new Date(report.timestamp).toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};