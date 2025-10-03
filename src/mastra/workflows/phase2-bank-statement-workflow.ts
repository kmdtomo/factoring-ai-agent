import { createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { phase2BankStatementStep } from "./phase2-bank-statement-step";

/**
 * Phase 2: 通帳分析ワークフロー
 * 
 * エージェントレス設計：
 * - エージェントを使わず、ワークフローステップ内でツールを直接実行
 * - 大量データ（通帳30ページ超）でも確実に処理可能
 * - プログラマティックにツールを順次実行（OCR → メイン通帳分析 → サブ通帳分析 → 統合分析）
 */
export const phase2BankStatementWorkflow = createWorkflow({
  id: "phase2-bank-statement-workflow",
  description: "通帳分析ワークフロー（エージェントレス設計）",
  
  inputSchema: z.object({
    recordId: z.string().describe("KintoneレコードID"),
    phase1Results: z.any().optional().describe("Phase 1の結果（オプション）"),
  }),
  
  outputSchema: z.object({
    recordId: z.string(),
    結果サマリー: z.object({
      メイン通帳: z.object({
        入金照合: z.object({
          入金率: z.number(),
          一致企業数: z.number(),
          不一致企業数: z.number(),
        }),
        リスク検出: z.object({
          ギャンブル: z.number(),
          大口出金: z.number(),
          資金移動: z.number(),
        }),
      }).optional(),
      サブ通帳: z.object({
        リスク検出: z.object({
          ギャンブル: z.number(),
          大口出金: z.number(),
        }),
      }).optional(),
      通帳間資金移動: z.number(),
      他社ファクタリング: z.number(),
      処理時間: z.string(),
      コスト: z.string(),
    }),
    phase2Results: z.object({
      ocr: z.object({
        success: z.boolean(),
        mainBankDocuments: z.array(z.any()),
        subBankDocuments: z.array(z.any()),
        processingDetails: z.any(),
      }),
      mainBankAnalysis: z.object({
        collateralMatching: z.any(),
        riskDetection: z.any(),
        extractedTransactions: z.array(z.any()),
      }).optional(),
      subBankAnalysis: z.object({
        riskDetection: z.any(),
        extractedTransactions: z.array(z.any()),
      }).optional(),
      crossBankTransfers: z.array(z.any()),
      factoringCompaniesDetected: z.array(z.any()),
    }),
    summary: z.string(),
  }),
})
  .then(phase2BankStatementStep)
  .commit();


