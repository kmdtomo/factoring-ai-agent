import { createWorkflow, createStep } from "@mastra/core/workflows";
import { RuntimeContext } from "@mastra/core/runtime-context";
import { z } from "zod";
import { complianceAgent } from "../agents/compliance-agent";
import type { ComplianceAssessmentResult, StreamingEvent } from "../types";
import {
  kintoneFetchTool,
  // kintoneFetchFilesTool, // 一時停止
  egoSearchTool,
  companyVerifyTool,
  paymentAnalysisTool,
  // documentOcrTool, // 一時停止
  // documentOcrVisionTool, // 一時停止
} from "../tools";

// ワークフロー実行ステップ
const runComplianceAnalysisStep = createStep({
  id: "run-compliance-analysis",
  description: "コンプライアンスエージェントを実行",
  inputSchema: z.object({
    recordId: z.string(),
    options: z.object({
      streaming: z.boolean().optional(),
      includeDetailedReports: z.boolean().optional(),
    }).optional(),
  }),
  outputSchema: z.any(),
  execute: async ({ inputData }) => {
    const { recordId } = inputData;
    
    // 事前に全ツールを強制実行（入力不足時は空配列などで実行）
    let kintoneResult: any = null;
    // ファイル取得は一時停止
    let filesResult: any = { success: true, files: [], skippedFiles: [], message: "kintoneFetchFiles temporarily disabled" };
    let egoResult: any = null;
    let companyResult: any = null;
    let paymentResult: any = null;
    // OCR系一時停止
    let ocrPrepResult: any = { processingStatus: { totalFiles: 0, processableFiles: 0, skippedFiles: [] }, ocrResults: [], summary: "OCR temporarily disabled" };
    let ocrVisionResult: any = { processingStatus: { totalFiles: 0, processableFiles: 0, skippedFiles: [] }, ocrResults: [], summary: "OCR temporarily disabled" };
    
    try {
      kintoneResult = await kintoneFetchTool.execute({ 
        context: { recordId },
        runtimeContext: new RuntimeContext(),
      });
      console.log(`[WF] kintoneFetchTool: success=${kintoneResult?.success !== false}, attachments=${kintoneResult?.fileKeys?.length ?? 0}`);
    } catch (e) {
      kintoneResult = { success: false, error: e instanceof Error ? e.message : "unknown" };
      console.error(`[WF] kintoneFetchTool error:`, e);
    }
    
    const fileKeys = Array.isArray(kintoneResult?.fileKeys) ? kintoneResult.fileKeys : [];
    console.log(`[WF] kintoneFetchFilesTool temporarily disabled. fileKeys=${fileKeys.length}`);
    
    const representativeName = kintoneResult?.record?.basic?.代表者名 || "不明";
    const birthDate = kintoneResult?.record?.basic?.生年月日;
    try {
      egoResult = await egoSearchTool.execute({
        context: birthDate ? { name: representativeName, birthDate } : { name: representativeName },
        runtimeContext: new RuntimeContext(),
      });
      console.log(`[WF] egoSearchTool: hasNegative=${egoResult?.summary?.hasNegativeInfo ?? false}, fraudHits=${egoResult?.summary?.fraudHits ?? 0}`);
    } catch (e) {
      egoResult = { summary: { hasNegativeInfo: false, fraudHits: 0, details: "error" } };
      console.error(`[WF] egoSearchTool error:`, e);
    }
    
    const companyName = kintoneResult?.record?.basic?.会社_屋号名 || "不明";
    const location = kintoneResult?.record?.basic?.会社所在地;
    // registryInfo は申込者企業ではない可能性があるため渡さない
    try {
      companyResult = await companyVerifyTool.execute({
        context: location ? { companyName, location } : { companyName },
        runtimeContext: new RuntimeContext(),
      });
      console.log(`[WF] companyVerifyTool: verified=${companyResult?.verified ?? false}, confidence=${companyResult?.confidence ?? 0}`);
    } catch (e) {
      companyResult = { verified: false, confidence: 0, webPresence: { hasWebsite: false }, searchResults: [], riskFactors: ["error"] };
      console.error(`[WF] companyVerifyTool error:`, e);
    }
    
    const purchases = Array.isArray(kintoneResult?.record?.purchases)
      ? kintoneResult.record.purchases.map((p: any) => ({
          companyName: p.会社名_第三債務者_買取 || "",
          amount: Number(p.買取債権額 || 0),
          paymentDate: p.買取債権支払日 || "",
        }))
      : [];
    const collaterals = Array.isArray(kintoneResult?.record?.collaterals)
      ? kintoneResult.record.collaterals.map((c: any) => ({
          companyName: c.会社名_第三債務者_担保 || "",
          claimAmount: Number(c.請求額 || 0),
          monthlyPayments: {
            twoMonthsAgo: Number(c.過去の入金_先々月 || 0),
            lastMonth: Number(c.過去の入金_先月 || 0),
            thisMonth: Number(c.過去の入金_今月 || 0),
            average: Number(c.平均 || 0),
          },
        }))
      : [];
    try {
      paymentResult = await paymentAnalysisTool.execute({
        context: { purchases, collaterals },
        runtimeContext: new RuntimeContext(),
      });
      console.log(`[WF] paymentAnalysisTool: gap=${paymentResult?.collateralGap ?? 0}`);
    } catch (e) {
      paymentResult = { totalPurchaseAmount: 0, totalCollateral: 0, collateralGap: 0, evaluation: { collateralStatus: "不足", gapAmount: 0, riskLevel: "リスク高", reason: "error" }, paymentHistory: [], recommendations: [] };
      console.error(`[WF] paymentAnalysisTool error:`, e);
    }
    
    const files = Array.isArray(filesResult?.files) ? filesResult.files : [];
    // OCR呼び出しはスキップ（要約のみ利用したい場合はここで軽量要約を生成）
    console.log(`[WF] OCR tools temporarily disabled. files=${files.length}`);
    
    // エージェントに直接レコードID＋ツール実行サマリーを渡して実行
    const message = `レコードID: ${recordId}\n\n[ツール実行サマリー]\n- kintoneFetchTool: ${kintoneResult?.success === false ? "error" : "ok"}\n- egoSearchTool: negative=${egoResult?.summary?.hasNegativeInfo ?? false}\n- companyVerifyTool: verified=${companyResult?.verified ?? false}, confidence=${companyResult?.confidence ?? 0}\n- paymentAnalysisTool: gap=${paymentResult?.collateralGap ?? 0}`;
    
    try {
      // エージェントを実行（maxStepsを増やしてツール実行回数を確保）
      const response = await complianceAgent.generate(
        [{ role: 'user', content: message }],
        { maxSteps: 100 }
      );
      
      return {
        success: true,
        response: response.text
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '不明なエラーが発生しました'
      };
    }
  },
});

// コンプライアンスワークフローの定義
export const complianceWorkflow = createWorkflow({
  id: "compliance-assessment",
  description: "ファクタリング審査ワークフロー",
  inputSchema: z.object({
    recordId: z.string(),
    options: z.object({
      streaming: z.boolean().optional(),
      includeDetailedReports: z.boolean().optional(),
    }).optional(),
  }),
  outputSchema: z.any(),
})
.map(async ({ inputData }) => ({
  recordId: inputData.recordId,
  options: inputData.options || {},
}))
.then(runComplianceAnalysisStep)
.commit();

// ワークフロー実行関数（外部から使用）
export async function runComplianceWorkflow(
  recordId: string,
  options?: { streaming?: boolean; includeDetailedReports?: boolean },
  onProgress?: (event: StreamingEvent) => void
): Promise<any> {
  try {
    // 開始イベント
    onProgress?.({
      type: "PROCESSING_START",
      data: {
        recordId,
        timestamp: new Date().toISOString(),
      },
    });

    // ワークフローを実行
    const run = complianceWorkflow.createRun();
    const workflowRunResult = await run.start({
      inputData: {
        recordId,
        options: options || {}
      }
    });
    const result = workflowRunResult.status === 'success' ? workflowRunResult.result : workflowRunResult;

    // 完了イベント
    onProgress?.({
      type: "FINAL_RESULT", 
      data: result,
    });

    return result;
  } catch (error) {
    // エラーイベント
    onProgress?.({
      type: "ERROR",
      data: {
        error: (error as Error).message,
      },
    });
    throw error;
  }
}