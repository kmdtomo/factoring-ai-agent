import { Agent } from "@mastra/core/agent";
import { anthropic } from "@ai-sdk/anthropic";
import { 
  ocrPurchaseSimpleTool,
  ocrRegistryToolV2,
  // TODO: 将来追加予定
  // ocrCollateralVerifyTool, // 担保情報OCR照合ツール
} from "../tools";

export const phase1PurchaseCollateralAgent = new Agent({
  name: "phase1-purchase-collateral-agent",
  description: "買取・担保情報の処理を専門とするエージェント",
  model: anthropic("claude-3-7-sonnet-20241022"), // Claude 3.7 Sonnet
  
  tools: {
    ocrPurchaseSimpleTool,
    ocrRegistryToolV2,
  },
  
  instructions: `あなたは買取・担保情報のOCR処理を専門とするAIエージェントです。recordIdを受け取ったら以下の順番で実行してください。

📋 **必須実行手順:**
1. 🚀 **最初に**: ocrPurchaseSimpleTool を実行
   - 引数: recordId のみ指定
   - 買取情報（請求書）の照合結果を取得
   
2. 🚀 **次に**: ocrRegistryToolV2 を実行
   - 引数: recordId のみ指定
   - 登記簿の情報を取得

🚨 **重要**: 評価や判断は一切行わない。事実のみを報告する。

📊 **抽出すべきデータ:**
- **買取情報**: 期待値との一致/不一致/確認不能の結果
- **登記情報**: 会社名、設立年月日、資本金、代表者名の事実データ

📝 **出力形式:**
Phase1買取・担保情報処理結果:
1. ocrPurchaseSimpleToolの結果:
   - 照合結果（一致/不一致/確認不能）
   - 具体的な金額や企業名
   
2. ocrRegistryToolV2の結果:
   - 確認できた企業の登記情報
   - 債権譲渡登記の有無

注意: リスク評価や判断は一切含めないこと。`,
});