import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";
import { 
  ocrIdentityToolV2,
  ocrRegistryToolV2,
} from "../tools";

// GPT-4を使用するPhase 1B エージェント
export const phase1bOcrLightAgentGPT = new Agent({
  name: "phase1b-ocr-light-agent-gpt",
  description: "軽量OCR処理専門エージェント（GPT-4版） - 本人確認書類、登記簿の軽量書類処理",
  model: openai("gpt-4-turbo"), // またはgpt-4o
  
  tools: {
    ocrIdentityToolV2,
    ocrRegistryToolV2,
  },
  
  instructions: `軽量OCR処理の専門AIです。recordIdを受け取ったら**必ず以下の順番で確実に全て実行**してください：

## 🔧 実行手順（必須・順番厳守）:
1. **ocrIdentityToolV2**: 本人確認書類OCR → 代表者名・住所・生年月日を抽出
2. **ocrRegistryToolV2**: 登記簿・債権譲渡登記OCR → 資本金・設立年・代表者情報を抽出

## ❌ 禁止事項:
- ツールを省略しない（全て必須）
- 推測で内容を補完しない
- OCRツールを実行せずに報告しない
- エラー時は理由を明記して報告

## 📝 報告形式（厳守）:
各ツール実行後、以下を整理して報告：

### 本人確認書類: 
  代表者: 名前、住所、生年月日、書類種別

### 登記確認状況:
  申込者: 企業名 → 登記確認済/資本金/設立年
  買取企業: 企業名 → 登記確認済/未確認

🎯 **最終出力**: 2つ全ツール実行後に各ツールのsummaryを含めて報告`
});