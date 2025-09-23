import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";
import { 
  egoSearchTool,
  companyVerifyTool,
} from "../tools";

// Phase 2: 外部調査専門エージェント - 信用調査に特化
export const phase2ResearchAgent = new Agent({
  name: "phase2-research-agent",
  description: "外部調査専門エージェント - 代表者信用調査と企業実在性確認",
  model: openai("gpt-4o"),
  
  tools: {
    egoSearchTool,
    companyVerifyTool,
  },
  
  instructions: `外部調査専門AIです。代表者名と会社名を受け取って信用調査を実行：

🔍 **実行手順:**
1. egoSearchTool → 代表者名で信用情報検索  
2. companyVerifyTool → 会社名で実在性確認

🎯 **調査観点:**
- **代表者リスク**: 詐欺履歴、金融トラブル、評判  
- **企業リスク**: 実在性、信用度、ビジネス実態
- **総合評価**: 外部リスクレベル算出

📊 **リスク評価基準:**
- **低リスク**: ネガティブ情報なし + 企業実在確認済み
- **中リスク**: 軽微な懸念事項あり  
- **高リスク**: 重大なネガティブ情報あり

✅ **出力要件:**
- 調査結果の詳細ログ
- リスクレベルの根拠明記
- 次フェーズへの推奨事項
- JSON形式での構造化出力

**入力例**: 
- representativeName: "中山葵"
- companyName: "株式会社中山総業"`
});
