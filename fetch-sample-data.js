#!/usr/bin/env node
import { mastra } from './.mastra/output/index.mjs';
import fs from 'fs';

const recordIds = ['9918', '10240', '10247'];

console.log('📊 サンプルデータ取得開始');
console.log(`対象レコード: ${recordIds.join(', ')}\n`);

async function fetchData() {
  const results = {};

  for (const recordId of recordIds) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`📋 Record ID: ${recordId}`);
    console.log("=".repeat(60));

    try {
      // 統合ワークフローを実行（Phase 1-4の全データを取得）
      const result = await mastra.workflows.integratedWorkflow.execute({
        recordId: recordId
      });

      results[recordId] = {
        recordId,
        kintoneData: {
          氏名: result.phase1Results?.kintoneData?.氏名 || result.氏名,
          生年月日: result.phase1Results?.kintoneData?.生年月日 || result.生年月日,
          屋号: result.phase1Results?.kintoneData?.屋号 || result.屋号,
          会社名: result.phase1Results?.kintoneData?.会社名 || result.会社名,
          買取額: result.phase1Results?.kintoneData?.買取額 || result.買取額,
          総債権額: result.phase1Results?.kintoneData?.総債権額 || result.総債権額,
          買取情報: result.phase1Results?.kintoneData?.買取情報 || result.買取情報,
          担保情報: result.phase1Results?.kintoneData?.担保情報 || result.担保情報,
        },
        phase1Results: result.phase1Results,
        phase2Results: result.phase2Results,
        phase3Results: result.phase3Results,
        phase4Results: {
          最終判定: result.最終判定,
          リスクレベル: result.リスクレベル,
          総評: result.総評,
          回収可能性評価: result.回収可能性評価,
          担保の安定性評価: result.担保の安定性評価,
          申込者信頼性評価: result.申込者信頼性評価,
          リスク要因評価: result.リスク要因評価,
        }
      };

      console.log(`✅ ${recordId}: データ取得完了`);
      console.log(`   - 最終判定: ${result.最終判定}`);
      console.log(`   - リスクレベル: ${result.リスクレベル}`);

    } catch (error) {
      console.error(`❌ ${recordId}: エラー - ${error.message}`);
      results[recordId] = { error: error.message };
    }
  }

  // JSONファイルに保存
  const outputPath = './.docs/sample-data.json';
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf-8');

  console.log(`\n${"=".repeat(60)}`);
  console.log(`✅ 全データ取得完了`);
  console.log(`💾 保存先: ${outputPath}`);
  console.log("=".repeat(60));
}

fetchData().catch(console.error);
