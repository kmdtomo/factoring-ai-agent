import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { anthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import axios from 'axios';

const ocrBankStatementTool = createTool({
  id: "ocr-bank-statement",
  description: "\u30E1\u30A4\u30F3\u901A\u5E33\u5C02\u7528OCR\u3002\u30DE\u30FC\u30AF\u691C\u51FA\u2192\u9069\u5FDC\u7684\u62BD\u51FA\u2192\u671F\u5F85\u5024\u7167\u5408\u3002\u6CD5\u4EBA\u53E3\u5EA7\u306E\u5165\u91D1\u984D\u7167\u5408\u306B\u7279\u5316",
  inputSchema: z.object({
    recordId: z.string().describe("Kintone\u30EC\u30B3\u30FC\u30C9ID\uFF08\u30E1\u30A4\u30F3\u901A\u5E33\uFF3F\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB+\u62C5\u4FDD\u60C5\u5831\u30C6\u30FC\u30D6\u30EB\u3092\u81EA\u52D5\u53D6\u5F97\uFF09")
  }),
  outputSchema: z.object({
    success: z.boolean(),
    processingDetails: z.object({
      recordId: z.string(),
      filesFound: z.number(),
      collateralEntriesFound: z.number(),
      expectedCompanies: z.array(z.string())
    }),
    markDetection: z.object({
      hasMarks: z.boolean().describe("\u8996\u899A\u7684\u30DE\u30FC\u30AF\u306E\u6709\u7121"),
      markCount: z.number().optional().describe("\u691C\u51FA\u3055\u308C\u305F\u30DE\u30FC\u30AF\u306E\u6570"),
      extractionMode: z.enum(["marked", "search"]).describe("\u62BD\u51FA\u30E2\u30FC\u30C9")
    }),
    expectedPayments: z.object({}).passthrough().describe("\u671F\u5F85\u3055\u308C\u308B\u5165\u91D1\u984D\uFF08\u4F1A\u793E\u5225\u30FB\u6708\u5225\uFF09"),
    extractedTransactions: z.array(z.object({
      amount: z.number().describe("\u5165\u91D1\u984D"),
      date: z.string().optional().describe("\u65E5\u4ED8"),
      payerName: z.string().optional().describe("\u632F\u8FBC\u5143/\u652F\u6255\u8005\u540D"),
      description: z.string().optional().describe("\u6458\u8981/\u305D\u306E\u4ED6\u60C5\u5831")
    })).describe("\u62BD\u51FA\u3055\u308C\u305F\u5165\u91D1\u53D6\u5F15\u4E00\u89A7"),
    matchResults: z.array(z.object({
      amount: z.number(),
      matched: z.string().optional().describe("\u4E00\u81F4\u3057\u305F\u4F01\u696D\u3068\u671F\u9593"),
      status: z.enum(["exact", "none"]).describe("\u7167\u5408\u7D50\u679C")
    })),
    summary: z.string().describe("\u51E6\u7406\u7D50\u679C\u306E\u8981\u7D04"),
    fileProcessed: z.string().optional().describe("\u51E6\u7406\u3057\u305F\u30D5\u30A1\u30A4\u30EB\u540D"),
    error: z.string().optional()
  }),
  execute: async ({ context }) => {
    const { recordId } = context;
    const domain = process.env.KINTONE_DOMAIN;
    const apiToken = process.env.KINTONE_API_TOKEN;
    if (!domain || !apiToken) {
      throw new Error("Kintone\u74B0\u5883\u5909\u6570\u304C\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093");
    }
    try {
      const fileUrl = `https://${domain}/k/v1/records.json?app=37&query=$id="${recordId}"`;
      const recordResponse = await axios.get(fileUrl, {
        headers: { "X-Cybozu-API-Token": apiToken }
      });
      if (recordResponse.data.records.length === 0) {
        throw new Error(`\u30EC\u30B3\u30FC\u30C9ID: ${recordId} \u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093`);
      }
      const record = recordResponse.data.records[0];
      const bankFiles = record.\u30E1\u30A4\u30F3\u901A\u5E33\uFF3F\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB?.value || [];
      if (bankFiles.length === 0) {
        return {
          success: false,
          processingDetails: {
            recordId,
            filesFound: 0,
            collateralEntriesFound: 0,
            expectedCompanies: []
          },
          markDetection: {
            hasMarks: false,
            markCount: 0,
            extractionMode: "search"
          },
          expectedPayments: {},
          extractedTransactions: [],
          matchResults: [],
          summary: "\u30E1\u30A4\u30F3\u901A\u5E33\u304C\u6DFB\u4ED8\u3055\u308C\u3066\u3044\u307E\u305B\u3093",
          error: "\u30E1\u30A4\u30F3\u901A\u5E33\u304C\u6DFB\u4ED8\u3055\u308C\u3066\u3044\u307E\u305B\u3093"
        };
      }
      console.log(`[OCR Bank Statement] Candidate files: ${bankFiles.length}`);
      console.log(`[OCR Bank Statement] \u62C5\u4FDD\u60C5\u5831\u30C6\u30FC\u30D6\u30EB\u3092\u53D6\u5F97\u4E2D...`);
      const collateralInfoRaw = record.\u62C5\u4FDD\u60C5\u5831?.value || [];
      console.log(`[OCR Bank Statement] \u62C5\u4FDD\u60C5\u5831: ${collateralInfoRaw.length}\u4EF6`);
      const expectedPayments = {};
      const expectedCompanies = [];
      collateralInfoRaw.forEach((item) => {
        const company = item.value?.\u4F1A\u793E\u540D_\u7B2C\u4E09\u50B5\u52D9\u8005_\u62C5\u4FDD?.value || "";
        if (company) {
          expectedCompanies.push(company);
          const payments = [
            parseInt(item.value?.\u904E\u53BB\u306E\u5165\u91D1_\u5148\u3005\u6708?.value || "0"),
            parseInt(item.value?.\u904E\u53BB\u306E\u5165\u91D1_\u5148\u6708?.value || "0"),
            parseInt(item.value?.\u904E\u53BB\u306E\u5165\u91D1_\u4ECA\u6708?.value || "0")
          ].filter((p) => p > 0);
          if (payments.length > 0) {
            expectedPayments[company] = payments;
          }
        }
      });
      console.log(`[OCR Bank Statement] \u671F\u5F85\u5024\u69CB\u7BC9\u5B8C\u4E86:`, expectedPayments);
      const filesToProcess = bankFiles.slice(0, 3);
      console.log(`[OCR Bank Statement] Batch processing ${filesToProcess.length} files`);
      const fileContents = [];
      const processedFiles = [];
      for (const file of filesToProcess) {
        console.log(`[OCR Bank Statement] Downloading: ${file.name}`);
        const downloadUrl = `https://${domain}/k/v1/file.json?fileKey=${file.fileKey}`;
        const fileResponse = await axios.get(downloadUrl, {
          headers: { "X-Cybozu-API-Token": apiToken },
          responseType: "arraybuffer"
        });
        const base64Content = Buffer.from(fileResponse.data).toString("base64");
        const isPDF = file.contentType === "application/pdf";
        const dataUrl = isPDF ? `data:application/pdf;base64,${base64Content}` : `data:${file.contentType};base64,${base64Content}`;
        fileContents.push({
          dataUrl
        });
        processedFiles.push(file.name);
      }
      const ocrPrompt = `\u3053\u306E\u901A\u5E33\u753B\u50CF\uFF08${filesToProcess.length}\u30D5\u30A1\u30A4\u30EB\uFF09\u3092\u5206\u6790\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A

\u{1F50D} \u3010\u30B9\u30C6\u30C3\u30D71: \u30DE\u30FC\u30AF\u691C\u51FA - \u6700\u91CD\u8981\u3011
**\u53D6\u5F15\u884C\u306B\u4ED8\u3051\u3089\u308C\u305F\u5F37\u8ABF\u30DE\u30FC\u30AF**\u3092\u691C\u51FA\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A
- \u86CD\u5149\u30DA\u30F3\u3067\u30CF\u30A4\u30E9\u30A4\u30C8\u3055\u308C\u305F\u53D6\u5F15\u884C
- \u4E38\u5370\uFF08\u8D64\u4E38\u3001\u9752\u4E38\u306A\u3069\uFF09\u3067\u56F2\u307E\u308C\u305F\u53D6\u5F15
- \u4E0B\u7DDA\u3084\u6CE2\u7DDA\u304C\u5F15\u304B\u308C\u305F\u53D6\u5F15
- \u77E2\u5370\u3067\u6307\u3057\u793A\u3055\u308C\u305F\u53D6\u5F15
- \u30C1\u30A7\u30C3\u30AF\u30DE\u30FC\u30AF\u304C\u4ED8\u3044\u305F\u53D6\u5F15

\u26A0\uFE0F \u91CD\u8981\u306A\u533A\u5225: 
- \u2705 \u5BFE\u8C61: \u53D6\u5F15\u91D1\u984D\u3084\u65E5\u4ED8\u3092\u5F37\u8ABF\u3059\u308B\u30DE\u30FC\u30AF
- \u274C \u5BFE\u8C61\u5916: \u624B\u66F8\u304D\u306E\u30E1\u30E2\u3001\u30B3\u30E1\u30F3\u30C8\u3001\u8AAC\u660E\u6587
- \u274C \u5BFE\u8C61\u5916: \u53D6\u5F15\u3068\u7121\u95A2\u4FC2\u306A\u8D64\u3044\u6587\u5B57\u3084\u5370

\u{1F4A1} \u5224\u65AD\u57FA\u6E96:
- \u30DE\u30FC\u30AF\u306F\u300C\u3069\u306E\u53D6\u5F15\u3092\u898B\u308B\u3079\u304D\u304B\u300D\u3092\u793A\u3059\u3082\u306E\u3067\u3059
- \u624B\u66F8\u304D\u30E1\u30E2\u306F\u5185\u5BB9\u306E\u8AAC\u660E\u3067\u3042\u308A\u3001\u30DE\u30FC\u30AF\u3067\u306F\u3042\u308A\u307E\u305B\u3093

\u{1F50E} \u30B9\u30AD\u30E3\u30F3\u65B9\u6CD5:
- \u901A\u5E33\u306E\u6700\u521D\u306E\u30DA\u30FC\u30B8\u304B\u3089\u6700\u5F8C\u306E\u30DA\u30FC\u30B8\u307E\u3067\u5168\u3066\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044
- \u7279\u306B\u6700\u521D\u306E\u6570\u30DA\u30FC\u30B8\u306F\u898B\u9003\u3057\u3084\u3059\u3044\u306E\u3067\u3001\u5165\u5FF5\u306B\u30C1\u30A7\u30C3\u30AF
- \u5404\u30DA\u30FC\u30B8\u306E\u4E0A\u90E8\u30FB\u4E2D\u90E8\u30FB\u4E0B\u90E8\u3092\u6F0F\u308C\u306A\u304F\u78BA\u8A8D

\u{1F4CA} \u3010\u30B9\u30C6\u30C3\u30D72: \u53D6\u5F15\u60C5\u5831\u306E\u62BD\u51FA\u3011

\u26A0\uFE0F \u7D76\u5BFE\u7684\u30EB\u30FC\u30EB:
- \u753B\u50CF\u306B\u5B9F\u969B\u306B\u8A18\u8F09\u3055\u308C\u3066\u3044\u308B\u5185\u5BB9\u306E\u307F\u3092\u62BD\u51FA
- \u67B6\u7A7A\u306E\u4F01\u696D\u540D\u3084\u91D1\u984D\u3092\u5275\u4F5C\u3057\u306A\u3044
- \u8AAD\u307F\u53D6\u308C\u306A\u3044\u90E8\u5206\u306F\u7121\u7406\u306B\u57CB\u3081\u306A\u3044

\u25C6 \u30DE\u30FC\u30AF\u3042\u308A\u30E2\u30FC\u30C9\uFF08\u30DE\u30FC\u30AF\u3092\u691C\u51FA\u3057\u305F\u5834\u5408\uFF09:
  \u{1F534} \u30DE\u30FC\u30AF\u3055\u308C\u305F\u7B87\u6240\u306E\u60C5\u5831\u3092\u5168\u3066\u305D\u306E\u307E\u307E\u62BD\u51FA
  - \u30DE\u30FC\u30AF\u3055\u308C\u305F\u884C\u306B\u3042\u308B\u5168\u3066\u306E\u60C5\u5831\uFF08\u5165\u91D1\u30FB\u51FA\u91D1\u554F\u308F\u305A\uFF09\u3092\u8AAD\u307F\u53D6\u308B
  - \u65E5\u4ED8\u3001\u91D1\u984D\uFF08\u30D7\u30E9\u30B9/\u30DE\u30A4\u30CA\u30B9\uFF09\u3001\u632F\u8FBC\u5143/\u632F\u8FBC\u5148\u540D\u3001\u6458\u8981\u306A\u3069
  - \u30DE\u30FC\u30AF\u3055\u308C\u305F\u5168\u3066\u306E\u53D6\u5F15\u3092\u6F0F\u308C\u306A\u304F\u5831\u544A

\u25C6 \u5168\u4F53\u30B9\u30AD\u30E3\u30F3\u30E2\u30FC\u30C9\uFF08\u30DE\u30FC\u30AF\u304C\u306A\u3044\u5834\u5408\uFF09:
  \u901A\u5E33\u5185\u306E\u4E3B\u8981\u306A\u5165\u91D1\u53D6\u5F15\u3092\u62BD\u51FA
  - \u5927\u304D\u306A\u91D1\u984D\u306E\u5165\u91D1\u3092\u4E2D\u5FC3\u306B\u62BD\u51FA
  - \u65E5\u4ED8\u3001\u91D1\u984D\u3001\u632F\u8FBC\u5143\u540D\u3092\u6B63\u78BA\u306B\u8AAD\u307F\u53D6\u308B

\u{1F4CB} \u3010\u62BD\u51FA\u3059\u308B\u60C5\u5831\u3011
\u5404\u53D6\u5F15\u306B\u3064\u3044\u3066\uFF1A
- \u91D1\u984D: \u901A\u5E33\u306B\u8A18\u8F09\u306E\u91D1\u984D\u3092\u6B63\u78BA\u306B\uFF08\u5165\u91D1\u306F\u30D7\u30E9\u30B9\u3001\u51FA\u91D1\u306F\u30DE\u30A4\u30CA\u30B9\uFF09
- \u65E5\u4ED8: \u8A18\u8F09\u3055\u308C\u3066\u3044\u308B\u65E5\u4ED8
- \u632F\u8FBC\u5143\u540D\uFF08payerName\uFF09: \u901A\u5E33\u306B\u5B9F\u969B\u306B\u5370\u5B57\u3055\u308C\u3066\u3044\u308B\u4F01\u696D\u540D\u30FB\u500B\u4EBA\u540D
- \u6458\u8981: \u305D\u306E\u4ED6\u306E\u4ED8\u52A0\u60C5\u5831\u304C\u3042\u308C\u3070

\u{1F6AB} \u3010\u7981\u6B62\u4E8B\u9805\u3011
- \u5B58\u5728\u3057\u306A\u3044\u4F01\u696D\u540D\u3092\u5275\u4F5C\u3057\u306A\u3044
- \u4E0D\u660E\u77AD\u306A\u90E8\u5206\u3092\u63A8\u6E2C\u3067\u57CB\u3081\u306A\u3044
- \u753B\u50CF\u306B\u306A\u3044\u60C5\u5831\u3092\u8FFD\u52A0\u3057\u306A\u3044

\u51FA\u529B: \u5B9F\u969B\u306B\u901A\u5E33\u304B\u3089\u8AAD\u307F\u53D6\u308C\u305F\u60C5\u5831\u306E\u307F\u3092\u63D0\u4F9B\u3057\u3066\u304F\u3060\u3055\u3044\u3002`;
      const content = [
        { type: "text", text: ocrPrompt },
        ...fileContents.map((f) => ({ type: "image", image: f.dataUrl }))
      ];
      let result;
      try {
        result = await generateObject({
          model: anthropic("claude-3-7-sonnet-20250219"),
          messages: [{ role: "user", content }],
          schema: z.object({
            markDetection: z.object({
              hasMarks: z.boolean().describe("\u8996\u899A\u7684\u30DE\u30FC\u30AF\u306E\u6709\u7121"),
              markCount: z.number().optional().describe("\u691C\u51FA\u3055\u308C\u305F\u30DE\u30FC\u30AF\u306E\u6570"),
              extractionMode: z.enum(["marked", "search"]).describe("\u62BD\u51FA\u30E2\u30FC\u30C9")
            }),
            extractedTransactions: z.array(z.object({
              amount: z.number().describe("\u5165\u91D1\u984D"),
              date: z.string().optional().describe("\u65E5\u4ED8"),
              payerName: z.string().optional().describe("\u632F\u8FBC\u5143/\u652F\u6255\u8005\u540D"),
              description: z.string().optional().describe("\u6458\u8981/\u305D\u306E\u4ED6\u60C5\u5831")
            })),
            matchResults: z.array(z.object({
              amount: z.number(),
              matched: z.string().optional().describe("\u4E00\u81F4\u3057\u305F\u4F01\u696D\u3068\u671F\u9593"),
              status: z.enum(["exact", "none"]).describe("\u7167\u5408\u7D50\u679C")
            })).optional(),
            confidence: z.number().min(0).max(100).optional().describe("\u8AAD\u307F\u53D6\u308A\u4FE1\u983C\u5EA6")
          }),
          mode: "json",
          temperature: 0
        });
      } catch (error) {
        console.error(`[OCR Bank Statement] OpenAI\u62D2\u5426\u30A8\u30E9\u30FC (\u30D0\u30C3\u30C1\u51E6\u7406):`, error);
        result = {
          object: {
            markDetection: {
              hasMarks: false,
              markCount: 0,
              extractionMode: "search"
            },
            extractedTransactions: [],
            matchResults: [],
            confidence: 0
          }
        };
      }
      const extractedTransactions = result.object.extractedTransactions || [];
      const markDetection = result.object.markDetection;
      console.log(`[OCR Bank Statement] \u30D0\u30C3\u30C1\u51E6\u7406\u5B8C\u4E86: ${extractedTransactions.length}\u4EF6\u306E\u53D6\u5F15\u3092${processedFiles.length}\u30D5\u30A1\u30A4\u30EB\u304B\u3089\u62BD\u51FA`);
      console.log(`[OCR Bank Statement] \u30DE\u30FC\u30AF\u691C\u51FA\u7D50\u679C:`, markDetection);
      let matchResults = [];
      if (markDetection.extractionMode === "search" || !markDetection.hasMarks) {
        const allExpectedAmounts = Object.entries(expectedPayments).flatMap(
          ([company, amounts]) => amounts.map((amount) => ({ company, amount }))
        );
        matchResults = extractedTransactions.map((transaction) => {
          const match = allExpectedAmounts.find((exp) => exp.amount === transaction.amount);
          return {
            amount: transaction.amount,
            matched: match ? `${match.company}` : void 0,
            status: match ? "exact" : "none"
          };
        });
        console.log(`[OCR Bank Statement] \u7167\u5408\u7D50\u679C:`, matchResults);
      }
      const summary = `\u901A\u5E33OCR\u5B8C\u4E86\uFF08${processedFiles.length}\u30D5\u30A1\u30A4\u30EB\u51E6\u7406\uFF09\u3001${markDetection.extractionMode === "marked" ? "\u30DE\u30FC\u30AF" : "\u671F\u5F85\u5024"}\u30E2\u30FC\u30C9\u3067${extractedTransactions.length}\u4EF6\u62BD\u51FA`;
      return {
        success: true,
        processingDetails: {
          recordId,
          filesFound: bankFiles.length,
          collateralEntriesFound: collateralInfoRaw.length,
          expectedCompanies
        },
        markDetection,
        expectedPayments,
        extractedTransactions,
        matchResults,
        summary,
        fileProcessed: processedFiles.join(", ")
      };
    } catch (error) {
      console.error(`[OCR Bank Statement] Error:`, error);
      return {
        success: false,
        processingDetails: {
          recordId,
          filesFound: 0,
          collateralEntriesFound: 0,
          expectedCompanies: []
        },
        markDetection: {
          hasMarks: false,
          markCount: 0,
          extractionMode: "search"
        },
        expectedPayments: {},
        extractedTransactions: [],
        matchResults: [],
        summary: "OCR\u51E6\u7406\u306B\u5931\u6557\u3057\u307E\u3057\u305F",
        error: error instanceof Error ? error.message : "OCR\u51E6\u7406\u306B\u5931\u6557\u3057\u307E\u3057\u305F"
      };
    }
  }
});

export { ocrBankStatementTool };
