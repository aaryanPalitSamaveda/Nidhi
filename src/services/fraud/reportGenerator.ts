// src/services/fraud/reportGenerator.ts

import { FraudAnalysisReport } from './types';

export function formatReportForDisplay(report: FraudAnalysisReport): string {
  const separator = '='.repeat(80);

  let output = `
${separator}
FRAUD ANALYSIS REPORT
${separator}

Report ID: ${report.reportId}
Vault ID: ${report.vaultId}
Analysis Date: ${new Date(report.analysisDate).toLocaleString()}
Files Analyzed: ${report.filesAnalyzed}

${separator}
RISK ASSESSMENT
${separator}

Risk Level: ${report.riskLevel}
Risk Score: ${report.riskScore}/100

${getRiskLevelIndicator(report.riskLevel)}

${separator}
SUMMARY
${separator}

${report.summary}

${separator}
KEY FINDINGS (${report.findings.length})
${separator}

${report.findings
  .map(
    (finding, index) => `
${index + 1}. ${finding.type.toUpperCase().replace(/_/g, ' ')}
   Severity: ${finding.severity}
   Description: ${finding.description}
   Affected Documents: ${finding.affectedDocuments.join(', ')}
   Evidence: ${finding.evidence}
   Suggested Action: ${finding.suggestedAction}
`
  )
  .join('\n')}

${separator}
RECONCILIATION GAPS (${report.reconciliationGaps.length})
${separator}

${
  report.reconciliationGaps.length > 0
    ? report.reconciliationGaps
        .map(
          (gap, index) => `
${index + 1}. Between: ${gap.document1} and ${gap.document2}
   Discrepancy Amount: ${gap.discrepancy}
   Description: ${gap.description}
`
        )
        .join('\n')
    : 'No major reconciliation gaps detected.'
}

${separator}
RECOMMENDATIONS
${separator}

${report.recommendations.map((rec, index) => `${index + 1}. ${rec}`).join('\n')}

${separator}
Report Generated: ${new Date().toLocaleString()}
Status: ${report.analysisStatus}
${separator}
`;

  return output;
}

export function generateReportJSON(report: FraudAnalysisReport): object {
  return {
    reportId: report.reportId,
    vaultId: report.vaultId,
    createdBy: report.createdBy,
    analysisDate: report.analysisDate,
    riskScore: report.riskScore,
    riskLevel: report.riskLevel,
    summary: report.summary,
    filesAnalyzed: report.filesAnalyzed,
    findings: report.findings,
    reconciliationGaps: report.reconciliationGaps,
    recommendations: report.recommendations,
    analysisStatus: report.analysisStatus,
  };
}

function getRiskLevelIndicator(level: string): string {
  switch (level) {
    case 'Critical':
      return '🔴 CRITICAL - Immediate investigation required';
    case 'High':
      return '🟠 HIGH - Urgent investigation needed';
    case 'Medium':
      return '🟡 MEDIUM - Further review recommended';
    case 'Low':
      return '🟢 LOW - Minor concerns, routine monitoring';
    default:
      return '⚪ UNKNOWN';
  }
}