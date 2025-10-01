import 'dotenv/config';
import { kintoneFetchTool } from './mastra/tools/kintone-fetch-tool';

async function main() {
  const recordId = process.argv[2] || '9918';
  
  try {
    const result = await kintoneFetchTool.execute({ 
      context: { recordId } 
    });
    
    if (result.success) {
      console.log('\n📋 利用可能なファイルフィールド:');
      
      // ファイル関連のフィールドを探す
      const record = result.record;
      const fileFields = [];
      
      // 基本情報
      if (record.basic) {
        Object.entries(record.basic).forEach(([key, value]) => {
          if (key.includes('添付') || key.includes('ファイル')) {
            fileFields.push(`basic.${key}`);
          }
        });
      }
      
      // 買取情報
      if (record.purchase) {
        Object.entries(record.purchase).forEach(([key, value]) => {
          if (key.includes('添付') || key.includes('ファイル')) {
            fileFields.push(`purchase.${key}`);
          }
        });
      }
      
      // その他のフィールドも確認
      if (record.bankStatement) {
        console.log('- メイン通帳＿添付ファイル (確認済み)');
      }
      
      if (record.personalBank) {
        console.log('- サブ通帳＿添付ファイル');
      }
      
      if (record.identity) {
        console.log('- 本人確認書類＿添付ファイル');
      }
      
      if (record.registry) {
        console.log('- 登記簿＿添付ファイル');
      }
      
      console.log('\n全体のデータ構造:');
      console.log(JSON.stringify(result.record, null, 2));
      
    } else {
      console.error('エラー:', result.error);
    }
  } catch (error) {
    console.error('実行エラー:', error);
  }
}

main();