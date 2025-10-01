import 'dotenv/config';
import { testGoogleVisionTool } from './mastra/tools/test-google-vision-tool';

async function main() {
  const recordId = process.argv[2] || '9918';
  
  console.log(`Testing Google Vision tool with record ID: ${recordId}`);
  console.log('Environment check:');
  console.log('- KINTONE_DOMAIN:', process.env.KINTONE_DOMAIN ? 'Set' : 'Not set');
  console.log('- KINTONE_API_TOKEN:', process.env.KINTONE_API_TOKEN ? 'Set' : 'Not set');
  console.log('- KINTONE_APP_ID:', process.env.KINTONE_APP_ID || '37');
  console.log('- GOOGLE_APPLICATION_CREDENTIALS:', process.env.GOOGLE_APPLICATION_CREDENTIALS ? 'Set' : 'Not set');
  
  try {
    const result = await testGoogleVisionTool.execute({ 
      context: { recordId } 
    });
    
    console.log('\n=== 実行結果 ===');
    console.log('Success:', result.success);
    console.log('Processing Details:', result.processingDetails);
    
    if (result.success) {
      console.log('\n=== 抽出されたテキスト ===');
      console.log('文字数:', result.extractedText.fullText.length);
      console.log('信頼度:', result.extractedText.confidence);
      
      // トークン数の概算（日本語は1文字≒1トークン、英数字は4文字≒1トークン）
      const japaneseChars = (result.extractedText.fullText.match(/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/g) || []).length;
      const asciiChars = (result.extractedText.fullText.match(/[a-zA-Z0-9]/g) || []).length;
      const estimatedTokens = japaneseChars + Math.ceil(asciiChars / 4);
      
      console.log('\n=== トークン数とコスト比較 ===');
      console.log('推定トークン数:', estimatedTokens.toLocaleString());
      console.log('\n📊 コスト比較:');
      console.log('- Google Vision API: $1.50 / 1,000ページ = $0.0015 / ページ');
      console.log('- Claude 3.5 Sonnet: $3 / 1M入力トークン + $15 / 1M出力トークン');
      console.log('- GPT-4 Vision: $10 / 1M入力トークン + $30 / 1M出力トークン');
      
      // 実際のコスト計算
      const googleVisionCost = 0.0015; // 1ページあたり
      const claudeInputCost = (estimatedTokens / 1000000) * 3; // 入力コスト
      const claudeOutputCost = (estimatedTokens / 1000000) * 15; // 出力コスト（同じ量と仮定）
      const claudeTotalCost = claudeInputCost + claudeOutputCost;
      const gpt4InputCost = (estimatedTokens / 1000000) * 10;
      const gpt4OutputCost = (estimatedTokens / 1000000) * 30;
      const gpt4TotalCost = gpt4InputCost + gpt4OutputCost;
      
      console.log('\n💰 このドキュメントのOCRコスト:');
      console.log(`- Google Vision API: $${googleVisionCost.toFixed(4)}`);
      console.log(`- Claude 3.5 Sonnet: $${claudeTotalCost.toFixed(4)} (${(claudeTotalCost / googleVisionCost).toFixed(1)}倍)`);
      console.log(`- GPT-4 Vision: $${gpt4TotalCost.toFixed(4)} (${(gpt4TotalCost / googleVisionCost).toFixed(1)}倍)`);
      
      console.log('\n🚀 Google Vision APIの利点:');
      console.log('- 純粋なOCRのため高速');
      console.log('- コストが大幅に安い');
      console.log('- API制限が緩い（並列処理しやすい）');
      console.log('- 画像とPDFの両方をサポート');
      
      console.log('\n最初の500文字:');
      console.log(result.extractedText.fullText.substring(0, 500));
    } else {
      console.log('Error:', result.error);
    }
  } catch (error) {
    console.error('\n=== エラー発生 ===');
    console.error(error);
  }
}

main().catch(console.error);