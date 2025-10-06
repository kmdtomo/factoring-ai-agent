import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import axios from 'axios';

const ocrPurchaseInfoToolFixed = createTool({
  id: "ocr-purchase-info-fixed",
  description: "\u8CB7\u53D6\u60C5\u5831\u66F8\u985E\uFF08\u8ACB\u6C42\u66F8\u30FB\u767A\u6CE8\u66F8\uFF09\u3092\u30D0\u30C3\u30C1OCR\u51E6\u7406\u3057\u3001\u8CB7\u53D6\u50B5\u6A29\u984D\u3068\u4F01\u696D\u540D\u3092\u7167\u5408\u3002recordId\u304B\u3089\u6210\u56E0\u8A3C\u66F8\u30D5\u30A1\u30A4\u30EB+\u8CB7\u53D6\u60C5\u5831\u30C6\u30FC\u30D6\u30EB\u3092\u81EA\u52D5\u53D6\u5F97",
  inputSchema: z.object({
    recordId: z.string().describe("Kintone\u30EC\u30B3\u30FC\u30C9ID\uFF08\u6210\u56E0\u8A3C\u66F8\uFF3F\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB+\u8CB7\u53D6\u60C5\u5831\u30C6\u30FC\u30D6\u30EB+\u8CB7\u53D6\u50B5\u6A29\u984D_\u5408\u8A08\u3092\u81EA\u52D5\u53D6\u5F97\uFF09")
  }),
  outputSchema: z.object({
    success: z.boolean(),
    // 📊 OCR検証結果（最重要）
    verification: z.object({
      amountMatch: z.enum(["match", "mismatch", "not_found"]),
      companyMatch: z.enum(["match", "mismatch", "not_found"]),
      invoiceNumber: z.string().optional(),
      paymentDueDate: z.string().optional()
    }),
    // 🔍 抽出データ（デバッグ用）
    extracted: z.object({
      amount: z.number().optional().describe("OCR\u62BD\u51FA\u91D1\u984D"),
      company: z.string().optional().describe("OCR\u62BD\u51FA\u4F1A\u793E\u540D")
    }),
    // 📈 期待値（参照用）
    expected: z.object({
      amount: z.number().describe("\u671F\u5F85\u91D1\u984D\uFF08Kintone\uFF09"),
      company: z.string().describe("\u671F\u5F85\u4F1A\u793E\u540D\uFF08Kintone\uFF09")
    }),
    // 💰 最終レポート用データ（掛目分析に必要）
    purchaseInfo: z.object({
      totalDebtAmount: z.number().describe("\u7DCF\u50B5\u6A29\u984D"),
      purchaseDebtAmount: z.number().describe("\u8CB7\u53D6\u50B5\u6A29\u984D"),
      purchaseAmount: z.number().describe("\u5B9F\u969B\u306E\u8CB7\u53D6\u984D"),
      collateralRate: z.number().describe("\u639B\u76EE\uFF08%\uFF09"),
      company: z.string().describe("\u8CB7\u53D6\u5BFE\u8C61\u4F01\u696D\u540D"),
      paymentDate: z.string().describe("\u652F\u6255\u4E88\u5B9A\u65E5")
    }),
    // 📝 要約
    summary: z.string(),
    confidence: z.number().min(0).max(100).describe("OCR\u4FE1\u983C\u5EA6")
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
      const purchaseFiles = record.\u6210\u56E0\u8A3C\u66F8\uFF3F\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB?.value || [];
      const buyInfo = record.\u8CB7\u53D6\u60C5\u5831?.value || [];
      const totalDebtAmount = parseInt(record.\u8CB7\u53D6\u50B5\u6A29\u984D_\u5408\u8A08?.value || "0");
      const purchaseCompany = buyInfo[0]?.value?.\u4F1A\u793E\u540D_\u7B2C\u4E09\u50B5\u52D9\u8005_\u8CB7\u53D6?.value || "";
      console.log(`[OCR Purchase Info Fixed] \u671F\u5F85\u5024: \u7DCF\u50B5\u6A29\u984D=${totalDebtAmount}, \u4F01\u696D\u540D=${purchaseCompany}`);
      console.log(`[OCR Purchase Info Fixed] Total files found: ${purchaseFiles.length}`);
      if (purchaseFiles.length === 0) {
        return {
          success: false,
          verification: {
            amountMatch: "not_found",
            companyMatch: "not_found"
          },
          extracted: {},
          expected: {
            amount: totalDebtAmount,
            company: purchaseCompany
          },
          purchaseInfo: {
            totalDebtAmount: 0,
            purchaseDebtAmount: 0,
            purchaseAmount: 0,
            collateralRate: 0,
            company: "",
            paymentDate: ""
          },
          summary: "\u8CB7\u53D6\u60C5\u5831\u66F8\u985E\u304C\u6DFB\u4ED8\u3055\u308C\u3066\u3044\u307E\u305B\u3093",
          confidence: 0
        };
      }
      const filesToProcess = purchaseFiles.slice(0, 3);
      console.log(`[OCR Purchase Info Fixed] Batch processing ${filesToProcess.length} files`);
      const fileContents = [];
      for (const file of filesToProcess) {
        console.log(`[OCR Purchase Info Fixed] Downloading: ${file.name}`);
        const downloadUrl = `https://${domain}/k/v1/file.json?fileKey=${file.fileKey}`;
        const fileResponse = await axios.get(downloadUrl, {
          headers: { "X-Cybozu-API-Token": apiToken },
          responseType: "arraybuffer"
        });
        const base64Content = Buffer.from(fileResponse.data).toString("base64");
        const isPDF = file.contentType === "application/pdf";
        const dataUrl = isPDF ? `data:application/pdf;base64,${base64Content}` : `data:${file.contentType};base64,${base64Content}`;
        fileContents.push({ type: "image", image: dataUrl });
      }
      const prompt = `\u3053\u308C\u3089\u306E\u66F8\u985E\uFF08${filesToProcess.length}\u30D5\u30A1\u30A4\u30EB\uFF09\u3092\u5206\u6790\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A

\u307E\u305A\u5404\u30D5\u30A1\u30A4\u30EB\u304C\u8CB7\u53D6\u95A2\u9023\u66F8\u985E\u304B\u5224\u5B9A:
- \u8ACB\u6C42\u66F8\u30FB\u767A\u6CE8\u66F8\u30FB\u5951\u7D04\u66F8\u30FB\u660E\u7D30\u66F8\u7B49 \u2192 \u8A73\u7D30\u5206\u6790\u7D99\u7D9A
- \u8FF7\u3063\u305F\u5834\u5408\u30FB\u4E0D\u660E\u306A\u5834\u5408 \u2192 \u8A73\u7D30\u5206\u6790\u7D99\u7D9A\uFF08\u8AA4\u30B9\u30AD\u30C3\u30D7\u9632\u6B62\uFF09
- \u660E\u3089\u304B\u306B\u7121\u95A2\u4FC2\uFF08\u500B\u4EBA\u5199\u771F\u30FB\u30E1\u30E2\u7B49\uFF09 \u2192 \u30B9\u30AD\u30C3\u30D7\uFF08skipReason\u8A18\u8F09\uFF09

\u26A0\uFE0F \u91CD\u8981: \u8ACB\u6C42\u66F8\u7CFB\u306F\u7A4D\u6975\u7684\u306B\u51E6\u7406\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u7591\u308F\u3057\u3044\u5834\u5408\u306F\u30B9\u30AD\u30C3\u30D7\u3057\u306A\u3044\u3067\u304F\u3060\u3055\u3044\u3002

\u{1F3AF} \u3010\u91CD\u8981\u3011\u671F\u5F85\u5024\u3068\u5B8C\u5168\u4E00\u81F4\u3059\u308B\u91D1\u984D\u3092\u63A2\u3057\u3066\u304F\u3060\u3055\u3044:
- \u5BFE\u8C61\u91D1\u984D: ${totalDebtAmount.toLocaleString()}\u5186\uFF08\u3053\u306E\u91D1\u984D\u3068\u5B8C\u5168\u4E00\u81F4\u3059\u308B\u3082\u306E\u3092\u6700\u512A\u5148\u3067\u63A2\u3059\uFF09
- \u5BFE\u8C61\u4F01\u696D: ${purchaseCompany}

\u{1F4CB} \u3010\u62BD\u51FA\u30EB\u30FC\u30EB\u3011:
1. \u91D1\u984D: ${totalDebtAmount.toLocaleString()}\u5186\u3068\u5B8C\u5168\u4E00\u81F4\u3059\u308B\u91D1\u984D\u304C\u3042\u308B\u304B\u78BA\u8A8D
2. \u5B8C\u5168\u4E00\u81F4\u3059\u308B\u91D1\u984D\u304C\u3042\u308B \u2192 extracted_amount \u306B\u8A2D\u5B9A\u3001q1_amount_present = "match"
3. \u5B8C\u5168\u4E00\u81F4\u3059\u308B\u91D1\u984D\u304C\u306A\u3044 \u2192 extracted_amount \u306F\u6700\u3082\u5927\u304D\u3044\u91D1\u984D\u3001q1_amount_present = "mismatch"

\u26A0\uFE0F \u3010\u91CD\u8981\u3011\u91D1\u984D\u306E\u6570\u5B57\u3092\u6B63\u78BA\u306B\u8AAD\u307F\u53D6\u3063\u3066\u304F\u3060\u3055\u3044\u30028/3\u30019/0\u30016/5\u306E\u6DF7\u52D5\u306B\u6CE8\u610F\u3002

\u62BD\u51FA\u9805\u76EE: \u6587\u66F8\u95A2\u9023\u6027\u3001\u91D1\u984D\u5224\u5B9A\u3001\u4F01\u696D\u5224\u5B9A\u3001\u5B9F\u969B\u306E\u91D1\u984D\u3001\u5B9F\u969B\u306E\u4F01\u696D\u3001\u8ACB\u6C42\u66F8\u756A\u53F7\u3001\u652F\u6255\u671F\u65E5`;
      const content = [
        { type: "text", text: prompt },
        ...fileContents
      ];
      const result = await generateObject({
        model: openai("gpt-4o"),
        messages: [{ role: "user", content }],
        schema: z.object({
          documentRelevance: z.object({
            isPurchaseRelated: z.boolean().describe("\u8CB7\u53D6\u95A2\u9023\u66F8\u985E\u304B\u3069\u3046\u304B"),
            skipReason: z.string().optional().describe("\u8CB7\u53D6\u3068\u95A2\u4FC2\u306A\u3044\u5834\u5408\u306E\u7406\u7531")
          }),
          q1_amount_present: z.enum(["match", "mismatch", "unknown"]),
          extracted_amount: z.number().optional().describe("OCR\u3067\u62BD\u51FA\u3057\u305F\u5B9F\u969B\u306E\u91D1\u984D\uFF08\u6570\u5024\u306E\u307F\uFF09"),
          q2_addressee_present: z.enum(["match", "mismatch", "unknown"]),
          extracted_company: z.string().optional().describe("OCR\u3067\u62BD\u51FA\u3057\u305F\u5B9F\u969B\u306E\u4F1A\u793E\u540D"),
          q3_issuer_present: z.enum(["match", "mismatch", "unknown"]),
          bestMatchFile: z.string().optional().describe("\u6700\u3082\u4E00\u81F4\u5EA6\u306E\u9AD8\u3044\u30D5\u30A1\u30A4\u30EB\u540D"),
          invoiceNumber: z.string().optional(),
          paymentDueDate: z.string().optional(),
          confidence: z.number().min(0).max(100).optional(),
          notes: z.string().optional()
        }),
        mode: "json",
        temperature: 0
      });
      const q1 = result.object.q1_amount_present;
      const q2 = result.object.q2_addressee_present;
      let amountMatch = "not_found";
      let foundAmount = void 0;
      let companyMatch = "not_found";
      let foundCompany = void 0;
      if (q1 === "match") {
        amountMatch = "match";
        foundAmount = totalDebtAmount;
      } else if (q1 === "mismatch") {
        amountMatch = "mismatch";
        foundAmount = result.object.extracted_amount || void 0;
        console.log(`[OCR Purchase Info Fixed] \u91D1\u984D\u4E0D\u4E00\u81F4: \u671F\u5F85=${totalDebtAmount}, OCR\u62BD\u51FA=${foundAmount}`);
      }
      if (q2 === "match") {
        companyMatch = "match";
        foundCompany = purchaseCompany;
      } else if (q2 === "mismatch") {
        companyMatch = "mismatch";
        foundCompany = result.object.extracted_company || "\u4E0D\u660E";
        console.log(`[OCR Purchase Info Fixed] \u4F1A\u793E\u540D\u4E0D\u4E00\u81F4: \u671F\u5F85=${purchaseCompany}, OCR\u62BD\u51FA=${foundCompany}`);
      }
      const invoiceNumber = result.object.invoiceNumber;
      const paymentDueDate = result.object.paymentDueDate;
      const processedFileCount = result.object.documentRelevance?.isPurchaseRelated ? filesToProcess.length : 0;
      console.log(`[OCR Purchase Info Fixed] \u30D0\u30C3\u30C1\u51E6\u7406\u5B8C\u4E86: \u91D1\u984D=${q1}, \u5B9B\u5148=${q2}, \u51E6\u7406\u30D5\u30A1\u30A4\u30EB\u6570=${processedFileCount}, \u6700\u9069\u30D5\u30A1\u30A4\u30EB=${result.object.bestMatchFile}`);
      let confidence = 0;
      if (amountMatch === "match") confidence += 40;
      if (companyMatch === "match") confidence += 40;
      if (result.object.q3_issuer_present === "match") confidence += 20;
      console.log(`[OCR Purchase Info Fixed] \u8CB7\u53D6\u60C5\u5831: ${buyInfo.length}\u4EF6, \u7DCF\u50B5\u6A29\u984D: ${totalDebtAmount}, \u8CB7\u53D6\u984D: ${record.\u8CB7\u53D6\u984D_\u5408\u8A08?.value || "0"}`);
      const summary = `\u8ACB\u6C42\u66F8OCR\u5B8C\u4E86\uFF08${processedFileCount}\u30D5\u30A1\u30A4\u30EB\u51E6\u7406\uFF09\u3002\u91D1\u984D: ${amountMatch}, \u5B9B\u5148: ${companyMatch}${result.object.documentRelevance?.isPurchaseRelated === false ? "\uFF08\u4E00\u90E8\u30D5\u30A1\u30A4\u30EB\u30B9\u30AD\u30C3\u30D7\uFF09" : ""}`;
      const firstBuyInfo = buyInfo[0];
      const purchaseInfoData = {
        totalDebtAmount: parseInt(firstBuyInfo?.value?.\u7DCF\u50B5\u6A29\u984D?.value || "0"),
        purchaseDebtAmount: parseInt(firstBuyInfo?.value?.\u8CB7\u53D6\u50B5\u6A29\u984D?.value || "0"),
        purchaseAmount: parseInt(firstBuyInfo?.value?.\u8CB7\u53D6\u984D?.value || "0"),
        collateralRate: parseFloat(firstBuyInfo?.value?.\u639B\u76EE?.value || "0"),
        company: firstBuyInfo?.value?.\u4F1A\u793E\u540D_\u7B2C\u4E09\u50B5\u52D9\u8005_\u8CB7\u53D6?.value || "",
        paymentDate: firstBuyInfo?.value?.\u8CB7\u53D6\u50B5\u6A29\u652F\u6255\u65E5?.value || ""
      };
      return {
        success: amountMatch === "match" && companyMatch === "match",
        verification: {
          amountMatch,
          companyMatch,
          invoiceNumber,
          paymentDueDate
        },
        extracted: {
          amount: foundAmount,
          company: foundCompany
        },
        expected: {
          amount: totalDebtAmount,
          company: purchaseCompany
        },
        purchaseInfo: purchaseInfoData,
        summary,
        confidence
      };
    } catch (error) {
      console.error("[OCR Purchase Info Fixed] Error:", error);
      return {
        success: false,
        verification: {
          amountMatch: "not_found",
          companyMatch: "not_found"
        },
        extracted: {},
        expected: {
          amount: 0,
          company: ""
        },
        purchaseInfo: {
          totalDebtAmount: 0,
          purchaseDebtAmount: 0,
          purchaseAmount: 0,
          collateralRate: 0,
          company: "",
          paymentDate: ""
        },
        summary: `OCR\u51E6\u7406\u30A8\u30E9\u30FC: ${error instanceof Error ? error.message : "\u4E0D\u660E\u306A\u30A8\u30E9\u30FC"}`,
        confidence: 0
      };
    }
  }
});

export { ocrPurchaseInfoToolFixed };
