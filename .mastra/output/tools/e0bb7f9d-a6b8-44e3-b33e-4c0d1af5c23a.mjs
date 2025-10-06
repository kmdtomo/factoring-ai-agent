import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import axios from 'axios';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

const getEnvConfig = () => ({
  KINTONE_DOMAIN: process.env.KINTONE_DOMAIN || "",
  KINTONE_API_TOKEN: process.env.KINTONE_API_TOKEN || "",
  APP_ID: process.env.KINTONE_APP_ID || "37"
});
const purchaseVerificationToolMinimal = createTool({
  id: "purchase-verification-minimal",
  description: "\u8CB7\u53D6\u8ACB\u6C42\u66F8\u306EOCR\u7D50\u679C\u3068Kintone\u8CB7\u53D6\u30C7\u30FC\u30BF\u3092\u7167\u5408\uFF08\u6700\u5C0F\u7248\uFF09",
  inputSchema: z.object({
    recordId: z.string().describe("Kintone\u30EC\u30B3\u30FC\u30C9ID"),
    purchaseDocuments: z.array(z.object({
      fileName: z.string(),
      text: z.string(),
      pageCount: z.number(),
      confidence: z.number()
    })).describe("Google Vision OCR\u3067\u62BD\u51FA\u3057\u305F\u8CB7\u53D6\u66F8\u985E\u30C7\u30FC\u30BF"),
    model: z.string().optional().default("gpt-4o")
  }),
  outputSchema: z.object({
    success: z.boolean(),
    verificationResult: z.enum(["\u4E00\u81F4", "\u90E8\u5206\u4E00\u81F4", "\u4E0D\u4E00\u81F4"]).describe("Kintone\u7167\u5408\u7D50\u679C")
  }),
  execute: async ({ context }) => {
    const { recordId, purchaseDocuments, model } = context;
    console.log(`[\u8CFC\u5165\u691C\u8A3C-\u6700\u5C0F] \u958B\u59CB - recordId: ${recordId}`);
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
          amount: parseInt(item.value?.\u7DCF\u50B5\u6A29\u984D?.value || "0")
        })),
        applicant: record.\u5C4B\u53F7?.value || record.\u4F1A\u793E\u540D?.value || "",
        totalAmount: buyInfo.reduce((sum, item) => sum + parseInt(item.value?.\u7DCF\u50B5\u6A29\u984D?.value || "0"), 0)
      };
      console.log(`[\u8CFC\u5165\u691C\u8A3C-\u6700\u5C0F] Kintone\u30C7\u30FC\u30BF\u53D6\u5F97\u5B8C\u4E86 - \u8CB7\u53D6\u60C5\u5831: ${kintoneData.purchases.length}\u4EF6`);
      const combinedText = purchaseDocuments.map((doc) => `\u3010${doc.fileName}\u3011
${doc.text}`).join("\n\n---\n\n");
      const analysisPrompt = `\u8ACB\u6C42\u66F8\u304B\u3089\u7B2C\u4E09\u50B5\u52D9\u8005\uFF08\u8ACB\u6C42\u5148\u4F01\u696D\uFF09\u306E\u4F01\u696D\u540D\u3068\u91D1\u984D\u3092\u62BD\u51FA\u3057\u3066\u304F\u3060\u3055\u3044\u3002

\u3010\u91CD\u8981\u3011\u7533\u8FBC\u8005\u4F01\u696D\uFF08${kintoneData.applicant}\uFF09\u306F\u7B2C\u4E09\u50B5\u52D9\u8005\u3068\u3057\u3066\u62BD\u51FA\u3057\u306A\u3044\u3067\u304F\u3060\u3055\u3044\u3002

OCR\u30C6\u30AD\u30B9\u30C8:
${combinedText.substring(0, 3e3)}

Kintone\u767B\u9332\u30C7\u30FC\u30BF\uFF08\u7B2C\u4E09\u50B5\u52D9\u8005\uFF09:
${kintoneData.purchases.map((p) => `${p.company}: \xA5${p.amount.toLocaleString()}`).join("\n")}

\u4EE5\u4E0B\u306EJSON\u5F62\u5F0F\u3067\u8FD4\u7B54\u3057\u3066\u304F\u3060\u3055\u3044:
{
  "match": "yes" \u307E\u305F\u306F "no" \u307E\u305F\u306F "partial",
  "companies": [
    {"name": "\u7B2C\u4E09\u50B5\u52D9\u8005\u306E\u4F01\u696D\u540D", "amount": \u91D1\u984D\uFF08\u6570\u5024\uFF09}
  ]
}

\u6CE8\u610F: \u7533\u8FBC\u8005\u4F01\u696D\uFF08${kintoneData.applicant}\uFF09\u306F\u9664\u5916\u3057\u3066\u304F\u3060\u3055\u3044\u3002`;
      console.log(`[\u8CFC\u5165\u691C\u8A3C-\u6700\u5C0F] AI\u5206\u6790\u958B\u59CB`);
      const startTime = Date.now();
      const result = await generateText({
        model: openai(model),
        prompt: analysisPrompt,
        temperature: 0
      });
      const analysisTime = Date.now() - startTime;
      console.log(`[\u8CFC\u5165\u691C\u8A3C-\u6700\u5C0F] AI\u5206\u6790\u5B8C\u4E86 - \u51E6\u7406\u6642\u9593: ${analysisTime}ms`);
      let match = "no";
      try {
        const jsonMatch = result.text?.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const matchValue = parsed.match || "no";
          match = matchValue === "yes" || matchValue === "partial" ? matchValue : "no";
        }
      } catch (e) {
      }
      purchaseDocuments.reduce((sum, doc) => sum + doc.pageCount * 15e-4, 0);
      const verificationResult = match === "yes" ? "\u4E00\u81F4" : match === "partial" ? "\u90E8\u5206\u4E00\u81F4" : "\u4E0D\u4E00\u81F4";
      console.log(`[\u8CFC\u5165\u691C\u8A3C-\u6700\u5C0F] \u5B8C\u4E86 - \u7167\u5408\u7D50\u679C: ${verificationResult}`);
      return {
        success: true,
        verificationResult
      };
    } catch (error) {
      console.error("[\u8CFC\u5165\u691C\u8A3C-\u6700\u5C0F] \u30A8\u30E9\u30FC:", error.message);
      return {
        success: false,
        verificationResult: "\u4E0D\u4E00\u81F4"
      };
    }
  }
});

export { purchaseVerificationToolMinimal };
