import React, { useState, useEffect } from 'react';
import { runFraudAnalysis, getFormattedReport } from '../services/fraud/fraudAnalysisController';
import { FraudAnalysisReport } from '../services/fraud/types';

export const FraudAnalysisPanel: React.FC = () => {
  const [vaultId, setVaultId] = useState('c9f09380-7010-476b-8c9c-df9f4f74d9ff');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<FraudAnalysisReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRunAnalysis = async () => {
    setLoading(true);
    setError(null);

    try {
      const userId = localStorage.getItem('userId') || 'unknown-user';

      const fraudReport = await runFraudAnalysis(vaultId, userId);
      setReport(fraudReport);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('Fraud analysis error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExportReport = () => {
    if (!report) return;

    const reportText = getFormattedReport(report);
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(reportText));
    element.setAttribute('download', `fraud_report_${report.reportId}.txt`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="p-6 bg-slate-900 rounded-lg border border-amber-500/20">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-amber-500 mb-4">Fraud Detection Analysis</h2>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Vault ID
          </label>
          <input
            type="text"
            value={vaultId}
            onChange={(e) => setVaultId(e.target.value)}
            className="w-full px-4 py-2 bg-slate-800 border border-amber-500/30 rounded text-white placeholder-gray-500"
            placeholder="Enter vault ID"
          />
        </div>

        <button
          onClick={handleRunAnalysis}
          disabled={loading}
          className={`w-full py-3 rounded font-semibold transition ${
            loading
              ? 'bg-gray-600 cursor-not-allowed'
              : 'bg-amber-500 hover:bg-amber-600 text-black'
          }`}
        >
          {loading ? 'Running Analysis...' : 'Run Fraud Analysis'}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-500/20 border border-red-500 rounded text-red-200 mb-6">
          <p className="font-semibold">Error:</p>
          <p>{error}</p>
        </div>
      )}

      {report && (
        <div className="mt-6 space-y-6">
          <div className="bg-slate-800 p-4 rounded border border-amber-500/20">
            <h3 className="text-lg font-bold text-amber-500 mb-3">Analysis Results</h3>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-slate-700 p-3 rounded">
                <p className="text-gray-400 text-sm">Risk Level</p>
                <p className={`text-xl font-bold ${getRiskColor(report.riskLevel)}`}>
                  {report.riskLevel}
                </p>
              </div>
              <div className="bg-slate-700 p-3 rounded">
                <p className="text-gray-400 text-sm">Risk Score</p>
                <p className="text-xl font-bold text-amber-500">{report.riskScore}/100</p>
              </div>
            </div>

            <div className="mb-4">
              <p className="text-gray-300 text-sm mb-2">Summary:</p>
              <p className="text-gray-200">{report.summary}</p>
            </div>

            <div className="mb-4">
              <p className="text-gray-300 text-sm mb-2">Files Analyzed: {report.filesAnalyzed}</p>
              <p className="text-gray-300 text-sm">Findings: {report.findings.length}</p>
            </div>

            <button
              onClick={handleExportReport}
              className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-black rounded font-semibold transition"
            >
              Export Report
            </button>
          </div>

          {report.findings.length > 0 && (
            <div className="bg-slate-800 p-4 rounded border border-red-500/20">
              <h4 className="text-md font-bold text-red-400 mb-3">Findings ({report.findings.length})</h4>
              <div className="space-y-3">
                {report.findings.map((finding, idx) => (
                  <div key={idx} className="bg-slate-700 p-3 rounded border-l-4 border-red-500">
                    <p className="font-semibold text-red-300">{finding.type}</p>
                    <p className="text-sm text-gray-300 mt-1">{finding.description}</p>
                    <p className="text-xs text-gray-400 mt-2">Severity: {finding.severity}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.recommendations.length > 0 && (
            <div className="bg-slate-800 p-4 rounded border border-amber-500/20">
              <h4 className="text-md font-bold text-amber-400 mb-3">Recommendations</h4>
              <ul className="space-y-2">
                {report.recommendations.map((rec, idx) => (
                  <li key={idx} className="text-gray-300 text-sm flex items-start">
                    <span className="text-amber-500 mr-2">•</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function getRiskColor(level: string): string {
  switch (level) {
    case 'Critical':
      return 'text-red-500';
    case 'High':
      return 'text-orange-500';
    case 'Medium':
      return 'text-yellow-500';
    case 'Low':
      return 'text-green-500';
    default:
      return 'text-gray-500';
  }
}