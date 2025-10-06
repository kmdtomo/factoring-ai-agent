import { createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { phase4ReportGenerationStep } from "./phase4-report-generation-step";

/**
 * Phase 4: 審査レポート生成ワークフロー（新バージョン）
 *
 * 処理フロー:
 * 1. Kintoneデータ取得（全テーブル）
 * 2. プロンプト・テンプレート読み込み
 * 3. GPT-4.1による包括的レポート生成（phase4-prompt-balanced.md使用）
 * 4. Markdownレポート出力（ideal-phase4-report-template.md構造）
 *
 * 特徴:
 * - ウィットの審査基準に基づく柔軟な評価
 * - データ欠損を過度にリスク視しない
 * - 最大金額企業の情報を最重視
 * - 透明性の高い判断根拠の明示
 */
export const phase4ReportGenerationWorkflow = createWorkflow({
  id: "phase4-report-generation-workflow",
  name: "Phase 4: 審査レポート生成（新バージョン）",
  description: "全フェーズの結果とKintoneデータを統合し、ウィットの審査基準に基づいた包括的な審査レポートを生成します。",

  triggerSchema: z.object({
    recordId: z.string().describe("KintoneレコードID"),
    phase1Results: z.any().optional().describe("Phase 1の結果（買取・担保情報）"),
    phase2Results: z.any().optional().describe("Phase 2の結果（通帳分析）"),
    phase3Results: z.any().optional().describe("Phase 3の結果（本人確認・企業実在性）"),
  }),

  inputSchema: z.object({
    recordId: z.string(),
    phase1Results: z.any().optional(),
    phase2Results: z.any().optional(),
    phase3Results: z.any().optional(),
  }),

  outputSchema: z.object({
    recordId: z.string(),
    report: z.string().describe("生成されたMarkdown形式の審査レポート"),
    processingTime: z.string().describe("処理時間"),
    phase4Results: z.any(),
  }),
})
  .then(phase4ReportGenerationStep)
  .commit();
