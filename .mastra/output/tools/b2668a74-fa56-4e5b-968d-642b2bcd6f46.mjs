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
const googleVisionIdentityOcrTool = createTool({
  id: "google-vision-identity-ocr",
  description: "\u672C\u4EBA\u78BA\u8A8D\u66F8\u985E\u3092Google Vision API\u3067OCR\u51E6\u7406\u3059\u308B\u30C4\u30FC\u30EB",
  inputSchema: z.object({
    recordId: z.string().describe("Kintone\u30EC\u30B3\u30FC\u30C9ID"),
    identityFieldName: z.string().describe("\u672C\u4EBA\u78BA\u8A8D\u66F8\u985E\u306E\u30D5\u30A3\u30FC\u30EB\u30C9\u540D").default("\u9867\u5BA2\u60C5\u5831\uFF3F\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB"),
    maxPagesPerFile: z.number().describe("1\u30D5\u30A1\u30A4\u30EB\u3042\u305F\u308A\u306E\u6700\u5927\u51E6\u7406\u30DA\u30FC\u30B8\u6570").default(10)
  }).describe("Google Vision OCR\u51E6\u7406\u306E\u5165\u529B\u30D1\u30E9\u30E1\u30FC\u30BF"),
  outputSchema: z.object({
    success: z.boolean(),
    processingDetails: z.object({
      recordId: z.string(),
      processedFiles: z.number(),
      totalPages: z.number(),
      timestamp: z.string()
    }).describe("\u51E6\u7406\u8A73\u7D30\u60C5\u5831"),
    identityDocuments: z.array(z.object({
      fileName: z.string().describe("\u30D5\u30A1\u30A4\u30EB\u540D"),
      text: z.string().describe("\u62BD\u51FA\u3055\u308C\u305F\u30C6\u30AD\u30B9\u30C8"),
      pageCount: z.number().describe("\u30DA\u30FC\u30B8\u6570"),
      confidence: z.number().describe("\u4FE1\u983C\u5EA6"),
      tokenEstimate: z.number().describe("\u63A8\u5B9A\u30C8\u30FC\u30AF\u30F3\u6570")
    })).describe("\u672C\u4EBA\u78BA\u8A8D\u66F8\u985E\u30C9\u30AD\u30E5\u30E1\u30F3\u30C8\u30EA\u30B9\u30C8"),
    costAnalysis: z.object({
      googleVisionCost: z.number()
    }).describe("\u30B3\u30B9\u30C8\u5206\u6790"),
    error: z.string().optional()
  }).describe("Google Vision OCR\u51E6\u7406\u306E\u51FA\u529B\u7D50\u679C"),
  execute: async ({ context }) => {
    const { recordId, identityFieldName} = context;
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
            processedFiles: 0,
            totalPages: 0,
            timestamp
          },
          identityDocuments: [],
          costAnalysis: {
            googleVisionCost: 0
          },
          error: `\u30EC\u30B3\u30FC\u30C9ID ${recordId} \u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093`
        };
      }
      const record = recordResponse.data.records[0];
      const identityFiles = record[identityFieldName]?.value || [];
      if (identityFiles.length === 0) {
        return {
          success: false,
          processingDetails: {
            recordId,
            processedFiles: 0,
            totalPages: 0,
            timestamp
          },
          identityDocuments: [],
          costAnalysis: {
            googleVisionCost: 0
          },
          error: `${identityFieldName} \u306B\u30D5\u30A1\u30A4\u30EB\u304C\u6DFB\u4ED8\u3055\u308C\u3066\u3044\u307E\u305B\u3093`
        };
      }
      console.log(`[Google Vision Identity OCR] \u51E6\u7406\u958B\u59CB: ${identityFiles.length}\u30D5\u30A1\u30A4\u30EB`);
      const identityDocuments = [];
      let totalPages = 0;
      for (const file of identityFiles) {
        console.log(`[Google Vision Identity OCR] \u51E6\u7406\u4E2D: ${file.name}`);
        try {
          const downloadUrl = `https://${KINTONE_DOMAIN}/k/v1/file.json?fileKey=${file.fileKey}`;
          const fileResponse = await axios.get(downloadUrl, {
            headers: {
              "X-Cybozu-API-Token": KINTONE_API_TOKEN
            },
            responseType: "arraybuffer"
          });
          const fileBuffer = Buffer.from(fileResponse.data);
          const [result] = await visionClient.documentTextDetection({
            image: { content: fileBuffer }
          });
          const fullTextAnnotation = result.fullTextAnnotation;
          const text = fullTextAnnotation?.text || "";
          const confidence = fullTextAnnotation?.pages?.[0]?.confidence || 0;
          const pageCount = fullTextAnnotation?.pages?.length || 1;
          totalPages += pageCount;
          const tokenEstimate = Math.ceil(text.length / 4);
          identityDocuments.push({
            fileName: file.name,
            text,
            pageCount,
            confidence,
            tokenEstimate
          });
          console.log(`[Google Vision Identity OCR] \u5B8C\u4E86: ${file.name} (${pageCount}\u30DA\u30FC\u30B8, ${text.length}\u6587\u5B57)`);
        } catch (error) {
          console.error(`[Google Vision Identity OCR] \u30A8\u30E9\u30FC: ${file.name}`, error);
          identityDocuments.push({
            fileName: file.name,
            text: `[OCR\u30A8\u30E9\u30FC: ${error instanceof Error ? error.message : "\u4E0D\u660E\u306A\u30A8\u30E9\u30FC"}]`,
            pageCount: 0,
            confidence: 0,
            tokenEstimate: 0
          });
        }
      }
      const googleVisionCost = totalPages / 1e3 * 1.5;
      console.log(`[Google Vision Identity OCR] \u51E6\u7406\u5B8C\u4E86: ${identityDocuments.length}\u30D5\u30A1\u30A4\u30EB, ${totalPages}\u30DA\u30FC\u30B8, \u30B3\u30B9\u30C8: $${googleVisionCost.toFixed(4)}`);
      return {
        success: identityDocuments.length > 0,
        processingDetails: {
          recordId,
          processedFiles: identityDocuments.length,
          totalPages,
          timestamp
        },
        identityDocuments,
        costAnalysis: {
          googleVisionCost
        }
      };
    } catch (error) {
      console.error("[Google Vision Identity OCR] \u4E88\u671F\u3057\u306A\u3044\u30A8\u30E9\u30FC:", error);
      return {
        success: false,
        processingDetails: {
          recordId,
          processedFiles: 0,
          totalPages: 0,
          timestamp
        },
        identityDocuments: [],
        costAnalysis: {
          googleVisionCost: 0
        },
        error: error instanceof Error ? error.message : "\u4E0D\u660E\u306A\u30A8\u30E9\u30FC"
      };
    }
  }
});

export { googleVisionIdentityOcrTool };
