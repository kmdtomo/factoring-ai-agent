import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { anthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import axios from 'axios';

const ocrRegistryToolV2 = createTool({
  id: "ocr-registry-v2",
  description: "\u6CD5\u4EBA\u767B\u8A18\u7C3F\u3068\u50B5\u6A29\u8B72\u6E21\u767B\u8A18\u3092OCR\u51E6\u7406\u3057\u3001\u4F01\u696D\u60C5\u5831\u3068\u50B5\u6A29\u8B72\u6E21\u306E\u6709\u7121\u3092\u78BA\u8A8D\u3002recordId\u304B\u3089\u767B\u8A18\u7C3F\u30D5\u30A1\u30A4\u30EB+\u8B04\u672C\u60C5\u5831\u30C6\u30FC\u30D6\u30EB\u3092\u81EA\u52D5\u53D6\u5F97",
  inputSchema: z.object({
    recordId: z.string().describe("Kintone\u30EC\u30B3\u30FC\u30C9ID\uFF08\u767B\u8A18\u7C3F\uFF3F\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB+\u8B04\u672C\u60C5\u5831\u30C6\u30FC\u30D6\u30EB+\u4F01\u696D\u60C5\u5831\u3092\u81EA\u52D5\u53D6\u5F97\uFF09")
  }),
  outputSchema: z.object({
    success: z.boolean(),
    processingDetails: z.object({
      recordId: z.string(),
      targetCompanies: z.array(z.string()),
      filesFound: z.number(),
      registryEntriesFound: z.number()
    }),
    companies: z.array(z.object({
      companyName: z.string(),
      companyType: z.enum(["\u8CB7\u53D6", "\u62C5\u4FDD", "\u7533\u8FBC\u8005"]).describe("\u4F01\u696D\u306E\u7A2E\u5225"),
      found: z.boolean(),
      establishedYear: z.string().optional(),
      capital: z.string().optional(),
      representatives: z.array(z.string()).optional(),
      hasDebtTransferRegistration: z.boolean().optional().describe("\u50B5\u6A29\u8B72\u6E21\u767B\u8A18\u306E\u6709\u7121"),
      registrationDetails: z.string().optional()
    })),
    registryInfo: z.array(z.object({
      company: z.string(),
      capitalAmount: z.string(),
      establishedDate: z.string(),
      debtType: z.string()
    })),
    processedFiles: z.array(z.object({
      fileName: z.string(),
      type: z.enum(["\u6CD5\u4EBA\u767B\u8A18", "\u50B5\u6A29\u8B72\u6E21\u767B\u8A18"]),
      relatedCompany: z.string().optional()
    })),
    summary: z.string()
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
      console.log(`[OCR Registry V2] Kintone\u304B\u3089\u4F01\u696D\u60C5\u5831\u3092\u53D6\u5F97`);
      const targetCompanies2 = [];
      const applicantCompany = record.\u5C4B\u53F7?.value || record.\u4F1A\u793E_\u5C4B\u53F7\u540D?.value;
      if (applicantCompany) {
        targetCompanies2.push({
          name: applicantCompany,
          type: "\u7533\u8FBC\u8005"
        });
      }
      const purchaseInfo = record.\u8CB7\u53D6\u60C5\u5831?.value || [];
      purchaseInfo.forEach((item) => {
        const companyName = item.value.\u4F1A\u793E\u540D_\u7B2C\u4E09\u50B5\u52D9\u8005_\u8CB7\u53D6?.value;
        if (companyName) {
          targetCompanies2.push({
            name: companyName,
            type: "\u8CB7\u53D6"
          });
        }
      });
      console.log(`[OCR Registry V2] \u53D6\u5F97\u3057\u305F\u4F01\u696D:`, targetCompanies2);
      const allFiles = [
        ...record.\u6210\u56E0\u8A3C\u66F8\uFF3F\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB?.value || [],
        ...record.\u9867\u5BA2\u60C5\u5831\uFF3F\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB?.value || [],
        ...record.\u62C5\u4FDD\u60C5\u5831\uFF3F\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB?.value || []
      ];
      const registryFiles = allFiles.filter(
        (f) => f.name.includes("\u767B\u8A18") || f.name.includes("\u8B04\u672C") || f.name.includes("\u50B5\u6A29\u8B72\u6E21")
      );
      console.log(`[OCR Registry V2] Target companies:`, targetCompanies2);
      console.log(`[OCR Registry V2] Total registry files found: ${registryFiles.length}`);
      if (registryFiles.length > 0) {
        console.log(`[OCR Registry V2] File list:`, registryFiles.map((f) => ({
          name: f.name,
          contentType: f.contentType,
          size: f.size
        })));
      }
      if (registryFiles.length === 0) {
        return {
          success: false,
          processingDetails: {
            recordId,
            targetCompanies: targetCompanies2.map((c) => c.name),
            filesFound: 0,
            registryEntriesFound: 0
          },
          companies: [],
          registryInfo: [],
          processedFiles: [],
          summary: "\u767B\u8A18\u7C3F\u95A2\u9023\u66F8\u985E\u304C\u6DFB\u4ED8\u3055\u308C\u3066\u3044\u307E\u305B\u3093"
        };
      }
      const filesToProcess = registryFiles.slice(0, 3);
      console.log(`[OCR Registry V2] Batch processing ${filesToProcess.length} files`);
      const content = [
        {
          type: "text",
          text: `\u3053\u308C\u3089\u306E\u767B\u8A18\u7C3F\u95A2\u9023\u66F8\u985E\uFF08${filesToProcess.length}\u30D5\u30A1\u30A4\u30EB\uFF09\u3092\u5206\u6790\u3057\u3001\u4EE5\u4E0B\u306E\u60C5\u5831\u3092\u62BD\u51FA\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A

\u5BFE\u8C61\u4F01\u696D: ${targetCompanies2.map((c) => c.name).join(", ")}

\u62BD\u51FA\u9805\u76EE:
1. \u4F1A\u793E\u540D\u30FB\u5546\u53F7
2. \u8A2D\u7ACB\u5E74\u307E\u305F\u306F\u6210\u7ACB\u65E5
3. \u8CC7\u672C\u91D1
4. \u4EE3\u8868\u53D6\u7DE0\u5F79\u30FB\u4EE3\u8868\u8005\u540D
5. \u50B5\u6A29\u8B72\u6E21\u767B\u8A18\u306E\u6709\u7121\u3068\u8A73\u7D30

\u30EB\u30FC\u30EB:
- \u8907\u6570\u6587\u66F8\u304C\u3042\u308B\u5834\u5408\u306F\u60C5\u5831\u3092\u7D71\u5408
- \u898B\u3048\u306A\u3044/\u5224\u5225\u4E0D\u80FD\u306A\u5834\u5408\u306F\u7A7A\u306B\u3059\u308B
- \u63A8\u6E2C\u3084\u88DC\u5B8C\u306F\u7981\u6B62
- \u51FA\u529B\u306F\u6307\u5B9AJSON\u306E\u307F`
        }
      ];
      const processedFiles = [];
      for (const file of filesToProcess) {
        console.log(`[OCR Registry V2] Downloading: ${file.name}`);
        const downloadUrl = `https://${domain}/k/v1/file.json?fileKey=${file.fileKey}`;
        const fileResponse = await axios.get(downloadUrl, {
          headers: { "X-Cybozu-API-Token": apiToken },
          responseType: "arraybuffer"
        });
        const base64Content = Buffer.from(fileResponse.data).toString("base64");
        const isDebtTransfer = file.name.includes("\u50B5\u6A29\u8B72\u6E21");
        const fileType = isDebtTransfer ? "\u50B5\u6A29\u8B72\u6E21\u767B\u8A18" : "\u6CD5\u4EBA\u767B\u8A18";
        const isPDF = file.contentType === "application/pdf";
        const dataUrl = isPDF ? `data:application/pdf;base64,${base64Content}` : `data:${file.contentType};base64,${base64Content}`;
        content.push({ type: "image", image: dataUrl });
        processedFiles.push({
          fileName: file.name,
          type: fileType,
          relatedCompany: void 0
          // バッチ処理後に判定
        });
      }
      const result = await generateObject({
        model: anthropic("claude-3-7-sonnet-20250219"),
        messages: [
          {
            role: "user",
            content
          }
        ],
        schema: z.object({
          companies: z.array(z.object({
            companyName: z.string().optional().describe("\u8AAD\u307F\u53D6\u3063\u305F\u4F1A\u793E\u540D"),
            establishedYear: z.string().optional().describe("\u8A2D\u7ACB\u5E74\u307E\u305F\u306F\u6210\u7ACB\u65E5"),
            capital: z.string().optional().describe("\u8CC7\u672C\u91D1"),
            representatives: z.array(z.string()).optional().describe("\u4EE3\u8868\u8005\u540D"),
            hasDebtTransferRegistration: z.boolean().optional().describe("\u50B5\u6A29\u8B72\u6E21\u767B\u8A18\u306E\u6709\u7121"),
            registrationDetails: z.string().optional().describe("\u767B\u8A18\u306E\u8A73\u7D30")
          })),
          confidence: z.number().min(0).max(100).optional().describe("\u8AAD\u307F\u53D6\u308A\u4FE1\u983C\u5EA6")
        }),
        mode: "json",
        temperature: 0
      });
      const companies = [];
      const ocrExtractedCompanies = result.object.companies || [];
      const extractedCompanyMap = /* @__PURE__ */ new Map();
      for (const companyData of ocrExtractedCompanies) {
        if (companyData.companyName) {
          extractedCompanyMap.set(companyData.companyName, companyData);
        }
      }
      for (const targetCompany of targetCompanies2) {
        let found = false;
        let matchedCompanyData = null;
        for (const [extractedName, data] of extractedCompanyMap) {
          if (extractedName.includes(targetCompany.name) || targetCompany.name.includes(extractedName)) {
            found = true;
            matchedCompanyData = data;
            break;
          }
        }
        if (found && matchedCompanyData) {
          companies.push({
            companyName: matchedCompanyData.companyName,
            // OCRで読み取った実際の企業名
            companyType: targetCompany.type,
            found: true,
            establishedYear: matchedCompanyData.establishedYear,
            capital: matchedCompanyData.capital,
            representatives: matchedCompanyData.representatives || [],
            hasDebtTransferRegistration: matchedCompanyData.hasDebtTransferRegistration || false,
            registrationDetails: matchedCompanyData.registrationDetails
          });
        } else {
          companies.push({
            companyName: targetCompany.name,
            companyType: targetCompany.type,
            found: false,
            establishedYear: void 0,
            capital: void 0,
            representatives: [],
            hasDebtTransferRegistration: false,
            registrationDetails: void 0
          });
        }
      }
      console.log(`[OCR Registry V2] \u8B04\u672C\u60C5\u5831\u30C6\u30FC\u30D6\u30EB\u3092\u53D6\u5F97\u4E2D...`);
      const registryInfo = record.\u8B04\u672C\u60C5\u5831?.value || [];
      console.log(`[OCR Registry V2] \u8B04\u672C\u60C5\u5831: ${registryInfo.length}\u4EF6`);
      companies.some((c) => c.hasDebtTransferRegistration);
      const filesList = processedFiles.map((f) => `${f.fileName}(${f.type})`).join(", ");
      const companyResults = companies.map((c) => {
        if (c.found) {
          const details = [];
          if (c.capital) details.push(`\u8CC7\u672C\u91D1${c.capital}`);
          if (c.establishedYear) details.push(`${c.establishedYear}\u5E74\u8A2D\u7ACB`);
          const detailStr = details.length > 0 ? `/${details.join("/")}` : "";
          return `  ${c.companyType}: ${c.companyName} \u2192 \u767B\u8A18\u78BA\u8A8D\u6E08${detailStr}`;
        } else {
          return `  ${c.companyType}: ${c.companyName} \u2192 \u672A\u78BA\u8A8D`;
        }
      }).join("\n");
      const summary = `\u767B\u8A18\u7C3FOCR\u7D50\u679C:
\u51E6\u7406\u30D5\u30A1\u30A4\u30EB: [${filesList}]
\u78BA\u8A8D\u4F01\u696D\u3068\u7D50\u679C:
${companyResults}`;
      const registryInfoFormatted = registryInfo.map((item) => ({
        company: item.value?.\u4F1A\u793E\u540D_\u7B2C\u4E09\u50B5\u52D9\u8005_0?.value || "",
        capitalAmount: item.value?.\u8CC7\u672C\u91D1\u306E\u984D?.value || "",
        establishedDate: item.value?.\u4F1A\u793E\u6210\u7ACB?.value || "",
        debtType: item.value?.\u50B5\u6A29\u306E\u7A2E\u985E?.value || ""
      }));
      return {
        success: true,
        processingDetails: {
          recordId,
          targetCompanies: targetCompanies2.map((c) => c.name),
          filesFound: registryFiles.length,
          registryEntriesFound: registryInfo.length
        },
        companies,
        registryInfo: registryInfoFormatted,
        processedFiles,
        summary
      };
    } catch (error) {
      console.error("[OCR Registry V2] Error:", error);
      return {
        success: false,
        processingDetails: {
          recordId,
          targetCompanies: targetCompanies.map((c) => c.name),
          filesFound: 0,
          registryEntriesFound: 0
        },
        companies: [],
        registryInfo: [],
        processedFiles: [],
        summary: `OCR\u51E6\u7406\u30A8\u30E9\u30FC: ${error instanceof Error ? error.message : "\u4E0D\u660E\u306A\u30A8\u30E9\u30FC"}`
      };
    }
  }
});

export { ocrRegistryToolV2 };
