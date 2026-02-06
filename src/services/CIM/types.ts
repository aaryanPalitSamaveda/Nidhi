export interface CIMReport {
  reportId: string;
  vaultId: string;
  vaultName: string;
  createdBy: string;
  timestamp: string;
  cimReport: string;
  filesAnalyzed: number;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  errorMessage?: string;
}

export interface CIMSection {
  section: number;
  title: string;
  content: string;
  subsections?: string[];
}