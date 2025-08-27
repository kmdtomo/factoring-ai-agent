import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { complianceWorkflow } from './workflows/compliance-workflow';
import { complianceAgent } from './agents/compliance-agent';
// ツールのインポートは削除（エージェントで既にインポート済み）

export const mastra = new Mastra({
  workflows: { complianceWorkflow },
  agents: { 
    complianceAgent
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