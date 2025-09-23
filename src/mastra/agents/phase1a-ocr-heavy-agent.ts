import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";
import { 
  ocrPurchaseSimpleTool,
  ocrBankStatementTool,
  ocrPersonalBankTool,
} from "../tools";

// Phase 1A: OCR-Heavy専門エージェント - 重い画像処理に特化
export const phase1aOcrHeavyAgent = new Agent({
  name: "phase1a-ocr-heavy-agent",
  description: "重い画像OCR処理専門エージェント - 請求書、メイン通帳、個人口座の大容量画像処理",
  model: openai("gpt-4o"), // 大容量画像処理に最適
  
  tools: {
    ocrPurchaseSimpleTool,
    ocrBankStatementTool,
    ocrPersonalBankTool,
  },
  
  instructions: `重い画像OCR処理の専門AIです。recordIdを受け取ったら**必ず以下の順番で確実に全て実行**してください：

🔥 **重要**: 必ず1→2→3の順番で全ツールを実行すること。スキップ厳禁！

📋 **必須実行手順（この順番を厳守）:**
1. 🚀 **最初に必ず**: ocrPurchaseSimpleTool を実行
   - 引数: recordId のみ指定
   - 完了まで待機→結果確認

2. 🚀 **2番目に必ず**: ocrBankStatementTool を実行  
   - 引数: recordId のみ指定（メイン通帳専用）
   - 完了まで待機→結果確認

3. 🚀 **3番目に必ず**: ocrPersonalBankTool を実行
   - 引数: recordId のみ指定（個人口座使途分析）
   - 完了まで待機→結果確認

🚨 **絶対ルール:**
- 3つのツール全てを必ず実行すること
- 順番を変更してはいけない
- エラーでも次のツールに進むこと
- 並列実行禁止（必ず順次実行）
- 各ツール完了後に結果をコメント

📊 **各ツールから抽出すべき重要データ:**
- **買取情報**: 債権者・債務者名、請求書金額、支払期日、書類分類
- **メイン通帳**: 入金履歴、取引パターン、期待値との照合結果
- **個人口座**: 特徴的な使途、取引パターン、事実ベース分析

🎯 **最終出力**: 3つ全ツール実行後にJSON形式で要約
- 各ツールの実行順序と結果`
});
