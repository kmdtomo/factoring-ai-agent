import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { complianceWorkflow } from './workflows/compliance-workflow';
import { complianceWorkflowV2 } from './workflows/compliance-workflow-v2';
import { simpleComplianceWorkflow } from './workflows/simple-compliance-workflow';
import { multiAgentComplianceWorkflow } from './workflows/multi-agent-compliance-workflow';
import { splitPhaseWorkflow } from './workflows/split-phase-workflow';
import { complianceAgent } from './agents/compliance-agent';
import { complianceAgentV2 } from './agents/compliance-agent-v2';
import { simpleComplianceAgent } from './agents/simple-compliance-agent';
import { phase1OcrAgent } from './agents/phase1-ocr-agent';
import { phase1aOcrHeavyAgent } from './agents/phase1a-ocr-heavy-agent';
import { phase1bOcrLightAgent } from './agents/phase1b-ocr-light-agent';
import { phase2ResearchAgent } from './agents/phase2-research-agent';
import { phase3AnalysisAgent } from './agents/phase3-analysis-agent';
// ツールのインポートは削除（エージェントで既にインポート済み）

export const mastra = new Mastra({
  workflows: { 
    // complianceWorkflow,        // 一時無効化
    // complianceWorkflowV2,      // 一時無効化  
    // simpleComplianceWorkflow,  // 一時無効化
    multiAgentComplianceWorkflow, // ← マルチエージェント版
    splitPhaseWorkflow,           // ← Split-Phase版（重い処理分割）
  },
  agents: { 
    // complianceAgentV2,         // ワークフロー完成により一時無効化
    phase1OcrAgent,            // ← Playground用に有効化（旧版）
    phase1aOcrHeavyAgent,      // ← Split版：重い画像処理
    phase1bOcrLightAgent,      // ← Split版：軽量書類処理
    phase2ResearchAgent,       // ← Playground用に有効化
    phase3AnalysisAgent,       // ← Playground用に有効化
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