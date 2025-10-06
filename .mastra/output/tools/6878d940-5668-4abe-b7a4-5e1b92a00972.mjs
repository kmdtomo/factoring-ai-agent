import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

const documentOcrVerificationTool = createTool({
  id: "document-ocr-verification",
  description: "\u65E2\u77E5\u306E\u30C7\u30FC\u30BF\u3068\u66F8\u985E\u5185\u5BB9\u3092\u7167\u5408\u3059\u308B\u7167\u5408\u578BOCR\u30C4\u30FC\u30EB",
  inputSchema: z.object({
    fileContent: z.object({
      name: z.string().describe("\u30D5\u30A1\u30A4\u30EB\u540D"),
      content: z.string().describe("Base64\u30A8\u30F3\u30B3\u30FC\u30C9\u3055\u308C\u305F\u30D5\u30A1\u30A4\u30EB\u30B3\u30F3\u30C6\u30F3\u30C4"),
      contentType: z.string().describe("\u30D5\u30A1\u30A4\u30EB\u30BF\u30A4\u30D7")
    }).describe("\u7167\u5408\u5BFE\u8C61\u30D5\u30A1\u30A4\u30EB"),
    expectedData: z.object({
      companyName: z.string().optional().describe("\u671F\u5F85\u3055\u308C\u308B\u4F01\u696D\u540D"),
      amount: z.number().optional().describe("\u671F\u5F85\u3055\u308C\u308B\u91D1\u984D"),
      date: z.string().optional().describe("\u671F\u5F85\u3055\u308C\u308B\u65E5\u4ED8"),
      personName: z.string().optional().describe("\u671F\u5F85\u3055\u308C\u308B\u4EBA\u540D"),
      address: z.string().optional().describe("\u671F\u5F85\u3055\u308C\u308B\u4F4F\u6240"),
      customQuestions: z.array(z.string()).optional().describe("\u30AB\u30B9\u30BF\u30E0\u8CEA\u554F")
    }).describe("\u7167\u5408\u3059\u3079\u304D\u30C7\u30FC\u30BF"),
    documentType: z.enum([
      "invoice",
      // 請求書
      "bank_statement",
      // 通帳
      "identity",
      // 本人確認書類
      "registry",
      // 登記簿
      "other"
      // その他
    ]).describe("\u66F8\u985E\u306E\u7A2E\u985E")
  }),
  outputSchema: z.object({
    fileName: z.string(),
    documentType: z.string(),
    verificationResults: z.object({
      companyName: z.object({
        expected: z.string().optional(),
        found: z.string().optional(),
        status: z.enum(["match", "mismatch", "not_found"])
      }).optional(),
      amount: z.object({
        expected: z.number().optional(),
        found: z.number().optional(),
        status: z.enum(["match", "mismatch", "not_found"])
      }).optional(),
      date: z.object({
        expected: z.string().optional(),
        found: z.string().optional(),
        status: z.enum(["match", "mismatch", "not_found"])
      }).optional(),
      personName: z.object({
        expected: z.string().optional(),
        found: z.string().optional(),
        status: z.enum(["match", "mismatch", "not_found"])
      }).optional(),
      address: z.object({
        expected: z.string().optional(),
        found: z.string().optional(),
        status: z.enum(["match", "mismatch", "not_found"])
      }).optional()
    }),
    additionalFindings: z.object({
      markedSections: z.array(z.string()).describe("\u30DE\u30FC\u30AB\u30FC\u3084\u8D64\u4E38\u3067\u30DE\u30FC\u30AF\u3055\u308C\u305F\u90E8\u5206"),
      licenseColor: z.enum(["gold", "blue", "green", "unknown"]).optional(),
      violations: z.number().optional(),
      registrationInfo: z.boolean().optional().describe("\u50B5\u6A29\u8B72\u6E21\u767B\u8A18\u306E\u6709\u7121")
    }),
    customAnswers: z.array(z.object({
      question: z.string(),
      answer: z.string()
    })).optional(),
    summary: z.string().describe("\u7167\u5408\u7D50\u679C\u306E\u30B5\u30DE\u30EA\u30FC"),
    confidence: z.number().min(0).max(100)
  }),
  execute: async ({ context }) => {
    const { fileContent, expectedData, documentType } = context;
    try {
      console.log(`[OCR Verification] Processing ${documentType}: ${fileContent.name}`);
      const verificationQuestions = buildVerificationQuestions(expectedData);
      const prompt = buildVerificationPrompt(documentType, verificationQuestions, expectedData.customQuestions);
      const response = await generateText({
        model: openai("gpt-4o"),
        prompt,
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
                image: fileContent.content
              }
            ]
          }
        ]
      });
      const result = parseVerificationResponse(response.text, expectedData);
      return {
        fileName: fileContent.name,
        documentType,
        verificationResults: result.verificationResults,
        additionalFindings: result.additionalFindings,
        customAnswers: result.customAnswers,
        summary: result.summary,
        confidence: result.confidence
      };
    } catch (error) {
      console.error(`[OCR Verification] Error processing ${fileContent.name}:`, error);
      return {
        fileName: fileContent.name,
        documentType,
        verificationResults: {},
        additionalFindings: {
          markedSections: []
        },
        summary: `\u30A8\u30E9\u30FC: ${error instanceof Error ? error.message : "OCR\u51E6\u7406\u306B\u5931\u6557\u3057\u307E\u3057\u305F"}`,
        confidence: 0
      };
    }
  }
});
function buildVerificationQuestions(expectedData, documentType) {
  const questions = [];
  if (expectedData.companyName) {
    questions.push(`\u3053\u306E\u66F8\u985E\u306B\u300C${expectedData.companyName}\u300D\u3068\u3044\u3046\u4F01\u696D\u540D\u304C\u8A18\u8F09\u3055\u308C\u3066\u3044\u307E\u3059\u304B\uFF1F\u8A18\u8F09\u3055\u308C\u3066\u3044\u308B\u5834\u5408\u306F\u5B9F\u969B\u306E\u8868\u8A18\u3092\u6559\u3048\u3066\u304F\u3060\u3055\u3044\u3002`);
  }
  if (expectedData.amount) {
    questions.push(`\u3053\u306E\u66F8\u985E\u306B\u300C${expectedData.amount.toLocaleString()}\u5186\u300D\u3068\u3044\u3046\u91D1\u984D\u304C\u8A18\u8F09\u3055\u308C\u3066\u3044\u307E\u3059\u304B\uFF1F\u8A18\u8F09\u3055\u308C\u3066\u3044\u308B\u5834\u5408\u306F\u5B9F\u969B\u306E\u91D1\u984D\u3092\u6559\u3048\u3066\u304F\u3060\u3055\u3044\u3002`);
  }
  if (expectedData.date) {
    questions.push(`\u3053\u306E\u66F8\u985E\u306B\u300C${expectedData.date}\u300D\u3068\u3044\u3046\u65E5\u4ED8\u304C\u8A18\u8F09\u3055\u308C\u3066\u3044\u307E\u3059\u304B\uFF1F\u8A18\u8F09\u3055\u308C\u3066\u3044\u308B\u5834\u5408\u306F\u5B9F\u969B\u306E\u65E5\u4ED8\u3092\u6559\u3048\u3066\u304F\u3060\u3055\u3044\u3002`);
  }
  if (expectedData.personName) {
    questions.push(`\u3053\u306E\u66F8\u985E\u306B\u300C${expectedData.personName}\u300D\u3068\u3044\u3046\u4EBA\u540D\u304C\u8A18\u8F09\u3055\u308C\u3066\u3044\u307E\u3059\u304B\uFF1F\u8A18\u8F09\u3055\u308C\u3066\u3044\u308B\u5834\u5408\u306F\u5B9F\u969B\u306E\u8868\u8A18\u3092\u6559\u3048\u3066\u304F\u3060\u3055\u3044\u3002`);
  }
  if (expectedData.address) {
    questions.push(`\u3053\u306E\u66F8\u985E\u306B\u300C${expectedData.address}\u300D\u3068\u3044\u3046\u4F4F\u6240\u304C\u8A18\u8F09\u3055\u308C\u3066\u3044\u307E\u3059\u304B\uFF1F\u8A18\u8F09\u3055\u308C\u3066\u3044\u308B\u5834\u5408\u306F\u5B9F\u969B\u306E\u4F4F\u6240\u3092\u6559\u3048\u3066\u304F\u3060\u3055\u3044\u3002`);
  }
  return questions;
}
function buildVerificationPrompt(documentType, verificationQuestions, customQuestions) {
  let basePrompt = `\u3042\u306A\u305F\u306F\u66F8\u985E\u306E\u5185\u5BB9\u3092\u6B63\u78BA\u306B\u8AAD\u307F\u53D6\u308A\u3001\u7167\u5408\u3059\u308B\u5C02\u9580\u5BB6\u3067\u3059\u3002
\u4EE5\u4E0B\u306E\u8CEA\u554F\u306B\u5BFE\u3057\u3066\u3001\u66F8\u985E\u306E\u5185\u5BB9\u3092\u78BA\u8A8D\u3057\u3066\u56DE\u7B54\u3057\u3066\u304F\u3060\u3055\u3044\u3002

\u91CD\u8981\u306A\u6307\u793A\uFF1A
- \u8CEA\u554F\u3055\u308C\u305F\u5185\u5BB9\u304C\u898B\u3064\u304B\u3089\u306A\u3044\u5834\u5408\u306F\u300C\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093\u300D\u3068\u7B54\u3048\u3066\u304F\u3060\u3055\u3044
- \u66D6\u6627\u306A\u5834\u5408\u306F\u7121\u7406\u306B\u5224\u65AD\u305B\u305A\u300C\u4E0D\u660E\u78BA\u300D\u3068\u7B54\u3048\u3066\u304F\u3060\u3055\u3044
- \u6570\u5024\u306F\u6B63\u78BA\u306B\u8AAD\u307F\u53D6\u3063\u3066\u304F\u3060\u3055\u3044\uFF08\u30AB\u30F3\u30DE\u533A\u5207\u308A\u3067\uFF09

`;
  if (verificationQuestions.length > 0) {
    basePrompt += "\u3010\u7167\u5408\u78BA\u8A8D\u3011\n";
    verificationQuestions.forEach((q, i) => {
      basePrompt += `${i + 1}. ${q}
`;
    });
    basePrompt += "\n";
  }
  switch (documentType) {
    case "bank_statement":
      basePrompt += `\u3010\u8FFD\u52A0\u78BA\u8A8D\u3011
- \u30DE\u30FC\u30AB\u30FC\u3084\u8D64\u4E38\u3067\u30DE\u30FC\u30AF\u3055\u308C\u3066\u3044\u308B\u90E8\u5206\u304C\u3042\u308C\u3070\u3001\u305D\u306E\u5185\u5BB9\u3092\u5831\u544A\u3057\u3066\u304F\u3060\u3055\u3044
- \u7279\u306B\u5927\u304D\u306A\u91D1\u984D\u306E\u5165\u51FA\u91D1\u306B\u6CE8\u76EE\u3057\u3066\u304F\u3060\u3055\u3044

`;
      break;
    case "identity":
      basePrompt += `\u3010\u8FFD\u52A0\u78BA\u8A8D\u3011
- \u514D\u8A31\u8A3C\u306E\u5834\u5408\u3001\u5E2F\u306E\u8272\uFF08\u30B4\u30FC\u30EB\u30C9/\u30D6\u30EB\u30FC/\u30B0\u30EA\u30FC\u30F3\uFF09\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044
- \u88CF\u9762\u306B\u9055\u53CD\u5C65\u6B74\u304C\u8A18\u8F09\u3055\u308C\u3066\u3044\u308C\u3070\u56DE\u6570\u3092\u5831\u544A\u3057\u3066\u304F\u3060\u3055\u3044
- \u6709\u52B9\u671F\u9650\u3082\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044

`;
      break;
    case "invoice":
      basePrompt += `\u3010\u8FFD\u52A0\u78BA\u8A8D\u3011
- \u8ACB\u6C42\u66F8\u756A\u53F7\u304C\u3042\u308C\u3070\u5831\u544A\u3057\u3066\u304F\u3060\u3055\u3044
- \u652F\u6255\u671F\u65E5\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044

`;
      break;
    case "registry":
      basePrompt += `\u3010\u8FFD\u52A0\u78BA\u8A8D\u3011
- \u50B5\u6A29\u8B72\u6E21\u767B\u8A18\u306E\u8A18\u8F09\u304C\u3042\u308B\u304B\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044
- \u4F1A\u793E\u306E\u8A2D\u7ACB\u5E74\u3068\u8CC7\u672C\u91D1\u3092\u5831\u544A\u3057\u3066\u304F\u3060\u3055\u3044

`;
      break;
  }
  if (customQuestions && customQuestions.length > 0) {
    basePrompt += "\u3010\u305D\u306E\u4ED6\u306E\u78BA\u8A8D\u4E8B\u9805\u3011\n";
    customQuestions.forEach((q, i) => {
      basePrompt += `${i + 1}. ${q}
`;
    });
  }
  basePrompt += "\n\u56DE\u7B54\u306F\u7C21\u6F54\u306B\u3001\u4E8B\u5B9F\u306E\u307F\u3092\u5831\u544A\u3057\u3066\u304F\u3060\u3055\u3044\u3002";
  return basePrompt;
}
function parseVerificationResponse(responseText, expectedData, documentType) {
  const result = {
    verificationResults: {},
    additionalFindings: {
      markedSections: [],
      licenseColor: void 0,
      violations: void 0,
      registrationInfo: void 0
    },
    customAnswers: [],
    summary: "",
    confidence: 90
  };
  const lines = responseText.split("\n");
  if (expectedData.companyName) {
    result.verificationResults.companyName = {
      expected: expectedData.companyName,
      found: extractValue(lines, "\u4F01\u696D\u540D"),
      status: determineMatchStatus(expectedData.companyName, extractValue(lines, "\u4F01\u696D\u540D"))
    };
  }
  if (expectedData.amount) {
    const foundAmount = extractAmount(lines);
    result.verificationResults.amount = {
      expected: expectedData.amount,
      found: foundAmount,
      status: foundAmount === expectedData.amount ? "match" : foundAmount ? "mismatch" : "not_found"
    };
  }
  const matchCount = Object.values(result.verificationResults).filter((v) => v.status === "match").length;
  const totalCount = Object.keys(result.verificationResults).length;
  result.summary = `\u7167\u5408\u9805\u76EE${totalCount}\u4EF6\u4E2D${matchCount}\u4EF6\u304C\u4E00\u81F4\u3057\u307E\u3057\u305F\u3002`;
  return result;
}
function extractValue(lines, keyword) {
  const line = lines.find((l) => l.includes(keyword));
  return line ? line.split("\uFF1A")[1]?.trim() : void 0;
}
function extractAmount(lines) {
  const amountLine = lines.find((l) => l.match(/[\d,]+円/));
  if (amountLine) {
    const match = amountLine.match(/([\d,]+)円/);
    if (match) {
      return parseInt(match[1].replace(/,/g, ""));
    }
  }
  return void 0;
}
function determineMatchStatus(expected, found) {
  if (!found) return "not_found";
  if (found.includes(expected) || expected.includes(found)) return "match";
  return "mismatch";
}

export { documentOcrVerificationTool };
