import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import axios from 'axios';

const ocrCollateralTool = createTool({
  id: "ocr-collateral",
  description: "\u62C5\u4FDD\u60C5\u5831\u95A2\u9023\u66F8\u985E\u3092OCR\u51E6\u7406\u3057\u3001\u62C5\u4FDD\u4FA1\u5024\u3092\u8A55\u4FA1\uFF08\u66F8\u985E\u7A2E\u985E\u3092\u554F\u308F\u305A\u67D4\u8EDF\u306B\u5BFE\u5FDC\uFF09",
  inputSchema: z.object({
    recordId: z.string().describe("Kintone\u30EC\u30B3\u30FC\u30C9ID"),
    collateralCompanies: z.array(z.object({
      name: z.string(),
      expectedAmount: z.number().optional()
    })).describe("\u62C5\u4FDD\u4F01\u696D\u30EA\u30B9\u30C8")
  }),
  outputSchema: z.object({
    success: z.boolean(),
    findings: z.array(z.object({
      fileName: z.string(),
      documentType: z.string().describe("\u63A8\u5B9A\u3055\u308C\u308B\u66F8\u985E\u7A2E\u985E"),
      relatedCompany: z.string().optional(),
      keyInformation: z.array(z.string()).describe("\u91CD\u8981\u306A\u767A\u898B\u4E8B\u9805"),
      amounts: z.array(z.object({
        description: z.string(),
        amount: z.number()
      })).optional(),
      dates: z.array(z.string()).optional(),
      reliability: z.enum(["high", "medium", "low"])
    })),
    collateralAssessment: z.object({
      totalValue: z.number().optional().describe("\u62C5\u4FDD\u4FA1\u5024\u306E\u5408\u8A08\uFF08\u63A8\u5B9A\uFF09"),
      keyRisks: z.array(z.string()),
      recommendations: z.array(z.string())
    }),
    summary: z.string()
  }),
  execute: async ({ context }) => {
    const { recordId, collateralCompanies } = context;
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
      const collateralFiles = record.\u62C5\u4FDD\u60C5\u5831\uFF3F\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB?.value || [];
      const otherFiles = record.\u305D\u306E\u4ED6\uFF3F\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB?.value || [];
      const additionalFiles = otherFiles.filter(
        (f) => f.name.includes("\u5951\u7D04") || f.name.includes("\u4FDD\u8A3C") || f.name.includes("\u62C5\u4FDD")
      );
      const allFiles = [...collateralFiles, ...additionalFiles];
      if (allFiles.length === 0) {
        return {
          success: false,
          findings: [],
          collateralAssessment: {
            keyRisks: ["\u62C5\u4FDD\u95A2\u9023\u66F8\u985E\u304C\u6DFB\u4ED8\u3055\u308C\u3066\u3044\u307E\u305B\u3093"],
            recommendations: ["\u62C5\u4FDD\u60C5\u5831\u306E\u66F8\u985E\u63D0\u51FA\u3092\u6C42\u3081\u3066\u304F\u3060\u3055\u3044"]
          },
          summary: "\u62C5\u4FDD\u95A2\u9023\u66F8\u985E\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093"
        };
      }
      const findings = [];
      const keyRisks = [];
      const recommendations = [];
      let totalEstimatedValue = 0;
      for (const file of allFiles.slice(0, 3)) {
        console.log(`[OCR Collateral] Processing: ${file.name}`);
        const downloadUrl = `https://${domain}/k/v1/file.json?fileKey=${file.fileKey}`;
        const fileResponse = await axios.get(downloadUrl, {
          headers: { "X-Cybozu-API-Token": apiToken },
          responseType: "arraybuffer"
        });
        const base64Content = Buffer.from(fileResponse.data).toString("base64");
        const prompt = `\u3053\u306E\u66F8\u985E\u3092\u5206\u6790\u3057\u3066\u3001\u62C5\u4FDD\u4FA1\u5024\u306E\u8A55\u4FA1\u306B\u5F79\u7ACB\u3064\u60C5\u5831\u3092\u62BD\u51FA\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A

1. **\u66F8\u985E\u306E\u7A2E\u985E\u3092\u63A8\u5B9A**\uFF08\u8ACB\u6C42\u66F8\u3001\u5951\u7D04\u66F8\u3001\u4FDD\u8A3C\u66F8\u3001\u305D\u306E\u4ED6\uFF09
2. **\u91D1\u984D\u60C5\u5831**\u3092\u5168\u3066\u62BD\u51FA\uFF08\u8ACB\u6C42\u984D\u3001\u4FDD\u8A3C\u984D\u3001\u5951\u7D04\u984D\u306A\u3069\uFF09
3. **\u65E5\u4ED8\u60C5\u5831**\u3092\u5168\u3066\u62BD\u51FA\uFF08\u652F\u6255\u671F\u65E5\u3001\u5951\u7D04\u65E5\u306A\u3069\uFF09
4. **\u4F01\u696D\u540D\u30FB\u500B\u4EBA\u540D**\u3092\u62BD\u51FA

\u7279\u306B\u4EE5\u4E0B\u306E\u4F01\u696D\u306B\u95A2\u9023\u3059\u308B\u60C5\u5831\u3092\u63A2\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A
${collateralCompanies.map((c) => `- ${c.name}${c.expectedAmount ? ` (\u671F\u5F85\u984D: ${c.expectedAmount.toLocaleString()}\u5186)` : ""}`).join("\n")}

5. **\u62C5\u4FDD\u4FA1\u5024\u306B\u5F71\u97FF\u3059\u308B\u8981\u7D20**\uFF1A
   - \u652F\u6255\u6761\u4EF6
   - \u4FDD\u8A3C\u5185\u5BB9
   - \u30EA\u30B9\u30AF\u8981\u56E0
   - \u305D\u306E\u4ED6\u91CD\u8981\u4E8B\u9805

\u4E8B\u5B9F\u306E\u307F\u3092\u7C21\u6F54\u306B\u5831\u544A\u3057\u3066\u304F\u3060\u3055\u3044\u3002`;
        const isPDF = file.contentType === "application/pdf";
        const dataUrl = isPDF ? `data:application/pdf;base64,${base64Content}` : `data:${file.contentType};base64,${base64Content}`;
        const response = await generateText({
          model: openai("gpt-4o"),
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image", image: dataUrl }
              ]
            }
          ]
        });
        const text = response.text;
        let documentType = "\u305D\u306E\u4ED6";
        if (text.includes("\u8ACB\u6C42\u66F8") || file.name.includes("\u8ACB\u6C42")) {
          documentType = "\u8ACB\u6C42\u66F8";
        } else if (text.includes("\u5951\u7D04\u66F8") || file.name.includes("\u5951\u7D04")) {
          documentType = "\u5951\u7D04\u66F8";
        } else if (text.includes("\u4FDD\u8A3C") || file.name.includes("\u4FDD\u8A3C")) {
          documentType = "\u4FDD\u8A3C\u66F8";
        } else if (text.includes("\u6CE8\u6587") || file.name.includes("\u767A\u6CE8")) {
          documentType = "\u767A\u6CE8\u66F8";
        }
        let relatedCompany = void 0;
        for (const company of collateralCompanies) {
          if (text.includes(company.name) || file.name.includes(company.name)) {
            relatedCompany = company.name;
            break;
          }
        }
        const amounts = [];
        const amountMatches = text.matchAll(/([\d,]+)円/g);
        for (const match of amountMatches) {
          const amount = parseInt(match[1].replace(/,/g, ""));
          if (amount > 1e4) {
            const start = Math.max(0, match.index - 20);
            const context2 = text.substring(start, match.index);
            amounts.push({
              description: context2.trim() || "\u91D1\u984D",
              amount
            });
            totalEstimatedValue += amount;
          }
        }
        const dates = [];
        const dateMatches = text.matchAll(/(\d{4}[年/]\d{1,2}[月/]\d{1,2}日?)/g);
        for (const match of dateMatches) {
          dates.push(match[1]);
        }
        const keyInformation = [];
        if (documentType !== "\u305D\u306E\u4ED6") keyInformation.push(`\u66F8\u985E\u7A2E\u5225: ${documentType}`);
        if (relatedCompany) keyInformation.push(`\u95A2\u9023\u4F01\u696D: ${relatedCompany}`);
        if (amounts.length > 0) keyInformation.push(`\u91D1\u984D\u60C5\u5831${amounts.length}\u4EF6`);
        if (text.includes("\u9045\u5EF6") || text.includes("\u5EF6\u6EDE")) {
          keyRisks.push(`${file.name}: \u652F\u6255\u9045\u5EF6\u306E\u53EF\u80FD\u6027`);
          keyInformation.push("\u26A0\uFE0F \u652F\u6255\u9045\u5EF6\u30EA\u30B9\u30AF");
        }
        if (text.includes("\u89E3\u9664") || text.includes("\u53D6\u6D88")) {
          keyRisks.push(`${file.name}: \u5951\u7D04\u89E3\u9664\u6761\u9805\u3042\u308A`);
          keyInformation.push("\u26A0\uFE0F \u5951\u7D04\u89E3\u9664\u30EA\u30B9\u30AF");
        }
        const reliability = relatedCompany && amounts.length > 0 ? "high" : relatedCompany || amounts.length > 0 ? "medium" : "low";
        findings.push({
          fileName: file.name,
          documentType,
          relatedCompany,
          keyInformation,
          amounts,
          dates,
          reliability
        });
      }
      const highReliabilityCount = findings.filter((f) => f.reliability === "high").length;
      if (highReliabilityCount === 0) {
        recommendations.push("\u62C5\u4FDD\u4F01\u696D\u540D\u3068\u91D1\u984D\u304C\u660E\u78BA\u306A\u66F8\u985E\u306E\u63D0\u51FA\u3092\u6C42\u3081\u3066\u304F\u3060\u3055\u3044");
      }
      if (totalEstimatedValue === 0) {
        recommendations.push("\u62C5\u4FDD\u4FA1\u5024\u3092\u8A55\u4FA1\u3067\u304D\u308B\u91D1\u984D\u60C5\u5831\u304C\u4E0D\u8DB3\u3057\u3066\u3044\u307E\u3059");
      }
      for (const company of collateralCompanies) {
        const companyFindings = findings.filter((f) => f.relatedCompany === company.name);
        if (companyFindings.length === 0) {
          recommendations.push(`${company.name}\u306E\u62C5\u4FDD\u66F8\u985E\u304C\u4E0D\u8DB3\u3057\u3066\u3044\u308B\u53EF\u80FD\u6027\u304C\u3042\u308A\u307E\u3059`);
        }
      }
      const summary = `${allFiles.length}\u4EF6\u4E2D${findings.length}\u4EF6\u306E\u62C5\u4FDD\u95A2\u9023\u66F8\u985E\u3092\u5206\u6790\u3002` + (totalEstimatedValue > 0 ? `\u63A8\u5B9A\u62C5\u4FDD\u4FA1\u5024: ${totalEstimatedValue.toLocaleString()}\u5186\u3002` : "") + (keyRisks.length > 0 ? `\u30EA\u30B9\u30AF\u8981\u56E0${keyRisks.length}\u4EF6\u691C\u51FA\u3002` : "");
      return {
        success: true,
        findings,
        collateralAssessment: {
          totalValue: totalEstimatedValue > 0 ? totalEstimatedValue : void 0,
          keyRisks,
          recommendations
        },
        summary
      };
    } catch (error) {
      console.error(`[OCR Collateral] Error:`, error);
      return {
        success: false,
        findings: [],
        collateralAssessment: {
          keyRisks: ["OCR\u51E6\u7406\u3067\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F"],
          recommendations: ["\u6280\u8853\u7684\u306A\u554F\u984C\u3092\u89E3\u6C7A\u5F8C\u3001\u518D\u5EA6\u5B9F\u884C\u3057\u3066\u304F\u3060\u3055\u3044"]
        },
        summary: `\u30A8\u30E9\u30FC: ${error instanceof Error ? error.message : "OCR\u51E6\u7406\u306B\u5931\u6557\u3057\u307E\u3057\u305F"}`
      };
    }
  }
});

export { ocrCollateralTool };
