import { createStep } from "@mastra/core/workflows";
import { z } from "zod";
// 将来的に実装するツールのインポート
// import { companyVerificationTool } from "../tools/company-verification-tool";
// import { fraudCheckTool } from "../tools/fraud-check-tool";
// import { creditResearchTool } from "../tools/credit-research-tool";

/**
 * Phase 2: 外部調査ステップ
 * エージェントを使わず、ワークフロー内でツールを直接実行
 */
export const phase2ResearchStep = createStep({
  id: "phase2-external-research",
  description: "外部調査（企業実在性・詐欺情報・信用調査）",
  
  inputSchema: z.object({
    recordId: z.string(),
    phase1Results: z.object({
      ocr: z.any(),
      purchaseVerification: z.any(),
      collateralVerification: z.any(),
    }),
    summary: z.string(),
  }),
  
  outputSchema: z.object({
    recordId: z.string(),
    phase1Results: z.any(), // 引き継ぎ
    phase2Results: z.object({
      companyVerification: z.object({
        success: z.boolean(),
        summary: z.string(),
        verifiedCompanies: z.array(z.any()),
      }),
      fraudCheck: z.object({
        success: z.boolean(),
        summary: z.string(),
        riskLevel: z.enum(["低", "中", "高"]),
      }),
      creditResearch: z.object({
        success: z.boolean(),
        summary: z.string(),
        creditScore: z.number().optional(),
      }),
    }),
    summary: z.string(),
  }),
  
  execute: async ({ inputData }) => {
    const { recordId, phase1Results } = inputData;
    
    console.log(`\n${"=".repeat(80)}`);
    console.log(`[Phase 2] 外部調査開始 - recordId: ${recordId}`);
    console.log(`${"=".repeat(80)}\n`);
    
    try {
      // ========================================
      // ステップ1: 企業実在性確認
      // ========================================
      console.log(`[Phase 2 - Step 1/3] 企業実在性確認開始`);
      
      // TODO: companyVerificationToolを実装して実行
      // const companyResult = await companyVerificationTool.execute({
      //   context: {
      //     companies: [
      //       ...phase1Results.purchaseVerification.purchaseInfo.debtorCompanies.map(c => c.name),
      //       ...phase1Results.collateralVerification.collateralInfo.companies.map(c => c.name),
      //     ],
      //   }
      // });
      
      const companyResult = {
        success: true,
        summary: "企業実在性確認完了（仮実装）",
        verifiedCompanies: [],
      };
      
      console.log(`[Phase 2 - Step 1/3] 企業実在性確認完了`);
      
      // ========================================
      // ステップ2: 詐欺情報チェック
      // ========================================
      console.log(`[Phase 2 - Step 2/3] 詐欺情報チェック開始`);
      
      // TODO: fraudCheckToolを実装して実行
      // const fraudResult = await fraudCheckTool.execute({
      //   context: {
      //     recordId,
      //     applicantCompany: phase1Results.purchaseVerification.purchaseInfo.applicantCompany,
      //   }
      // });
      
      const fraudResult = {
        success: true,
        summary: "詐欺情報チェック完了（仮実装）",
        riskLevel: "低" as const,
      };
      
      console.log(`[Phase 2 - Step 2/3] 詐欺情報チェック完了`);
      
      // ========================================
      // ステップ3: 信用調査
      // ========================================
      console.log(`[Phase 2 - Step 3/3] 信用調査開始`);
      
      // TODO: creditResearchToolを実装して実行
      // const creditResult = await creditResearchTool.execute({
      //   context: {
      //     recordId,
      //     companies: phase1Results.purchaseVerification.purchaseInfo.debtorCompanies,
      //   }
      // });
      
      const creditResult = {
        success: true,
        summary: "信用調査完了（仮実装）",
        creditScore: 75,
      };
      
      console.log(`[Phase 2 - Step 3/3] 信用調査完了`);
      
      // ========================================
      // 結果のサマリー生成
      // ========================================
      const summary = `
Phase 2 処理完了 - recordId: ${recordId}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【企業実在性確認】
  ${companyResult.summary}

【詐欺情報チェック】
  ${fraudResult.summary}
  リスクレベル: ${fraudResult.riskLevel}

【信用調査】
  ${creditResult.summary}
  信用スコア: ${creditResult.creditScore || "N/A"}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`.trim();
      
      console.log(`\n${summary}\n`);
      
      return {
        recordId,
        phase1Results, // Phase 1の結果を引き継ぐ
        phase2Results: {
          companyVerification: companyResult,
          fraudCheck: fraudResult,
          creditResearch: creditResult,
        },
        summary,
      };
      
    } catch (error: any) {
      console.error(`\n[Phase 2] エラー発生:`, error.message);
      throw new Error(`Phase 2 処理失敗: ${error.message}`);
    }
  },
});

