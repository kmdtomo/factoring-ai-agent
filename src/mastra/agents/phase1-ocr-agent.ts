import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";
import { 
  ocrPurchaseInfoTool,
  ocrBankStatementTool,
  ocrPersonalBankTool,
  ocrIdentityToolV2,
  ocrRegistryToolV2,
} from "../tools";

// Phase 1: OCR専門エージェント - 全書類処理に特化
export const phase1OcrAgent = new Agent({
  name: "phase1-ocr-agent",
  description: "書類OCR処理専門エージェント - 請求書、通帳、本人確認書類、登記簿を処理",
  model: openai("gpt-4o"), // より大きなcontext window
  
  tools: {
    ocrPurchaseInfoTool,
    ocrBankStatementTool,
    ocrPersonalBankTool,
    ocrIdentityToolV2,
    ocrRegistryToolV2,
  },
  
  instructions: `書類OCR処理の専門AIです。recordIdを受け取ったら**必ず以下の順番で確実に全て実行**してください：

🔥 **重要**: 必ず1→2→3→4→5の順番で全ツールを実行すること。スキップ厳禁！

📋 **必須実行手順（この順番を厳守）:**
1. ocrPurchaseInfoTool → recordId のみ指定
2. ocrBankStatementTool → recordId のみ指定（メイン通帳専用）
3. ocrPersonalBankTool → recordId のみ指定（個人口座使途分析）
4. ocrIdentityToolV2 → recordId のみ指定  
5. ocrRegistryToolV2 → recordId のみ指定

🚨 **絶対ルール:**
- 5つのツール全てを必ず実行すること
- 順番を変更してはいけない
- エラーでも次のツールに進むこと
- 並列実行禁止（必ず順次実行）
- 各ツール完了後に結果をコメント

📊 **各ツールから抽出すべき重要データ:**
- **買取情報**: 請求書金額、会社名、支払期日、掛目
- **メイン通帳**: 入金履歴、取引パターン、期待値との照合結果
- **個人口座**: 特徴的な使途、取引パターン、事実ベース分析
- **本人確認**: 代表者名、住所、生年月日、書類タイプ（運転免許証/パスポート/マイナンバーカード等）
- **登記簿**: 
  - 処理したファイル名と種類（法人登記/債権譲渡登記）
  - 各企業（申込者/買取/担保）の確認結果
  - 抽出情報（資本金、設立年、代表者）

🎯 **最終出力**: 5つ全ツール実行後に各ツールのsummaryを含めて報告

⚠️ **注意事項**:
- 信頼度やパーセンテージは表示しない
- 事実のみを簡潔に報告`
});
