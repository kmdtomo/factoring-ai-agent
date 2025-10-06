import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';

const documentOcrVisionTool = createTool({
  id: "document-ocr-vision",
  description: "GPT-4o\u3092\u4F7F\u7528\u3057\u3066\u753B\u50CF\u30FBPDF\u30D5\u30A1\u30A4\u30EB\u304B\u3089\u30C6\u30AD\u30B9\u30C8\u60C5\u5831\u3092\u62BD\u51FA\uFF08\u9AD8\u7CBE\u5EA6\u7248\uFF09",
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
    const ocrResults = [];
    for (const file of supportedFiles) {
      try {
        console.log(`GPT-4o OCR\u51E6\u7406\u4E2D: ${file.name}`);
        const category = file.category || getCategoryFromFileName(file.name);
        const schema = getSchemaForCategory(category);
        const prompt = getPromptForCategory(category);
        const result = await generateObject({
          model: openai("gpt-4o"),
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: prompt
                },
                {
                  type: "image",
                  image: file.content
                }
              ]
            }
          ],
          schema,
          mode: "json"
        });
        ocrResults.push({
          fileName: file.name,
          category,
          extractedData: result.object,
          confidence: 95
          // GPT-4oの場合は高精度
        });
      } catch (error) {
        console.error(`OCR\u51E6\u7406\u30A8\u30E9\u30FC (${file.name}):`, error);
        ocrResults.push({
          fileName: file.name,
          category: file.category || getCategoryFromFileName(file.name),
          extractedData: {
            error: "OCR\u51E6\u7406\u306B\u5931\u6557\u3057\u307E\u3057\u305F",
            details: error instanceof Error ? error.message : "\u4E0D\u660E\u306A\u30A8\u30E9\u30FC"
          },
          confidence: 0
        });
      }
    }
    return {
      processingStatus: {
        totalFiles: files.length,
        processableFiles: supportedFiles.length,
        skippedFiles
      },
      ocrResults,
      summary: `${ocrResults.length}\u500B\u306E\u30D5\u30A1\u30A4\u30EB\u3092GPT-4o\u3067\u51E6\u7406\u3057\u307E\u3057\u305F\u3002`
    };
  }
});
function getSchemaForCategory(category) {
  switch (category) {
    case "bank_statement":
      return z.object({
        accountHolder: z.string().nullable(),
        bankName: z.string().nullable(),
        branchName: z.string().nullable(),
        transactions: z.array(z.object({
          date: z.string().nullable(),
          description: z.string().nullable(),
          deposit: z.number().nullable(),
          withdrawal: z.number().nullable(),
          balance: z.number().nullable()
        })).optional()
      });
    case "identity":
      return z.object({
        fullName: z.string().nullable(),
        address: z.string().nullable(),
        dateOfBirth: z.string().nullable(),
        documentType: z.string().nullable(),
        expiryDate: z.string().nullable()
      });
    case "invoice":
      return z.object({
        invoiceFrom: z.string().nullable(),
        invoiceTo: z.string().nullable(),
        invoiceNumber: z.string().nullable(),
        totalAmount: z.number().nullable(),
        dueDate: z.string().nullable(),
        items: z.array(z.object({
          description: z.string().nullable(),
          amount: z.number().nullable()
        })).optional()
      });
    case "business_card":
      return z.object({
        name: z.string().nullable(),
        company: z.string().nullable(),
        position: z.string().nullable(),
        email: z.string().nullable(),
        phone: z.string().nullable()
      });
    case "registry":
      return z.object({
        companyName: z.string().nullable(),
        capitalAmount: z.string().nullable(),
        establishedDate: z.string().nullable(),
        representativeName: z.string().nullable()
      });
    default:
      return z.object({
        content: z.string().nullable(),
        extractedInfo: z.record(z.any()).optional()
      });
  }
}
function getPromptForCategory(category) {
  const basePrompt = "\u3053\u306E\u753B\u50CF\u304B\u3089\u4EE5\u4E0B\u306E\u60C5\u5831\u3092\u6B63\u78BA\u306B\u62BD\u51FA\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u8AAD\u307F\u53D6\u308C\u306A\u3044\u9805\u76EE\u306Fnull\u3068\u3057\u3066\u8FD4\u3057\u3066\u304F\u3060\u3055\u3044\u3002";
  switch (category) {
    case "bank_statement":
      return `${basePrompt}
\u901A\u5E33\u306E\u753B\u50CF\u304B\u3089\uFF1A
- \u53E3\u5EA7\u540D\u7FA9\u4EBA
- \u9280\u884C\u540D\u3068\u652F\u5E97\u540D
- \u53D6\u5F15\u5C65\u6B74\uFF08\u65E5\u4ED8\u3001\u6458\u8981\u3001\u5165\u91D1\u984D\u3001\u51FA\u91D1\u984D\u3001\u6B8B\u9AD8\uFF09
\u7279\u306B\u4F01\u696D\u540D\u304C\u542B\u307E\u308C\u308B\u5165\u91D1\u53D6\u5F15\u306B\u6CE8\u76EE\u3057\u3066\u304F\u3060\u3055\u3044\u3002`;
    case "identity":
      return `${basePrompt}
\u672C\u4EBA\u78BA\u8A8D\u66F8\u985E\u304B\u3089\uFF1A
- \u6C0F\u540D\uFF08\u6F22\u5B57\uFF09
- \u4F4F\u6240
- \u751F\u5E74\u6708\u65E5\uFF08YYYY-MM-DD\u5F62\u5F0F\uFF09
- \u66F8\u985E\u306E\u7A2E\u985E\uFF08\u904B\u8EE2\u514D\u8A31\u8A3C\u3001\u30DE\u30A4\u30CA\u30F3\u30D0\u30FC\u30AB\u30FC\u30C9\u7B49\uFF09
- \u6709\u52B9\u671F\u9650\uFF08YYYY-MM-DD\u5F62\u5F0F\uFF09`;
    case "invoice":
      return `${basePrompt}
\u8ACB\u6C42\u66F8\u304B\u3089\uFF1A
- \u8ACB\u6C42\u5143\u4F01\u696D\u540D
- \u8ACB\u6C42\u5148\u4F01\u696D\u540D
- \u8ACB\u6C42\u66F8\u756A\u53F7
- \u8ACB\u6C42\u91D1\u984D\uFF08\u7A0E\u8FBC\uFF09
- \u652F\u6255\u671F\u65E5\uFF08YYYY-MM-DD\u5F62\u5F0F\uFF09
- \u4E3B\u8981\u306A\u9805\u76EE\u3068\u91D1\u984D`;
    case "business_card":
      return `${basePrompt}
\u540D\u523A\u304B\u3089\uFF1A
- \u6C0F\u540D
- \u4F1A\u793E\u540D
- \u5F79\u8077
- \u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9
- \u96FB\u8A71\u756A\u53F7`;
    case "registry":
      return `${basePrompt}
\u767B\u8A18\u7C3F\u8B04\u672C\u304B\u3089\uFF1A
- \u4F1A\u793E\u540D
- \u8CC7\u672C\u91D1
- \u8A2D\u7ACB\u65E5\uFF08YYYY-MM-DD\u5F62\u5F0F\uFF09
- \u4EE3\u8868\u8005\u540D`;
    default:
      return `${basePrompt}
\u753B\u50CF\u306B\u542B\u307E\u308C\u308B\u3059\u3079\u3066\u306E\u30C6\u30AD\u30B9\u30C8\u60C5\u5831\u3068\u3001\u30D3\u30B8\u30CD\u30B9\u6587\u66F8\u3068\u3057\u3066\u91CD\u8981\u306A\u60C5\u5831\u3092\u62BD\u51FA\u3057\u3066\u304F\u3060\u3055\u3044\u3002`;
  }
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

export { documentOcrVisionTool };
