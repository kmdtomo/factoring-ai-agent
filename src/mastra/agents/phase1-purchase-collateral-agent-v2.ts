import { Agent } from "@mastra/core/agent";
import { anthropic } from "@ai-sdk/anthropic";
import { googleVisionPurchaseCollateralOcrTool } from "../tools/google-vision-purchase-collateral-ocr-tool";
import { purchaseVerificationToolMinimal } from "../tools/purchase-verification-tool-minimal";
import { collateralVerificationTool } from "../tools/collateral-verification-tool";

/**
 * V2モデル対応版Agent基底クラス
 * Mastraの最新AI SDKとの互換性問題を解決
 */
class V2CompatibleAgent extends Agent {
  /**
   * V2モデル対応のgenerateメソッド
   * 内部でgenerateVNextを使用
   */
  async generate(message: string, options?: any) {
    console.log(`[${this.name}] V2互換モードでgenerateVNextを実行`);
    try {
      return await super.generateVNext(message, options);
    } catch (error: any) {
      console.error(`[${this.name}] generateVNextエラー:`, error.message);
      // フォールバック: 通常のgenerateを試みる
      console.log(`[${this.name}] 通常のgenerateにフォールバック`);
      return await super.generate(message, options);
    }
  }

  /**
   * V2モデル対応のstreamメソッド
   * streamVNextが失敗した場合はgenerateVNextの結果をストリーム風に変換
   */
  async stream(message: string, options?: any) {
    console.log(`[${this.name}] V2互換モードでstreamを実行`);
    
    try {
      // まずstreamVNextを試みる
      const stream = await super.streamVNext(message, options);
      
      // ストリームが正しいasync iterableか確認
      if (stream && typeof stream[Symbol.asyncIterator] === 'function') {
        console.log(`[${this.name}] streamVNextが成功`);
        return stream;
      }
      
      // streamが無効な場合
      console.log(`[${this.name}] streamVNextが無効なストリームを返したため、generateVNextを使用`);
      throw new Error("Invalid stream");
      
    } catch (error: any) {
      // generateVNextを使用してストリームをエミュレート
      console.log(`[${this.name}] ストリームエミュレーションモード`);
      
      const result = await this.generateVNext(message, options);
      
      // 結果をストリーム風のイテレーターに変換
      async function* streamEmulator() {
        // 開始イベント
        yield { type: 'start', timestamp: new Date().toISOString() };
        
        // ツール呼び出しイベント
        if (result.toolCalls && result.toolCalls.length > 0) {
          for (const toolCall of result.toolCalls) {
            yield {
              type: 'tool-call',
              toolName: toolCall.toolName,
              args: toolCall.args,
              timestamp: new Date().toISOString()
            };
          }
        }
        
        // ツール結果イベント
        if (result.toolResults && result.toolResults.length > 0) {
          for (const toolResult of result.toolResults) {
            yield {
              type: 'tool-result',
              toolName: toolResult.toolName,
              result: toolResult.result,
              timestamp: new Date().toISOString()
            };
          }
        }
        
        // テキストイベント
        if (result.text) {
          yield {
            type: 'text',
            text: result.text,
            timestamp: new Date().toISOString()
          };
        }
        
        // 完了イベント
        yield {
          type: 'finish',
          result: result,
          timestamp: new Date().toISOString()
        };
      }
      
      return streamEmulator();
    }
  }
}

/**
 * Phase 1: 買取・担保情報エージェント (V2モデル完全対応版)
 * 
 * 機能:
 * - Google Vision APIでOCR処理
 * - Kintoneデータとの照合
 * - 買取請求書と担保謄本の分析
 * 
 * V2対応の特徴:
 * - 最新のAI SDKとの完全な互換性
 * - streamVNextの問題を回避
 * - エラー時の適切なフォールバック
 */
export const phase1PurchaseCollateralAgentV2 = new V2CompatibleAgent({
  name: "phase1-purchase-collateral-agent-v2",
  description: "買取請求書と担保謄本を分析し、Kintoneデータと照合 (V2モデル完全対応版)",
  model: anthropic("claude-3-5-sonnet-20241022"),
  maxSteps: 20,
  
  tools: {
    googleVisionPurchaseCollateralOcrTool: {
      ...googleVisionPurchaseCollateralOcrTool,
      execute: async (args: any) => {
        console.log("\n[OCRツール] 実行開始:", new Date().toISOString());
        console.log("[OCRツール] 引数:", args.context);
        try {
          const result = await googleVisionPurchaseCollateralOcrTool.execute(args);
          console.log("[OCRツール] 実行完了:", {
            success: result.success,
            purchaseDocuments: result.purchaseDocuments?.length || 0,
            collateralDocuments: result.collateralDocuments?.length || 0
          });
          return result;
        } catch (error: any) {
          console.error("[OCRツール] エラー:", error.message);
          throw error;
        }
      }
    },
    purchaseVerificationToolMinimal: {
      ...purchaseVerificationToolMinimal,
      execute: async (args: any) => {
        console.log("\n[購入検証ツール] 実行開始:", new Date().toISOString());
        console.log("[購入検証ツール] 引数:", {
          recordId: args.context.recordId,
          purchaseDocuments: args.context.purchaseDocuments?.length || 0,
          model: args.context.model
        });
        try {
          const result = await purchaseVerificationToolMinimal.execute(args);
          console.log("[購入検証ツール] 実行完了:", {
            success: result.success,
            summary: result.summary?.substring(0, 50) + "..."
          });
          return result;
        } catch (error: any) {
          console.error("[購入検証ツール] エラー:", error.message);
          throw error;
        }
      }
    },
    collateralVerificationTool: {
      ...collateralVerificationTool,
      execute: async (args: any) => {
        console.log("\n[担保検証ツール] 実行開始:", new Date().toISOString());
        console.log("[担保検証ツール] 引数:", args.context);
        try {
          const result = await collateralVerificationTool.execute(args);
          console.log("[担保検証ツール] 実行完了:", result.success);
          return result;
        } catch (error: any) {
          console.error("[担保検証ツール] エラー:", error.message);
          throw error;
        }
      }
    }
  },
  
  instructions: `あなたは買取請求書と担保謄本を処理する専門のAIエージェントです。

recordIdを受け取ったら、以下の3つのステップを必ず順番に実行してください：

ステップ1: OCR処理
googleVisionPurchaseCollateralOcrTool を使用して、recordId に関連する書類のOCR処理を実行します。
引数: { recordId: "受け取ったrecordId" }

ステップ2: 購入情報の検証
purchaseVerificationToolMinimal を使用して、OCR結果の購入書類をKintoneデータと照合します。
引数: {
  recordId: "同じrecordId",
  purchaseDocuments: ステップ1で取得したpurchaseDocuments,
  model: "claude-3-5-sonnet-20241022"
}

ステップ3: 担保情報の検証
collateralVerificationTool を使用して、OCR結果の担保書類をKintoneデータと照合します。
引数: {
  recordId: "同じrecordId",
  collateralDocuments: ステップ1で取得したcollateralDocuments,
  debtorCompanies: ステップ2で取得したpurchaseInfo.debtorCompanies,
  model: "claude-3-5-sonnet-20241022"
}

重要な注意事項:
- 各ステップは前のステップの結果を使用するため、順番を守ってください
- エラーが発生した場合は、その内容を報告してください
- すべてのステップを実行し、最終的な検証結果をまとめて報告してください`,
});

// 使用例とドキュメント
export const phase1AgentV2Usage = `
/**
 * Phase1 Purchase Collateral Agent V2 使用方法
 * 
 * 基本的な使用:
 * \`\`\`typescript
 * import { phase1PurchaseCollateralAgentV2 } from './phase1-purchase-collateral-agent-v2';
 * 
 * // generateメソッド（推奨）
 * const result = await phase1PurchaseCollateralAgentV2.generate('recordId: 9918');
 * console.log(result.text);
 * 
 * // streamメソッド（リアルタイム処理）
 * const stream = await phase1PurchaseCollateralAgentV2.stream('recordId: 9918');
 * for await (const event of stream) {
 *   if (event.type === 'tool-call') {
 *     console.log(\`ツール実行: \${event.toolName}\`);
 *   }
 * }
 * \`\`\`
 * 
 * 必要な環境変数:
 * - KINTONE_DOMAIN: Kintoneのドメイン
 * - KINTONE_API_TOKEN: KintoneのAPIトークン
 * - ANTHROPIC_API_KEY: AnthropicのAPIキー
 * - GOOGLE_APPLICATION_CREDENTIALS: Google Cloud認証ファイルパス
 * 
 * 特徴:
 * - V2モデルとの完全な互換性
 * - エラー時の適切なフォールバック
 * - ストリームエミュレーション機能
 * - 詳細なログ出力
 */
`;