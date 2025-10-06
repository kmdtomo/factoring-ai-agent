import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { anthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import axios from 'axios';

const ocrPurchaseSimpleTool = createTool({
  id: "ocr-purchase-simple",
  description: "\u8CB7\u53D6\u95A2\u9023\u66F8\u985E\u304B\u3089\u4E8B\u5B9F\u60C5\u5831\u3092\u62BD\u51FA\uFF08\u7533\u8FBC\u8005\u4F01\u696D\u30FB\u652F\u6255\u8005\u4F01\u696D\u30FB\u7DCF\u50B5\u6A29\u984D\u3092\u7167\u5408\uFF09",
  inputSchema: z.object({
    recordId: z.string().describe("Kintone\u30EC\u30B3\u30FC\u30C9ID")
  }),
  outputSchema: z.object({
    success: z.boolean(),
    verification: z.object({
      requestorMatch: z.enum(["match", "mismatch", "not_found"]),
      payerMatch: z.enum(["match", "mismatch", "not_found"]),
      amountMatch: z.enum(["match", "mismatch", "not_found"])
    }),
    extracted: z.object({
      requestorCompany: z.string().optional(),
      payerCompany: z.string().optional(),
      totalAmount: z.number().optional()
    }),
    expected: z.object({
      requestorCompany: z.string(),
      payerCompany: z.string(),
      totalAmount: z.number()
    }),
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
      const purchaseFiles = record.\u6210\u56E0\u8A3C\u66F8\uFF3F\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB?.value || [];
      console.log(`\u{1F50D} \u8CB7\u53D6\u60C5\u5831\u4EF6\u6570: ${record.\u8CB7\u53D6\u60C5\u5831?.value?.length || 0}`);
      console.log(`\u{1F50D} \u5C4B\u53F7\u30D5\u30A3\u30FC\u30EB\u30C9: ${record.\u5C4B\u53F7?.value || "\u306A\u3057"}`);
      const buyInfo = record.\u8CB7\u53D6\u60C5\u5831?.value || [];
      if (buyInfo.length > 0) {
        console.log(`\u{1F50D} \u7B2C1\u4EF6\u76EE\u306E\u4F1A\u793E\u540D: ${buyInfo[0]?.value?.\u4F1A\u793E\u540D_\u7B2C\u4E09\u50B5\u52D9\u8005_\u8CB7\u53D6?.value || "\u306A\u3057"}`);
        console.log(`\u{1F50D} \u7B2C1\u4EF6\u76EE\u306E\u7DCF\u50B5\u6A29\u984D: ${buyInfo[0]?.value?.\u7DCF\u50B5\u6A29\u984D?.value || "\u306A\u3057"}`);
      }
      const totalDebtAmount = parseInt(buyInfo[0]?.value?.\u7DCF\u50B5\u6A29\u984D?.value || "0");
      const requestorCompany = buyInfo[0]?.value?.\u4F1A\u793E\u540D_\u7B2C\u4E09\u50B5\u52D9\u8005_\u8CB7\u53D6?.value || "";
      const payerCompany = record.\u5C4B\u53F7?.value || "";
      console.log(`\u{1F4CB} \u6700\u7D42\u671F\u5F85\u5024: \u7533\u8FBC\u8005=${requestorCompany}, \u652F\u6255\u8005=${payerCompany}, \u7DCF\u984D=${totalDebtAmount}`);
      if (purchaseFiles.length === 0) {
        return {
          success: false,
          verification: {
            requestorMatch: "not_found",
            payerMatch: "not_found",
            amountMatch: "not_found"
          },
          extracted: {},
          expected: {
            requestorCompany,
            payerCompany,
            totalAmount: totalDebtAmount
          },
          summary: "\u6210\u56E0\u8A3C\u66F8\u304C\u6DFB\u4ED8\u3055\u308C\u3066\u3044\u307E\u305B\u3093"
        };
      }
      const filesToProcess = purchaseFiles.slice(0, 3);
      const base64Images = [];
      for (const file of filesToProcess) {
        const downloadUrl = `https://${domain}/k/v1/file.json?fileKey=${file.fileKey}`;
        const fileResponse = await axios.get(downloadUrl, {
          headers: { "X-Cybozu-API-Token": apiToken },
          responseType: "arraybuffer"
        });
        const base64Content = Buffer.from(fileResponse.data).toString("base64");
        const isPDF = file.contentType === "application/pdf";
        const dataUrl = isPDF ? `data:application/pdf;base64,${base64Content}` : `data:${file.contentType};base64,${base64Content}`;
        base64Images.push({
          type: "image",
          image: dataUrl
        });
      }
      const prompt = `\u3053\u306E\u66F8\u985E\u304B\u3089\u4EE5\u4E0B\u3092\u62BD\u51FA\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A

\u7533\u8FBC\u8005\u4F01\u696D\uFF08\u8ACB\u6C42\u5143\uFF09: ${requestorCompany}
\u652F\u6255\u8005\u4F01\u696D\uFF08\u8ACB\u6C42\u5148\uFF09: ${payerCompany}  
\u7DCF\u50B5\u6A29\u984D: ${totalDebtAmount.toLocaleString()}\u5186

\u62BD\u51FA\u9805\u76EE:
- \u7533\u8FBC\u8005\u4F01\u696D\u540D
- \u652F\u6255\u8005\u4F01\u696D\u540D  
- \u8ACB\u6C42\u66F8\u5408\u8A08\u91D1\u984D

\u26A0\uFE0F \u6570\u5B57\u3092\u6B63\u78BA\u306B\u8AAD\u307F\u53D6\u3063\u3066\u304F\u3060\u3055\u3044\u3002`;
      console.log(`\u{1F4C4} \u30D5\u30A1\u30A4\u30EB\u5F62\u5F0F: ${filesToProcess[0]?.contentType}`);
      const result = await generateObject({
        model: anthropic("claude-3-5-sonnet-20241022"),
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
          requestorCompany: z.string(),
          payerCompany: z.string(),
          totalAmount: z.number()
        }),
        mode: "json",
        temperature: 0
      });
      const requestorMatch = result.object.requestorCompany === requestorCompany ? "match" : "mismatch";
      const payerMatch = result.object.payerCompany === payerCompany ? "match" : "mismatch";
      const amountMatch = result.object.totalAmount === totalDebtAmount ? "match" : "mismatch";
      return {
        success: true,
        verification: {
          requestorMatch,
          payerMatch,
          amountMatch
        },
        extracted: {
          requestorCompany: result.object.requestorCompany,
          payerCompany: result.object.payerCompany,
          totalAmount: result.object.totalAmount
        },
        expected: {
          requestorCompany,
          payerCompany,
          totalAmount: totalDebtAmount
        },
        summary: `\u7533\u8FBC\u8005:${requestorMatch}, \u652F\u6255\u8005:${payerMatch}, \u91D1\u984D:${amountMatch}`
      };
    } catch (error) {
      console.error("\u274C OCR Simple \u30A8\u30E9\u30FC\u8A73\u7D30:", error);
      return {
        success: false,
        verification: {
          requestorMatch: "not_found",
          payerMatch: "not_found",
          amountMatch: "not_found"
        },
        extracted: {},
        expected: {
          requestorCompany: "",
          payerCompany: "",
          totalAmount: 0
        },
        summary: `OCR\u51E6\u7406\u4E2D\u306B\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F: ${error instanceof Error ? error.message : "Unknown error"}`
      };
    }
  }
});

export { ocrPurchaseSimpleTool };
