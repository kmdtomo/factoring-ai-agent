#!/usr/bin/env ts-node
import { phase4ReportGenerationWorkflow } from './src/mastra/workflows/phase4-report-generation-workflow';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

/**
 * Phase 4 レポート生成テスト
 *
 * Usage:
 *   npx ts-node test-phase4-report.ts <recordId>
 *
 * Example:
 *   npx ts-node test-phase4-report.ts 10247
 */

const recordId = process.argv[2] || '10247';

async function testPhase4Report() {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`Phase 4 レポート生成テスト - Record ID: ${recordId}`);
  console.log(`${"=".repeat(80)}\n`);

  try {
    // Phase 1-3の結果を読み込む
    const phase1ResultsPath = `./docs/phase-results-${recordId}.md`;
    const phase2ResultsPath = `./docs/phase2-results-${recordId}.md`;
    const phase3ResultsPath = `./docs/phase3-results-${recordId}.md`;

    let phase1Results: any = null;
    let phase2Results: any = null;
    let phase3Results: any = null;

    // Phase 1結果の読み込み（簡易版）
    if (fs.existsSync(phase1ResultsPath)) {
      console.log(`✅ Phase 1結果ファイルを発見: ${phase1ResultsPath}`);
      // 実際のPhase 1結果のJSONを読み込む場合は、適切なJSONファイルを指定
      phase1Results = {
        // ダミーデータ（実際のPhase 1結果に置き換える）
        purchaseDocuments: [],
        collateralDocuments: [],
        purchaseVerification: {
          matches: true,
          details: "一致",
        },
      };
    } else {
      console.log(`⚠️  Phase 1結果ファイルなし`);
    }

    // Phase 2, 3も同様...

    // ワークフロー実行
    console.log(`\n🚀 Phase 4ワークフロー実行開始...\n`);

    const result = await phase4ReportGenerationWorkflow.execute({
      triggerData: {
        recordId,
        phase1Results,
        phase2Results,
        phase3Results,
      },
    });

    console.log(`\n${"=".repeat(80)}`);
    console.log(`✅ Phase 4レポート生成完了`);
    console.log(`${"=".repeat(80)}\n`);

    console.log(`📊 結果サマリー:`);
    console.log(`  - Record ID: ${result.recordId}`);
    console.log(`  - 処理時間: ${result.processingTime}`);
    console.log(`  - レポート文字数: ${result.report.length}文字`);
    console.log(`  - レポート保存先: ${result.phase4Results.reportPath}`);

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📄 生成されたレポート（抜粋）`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    // 最初の1000文字を表示
    console.log(result.report.substring(0, 1000));
    console.log(`\n... (続きは ${result.phase4Results.reportPath} を参照)\n`);

  } catch (error: any) {
    console.error(`\n❌ エラー発生:`, error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testPhase4Report();
