export interface TeaserReport {
  reportId: string;
  vaultId: string;
  vaultName: string;
  createdBy: string;
  timestamp: string;
  teaserReport: string;
  filesAnalyzed: number;
  status: 'completed' | 'failed' | 'pending';
}
