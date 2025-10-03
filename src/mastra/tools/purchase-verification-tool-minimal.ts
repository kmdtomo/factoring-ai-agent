import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import axios from "axios";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";

// 環境変数から設定を取得する関数
const getEnvConfig = () => ({
  KINTONE_DOMAIN: process.env.KINTONE_DOMAIN || "",
  KINTONE_API_TOKEN: process.env.KINTONE_API_TOKEN || "",
  APP_ID: process.env.KINTONE_APP_ID || "37"
});

export const purchaseVerificationToolMinimal = createTool({
  id: "purchase-verification-minimal",
  description: "買取請求書のOCR結果とKintone買取データを照合（最小版）",
  
  inputSchema: z.object({
    recordId: z.string().describe("KintoneレコードID"),
    purchaseDocuments: z.array(z.object({
      fileName: z.string(),
      text: z.string(),
      pageCount: z.number(),
      confidence: z.number(),
    })).describe("Google Vision OCRで抽出した買取書類データ"),
    model: z.string().optional().default("claude-3-5-sonnet-20241022"),
  }),
  
  outputSchema: z.object({
    success: z.boolean(),
    summary: z.string(),
    metadata: z.object({
      recordId: z.string(),
      documentCount: z.number(),
      verificationResults: z.object({
        総合評価: z.enum(["一致", "部分一致", "不一致"]),
        詳細: z.array(z.object({
          項目: z.string(),
          OCR値: z.string(),
          Kintone値: z.string(),
          判定: z.enum(["一致", "不一致"]),
        })),
      }),
    }),
    purchaseInfo: z.object({
      totalAmount: z.number().describe("総債権額"),
      debtorCompanies: z.array(z.object({
        name: z.string().describe("第三債務者名"),
        amount: z.number().describe("請求額"),
        dueDate: z.string().optional().describe("支払期日"),
        invoiceNumber: z.string().optional().describe("請求書番号"),
      })),
      paymentTerms: z.string().optional().describe("支払条件"),
      applicantCompany: z.string().describe("申込者企業名"),
    }),
    analysisDetails: z.object({
      extractedText: z.string().describe("抽出されたテキスト（要約）"),
      keyFindings: z.array(z.string()).describe("重要な発見事項"),
      confidence: z.number().describe("分析の信頼度"),
    }),
    costInfo: z.object({
      ocrCost: z.number(),
      analysisCost: z.number(),
      totalCost: z.number(),
    }),
  }),
  
  execute: async ({ context }) => {
    const { recordId, purchaseDocuments, model } = context;
    console.log(`[購入検証-最小] 開始 - recordId: ${recordId}`);
    
    try {
      // 1. Kintoneから買取情報を取得
      const config = getEnvConfig();
      const recordUrl = `https://${config.KINTONE_DOMAIN}/k/v1/records.json?app=${config.APP_ID}&query=$id="${recordId}"`;
      
      const recordResponse = await axios.get(recordUrl, {
        headers: {
          "X-Cybozu-API-Token": config.KINTONE_API_TOKEN,
        },
      });
      
      if (recordResponse.data.records.length === 0) {
        throw new Error(`レコードID: ${recordId} が見つかりません`);
      }
      
      const record = recordResponse.data.records[0];
      const buyInfo = record.買取情報?.value || [];
      
      // Kintoneデータの整形
      const kintoneData = {
        purchases: buyInfo.map((item: any) => ({
          company: item.value?.会社名_第三債務者_買取?.value || "",
          amount: parseInt(item.value?.総債権額?.value || "0"),
        })),
        applicant: record.屋号?.value || record.会社名?.value || "",
        totalAmount: buyInfo.reduce((sum: number, item: any) => 
          sum + parseInt(item.value?.総債権額?.value || "0"), 0),
      };
      
      console.log(`[購入検証-最小] Kintoneデータ取得完了 - 買取情報: ${kintoneData.purchases.length}件`);
      
      // 2. OCRテキストを結合
      const combinedText = purchaseDocuments
        .map(doc => `【${doc.fileName}】\n${doc.text}`)
        .join("\n\n---\n\n");
      
      // 3. 超シンプルなプロンプト
      const analysisPrompt = `企業名と金額を抽出して比較。JSONで返答: {"match": "yes/no", "companies": [{"name": "企業名", "amount": 数値}]}

OCR: ${combinedText.substring(0, 500)}
Kintone: ${kintoneData.purchases.map(p => `${p.company}=${p.amount}`).join(', ')}`;

      console.log(`[購入検証-最小] AI分析開始`);
      const startTime = Date.now();
      
      const result = await generateText({
        model: anthropic(model),
        prompt: analysisPrompt,
        temperature: 0,
      });
      
      const analysisTime = Date.now() - startTime;
      console.log(`[購入検証-最小] AI分析完了 - 処理時間: ${analysisTime}ms`);
      
      // 4. 結果の解析（超シンプル）
      let match = "no";
      let companies: any[] = [];
      
      try {
        const jsonMatch = result.text?.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          match = parsed.match || "no";
          companies = parsed.companies || [];
        }
      } catch (e) {}
      
      // 5. コスト計算
      const ocrCost = purchaseDocuments.reduce((sum, doc) => 
        sum + (doc.pageCount * 0.0015), 0);
      const analysisCost = 0.003;
      
      // 6. 結果を返す（必要最小限のデータ）
      return {
        success: true,
        summary: `照合結果: ${match === "yes" ? "一致" : match === "partial" ? "部分一致" : "不一致"}`,
        metadata: {
          recordId,
          documentCount: purchaseDocuments.length,
          verificationResults: {
            総合評価: match === "yes" ? "一致" : match === "partial" ? "部分一致" : "不一致",
            詳細: [],
          },
        },
        purchaseInfo: {
          totalAmount: kintoneData.totalAmount,
          debtorCompanies: companies.map((c: any) => ({
            name: c.name || "",
            amount: c.amount || 0,
            dueDate: "",
            invoiceNumber: "",
          })),
          paymentTerms: "",
          applicantCompany: kintoneData.applicant,
        },
        analysisDetails: {
          extractedText: combinedText.substring(0, 200) + "...",
          keyFindings: [],
          confidence: 0.9,
        },
        costInfo: {
          ocrCost,
          analysisCost,
          totalCost: ocrCost + analysisCost,
        },
      };
      
    } catch (error: any) {
      console.error("[購入検証-最小] エラー:", error.message);
      
      return {
        success: false,
        summary: `エラー: ${error.message}`,
        metadata: {
          recordId,
          documentCount: purchaseDocuments.length,
          verificationResults: {
            総合評価: "不一致" as const,
            詳細: [],
          },
        },
        purchaseInfo: {
          totalAmount: 0,
          debtorCompanies: [],
          applicantCompany: "",
        },
        analysisDetails: {
          extractedText: "",
          keyFindings: [error.message],
          confidence: 0,
        },
        costInfo: {
          ocrCost: 0,
          analysisCost: 0,
          totalCost: 0,
        },
      };
    }
  },
});