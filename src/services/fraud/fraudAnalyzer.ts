// src/services/fraud/fraudAnalyzer.ts

import { Anthropic } from '@anthropic-ai/sdk';
import { ExtractedData, FraudFinding, FraudAnalysisReport } from './types';

const client = new Anthropic();

export async function analyzeFraud(
  extractedDataArray: ExtractedData[],
  vaultId: string,
  userId: string
): Promise<FraudAnalysisReport> {
  try {
    // Prepare summary of all documents
    const documentSummary = extractedDataArray
      .map(
        (doc) =>
          `Document: ${doc.fileName} (${doc.documentType})\nData: ${JSON.stringify(doc.extractedValues)}`
      )
      .join('\n\n');

    const analysisPrompt = `You are a financial fraud detection expert. Analyze the following extracted financial documents for fraud indicators and reconciliation gaps.

${documentSummary}

Please analyze and return a JSON object with this structure:
{
  "riskScore": number (0-100),
  "riskLevel": "Low" or "Medium" or "High" or "Critical",
  "summary": "brief summary of findings",
  "findings": [
    {
      "type": "reconciliation_gap" or "missing_transaction" or "duplicate_transaction" or "amount_mismatch" or "timing_anomaly" or "suspicious_pattern",
      "severity": "low" or "medium" or "high" or "critical",
      "description": "detailed description",
      "affectedDocuments": ["doc1", "doc2"],
      "evidence": "specific evidence from documents",
      "suggestedAction": "what should be investigated"
    }
  ],
  "reconciliationGaps": [
    {
      "document1": "name",
      "document2": "name",
      "discrepancy": number,
      "description": "what doesn't match"
    }
  ],
  "recommendations": ["recommendation 1", "recommendation 2"]
}

Specifically check for:
1. Bank statement vs Tally sheet reconciliation
2. Salary payments in bank vs salary register
3. Income/expense totals matching
4. Duplicate transactions
5. Unusual transaction patterns
6. GST compliance (if GST document present)

Return ONLY valid JSON, no additional text.`;

    const message = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 3000,
      messages: [
        {
          role: 'user',
          content: analysisPrompt,
        },
      ],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    let analysisResult = {
      riskScore: 0,
      riskLevel: 'Low' as const,
      summary: '',
      findings: [] as FraudFinding[],
      reconciliationGaps: [] as any[],
      recommendations: [] as string[],
    };

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('Failed to parse fraud analysis response:', e);
    }

    const report: FraudAnalysisReport = {
      reportId: `report_${Date.now()}`,
      vaultId,
      createdBy: userId,
      analysisDate: new Date().toISOString(),
      riskScore: analysisResult.riskScore,
      riskLevel: analysisResult.riskLevel,
      summary: analysisResult.summary,
      filesAnalyzed: extractedDataArray.length,
      findings: analysisResult.findings,
      reconciliationGaps: analysisResult.reconciliationGaps,
      recommendations: analysisResult.recommendations,
      analysisStatus: 'completed',
    };

    return report;
  } catch (error) {
    console.error('Error in fraud analysis:', error);
    throw error;
  }
}