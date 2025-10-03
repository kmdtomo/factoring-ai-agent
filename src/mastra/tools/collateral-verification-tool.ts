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

export const collateralVerificationTool = createTool({
  id: "collateral-verification",
  description: "担保謄本のOCR結果とKintone担保データを照合し、買取企業との関係も確認",
  
  inputSchema: z.object({
    recordId: z.string().describe("KintoneレコードID"),
    collateralDocuments: z.array(z.object({
      fileName: z.string(),
      text: z.string(),
      pageCount: z.number(),
      confidence: z.number(),
    })).describe("Google Vision OCRで抽出した担保書類データ"),
    purchaseCompanies: z.array(z.string()).optional().describe("買取企業名リスト（関係性確認用）"),
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
    collateralInfo: z.object({
      companies: z.array(z.object({
        name: z.string().describe("担保企業名"),
        registrationNumber: z.string().optional().describe("法人番号"),
        capital: z.number().optional().describe("資本金"),
        establishedDate: z.string().optional().describe("設立年月日"),
        representatives: z.array(z.string()).optional().describe("代表者名"),
        address: z.string().optional().describe("本店所在地"),
        businessType: z.string().optional().describe("事業内容"),
      })),
      totalCompanies: z.number().describe("担保企業の総数"),
      totalCapital: z.number().optional().describe("担保企業の資本金合計"),
    }),
    relationshipAnalysis: z.object({
      purchaseCollateralMatch: z.boolean().describe("買取企業と担保企業の一致"),
      matchedCompanies: z.array(z.string()).describe("一致した企業名"),
      unmatchedPurchaseCompanies: z.array(z.string()).describe("担保がない買取企業"),
      additionalCollaterals: z.array(z.string()).describe("買取以外の担保企業"),
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
    const { recordId, collateralDocuments, purchaseCompanies = [], model } = context;
    
    try {
      // 1. Kintoneから担保情報を取得
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
      const collateralInfo = record.担保情報?.value || [];
      
      // Kintoneデータの整形
      const kintoneCollaterals = collateralInfo.map((item: any) => ({
        company: item.value?.会社名_担保?.value || "",
        registrationNumber: item.value?.法人番号_担保?.value || "",
        capital: parseInt(item.value?.資本金_担保?.value || "0"),
        establishedDate: item.value?.設立年月日_担保?.value || "",
        representatives: (item.value?.代表者名_担保?.value || "").split(/[、,]/),
        address: item.value?.本店所在地_担保?.value || "",
      }));
      
      // 2. OCRテキストを結合
      const combinedText = collateralDocuments
        .map(doc => `【${doc.fileName}】\n${doc.text}`)
        .join("\n\n---\n\n");
      
      // 3. AIプロバイダーの選択
      const aiModel = model === "claude-3-5-sonnet-20241022" 
        ? anthropic("claude-3-5-sonnet-20241022")
        : openai(model);
      
      // 4. AI分析の実行
      const analysisPrompt = `
あなたは担保謄本の分析専門家です。以下のOCRで抽出した謄本データとKintoneの登録データを照合し、事実のみを抽出してください。

【OCRで抽出した謄本データ】
${combinedText}

【Kintoneに登録されている担保情報】
${kintoneCollaterals.map((c: any, i: number) => 
  `${i+1}. ${c.company}
   - 法人番号: ${c.registrationNumber}
   - 資本金: ${c.capital.toLocaleString()}円
   - 設立日: ${c.establishedDate}
   - 代表者: ${c.representatives.join(', ')}
   - 本店: ${c.address}`
).join('\n\n')}

【買取企業リスト（関係性確認用）】
${purchaseCompanies.join(', ')}

【分析タスク】
1. OCRデータから担保企業情報を抽出
2. Kintoneデータとの照合
3. 買取企業と担保企業の一致/不一致を確認

【重要】
- 会社名は表記ゆれを考慮（株式会社/（株）など）
- 資本金は数値の近似も考慮
- 事実のみを報告し、リスク評価は行わない
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
  "companies": [
    {
      "name": "会社名",
      "registrationNumber": "法人番号",
      "capital": 資本金（数値）,
      "establishedDate": "設立年月日",
      "representatives": ["代表者1", "代表者2"],
      "address": "本店所在地",
      "businessType": "事業内容"
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
  "totalCompanies": 担保企業数,
  "hasMultipleCollaterals": true/false,
  "purchaseCollateralMatch": true/false,
  "matchedCompanies": ["一致した企業名"],
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
          companies: [],
          verificationResults: { 総合評価: "不一致", 詳細: [] },
          totalCompanies: 0,
          hasMultipleCollaterals: false,
          purchaseCollateralMatch: false,
          matchedCompanies: [],
          keyFindings: ["データ抽出に失敗しました"],
        };
      }
      
      // 6. 関係性分析
      const matchedCompanies = structuredData.matchedCompanies || [];
      const collateralCompanyNames = (structuredData.companies || []).map((c: any) => c.name);
      const unmatchedPurchase = purchaseCompanies.filter(pc => 
        !matchedCompanies.some((mc: string) => mc.includes(pc) || pc.includes(mc))
      );
      const additionalCollaterals = collateralCompanyNames.filter((cc: string) => 
        !purchaseCompanies.some(pc => cc.includes(pc) || pc.includes(cc))
      );
      
      // 7. コスト計算
      const ocrCost = collateralDocuments.reduce((sum, doc) => 
        sum + (doc.pageCount * 0.0015), 0);
      const analysisCost = 0.01; // 分析コスト（推定）
      
      // 8. 既存OCRツールと同じ形式で出力
      return {
        success: true,
        summary: `担保謄本${collateralDocuments.length}件を分析しました。${structuredData.verificationResults?.総合評価 || "照合完了"}。担保企業: ${structuredData.totalCompanies || structuredData.companies?.length || 0}社。`,
        metadata: {
          recordId,
          documentCount: collateralDocuments.length,
          verificationResults: structuredData.verificationResults || {
            総合評価: "不明" as const,
            詳細: [],
          },
        },
        collateralInfo: {
          companies: structuredData.companies || [],
          totalCompanies: structuredData.totalCompanies || (structuredData.companies || []).length,
          totalCapital: (structuredData.companies || []).reduce((sum: number, c: any) => 
            sum + (c.capital || 0), 0),
        },
        relationshipAnalysis: {
          purchaseCollateralMatch: structuredData.purchaseCollateralMatch || false,
          matchedCompanies: matchedCompanies,
          unmatchedPurchaseCompanies: unmatchedPurchase,
          additionalCollaterals: additionalCollaterals,
        },
        analysisDetails: {
          extractedText: combinedText.substring(0, 500) + "...",
          keyFindings: structuredData.keyFindings || [],
          confidence: collateralDocuments[0]?.confidence || 0.9,
        },
        costInfo: {
          ocrCost,
          analysisCost,
          totalCost: ocrCost + analysisCost,
        },
      };
      
    } catch (error: any) {
      console.error("[担保情報照合] エラー:", error);
      
      return {
        success: false,
        summary: `担保情報の照合中にエラーが発生しました: ${error.message}`,
        metadata: {
          recordId,
          documentCount: collateralDocuments.length,
          verificationResults: {
            総合評価: "不一致" as const,
            詳細: [],
          },
        },
        collateralInfo: {
          companies: [],
          totalCompanies: 0,
          totalCapital: 0,
        },
        relationshipAnalysis: {
          purchaseCollateralMatch: false,
          matchedCompanies: [],
          unmatchedPurchaseCompanies: purchaseCompanies,
          additionalCollaterals: [],
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