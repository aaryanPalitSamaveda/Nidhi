// src/services/fraud/documentParser.ts

import * as pdfParse from 'pdf-parse';
import ExcelJS from 'exceljs';
import * as mammoth from 'mammoth';
import Tesseract from 'tesseract.js';
import { ParsedDocument } from './types';

export async function parseDocument(
  fileName: string,
  fileContent: ArrayBuffer | Uint8Array | Buffer,
  fileType: string
): Promise<ParsedDocument> {
  let rawText = '';
  let documentType: ParsedDocument['documentType'] = 'unknown';

  try {
    console.log(`Parsing ${fileName} (${fileType})`);

    if (fileType.includes('pdf')) {
      rawText = await parsePDF(fileContent as Buffer | ArrayBuffer);
      documentType = detectDocumentType(fileName, rawText);
    } else if (fileType.includes('sheet') || fileType.includes('excel') || fileType.includes('xlsx')) {
      rawText = await parseExcel(fileContent as Buffer | ArrayBuffer);
      documentType = detectDocumentType(fileName, rawText);
    } else if (fileType.includes('word') || fileType.includes('docx')) {
      rawText = await parseWord(fileContent as Buffer | ArrayBuffer);
      documentType = detectDocumentType(fileName, rawText);
    } else if (fileType.includes('image') || fileType.includes('png') || fileType.includes('jpeg') || fileType.includes('jpg')) {
      rawText = await parseImage(fileContent as ArrayBuffer | Uint8Array, fileName);
      documentType = detectDocumentType(fileName, rawText);
    } else if (fileType.includes('pptx') || fileType.includes('powerpoint')) {
      rawText = await parsePowerPoint(fileContent as Buffer | ArrayBuffer);
      documentType = detectDocumentType(fileName, rawText);
    } else {
      rawText = `[Unsupported file type: ${fileType}]`;
    }

    return {
      fileName,
      fileType: fileType as any,
      rawText: rawText || '[No content extracted]',
      documentType,
    };
  } catch (error) {
    console.error(`Error parsing ${fileName}:`, error);
    return {
      fileName,
      fileType: fileType as any,
      rawText: `[Error parsing file: ${error instanceof Error ? error.message : 'Unknown error'}]`,
      documentType: 'unknown',
    };
  }
}

async function parsePDF(buffer: Buffer | ArrayBuffer): Promise<string> {
  try {
    // Convert ArrayBuffer to Buffer if needed
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    const data = await pdfParse(buf);
    return data.text || '';
  } catch (error) {
    console.error('PDF parsing error:', error);
    return '';
  }
}

async function parseExcel(buffer: Buffer | ArrayBuffer): Promise<string> {
  try {
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buf);

    let text = '';
    workbook.eachSheet((worksheet) => {
      text += `\n=== Sheet: ${worksheet.name} ===\n`;
      worksheet.eachRow((row) => {
        const rowText: string[] = [];
        row.eachCell((cell) => {
          rowText.push(String(cell.value || ''));
        });
        text += rowText.join(' | ') + '\n';
      });
    });

    return text;
  } catch (error) {
    console.error('Excel parsing error:', error);
    return '';
  }
}

async function parseWord(buffer: Buffer | ArrayBuffer): Promise<string> {
  try {
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    const result = await mammoth.extractRawText({ buffer: buf });
    return result.value || '';
  } catch (error) {
    console.error('Word parsing error:', error);
    return '';
  }
}

async function parseImage(buffer: ArrayBuffer | Uint8Array, fileName: string): Promise<string> {
  try {
    console.log(`Running OCR on image: ${fileName}`);

    // Convert ArrayBuffer to base64 for Tesseract
    const uint8Array = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
    const binaryString = String.fromCharCode.apply(null, Array.from(uint8Array));
    const base64String = btoa(binaryString);
    const dataUrl = `data:image/png;base64,${base64String}`;

    const result = await Tesseract.recognize(dataUrl, 'eng', {
      logger: (m) => console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`),
    });

    return result.data.text || '[Image contains no readable text]';
  } catch (error) {
    console.error('Image OCR error:', error);
    return `[Error extracting text from image: ${error instanceof Error ? error.message : 'Unknown error'}]`;
  }
}

async function parsePowerPoint(buffer: Buffer | ArrayBuffer): Promise<string> {
  try {
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    // Basic PowerPoint parsing - convert to string
    const text = buf.toString('utf-8');
    return text || '[PowerPoint content could not be extracted]';
  } catch (error) {
    console.error('PowerPoint parsing error:', error);
    return '';
  }
}

function detectDocumentType(fileName: string, content: string): ParsedDocument['documentType'] {
  const nameLower = fileName.toLowerCase();
  const contentLower = content.toLowerCase();

  if (
    nameLower.includes('bank') ||
    nameLower.includes('statement') ||
    contentLower.includes('account number') ||
    contentLower.includes('transaction')
  ) {
    return 'bank_statement';
  }

  if (
    nameLower.includes('tally') ||
    nameLower.includes('ledger') ||
    nameLower.includes('journal') ||
    contentLower.includes('debit') ||
    contentLower.includes('credit')
  ) {
    return 'tally_sheet';
  }

  if (
    nameLower.includes('salary') ||
    nameLower.includes('payroll') ||
    nameLower.includes('employee') ||
    contentLower.includes('salary') ||
    contentLower.includes('payroll')
  ) {
    return 'salary_register';
  }

  if (
    nameLower.includes('gst') ||
    nameLower.includes('tax') ||
    contentLower.includes('gst') ||
    contentLower.includes('igst')
  ) {
    return 'gst_filing';
  }

  if (
    nameLower.includes('financial') ||
    nameLower.includes('statement') ||
    nameLower.includes('balance sheet') ||
    nameLower.includes('p&l')
  ) {
    return 'financial_statement';
  }

  return 'unknown';
}