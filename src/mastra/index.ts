import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { complianceWorkflow } from './workflows/compliance-workflow';
import { complianceWorkflowV2 } from './workflows/compliance-workflow-v2';
import { complianceAgent } from './agents/compliance-agent';
import { complianceAgentV2 } from './agents/compliance-agent-v2';
// ツールのインポートは削除（エージェントで既にインポート済み）

export const mastra = new Mastra({
  workflows: { 
    complianceWorkflow,
    complianceWorkflowV2 
  },
  agents: { 
    complianceAgent,
    complianceAgentV2
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