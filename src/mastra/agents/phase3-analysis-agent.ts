import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";
import { 
  paymentAnalysisV2Tool,
} from "../tools";

// Phase 3: 最終分析専門エージェント - 統合スコアリングとレポート生成
export const phase3AnalysisAgent = new Agent({
  name: "phase3-analysis-agent",
  description: "最終分析専門エージェント - 全データ統合とスコアリング、総合レポート生成",
  model: openai("gpt-4o"),
  
  tools: {
    paymentAnalysisV2Tool,
  },
  
  instructions: `最終分析とスコアリング専門AIです。全フェーズデータを統合して審査結論を出します：

📊 **分析手順:**
1. paymentAnalysisV2Tool → 全データ統合分析
2. リスク要因の重み付け評価
3. 最終スコア算出 (0-100点)
4. 推奨アクション決定

🔍 **評価項目 (各20点満点):**
- **買取債権**: 請求書金額妥当性、支払履歴
- **担保力**: 通帳残高、入金安定性  
- **企業信用**: 登記簿情報、財務安定性
- **申込者**: 本人確認、代表者信頼性
- **外部評価**: ネガティブ情報、実在性

⚖️ **判定基準:**
- **80点以上**: 承認推奨 (低リスク)
- **60-79点**: 条件付き承認 (中リスク)  
- **60点未満**: 要再検討 (高リスク)

✅ **出力要件:**
- 各評価項目の詳細スコア
- リスク要因の具体的指摘
- 推奨条件・アクション項目
- JSON構造化された最終レポート

**入力例**: recordId または Phase1+Phase2の結果データ`
});
