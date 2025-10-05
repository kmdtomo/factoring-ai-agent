// @ts-nocheck
import { createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { phase1PurchaseCollateralStep } from "./phase1-purchase-collateral-step";
import { phase2BankStatementStep } from "./phase2-bank-statement-step";
import { phase3VerificationStep } from "./phase3-verification-step";
import { phase4FinalAnalysisStep } from "./phase4-final-analysis-step";

/**
 * 統合ワークフロー: Phase 1 → Phase 2 → Phase 3 → Phase 4
 * 
 * 処理フロー:
 * 1. Phase 1: 買取・担保情報処理（OCR → 買取検証 → 担保検証）
 * 2. Phase 2: 通帳分析（OCR → 入金照合 → リスク検出）
 * 3. Phase 3: 本人確認・企業実在性確認（本人確認OCR → エゴサーチ → 企業検証）
 * 4. Phase 4: 最終分析・レポート生成（全データ統合 → AI総合評価）
 * 
 * 入力: recordId（KintoneレコードID）のみ
 * 出力: 最終審査レポート（三段階評価 + 総評 + 詳細データ）
 */
export const integratedWorkflow = createWorkflow({
  id: "integrated-workflow",
  description: "ファクタリング審査の全フェーズ（Phase 1-4）を実行し、最終レポートを生成します。",
  inputSchema: z.object({
    recordId: z.string(),
  }),
})
  .then(phase1PurchaseCollateralStep)
  .then(phase2BankStatementStep)
  .then(phase3VerificationStep)
  .then(phase4FinalAnalysisStep)
  .commit();

