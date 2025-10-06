import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const documentOcrTool = createTool({
  id: "document-ocr",
  description: "\u753B\u50CF\u30FBPDF\u30D5\u30A1\u30A4\u30EB\u304B\u3089\u30C6\u30AD\u30B9\u30C8\u60C5\u5831\u3092\u62BD\u51FA\uFF08\u30A8\u30FC\u30B8\u30A7\u30F3\u30C8\u304CClaude Vision API\u3067\u51E6\u7406\uFF09",
  inputSchema: z.object({
    files: z.array(z.object({
      name: z.string(),
      contentType: z.string(),
      content: z.string().describe("Base64\u30A8\u30F3\u30B3\u30FC\u30C9\u3055\u308C\u305F\u30D5\u30A1\u30A4\u30EB\u30B3\u30F3\u30C6\u30F3\u30C4"),
      category: z.string().optional()
    })).describe("\u51E6\u7406\u5BFE\u8C61\u30D5\u30A1\u30A4\u30EB"),
    extractionTargets: z.object({
      bankStatements: z.boolean().default(true),
      identityDocuments: z.boolean().default(true),
      invoices: z.boolean().default(true),
      businessCards: z.boolean().default(true)
    }).optional()
  }),
  outputSchema: z.object({
    processingStatus: z.object({
      totalFiles: z.number(),
      processableFiles: z.number(),
      skippedFiles: z.array(z.object({
        name: z.string(),
        reason: z.string()
      }))
    }),
    ocrResults: z.array(z.object({
      fileName: z.string(),
      category: z.string(),
      extractedData: z.any().describe("\u62BD\u51FA\u3055\u308C\u305F\u30C7\u30FC\u30BF"),
      confidence: z.number().min(0).max(100)
    })),
    summary: z.string().describe("OCR\u51E6\u7406\u306E\u30B5\u30DE\u30EA\u30FC")
  }),
  execute: async ({ context }) => {
    const { files} = context;
    if (!files || files.length === 0) {
      return createEmptyOCRResult(0);
    }
    const imageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    const pdfTypes = ["application/pdf"];
    const skippedFiles = [];
    const supportedFiles = [];
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    for (const file of files) {
      const isSupported = imageTypes.includes(file.contentType) || pdfTypes.includes(file.contentType);
      if (!isSupported) {
        skippedFiles.push({
          name: file.name,
          reason: `\u30B5\u30DD\u30FC\u30C8\u3055\u308C\u3066\u3044\u306A\u3044\u30D5\u30A1\u30A4\u30EB\u30BF\u30A4\u30D7: ${file.contentType}`
        });
        continue;
      }
      const estimatedSize = file.content.length * 3 / 4;
      if (estimatedSize > MAX_FILE_SIZE) {
        skippedFiles.push({
          name: file.name,
          reason: `\u30D5\u30A1\u30A4\u30EB\u30B5\u30A4\u30BA\u304C\u5236\u9650\u3092\u8D85\u3048\u3066\u3044\u307E\u3059 (10MB\u4EE5\u4E0A)`
        });
        continue;
      }
      supportedFiles.push(file);
    }
    if (supportedFiles.length === 0) {
      return {
        processingStatus: {
          totalFiles: files.length,
          processableFiles: 0,
          skippedFiles
        },
        ocrResults: [],
        summary: "\u51E6\u7406\u53EF\u80FD\u306A\u30D5\u30A1\u30A4\u30EB\u304C\u3042\u308A\u307E\u305B\u3093\u3067\u3057\u305F\u3002"
      };
    }
    console.log(`OCR\u51E6\u7406: ${supportedFiles.length}\u500B\u306E\u30D5\u30A1\u30A4\u30EB\u3092\u51E6\u7406\u6E96\u5099\u4E2D`);
    return {
      processingStatus: {
        totalFiles: files.length,
        processableFiles: supportedFiles.length,
        skippedFiles
      },
      ocrResults: supportedFiles.map((file) => ({
        fileName: file.name,
        category: file.category || getCategoryFromFileName(file.name),
        extractedData: {
          _instruction: `\u3053\u306E\u30D5\u30A1\u30A4\u30EB\u3092Claude Vision API\u3067\u89E3\u6790\u3057\u3001${getTargetDataForCategory(file.category || getCategoryFromFileName(file.name))}\u3092\u62BD\u51FA\u3057\u3066\u304F\u3060\u3055\u3044`,
          _fileInfo: {
            name: file.name,
            type: file.contentType,
            category: file.category || getCategoryFromFileName(file.name)
          }
        },
        confidence: 0
        // エージェントが実際に処理後に更新
      })),
      summary: `${supportedFiles.length}\u500B\u306E\u30D5\u30A1\u30A4\u30EB\u304C\u51E6\u7406\u5BFE\u8C61\u3067\u3059\u3002\u30A8\u30FC\u30B8\u30A7\u30F3\u30C8\u304C\u5225\u9014Claude Vision API\u3067\u89E3\u6790\u3057\u307E\u3059\u3002`
    };
  }
});
function createEmptyOCRResult(totalFiles) {
  return {
    processingStatus: {
      totalFiles,
      processableFiles: 0,
      skippedFiles: []
    },
    ocrResults: [],
    summary: "\u51E6\u7406\u5BFE\u8C61\u306E\u30D5\u30A1\u30A4\u30EB\u304C\u3042\u308A\u307E\u305B\u3093\u3067\u3057\u305F\u3002"
  };
}
function getCategoryFromFileName(fileName) {
  const name = fileName.toLowerCase();
  if (name.includes("\u901A\u5E33") || name.includes("bank")) return "bank_statement";
  if (name.includes("\u514D\u8A31") || name.includes("\u30DE\u30A4\u30CA\u30F3\u30D0\u30FC") || name.includes("identity")) return "identity";
  if (name.includes("\u8ACB\u6C42") || name.includes("invoice")) return "invoice";
  if (name.includes("\u540D\u523A") || name.includes("card")) return "business_card";
  if (name.includes("\u8B04\u672C") || name.includes("registry")) return "registry";
  return "other";
}
function getTargetDataForCategory(category) {
  switch (category) {
    case "bank_statement":
      return "\u53E3\u5EA7\u540D\u7FA9\u3001\u91D1\u878D\u6A5F\u95A2\u540D\u3001\u53D6\u5F15\u5C65\u6B74\uFF08\u65E5\u4ED8\u3001\u6458\u8981\u3001\u5165\u91D1\u984D\u3001\u51FA\u91D1\u984D\u3001\u6B8B\u9AD8\uFF09";
    case "identity":
      return "\u6C0F\u540D\u3001\u4F4F\u6240\u3001\u751F\u5E74\u6708\u65E5\u3001\u6709\u52B9\u671F\u9650";
    case "invoice":
      return "\u8ACB\u6C42\u5148\u4F01\u696D\u540D\u3001\u8ACB\u6C42\u756A\u53F7\u3001\u8ACB\u6C42\u91D1\u984D\u3001\u652F\u6255\u671F\u65E5";
    case "business_card":
      return "\u6C0F\u540D\u3001\u4F1A\u793E\u540D\u3001\u5F79\u8077\u3001\u96FB\u8A71\u756A\u53F7\u3001\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9";
    case "registry":
      return "\u4F1A\u793E\u540D\u3001\u8CC7\u672C\u91D1\u3001\u8A2D\u7ACB\u65E5\u3001\u4EE3\u8868\u8005\u540D";
    default:
      return "\u95A2\u9023\u3059\u308B\u3059\u3079\u3066\u306E\u60C5\u5831";
  }
}

export { documentOcrTool };
