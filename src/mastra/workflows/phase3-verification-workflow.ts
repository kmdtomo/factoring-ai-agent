import { createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { phase3VerificationStep } from "./phase3-verification-step";

/**
 * Phase 3: 本人確認・企業実在性確認ワークフロー
 * 
 * エージェントレス設計：
 * - エージェントを使わず、ワークフローステップ内でツールを直接実行
 * - 既存ツール100%活用（ocrIdentityToolV2, egoSearchTool, companyVerifyTool）
 * - プログラマティックにツールを順次実行（本人確認 → エゴサーチ → 企業検証 → 代表者リスク検索）
 */
export const phase3VerificationWorkflow = createWorkflow({
  id: "phase3-verification-workflow",
  description: "本人確認・企業実在性確認ワークフロー（エージェントレス設計）",
  
  inputSchema: z.object({
    recordId: z.string().describe("KintoneレコードID"),
    phase1Results: z.any().optional().describe("Phase 1の結果（買取・担保情報）"),
  }),
  
  outputSchema: z.object({
    recordId: z.string(),
    結果サマリー: z.object({
      本人確認: z.object({
        書類タイプ: z.string(),
        照合結果: z.string(),
        免許証の色: z.string().optional(),
        違反回数: z.number().optional(),
      }),
      申込者エゴサーチ: z.object({
        ネガティブ情報: z.boolean(),
        詐欺情報サイト: z.number(),
        Web検索: z.number(),
        詳細: z.string(),
      }),
      企業実在性: z.object({
        申込企業: z.object({
          確認: z.boolean().optional(),
          公式サイト: z.string().optional(),
        }).optional(),
        買取企業: z.object({
          確認済み: z.number(),
          未確認: z.number(),
        }),
        担保企業: z.object({
          確認済み: z.number(),
          未確認: z.number(),
          備考: z.string().optional(),
        }),
      }),
      代表者リスク: z.object({
        検索対象: z.number(),
        リスク検出: z.number(),
      }),
      処理時間: z.string(),
    }),
    phase3Results: z.object({
      identityVerification: z.object({
        success: z.boolean(),
        extractedInfo: z.any(),
        documentType: z.string(),
        summary: z.string(),
      }),
      applicantEgoSearch: z.object({
        fraudSiteResults: z.array(z.any()),
        negativeSearchResults: z.array(z.any()),
        summary: z.any(),
      }),
      companyVerification: z.object({
        applicantCompany: z.any().optional(),
        purchaseCompanies: z.array(z.any()).optional(),
        collateralCompanies: z.array(z.any()).optional(),
      }),
      representativeEgoSearches: z.array(z.any()),
    }),
    summary: z.string(),
  }),
})
  .then(phase3VerificationStep)
  .commit();

/**
 * 使用例:
 * 
 * import { phase3VerificationWorkflow } from "./workflows/phase3-verification-workflow";
 * 
 * // Phase 1の結果を渡して実行
 * const result = await phase3VerificationWorkflow.execute({
 *   recordId: "9918",
 *   phase1Results: phase1Output.phase1Results,
 * });
 * 
 * console.log(result.結果サマリー.本人確認);
 * console.log(result.結果サマリー.申込者エゴサーチ);
 * console.log(result.結果サマリー.企業実在性);
 */


