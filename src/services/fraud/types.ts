// src/services/fraud/types.ts

export interface ParsedDocument {
  fileName: string;
  fileType: 'pdf' | 'xlsx' | 'docx' | 'pptx' | 'png' | 'jpeg';
  rawText: string;
  documentType?: 'bank_statement' | 'tally_sheet' | 'salary_register' | 'gst_filing' | 'financial_statement' | 'unknown';
}

export interface ExtractedData {
  fileName: string;
  documentType: string;
  extractedValues: {
    transactions?: Array<{
      date: string;
      amount: number;
      type: 'credit' | 'debit';
      description: string;
    }>;
    totalIncome?: number;
    totalExpenses?: number;
    netAmount?: number;
    salary_payments?: Array<{
      employee_name: string;
      amount: number;
      date: string;
    }>;
    [key: string]: any;
  };
}

export interface FraudFinding {
  type: 'reconciliation_gap' | 'missing_transaction' | 'duplicate_transaction' | 'amount_mismatch' | 'timing_anomaly' | 'suspicious_pattern';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affectedDocuments: string[];
  evidence: string;
  suggestedAction: string;
}

export interface FraudAnalysisReport {
  reportId: string;
  vaultId: string;
  createdBy: string;
  analysisDate: string;

  riskScore: number; // 0-100
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';

  summary: string;
  filesAnalyzed: number;

  findings: FraudFinding[];
  reconciliationGaps: Array<{
    document1: string;
    document2: string;
    discrepancy: number;
    description: string;
  }>;

  recommendations: string[];

  analysisStatus: 'pending' | 'processing' | 'completed' | 'failed';
  errorMessage?: string;
}