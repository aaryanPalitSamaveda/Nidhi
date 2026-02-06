// src/services/fraud/dataExtractor.ts

import { ParsedDocument, ExtractedData } from './types';

export async function extractDataFromDocument(parsedDoc: ParsedDocument): Promise<ExtractedData> {
  try {
    // For now, return basic extracted data without Claude
    // Claude analysis will happen on the backend

    return {
      fileName: parsedDoc.fileName,
      documentType: parsedDoc.documentType || 'unknown',
      extractedValues: {
        rawText: parsedDoc.rawText.substring(0, 500), // First 500 chars
        fullContent: parsedDoc.rawText,
      },
    };
  } catch (error) {
    console.error(`Error extracting data from ${parsedDoc.fileName}:`, error);
    throw error;
  }
}

export async function extractDataFromMultipleDocuments(
  parsedDocs: ParsedDocument[]
): Promise<ExtractedData[]> {
  const results: ExtractedData[] = [];

  for (const doc of parsedDocs) {
    try {
      const extracted = await extractDataFromDocument(doc);
      results.push(extracted);
    } catch (error) {
      console.error(`Skipping ${doc.fileName} due to extraction error`);
    }
  }

  return results;
}