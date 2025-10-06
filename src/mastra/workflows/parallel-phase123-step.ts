import { Step } from "@mastra/core";
import { z } from "zod";
import { phase1PurchaseCollateralStep } from "./phase1-purchase-collateral-step";
import { phase2BankStatementStep } from "./phase2-bank-statement-step";
import { phase3VerificationStep } from "./phase3-verification-step";

/**
 * Phase 1-3を並列実行するステップ
 *
 * Promise.allを使用して以下を並列実行：
 * - Phase 1: 買取・担保情報処理
 * - Phase 2: 通帳分析
 * - Phase 3: 本人確認・企業実在性確認
 *
 * 全てのPhaseが完了するまで待機（一番遅いPhaseに合わせる）
 */
export const parallelPhase123Step = new Step({
  id: "parallel-phase123-step",
  description: "Phase 1-3を並列実行",

  inputSchema: z.object({
    recordId: z.string(),
  }),

  outputSchema: z.object({
    recordId: z.string(),
    phase1Results: z.any(),
    phase2Results: z.any(),
    phase3Results: z.any(),
    parallelExecutionTime: z.string(),
  }),

  execute: async ({ context }) => {
    const startTime = Date.now();
    const { recordId } = context;

    console.log(`[並列実行] Phase 1-3を並列実行開始: recordId=${recordId}`);

    // Phase 1-3を並列実行
    const [phase1Result, phase2Result, phase3Result] = await Promise.all([
      // Phase 1: 買取・担保情報処理
      phase1PurchaseCollateralStep.execute({
        context: { recordId },
        machineContext: {},
      }),

      // Phase 2: 通帳分析
      phase2BankStatementStep.execute({
        context: { recordId },
        machineContext: {},
      }),

      // Phase 3: 本人確認・企業実在性確認
      phase3VerificationStep.execute({
        context: { recordId },
        machineContext: {},
      }),
    ]);

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log(`[並列実行] Phase 1-3が全て完了: ${duration}秒`);
    console.log(`  ✅ Phase 1: ${phase1Result.結果サマリー?.処理時間 || '不明'}`);
    console.log(`  ✅ Phase 2: ${phase2Result.結果サマリー?.処理時間 || '不明'}`);
    console.log(`  ✅ Phase 3: ${phase3Result.結果サマリー?.処理時間 || '不明'}`);

    return {
      recordId,
      phase1Results: phase1Result,
      phase2Results: phase2Result,
      phase3Results: phase3Result,
      parallelExecutionTime: `${duration}秒`,
    };
  },
});
