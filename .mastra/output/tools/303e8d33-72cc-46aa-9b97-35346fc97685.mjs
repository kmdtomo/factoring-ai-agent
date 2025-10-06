import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import axios from 'axios';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import path from 'path';

let visionClient;
if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
  const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
  visionClient = new ImageAnnotatorClient({ credentials });
} else {
  const authPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (authPath && !path.isAbsolute(authPath)) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(process.cwd(), authPath);
  }
  visionClient = new ImageAnnotatorClient();
}
const getKintoneConfig = () => ({
  KINTONE_DOMAIN: process.env.KINTONE_DOMAIN || "",
  KINTONE_API_TOKEN: process.env.KINTONE_API_TOKEN || "",
  APP_ID: process.env.KINTONE_APP_ID || "37"
});
const googleVisionBankStatementOcrToolImproved = createTool({
  id: "google-vision-bank-statement-ocr-improved",
  description: "\u30E1\u30A4\u30F3\u901A\u5E33\u3068\u30B5\u30D6\u901A\u5E33\u3092\u4E00\u62EC\u3067OCR\u51E6\u7406\uFF08textAnnotations\u4F75\u7528\u3067\u30DE\u30FC\u30AB\u30FC\u4ED8\u304D\u30C6\u30AD\u30B9\u30C8\u3082\u691C\u51FA\uFF09",
  inputSchema: z.object({
    recordId: z.string().describe("Kintone\u30EC\u30B3\u30FC\u30C9ID"),
    mainBankFieldName: z.string().describe("\u30E1\u30A4\u30F3\u901A\u5E33\u306E\u30D5\u30A3\u30FC\u30EB\u30C9\u540D").default("\u30E1\u30A4\u30F3\u901A\u5E33\uFF3F\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB"),
    subBankFieldName: z.string().describe("\u30B5\u30D6\u901A\u5E33\u306E\u30D5\u30A3\u30FC\u30EB\u30C9\u540D").default("\u305D\u306E\u4ED6\u901A\u5E33\uFF3F\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB"),
    maxPagesPerFile: z.number().describe("1\u30D5\u30A1\u30A4\u30EB\u3042\u305F\u308A\u306E\u6700\u5927\u51E6\u7406\u30DA\u30FC\u30B8\u6570").default(50)
  }).describe("Google Vision OCR\u51E6\u7406\u306E\u5165\u529B\u30D1\u30E9\u30E1\u30FC\u30BF"),
  outputSchema: z.object({
    success: z.boolean(),
    processingDetails: z.object({
      recordId: z.string(),
      processedFiles: z.object({
        mainBank: z.number(),
        subBank: z.number(),
        total: z.number()
      }).describe("\u51E6\u7406\u3055\u308C\u305F\u30D5\u30A1\u30A4\u30EB\u6570"),
      totalPages: z.number(),
      timestamp: z.string()
    }).describe("\u51E6\u7406\u8A73\u7D30\u60C5\u5831"),
    mainBankDocuments: z.array(z.object({
      fileName: z.string().describe("\u30D5\u30A1\u30A4\u30EB\u540D"),
      text: z.string().describe("\u62BD\u51FA\u3055\u308C\u305F\u30C6\u30AD\u30B9\u30C8"),
      pageCount: z.number().describe("\u30DA\u30FC\u30B8\u6570"),
      confidence: z.number().describe("\u4FE1\u983C\u5EA6"),
      tokenEstimate: z.number().describe("\u63A8\u5B9A\u30C8\u30FC\u30AF\u30F3\u6570")
    })).describe("\u30E1\u30A4\u30F3\u901A\u5E33\u30C9\u30AD\u30E5\u30E1\u30F3\u30C8\u30EA\u30B9\u30C8"),
    subBankDocuments: z.array(z.object({
      fileName: z.string().describe("\u30D5\u30A1\u30A4\u30EB\u540D"),
      text: z.string().describe("\u62BD\u51FA\u3055\u308C\u305F\u30C6\u30AD\u30B9\u30C8"),
      pageCount: z.number().describe("\u30DA\u30FC\u30B8\u6570"),
      confidence: z.number().describe("\u4FE1\u983C\u5EA6"),
      tokenEstimate: z.number().describe("\u63A8\u5B9A\u30C8\u30FC\u30AF\u30F3\u6570")
    })).describe("\u30B5\u30D6\u901A\u5E33\u30C9\u30AD\u30E5\u30E1\u30F3\u30C8\u30EA\u30B9\u30C8"),
    costAnalysis: z.object({
      googleVisionCost: z.number(),
      perDocumentType: z.object({
        mainBank: z.number(),
        subBank: z.number()
      }).describe("\u30C9\u30AD\u30E5\u30E1\u30F3\u30C8\u30BF\u30A4\u30D7\u5225\u30B3\u30B9\u30C8"),
      estimatedSavings: z.number()
    }).describe("\u30B3\u30B9\u30C8\u5206\u6790"),
    error: z.string().optional()
  }).describe("Google Vision OCR\u51E6\u7406\u306E\u51FA\u529B\u7D50\u679C"),
  execute: async ({ context }) => {
    const { recordId, mainBankFieldName, subBankFieldName, maxPagesPerFile } = context;
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    const { KINTONE_DOMAIN, KINTONE_API_TOKEN, APP_ID } = getKintoneConfig();
    if (!KINTONE_DOMAIN || !KINTONE_API_TOKEN) {
      throw new Error("Kintone\u74B0\u5883\u5909\u6570\u304C\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093");
    }
    try {
      const recordUrl = `https://${KINTONE_DOMAIN}/k/v1/records.json?app=${APP_ID}&query=$id="${recordId}"`;
      const recordResponse = await axios.get(recordUrl, {
        headers: {
          "X-Cybozu-API-Token": KINTONE_API_TOKEN
        }
      });
      if (recordResponse.data.records.length === 0) {
        return {
          success: false,
          processingDetails: {
            recordId,
            processedFiles: { mainBank: 0, subBank: 0, total: 0 },
            totalPages: 0,
            timestamp
          },
          mainBankDocuments: [],
          subBankDocuments: [],
          costAnalysis: {
            googleVisionCost: 0,
            perDocumentType: { mainBank: 0, subBank: 0 },
            estimatedSavings: 0
          },
          error: "\u6307\u5B9A\u3055\u308C\u305F\u30EC\u30B3\u30FC\u30C9ID\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002"
        };
      }
      const record = recordResponse.data.records[0];
      const mainBankFiles = record[mainBankFieldName]?.value || [];
      const subBankFiles = record[subBankFieldName]?.value || [];
      console.log(`[\u901A\u5E33OCR\u6539\u5584\u7248] \u30D5\u30A1\u30A4\u30EB\u53D6\u5F97\u7D50\u679C:`);
      console.log(`  - \u30E1\u30A4\u30F3\u901A\u5E33: ${mainBankFiles.length}\u4EF6`);
      console.log(`  - \u30B5\u30D6\u901A\u5E33: ${subBankFiles.length}\u4EF6`);
      console.log(`  - \u51E6\u7406\u5BFE\u8C61\u5408\u8A08: ${mainBankFiles.length + subBankFiles.length}\u4EF6`);
      const processFiles = async (files, documentType) => {
        const results = [];
        let totalCost = 0;
        for (const file of files) {
          console.log(`
[${documentType}] \u51E6\u7406\u4E2D: ${file.name}`);
          const downloadUrl = `https://${KINTONE_DOMAIN}/k/v1/file.json?fileKey=${file.fileKey}`;
          const fileResponse = await axios.get(downloadUrl, {
            headers: {
              "X-Cybozu-API-Token": KINTONE_API_TOKEN
            },
            responseType: "arraybuffer"
          });
          const base64Content = Buffer.from(fileResponse.data).toString("base64");
          const isPDF = file.contentType === "application/pdf";
          let extractedText = "";
          let confidence = 0;
          let pageCount = 1;
          if (isPDF) {
            console.log(`[${documentType}] PDF\u3092\u51E6\u7406\u4E2D\uFF08textAnnotations\u4F75\u7528\uFF09...`);
            let actualPageCount = 0;
            try {
              const testRequest = {
                requests: [{
                  inputConfig: {
                    content: base64Content,
                    mimeType: "application/pdf"
                  },
                  features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
                  pages: [1]
                }]
              };
              const [testResult] = await visionClient.batchAnnotateFiles(testRequest);
              actualPageCount = testResult.responses?.[0]?.totalPages || maxPagesPerFile;
              console.log(`[${documentType}] PDF\u306E\u7DCF\u30DA\u30FC\u30B8\u6570: ${actualPageCount}\u30DA\u30FC\u30B8`);
            } catch (error) {
              console.error(`[${documentType}] \u30DA\u30FC\u30B8\u6570\u78BA\u8A8D\u30A8\u30E9\u30FC:`, error.message);
              actualPageCount = maxPagesPerFile;
            }
            const pagesToProcess = Math.min(actualPageCount, maxPagesPerFile);
            const pageTexts = [];
            let totalProcessedPages = 0;
            const batchSize = 5;
            const numBatches = Math.ceil(pagesToProcess / batchSize);
            console.log(`[${documentType}] \u30D0\u30C3\u30C1\u51E6\u7406\u958B\u59CB: ${pagesToProcess}\u30DA\u30FC\u30B8\u3001${numBatches}\u30D0\u30C3\u30C1`);
            for (let batch = 0; batch < numBatches; batch++) {
              const startPage = batch * batchSize + 1;
              const endPage = Math.min(startPage + batchSize - 1, pagesToProcess);
              const pagesToProcessInBatch = Array.from(
                { length: endPage - startPage + 1 },
                (_, i) => startPage + i
              );
              console.log(`  \u30D0\u30C3\u30C1${batch + 1}/${numBatches}: \u30DA\u30FC\u30B8${startPage}-${endPage}...`);
              try {
                const request = {
                  requests: [{
                    inputConfig: {
                      content: base64Content,
                      mimeType: "application/pdf"
                    },
                    features: [
                      { type: "DOCUMENT_TEXT_DETECTION" },
                      // メインのテキスト検出
                      { type: "TEXT_DETECTION" }
                      // 補助的なテキスト検出
                    ],
                    pages: pagesToProcessInBatch,
                    imageContext: {
                      languageHints: ["ja"]
                      // 日本語ヒント
                    }
                  }]
                };
                const [result] = await visionClient.batchAnnotateFiles(request);
                if (result.responses?.[0]) {
                  const response = result.responses[0];
                  const pages = response.responses || [];
                  console.log(`    [DEBUG] \u30D0\u30C3\u30C1${batch + 1}: ${pages.length}\u30DA\u30FC\u30B8\u306E\u30EC\u30B9\u30DD\u30F3\u30B9\u53D6\u5F97`);
                  for (const page of pages) {
                    const texts = [];
                    console.log(`    [DEBUG] \u30DA\u30FC\u30B8${totalProcessedPages + 1}: \u30AA\u30D6\u30B8\u30A7\u30AF\u30C8\u30AD\u30FC = ${Object.keys(page).join(", ")}`);
                    console.log(`    [DEBUG]   - fullTextAnnotation\u5B58\u5728: ${!!page.fullTextAnnotation}`);
                    console.log(`    [DEBUG]   - textAnnotations\u5B58\u5728: ${!!page.textAnnotations}`);
                    console.log(`    [DEBUG]   - textAnnotations\u9577\u3055: ${page.textAnnotations?.length || 0}`);
                    if (page.fullTextAnnotation?.text) {
                      texts.push(page.fullTextAnnotation.text);
                      console.log(`    [DEBUG]   - fullTextAnnotation: ${page.fullTextAnnotation.text.length}\u6587\u5B57`);
                    } else {
                      console.log(`    [DEBUG]   - fullTextAnnotation: \u306A\u3057`);
                    }
                    if (page.textAnnotations && page.textAnnotations.length > 0) {
                      console.log(`    [DEBUG]   - textAnnotations\u51E6\u7406\u958B\u59CB: ${page.textAnnotations.length}\u4EF6`);
                      const individualTexts = page.textAnnotations.slice(1).map((annotation) => annotation.description).filter((text) => text && text.trim().length > 0);
                      console.log(`    [DEBUG]   - \u500B\u5225\u30C6\u30AD\u30B9\u30C8\uFF080\u756A\u76EE\u9664\u5916\u5F8C\uFF09: ${individualTexts.length}\u4EF6`);
                      const uniqueTexts = [...new Set(individualTexts)];
                      console.log(`    [DEBUG]   - \u30E6\u30CB\u30FC\u30AF\u5316\u5F8C: ${uniqueTexts.length}\u4EF6`);
                      if (uniqueTexts.length > 0) {
                        texts.push("\n--- \u500B\u5225\u691C\u51FA\u30C6\u30AD\u30B9\u30C8 ---\n" + uniqueTexts.join(" "));
                        console.log(`    \u2713 \u500B\u5225\u691C\u51FA: ${uniqueTexts.length}\u4EF6\u306E\u30C6\u30AD\u30B9\u30C8\u30D6\u30ED\u30C3\u30AF`);
                        console.log(`    [DEBUG]   - \u30B5\u30F3\u30D7\u30EB\uFF08\u6700\u521D\u306E3\u4EF6\uFF09: ${uniqueTexts.slice(0, 3).join(", ")}`);
                      } else {
                        console.log(`    [DEBUG]   - \u30E6\u30CB\u30FC\u30AF\u30C6\u30AD\u30B9\u30C8\u304C0\u4EF6`);
                      }
                    } else {
                      console.log(`    [DEBUG]   - textAnnotations: \u306A\u3057\u307E\u305F\u306F\u7A7A\u914D\u5217`);
                    }
                    if (texts.length > 0) {
                      pageTexts.push(texts.join("\n"));
                      totalProcessedPages++;
                    }
                    if (batch === 0 && totalProcessedPages === 1 && page.fullTextAnnotation?.pages?.[0]) {
                      confidence = page.fullTextAnnotation.pages[0].confidence || 0;
                    }
                  }
                  console.log(`    \u2713 ${pages.length}\u30DA\u30FC\u30B8\u51E6\u7406\u5B8C\u4E86`);
                }
              } catch (batchError) {
                if (batchError.message?.includes("Invalid pages")) {
                  console.log(`    - \u30DA\u30FC\u30B8${startPage}-${endPage}\u306F\u5B58\u5728\u3057\u307E\u305B\u3093`);
                  break;
                } else {
                  console.error(`    \u2717 \u30A8\u30E9\u30FC: ${batchError.message}`);
                  break;
                }
              }
            }
            if (pageTexts.length > 0) {
              extractedText = pageTexts.join("\n\n");
              pageCount = totalProcessedPages;
              console.log(`[${documentType}] \u2713 ${pageCount}\u30DA\u30FC\u30B8\u51E6\u7406\u5B8C\u4E86`);
            } else {
              extractedText = `PDF\u306E\u51E6\u7406\u4E2D\u306B\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F`;
              pageCount = 0;
            }
          } else {
            try {
              const [result] = await visionClient.documentTextDetection({
                image: {
                  content: base64Content
                },
                imageContext: {
                  languageHints: ["ja"]
                }
              });
              const fullTextAnnotation = result.fullTextAnnotation;
              const textAnnotations = result.textAnnotations || [];
              const texts = [];
              if (fullTextAnnotation?.text) {
                texts.push(fullTextAnnotation.text);
              }
              if (textAnnotations.length > 1) {
                const individualTexts = textAnnotations.slice(1).map((annotation) => annotation.description).filter((text) => text && text.trim().length > 0);
                const uniqueTexts = [...new Set(individualTexts)];
                if (uniqueTexts.length > 0) {
                  texts.push("\n--- \u500B\u5225\u691C\u51FA\u30C6\u30AD\u30B9\u30C8 ---\n" + uniqueTexts.join(" "));
                }
              }
              extractedText = texts.join("\n");
              confidence = fullTextAnnotation?.pages?.[0]?.confidence || 0;
            } catch (imageError) {
              console.error(`[${documentType}] \u753B\u50CF\u51E6\u7406\u30A8\u30E9\u30FC (${file.name}):`, imageError);
              extractedText = `\u753B\u50CF\u306E\u51E6\u7406\u4E2D\u306B\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F`;
            }
          }
          const japaneseChars = (extractedText.match(/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/g) || []).length;
          const asciiChars = (extractedText.match(/[a-zA-Z0-9]/g) || []).length;
          const estimatedTokens = japaneseChars + Math.ceil(asciiChars / 4);
          results.push({
            fileName: file.name,
            text: extractedText,
            pageCount,
            confidence,
            tokenEstimate: estimatedTokens
          });
          totalCost += 15e-4 * pageCount;
        }
        return { results, totalCost };
      };
      console.log("\n=== \u30E1\u30A4\u30F3\u901A\u5E33\u306E\u51E6\u7406\u958B\u59CB ===");
      const mainBankProcessing = processFiles(mainBankFiles, "\u30E1\u30A4\u30F3\u901A\u5E33");
      console.log("\n=== \u30B5\u30D6\u901A\u5E33\u306E\u51E6\u7406\u958B\u59CB ===");
      const subBankProcessing = processFiles(subBankFiles, "\u30B5\u30D6\u901A\u5E33");
      const [mainBankResult, subBankResult] = await Promise.all([
        mainBankProcessing,
        subBankProcessing
      ]);
      const totalGoogleVisionCost = mainBankResult.totalCost + subBankResult.totalCost;
      const estimatedClaudeCost = totalGoogleVisionCost * 58.5;
      const estimatedSavings = (estimatedClaudeCost - totalGoogleVisionCost) / estimatedClaudeCost * 100;
      console.log("\n[\u901A\u5E33OCR\u6539\u5584\u7248] \u51E6\u7406\u7D50\u679C:");
      console.log(`  - \u30E1\u30A4\u30F3\u901A\u5E33: ${mainBankResult.results.length}\u4EF6\u51E6\u7406`);
      console.log(`  - \u30B5\u30D6\u901A\u5E33: ${subBankResult.results.length}\u4EF6\u51E6\u7406`);
      console.log(`  - \u7DCF\u30B3\u30B9\u30C8: $${totalGoogleVisionCost.toFixed(4)}`);
      return {
        success: true,
        processingDetails: {
          recordId,
          processedFiles: {
            mainBank: mainBankResult.results.length,
            subBank: subBankResult.results.length,
            total: mainBankResult.results.length + subBankResult.results.length
          },
          totalPages: mainBankResult.results.reduce((sum, doc) => sum + doc.pageCount, 0) + subBankResult.results.reduce((sum, doc) => sum + doc.pageCount, 0),
          timestamp
        },
        mainBankDocuments: mainBankResult.results,
        subBankDocuments: subBankResult.results,
        costAnalysis: {
          googleVisionCost: totalGoogleVisionCost,
          perDocumentType: {
            mainBank: mainBankResult.totalCost,
            subBank: subBankResult.totalCost
          },
          estimatedSavings: Math.round(estimatedSavings)
        }
      };
    } catch (error) {
      console.error("[\u901A\u5E33OCR\u6539\u5584\u7248] \u30A8\u30E9\u30FC:", error);
      return {
        success: false,
        processingDetails: {
          recordId,
          processedFiles: { mainBank: 0, subBank: 0, total: 0 },
          totalPages: 0,
          timestamp
        },
        mainBankDocuments: [],
        subBankDocuments: [],
        costAnalysis: {
          googleVisionCost: 0,
          perDocumentType: { mainBank: 0, subBank: 0 },
          estimatedSavings: 0
        },
        error: `\u51E6\u7406\u4E2D\u306B\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F: ${error.message}`
      };
    }
  }
});

export { googleVisionBankStatementOcrToolImproved };
