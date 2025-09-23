import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";
import { 
  egoSearchTool, 
  companyVerifyTool, 
  paymentAnalysisV2Tool,
  ocrPurchaseInfoTool,
  ocrBankStatementTool,
  ocrIdentityToolV2,
  ocrRegistryToolV2,
  ocrCollateralTool,
} from "../tools";

// ファクタリング審査を包括的に実行するエージェント v2
export const complianceAgentV2 = new Agent({
  name: "compliance-agent-v2",
  description: "ファクタリング審査を包括的に実行するエージェント（新評価軸版）",
  model: openai("gpt-4.1"),
  
  tools: {
    ocrPurchaseInfoTool,
    ocrBankStatementTool,
    ocrIdentityToolV2,
    ocrRegistryToolV2,
    egoSearchTool,
    companyVerifyTool,
    ocrCollateralTool,
    paymentAnalysisV2Tool,
  },
  instructions: `ファクタリング審査の専門AIです。recordIdを受け取ったら以下を順番に実行：

1. ocrPurchaseInfoTool - 請求書OCR + 買取情報テーブル取得
2. ocrBankStatementTool - 通帳OCR + 担保情報テーブル取得 (recordId, isMainAccount: true)
3. ocrIdentityToolV2 - 本人確認書類OCR + 基本情報取得
4. ocrRegistryToolV2 - 登記簿OCR + 謄本情報テーブル取得
5. egoSearchTool - 代表者信用調査（identityの結果使用）
6. companyVerifyTool - 企業実在性確認（identityの結果使用）
7. paymentAnalysisV2Tool - 全データ統合 + 最終スコアリング

重要: 
- 各ツールは必要なKintoneデータも同時取得します
- 各ツール実行前後に「[AGENT DEBUG] ツール名開始/完了」とログ出力すること
- ツールがエラーになっても必ず次のツールに進み、最後まで実行してください
- 途中で停止せず、必ず7番まで実行してください
- 各ツールの結果に関係なく、次のツールに進んでください
- 完了まで絶対に停止しないでください`
});

// スコア計算のヘルパー関数
export function calculateScore(evaluation: any): number {
  let score = 0;
  
  // 1. 買取債権評価
  const kakeme = evaluation.purchase?.kakemeRate || 100;
  if (kakeme <= 80) score += 20;
  else if (kakeme <= 85) score += 10;
  
  if (evaluation.invoice?.match === 'match') score += 10;
  else if (evaluation.invoice?.match === 'unknown') score += 5;
  else if (evaluation.invoice?.match === 'mismatch') score -= 10;
  
  if (evaluation.invoice?.hasRegistration) score += 5;
  else score -= 3;
  
  // 2. 担保評価
  const coverageRate = evaluation.collateral?.coverageRate || 0;
  if (coverageRate >= 100) score += 20;
  else if (coverageRate >= 80) score += 10;
  
  const variability = evaluation.collateral?.variability || 100;
  if (variability <= 15) score += 20;
  else if (variability <= 30) score += 10;
  
  // 3. 企業信用力
  const establishYear = evaluation.company?.establishYear;
  if (establishYear && establishYear < 1989) score += 10;
  else if (establishYear && establishYear < 2000) score += 8;
  else if (establishYear && establishYear < 2019) score += 5;
  else score += 2;
  
  const capital = evaluation.company?.capital || 0;
  if (capital >= 10000000) score += 10;
  else if (capital >= 5000000) score += 7;
  else if (capital >= 2000000) score += 3;
  
  // 4. 申込者評価
  score += 10; // 基本点
  
  if (evaluation.applicant?.licenseColor === 'gold') score += 5;
  else if (evaluation.applicant?.licenseColor === 'green') score -= 3;
  
  if (evaluation.applicant?.violations >= 3) score -= 5;
  
  // 補助評価の減点
  if (evaluation.supplementary?.hasNegativeInfo) score -= 5;
  if (!evaluation.supplementary?.companyVerified) score -= 5;
  
  return Math.max(0, Math.min(100, score));
}

// リスクレベル判定
export function getRiskLevel(score: number): string {
  if (score >= 80) return '低';
  if (score >= 60) return '中';
  return '高';
}

// 推奨アクション判定
export function getRecommendedAction(score: number): string {
  if (score >= 80) return '承認推奨';
  if (score >= 60) return '条件付き承認';
  return '要再検討';
}