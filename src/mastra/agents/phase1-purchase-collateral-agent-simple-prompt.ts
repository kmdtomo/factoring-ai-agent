import { Agent } from "@mastra/core/agent";
import { anthropic } from "@ai-sdk/anthropic";
import { googleVisionPurchaseCollateralOcrTool } from "../tools/google-vision-purchase-collateral-ocr-tool";
import { purchaseVerificationToolMinimal } from "../tools/purchase-verification-tool-minimal";
import { collateralVerificationTool } from "../tools/collateral-verification-tool";

// シンプルなプロンプトベースのエージェント
export const phase1PurchaseCollateralAgentSimplePrompt = new Agent({
  name: "phase1-purchase-collateral-agent-simple-prompt",
  description: "買取請求書と担保謄本を分析（プロンプトに直接データを入れる版）",
  model: anthropic("claude-3-5-sonnet-20241022"),
  maxSteps: 10,
  
  tools: {
    googleVisionPurchaseCollateralOcrTool,
    purchaseVerificationToolMinimal,
    collateralVerificationTool,
  },
  
  instructions: `買取・担保情報処理AIです。recordIdを受け取ったら以下を実行してください：

1. まずgoogleVisionPurchaseCollateralOcrToolを実行してOCR処理

2. OCRが完了したら、purchaseVerificationToolMinimalを実行
   重要：購入書類のテキストデータは、ツールの結果をそのままプロンプトに含めて渡してください
   例：「以下のOCR結果を検証してください：[OCRテキスト全文]」のように

3. 必要に応じてcollateralVerificationToolも同様に実行

各ツール実行時は、前のツールの結果を直接プロンプトに含めて渡すこと。`,
});

// データを直接渡すヘルパー関数
export async function executeWithDirectData(recordId: string) {
  console.log("=== プロンプトに直接データを渡す方式 ===\n");
  
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
    console.log(`テキストサイズ: ${ocrResult.purchaseDocuments[0]?.text.length}文字`);
    
    // 2. エージェントに直接データを含めたプロンプトを送る
    const prompt = `
recordId: ${recordId}

以下のOCRデータを使って購入検証を実行してください：

購入書類データ:
${JSON.stringify(ocrResult.purchaseDocuments, null, 2)}

上記のデータを使ってpurchaseVerificationToolMinimalを実行してください。
ツールに渡す際は、recordIdと上記の購入書類データをそのまま使用してください。
`;
    
    console.log("\nステップ2: エージェントに直接データを含めたプロンプトを送信");
    
    const result = await phase1PurchaseCollateralAgentSimplePrompt.generate(prompt, {
      onStepFinish: (event: any) => {
        if (event.toolCalls && event.toolCalls.length > 0) {
          event.toolCalls.forEach((call: any) => {
            console.log(`→ ${call.toolName || '不明'} 呼び出し`);
          });
        }
      }
    });
    
    console.log("\n完了！");
    return result;
    
  } catch (error: any) {
    console.error("エラー:", error.message);
    throw error;
  }
}