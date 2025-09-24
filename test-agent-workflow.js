#!/usr/bin/env node
import { mastra } from './src/mastra/index.js';

// コマンドライン引数からrecordIdを取得（デフォルト: 10042）
const recordId = process.argv[2] || '10042';

console.log('🚀 エージェントベース・コンプライアンスワークフロー実行開始');
console.log(`📋 Record ID: ${recordId}`);
console.log('========================================\n');

async function runWorkflow() {
  try {
    // ワークフローを実行
    const startTime = Date.now();
    
    const result = await mastra.workflows.agentBasedComplianceWorkflow.execute({
      recordId: recordId
    });
    
    const endTime = Date.now();
    const executionTime = ((endTime - startTime) / 1000).toFixed(1);
    
    console.log('\n========================================');
    console.log('✅ ワークフロー実行完了');
    console.log(`⏱️  実行時間: ${executionTime}秒`);
    console.log('========================================\n');
    
    console.log('📊 最終推奨判定:', result.recommendation);
    console.log('\n📄 最終分析レポート:');
    console.log('----------------------------------------');
    console.log(result.finalReport);
    console.log('----------------------------------------');
    
  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
    console.error('\nエラー詳細:', error.stack);
    process.exit(1);
  }
}

// 実行
runWorkflow().catch(console.error);