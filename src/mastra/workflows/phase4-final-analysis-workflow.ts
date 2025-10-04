import { createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { phase4FinalAnalysisStep } from "./phase4-final-analysis-step";

/**
 * Phase 4: 最終分析・レポート生成ワークフロー
 * 
 * 処理フロー:
 * 1. Kintoneデータ取得（年齢計算、事業形態判定、買取・担保情報）
 * 2. カテゴリ別データ統合（回収可能性、担保安定性、申込者信頼性、リスク要因）
 * 3. AIによる総合評価（GPT-4.1）
 * 4. レポート生成（三段階評価 + 総評 + 詳細データ）
 */
export const phase4FinalAnalysisWorkflow = createWorkflow({
  id: "phase4-final-analysis-workflow",
  name: "Phase 4: 最終分析・レポート生成",
  description: "全フェーズの結果とKintoneデータを統合し、AIによる包括的な審査レポートを生成します。",
  triggerSchema: z.object({
    recordId: z.string().describe("KintoneレコードID"),
    phase1Results: z.any().describe("Phase 1の結果（買取・担保情報）"),
    phase2Results: z.any().optional().describe("Phase 2の結果（通帳分析）"),
    phase3Results: z.any().optional().describe("Phase 3の結果（本人確認・企業実在性）"),
  }),
  inputSchema: z.object({
    recordId: z.string(),
    phase1Results: z.any(),
    phase2Results: z.any().optional(),
    phase3Results: z.any().optional(),
  }),
  outputSchema: z.object({
    recordId: z.string(),
    
    // 最終判定
    最終判定: z.enum(["承諾", "リスクあり承諾", "否認"]),
    リスクレベル: z.enum(["低リスク", "中リスク", "高リスク"]),
    総評: z.string(),
    
    // 審査サマリー
    審査サマリー: z.object({
      申込者: z.string(),
      申込企業: z.string(),
      買取先: z.string(),
      買取額: z.string(),
      総債権額: z.string(),
      掛目: z.string(),
      審査日: z.string(),
      処理時間: z.string(),
      総コスト: z.string(),
    }),
    
    // 詳細評価データ
    回収可能性評価: z.any(),
    担保の安定性評価: z.any(),
    申込者信頼性評価: z.any().optional(),
    リスク要因評価: z.any(),
    推奨事項: z.array(z.any()),
    留意事項: z.array(z.string()),
    
    // 全Phase結果（引き継ぎ）
    phase1Results: z.any(),
    phase2Results: z.any().optional(),
    phase3Results: z.any().optional(),
    phase4Results: z.any(),
  }),
})
  .then(phase4FinalAnalysisStep)
  .commit();

