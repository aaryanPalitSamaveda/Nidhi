// src/pages/api/fraud-analysis.ts

import { Anthropic } from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { extractedDataArray, vaultId, userId } = req.body;

    const documentSummary = extractedDataArray
      .map((doc: any) => `Document: ${doc.fileName}\nData: ${JSON.stringify(doc.extractedValues)}`)
      .join('\n\n');

    const message = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 3000,
      messages: [
        {
          role: 'user',
          content: `Analyze these financial documents for fraud:\n\n${documentSummary}`,
        },
      ],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    return res.status(200).json({ analysis: responseText });
  } catch (error) {
    console.error('Fraud analysis error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}