import { Agent } from "@mastra/core/agent";
import { anthropic } from "@ai-sdk/anthropic";
import { googleVisionPurchaseCollateralOcrTool } from "../tools/google-vision-purchase-collateral-ocr-tool";
import { purchaseVerificationToolMinimal } from "../tools/purchase-verification-tool-minimal";
import { collateralVerificationTool } from "../tools/collateral-verification-tool";

// デバッグ強化版ラッパー
const wrapTool = (tool: any, name: string) => ({
  ...tool,
  execute: async (args: any) => {
    console.log(`\n[${name}] 開始:`, new Date().toISOString());
    console.log(`[${name}] 入力引数:`, JSON.stringify(args, null, 2));
    
    try {
      const result = await tool.execute(args);
      console.log(`[${name}] 完了:`, new Date().toISOString());
      console.log(`[${name}] 出力概要:`, {
        success: result.success,
        summary: result.summary?.substring(0, 100) + '...',
        hasData: {
          purchaseDocuments: result.purchaseDocuments?.length || 0,
          collateralDocuments: result.collateralDocuments?.length || 0,
          debtorCompanies: result.purchaseInfo?.debtorCompanies?.length || 0,
        }
      });
      
      // OCRツールの場合、テキストサイズを確認
      if (name === "OCR" && result.purchaseDocuments) {
        const totalChars = result.purchaseDocuments.reduce((sum: number, doc: any) => 
          sum + (doc.text?.length || 0), 0
        );
        const estimatedTokens = result.purchaseDocuments.reduce((sum: number, doc: any) => 
          sum + (doc.tokenEstimate || 0), 0
        );
        console.log(`[${name}] データサイズ:`, {
          総文字数: totalChars,
          推定トークン数: estimatedTokens,
          警告: estimatedTokens > 100000 ? "⚠️ トークン数が大きすぎる可能性があります" : "OK"
        });
      }
      return result;
    } catch (error: any) {
      console.error(`[${name}] エラー:`, error.message);
      console.error(`[${name}] エラー詳細:`, error);
      throw error;
    }
  }
});


/**
 * Phase 1: 買取・担保情報エージェント
 * Google Vision APIでOCR処理し、Kintoneデータと照合
 */
export const phase1PurchaseCollateralAgent = new Agent({
  name: "phase1-purchase-collateral-agent",
  description: "買取請求書と担保謄本を分析し、Kintoneデータと照合",
  model: anthropic("claude-3-5-sonnet-20241022"),
  maxSteps: 20,  // ステップ数を増やす（デバッグ用）
  
  tools: {
    googleVisionPurchaseCollateralOcrTool: wrapTool(googleVisionPurchaseCollateralOcrTool, "OCR"),
    purchaseVerificationToolMinimal: wrapTool(purchaseVerificationToolMinimal, "購入検証"),
    collateralVerificationTool: wrapTool(collateralVerificationTool, "担保検証"),
  },
  
  instructions: `recordIdを受け取ったら、以下の手順で処理してください。

まず googleVisionPurchaseCollateralOcrTool を使って recordId のOCR処理を行います。

OCR処理が完了したら、その結果の purchaseDocuments を使って purchaseVerificationToolMinimal を実行します。この時、recordId と model: "claude-3-5-sonnet-20241022" も引数に含めてください。

購入検証が完了したら、OCR結果の collateralDocuments と購入検証結果の purchaseInfo.debtorCompanies の企業名リストを使って collateralVerificationTool を実行します。この時も recordId と model: "claude-3-5-sonnet-20241022" を引数に含めてください。

必ず3つのツールすべてを順番に実行してください。`,
});