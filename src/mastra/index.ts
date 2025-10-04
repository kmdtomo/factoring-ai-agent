import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { complianceWorkflow } from './workflows/compliance-workflow';
import { complianceWorkflowV2 } from './workflows/compliance-workflow-v2';
import { simpleComplianceWorkflow } from './workflows/simple-compliance-workflow';
import { multiAgentComplianceWorkflow } from './workflows/multi-agent-compliance-workflow';
import { splitPhaseWorkflow } from './workflows/split-phase-workflow';
import { agentBasedComplianceWorkflow } from './workflows/agent-based-compliance-workflow';
import { phase1PurchaseCollateralWorkflow } from './workflows/phase1-purchase-collateral-workflow';
import { phase2BankStatementWorkflow } from './workflows/phase2-bank-statement-workflow';
import { phase3VerificationWorkflow } from './workflows/phase3-verification-workflow';
import { phase4FinalAnalysisWorkflow } from './workflows/phase4-final-analysis-workflow';
import { complianceAgent } from './agents/compliance-agent';
import { complianceAgentV2 } from './agents/compliance-agent-v2';
import { simpleComplianceAgent } from './agents/simple-compliance-agent';
import { phase1OcrAgent } from './agents/phase1-ocr-agent';
import { phase1aOcrHeavyAgent } from './agents/phase1a-ocr-heavy-agent';
import { phase1bOcrLightAgent } from './agents/phase1b-ocr-light-agent';
import { phase2ResearchAgent } from './agents/phase2-research-agent';
import { phase3AnalysisAgent } from './agents/phase3-analysis-agent';
import { phase1PurchaseCollateralAgent } from './agents/phase1-purchase-collateral-agent';
import { phase1PurchaseCollateralAgentVNext, phase1PurchaseCollateralAgentGPT4VNext } from './agents/phase1-purchase-collateral-agent-vnext';
import { phase1PurchaseCollateralAgentV2 } from './agents/phase1-purchase-collateral-agent-v2';
import { phase1PurchaseCollateralAgentSimplePrompt } from './agents/phase1-purchase-collateral-agent-simple-prompt';
import { phase1PurchaseCollateralAgentWorking } from './agents/phase1-purchase-collateral-agent-working';
// ツールのインポートは削除（エージェントで既にインポート済み）

export const mastra = new Mastra({
  workflows: { 
    // complianceWorkflow,        // 一時無効化
    // complianceWorkflowV2,      // 一時無効化  
    // simpleComplianceWorkflow,  // 一時無効化
    // multiAgentComplianceWorkflow, // 旧版（ツール直接呼び出し）
    // splitPhaseWorkflow,           // 旧版（データ受け渡しなし）
    agentBasedComplianceWorkflow,    // ← エージェントベース版（7000文字問題あり）
    phase1PurchaseCollateralWorkflow, // ← Phase 1：エージェントレス設計（推奨）
    phase2BankStatementWorkflow,      // ← Phase 2：通帳分析（NEW）
    phase3VerificationWorkflow,       // ← Phase 3：本人確認・企業実在性確認（NEW）
    phase4FinalAnalysisWorkflow,      // ← Phase 4：最終分析・レポート生成（NEW）
  },
  agents: { 
    // complianceAgentV2,         // ワークフロー完成により一時無効化
    phase1OcrAgent,            // ← Playground用に有効化（旧版）
    phase1aOcrHeavyAgent,      // ← Split版：重い画像処理
    phase1bOcrLightAgent,      // ← Split版：軽量書類処理
    phase2ResearchAgent,       // ← Playground用に有効化
    phase3AnalysisAgent,       // ← Playground用に有効化
    phase1PurchaseCollateralAgent, // ← 買取・担保情報エージェント（旧版）
    phase1PurchaseCollateralAgentVNext, // ← V2モデル対応版（Claude）
    phase1PurchaseCollateralAgentGPT4VNext, // ← V2モデル対応版（GPT-4）
    phase1PurchaseCollateralAgentV2, // ← V2モデル完全対応版（推奨）
    phase1PurchaseCollateralAgentSimplePrompt, // ← プロンプトに直接データを入れる版
    phase1PurchaseCollateralAgentWorking, // ← 動作確認版（要約ツール付き）
  },
  telemetry: {
    enabled: false
  },
  storage: new LibSQLStore({
    // stores telemetry, evals, ... into memory storage, if it needs to persist, change to file:../mastra.db
    url: ":memory:",
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
});

export default mastra;