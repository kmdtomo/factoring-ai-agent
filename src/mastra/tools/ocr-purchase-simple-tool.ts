import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import axios from "axios";

// シンプルな買取書類OCRツール（事実ベース）
export const ocrPurchaseSimpleTool = createTool({
  id: "ocr-purchase-simple",
  description: "買取関連書類から事実情報を抽出（申込者企業・支払者企業・総債権額を照合）",
  inputSchema: z.object({
    recordId: z.string().describe("KintoneレコードID"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    verification: z.object({
      requestorMatch: z.enum(["match", "mismatch", "not_found"]),
      payerMatch: z.enum(["match", "mismatch", "not_found"]),
      amountMatch: z.enum(["match", "mismatch", "not_found"]),
    }),
    extracted: z.object({
      requestorCompany: z.string().optional(),
      payerCompany: z.string().optional(),
      totalAmount: z.number().optional(),
    }),
    expected: z.object({
      requestorCompany: z.string(),
      payerCompany: z.string(),
      totalAmount: z.number(),
    }),
    summary: z.string(),
  }),
  
  execute: async ({ context }) => {
    const { recordId } = context;
    const domain = process.env.KINTONE_DOMAIN;
    const apiToken = process.env.KINTONE_API_TOKEN;
    
    if (!domain || !apiToken) {
      throw new Error("Kintone環境変数が設定されていません");
    }
    
    try {
      // レコード情報を取得
      const fileUrl = `https://${domain}/k/v1/records.json?app=37&query=$id="${recordId}"`;
      const recordResponse = await axios.get(fileUrl, {
        headers: { 'X-Cybozu-API-Token': apiToken },
      });
      
      if (recordResponse.data.records.length === 0) {
        throw new Error(`レコードID: ${recordId} が見つかりません`);
      }
      
      const record = recordResponse.data.records[0];
      const purchaseFiles = record.成因証書＿添付ファイル?.value || [];
      
      // 期待値を取得
      console.log(`🔍 買取情報件数: ${record.買取情報?.value?.length || 0}`);
      console.log(`🔍 屋号フィールド: ${record.屋号?.value || "なし"}`);
      
      const buyInfo = record.買取情報?.value || [];
      if (buyInfo.length > 0) {
        console.log(`🔍 第1件目の会社名: ${buyInfo[0]?.value?.会社名_第三債務者_買取?.value || "なし"}`);
        console.log(`🔍 第1件目の総債権額: ${buyInfo[0]?.value?.総債権額?.value || "なし"}`);
      }
      
      const totalDebtAmount = parseInt(buyInfo[0]?.value?.総債権額?.value || "0");
      const requestorCompany = buyInfo[0]?.value?.会社名_第三債務者_買取?.value || "";
      const payerCompany = record.屋号?.value || "";
      
      console.log(`📋 最終期待値: 申込者=${requestorCompany}, 支払者=${payerCompany}, 総額=${totalDebtAmount}`);
      
      if (purchaseFiles.length === 0) {
        return {
          success: false,
          verification: {
            requestorMatch: "not_found" as const,
            payerMatch: "not_found" as const,
            amountMatch: "not_found" as const,
          },
          extracted: {},
          expected: {
            requestorCompany,
            payerCompany,
            totalAmount: totalDebtAmount,
          },
          summary: "成因証書が添付されていません",
        };
      }

      // 上位3ファイルを処理
      const filesToProcess = purchaseFiles.slice(0, 3);
      
      // ファイルをダウンロード
      const base64Images = [];
      for (const file of filesToProcess) {
        const downloadUrl = `https://${domain}/k/v1/file.json?fileKey=${file.fileKey}`;
        const fileResponse = await axios.get(downloadUrl, {
          headers: { 'X-Cybozu-API-Token': apiToken },
          responseType: 'arraybuffer',
        });
        const base64Content = Buffer.from(fileResponse.data).toString('base64');
        const isPDF = file.contentType === 'application/pdf';
        const dataUrl = isPDF 
          ? `data:application/pdf;base64,${base64Content}`
          : `data:${file.contentType};base64,${base64Content}`;
        
        base64Images.push({
          type: "image" as const,
          image: dataUrl,
        });
      }

      const prompt = `この書類から以下を抽出してください：

申込者企業（請求元）: ${requestorCompany}
支払者企業（請求先）: ${payerCompany}  
総債権額: ${totalDebtAmount.toLocaleString()}円

抽出項目:
- 申込者企業名
- 支払者企業名  
- 請求書合計金額

⚠️ 数字を正確に読み取ってください。`;
      
      
      console.log(`📄 ファイル形式: ${filesToProcess[0]?.contentType}`);
      
      const result = await generateObject({
        model: anthropic("claude-3-5-sonnet-20241022") as any,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              ...base64Images,
            ],
          },
        ],
        schema: z.object({
          requestorCompany: z.string(),
          payerCompany: z.string(),
          totalAmount: z.number(),
        }),
        mode: "json",
        temperature: 0,
      });

      // 照合結果を計算
      const requestorMatch = result.object.requestorCompany === requestorCompany ? "match" : "mismatch";
      const payerMatch = result.object.payerCompany === payerCompany ? "match" : "mismatch";
      const amountMatch = result.object.totalAmount === totalDebtAmount ? "match" : "mismatch";

      return {
        success: true,
        verification: {
          requestorMatch: requestorMatch as "match" | "mismatch" | "not_found",
          payerMatch: payerMatch as "match" | "mismatch" | "not_found",
          amountMatch: amountMatch as "match" | "mismatch" | "not_found",
        },
        extracted: {
          requestorCompany: result.object.requestorCompany,
          payerCompany: result.object.payerCompany,
          totalAmount: result.object.totalAmount,
        },
        expected: {
          requestorCompany,
          payerCompany,
          totalAmount: totalDebtAmount,
        },
        summary: `申込者:${requestorMatch}, 支払者:${payerMatch}, 金額:${amountMatch}`,
      };

    } catch (error) {
      console.error("❌ OCR Simple エラー詳細:", error);
      return {
        success: false,
        verification: {
          requestorMatch: "not_found" as const,
          payerMatch: "not_found" as const,
          amountMatch: "not_found" as const,
        },
        extracted: {},
        expected: {
          requestorCompany: "",
          payerCompany: "",
          totalAmount: 0,
        },
        summary: `OCR処理中にエラーが発生しました: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
});
