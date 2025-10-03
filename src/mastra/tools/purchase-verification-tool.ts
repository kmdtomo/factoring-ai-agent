import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import axios from "axios";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";

// 環境変数から設定を取得する関数
const getEnvConfig = () => ({
  KINTONE_DOMAIN: process.env.KINTONE_DOMAIN || "",
  KINTONE_API_TOKEN: process.env.KINTONE_API_TOKEN || "",
  APP_ID: process.env.KINTONE_APP_ID || "37"
});

export const purchaseVerificationTool = createTool({
  id: "purchase-verification",
  description: "買取請求書のOCR結果とKintone買取データを照合し、既存OCRツールと同じ形式で出力",
  
  inputSchema: z.object({
    recordId: z.string().describe("KintoneレコードID"),
    purchaseDocuments: z.array(z.object({
      fileName: z.string(),
      text: z.string(),
      pageCount: z.number(),
      confidence: z.number(),
    })).describe("Google Vision OCRで抽出した買取書類データ"),
    model: z.enum(["gpt-4.1-2025-04-14", "gpt-4.1-mini-2025-04-14", "gpt-4", "gpt-4-turbo-preview", "gpt-4o", "gpt-4o-mini", "claude-3-5-sonnet-20241022"]).optional().default("gpt-4.1-2025-04-14"),
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
          purchaseAmount: parseInt(item.value?.買取額?.value || "0"),
          paymentDate: item.value?.買取債権支払日?.value || "",
        })),
        applicant: record.屋号?.value || record.会社名?.value || "",
        totalAmount: buyInfo.reduce((sum: number, item: any) => 
          sum + parseInt(item.value?.総債権額?.value || "0"), 0),
      };
      
      // 2. OCRテキストを結合
      const combinedText = purchaseDocuments
        .map(doc => `【${doc.fileName}】\n${doc.text}`)
        .join("\n\n---\n\n");
      
      // 3. AIプロバイダーの選択
      const aiModel = model === "claude-3-5-sonnet-20241022" 
        ? anthropic("claude-3-5-sonnet-20241022")
        : openai(model);
      
      // 4. AI分析の実行
      const analysisPrompt = `
あなたは買取請求書の分析専門家です。以下のOCRで抽出した請求書データとKintoneの登録データを照合し、分析してください。

【OCRで抽出した請求書データ】
${combinedText}

【Kintoneに登録されている買取情報】
申込者: ${kintoneData.applicant}
総債権額（合計）: ${kintoneData.totalAmount.toLocaleString()}円
買取情報:
${kintoneData.purchases.map((p, i) => 
  `${i+1}. ${p.company} - 債権額: ${p.amount.toLocaleString()}円, 買取額: ${p.purchaseAmount.toLocaleString()}円, 支払日: ${p.paymentDate}`
).join('\n')}

【分析タスク】
1. OCRデータから買取情報を抽出
2. Kintoneデータとの照合
3. 一致/不一致の判定

【重要】
- 金額は完全一致を求めず、近似値も考慮
- 会社名は表記ゆれを考慮（株式会社/（株）など）
- 日付フォーマットの違いも考慮
`;

      const result = await generateText({
        model: aiModel,
        prompt: analysisPrompt,
        temperature: 0.1,
      });
      
      const analysisText = result.text || "";
      
      // 5. 分析結果から構造化データを抽出
      const extractionPrompt = `
以下の分析結果から、JSON形式で構造化データを抽出してください。

${analysisText}

以下の形式で出力してください：
{
  "debtorCompanies": [
    {
      "name": "会社名",
      "amount": 金額（数値）,
      "dueDate": "支払期日",
      "invoiceNumber": "請求書番号"
    }
  ],
  "verificationResults": {
    "総合評価": "一致/部分一致/不一致",
    "詳細": [
      {
        "項目": "項目名",
        "OCR値": "OCRで抽出した値",
        "Kintone値": "Kintoneの値",
        "判定": "一致/不一致"
      }
    ]
  },
  "keyFindings": ["重要な発見事項1", "重要な発見事項2"]
}
`;

      const extractionResult = await generateText({
        model: aiModel,
        prompt: extractionPrompt,
        temperature: 0,
      });
      
      let structuredData;
      try {
        // JSON部分を抽出
        const jsonMatch = extractionResult.text?.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          structuredData = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        console.error("JSON解析エラー:", e);
        structuredData = {
          debtorCompanies: [],
          verificationResults: { 総合評価: "不一致", 詳細: [] },
          keyFindings: ["データ抽出に失敗しました"],
        };
      }
      
      // 6. コスト計算
      const ocrCost = purchaseDocuments.reduce((sum, doc) => 
        sum + (doc.pageCount * 0.0015), 0);
      const analysisCost = 0.01; // 分析コスト（推定）
      
      // 7. 既存OCRツールと同じ形式で出力
      return {
        success: true,
        summary: `買取請求書${purchaseDocuments.length}件を分析しました。${structuredData.verificationResults?.総合評価 || "照合完了"}。`,
        metadata: {
          recordId,
          documentCount: purchaseDocuments.length,
          verificationResults: structuredData.verificationResults || {
            総合評価: "不明",
            詳細: [],
          },
        },
        purchaseInfo: {
          totalAmount: kintoneData.totalAmount,
          debtorCompanies: structuredData.debtorCompanies || [],
          paymentTerms: "請求書記載の条件による",
          applicantCompany: kintoneData.applicant,
        },
        analysisDetails: {
          extractedText: combinedText.substring(0, 500) + "...",
          keyFindings: structuredData.keyFindings || [],
          confidence: purchaseDocuments[0]?.confidence || 0.9,
        },
        costInfo: {
          ocrCost,
          analysisCost,
          totalCost: ocrCost + analysisCost,
        },
      };
      
    } catch (error: any) {
      console.error("[買取情報照合] エラー:", error);
      
      return {
        success: false,
        summary: `買取情報の照合中にエラーが発生しました: ${error.message}`,
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
          keyFindings: [],
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