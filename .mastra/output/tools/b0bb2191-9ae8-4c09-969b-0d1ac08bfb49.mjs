import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import axios from 'axios';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import path from 'path';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';

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
const googleVisionPurchaseCollateralOcrTool = createTool({
  id: "google-vision-purchase-collateral-ocr",
  description: "\u8CB7\u53D6\u8ACB\u6C42\u66F8\u3068\u62C5\u4FDD\u8B04\u672C\u3092\u4E00\u62EC\u3067OCR\u51E6\u7406\u3059\u308BGoogle Vision API\u30C4\u30FC\u30EB",
  inputSchema: z.object({
    recordId: z.string().describe("Kintone\u30EC\u30B3\u30FC\u30C9ID"),
    purchaseFieldName: z.string().describe("\u8CB7\u53D6\u8ACB\u6C42\u66F8\u306E\u30D5\u30A3\u30FC\u30EB\u30C9\u540D").default("\u6210\u56E0\u8A3C\u66F8\uFF3F\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB"),
    collateralFieldName: z.string().describe("\u62C5\u4FDD\u8B04\u672C\u306E\u30D5\u30A3\u30FC\u30EB\u30C9\u540D").default("\u62C5\u4FDD\u60C5\u5831\uFF3F\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB"),
    maxPagesPerFile: z.number().describe("1\u30D5\u30A1\u30A4\u30EB\u3042\u305F\u308A\u306E\u6700\u5927\u51E6\u7406\u30DA\u30FC\u30B8\u6570").default(20)
  }).describe("Google Vision OCR\u51E6\u7406\u306E\u5165\u529B\u30D1\u30E9\u30E1\u30FC\u30BF"),
  outputSchema: z.object({
    success: z.boolean(),
    processingDetails: z.object({
      recordId: z.string(),
      processedFiles: z.object({
        purchase: z.number(),
        collateral: z.number(),
        total: z.number()
      }).describe("\u51E6\u7406\u3055\u308C\u305F\u30D5\u30A1\u30A4\u30EB\u6570"),
      totalPages: z.number(),
      timestamp: z.string()
    }).describe("\u51E6\u7406\u8A73\u7D30\u60C5\u5831"),
    purchaseDocuments: z.array(z.object({
      fileName: z.string().describe("\u30D5\u30A1\u30A4\u30EB\u540D"),
      text: z.string().describe("\u62BD\u51FA\u3055\u308C\u305F\u30C6\u30AD\u30B9\u30C8"),
      pageCount: z.number().describe("\u30DA\u30FC\u30B8\u6570"),
      confidence: z.number().describe("\u4FE1\u983C\u5EA6"),
      tokenEstimate: z.number().describe("\u63A8\u5B9A\u30C8\u30FC\u30AF\u30F3\u6570"),
      documentType: z.string().describe("\u6587\u66F8\u7A2E\u5225\uFF08\u8ACB\u6C42\u66F8\u3001\u767B\u8A18\u60C5\u5831\u3001\u50B5\u6A29\u8B72\u6E21\u6982\u8981\u3001\u540D\u523A\u306A\u3069\uFF09"),
      extractedFacts: z.record(z.any()).describe("\u6587\u66F8\u304B\u3089\u62BD\u51FA\u3055\u308C\u305F\u4E8B\u5B9F\u60C5\u5831\uFF08\u30CD\u30B9\u30C8\u69CB\u9020\u3082\u53EF\u80FD\uFF09")
    })).describe("\u8CB7\u53D6\u60C5\u5831\u30D5\u30A3\u30FC\u30EB\u30C9\u306E\u30C9\u30AD\u30E5\u30E1\u30F3\u30C8\u30EA\u30B9\u30C8"),
    collateralDocuments: z.array(z.object({
      fileName: z.string().describe("\u30D5\u30A1\u30A4\u30EB\u540D"),
      text: z.string().describe("\u62BD\u51FA\u3055\u308C\u305F\u30C6\u30AD\u30B9\u30C8"),
      pageCount: z.number().describe("\u30DA\u30FC\u30B8\u6570"),
      confidence: z.number().describe("\u4FE1\u983C\u5EA6"),
      tokenEstimate: z.number().describe("\u63A8\u5B9A\u30C8\u30FC\u30AF\u30F3\u6570"),
      documentType: z.string().describe("\u6587\u66F8\u7A2E\u5225\uFF08\u62C5\u4FDD\u8B04\u672C\u3001\u767B\u8A18\u60C5\u5831\u306A\u3069\uFF09"),
      extractedFacts: z.record(z.any()).describe("\u6587\u66F8\u304B\u3089\u62BD\u51FA\u3055\u308C\u305F\u4E8B\u5B9F\u60C5\u5831\uFF08\u30CD\u30B9\u30C8\u69CB\u9020\u3082\u53EF\u80FD\uFF09")
    })).describe("\u62C5\u4FDD\u8B04\u672C\u30C9\u30AD\u30E5\u30E1\u30F3\u30C8\u30EA\u30B9\u30C8"),
    costAnalysis: z.object({
      googleVisionCost: z.number(),
      classificationCost: z.number().describe("\u6587\u66F8\u5206\u985EAI\u30B3\u30B9\u30C8"),
      perDocumentType: z.object({
        purchase: z.number(),
        collateral: z.number()
      }).describe("\u30C9\u30AD\u30E5\u30E1\u30F3\u30C8\u30BF\u30A4\u30D7\u5225\u30B3\u30B9\u30C8"),
      estimatedSavings: z.number()
    }).describe("\u30B3\u30B9\u30C8\u5206\u6790"),
    error: z.string().optional()
  }).describe("Google Vision OCR\u51E6\u7406\u306E\u51FA\u529B\u7D50\u679C"),
  execute: async ({ context }) => {
    const { recordId, purchaseFieldName, collateralFieldName, maxPagesPerFile } = context;
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
            processedFiles: { purchase: 0, collateral: 0, total: 0 },
            totalPages: 0,
            timestamp
          },
          purchaseDocuments: [],
          collateralDocuments: [],
          costAnalysis: {
            googleVisionCost: 0,
            classificationCost: 0,
            perDocumentType: { purchase: 0, collateral: 0 },
            estimatedSavings: 0
          },
          error: "\u6307\u5B9A\u3055\u308C\u305F\u30EC\u30B3\u30FC\u30C9ID\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002"
        };
      }
      const record = recordResponse.data.records[0];
      const purchaseFiles = record[purchaseFieldName]?.value || [];
      const collateralFiles = record[collateralFieldName]?.value || [];
      console.log(`[\u8CB7\u53D6\u30FB\u62C5\u4FDDOCR] \u51E6\u7406\u5BFE\u8C61:`);
      console.log(`  - \u8CB7\u53D6\u60C5\u5831\u30D5\u30A3\u30FC\u30EB\u30C9: ${purchaseFiles.length}\u4EF6`);
      console.log(`  - \u62C5\u4FDD\u60C5\u5831\u30D5\u30A3\u30FC\u30EB\u30C9: ${collateralFiles.length}\u4EF6`);
      console.log(`  - \u51E6\u7406\u5BFE\u8C61\u5408\u8A08: ${purchaseFiles.length + collateralFiles.length}\u4EF6`);
      if (purchaseFiles.length > 0) {
        console.log(`[\u8CB7\u53D6\u30FB\u62C5\u4FDDOCR] \u8CB7\u53D6\u60C5\u5831\u30D5\u30A1\u30A4\u30EB\u4E00\u89A7:`);
        purchaseFiles.forEach((file) => {
          console.log(`  - ${file.name}`);
        });
      }
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
            console.log(`[${documentType}] PDF\u3092\u51E6\u7406\u4E2D...`);
            let actualPageCount = 0;
            console.log(`[${documentType}] PDF\u306E\u30DA\u30FC\u30B8\u6570\u3092\u78BA\u8A8D\u4E2D...`);
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
                console.log(`[${documentType}] PDF\u306E\u7DCF\u30DA\u30FC\u30B8\u6570: ${actualPageCount}\u30DA\u30FC\u30B8`);
              } else {
                console.log(`[${documentType}] \u30DA\u30FC\u30B8\u6570\u3092\u6BB5\u968E\u7684\u306B\u78BA\u8A8D\u4E2D...`);
                for (let testPage = 1; testPage <= maxPagesPerFile; testPage += 10) {
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
              console.error(`[${documentType}] \u30DA\u30FC\u30B8\u6570\u78BA\u8A8D\u30A8\u30E9\u30FC:`, error.message);
              actualPageCount = maxPagesPerFile;
            }
            const pagesToProcess = Math.min(actualPageCount, maxPagesPerFile);
            console.log(`[${documentType}] \u51E6\u7406\u5BFE\u8C61: ${pagesToProcess}\u30DA\u30FC\u30B8 (\u5B9F\u969B: ${actualPageCount}\u30DA\u30FC\u30B8, \u6700\u5927: ${maxPagesPerFile}\u30DA\u30FC\u30B8)`);
            const pageTexts = [];
            let totalProcessedPages = 0;
            const batchSize = 5;
            const numBatches = Math.ceil(pagesToProcess / batchSize);
            let processingError = null;
            console.log(`[${documentType}] \u30D0\u30C3\u30C1\u51E6\u7406\u8A08\u753B:`);
            console.log(`  - \u5B9F\u969B\u306E\u30DA\u30FC\u30B8\u6570: ${actualPageCount}`);
            console.log(`  - \u51E6\u7406\u30DA\u30FC\u30B8\u6570: ${pagesToProcess}`);
            console.log(`  - \u30D0\u30C3\u30C1\u30B5\u30A4\u30BA: ${batchSize}\u30DA\u30FC\u30B8/\u30D0\u30C3\u30C1`);
            console.log(`  - \u7DCF\u30D0\u30C3\u30C1\u6570: ${numBatches}`);
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
                    features: [
                      { type: "DOCUMENT_TEXT_DETECTION" },
                      // fullTextAnnotation用
                      { type: "TEXT_DETECTION" }
                      // textAnnotations用（マーカー対応）
                    ],
                    pages: pagesToProcessInBatch,
                    imageContext: { languageHints: ["ja"] }
                    // 日本語OCR精度向上
                  }]
                };
                const [result] = await visionClient.batchAnnotateFiles(request);
                if (result.responses?.[0]) {
                  const response = result.responses[0];
                  const pages = response.responses || [];
                  const pageTextList = [];
                  pages.forEach((page) => {
                    const texts = [];
                    if (page.fullTextAnnotation?.text) {
                      texts.push(page.fullTextAnnotation.text);
                    }
                    if (page.textAnnotations && page.textAnnotations.length > 0) {
                      const individualTexts = page.textAnnotations.slice(1).map((annotation) => annotation.description).filter((text) => text && text.trim().length > 0);
                      const uniqueTexts = [...new Set(individualTexts)];
                      if (uniqueTexts.length > 0) {
                        texts.push("\n--- \u500B\u5225\u691C\u51FA\u30C6\u30AD\u30B9\u30C8 ---\n" + uniqueTexts.join(" "));
                      }
                    }
                    if (texts.length > 0) {
                      pageTextList.push(texts.join("\n"));
                    }
                  });
                  const batchText = pageTextList.join("\n");
                  if (batchText) {
                    pageTexts.push(batchText);
                    totalProcessedPages += pages.length;
                  }
                  if (batch === 0 && pages[0]?.fullTextAnnotation?.pages?.[0]) {
                    confidence = pages[0].fullTextAnnotation.pages[0].confidence || 0;
                  }
                  console.log(`    - ${pages.length}\u30DA\u30FC\u30B8\u51E6\u7406\u5B8C\u4E86\uFF08fullText + \u500B\u5225\u30D6\u30ED\u30C3\u30AF\uFF09`);
                }
              } catch (batchError) {
                if (batchError.message?.includes("Invalid pages")) {
                  console.log(`    - \u30DA\u30FC\u30B8${startPage}-${endPage}\u306F\u5B58\u5728\u3057\u307E\u305B\u3093`);
                  break;
                } else {
                  console.error(`[${documentType}] \u30D0\u30C3\u30C1${batch + 1}\u3067\u30A8\u30E9\u30FC\u767A\u751F:`, batchError.message);
                  processingError = batchError;
                  break;
                }
              }
            }
            if (pageTexts.length > 0) {
              extractedText = pageTexts.join("\n");
              pageCount = totalProcessedPages;
              console.log(`[${documentType}] ${pageCount}\u30DA\u30FC\u30B8\u306E\u51E6\u7406\u5B8C\u4E86`);
              if (processingError) {
                console.log(`[${documentType}] \u6CE8\u610F: \u5168\u4F53\u306E\u51E6\u7406\u4E2D\u306B\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F\u304C\u3001${pageCount}\u30DA\u30FC\u30B8\u5206\u306E\u30C7\u30FC\u30BF\u306F\u53D6\u5F97\u3067\u304D\u307E\u3057\u305F`);
              }
            } else {
              extractedText = `PDF\u306E\u51E6\u7406\u4E2D\u306B\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F: ${processingError ? processingError.message : "\u4E0D\u660E\u306A\u30A8\u30E9\u30FC"}`;
              pageCount = 0;
            }
          } else {
            try {
              const [result] = await visionClient.annotateImage({
                image: {
                  content: base64Content
                },
                features: [
                  { type: "DOCUMENT_TEXT_DETECTION" },
                  // fullTextAnnotation用
                  { type: "TEXT_DETECTION" }
                  // textAnnotations用（マーカー対応）
                ],
                imageContext: { languageHints: ["ja"] }
                // 日本語OCR精度向上
              });
              const texts = [];
              const fullTextAnnotation = result.fullTextAnnotation;
              if (fullTextAnnotation?.text) {
                texts.push(fullTextAnnotation.text);
              }
              confidence = fullTextAnnotation?.pages?.[0]?.confidence || 0;
              if (result.textAnnotations && result.textAnnotations.length > 0) {
                const individualTexts = result.textAnnotations.slice(1).map((annotation) => annotation.description).filter((text) => text && text.trim().length > 0);
                const uniqueTexts = [...new Set(individualTexts)];
                if (uniqueTexts.length > 0) {
                  texts.push("\n--- \u500B\u5225\u691C\u51FA\u30C6\u30AD\u30B9\u30C8 ---\n" + uniqueTexts.join(" "));
                }
              }
              extractedText = texts.join("\n");
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
      const classifyAndExtractInfo = async (document) => {
        try {
          const textSample = document.text.substring(0, 2e3);
          const schema = z.object({
            documentType: z.string().describe("\u6587\u66F8\u7A2E\u5225\uFF08\u8ACB\u6C42\u66F8\u3001\u767B\u8A18\u60C5\u5831\u3001\u50B5\u6A29\u8B72\u6E21\u6982\u8981\u3001\u540D\u523A\u3001\u5951\u7D04\u66F8\u306A\u3069\u3001\u6587\u66F8\u306B\u8A18\u8F09\u3055\u308C\u3066\u3044\u308B\u5185\u5BB9\u304B\u3089\u81EA\u7531\u306B\u5224\u5B9A\uFF09"),
            extractedFacts: z.record(z.any()).describe("\u62BD\u51FA\u3055\u308C\u305F\u4E8B\u5B9F\u60C5\u5831\uFF08\u4F1A\u793E\u540D\u3001\u8CC7\u672C\u91D1\u3001\u8A2D\u7ACB\u5E74\u6708\u65E5\u3001\u4EE3\u8868\u8005\u540D\u3001\u8ACB\u6C42\u984D\u3001\u671F\u65E5\u306A\u3069\u3001\u6587\u66F8\u304B\u3089\u8AAD\u307F\u53D6\u308C\u308B\u60C5\u5831\u3092\u67D4\u8EDF\u306B\u8A18\u9332\u3002\u30CD\u30B9\u30C8\u69CB\u9020\u3082\u53EF\u80FD\uFF09")
          });
          const result = await generateObject({
            model: openai("gpt-4o"),
            schema,
            prompt: `\u4EE5\u4E0B\u306E\u6587\u66F8\u306EOCR\u30C6\u30AD\u30B9\u30C8\u3092\u5206\u6790\u3057\u3001\u6587\u66F8\u7A2E\u5225\u3068\u62BD\u51FA\u53EF\u80FD\u306A\u60C5\u5831\u3092\u8A18\u9332\u3057\u3066\u304F\u3060\u3055\u3044\u3002

\u3010\u91CD\u8981\u3011
- \u6587\u66F8\u7A2E\u5225\u306F\u56FA\u5B9A\u306E\u9078\u629E\u80A2\u3067\u306F\u306A\u304F\u3001\u6587\u66F8\u306E\u5185\u5BB9\u304B\u3089\u81EA\u7531\u306B\u5224\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044
- \u62BD\u51FA\u3055\u308C\u305F\u60C5\u5831\u306F\u3001\u4F55\u304C\u8A18\u8F09\u3055\u308C\u3066\u3044\u305F\u304B\u306E\u300C\u4E8B\u5B9F\u300D\u3092\u8A18\u9332\u3057\u3066\u304F\u3060\u3055\u3044
- \u578B\u306B\u306F\u3081\u305A\u3001\u5B58\u5728\u3059\u308B\u60C5\u5831\u3092\u67D4\u8EDF\u306B\u62BD\u51FA\u3057\u3066\u304F\u3060\u3055\u3044
- \u60C5\u5831\u304C\u5B58\u5728\u3057\u306A\u3044\u5834\u5408\u306F\u3001\u305D\u306E\u30D5\u30A3\u30FC\u30EB\u30C9\u3092\u542B\u3081\u306A\u3044\u3067\u304F\u3060\u3055\u3044

\u3010OCR\u30C6\u30AD\u30B9\u30C8\u3011
${textSample}

\u3010\u62BD\u51FA\u4F8B\u3011
\u767B\u8A18\u60C5\u5831\u306E\u5834\u5408:
{
  "documentType": "\u767B\u8A18\u60C5\u5831",
  "extractedFacts": {
    "\u4F1A\u793E\u540D": "\u682A\u5F0F\u4F1A\u793E\u3007\u3007",
    "\u8CC7\u672C\u91D1": 10000000,
    "\u8A2D\u7ACB\u5E74\u6708\u65E5": "2020\u5E741\u67081\u65E5",
    "\u4EE3\u8868\u8005\u540D": "\u5C71\u7530\u592A\u90CE"
  }
}

\u50B5\u6A29\u8B72\u6E21\u6982\u8981\u306E\u5834\u5408:
{
  "documentType": "\u50B5\u6A29\u8B72\u6E21\u6982\u8981",
  "extractedFacts": {
    "\u4F1A\u793E\u540D": "\u682A\u5F0F\u4F1A\u793E\u3007\u3007",
    "\u8B72\u6E21\u50B5\u6A29\u984D": 5000000,
    "\u8B72\u6E21\u65E5": "2024\u5E7412\u67081\u65E5",
    "\u72B6\u614B": "\u9589\u9396" \u307E\u305F\u306F "\u73FE\u5728"
  }
}

\u8ACB\u6C42\u66F8\u306E\u5834\u5408:
{
  "documentType": "\u8ACB\u6C42\u66F8",
  "extractedFacts": {
    "\u8ACB\u6C42\u5143": "\u682A\u5F0F\u4F1A\u793E\u3007\u3007",
    "\u8ACB\u6C42\u5148": "\u682A\u5F0F\u4F1A\u793E\u25B3\u25B3",
    "\u8ACB\u6C42\u984D": 1000000,
    "\u652F\u6255\u671F\u65E5": "2024\u5E7412\u670831\u65E5"
  }
}`
          });
          const inputCost = (result.usage?.totalTokens || 0) * 3e-6 * 0.5;
          const outputCost = (result.usage?.totalTokens || 0) * 15e-6 * 0.5;
          return {
            documentType: result.object.documentType,
            extractedFacts: result.object.extractedFacts,
            classificationCost: inputCost + outputCost
          };
        } catch (error) {
          console.error(`[\u6587\u66F8\u5206\u985E] \u30A8\u30E9\u30FC (${document.fileName}):`, error);
          return {
            documentType: "\u5206\u985E\u4E0D\u80FD",
            extractedFacts: {},
            classificationCost: 0
          };
        }
      };
      console.log("\n=== \u8CB7\u53D6\u60C5\u5831\u30D5\u30A3\u30FC\u30EB\u30C9\u306E\u51E6\u7406\u958B\u59CB ===");
      const purchaseProcessing = processFiles(purchaseFiles, "\u8CB7\u53D6\u60C5\u5831");
      console.log("\n=== \u62C5\u4FDD\u8B04\u672C\u306E\u51E6\u7406\u958B\u59CB ===");
      const collateralProcessing = processFiles(collateralFiles, "\u62C5\u4FDD\u8B04\u672C");
      const [purchaseResult, collateralResult] = await Promise.all([
        purchaseProcessing,
        collateralProcessing
      ]);
      console.log("\n=== \u6587\u66F8\u5206\u985E\u30FB\u60C5\u5831\u62BD\u51FA\u958B\u59CB ===");
      let totalClassificationCost = 0;
      const classifiedPurchaseDocuments = await Promise.all(
        purchaseResult.results.map(async (doc) => {
          console.log(`[\u6587\u66F8\u5206\u985E] ${doc.fileName} \u3092\u5206\u6790\u4E2D...`);
          const classification = await classifyAndExtractInfo(doc);
          totalClassificationCost += classification.classificationCost;
          console.log(`  \u2192 \u7A2E\u5225: ${classification.documentType}`);
          if (classification.extractedFacts && Object.keys(classification.extractedFacts).length > 0) {
            console.log(`  \u2192 \u62BD\u51FA\u3055\u308C\u305F\u60C5\u5831:`, classification.extractedFacts);
          }
          return {
            ...doc,
            documentType: classification.documentType,
            extractedFacts: classification.extractedFacts
          };
        })
      );
      const classifiedCollateralDocuments = await Promise.all(
        collateralResult.results.map(async (doc) => {
          console.log(`[\u6587\u66F8\u5206\u985E] ${doc.fileName} \u3092\u5206\u6790\u4E2D...`);
          const classification = await classifyAndExtractInfo(doc);
          totalClassificationCost += classification.classificationCost;
          console.log(`  \u2192 \u7A2E\u5225: ${classification.documentType}`);
          if (classification.extractedFacts && Object.keys(classification.extractedFacts).length > 0) {
            console.log(`  \u2192 \u62BD\u51FA\u3055\u308C\u305F\u60C5\u5831:`, classification.extractedFacts);
          }
          return {
            ...doc,
            documentType: classification.documentType,
            extractedFacts: classification.extractedFacts
          };
        })
      );
      const totalGoogleVisionCost = purchaseResult.totalCost + collateralResult.totalCost;
      const estimatedClaudeCost = totalGoogleVisionCost * 58.5;
      const estimatedSavings = (estimatedClaudeCost - totalGoogleVisionCost) / estimatedClaudeCost * 100;
      console.log("\n[\u8CB7\u53D6\u30FB\u62C5\u4FDDOCR] \u51E6\u7406\u7D50\u679C:");
      console.log(`  - \u8CB7\u53D6\u60C5\u5831: ${classifiedPurchaseDocuments.length}\u4EF6\u51E6\u7406`);
      console.log(`  - \u62C5\u4FDD\u8B04\u672C: ${collateralResult.results.length}\u4EF6\u51E6\u7406`);
      console.log(`  - OCR\u30B3\u30B9\u30C8: $${totalGoogleVisionCost.toFixed(4)}`);
      console.log(`  - \u5206\u985E\u30B3\u30B9\u30C8: $${totalClassificationCost.toFixed(4)}`);
      console.log(`  - \u7DCF\u30B3\u30B9\u30C8: $${(totalGoogleVisionCost + totalClassificationCost).toFixed(4)}`);
      return {
        success: true,
        processingDetails: {
          recordId,
          processedFiles: {
            purchase: classifiedPurchaseDocuments.length,
            collateral: classifiedCollateralDocuments.length,
            total: classifiedPurchaseDocuments.length + classifiedCollateralDocuments.length
          },
          totalPages: classifiedPurchaseDocuments.reduce((sum, doc) => sum + doc.pageCount, 0) + classifiedCollateralDocuments.reduce((sum, doc) => sum + doc.pageCount, 0),
          timestamp
        },
        purchaseDocuments: classifiedPurchaseDocuments,
        collateralDocuments: classifiedCollateralDocuments,
        costAnalysis: {
          googleVisionCost: totalGoogleVisionCost,
          classificationCost: totalClassificationCost,
          perDocumentType: {
            purchase: purchaseResult.totalCost,
            collateral: collateralResult.totalCost
          },
          estimatedSavings: Math.round(estimatedSavings)
        }
      };
    } catch (error) {
      console.error("[\u8CB7\u53D6\u30FB\u62C5\u4FDDOCR] \u30A8\u30E9\u30FC:", error);
      return {
        success: false,
        processingDetails: {
          recordId,
          processedFiles: { purchase: 0, collateral: 0, total: 0 },
          totalPages: 0,
          timestamp
        },
        purchaseDocuments: [],
        collateralDocuments: [],
        costAnalysis: {
          googleVisionCost: 0,
          classificationCost: 0,
          perDocumentType: { purchase: 0, collateral: 0 },
          estimatedSavings: 0
        },
        error: `\u51E6\u7406\u4E2D\u306B\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F: ${error.message}`
      };
    }
  }
});

export { googleVisionPurchaseCollateralOcrTool };
