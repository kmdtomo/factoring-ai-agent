import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import axios from 'axios';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';

const getEnvConfig = () => ({
  KINTONE_DOMAIN: process.env.KINTONE_DOMAIN || "",
  KINTONE_API_TOKEN: process.env.KINTONE_API_TOKEN || "",
  APP_ID: process.env.KINTONE_APP_ID || "37"
});
const purchaseVerificationTool = createTool({
  id: "purchase-verification",
  description: "\u8CB7\u53D6\u8ACB\u6C42\u66F8\u306EOCR\u7D50\u679C\u3068Kintone\u8CB7\u53D6\u30C7\u30FC\u30BF\u3092\u7167\u5408\u3057\u3001\u65E2\u5B58OCR\u30C4\u30FC\u30EB\u3068\u540C\u3058\u5F62\u5F0F\u3067\u51FA\u529B",
  inputSchema: z.object({
    recordId: z.string().describe("Kintone\u30EC\u30B3\u30FC\u30C9ID"),
    purchaseDocuments: z.array(z.object({
      fileName: z.string(),
      text: z.string(),
      pageCount: z.number(),
      confidence: z.number()
    })).describe("Google Vision OCR\u3067\u62BD\u51FA\u3057\u305F\u8CB7\u53D6\u66F8\u985E\u30C7\u30FC\u30BF"),
    model: z.enum(["gpt-4.1-2025-04-14", "gpt-4.1-mini-2025-04-14", "gpt-4", "gpt-4-turbo-preview", "gpt-4o", "gpt-4o-mini", "claude-3-5-sonnet-20241022"]).optional().default("gpt-4.1-2025-04-14")
  }),
  outputSchema: z.object({
    success: z.boolean(),
    summary: z.string(),
    metadata: z.object({
      recordId: z.string(),
      documentCount: z.number(),
      verificationResults: z.object({
        \u7DCF\u5408\u8A55\u4FA1: z.enum(["\u4E00\u81F4", "\u90E8\u5206\u4E00\u81F4", "\u4E0D\u4E00\u81F4"]),
        \u8A73\u7D30: z.array(z.object({
          \u9805\u76EE: z.string(),
          OCR\u5024: z.string(),
          Kintone\u5024: z.string(),
          \u5224\u5B9A: z.enum(["\u4E00\u81F4", "\u4E0D\u4E00\u81F4"])
        }))
      })
    }),
    purchaseInfo: z.object({
      totalAmount: z.number().describe("\u7DCF\u50B5\u6A29\u984D"),
      debtorCompanies: z.array(z.object({
        name: z.string().describe("\u7B2C\u4E09\u50B5\u52D9\u8005\u540D"),
        amount: z.number().describe("\u8ACB\u6C42\u984D"),
        dueDate: z.string().optional().describe("\u652F\u6255\u671F\u65E5"),
        invoiceNumber: z.string().optional().describe("\u8ACB\u6C42\u66F8\u756A\u53F7")
      })),
      paymentTerms: z.string().optional().describe("\u652F\u6255\u6761\u4EF6"),
      applicantCompany: z.string().describe("\u7533\u8FBC\u8005\u4F01\u696D\u540D")
    }),
    analysisDetails: z.object({
      extractedText: z.string().describe("\u62BD\u51FA\u3055\u308C\u305F\u30C6\u30AD\u30B9\u30C8\uFF08\u8981\u7D04\uFF09"),
      keyFindings: z.array(z.string()).describe("\u91CD\u8981\u306A\u767A\u898B\u4E8B\u9805"),
      confidence: z.number().describe("\u5206\u6790\u306E\u4FE1\u983C\u5EA6")
    }),
    costInfo: z.object({
      ocrCost: z.number(),
      analysisCost: z.number(),
      totalCost: z.number()
    })
  }),
  execute: async ({ context }) => {
    const { recordId, purchaseDocuments, model } = context;
    try {
      const config = getEnvConfig();
      const recordUrl = `https://${config.KINTONE_DOMAIN}/k/v1/records.json?app=${config.APP_ID}&query=$id="${recordId}"`;
      const recordResponse = await axios.get(recordUrl, {
        headers: {
          "X-Cybozu-API-Token": config.KINTONE_API_TOKEN
        }
      });
      if (recordResponse.data.records.length === 0) {
        throw new Error(`\u30EC\u30B3\u30FC\u30C9ID: ${recordId} \u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093`);
      }
      const record = recordResponse.data.records[0];
      const buyInfo = record.\u8CB7\u53D6\u60C5\u5831?.value || [];
      const kintoneData = {
        purchases: buyInfo.map((item) => ({
          company: item.value?.\u4F1A\u793E\u540D_\u7B2C\u4E09\u50B5\u52D9\u8005_\u8CB7\u53D6?.value || "",
          amount: parseInt(item.value?.\u7DCF\u50B5\u6A29\u984D?.value || "0"),
          purchaseAmount: parseInt(item.value?.\u8CB7\u53D6\u984D?.value || "0"),
          paymentDate: item.value?.\u8CB7\u53D6\u50B5\u6A29\u652F\u6255\u65E5?.value || ""
        })),
        applicant: record.\u5C4B\u53F7?.value || record.\u4F1A\u793E\u540D?.value || "",
        totalAmount: buyInfo.reduce((sum, item) => sum + parseInt(item.value?.\u7DCF\u50B5\u6A29\u984D?.value || "0"), 0)
      };
      const combinedText = purchaseDocuments.map((doc) => `\u3010${doc.fileName}\u3011
${doc.text}`).join("\n\n---\n\n");
      const aiModel = model === "claude-3-5-sonnet-20241022" ? anthropic("claude-3-5-sonnet-20241022") : openai(model);
      const analysisPrompt = `
\u3042\u306A\u305F\u306F\u8CB7\u53D6\u8ACB\u6C42\u66F8\u306E\u5206\u6790\u5C02\u9580\u5BB6\u3067\u3059\u3002\u4EE5\u4E0B\u306EOCR\u3067\u62BD\u51FA\u3057\u305F\u8ACB\u6C42\u66F8\u30C7\u30FC\u30BF\u3068Kintone\u306E\u767B\u9332\u30C7\u30FC\u30BF\u3092\u7167\u5408\u3057\u3001\u5206\u6790\u3057\u3066\u304F\u3060\u3055\u3044\u3002

\u3010OCR\u3067\u62BD\u51FA\u3057\u305F\u8ACB\u6C42\u66F8\u30C7\u30FC\u30BF\u3011
${combinedText}

\u3010Kintone\u306B\u767B\u9332\u3055\u308C\u3066\u3044\u308B\u8CB7\u53D6\u60C5\u5831\u3011
\u7533\u8FBC\u8005: ${kintoneData.applicant}
\u7DCF\u50B5\u6A29\u984D\uFF08\u5408\u8A08\uFF09: ${kintoneData.totalAmount.toLocaleString()}\u5186
\u8CB7\u53D6\u60C5\u5831:
${kintoneData.purchases.map(
        (p, i) => `${i + 1}. ${p.company} - \u50B5\u6A29\u984D: ${p.amount.toLocaleString()}\u5186, \u8CB7\u53D6\u984D: ${p.purchaseAmount.toLocaleString()}\u5186, \u652F\u6255\u65E5: ${p.paymentDate}`
      ).join("\n")}

\u3010\u5206\u6790\u30BF\u30B9\u30AF\u3011
1. OCR\u30C7\u30FC\u30BF\u304B\u3089\u8CB7\u53D6\u60C5\u5831\u3092\u62BD\u51FA
2. Kintone\u30C7\u30FC\u30BF\u3068\u306E\u7167\u5408
3. \u4E00\u81F4/\u4E0D\u4E00\u81F4\u306E\u5224\u5B9A

\u3010\u91CD\u8981\u3011
- \u91D1\u984D\u306F\u5B8C\u5168\u4E00\u81F4\u3092\u6C42\u3081\u305A\u3001\u8FD1\u4F3C\u5024\u3082\u8003\u616E
- \u4F1A\u793E\u540D\u306F\u8868\u8A18\u3086\u308C\u3092\u8003\u616E\uFF08\u682A\u5F0F\u4F1A\u793E/\uFF08\u682A\uFF09\u306A\u3069\uFF09
- \u65E5\u4ED8\u30D5\u30A9\u30FC\u30DE\u30C3\u30C8\u306E\u9055\u3044\u3082\u8003\u616E
`;
      const result = await generateText({
        model: aiModel,
        prompt: analysisPrompt,
        temperature: 0.1
      });
      const analysisText = result.text || "";
      const extractionPrompt = `
\u4EE5\u4E0B\u306E\u5206\u6790\u7D50\u679C\u304B\u3089\u3001JSON\u5F62\u5F0F\u3067\u69CB\u9020\u5316\u30C7\u30FC\u30BF\u3092\u62BD\u51FA\u3057\u3066\u304F\u3060\u3055\u3044\u3002

${analysisText}

\u4EE5\u4E0B\u306E\u5F62\u5F0F\u3067\u51FA\u529B\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A
{
  "debtorCompanies": [
    {
      "name": "\u4F1A\u793E\u540D",
      "amount": \u91D1\u984D\uFF08\u6570\u5024\uFF09,
      "dueDate": "\u652F\u6255\u671F\u65E5",
      "invoiceNumber": "\u8ACB\u6C42\u66F8\u756A\u53F7"
    }
  ],
  "verificationResults": {
    "\u7DCF\u5408\u8A55\u4FA1": "\u4E00\u81F4/\u90E8\u5206\u4E00\u81F4/\u4E0D\u4E00\u81F4",
    "\u8A73\u7D30": [
      {
        "\u9805\u76EE": "\u9805\u76EE\u540D",
        "OCR\u5024": "OCR\u3067\u62BD\u51FA\u3057\u305F\u5024",
        "Kintone\u5024": "Kintone\u306E\u5024",
        "\u5224\u5B9A": "\u4E00\u81F4/\u4E0D\u4E00\u81F4"
      }
    ]
  },
  "keyFindings": ["\u91CD\u8981\u306A\u767A\u898B\u4E8B\u98051", "\u91CD\u8981\u306A\u767A\u898B\u4E8B\u98052"]
}
`;
      const extractionResult = await generateText({
        model: aiModel,
        prompt: extractionPrompt,
        temperature: 0
      });
      let structuredData;
      try {
        const jsonMatch = extractionResult.text?.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          structuredData = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        console.error("JSON\u89E3\u6790\u30A8\u30E9\u30FC:", e);
        structuredData = {
          debtorCompanies: [],
          verificationResults: { \u7DCF\u5408\u8A55\u4FA1: "\u4E0D\u4E00\u81F4", \u8A73\u7D30: [] },
          keyFindings: ["\u30C7\u30FC\u30BF\u62BD\u51FA\u306B\u5931\u6557\u3057\u307E\u3057\u305F"]
        };
      }
      const ocrCost = purchaseDocuments.reduce((sum, doc) => sum + doc.pageCount * 15e-4, 0);
      const analysisCost = 0.01;
      return {
        success: true,
        summary: `\u8CB7\u53D6\u8ACB\u6C42\u66F8${purchaseDocuments.length}\u4EF6\u3092\u5206\u6790\u3057\u307E\u3057\u305F\u3002${structuredData.verificationResults?.\u7DCF\u5408\u8A55\u4FA1 || "\u7167\u5408\u5B8C\u4E86"}\u3002`,
        metadata: {
          recordId,
          documentCount: purchaseDocuments.length,
          verificationResults: structuredData.verificationResults || {
            \u7DCF\u5408\u8A55\u4FA1: "\u4E0D\u660E",
            \u8A73\u7D30: []
          }
        },
        purchaseInfo: {
          totalAmount: kintoneData.totalAmount,
          debtorCompanies: structuredData.debtorCompanies || [],
          paymentTerms: "\u8ACB\u6C42\u66F8\u8A18\u8F09\u306E\u6761\u4EF6\u306B\u3088\u308B",
          applicantCompany: kintoneData.applicant
        },
        analysisDetails: {
          extractedText: combinedText.substring(0, 500) + "...",
          keyFindings: structuredData.keyFindings || [],
          confidence: purchaseDocuments[0]?.confidence || 0.9
        },
        costInfo: {
          ocrCost,
          analysisCost,
          totalCost: ocrCost + analysisCost
        }
      };
    } catch (error) {
      console.error("[\u8CB7\u53D6\u60C5\u5831\u7167\u5408] \u30A8\u30E9\u30FC:", error);
      return {
        success: false,
        summary: `\u8CB7\u53D6\u60C5\u5831\u306E\u7167\u5408\u4E2D\u306B\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F: ${error.message}`,
        metadata: {
          recordId,
          documentCount: purchaseDocuments.length,
          verificationResults: {
            \u7DCF\u5408\u8A55\u4FA1: "\u4E0D\u4E00\u81F4",
            \u8A73\u7D30: []
          }
        },
        purchaseInfo: {
          totalAmount: 0,
          debtorCompanies: [],
          applicantCompany: ""
        },
        analysisDetails: {
          extractedText: "",
          keyFindings: [],
          confidence: 0
        },
        costInfo: {
          ocrCost: 0,
          analysisCost: 0,
          totalCost: 0
        }
      };
    }
  }
});

export { purchaseVerificationTool };
