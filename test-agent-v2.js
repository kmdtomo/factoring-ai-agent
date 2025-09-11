import { complianceAgentV2 } from './src/mastra/agents/compliance-agent-v2.js';
import { kintoneFetchTool } from './src/mastra/tools/index.js';

// Test the agent with record ID 9918
async function testAgent() {
  try {
    console.log('Testing compliance agent v2 with record ID: 9918');
    
    // First, let's fetch the data to see what we're working with
    const kintoneData = await kintoneFetchTool.execute({
      context: { recordId: '9918' }
    });
    
    console.log('\n--- Kintone Data ---');
    console.log('買取債権額（合計）:', kintoneData.purchases?.[0]?.['買取債権額（合計）']);
    console.log('買取額（合計）:', kintoneData.purchases?.[0]?.['買取額（合計）']);
    console.log('第三債務者:', kintoneData.purchases?.[0]?.['会社名_第三債務者_買取']);
    
    // Now run the agent
    const message = `レコードID: 9918 のファクタリング審査を実施してください。`;
    
    const response = await complianceAgentV2.generate(
      [{ role: 'user', content: message }],
      { 
        maxSteps: 20,
        onStepFinish: (step) => {
          if (step.toolCalls && step.toolCalls.length > 0) {
            step.toolCalls.forEach((toolCall) => {
              console.log(`\n[Tool Called] ${toolCall.toolName}`);
            });
          }
        }
      }
    );
    
    console.log('\n--- Agent Response ---');
    console.log(response.text);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testAgent();