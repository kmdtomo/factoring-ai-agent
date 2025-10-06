import { Tool } from '@mastra/core';
import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import axios from 'axios';

const ocrPersonalBankTool = new Tool({
  id: "ocr-personal-bank-tool",
  description: "\u500B\u4EBA\u53E3\u5EA7\uFF08\u305D\u306E\u4ED6\u901A\u5E33\uFF09\u306E\u4F7F\u9014\u5206\u6790\u5C02\u7528OCR\u3002\u7279\u5FB4\u7684\u306A\u53D6\u5F15\u30D1\u30BF\u30FC\u30F3\u3092\u4E8B\u5B9F\u30D9\u30FC\u30B9\u3067\u62BD\u51FA\u30FB\u5831\u544A",
  inputSchema: z.object({
    recordId: z.string().describe("Kintone\u30EC\u30B3\u30FC\u30C9ID\uFF08\u305D\u306E\u4ED6\u901A\u5E33\uFF3F\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB\u3092\u81EA\u52D5\u53D6\u5F97\uFF09")
  }),
  outputSchema: z.object({
    success: z.boolean(),
    processingDetails: z.object({
      recordId: z.string(),
      filesFound: z.number(),
      accountHolder: z.string().optional().describe("\u53E3\u5EA7\u540D\u7FA9\u4EBA"),
      bankName: z.string().optional().describe("\u91D1\u878D\u6A5F\u95A2\u540D")
    }),
    markedTransactions: z.array(z.string()).optional().describe("\u30DE\u30FC\u30AF/\u30E1\u30E2\u304C\u3042\u308B\u53D6\u5F15"),
    notablePoints: z.array(z.string()).optional().describe("\u7279\u306B\u76EE\u7ACB\u3064\u70B9\uFF08\u3042\u308C\u3070\uFF09"),
    summary: z.string().describe("\u7C21\u6F54\u306A\u8981\u7D04\uFF08\u7279\u8A18\u4E8B\u9805\u306A\u3057\u3082\u53EF\uFF09"),
    fileProcessed: z.string().optional().describe("\u51E6\u7406\u3057\u305F\u30D5\u30A1\u30A4\u30EB\u540D"),
    error: z.string().optional()
  }),
  execute: async ({ context }) => {
    try {
      const { recordId } = context;
      const domain = process.env.KINTONE_DOMAIN;
      const apiToken = process.env.KINTONE_API_TOKEN;
      if (!domain || !apiToken) {
        throw new Error("Kintone\u74B0\u5883\u5909\u6570\u304C\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093");
      }
      console.log(`\u{1F3E6} [\u500B\u4EBA\u53E3\u5EA7OCR] \u958B\u59CB - Record ID: ${recordId}`);
      const fileUrl = `https://${domain}/k/v1/records.json?app=37&query=$id="${recordId}"`;
      const recordResponse = await axios.get(fileUrl, {
        headers: { "X-Cybozu-API-Token": apiToken }
      });
      const recordData = recordResponse.data;
      if (!recordData.records || recordData.records.length === 0) {
        return {
          success: false,
          processingDetails: {
            recordId,
            filesFound: 0
          },
          markedTransactions: [],
          notablePoints: [],
          summary: "\u30EC\u30B3\u30FC\u30C9\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F"
        };
      }
      const record = recordData.records[0];
      const personalBankFiles = record.\u305D\u306E\u4ED6\u901A\u5E33\uFF3F\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB?.value || [];
      if (personalBankFiles.length === 0) {
        console.log(`\u26A0\uFE0F [\u500B\u4EBA\u53E3\u5EA7OCR] \u305D\u306E\u4ED6\u901A\u5E33\uFF3F\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093`);
        return {
          success: true,
          // ファイルなしは正常な状態として扱う
          processingDetails: {
            recordId,
            filesFound: 0
          },
          markedTransactions: [],
          notablePoints: [],
          summary: "\u305D\u306E\u4ED6\u901A\u5E33\uFF08\u500B\u4EBA\u53E3\u5EA7\uFF09\u306E\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB\u304C\u3042\u308A\u307E\u305B\u3093\u3002\u51E6\u7406\u3092\u30B9\u30AD\u30C3\u30D7\u3057\u307E\u3057\u305F\u3002",
          fileProcessed: "\u306A\u3057"
        };
      }
      console.log(`\u{1F4C4} [\u500B\u4EBA\u53E3\u5EA7OCR] \u30D5\u30A1\u30A4\u30EB\u6570: ${personalBankFiles.length}`);
      const filesToProcess = personalBankFiles.slice(0, 3);
      const base64Images = [];
      for (const file of filesToProcess) {
        const downloadUrl = `https://${domain}/k/v1/file.json?fileKey=${file.fileKey}`;
        const fileResponse = await axios.get(downloadUrl, {
          headers: { "X-Cybozu-API-Token": apiToken },
          responseType: "arraybuffer"
        });
        if (fileResponse.status === 200) {
          const base64Content = Buffer.from(fileResponse.data).toString("base64");
          const isPDF = file.contentType === "application/pdf";
          if (isPDF) {
            base64Images.push({
              type: "image",
              image: `data:application/pdf;base64,${base64Content}`
            });
          } else {
            base64Images.push({
              type: "image",
              image: `data:${file.contentType};base64,${base64Content}`
            });
          }
        }
      }
      if (base64Images.length === 0) {
        return {
          success: false,
          processingDetails: {
            recordId,
            filesFound: personalBankFiles.length
          },
          markedTransactions: [],
          notablePoints: [],
          summary: "\u901A\u5E33\u753B\u50CF\u306E\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F",
          error: "\u901A\u5E33\u753B\u50CF\u306E\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F"
        };
      }
      const prompt = `\u3053\u306E\u500B\u4EBA\u53E3\u5EA7\u306E\u901A\u5E33\u753B\u50CF\uFF08${filesToProcess.length}\u30D5\u30A1\u30A4\u30EB\uFF09\u3092\u5206\u6790\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A

\u{1F4CA} \u3010\u5206\u6790\u65B9\u91DD\u3011

\u{1F50D} \u307E\u305A\u78BA\u8A8D\u3059\u308B\u3053\u3068:
- \u30DE\u30FC\u30AF\u3084\u30E1\u30E2\u3001\u624B\u66F8\u304D\u306E\u5370\u306A\u3069\u304C\u3042\u308B\u304B\u78BA\u8A8D
- \u3042\u308C\u3070\u3001\u305D\u308C\u3089\u306F\u5BE9\u67FB\u62C5\u5F53\u8005\u304C\u91CD\u8981\u3068\u5224\u65AD\u3057\u305F\u7B87\u6240

\u25C6 \u30DE\u30FC\u30AF\u30FB\u30E1\u30E2\u304C\u3042\u308B\u5834\u5408:
\u2192 \u30DE\u30FC\u30AF\u3055\u308C\u305F\u53D6\u5F15\u3084\u3001\u30E1\u30E2\u306E\u5185\u5BB9\u3092\u6700\u512A\u5148\u3067\u5831\u544A

\u25C6 \u30DE\u30FC\u30AF\u30FB\u30E1\u30E2\u304C\u306A\u3044\u5834\u5408:
\u2192 \u5168\u4F53\u3092\u3056\u3063\u3068\u898B\u3066\u3001\u4EE5\u4E0B\u306B\u8A72\u5F53\u3059\u308B\u3082\u306E\u304C\u3042\u308C\u3070\u5831\u544A\uFF1A
  - \u7570\u5E38\u306B\u5927\u304D\u306A\u91D1\u984D\u306E\u53D6\u5F15
  - \u660E\u3089\u304B\u306B\u901A\u5E38\u3068\u7570\u306A\u308B\u30D1\u30BF\u30FC\u30F3
  - \u30EA\u30B9\u30AF\u3092\u793A\u5506\u3059\u308B\u53D6\u5F15\uFF08\u30AE\u30E3\u30F3\u30D6\u30EB\u3001\u9AD8\u984D\u73FE\u91D1\u5F15\u51FA\u7B49\uFF09

\u{1F4DD} \u5831\u544A\u5F62\u5F0F:
- \u53E3\u5EA7\u540D\u7FA9\u30FB\u9280\u884C\u540D
- \u30DE\u30FC\u30AF/\u30E1\u30E2\u306E\u5185\u5BB9\uFF08\u3042\u308C\u3070\uFF09
- \u7279\u8A18\u4E8B\u9805\uFF08\u672C\u5F53\u306B\u76EE\u7ACB\u3064\u3082\u306E\u304C\u3042\u308C\u3070\u5168\u3066\u5831\u544A\uFF09
- \u306A\u3051\u308C\u3070\u300C\u7279\u8A18\u4E8B\u9805\u306A\u3057\u300D

\u26A0\uFE0F \u91CD\u8981: \u65E5\u5E38\u7684\u306A\u53D6\u5F15\u306E\u8A73\u7D30\u306F\u4E0D\u8981\u3002\u672C\u5F53\u306B\u5BE9\u67FB\u4E0A\u91CD\u8981\u3068\u601D\u308F\u308C\u308B\u3082\u306E\u306E\u307F\u3002`;
      console.log(`\u{1F916} [\u500B\u4EBA\u53E3\u5EA7OCR] Claude 3.7 Sonnet \u5B9F\u884C\u4E2D...`);
      const result = await generateObject({
        model: anthropic("claude-3-7-sonnet-20250219"),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              ...base64Images
            ]
          }
        ],
        schema: z.object({
          accountHolder: z.string().optional().describe("\u53E3\u5EA7\u540D\u7FA9\u4EBA"),
          bankName: z.string().optional().describe("\u91D1\u878D\u6A5F\u95A2\u540D"),
          markedTransactions: z.array(z.string()).optional().describe("\u30DE\u30FC\u30AF/\u30E1\u30E2\u304C\u3042\u308B\u53D6\u5F15"),
          notablePoints: z.array(z.string()).optional().describe("\u7279\u306B\u76EE\u7ACB\u3064\u70B9\uFF08\u3042\u308C\u3070\uFF09"),
          summary: z.string().describe("\u7C21\u6F54\u306A\u8981\u7D04\uFF08\u7279\u8A18\u4E8B\u9805\u306A\u3057\u3082\u53EF\uFF09")
        })
      });
      console.log(`\u2705 [\u500B\u4EBA\u53E3\u5EA7OCR] \u5B8C\u4E86`);
      return {
        success: true,
        processingDetails: {
          recordId,
          filesFound: personalBankFiles.length,
          accountHolder: result.object.accountHolder,
          bankName: result.object.bankName
        },
        markedTransactions: result.object.markedTransactions || [],
        notablePoints: result.object.notablePoints || [],
        summary: result.object.summary,
        fileProcessed: filesToProcess.map((f) => f.name).join(", ")
      };
    } catch (error) {
      console.error("\u274C [\u500B\u4EBA\u53E3\u5EA7OCR] \u30A8\u30E9\u30FC:", error);
      return {
        success: false,
        processingDetails: {
          recordId: context.recordId,
          filesFound: 0
        },
        markedTransactions: [],
        notablePoints: [],
        summary: "\u500B\u4EBA\u53E3\u5EA7OCR\u51E6\u7406\u4E2D\u306B\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F",
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
});

export { ocrPersonalBankTool };
