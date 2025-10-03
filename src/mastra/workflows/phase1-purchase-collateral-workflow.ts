import { createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { phase1PurchaseCollateralStep } from "./phase1-purchase-collateral-step";

/**
 * Phase 1: 買取・担保情報ワークフロー
 * 
 * エージェントレス設計：
 * - エージェントを使わず、ワークフローステップ内でツールを直接実行
 * - 7000文字以上の大量データでも確実に処理可能
 * - プログラマティックにツールを順次実行（OCR → 買取検証 → 担保検証）
 */
export const phase1PurchaseCollateralWorkflow = createWorkflow({
  id: "phase1-purchase-collateral-workflow",
  description: "買取請求書と担保謄本の処理ワークフロー（エージェントレス設計）",
  
  inputSchema: z.object({
    recordId: z.string().describe("KintoneレコードID"),
  }),
  
  outputSchema: z.object({
    recordId: z.string(),
    結果サマリー: z.object({
      申込者企業: z.string(),
      総債権額: z.string(),
      第三債務者: z.array(z.any()),
      担保企業: z.any(),
      担保状況: z.object({
        一致企業: z.array(z.string()),
        担保なし: z.array(z.string()),
      }),
      照合結果: z.object({
        買取検証: z.string(),
        担保検証: z.string(),
      }),
      処理時間: z.string(),
      コスト: z.string(),
    }),
    phase1Results: z.object({
      ocr: z.object({
        success: z.boolean(),
        purchaseDocuments: z.array(z.any()),
        collateralDocuments: z.array(z.any()),
        processingDetails: z.any(),
      }),
      purchaseVerification: z.object({
        success: z.boolean(),
        summary: z.string(),
        purchaseInfo: z.any(),
        metadata: z.any(),
      }),
      collateralVerification: z.object({
        success: z.boolean(),
        summary: z.string(),
        collateralInfo: z.any(),
        relationshipAnalysis: z.any(),
      }),
    }),
    summary: z.string(),
  }),
})
  .then(phase1PurchaseCollateralStep)
  .commit();
