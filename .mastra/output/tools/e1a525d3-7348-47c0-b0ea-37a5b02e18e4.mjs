import { createTool } from '@mastra/core';
import { z } from 'zod';
import axios from 'axios';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import path from 'path';
import { fileURLToPath } from 'url';

const currentFileUrl = import.meta.url;
const currentDirname = path.dirname(fileURLToPath(currentFileUrl));
let visionClient;
if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
  const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
  visionClient = new ImageAnnotatorClient({ credentials });
} else {
  const authPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (authPath && !path.isAbsolute(authPath)) {
    const projectRoot = path.resolve(currentDirname, "../../../..");
    process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(projectRoot, authPath);
  }
  visionClient = new ImageAnnotatorClient();
}
const KINTONE_DOMAIN = process.env.KINTONE_DOMAIN || "";
const KINTONE_API_TOKEN = process.env.KINTONE_API_TOKEN || "";
const APP_ID = process.env.KINTONE_APP_ID || "37";
const googleVisionOcrTool = createTool({
  id: "google-vision-ocr",
  description: "Google Vision API\u3092\u4F7F\u7528\u3057\u305F\u9AD8\u7CBE\u5EA6\u30FB\u4F4E\u30B3\u30B9\u30C8OCR\u3002PDF\u3068\u753B\u50CF\u306E\u4E21\u65B9\u3092\u30B5\u30DD\u30FC\u30C8",
  inputSchema: z.object({
    recordId: z.string().describe("Kintone\u30EC\u30B3\u30FC\u30C9ID"),
    fieldName: z.string().describe("\u51E6\u7406\u5BFE\u8C61\u306E\u30D5\u30A3\u30FC\u30EB\u30C9\u540D\uFF08\u4F8B: \u30E1\u30A4\u30F3\u901A\u5E33\uFF3F\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB\uFF09").optional(),
    maxPages: z.number().describe("PDF\u306E\u6700\u5927\u51E6\u7406\u30DA\u30FC\u30B8\u6570\uFF08\u30C7\u30D5\u30A9\u30EB\u30C8: 100\u3001\u5236\u9650\u306A\u3057\uFF09").optional()
  }),
  outputSchema: z.object({
    success: z.boolean(),
    processingDetails: z.object({
      recordId: z.string(),
      fieldName: z.string().optional(),
      processedFiles: z.number(),
      totalPages: z.number().optional(),
      timestamp: z.string(),
      plannedProcessing: z.object({
        maxPagesRequested: z.number(),
        batchSize: z.number(),
        totalBatches: z.number(),
        batchRanges: z.array(z.object({
          batch: z.number(),
          startPage: z.number(),
          endPage: z.number()
        }))
      }).optional()
    }),
    extractedData: z.array(z.object({
      fileName: z.string(),
      fileType: z.string(),
      text: z.string().describe("\u62BD\u51FA\u3055\u308C\u305F\u30C6\u30AD\u30B9\u30C8"),
      confidence: z.number().describe("\u4FE1\u983C\u5EA6\u30B9\u30B3\u30A2\uFF080-1\uFF09"),
      pageCount: z.number().optional(),
      tokenEstimate: z.number().describe("\u63A8\u5B9A\u30C8\u30FC\u30AF\u30F3\u6570")
    })),
    costAnalysis: z.object({
      googleVisionCost: z.number(),
      estimatedClaudeCost: z.number(),
      estimatedGpt4Cost: z.number(),
      costSavingPercentage: z.number()
    }),
    error: z.string().optional()
  }),
  execute: async ({ context }) => {
    const { recordId, fieldName = "\u30E1\u30A4\u30F3\u901A\u5E33\uFF3F\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB", maxPages = 100 } = context;
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
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
            fieldName,
            processedFiles: 0,
            timestamp
          },
          extractedData: [],
          costAnalysis: {
            googleVisionCost: 0,
            estimatedClaudeCost: 0,
            estimatedGpt4Cost: 0,
            costSavingPercentage: 0
          },
          error: "\u6307\u5B9A\u3055\u308C\u305F\u30EC\u30B3\u30FC\u30C9ID\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002"
        };
      }
      const record = recordResponse.data.records[0];
      const files = record[fieldName]?.value || [];
      if (files.length === 0) {
        return {
          success: false,
          processingDetails: {
            recordId,
            fieldName,
            processedFiles: 0,
            timestamp
          },
          extractedData: [],
          costAnalysis: {
            googleVisionCost: 0,
            estimatedClaudeCost: 0,
            estimatedGpt4Cost: 0,
            costSavingPercentage: 0
          },
          error: `${fieldName}\u306B\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB\u304C\u3042\u308A\u307E\u305B\u3093\u3002`
        };
      }
      console.log(`[Google Vision OCR] \u51E6\u7406\u5BFE\u8C61: ${files.length}\u30D5\u30A1\u30A4\u30EB`);
      const extractedData = [];
      let totalGoogleVisionCost = 0;
      let totalEstimatedTokens = 0;
      let allBatchPlans = [];
      for (const file of files) {
        console.log(`[Google Vision OCR] \u51E6\u7406\u4E2D: ${file.name}`);
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
          console.log(`[Google Vision OCR] PDF\u3092\u51E6\u7406\u4E2D...`);
          let actualPageCount = 0;
          console.log(`[Google Vision OCR] PDF\u306E\u30DA\u30FC\u30B8\u6570\u3092\u78BA\u8A8D\u4E2D...`);
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
            if (testResult.responses?.[0]?.totalPages) {
              actualPageCount = testResult.responses[0].totalPages;
              console.log(`[Google Vision OCR] PDF\u306E\u7DCF\u30DA\u30FC\u30B8\u6570: ${actualPageCount}\u30DA\u30FC\u30B8`);
            } else {
              console.log(`[Google Vision OCR] \u30DA\u30FC\u30B8\u6570\u3092\u6BB5\u968E\u7684\u306B\u78BA\u8A8D\u4E2D...`);
              for (let testPage = 1; testPage <= maxPages; testPage += 10) {
                try {
                  const pageTestRequest = {
                    requests: [{
                      inputConfig: {
                        content: base64Content,
                        mimeType: "application/pdf"
                      },
                      features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
                      pages: [testPage]
                    }]
                  };
                  await visionClient.batchAnnotateFiles(pageTestRequest);
                  actualPageCount = testPage;
                } catch (e) {
                  if (e.message?.includes("Invalid pages")) {
                    break;
                  }
                }
              }
              if (actualPageCount > 1) {
                for (let testPage = actualPageCount - 9; testPage <= actualPageCount + 10; testPage++) {
                  if (testPage < 1) continue;
                  try {
                    const pageTestRequest = {
                      requests: [{
                        inputConfig: {
                          content: base64Content,
                          mimeType: "application/pdf"
                        },
                        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
                        pages: [testPage]
                      }]
                    };
                    await visionClient.batchAnnotateFiles(pageTestRequest);
                    actualPageCount = testPage;
                  } catch (e) {
                    if (e.message?.includes("Invalid pages")) {
                      break;
                    }
                  }
                }
              }
            }
          } catch (error) {
            console.error(`[Google Vision OCR] \u30DA\u30FC\u30B8\u6570\u78BA\u8A8D\u30A8\u30E9\u30FC:`, error.message);
            actualPageCount = maxPages;
          }
          const pagesToProcess = Math.min(actualPageCount, maxPages);
          console.log(`[Google Vision OCR] \u51E6\u7406\u5BFE\u8C61: ${pagesToProcess}\u30DA\u30FC\u30B8 (\u5B9F\u969B: ${actualPageCount}\u30DA\u30FC\u30B8, \u6700\u5927: ${maxPages}\u30DA\u30FC\u30B8)`);
          const pageTexts = [];
          let totalProcessedPages = 0;
          const batchSize = 5;
          const numBatches = Math.ceil(pagesToProcess / batchSize);
          let processingError = null;
          const batchRanges = [];
          for (let i = 0; i < numBatches; i++) {
            const startPage = i * batchSize + 1;
            const endPage = Math.min(startPage + batchSize - 1, pagesToProcess);
            batchRanges.push({
              batch: i + 1,
              startPage,
              endPage
            });
          }
          console.log(`[Google Vision OCR] \u30D0\u30C3\u30C1\u51E6\u7406\u8A08\u753B:`);
          console.log(`  - \u5B9F\u969B\u306E\u30DA\u30FC\u30B8\u6570: ${actualPageCount}`);
          console.log(`  - \u51E6\u7406\u30DA\u30FC\u30B8\u6570: ${pagesToProcess}`);
          console.log(`  - \u30D0\u30C3\u30C1\u30B5\u30A4\u30BA: ${batchSize}\u30DA\u30FC\u30B8/\u30D0\u30C3\u30C1`);
          console.log(`  - \u7DCF\u30D0\u30C3\u30C1\u6570: ${numBatches}`);
          if (numBatches <= 10) {
            batchRanges.forEach((range) => {
              console.log(`  - \u30D0\u30C3\u30C1${range.batch}: \u30DA\u30FC\u30B8${range.startPage}-${range.endPage}`);
            });
          } else {
            console.log(`  - \u30D0\u30C3\u30C1\u30891: \u30DA\u30FC\u30B81-5`);
            console.log(`  - ...`);
            console.log(`  - \u30D0\u30C3\u30C1${numBatches}: \u30DA\u30FC\u30B8${batchRanges[numBatches - 1].startPage}-${batchRanges[numBatches - 1].endPage}`);
          }
          allBatchPlans = batchRanges;
          for (let batch = 0; batch < numBatches; batch++) {
            const startPage = batch * batchSize + 1;
            const endPage = Math.min(startPage + batchSize - 1, pagesToProcess);
            const pagesToProcessInBatch = Array.from(
              { length: endPage - startPage + 1 },
              (_, i) => startPage + i
            );
            console.log(`  \u30D0\u30C3\u30C1${batch + 1}/${numBatches}: \u30DA\u30FC\u30B8${startPage}-${endPage}\u3092\u51E6\u7406\u4E2D...`);
            try {
              const request = {
                requests: [{
                  inputConfig: {
                    content: base64Content,
                    mimeType: "application/pdf"
                  },
                  features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
                  pages: pagesToProcessInBatch
                }]
              };
              const [result] = await visionClient.batchAnnotateFiles(request);
              if (result.responses?.[0]) {
                const response = result.responses[0];
                const pages = response.responses || [];
                const batchText = pages.map((page) => page.fullTextAnnotation?.text || "").join("\n");
                if (batchText) {
                  pageTexts.push(batchText);
                  totalProcessedPages += pages.length;
                }
                if (batch === 0 && pages[0]?.fullTextAnnotation?.pages?.[0]) {
                  confidence = pages[0].fullTextAnnotation.pages[0].confidence || 0;
                }
                console.log(`    - ${pages.length}\u30DA\u30FC\u30B8\u51E6\u7406\u5B8C\u4E86`);
              }
            } catch (batchError) {
              if (batchError.message?.includes("Invalid pages")) {
                console.log(`    - \u30DA\u30FC\u30B8${startPage}-${endPage}\u306F\u5B58\u5728\u3057\u307E\u305B\u3093`);
                break;
              } else {
                console.error(`[Google Vision OCR] \u30D0\u30C3\u30C1${batch + 1}\u3067\u30A8\u30E9\u30FC\u767A\u751F:`, batchError.message);
                processingError = batchError;
                break;
              }
            }
          }
          if (pageTexts.length > 0) {
            extractedText = pageTexts.join("\n");
            pageCount = totalProcessedPages;
            console.log(`[Google Vision OCR] ${pageCount}\u30DA\u30FC\u30B8\u306E\u51E6\u7406\u5B8C\u4E86`);
            if (processingError) {
              console.log(`[Google Vision OCR] \u6CE8\u610F: \u5168\u4F53\u306E\u51E6\u7406\u4E2D\u306B\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F\u304C\u3001${pageCount}\u30DA\u30FC\u30B8\u5206\u306E\u30C7\u30FC\u30BF\u306F\u53D6\u5F97\u3067\u304D\u307E\u3057\u305F`);
            }
          } else {
            extractedText = `PDF\u306E\u51E6\u7406\u4E2D\u306B\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F: ${processingError ? processingError.message : "\u4E0D\u660E\u306A\u30A8\u30E9\u30FC"}`;
            pageCount = 0;
          }
        } else {
          try {
            const [result] = await visionClient.documentTextDetection({
              image: {
                content: base64Content
              }
            });
            const fullTextAnnotation = result.fullTextAnnotation;
            extractedText = fullTextAnnotation?.text || "";
            confidence = fullTextAnnotation?.pages?.[0]?.confidence || 0;
          } catch (imageError) {
            console.error(`[Google Vision OCR] \u753B\u50CF\u51E6\u7406\u30A8\u30E9\u30FC (${file.name}):`, imageError);
            extractedText = `\u753B\u50CF\u306E\u51E6\u7406\u4E2D\u306B\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F: ${imageError.message}`;
          }
        }
        const japaneseChars = (extractedText.match(/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/g) || []).length;
        const asciiChars = (extractedText.match(/[a-zA-Z0-9]/g) || []).length;
        const estimatedTokens = japaneseChars + Math.ceil(asciiChars / 4);
        extractedData.push({
          fileName: file.name,
          fileType: file.contentType,
          text: extractedText,
          confidence,
          pageCount,
          tokenEstimate: estimatedTokens
        });
        totalGoogleVisionCost += 15e-4 * pageCount;
        totalEstimatedTokens += estimatedTokens;
      }
      const claudeInputCost = totalEstimatedTokens / 1e6 * 3;
      const claudeOutputCost = totalEstimatedTokens / 1e6 * 15;
      const claudeTotalCost = claudeInputCost + claudeOutputCost;
      const gpt4InputCost = totalEstimatedTokens / 1e6 * 10;
      const gpt4OutputCost = totalEstimatedTokens / 1e6 * 30;
      const gpt4TotalCost = gpt4InputCost + gpt4OutputCost;
      const averageCostSaving = ((claudeTotalCost + gpt4TotalCost) / 2 - totalGoogleVisionCost) / ((claudeTotalCost + gpt4TotalCost) / 2) * 100;
      console.log(`[Google Vision OCR] \u51E6\u7406\u5B8C\u4E86: ${extractedData.length}\u30D5\u30A1\u30A4\u30EB\u3001\u7DCF\u30C8\u30FC\u30AF\u30F3\u6570: ${totalEstimatedTokens}`);
      return {
        success: true,
        processingDetails: {
          recordId,
          fieldName,
          processedFiles: extractedData.length,
          totalPages: extractedData.reduce((sum, data) => sum + (data.pageCount || 1), 0),
          timestamp,
          plannedProcessing: allBatchPlans.length > 0 ? {
            maxPagesRequested: maxPages,
            batchSize: 5,
            totalBatches: allBatchPlans.length,
            batchRanges: allBatchPlans
          } : void 0
        },
        extractedData,
        costAnalysis: {
          googleVisionCost: totalGoogleVisionCost,
          estimatedClaudeCost: claudeTotalCost,
          estimatedGpt4Cost: gpt4TotalCost,
          costSavingPercentage: Math.round(averageCostSaving)
        }
      };
    } catch (error) {
      console.error("[Google Vision OCR] \u30A8\u30E9\u30FC:", error);
      return {
        success: false,
        processingDetails: {
          recordId,
          fieldName,
          processedFiles: 0,
          timestamp
        },
        extractedData: [],
        costAnalysis: {
          googleVisionCost: 0,
          estimatedClaudeCost: 0,
          estimatedGpt4Cost: 0,
          costSavingPercentage: 0
        },
        error: `\u51E6\u7406\u4E2D\u306B\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F: ${error.message}`
      };
    }
  }
});

export { googleVisionOcrTool };
