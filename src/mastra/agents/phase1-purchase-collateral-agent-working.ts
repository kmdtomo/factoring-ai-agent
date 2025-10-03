import { Agent } from "@mastra/core/agent";
import { anthropic } from "@ai-sdk/anthropic";
import { googleVisionPurchaseCollateralOcrTool } from "../tools/google-vision-purchase-collateral-ocr-tool";
import { purchaseVerificationToolMinimal } from "../tools/purchase-verification-tool-minimal";
import { collateralVerificationTool } from "../tools/collateral-verification-tool";

/**
 * Phase 1: 買取・担保情報エージェント（動作確認版）
 * 
 * 現在のMastraの制限を回避するための実装：
 * - 大きなOCRデータの問題を回避
 * - ツールを個別に実行する方法も提供
 */

// OCRデータを要約するツール
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const summarizeOcrTool = createTool({
  id: "summarize-ocr",
  description: "OCR結果を要約して次のツールに渡しやすくする",
  inputSchema: z.object({
    purchaseDocuments: z.array(z.object({
      fileName: z.string(),
      text: z.string(),
      pageCount: z.number(),
      confidence: z.number(),
      tokenEstimate: z.number()
    }))
  }),
  outputSchema: z.object({
    summarizedDocuments: z.array(z.object({
      fileName: z.string(),
      text: z.string(),  // 要約されたテキスト
      pageCount: z.number(),
      confidence: z.number(),
      tokenEstimate: z.number()
    }))
  }),
  execute: async ({ context }) => {
    console.log("[要約ツール] OCRデータを要約中...");
    
    const summarizedDocuments = context.purchaseDocuments.map(doc => ({
      ...doc,
      text: doc.text.substring(0, 3000), // 3000文字に制限
      tokenEstimate: Math.min(doc.tokenEstimate, 1500)
    }));
    
    console.log(`[要約ツール] 完了 - ${context.purchaseDocuments.length}件の書類を要約`);
    
    return { summarizedDocuments };
  }
});

// 動作確認版エージェント
export const phase1PurchaseCollateralAgentWorking = new Agent({
  name: "phase1-purchase-collateral-agent-working",
  description: "買取請求書と担保謄本を分析（動作確認版）",
  model: anthropic("claude-3-5-sonnet-20241022"),
  maxSteps: 10,
  
  tools: {
    googleVisionPurchaseCollateralOcrTool,
    summarizeOcrTool,
    purchaseVerificationToolMinimal,
    collateralVerificationTool,
  },
  
  instructions: `recordIdを受け取ったら、以下の手順で処理してください：

1. googleVisionPurchaseCollateralOcrToolでOCR処理を実行
2. summarizeOcrToolでOCR結果を要約（大きなデータの問題を回避）
3. purchaseVerificationToolMinimalで購入情報を検証（要約されたデータを使用）
4. 必要に応じてcollateralVerificationToolで担保情報を検証

重要：各ツールの結果を確実に次のツールに渡してください。`,
});

// 個別実行用のヘルパー関数
export async function executePhase1Tools(recordId: string) {
  console.log("=== Phase1ツールの個別実行 ===\n");
  
  try {
    // 1. OCR実行
    console.log("ステップ1: OCR実行");
    const ocrResult = await googleVisionPurchaseCollateralOcrTool.execute({
      context: { recordId }
    });
    
    if (!ocrResult.success) {
      throw new Error("OCR処理に失敗しました");
    }
    
    console.log(`OCR完了: ${ocrResult.purchaseDocuments.length}件の書類`);
    
    // 2. データ要約（オプション）
    if (ocrResult.purchaseDocuments[0]?.text.length > 5000) {
      console.log("\nステップ1.5: 大きなデータを要約");
      const summaryResult = await summarizeOcrTool.execute({
        context: { purchaseDocuments: ocrResult.purchaseDocuments }
      });
      ocrResult.purchaseDocuments = summaryResult.summarizedDocuments;
      console.log("要約完了");
    }
    
    // 3. 購入検証
    console.log("\nステップ2: 購入検証実行");
    const verifyResult = await purchaseVerificationToolMinimal.execute({
      context: {
        recordId,
        purchaseDocuments: ocrResult.purchaseDocuments,
        model: "claude-3-5-sonnet-20241022"
      }
    });
    
    console.log(`購入検証完了: ${verifyResult.success ? '成功' : '失敗'}`);
    
    // 4. 担保検証（オプション）
    if (ocrResult.collateralDocuments && ocrResult.collateralDocuments.length > 0) {
      console.log("\nステップ3: 担保検証実行");
      const collateralResult = await collateralVerificationTool.execute({
        context: {
          recordId,
          collateralDocuments: ocrResult.collateralDocuments,
          debtorCompanies: verifyResult.purchaseInfo?.debtorCompanies || [],
          model: "claude-3-5-sonnet-20241022"
        }
      });
      
      console.log(`担保検証完了: ${collateralResult.success ? '成功' : '失敗'}`);
      
      return {
        ocrResult,
        verifyResult,
        collateralResult
      };
    }
    
    return {
      ocrResult,
      verifyResult
    };
    
  } catch (error: any) {
    console.error("エラー:", error.message);
    throw error;
  }
}