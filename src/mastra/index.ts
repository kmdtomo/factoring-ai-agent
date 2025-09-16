import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { complianceWorkflow } from './workflows/compliance-workflow';
import { complianceWorkflowV2 } from './workflows/compliance-workflow-v2';
import { simpleComplianceWorkflow } from './workflows/simple-compliance-workflow';
import { complianceAgent } from './agents/compliance-agent';
import { complianceAgentV2 } from './agents/compliance-agent-v2';
import { simpleComplianceAgent } from './agents/simple-compliance-agent';
// ツールのインポートは削除（エージェントで既にインポート済み）

export const mastra = new Mastra({
  workflows: { 
    // complianceWorkflow,        // 一時無効化
    // complianceWorkflowV2,      // 一時無効化  
    // simpleComplianceWorkflow   // 一時無効化
  },
  agents: { 
    // complianceAgent,           // 一時無効化
    complianceAgentV2,         // ← テスト対象のみ
    // simpleComplianceAgent      // 一時無効化
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