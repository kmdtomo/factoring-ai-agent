import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { simpleComplianceWorkflow } from "../workflows/simple-compliance-workflow";

// Workflowを呼び出すステップ
const callWorkflowStep = createStep({
  id: "call-workflow",
  description: "シンプルなコンプライアンスワークフローを実行",
  inputSchema: z.object({
    recordId: z.string(),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
  execute: async ({ inputData }) => {
    console.log(`[Agent] recordId: ${inputData.recordId} の審査開始`);
    
    // ワークフローを実行
    const run = simpleComplianceWorkflow.createRun();
    const result = await run.start({ inputData });
    
    if (result.status === "success") {
      const workflowResult = (result as any).result;
      console.log(`[Agent] 審査完了: ${workflowResult.success ? '成功' : '一部エラー'}`);
      
      return { 
        result: workflowResult.report 
      };
    } else {
      throw new Error(`ワークフロー実行失敗: ${(result as any).error}`);
    }
  },
});

// シンプルなコンプライアンスエージェント
export const simpleComplianceAgent = new Agent({
  name: "simple-compliance-agent",
  description: "ファクタリング審査を実行するシンプルなエージェント",
  model: openai("gpt-4.1"),
  tools: {}, // ツールは持たない（Workflowに委譲）
  workflows: {
    // Agent内にWorkflowを組み込み
    complianceWorkflow: createWorkflow({
      id: "simple-compliance-agent-workflow",
      description: "エージェント用のシンプルなワークフロー",
      inputSchema: z.object({
        recordId: z.string(),
      }),
      outputSchema: z.object({
        result: z.string(),
      }),
    })
    .then(callWorkflowStep)
    .commit()
  },
  instructions: `あなたはファクタリング審査の専門エージェントです。

## 動作方式
recordIdを受け取ったら、組み込まれたワークフローが自動的に以下を実行します：

### 実行内容
1. **Phase 1**: Kintoneデータ取得
2. **Phase 2**: OCR処理
   - 買取情報準備 + 請求書OCR
   - 通帳OCR（担保情報との照合）
   - 本人確認書類OCR
3. **Phase 3**: 検索・確認（並列実行）
   - エゴサーチ（代表者の信用調査）
   - 企業実在性確認
4. **Phase 4**: 統合分析
   - paymentAnalysisV2Toolでスコアリング
   - 総合判定とレポート生成

### 特徴
- **シンプル**: 1つのWorkflow、1つのAgent
- **確実**: 要件書v2.2に基づく処理フロー
- **保守性**: 分かりやすい構造

recordIdを入力するだけで、完全な審査レポートが生成されます。`
});
