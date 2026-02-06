// cim-backend.js - CIM Generation Backend
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

app.post('/api/cim-generation', async (req, res) => {
  try {
    const { documents, vaultName } = req.body;

    if (!documents || documents.length === 0) {
      return res.status(400).json({ error: 'No documents provided' });
    }

    if (!vaultName) {
      return res.status(400).json({ error: 'Vault name required' });
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log(`📊 CIM GENERATION - ${vaultName}`);
    console.log(`Processing: ${documents.length} files`);
    console.log(`${'='.repeat(70)}\n`);

    console.log('STEP 1: EXTRACTING DOCUMENT DATA\n');
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
          extracted: extractedText.substring(0, 8000),
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
          extracted: `[ERROR: ${error.message}]`,
          method: 'Error',
        });
      }
    }

    console.log(`\n✅ Extracted: ${successCount}/${documents.length}`);
    console.log(`❌ Errors: ${errorCount}/${documents.length}\n`);

    console.log('STEP 2: GENERATING CIM SECTIONS WITH CLAUDE\n');

    const prompt = `You are a professional investment banking analyst. Generate a comprehensive Confidential Information Memorandum (CIM) in HTML format.

⚠️ CRITICAL INSTRUCTIONS:
1. The company name is "${vaultName}" - use this name throughout, ignore any other names in documents
2. Generate the report as clean HTML with proper styling
3. Do NOT use markdown symbols like #, ##, ###, ---, ***, etc.
4. Use proper HTML tags: <h1>, <h2>, <h3>, <p>, <table>, <strong>, <ul>, <li>
5. Never include personal names - use role titles only
6. Fill in ALL sections with REAL data from the extracted documents below
7. If data is not available, write "Data not available in provided documents"

EXTRACTED DOCUMENT DATA:
${extractedData
  .map(
    (d, i) => `
[Document ${i + 1}: ${d.fileName}]
Type: ${d.fileType} | Method: ${d.method}
Content:
${d.extracted}
---`
  )
  .join('\n')}

Generate the COMPLETE CIM report with this EXACT HTML structure and fill in all sections with actual data:

<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
body {
  font-family: 'Georgia', 'Times New Roman', serif;
  line-height: 1.6;
  color: #1a1a1a;
  max-width: 900px;
  margin: 0 auto;
  padding: 40px;
  background: #ffffff;
}

.cover-page {
  text-align: center;
  padding: 100px 40px;
  border: 3px double #2c5282;
  margin-bottom: 60px;
  background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
}

.cover-page h1 {
  font-size: 36px;
  color: #1a365d;
  margin-bottom: 20px;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 2px;
}

.cover-page .subtitle {
  font-size: 24px;
  color: #2d3748;
  margin-bottom: 40px;
  font-style: italic;
}

.cover-page .confidential {
  font-size: 16px;
  color: #c53030;
  font-weight: bold;
  margin-top: 30px;
  padding: 15px 30px;
  border: 2px solid #c53030;
  display: inline-block;
  background: #fff;
}

.section {
  margin: 50px 0;
  page-break-inside: avoid;
  border-left: 5px solid #2c5282;
  padding-left: 25px;
}

.section-number {
  font-size: 28px;
  color: #1a365d;
  font-weight: bold;
  margin-bottom: 10px;
  display: block;
}

.section-title {
  font-size: 24px;
  color: #2c5282;
  font-weight: bold;
  margin-bottom: 25px;
  text-transform: uppercase;
  letter-spacing: 1px;
  border-bottom: 3px solid #2c5282;
  padding-bottom: 10px;
}

.subsection {
  margin: 30px 0 30px 20px;
}

.subsection-title {
  font-size: 18px;
  color: #2d3748;
  font-weight: bold;
  margin-bottom: 15px;
  padding-left: 15px;
  border-left: 3px solid #4a5568;
}

p {
  margin: 12px 0;
  text-align: justify;
  font-size: 14px;
  line-height: 1.8;
}

ul {
  margin: 15px 0;
  padding-left: 40px;
}

li {
  margin: 10px 0;
  line-height: 1.6;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin: 25px 0;
  background: white;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

th {
  background: #2c5282;
  color: white;
  padding: 12px;
  text-align: left;
  font-weight: bold;
  border: 1px solid #1a365d;
}

td {
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
}

tr:nth-child(even) {
  background: #f7fafc;
}

.highlight-box {
  background: #edf2f7;
  border-left: 5px solid #4299e1;
  padding: 20px;
  margin: 25px 0;
  border-radius: 0 8px 8px 0;
}

.financial-metric {
  background: #f0fff4;
  border-left: 4px solid #38a169;
  padding: 15px;
  margin: 15px 0;
}

.risk-box {
  background: #fff5f5;
  border-left: 4px solid #e53e3e;
  padding: 15px;
  margin: 15px 0;
}

strong {
  color: #1a365d;
  font-weight: 600;
}

.page-break {
  page-break-after: always;
}

hr {
  border: none;
  border-top: 2px solid #cbd5e0;
  margin: 40px 0;
}
</style>
</head>
<body>

<div class="cover-page">
  <h1>${vaultName}</h1>
  <div class="subtitle">Confidential Information Memorandum</div>
  <div style="margin: 30px 0; color: #4a5568;">
    <p style="margin: 5px 0;">Strategic Investment Opportunity</p>
    <p style="margin: 5px 0;">November 2024</p>
  </div>
  <div class="confidential">STRICTLY PRIVATE AND CONFIDENTIAL</div>
</div>

<div class="page-break"></div>

<div class="section">
  <span class="section-number">1.0</span>
  <h2 class="section-title">EXECUTIVE SUMMARY</h2>

  <div class="subsection">
    <h3 class="subsection-title">Company Overview</h3>
    <p>[Write detailed business model and value proposition for ${vaultName} based on extracted documents]</p>
  </div>

  <div class="subsection">
    <h3 class="subsection-title">Key Financial Highlights</h3>
    <div class="financial-metric">
      <p><strong>Revenue Growth:</strong> [Insert actual growth rate from documents]</p>
      <p><strong>Gross Margin:</strong> [Insert actual margin from documents]</p>
      <p><strong>EBITDA Margin:</strong> [Insert actual margin from documents]</p>
    </div>
    <table>
      <tr>
        <th>Metric</th>
        <th>FY 2022-23</th>
        <th>FY 2023-24</th>
        <th>FY 2024-25</th>
      </tr>
      <tr>
        <td>Revenue (₹ Cr)</td>
        <td>[Data from docs]</td>
        <td>[Data from docs]</td>
        <td>[Data from docs]</td>
      </tr>
      <tr>
        <td>Gross Margin %</td>
        <td>[Data from docs]</td>
        <td>[Data from docs]</td>
        <td>[Data from docs]</td>
      </tr>
      <tr>
        <td>EBITDA (₹ Cr)</td>
        <td>[Data from docs]</td>
        <td>[Data from docs]</td>
        <td>[Data from docs]</td>
      </tr>
    </table>
  </div>

  <div class="subsection">
    <h3 class="subsection-title">Investment Thesis</h3>
    <div class="highlight-box">
      <p><strong>Why ${vaultName} Represents a Compelling Investment Opportunity:</strong></p>
      <ul>
        <li>[Key investment point 1 from documents]</li>
        <li>[Key investment point 2 from documents]</li>
        <li>[Key investment point 3 from documents]</li>
        <li>[Key investment point 4 from documents]</li>
      </ul>
    </div>
  </div>

  <div class="subsection">
    <h3 class="subsection-title">Transaction Overview</h3>
    <p>[Transaction details from documents, or "Data not available in provided documents"]</p>
  </div>
</div>

<hr>

<div class="section">
  <span class="section-number">2.0</span>
  <h2 class="section-title">BUSINESS OVERVIEW</h2>

  <div class="subsection">
    <h3 class="subsection-title">Industry & Market Analysis</h3>
    <p>[Write detailed market analysis from extracted documents]</p>

    <table>
      <tr>
        <th>Market Segment</th>
        <th>2024 Size</th>
        <th>2028 Projection</th>
        <th>CAGR</th>
      </tr>
      <tr>
        <td>[Segment name from docs]</td>
        <td>[Size from docs]</td>
        <td>[Projection from docs]</td>
        <td>[CAGR from docs]</td>
      </tr>
    </table>

    <p><strong>Market Drivers:</strong></p>
    <ul>
      <li>[Driver 1 from documents]</li>
      <li>[Driver 2 from documents]</li>
      <li>[Driver 3 from documents]</li>
    </ul>
  </div>

  <div class="subsection">
    <h3 class="subsection-title">Products & Services</h3>
    <p>[Detailed product portfolio from documents]</p>

    <table>
      <tr>
        <th>Product Category</th>
        <th>Share of Sales</th>
        <th>Price Range</th>
        <th>Key Products</th>
      </tr>
      <tr>
        <td>[Category from docs]</td>
        <td>[Share from docs]</td>
        <td>[Price from docs]</td>
        <td>[Products from docs]</td>
      </tr>
    </table>
  </div>

  <div class="subsection">
    <h3 class="subsection-title">Customer Profile</h3>
    <p>[Customer demographics and segments from documents]</p>

    <div class="highlight-box">
      <p><strong>Key Customer Metrics:</strong></p>
      <ul>
        <li><strong>Total Customer Base:</strong> [Number from documents]</li>
        <li><strong>Repeat Purchase Rate:</strong> [Rate from documents]</li>
        <li><strong>Average Order Value:</strong> [Value from documents]</li>
      </ul>
    </div>
  </div>

  <div class="subsection">
    <h3 class="subsection-title">Competitive Positioning</h3>
    <p>[Competitive analysis from documents]</p>

    <table>
      <tr>
        <th>Brand</th>
        <th>Positioning</th>
        <th>ASP (₹)</th>
        <th>Strengths</th>
      </tr>
      <tr>
        <td>[Competitor from docs]</td>
        <td>[Position from docs]</td>
        <td>[Price from docs]</td>
        <td>[Strengths from docs]</td>
      </tr>
    </table>

    <div class="highlight-box">
      <p><strong>Why ${vaultName} Wins:</strong></p>
      <ul>
        <li>[Competitive advantage 1 from documents]</li>
        <li>[Competitive advantage 2 from documents]</li>
        <li>[Competitive advantage 3 from documents]</li>
      </ul>
    </div>
  </div>
</div>

<hr>

<div class="section">
  <span class="section-number">3.0</span>
  <h2 class="section-title">FINANCIAL PERFORMANCE</h2>

  <div class="subsection">
    <h3 class="subsection-title">Historical Financials (3 Years)</h3>

    <table>
      <tr>
        <th>Particulars</th>
        <th>FY 2022-23</th>
        <th>FY 2023-24</th>
        <th>FY 2024-25</th>
      </tr>
      <tr>
        <td><strong>Revenue from Operations (₹ Cr)</strong></td>
        <td>[Data from docs]</td>
        <td>[Data from docs]</td>
        <td>[Data from docs]</td>
      </tr>
      <tr>
        <td>Cost of Goods Sold (₹ Cr)</td>
        <td>[Data from docs]</td>
        <td>[Data from docs]</td>
        <td>[Data from docs]</td>
      </tr>
      <tr>
        <td><strong>Gross Profit (₹ Cr)</strong></td>
        <td>[Data from docs]</td>
        <td>[Data from docs]</td>
        <td>[Data from docs]</td>
      </tr>
      <tr>
        <td>Gross Margin %</td>
        <td>[Data from docs]</td>
        <td>[Data from docs]</td>
        <td>[Data from docs]</td>
      </tr>
      <tr>
        <td>Operating Expenses (₹ Cr)</td>
        <td>[Data from docs]</td>
        <td>[Data from docs]</td>
        <td>[Data from docs]</td>
      </tr>
      <tr>
        <td><strong>EBITDA (₹ Cr)</strong></td>
        <td>[Data from docs]</td>
        <td>[Data from docs]</td>
        <td>[Data from docs]</td>
      </tr>
      <tr>
        <td>EBITDA Margin %</td>
        <td>[Data from docs]</td>
        <td>[Data from docs]</td>
        <td>[Data from docs]</td>
      </tr>
      <tr>
        <td><strong>Net Profit (₹ Cr)</strong></td>
        <td>[Data from docs]</td>
        <td>[Data from docs]</td>
        <td>[Data from docs]</td>
      </tr>
      <tr>
        <td>Net Margin %</td>
        <td>[Data from docs]</td>
        <td>[Data from docs]</td>
        <td>[Data from docs]</td>
      </tr>
    </table>

    <div class="financial-metric">
      <p><strong>3-Year Revenue CAGR:</strong> [Calculate and insert from documents]</p>
      <p><strong>3-Year EBITDA CAGR:</strong> [Calculate and insert from documents]</p>
    </div>
  </div>

  <div class="subsection">
    <h3 class="subsection-title">Profitability Analysis</h3>
    <p>[Detailed profitability analysis from documents]</p>
  </div>

  <div class="subsection">
    <h3 class="subsection-title">Working Capital Analysis</h3>

    <table>
      <tr>
        <th>Component</th>
        <th>Amount (₹ Lakhs)</th>
        <th>Days</th>
      </tr>
      <tr>
        <td>Inventory</td>
        <td>[Data from docs]</td>
        <td>[Data from docs]</td>
      </tr>
      <tr>
        <td>Accounts Receivable</td>
        <td>[Data from docs]</td>
        <td>[Data from docs]</td>
      </tr>
      <tr>
        <td>Accounts Payable</td>
        <td>[Data from docs]</td>
        <td>[Data from docs]</td>
      </tr>
      <tr>
        <td><strong>Net Working Capital</strong></td>
        <td>[Data from docs]</td>
        <td>[Data from docs]</td>
      </tr>
    </table>

    <div class="financial-metric">
      <p><strong>Cash Conversion Cycle:</strong> [Calculate from documents] days</p>
      <p>[Explain the working capital efficiency from documents]</p>
    </div>
  </div>

  <div class="subsection">
    <h3 class="subsection-title">Key Financial Ratios</h3>

    <table>
      <tr>
        <th>Ratio</th>
        <th>FY 2022-23</th>
        <th>FY 2023-24</th>
        <th>FY 2024-25</th>
      </tr>
      <tr>
        <td>Current Ratio</td>
        <td>[Data from docs]</td>
        <td>[Data from docs]</td>
        <td>[Data from docs]</td>
      </tr>
      <tr>
        <td>Quick Ratio</td>
        <td>[Data from docs]</td>
        <td>[Data from docs]</td>
        <td>[Data from docs]</td>
      </tr>
      <tr>
        <td>Debt-to-Equity</td>
        <td>[Data from docs]</td>
        <td>[Data from docs]</td>
        <td>[Data from docs]</td>
      </tr>
      <tr>
        <td>Return on Equity %</td>
        <td>[Data from docs]</td>
        <td>[Data from docs]</td>
        <td>[Data from docs]</td>
      </tr>
      <tr>
        <td>Asset Turnover</td>
        <td>[Data from docs]</td>
        <td>[Data from docs]</td>
        <td>[Data from docs]</td>
      </tr>
    </table>
  </div>
</div>

<hr>

<div class="section">
  <span class="section-number">4.0</span>
  <h2 class="section-title">MANAGEMENT & ORGANIZATION</h2>

  <div class="subsection">
    <h3 class="subsection-title">Organizational Structure</h3>
    <p>[Describe organizational structure from documents - use role titles only, no personal names]</p>

    <div class="highlight-box">
      <p><strong>Department Structure:</strong></p>
      <ul>
        <li><strong>Executive/Strategy:</strong> [Headcount and responsibilities from documents]</li>
        <li><strong>Operations:</strong> [Headcount and responsibilities from documents]</li>
        <li><strong>Marketing:</strong> [Headcount and responsibilities from documents]</li>
        <li><strong>Finance:</strong> [Headcount and responsibilities from documents]</li>
        <li><strong>Manufacturing:</strong> [Headcount and responsibilities from documents]</li>
      </ul>
      <p><strong>Total Team Size:</strong> [Number from documents]</p>
    </div>
  </div>

  <div class="subsection">
    <h3 class="subsection-title">Leadership Team</h3>
    <p>[Describe leadership using ONLY role titles from documents - NO personal names]</p>

    <table>
      <tr>
        <th>Role</th>
        <th>Function</th>
        <th>Key Responsibilities</th>
        <th>Experience</th>
      </tr>
      <tr>
        <td>Founder/CEO</td>
        <td>[Function from docs]</td>
        <td>[Responsibilities from docs]</td>
        <td>[Experience from docs]</td>
      </tr>
      <tr>
        <td>[Other key role]</td>
        <td>[Function from docs]</td>
        <td>[Responsibilities from docs]</td>
        <td>[Experience from docs]</td>
      </tr>
    </table>
  </div>

  <div class="subsection">
    <h3 class="subsection-title">Governance</h3>
    <p>[Governance structure from documents]</p>
  </div>
</div>

<hr>

<div class="section">
  <span class="section-number">5.0</span>
  <h2 class="section-title">GROWTH & INVESTMENT OPPORTUNITY</h2>

  <div class="subsection">
    <h3 class="subsection-title">Market Opportunity</h3>

    <table>
      <tr>
        <th>Market Tier</th>
        <th>Definition</th>
        <th>Size (₹ Cr)</th>
      </tr>
      <tr>
        <td><strong>TAM</strong></td>
        <td>[Definition from docs]</td>
        <td>[Size from docs]</td>
      </tr>
      <tr>
        <td><strong>SAM</strong></td>
        <td>[Definition from docs]</td>
        <td>[Size from docs]</td>
      </tr>
      <tr>
        <td><strong>SOM</strong></td>
        <td>[Definition from docs]</td>
        <td>[Size from docs]</td>
      </tr>
    </table>

    <p><strong>Market Growth Drivers:</strong></p>
    <ul>
      <li>[Driver 1 from documents]</li>
      <li>[Driver 2 from documents]</li>
      <li>[Driver 3 from documents]</li>
    </ul>
  </div>

  <div class="subsection">
    <h3 class="subsection-title">Strategic Initiatives</h3>

    <div class="highlight-box">
      <p><strong>Near-Term Growth Plan (12-24 Months):</strong></p>
      <ul>
        <li>[Initiative 1 from documents with expected impact]</li>
        <li>[Initiative 2 from documents with expected impact]</li>
        <li>[Initiative 3 from documents with expected impact]</li>
      </ul>
    </div>

    <p><strong>Product & Category Expansion:</strong></p>
    <p>[Details from documents]</p>

    <p><strong>Geographic Expansion:</strong></p>
    <p>[Details from documents]</p>

    <p><strong>Technology Investments:</strong></p>
    <p>[Details from documents]</p>
  </div>

  <div class="subsection">
    <h3 class="subsection-title">Financial Projections (3-5 Years)</h3>

    <table>
      <tr>
        <th>Metric</th>
        <th>FY26</th>
        <th>FY27</th>
        <th>FY28</th>
        <th>FY29</th>
        <th>FY30</th>
      </tr>
      <tr>
        <td>Revenue (₹ Cr)</td>
        <td>[From docs]</td>
        <td>[From docs]</td>
        <td>[From docs]</td>
        <td>[From docs]</td>
        <td>[From docs]</td>
      </tr>
      <tr>
        <td>Growth %</td>
        <td>[From docs]</td>
        <td>[From docs]</td>
        <td>[From docs]</td>
        <td>[From docs]</td>
        <td>[From docs]</td>
      </tr>
      <tr>
        <td>Gross Margin %</td>
        <td>[From docs]</td>
        <td>[From docs]</td>
        <td>[From docs]</td>
        <td>[From docs]</td>
        <td>[From docs]</td>
      </tr>
      <tr>
        <td>EBITDA (₹ Cr)</td>
        <td>[From docs]</td>
        <td>[From docs]</td>
        <td>[From docs]</td>
        <td>[From docs]</td>
        <td>[From docs]</td>
      </tr>
      <tr>
        <td>EBITDA Margin %</td>
        <td>[From docs]</td>
        <td>[From docs]</td>
        <td>[From docs]</td>
        <td>[From docs]</td>
        <td>[From docs]</td>
      </tr>
    </table>

    <p><strong>Key Assumptions:</strong></p>
    <ul>
      <li>[Assumption 1 from documents]</li>
      <li>[Assumption 2 from documents]</li>
      <li>[Assumption 3 from documents]</li>
    </ul>
  </div>

  <div class="subsection">
    <h3 class="subsection-title">Valuation Considerations</h3>

    <div class="financial-metric">
      <p><strong>Transaction Parameters:</strong></p>
      <ul>
        <li><strong>Asking Valuation:</strong> [From documents]</li>
        <li><strong>Recommended Bid Range:</strong> [From documents]</li>
        <li><strong>Implied Revenue Multiple:</strong> [From documents]</li>
        <li><strong>Implied EBITDA Multiple:</strong> [From documents]</li>
      </ul>
    </div>

    <table>
      <tr>
        <th>Company</th>
        <th>Revenue (₹ Cr)</th>
        <th>Valuation (₹ Cr)</th>
        <th>Multiple</th>
      </tr>
      <tr>
        <td>[Comparable company from docs]</td>
        <td>[Revenue from docs]</td>
        <td>[Valuation from docs]</td>
        <td>[Multiple from docs]</td>
      </tr>
    </table>
  </div>
</div>

<hr>

<div class="section">
  <span class="section-number">6.0</span>
  <h2 class="section-title">RISK FACTORS</h2>

  <div class="subsection">
    <h3 class="subsection-title">Compliance & Regulatory</h3>

    <table>
      <tr>
        <th>Parameter</th>
        <th>Status</th>
      </tr>
      <tr>
        <td>GST Registration</td>
        <td>[Status from documents]</td>
      </tr>
      <tr>
        <td>GSTR-1 Filing</td>
        <td>[Status from documents]</td>
      </tr>
      <tr>
        <td>GSTR-3B Filing</td>
        <td>[Status from documents]</td>
      </tr>
      <tr>
        <td>Income Tax Returns</td>
        <td>[Status from documents]</td>
      </tr>
      <tr>
        <td>Trademark Registration</td>
        <td>[Status from documents]</td>
      </tr>
    </table>

    <div class="highlight-box">
      <p><strong>Compliance Summary:</strong> [Overall compliance status from documents]</p>
    </div>
  </div>

  <div class="subsection">
    <h3 class="subsection-title">Operational Risks</h3>

    <div class="risk-box">
      <p><strong>Risk:</strong> Supply Chain Dependencies</p>
      <p><strong>Severity:</strong> [From documents]</p>
      <p><strong>Details:</strong> [Details from documents]</p>
      <p><strong>Mitigation:</strong> [Mitigation strategy from documents]</p>
    </div>

    <div class="risk-box">
      <p><strong>Risk:</strong> Manufacturing/Production Capacity</p>
      <p><strong>Severity:</strong> [From documents]</p>
      <p><strong>Details:</strong> [Details from documents]</p>
      <p><strong>Mitigation:</strong> [Mitigation strategy from documents]</p>
    </div>

    <div class="risk-box">
      <p><strong>Risk:</strong> Technology Platform Dependency</p>
      <p><strong>Severity:</strong> [From documents]</p>
      <p><strong>Details:</strong> [Details from documents]</p>
      <p><strong>Mitigation:</strong> [Mitigation strategy from documents]</p>
    </div>

    <div class="risk-box">
      <p><strong>Risk:</strong> Key Person/Founder Dependency</p>
      <p><strong>Severity:</strong> [From documents]</p>
      <p><strong>Details:</strong> [Details from documents]</p>
      <p><strong>Mitigation:</strong> [Mitigation strategy from documents]</p>
    </div>
  </div>

  <div class="subsection">
    <h3 class="subsection-title">Market & Financial Risks</h3>

    <div class="risk-box">
      <p><strong>Risk:</strong> Market Competition</p>
      <p><strong>Severity:</strong> [From documents]</p>
      <p><strong>Details:</strong> [Details from documents]</p>
      <p><strong>Mitigation:</strong> [Mitigation strategy from documents]</p>
    </div>

    <div class="risk-box">
      <p><strong>Risk:</strong> Customer Concentration</p>
      <p><strong>Severity:</strong> [From documents]</p>
      <p><strong>Details:</strong> [Details from documents]</p>
      <p><strong>Mitigation:</strong> [Mitigation strategy from documents]</p>
    </div>

    <div class="risk-box">
      <p><strong>Risk:</strong> Marketing Cost Inflation</p>
      <p><strong>Severity:</strong> [From documents]</p>
      <p><strong>Details:</strong> [Details from documents]</p>
      <p><strong>Mitigation:</strong> [Mitigation strategy from documents]</p>
    </div>

    <div class="risk-box">
      <p><strong>Risk:</strong> Platform Algorithm Changes</p>
      <p><strong>Severity:</strong> [From documents]</p>
      <p><strong>Details:</strong> [Details from documents]</p>
      <p><strong>Mitigation:</strong> [Mitigation strategy from documents]</p>
    </div>
  </div>

  <div class="subsection">
    <h3 class="subsection-title">Overall Risk Assessment</h3>
    <p>[Summary of risk profile and overall assessment from documents]</p>
  </div>
</div>

<hr style="margin: 60px 0;">

<div style="text-align: center; color: #4a5568; padding: 40px 0;">
  <p><strong>END OF CONFIDENTIAL INFORMATION MEMORANDUM</strong></p>
  <p style="margin-top: 20px;">Prepared: November 2024</p>
  <p>Version 1.0</p>
</div>

</body>
</html>`;

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 15000,
      messages: [{ role: 'user', content: prompt }],
    });

   let cimReport = message.content[0].type === 'text' ? message.content[0].text : '';

// POST-PROCESSING: Replace FOOMER with actual vault name
console.log(`Post-processing: Replacing company names with "${vaultName}"...`);
cimReport = cimReport.replace(/FOOMER/g, vaultName);
cimReport = cimReport.replace(/Foomer/g, vaultName);
cimReport = cimReport.replace(/foomer/g, vaultName);  // ✅ CORRECT
cimReport = cimReport.replace(/trade name "FOOMER"/gi, `trade name "${vaultName}"`);
cimReport = cimReport.replace(/operating under the trade name "FOOMER"/gi, `operating under the trade name "${vaultName}"`);
cimReport = cimReport.replace(/under the trade name FOOMER/gi, `under the trade name ${vaultName}`);

console.log(`✅ CIM GENERATION COMPLETE (FOOMER replaced with ${vaultName})\n`);

    res.json({
      cimReport,
      vaultName,
      filesAnalyzed: documents.length,
      extractionStats: {
        successful: successCount,
        failed: errorCount,
      },
      timestamp: new Date().toISOString(),
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
      } catch (e) {}
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

app.listen(3003, () => {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🚀 CIM GENERATION BACKEND READY`);
  console.log(`Port: 3003`);
  console.log(`Features:`);
  console.log(`  ✅ Document extraction`);
  console.log(`  ✅ 6-section CIM generation`);
  console.log(`  ✅ Professional HTML formatting`);
  console.log(`  ✅ Claude AI powered`);
  console.log(`${'='.repeat(70)}\n`);
});