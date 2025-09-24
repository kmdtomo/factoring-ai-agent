import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { phase1aOcrHeavyAgent } from "../agents/phase1a-ocr-heavy-agent";
import { phase1bOcrLightAgent } from "../agents/phase1b-ocr-light-agent";
import { phase2ResearchAgent } from "../agents/phase2-research-agent";
import { phase3AnalysisAgent } from "../agents/phase3-analysis-agent";

// Phase 1A: 重い画像OCR処理ステップ
const phase1aStep = createStep({
  id: "phase1a-heavy-ocr",
  description: "重い画像OCR処理（請求書・通帳）",
  inputSchema: z.object({
    recordId: z.string(),
  }),
  outputSchema: z.object({
    recordId: z.string(),
    ocrHeavyResults: z.string(),
  }),
  execute: async ({ inputData }) => {
    const { recordId } = inputData;
    
    console.log(`[Phase 1A] 重い画像OCR処理開始 - recordId: ${recordId}`);
    
    const response = await phase1aOcrHeavyAgent.generateVNext(
      [{ role: "user", content: `recordId: ${recordId} の重い画像OCR処理（請求書・メイン通帳・個人口座）を実行してください。` }],
      { 
        format: "mastra",
        threadId: `phase1a-${recordId}-${Date.now()}` // 独立したスレッド
      }
    );
    
    console.log(`[Phase 1A] 完了`);
    
    return {
      recordId,
      ocrHeavyResults: response.text,
    };
  },
});

// レート制限待機ステップ
const waitForRateLimitStep = createStep({
  id: "wait-for-rate-limit",
  description: "レート制限回避のための待機",
  inputSchema: z.object({
    recordId: z.string(),
    ocrHeavyResults: z.string(),
  }),
  outputSchema: z.object({
    recordId: z.string(),
    ocrHeavyResults: z.string(),
  }),
  execute: async ({ inputData }) => {
    const waitTime = 25; // 25秒待機（余裕を持って）
    console.log(`[Workflow] レート制限回避のため${waitTime}秒待機中...`);
    console.log(`[Workflow] 待機開始: ${new Date().toISOString()}`);
    
    await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
    
    console.log(`[Workflow] 待機完了: ${new Date().toISOString()}`);
    
    return inputData; // 入力をそのまま返す
  },
});

// Phase 1B: 軽量OCR処理ステップ
const phase1bStep = createStep({
  id: "phase1b-light-ocr",
  description: "軽量OCR処理（本人確認・登記簿）",
  inputSchema: z.object({
    recordId: z.string(),
    ocrHeavyResults: z.string(),
  }),
  outputSchema: z.object({
    recordId: z.string(),
    ocrHeavyResults: z.string(),
    ocrLightResults: z.string(),
  }),
  execute: async ({ inputData }) => {
    const { recordId, ocrHeavyResults } = inputData;
    
    console.log(`[Phase 1B] 軽量OCR処理開始 - recordId: ${recordId}`);
    
    // リトライ処理を追加
    let retries = 0;
    let response;
    while (retries < 3) {
      try {
        response = await phase1bOcrLightAgent.generateVNext(
          [{ role: "user", content: `recordId: ${recordId} の軽量OCR処理（本人確認・登記簿）を実行してください。` }],
          { 
            format: "mastra",
            threadId: `phase1b-${recordId}-${Date.now()}` // 独立したスレッド
          }
        );
        break; // 成功したらループを抜ける
      } catch (error: any) {
        if (error.statusCode === 429 && retries < 2) {
          const waitTime = parseInt(error.responseHeaders?.['retry-after'] || '20');
          console.log(`[Phase 1B] レート制限エラー。${waitTime}秒待機中... (リトライ ${retries + 1}/3)`);
          await new Promise(r => setTimeout(r, waitTime * 1000));
          retries++;
        } else {
          throw error; // その他のエラーまたは最大リトライ回数に達した
        }
      }
    }
    
    console.log(`[Phase 1B] 完了`);
    
    return {
      recordId,
      ocrHeavyResults, // Phase1Aの結果を引き継ぐ
      ocrLightResults: response!.text,
    };
  },
});

// Phase 2: 外部調査ステップ
const phase2Step = createStep({
  id: "phase2-external-research",
  description: "外部調査（詐欺情報・企業実在性）",
  inputSchema: z.object({
    recordId: z.string(),
    ocrHeavyResults: z.string(),
    ocrLightResults: z.string(),
  }),
  outputSchema: z.object({
    recordId: z.string(),
    ocrHeavyResults: z.string(),
    ocrLightResults: z.string(),
    phase2Results: z.string(),
  }),
  execute: async ({ inputData }) => {
    const { recordId, ocrHeavyResults, ocrLightResults } = inputData;
    
    console.log(`[Phase 2] 外部調査開始 - recordId: ${recordId}`);
    
    // リトライ処理を追加
    let retries = 0;
    let response;
    while (retries < 3) {
      try {
        response = await phase2ResearchAgent.generateVNext(
          [{ role: "user", content: `recordId: ${recordId} の信用調査を実行してください。` }],
          { 
            format: "mastra",
            threadId: `phase2-${recordId}-${Date.now()}` // 独立したスレッド
          }
        );
        break; // 成功したらループを抜ける
      } catch (error: any) {
        if (error.statusCode === 429 && retries < 2) {
          const waitTime = parseInt(error.responseHeaders?.['retry-after'] || '20');
          console.log(`[Phase 2] レート制限エラー。${waitTime}秒待機中... (リトライ ${retries + 1}/3)`);
          await new Promise(r => setTimeout(r, waitTime * 1000));
          retries++;
        } else {
          throw error; // その他のエラーまたは最大リトライ回数に達した
        }
      }
    }
    
    console.log(`[Phase 2] 完了`);
    
    return {
      recordId,
      ocrHeavyResults, // 引き継ぎ
      ocrLightResults, // 引き継ぎ
      phase2Results: response!.text,
    };
  },
});

// Phase 3: 最終分析ステップ
const phase3Step = createStep({
  id: "phase3-final-analysis",
  description: "最終分析とレポート生成",
  inputSchema: z.object({
    recordId: z.string(),
    ocrHeavyResults: z.string(),
    ocrLightResults: z.string(),
    phase2Results: z.string(),
  }),
  outputSchema: z.object({
    finalReport: z.string(),
    recommendation: z.string(),
  }),
  execute: async ({ inputData }) => {
    const { recordId, ocrHeavyResults, ocrLightResults, phase2Results } = inputData;
    
    console.log(`[Phase 3] 最終分析開始 - recordId: ${recordId}`);
    
    // Phase 3エージェントに全データを渡して分析
    const prompt = `
recordId: ${recordId} の最終分析レポートを作成してください。

【重要】
1. まずkintoneFetchToolを使用してrecordId: ${recordId}から全Kintoneデータを取得してください
2. 取得したKintoneデータとPhase 1/2の結果を統合して分析してください

=== Phase 1A: 重い画像OCR処理結果 ===
${ocrHeavyResults}

=== Phase 1B: 軽量OCR処理結果 ===
${ocrLightResults}

=== Phase 2: 外部調査結果 ===
${phase2Results}

【レポート作成要件】
上記のinstructionsに従って、構造化されたレポートを生成してください。
`;
    
    const response = await phase3AnalysisAgent.generateVNext(
      [{ role: "user", content: prompt }],
      {}
    );
    
    console.log(`[Phase 3] 完了`);
    
    // 推奨事項を抽出（簡易版）
    let recommendation = "条件付き承認";
    if (response.text.includes("承認") && !response.text.includes("条件付き")) {
      recommendation = "承認";
    } else if (response.text.includes("再検討")) {
      recommendation = "再検討";
    }
    
    return {
      finalReport: response.text,
      recommendation,
    };
  },
});

// エージェントベース・コンプライアンスワークフロー
export const agentBasedComplianceWorkflow = createWorkflow({
  id: "agent-based-compliance-workflow",
  description: "エージェントベースのコンプライアンス審査ワークフロー",
  inputSchema: z.object({
    recordId: z.string().describe("KintoneレコードID"),
  }),
  outputSchema: z.object({
    finalReport: z.string().describe("最終分析レポート"),
    recommendation: z.string().describe("推奨判定"),
  }),
})
.then(phase1aStep)
.then(phase1bStep)
.then(phase2Step)
.then(phase3Step)
.commit();