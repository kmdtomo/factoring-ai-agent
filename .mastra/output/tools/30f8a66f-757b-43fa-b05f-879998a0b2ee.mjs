import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import axios from 'axios';

const ocrRegistryTool = createTool({
  id: "ocr-registry",
  description: "\u6CD5\u4EBA\u767B\u8A18\u7C3F\u3068\u50B5\u6A29\u8B72\u6E21\u767B\u8A18\u3092OCR\u51E6\u7406\u3057\u3001\u4F01\u696D\u60C5\u5831\u3068\u50B5\u6A29\u8B72\u6E21\u306E\u6709\u7121\u3092\u78BA\u8A8D",
  inputSchema: z.object({
    recordId: z.string().describe("Kintone\u30EC\u30B3\u30FC\u30C9ID"),
    targetCompanies: z.array(z.object({
      name: z.string(),
      type: z.enum(["\u8CB7\u53D6", "\u62C5\u4FDD", "\u7533\u8FBC\u8005"]).describe("\u4F01\u696D\u306E\u7A2E\u5225")
    })).describe("\u78BA\u8A8D\u5BFE\u8C61\u306E\u4F01\u696D\u30EA\u30B9\u30C8")
  }),
  outputSchema: z.object({
    success: z.boolean(),
    companies: z.array(z.object({
      companyName: z.string(),
      found: z.boolean(),
      establishedYear: z.string().optional(),
      capital: z.string().optional(),
      representatives: z.array(z.string()).optional(),
      hasDebtTransferRegistration: z.boolean().optional().describe("\u50B5\u6A29\u8B72\u6E21\u767B\u8A18\u306E\u6709\u7121"),
      registrationDetails: z.string().optional()
    })),
    processedFiles: z.array(z.object({
      fileName: z.string(),
      type: z.enum(["\u6CD5\u4EBA\u767B\u8A18", "\u50B5\u6A29\u8B72\u6E21\u767B\u8A18"]),
      relatedCompany: z.string().optional()
    })),
    summary: z.string()
  }),
  execute: async ({ context }) => {
    const { recordId, targetCompanies } = context;
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
      const registryFiles = [];
      const seiinFiles = record.\u6210\u56E0\u8A3C\u66F8\uFF3F\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB?.value || [];
      registryFiles.push(...seiinFiles.filter(
        (f) => f.name.includes("\u767B\u8A18") || f.name.includes("\u8B04\u672C")
      ));
      const customerFiles = record.\u9867\u5BA2\u60C5\u5831\uFF3F\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB?.value || [];
      registryFiles.push(...customerFiles.filter(
        (f) => f.name.includes("\u767B\u8A18") || f.name.includes("\u8B04\u672C")
      ));
      const collateralFiles = record.\u62C5\u4FDD\u60C5\u5831\uFF3F\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB?.value || [];
      registryFiles.push(...collateralFiles.filter(
        (f) => f.name.includes("\u767B\u8A18") || f.name.includes("\u8B04\u672C")
      ));
      if (registryFiles.length === 0) {
        return {
          success: false,
          companies: targetCompanies.map((c) => ({
            companyName: c.name,
            found: false
          })),
          processedFiles: [],
          summary: "\u767B\u8A18\u7C3F\u95A2\u9023\u30D5\u30A1\u30A4\u30EB\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093"
        };
      }
      const processedFiles = [];
      const companiesInfo = /* @__PURE__ */ new Map();
      for (const file of registryFiles.slice(0, 4)) {
        console.log(`[OCR Registry] Processing: ${file.name}`);
        const downloadUrl = `https://${domain}/k/v1/file.json?fileKey=${file.fileKey}`;
        const fileResponse = await axios.get(downloadUrl, {
          headers: { "X-Cybozu-API-Token": apiToken },
          responseType: "arraybuffer"
        });
        const base64Content = Buffer.from(fileResponse.data).toString("base64");
        const isDebtTransfer = file.name.includes("\u50B5\u6A29\u8B72\u6E21");
        const fileType = isDebtTransfer ? "\u50B5\u6A29\u8B72\u6E21\u767B\u8A18" : "\u6CD5\u4EBA\u767B\u8A18";
        let prompt = "";
        if (isDebtTransfer) {
          prompt = `\u3053\u306E\u50B5\u6A29\u8B72\u6E21\u767B\u8A18\u306B\u3064\u3044\u3066\u4EE5\u4E0B\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A
1. \u767B\u8A18\u3055\u308C\u3066\u3044\u308B\u4F01\u696D\u540D
2. \u50B5\u6A29\u8B72\u6E21\u306E\u5185\u5BB9\uFF08\u6982\u8981\uFF09
3. \u767B\u8A18\u65E5

\u5BFE\u8C61\u4F01\u696D\uFF1A
${targetCompanies.map((c) => `- ${c.name}`).join("\n")}`;
        } else {
          prompt = `\u3053\u306E\u6CD5\u4EBA\u767B\u8A18\u7C3F\u306B\u3064\u3044\u3066\u4EE5\u4E0B\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A
1. \u5546\u53F7\uFF08\u4F1A\u793E\u540D\uFF09
2. \u4F1A\u793E\u6210\u7ACB\u65E5\u307E\u305F\u306F\u8A2D\u7ACB\u5E74
3. \u8CC7\u672C\u91D1\u306E\u984D
4. \u4EE3\u8868\u53D6\u7DE0\u5F79\u306E\u6C0F\u540D

\u7279\u306B\u4EE5\u4E0B\u306E\u4F01\u696D\u60C5\u5831\u3092\u63A2\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A
${targetCompanies.map((c) => `- ${c.name}`).join("\n")}`;
        }
        const isPDF = file.contentType === "application/pdf";
        const dataUrl = isPDF ? `data:application/pdf;base64,${base64Content}` : `data:${file.contentType};base64,${base64Content}`;
        const response = await generateObject({
          model: openai("gpt-4o"),
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image", image: dataUrl }
              ]
            }
          ],
          schema: z.object({
            companyName: z.string().optional().describe("\u8AAD\u307F\u53D6\u3063\u305F\u4F1A\u793E\u540D"),
            establishedYear: z.string().optional().describe("\u8A2D\u7ACB\u5E74\u307E\u305F\u306F\u6210\u7ACB\u65E5"),
            capital: z.string().optional().describe("\u8CC7\u672C\u91D1"),
            representatives: z.array(z.string()).optional().describe("\u4EE3\u8868\u8005\u540D"),
            hasDebtTransferRegistration: z.boolean().optional().describe("\u50B5\u6A29\u8B72\u6E21\u767B\u8A18\u306E\u6709\u7121"),
            registrationDetails: z.string().optional().describe("\u767B\u8A18\u306E\u8A73\u7D30"),
            documentType: z.string().optional().describe("\u66F8\u985E\u306E\u7A2E\u985E"),
            confidence: z.number().min(0).max(100).optional().describe("\u8AAD\u307F\u53D6\u308A\u4FE1\u983C\u5EA6")
          }),
          mode: "json",
          temperature: 0
        });
        const text = response.text;
        let relatedCompany = void 0;
        for (const company of targetCompanies) {
          if (text.includes(company.name)) {
            relatedCompany = company.name;
            break;
          }
        }
        if (!relatedCompany) {
          for (const company of targetCompanies) {
            if (file.name.includes(company.name)) {
              relatedCompany = company.name;
              break;
            }
          }
        }
        processedFiles.push({
          fileName: file.name,
          type: fileType,
          relatedCompany
        });
        if (relatedCompany) {
          if (!companiesInfo.has(relatedCompany)) {
            companiesInfo.set(relatedCompany, {
              companyName: relatedCompany,
              found: true
            });
          }
          const info = companiesInfo.get(relatedCompany);
          if (isDebtTransfer) {
            info.hasDebtTransferRegistration = true;
            info.registrationDetails = text.match(/登記日[：:]\s*(.+?)(?:\s|$)/)?.[1] || "\u50B5\u6A29\u8B72\u6E21\u767B\u8A18\u3042\u308A";
          } else {
            const yearMatch = text.match(/(?:会社成立|設立)[：:]\s*(?:昭和|平成|令和)?(\d+)年/);
            if (yearMatch) {
              const era = text.match(/(?:会社成立|設立)[：:]\s*(昭和|平成|令和)/)?.[1];
              info.establishedYear = era ? `${era}${yearMatch[1]}\u5E74` : yearMatch[1];
            }
            const capitalMatch = text.match(/資本金[：:]\s*金?([\d,]+万?千?円)/);
            if (capitalMatch) {
              info.capital = capitalMatch[1];
            }
            const repMatches = text.matchAll(/代表取締役\s*([^\s]{2,4}(?:\s+[^\s]{2,4})?)/g);
            info.representatives = Array.from(repMatches, (m) => m[1]);
          }
        }
      }
      const companies = targetCompanies.map((target) => {
        const info = companiesInfo.get(target.name);
        return info || {
          companyName: target.name,
          found: false
        };
      });
      const foundCount = companies.filter((c) => c.found).length;
      const debtTransferCount = companies.filter((c) => c.hasDebtTransferRegistration).length;
      const summary = `${targetCompanies.length}\u793E\u4E2D${foundCount}\u793E\u306E\u767B\u8A18\u60C5\u5831\u3092\u78BA\u8A8D\u3002` + (debtTransferCount > 0 ? `${debtTransferCount}\u793E\u306B\u50B5\u6A29\u8B72\u6E21\u767B\u8A18\u3042\u308A\u3002` : "");
      return {
        success: true,
        companies,
        processedFiles,
        summary
      };
    } catch (error) {
      console.error(`[OCR Registry] Error:`, error);
      return {
        success: false,
        companies: targetCompanies.map((c) => ({
          companyName: c.name,
          found: false
        })),
        processedFiles: [],
        summary: `\u30A8\u30E9\u30FC: ${error instanceof Error ? error.message : "OCR\u51E6\u7406\u306B\u5931\u6557\u3057\u307E\u3057\u305F"}`
      };
    }
  }
});

export { ocrRegistryTool };
