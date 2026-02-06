// src/services/fraud/fraudAnalysisController.ts

import { fetchAllFilesFromVault } from './documentFetcher';
import { formatReportForDisplay, generateReportJSON } from './reportGenerator';
import { FraudAnalysisReport } from './types';
import { supabase } from '@/integrations/supabase/client';

export async function runFraudAnalysis(vaultId: string, userId: string): Promise<FraudAnalysisReport> {
  try {
    console.log(`Starting fraud analysis for vault: ${vaultId}`);

    // Step 1: Fetch files from vault
    console.log('Step 1: Fetching files from vault...');
    const files = await fetchAllFilesFromVault(vaultId);
    console.log(`Found ${files.length} files`);

    if (files.length === 0) {
      throw new Error('No files found in vault');
    }

    // Step 2: Prepare file data for backend
    const documentData = files.map(file => {
  let base64Content = '';
  if (file.content) {
    // Convert Uint8Array/ArrayBuffer to base64
    if (file.content instanceof ArrayBuffer) {
      const bytes = new Uint8Array(file.content);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      base64Content = btoa(binary);
    } else if (file.content instanceof Uint8Array) {
      let binary = '';
      for (let i = 0; i < file.content.length; i++) {
        binary += String.fromCharCode(file.content[i]);
      }
      base64Content = btoa(binary);
    }
  }
  return {
    fileName: file.name,
    fileType: file.type,
    content: base64Content,
  };
});

    // Step 3: Send to backend for Gemini extraction + Claude analysis
    console.log('Step 2: Sending files to backend for analysis...');
    const analysisResponse = await fetch('http://localhost:3001/api/fraud-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documents: documentData,
        vaultId,
        userId,
      }),
    });

    if (!analysisResponse.ok) {
      throw new Error(`API failed: ${analysisResponse.statusText}`);
    }

    const { analysis, riskScore, filesAnalyzed } = await analysisResponse.json();

    // Format report
    const report: FraudAnalysisReport = {
      reportId: `report_${Date.now()}`,
      vaultId,
      createdBy: userId,
      analysisDate: new Date().toISOString(),
      riskScore: riskScore || 50,
      riskLevel: getRiskLevel(riskScore || 50),
      summary: analysis,
      filesAnalyzed: filesAnalyzed || files.length,
      findings: [],
      reconciliationGaps: [],
      recommendations: ['Review detailed analysis'],
      analysisStatus: 'completed',
    };

    // Save to database
    await supabase.from('fraud_analysis_reports').insert({
      vault_id: vaultId,
      created_by: userId,
      risk_score: report.riskScore,
      risk_level: report.riskLevel,
      summary: report.summary,
      key_findings: report.findings,
      detailed_report: generateReportJSON(report),
      files_analyzed: report.filesAnalyzed,
      analysis_status: 'completed',
    });

    return report;
  } catch (error) {
    console.error('Error in fraud analysis:', error);
    throw error;
  }
}

export function getFormattedReport(report: FraudAnalysisReport): string {
  return formatReportForDisplay(report);
}

export function getReportAsJSON(report: FraudAnalysisReport): object {
  return generateReportJSON(report);
}

function getRiskLevel(score: number): 'Low' | 'Medium' | 'High' | 'Critical' {
  if (score >= 75) return 'Critical';
  if (score >= 50) return 'High';
  if (score >= 25) return 'Medium';
  return 'Low';
}