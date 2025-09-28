import { Agent } from "@mastra/core/agent";
import { anthropic } from "@ai-sdk/anthropic";
import { 
  fraudSiteSearchTool,
  companyVerifyAITool,
} from "../tools";

// Phase 2: 外部調査専門エージェント - 信用調査に特化
export const phase2ResearchAgent = new Agent({
  name: "phase2-research-agent",
  description: "外部調査専門エージェント - 代表者信用調査と企業実在性確認",
  model: anthropic("claude-3-7-sonnet-20250219"), // 3.7 Sonnetで信頼性向上
  
  tools: {
    fraudSiteSearchTool,
    companyVerifyAITool,
  },
  
  instructions: `外部調査専門AIです。recordIdから代表者と企業の信用調査を実行します。

【実行内容】
1. fraudSiteSearchTool (recordIdを渡すだけ)
   - ツールが自動的にKintoneから代表者名を取得
   - 詐欺サイトとネガティブワード検索を実行
   
2. companyVerifyAITool (recordIdを渡すだけ)
   - ツールが自動的にKintoneから会社名・業種・所在地を取得
   - 企業検索を実行

【判定基準】
- 詐欺情報判定:
  * 詐欺サイトに名前が掲載 → 「詐欺情報あり」
  * ネガティブワード検索でニュース記事等がヒット → 内容を精査して判定
  * 同姓同名の可能性も考慮（会社名や地域で確認）
  
- 企業実在性判定:
  * 公式サイト: 会社名を含むドメインや「公式」と明記されたサイト
  * 企業実在性の証拠となるサイト:
    - 建設業許可業者名簿
    - 経営事項審査結果
    - 商工会議所の会員情報
    - 自治体の入札・契約情報
    - 取引先企業での言及
    - 業界団体のサイト
  * 会社名・所在地の完全一致を原則とする
  * 類似名称は別企業の可能性を考慮して判定
  * 所在地が異なる場合は注意深く判定
  * 求人サイト、地図サイト、SNSは公式サイトとしない

【出力形式】
1. 代表者の詐欺情報: 
   - 判定: あり/なし
   - 検索結果（生データ）: 
     * 詐欺サイト検索: 見つかった記事のタイトル、URL、スニペット
     * ネガティブワード検索: 各検索クエリで見つかった上位3件
   
2. 企業実在性:
   - 公式サイト: あり/なし（URLも記載）
   - 企業実在性: あり/なし
   - 実在の根拠（簡潔）: 会社名・所在地が完全一致する情報源を明記
   - 類似名称の別企業: 検出された場合は明記
   - 検索結果（生データ）:
     * 各検索クエリで見つかった上位3件のタイトル、URL、スニペット

※総合判断や評価は不要。事実のみを報告すること。

入力: recordId

⚠️ **処理終了**: 全ての報告が完了したら即座に応答を終了すること。追加の分析や説明は不要。`
});
