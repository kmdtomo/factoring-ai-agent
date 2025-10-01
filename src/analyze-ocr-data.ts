import 'dotenv/config';
import { googleVisionOcrTool } from './mastra/tools/google-vision-ocr-tool';
import fs from 'fs';

async function analyzeTransactionDates() {
  const recordId = '9918';
  
  try {
    console.log('📋 通帳データの期間を分析中...\n');
    
    const result = await googleVisionOcrTool.execute({ 
      context: { 
        recordId,
        fieldName: 'メイン通帳＿添付ファイル',
        maxPages: 5,
      } 
    });
    
    if (result.success && result.extractedData[0]) {
      const ocrText = result.extractedData[0].text;
      
      // 日付パターンを検索（2007年7月の取引）
      const datePattern = /(\d{4}年)?(\d{1,2})月(\d{1,2})日/g;
      const dates = [];
      let match;
      
      while ((match = datePattern.exec(ocrText)) !== null) {
        const year = match[1] ? match[1].replace('年', '') : '2007';
        const month = match[2].padStart(2, '0');
        const day = match[3].padStart(2, '0');
        
        // 2007年7月のデータのみ収集
        if (year === '2007' && month === '07') {
          dates.push({
            dateStr: `${year}年${month}月${day}日`,
            position: match.index,
            context: ocrText.substring(match.index - 50, match.index + 100).replace(/\n/g, ' ')
          });
        }
      }
      
      // ページ番号を探す
      const pagePattern = /ページ\s*(\d+)|P\s*(\d+)|頁\s*(\d+)|(\d+)\s*\/\s*\d+/g;
      const pages = [];
      while ((match = pagePattern.exec(ocrText)) !== null) {
        const pageNum = match[1] || match[2] || match[3] || match[4];
        pages.push({
          page: parseInt(pageNum),
          position: match.index
        });
      }
      
      console.log('🗓️ 2007年7月の取引日付:');
      dates.forEach(date => {
        console.log(`  - ${date.dateStr}`);
        console.log(`    場所: 文字位置 ${date.position}`);
        console.log(`    コンテキスト: ...${date.context.trim()}...`);
      });
      
      if (dates.length > 0) {
        const firstDate = dates[0].dateStr;
        const lastDate = dates[dates.length - 1].dateStr;
        console.log(`\n📊 期間: ${firstDate} 〜 ${lastDate}`);
        console.log(`   合計 ${dates.length} 件の日付が見つかりました`);
      }
      
      console.log('\n📄 ページ情報:');
      pages.forEach(p => {
        console.log(`  - ページ ${p.page} (文字位置: ${p.position})`);
      });
      
      // 最後の取引がどのページにあるか確認
      if (dates.length > 0 && pages.length > 0) {
        const lastDatePosition = dates[dates.length - 1].position;
        let lastDatePage = 1;
        
        for (let i = pages.length - 1; i >= 0; i--) {
          if (pages[i].position < lastDatePosition) {
            lastDatePage = pages[i].page;
            break;
          }
        }
        
        console.log(`\n✅ 最後の取引（${dates[dates.length - 1].dateStr}）はページ ${lastDatePage} 付近にあります`);
      }
      
      // OCRテキスト全体を保存して確認
      console.log('\n💾 OCRテキスト全体を保存中...');
      fs.writeFileSync('ocr-output.txt', ocrText, 'utf8');
      console.log('   ocr-output.txt に保存しました');
      
      // 様々な日付フォーマットを試す
      console.log('\n🔍 様々な日付フォーマットで検索:');
      
      // 07 7のパターンを探す
      const patterns = [
        /07\s*7\s*(\d{1,2})/g,  // 07 7 1 の形式
        /7\s*(\d{1,2})\s*[^\d]/g,  // 7 1 の形式
        /(\d{1,2})\s*\/\s*(\d{1,2})/g,  // 7/1 の形式
        /H19.*?(\d{1,2}).*?(\d{1,2})/g,  // 平成19年の形式
        /2007.*?(\d{1,2}).*?(\d{1,2})/g,  // 2007年の形式
      ];
      
      patterns.forEach((pattern, index) => {
        const matches = [...ocrText.matchAll(pattern)];
        if (matches.length > 0) {
          console.log(`\nパターン${index + 1}: ${pattern.source}`);
          matches.slice(0, 5).forEach(match => {
            console.log(`  - マッチ: "${match[0]}" (位置: ${match.index})`);
            console.log(`    コンテキスト: ${ocrText.substring(match.index - 20, match.index + 50).replace(/\n/g, ' ')}`);
          });
        }
      });
      
      // "月"を含む行を探す
      console.log('\n📅 "月"を含む行:');
      const lines = ocrText.split('\n');
      lines.forEach((line, index) => {
        if (line.includes('月') && (line.includes('7') || line.includes('07'))) {
          console.log(`  行${index + 1}: ${line}`);
        }
      });
      
    }
  } catch (error) {
    console.error('エラー:', error);
  }
}

analyzeTransactionDates();