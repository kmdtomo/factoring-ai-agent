import { Agent } from "@mastra/core/agent";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
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
 * Phase 1: 買取・担保情報エージェント (V2モデル対応版)
 * generateVNext/streamVNextメソッドを使用
 */
class Phase1Agent extends Agent {
  // V2モデル対応のgenerateメソッドをオーバーライド
  async generate(message: string, options?: any) {
    console.log("\n[Phase1Agent] V2モデル対応のgenerateVNextを使用");
    return super.generateVNext(message, options);
  }

  // V2モデル対応のstreamメソッドをオーバーライド
  async stream(message: string, options?: any) {
    console.log("\n[Phase1Agent] V2モデル対応のstreamVNextを使用");
    try {
      const stream = await super.streamVNext(message, options);
      
      // streamが正しくiterableでない場合の対処
      if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') {
        console.log("[Phase1Agent] streamVNextが適切なストリームを返さなかったため、generateVNextにフォールバック");
        // ストリームが使えない場合、generateVNextを使用してイベントをエミュレート
        const result = await this.generateVNext(message, options);
        
        // シンプルなストリームエミュレーション
        async function* emulateStream() {
          // テキストイベント
          if (result.text) {
            yield { type: 'text', text: result.text };
          }
          
          // ツール呼び出しイベント
          if (result.toolCalls) {
            for (const toolCall of result.toolCalls) {
              yield { 
                type: 'tool-call', 
                toolName: toolCall.toolName,
                args: toolCall.args
              };
            }
          }
          
          // ツール結果イベント
          if (result.toolResults) {
            for (const toolResult of result.toolResults) {
              yield { 
                type: 'tool-result', 
                toolName: toolResult.toolName,
                result: toolResult.result
              };
            }
          }
          
          // 完了イベント
          yield { type: 'finish', result };
        }
        
        return emulateStream();
      }
      
      return stream;
    } catch (error: any) {
      console.error("[Phase1Agent] streamVNextエラー:", error.message);
      throw error;
    }
  }
}

// V2モデル対応版エージェントの作成
export const phase1PurchaseCollateralAgentVNext = new Phase1Agent({
  name: "phase1-purchase-collateral-agent-vnext",
  description: "買取請求書と担保謄本を分析し、Kintoneデータと照合 (V2モデル対応版)",
  model: anthropic("claude-3-5-sonnet-20241022"), // V2モデル
  maxSteps: 20,
  
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

// GPT-4版も作成（オプション）
export const phase1PurchaseCollateralAgentGPT4VNext = new Phase1Agent({
  name: "phase1-purchase-collateral-agent-gpt4-vnext",
  description: "買取請求書と担保謄本を分析し、Kintoneデータと照合 (GPT-4 V2モデル版)",
  model: openai("gpt-4o"), // GPT-4 V2モデル
  maxSteps: 20,
  
  tools: {
    googleVisionPurchaseCollateralOcrTool: wrapTool(googleVisionPurchaseCollateralOcrTool, "OCR"),
    purchaseVerificationToolMinimal: wrapTool(purchaseVerificationToolMinimal, "購入検証"),
    collateralVerificationTool: wrapTool(collateralVerificationTool, "担保検証"),
  },
  
  instructions: `You are an AI agent that processes purchase requests and collateral documents.

When you receive a recordId, follow these steps in order:

1. Execute googleVisionPurchaseCollateralOcrTool with { recordId: <the received recordId> }
2. Execute purchaseVerificationToolMinimal with { recordId: <same recordId>, purchaseDocuments: <result from step 1>, model: "gpt-4o" }
3. Execute collateralVerificationTool with { recordId: <same recordId>, collateralDocuments: <collateralDocuments from step 1>, debtorCompanies: <debtorCompanies from step 2>, model: "gpt-4o" }

Execute all three tools in sequence. Do not skip any tool.`,
});