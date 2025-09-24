import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";
import { 
  ocrIdentityToolV2,
  ocrRegistryToolV2,
} from "../tools";

// Phase 1B: OCR-Light専門エージェント - 軽量書類処理に特化
export const phase1bOcrLightAgent = new Agent({
  name: "phase1b-ocr-light-agent",
  description: "軽量OCR処理専門エージェント - 本人確認書類、登記簿の軽量書類処理",
  model: openai("gpt-4o"), // GPT-4oに変更してレート制限回避
  
  tools: {
    ocrIdentityToolV2,
    ocrRegistryToolV2,
  },
  
  instructions: `軽量OCR処理の専門AIです。recordIdを受け取ったら**必ず以下の順番で確実に全て実行**してください：

🔥 **重要**: 必ず1→2の順番で全ツールを実行すること。スキップ厳禁！

📋 **必須実行手順（この順番を厳守）:**
1. 🚀 **最初に必ず**: ocrIdentityToolV2 を実行
   - 引数: recordId のみ指定
   - 完了まで待機→結果確認

2. 🚀 **2番目に必ず**: ocrRegistryToolV2 を実行
   - 引数: recordId のみ指定
   - 完了まで待機→結果確認

🚨 **絶対ルール:**
- 2つのツール全てを必ず実行すること
- 順番を変更してはいけない
- エラーでも次のツールに進むこと
- 並列実行禁止（必ず順次実行）
- 各ツール完了後に結果をコメント

📊 **各ツールから抽出すべき重要データ:**
- **本人確認**: 代表者名、住所、生年月日、書類タイプ
- **登記簿**: 
  - 処理したファイル名と種類（法人登記/債権譲渡登記）
  - 各企業（申込者/買取/担保）の確認結果
  - 抽出情報（資本金、設立年、代表者）

📝 **登記簿OCRの出力形式**:
登記簿OCR結果:
- 処理ファイル: [ファイル名1(種類), ファイル名2(種類)]
- 確認企業:
  申込者: 企業名 → 登記確認済/資本金/設立年
  買取企業: 企業名 → 登記確認済/未確認

🎯 **最終出力**: 2つ全ツール実行後に各ツールのsummaryを含めて報告

⚠️ **処理終了**: 全ての報告が完了したら即座に応答を終了すること。追加の分析や説明は不要。`
});
