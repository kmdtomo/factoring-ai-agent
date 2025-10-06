import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

const collateralVerificationTool = createTool({
  id: "collateral-verification",
  description: "\u62C5\u4FDD\u8B04\u672C\u304B\u3089\u62C5\u4FDD\u4F01\u696D\u60C5\u5831\u3092\u62BD\u51FA\uFF08\u4E8B\u5B9F\u306E\u307F\u3001\u7167\u5408\u306FPhase 4\u3067\u5B9F\u65BD\uFF09",
  inputSchema: z.object({
    recordId: z.string().describe("Kintone\u30EC\u30B3\u30FC\u30C9ID"),
    collateralDocuments: z.array(z.object({
      fileName: z.string(),
      text: z.string(),
      pageCount: z.number(),
      confidence: z.number(),
      documentType: z.string().optional(),
      extractedFacts: z.record(z.any()).optional()
    })).describe("Google Vision OCR\u3067\u62BD\u51FA\u3057\u305F\u62C5\u4FDD\u66F8\u985E\u30C7\u30FC\u30BF"),
    model: z.enum(["gpt-4o", "gpt-4o-mini", "gpt-4-turbo-preview", "gpt-4"]).optional().default("gpt-4o")
  }),
  outputSchema: z.object({
    success: z.boolean(),
    keyFindings: z.array(z.string()).describe("\u62C5\u4FDD\u66F8\u985E\u304B\u3089\u62BD\u51FA\u3055\u308C\u305F\u91CD\u8981\u306A\u767A\u898B\u4E8B\u9805")
  }),
  execute: async ({ context }) => {
    const { recordId, collateralDocuments, model } = context;
    try {
      if (!collateralDocuments || collateralDocuments.length === 0) {
        console.log(`[\u62C5\u4FDD\u691C\u8A3C] \u62C5\u4FDD\u30D5\u30A1\u30A4\u30EB\u306A\u3057 - recordId: ${recordId}`);
        return {
          success: true,
          keyFindings: []
        };
      }
      const combinedText = collateralDocuments.map((doc) => {
        let info = `\u3010${doc.fileName}\u3011
`;
        if (doc.documentType) {
          info += `\u6587\u66F8\u7A2E\u5225: ${doc.documentType}
`;
        }
        if (doc.extractedFacts && Object.keys(doc.extractedFacts).length > 0) {
          info += `\u62BD\u51FA\u6E08\u307F\u60C5\u5831: ${JSON.stringify(doc.extractedFacts, null, 2)}
`;
        }
        info += `OCR\u30C6\u30AD\u30B9\u30C8:
${doc.text}`;
        return info;
      }).join("\n\n---\n\n");
      const analysisPrompt = `\u62C5\u4FDD\u60C5\u5831\u30D5\u30A3\u30FC\u30EB\u30C9\u304B\u3089\u6DFB\u4ED8\u3055\u308C\u305F\u8CC7\u6599\u3092\u5206\u6790\u3057\u3001\u62C5\u4FDD\u306B\u95A2\u3059\u308B\u60C5\u5831\u3092\u62BD\u51FA\u3057\u3066\u304F\u3060\u3055\u3044\u3002

\u3010\u62C5\u4FDD\u30D5\u30A3\u30FC\u30EB\u30C9\u306E\u8CC7\u6599\u3011
${combinedText}

\u4EE5\u4E0B\u306EJSON\u5F62\u5F0F\u3067\u51FA\u529B\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A
{
  "documents": [
    {
      "fileName": "\u30D5\u30A1\u30A4\u30EB\u540D",
      "documentType": "\u8CC7\u6599\u306E\u7A2E\u985E\uFF08\u767B\u8A18\u7C3F\u8B04\u672C\u3001\u8ACB\u6C42\u66F8\u3001\u5951\u7D04\u66F8\u306A\u3069\uFF09",
      "extractedInfo": {
        "\u4F1A\u793E\u540D": "\u3007\u3007",
        "\u305D\u306E\u4ED6\u306E\u60C5\u5831": "..."
      }
    }
  ],
  "companies": [
    {
      "name": "\u4F1A\u793E\u540D",
      "registrationNumber": "\u6CD5\u4EBA\u756A\u53F7",
      "capital": \u8CC7\u672C\u91D1\uFF08\u6570\u5024\uFF09,
      "establishedDate": "\u8A2D\u7ACB\u5E74\u6708\u65E5",
      "representatives": ["\u4EE3\u8868\u80051", "\u4EE3\u8868\u80052"],
      "address": "\u672C\u5E97\u6240\u5728\u5730",
      "businessType": "\u4E8B\u696D\u5185\u5BB9"
    }
  ],
  "totalCompanies": \u62C5\u4FDD\u3068\u3057\u3066\u8B58\u5225\u3055\u308C\u305F\u4F01\u696D\u6570,
  "keyFindings": ["\u30D5\u30A1\u30A4\u30EB\u540D: \u8CC7\u6599\u306E\u7A2E\u985E - \u4F55\u304C\u66F8\u3044\u3066\u3042\u3063\u305F\u304B"]
}

\u3010\u91CD\u8981\u3011
- \u62C5\u4FDD\u30D5\u30A3\u30FC\u30EB\u30C9\u306E\u30D5\u30A1\u30A4\u30EB\u306F\u5168\u3066\u62C5\u4FDD\u60C5\u5831\u3068\u3057\u3066\u6271\u3046
- \u5404\u30D5\u30A1\u30A4\u30EB\u304C\u4F55\u306E\u8CC7\u6599\u3067\u3001\u4F55\u304C\u66F8\u3044\u3066\u3042\u3063\u305F\u304B\u3092\u660E\u8A18
- \u767B\u8A18\u7C3F\u8B04\u672C\u4EE5\u5916\uFF08\u8ACB\u6C42\u66F8\u3001\u5951\u7D04\u66F8\u306A\u3069\uFF09\u3082\u62C5\u4FDD\u60C5\u5831\u3068\u3057\u3066\u8A18\u9332
- \u4E8B\u5B9F\u306E\u307F\u3092\u62BD\u51FA\uFF08\u7167\u5408\u3084\u5224\u5B9A\u306F\u4E0D\u8981\uFF09`;
      const result = await generateText({
        model: openai(model),
        prompt: analysisPrompt,
        temperature: 0
      });
      console.log(`[\u62C5\u4FDD\u60C5\u5831\u62BD\u51FA] AI\u5FDC\u7B54:`, result.text?.substring(0, 500));
      let structuredData = {
        keyFindings: []
      };
      try {
        const jsonMatch = result.text?.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          structuredData = {
            documents: parsed.documents || [],
            companies: parsed.companies || [],
            totalCompanies: parsed.totalCompanies || (parsed.companies || []).length,
            keyFindings: parsed.keyFindings || []
          };
        } else {
          console.error("JSON\u89E3\u6790\u30A8\u30E9\u30FC: JSON\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F");
          structuredData.keyFindings = ["JSON\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F"];
        }
      } catch (e) {
        console.error("JSON\u89E3\u6790\u30A8\u30E9\u30FC:", e);
        structuredData.keyFindings = ["\u30C7\u30FC\u30BF\u62BD\u51FA\u306B\u5931\u6557\u3057\u307E\u3057\u305F"];
      }
      console.log(`[\u62C5\u4FDD\u691C\u8A3C] \u5B8C\u4E86 - \u767A\u898B\u4E8B\u9805: ${structuredData.keyFindings?.length || 0}\u4EF6`);
      return {
        success: true,
        keyFindings: structuredData.keyFindings || []
      };
    } catch (error) {
      console.error("[\u62C5\u4FDD\u60C5\u5831\u62BD\u51FA] \u30A8\u30E9\u30FC:", error);
      return {
        success: false,
        keyFindings: [`\u30A8\u30E9\u30FC: ${error.message}`]
      };
    }
  }
});

export { collateralVerificationTool };
