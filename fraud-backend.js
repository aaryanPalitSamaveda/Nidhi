// fraud-backend.js - FIXED VERSION
import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import ExcelJS from 'exceljs';
import * as mammoth from 'mammoth';
import Tesseract from 'tesseract.js';
import dotenv from 'dotenv';

dotenv.config();

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));

app.post('/api/fraud-analysis', async (req, res) => {
  try {
    const { documents } = req.body;

    if (!documents || documents.length === 0) {
      return res.status(400).json({ error: 'No documents provided' });
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log(`📊 FRAUD DETECTION ANALYSIS`);
    console.log(`Processing: ${documents.length} files`);
    console.log(`${'='.repeat(70)}\n`);

    console.log('STEP 1: EXTRACTING FROM ALL DOCUMENTS\n');
    const extractedData = [];
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      try {
        const progressBar = `[${'█'.repeat(Math.floor(i / documents.length * 20))}${'░'.repeat(20 - Math.floor(i / documents.length * 20))}]`;
        console.log(`${progressBar} [${i + 1}/${documents.length}] ${doc.fileName}`);

        const buffer = Buffer.from(doc.content, 'base64');
        const fileType = getFileType(doc.fileName);

        let extractedText = '';
        let extractionMethod = '';

        try {
          if (fileType === 'pdf') {
            extractedText = await parsePDFText(buffer);
            extractionMethod = 'PDF-Text';

            if (!extractedText || extractedText.trim().length < 50) {
              console.log(`     → Minimal text, trying plain extraction...`);
              extractedText = await parsePDFPlain(buffer);
              extractionMethod = 'PDF-Plain';
            }
          } else if (fileType === 'excel') {
            extractedText = await parseExcelComplete(buffer);
            extractionMethod = 'Excel-Complete';
          } else if (fileType === 'word') {
            extractedText = await parseWord(buffer);
            extractionMethod = 'Word';
          } else if (fileType === 'image') {
            extractedText = await parseImageWithOCR(buffer, doc.fileName);
            extractionMethod = 'Image-OCR';
          } else if (fileType === 'powerpoint') {
            extractedText = '[PowerPoint - manual review needed]';
            extractionMethod = 'PowerPoint';
          } else {
            extractedText = '[Unsupported format]';
            extractionMethod = 'N/A';
          }
        } catch (innerError) {
          try {
            extractedText = buffer.toString('utf8', 0, 3000);
            extractionMethod = 'Fallback-UTF8';
          } catch {
            extractedText = `[Error: ${innerError.message}]`;
            extractionMethod = 'Failed';
          }
        }

        if (!extractedText || extractedText.trim().length === 0) {
          extractedText = `[No content extracted]`;
        }

        extractedData.push({
          fileName: doc.fileName,
          fileType: doc.fileType,
          extracted: extractedText.substring(0, 5000),
          method: extractionMethod,
        });

        successCount++;
        console.log(`     ✅ [${extractionMethod}]`);

      } catch (error) {
        errorCount++;
        console.error(`     ❌ ${error.message}`);
        extractedData.push({
          fileName: doc.fileName,
          fileType: doc.fileType,
          extracted: `[ERROR]`,
          method: 'Error',
        });
      }
    }

    console.log(`\n✅ Extracted: ${successCount}/${documents.length}`);
    console.log(`❌ Errors: ${errorCount}/${documents.length}\n`);

    console.log('STEP 2: FRAUD ANALYSIS\n');

    const prompt = `Analyze these ${documents.length} documents for fraud:

${extractedData
  .map(
    (d, i) => `[Doc ${i + 1}: ${d.fileName}] [${d.method}]
${d.extracted}`
  )
  .join('\n---\n')}

Provide fraud analysis:
1. Revenue reconciliation
2. Financial red flags
3. Document authenticity
4. Temporal issues
5. Critical gaps
6. Overall risk assessment

FORMAT:
FRAUD_RISK_SCORE: [0-100]
[Analysis]`;

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 10000,
      messages: [{ role: 'user', content: prompt }],
    });

    const analysis = message.content[0].type === 'text' ? message.content[0].text : '';
    const scoreMatch = analysis.match(/FRAUD_RISK_SCORE:\s*(\d+)/);
    const riskScore = scoreMatch ? parseInt(scoreMatch[1]) : 50;

    console.log(`✅ COMPLETE - Risk Score: ${riskScore}/100\n`);

    res.json({
      analysis,
      riskScore,
      filesAnalyzed: documents.length,
    });
  } catch (error) {
    console.error('\n❌ ERROR:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/forensic-audit', async (req, res) => {
  try {
    const { extractedData } = req.body;

    if (!Array.isArray(extractedData) || extractedData.length === 0) {
      return res.status(400).json({ error: 'No extracted data provided' });
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log(`📊 FORENSIC AUDIT ANALYSIS`);
    console.log(`Processing: ${extractedData.length} files`);
    console.log(`${'='.repeat(70)}\n`);

    const prompt = `Analyze these ${extractedData.length} documents for forensic audit red flags:

${extractedData
  .map(
    (d, i) => `[Doc ${i + 1}: ${d.fileName}] [${d.fileType}]
${d.extracted}`
  )
  .join('\n---\n')}

Provide forensic audit analysis:
1. Revenue reconciliation
2. Financial red flags
3. Document authenticity
4. Temporal issues
5. Critical gaps
6. Overall risk assessment

FORMAT:
FORENSIC_RISK_SCORE: [0-100]
[Analysis]`;

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 7000,
      messages: [{ role: 'user', content: prompt }],
    });

    const analysis = message.content[0].type === 'text' ? message.content[0].text : '';
    const scoreMatch = analysis.match(/FORENSIC_RISK_SCORE:\s*(\d+)/);
    const riskScore = scoreMatch ? parseInt(scoreMatch[1]) : 50;

    console.log(`✅ COMPLETE - Forensic Risk Score: ${riskScore}/100\n`);

    res.json({
      analysis,
      riskScore,
      filesAnalyzed: extractedData.length,
    });
  } catch (error) {
    console.error('\n❌ ERROR:', error);
    res.status(500).json({ error: error.message });
  }
});

async function parsePDFText(buffer) {
  try {
    const uint8Array = new Uint8Array(buffer);
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

    const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
    const pdf = await loadingTask.promise;

    let fullText = '';
    const pageCount = Math.min(pdf.numPages, 20);

    for (let i = 1; i <= pageCount; i++) {
      try {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
      } catch (e) {
        // Skip pages that fail
      }
    }

    return fullText;
  } catch (error) {
    return '';
  }
}

async function parsePDFPlain(buffer) {
  try {
    const text = buffer.toString('utf8');
    const cleaned = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ');
    return cleaned.substring(0, 5000);
  } catch (error) {
    return '';
  }
}

async function parseExcelComplete(buffer) {
  try {
    let text = '';
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    workbook.eachSheet((worksheet) => {
      text += `SHEET: ${worksheet.name}\n`;
      worksheet.eachRow((row) => {
        const rowData = [];
        row.eachCell((cell) => {
          rowData.push(String(cell.value || ''));
        });
        text += rowData.join(' | ') + '\n';
      });
    });
    return text;
  } catch (error) {
    throw new Error(`Excel failed: ${error.message}`);
  }
}

async function parseWord(buffer) {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '[Empty]';
  } catch (error) {
    throw new Error(`Word failed: ${error.message}`);
  }
}

async function parseImageWithOCR(buffer, fileName) {
  try {
    const base64String = buffer.toString('base64');
    const mimeType = getMimeType(fileName);
    const imageDataUrl = `data:${mimeType};base64,${base64String}`;

    const result = await Tesseract.recognize(imageDataUrl, 'eng', {
      logger: () => {},
    });

    return result.data.text || '[No text]';
  } catch (error) {
    throw new Error(`OCR failed: ${error.message}`);
  }
}

function getFileType(fileName) {
  const ext = fileName.toLowerCase().split('.').pop();
  const types = {
    pdf: 'pdf', xlsx: 'excel', xls: 'excel',
    docx: 'word', doc: 'word',
    jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image', bmp: 'image',
    pptx: 'powerpoint', ppt: 'powerpoint',
  };
  return types[ext] || 'unknown';
}

function getMimeType(fileName) {
  const ext = fileName.toLowerCase().split('.').pop();
  const types = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
  };
  return types[ext] || 'image/png';
}

app.listen(3001, () => {
  console.log(`\n🚀 BACKEND READY - Port 3001\n`);
});