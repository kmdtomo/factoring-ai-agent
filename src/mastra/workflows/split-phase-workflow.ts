import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { phase1aOcrHeavyAgent } from "../agents/phase1a-ocr-heavy-agent";
import { phase1bOcrLightAgent } from "../agents/phase1b-ocr-light-agent";
import { phase2ResearchAgent } from "../agents/phase2-research-agent";
import { phase3AnalysisAgent } from "../agents/phase3-analysis-agent";

// 統合ステップ - 4つのAgentを順次実行
const splitPhaseStep = createStep({
  id: "split-phase-execution",
  description: "Split-Phase実行: 4つのAgentを順次実行（処理負荷分散）",
  inputSchema: z.object({
    recordId: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    phase1aResults: z.any(),
    phase1bResults: z.any(),
    phase2Results: z.any(),
    phase3Results: z.any(),
    summary: z.string(),
  }),
  execute: async ({ inputData }) => {
    const { recordId } = inputData;
    
    try {
      console.log(`🚀 [Split-Phase] 開始 - Record: ${recordId}`);
      
      // Phase 1A: 重い画像OCR処理
      console.log(`🔥 [Phase1A] 重い画像OCR処理開始`);
      const phase1aResponse = await phase1aOcrHeavyAgent.generate(
        `recordId: ${recordId} の重い画像OCR処理（請求書・メイン通帳・個人口座）を実行してください。`,
        {}
      );
      console.log(`✅ [Phase1A] 完了`);
      
      // Phase 1B: 軽量OCR処理
      console.log(`🔥 [Phase1B] 軽量OCR処理開始`);
      const phase1bResponse = await phase1bOcrLightAgent.generate(
        `recordId: ${recordId} の軽量OCR処理（本人確認・登記簿）を実行してください。Phase1Aの結果を参考にしてください。`,
        {}
      );
      console.log(`✅ [Phase1B] 完了`);
      
      // Phase 2: 調査・検証処理
      console.log(`🔥 [Phase2] 調査・検証処理開始`);
      const phase2Response = await phase2ResearchAgent.generate(
        `recordId: ${recordId} の調査・検証（エゴサーチ・企業確認・支払分析）を実行してください。`,
        {}
      );
      console.log(`✅ [Phase2] 完了`);
      
      // Phase 3: 最終分析・レポート生成
      console.log(`🔥 [Phase3] 最終分析・レポート生成開始`);
      const phase3Response = await phase3AnalysisAgent.generate(
        `recordId: ${recordId} の最終分析・レポート生成を実行してください。前フェーズの結果を統合して包括的なレポートを作成してください。`,
        {}
      );
      console.log(`✅ [Phase3] 完了`);

      console.log(`🎉 [Split-Phase] 全4フェーズ完了`);
      
      return {
        success: true,
        phase1aResults: phase1aResponse,
        phase1bResults: phase1bResponse,
        phase2Results: phase2Response,
        phase3Results: phase3Response,
        summary: `Split-Phase完了: 4つのAgent（Phase1A→Phase1B→Phase2→Phase3）を順次実行し、処理負荷を分散`,
      };
      
    } catch (error) {
      console.error("❌ [Split-Phase] エラー:", error);
      return {
        success: false,
        phase1aResults: null,
        phase1bResults: null,
        phase2Results: null,
        phase3Results: null,
        summary: "Split-Phase失敗: エージェント実行中にエラー",
      };
    }
  },
});

// Split-Phase対応マルチエージェントワークフロー
export const splitPhaseWorkflow = createWorkflow({
  id: "split-phase-compliance-workflow",
  inputSchema: z.object({
    recordId: z.string().describe("KintoneレコードID"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    phase1aResults: z.any(),
    phase1bResults: z.any(),
    phase2Results: z.any(),
    phase3Results: z.any(),
    summary: z.string(),
  }),
})
.then(splitPhaseStep)
.commit();