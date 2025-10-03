import { createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { phase1PurchaseCollateralStep } from "./phase1-purchase-collateral-step";
// 将来的に追加される他のPhaseステップ
// import { phase2ResearchStep } from "./phase2-research-step";
// import { phase3AnalysisStep } from "./phase3-analysis-step";

/**
 * 完全なコンプライアンス審査ワークフロー
 * 
 * 設計方針:
 * - エージェントは使わない（7000文字程度で無限ループする問題を回避）
 * - 各Phaseはワークフローステップとして実装
 * - ステップ内でツールを直接実行（プログラマティック）
 * - 構造化データはそのまま次のステップに渡す
 * - AIモデルは特定の分析タスクにのみ使用（generateTextで直接呼ぶ）
 * 
 * ワークフロー構成:
 * 
 * Phase 1: 買取・担保情報処理
 *   └─ OCR → 買取検証 → 担保検証（3ツールを順次実行）
 * 
 * Phase 2: 外部調査（将来実装）
 *   └─ 企業実在性確認 → 詐欺情報チェック → 信用調査
 * 
 * Phase 3: 最終分析（将来実装）
 *   └─ 全データ統合 → リスク評価 → レポート生成
 */
export const fullComplianceWorkflow = createWorkflow({
  id: "full-compliance-workflow",
  description: "完全なコンプライアンス審査ワークフロー（エージェントレス設計）",
  
  inputSchema: z.object({
    recordId: z.string().describe("KintoneレコードID"),
  }),
  
  outputSchema: z.object({
    recordId: z.string(),
    phase1Results: z.any(),
    // phase2Results: z.any(), // 将来追加
    // phase3Results: z.any(), // 将来追加
    summary: z.string(),
    recommendation: z.enum(["承認", "条件付き承認", "再検討", "却下"]).optional(),
  }),
})
  .then(phase1PurchaseCollateralStep)
  // 将来的に他のPhaseステップを追加
  // .then(phase2ResearchStep)
  // .then(phase3AnalysisStep)
  .commit();

/**
 * 使用例:
 * 
 * import { fullComplianceWorkflow } from "./workflows/full-compliance-workflow";
 * 
 * const result = await fullComplianceWorkflow.execute({
 *   recordId: "123"
 * });
 * 
 * console.log(result.phase1Results.purchaseVerification.summary);
 */

