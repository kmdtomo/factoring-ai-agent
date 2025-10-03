/**
 * テストスクリプト: textAnnotationsを使ったOCR処理
 * バッチ処理を使わず、1ページずつ処理してtextAnnotationsを取得
 */

import vision from '@google-cloud/vision';
import axios from 'axios';
import path from 'path';
import dotenv from 'dotenv';

// 環境変数の確認
dotenv.config();

const authPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (authPath && !path.isAbsolute(authPath)) {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(process.cwd(), authPath);
}

const visionClient = new vision.ImageAnnotatorClient();

const KINTONE_DOMAIN = process.env.KINTONE_DOMAIN;
const KINTONE_API_TOKEN = process.env.KINTONE_API_TOKEN;
const APP_ID = process.env.KINTONE_APP_ID || "37";
const RECORD_ID = "9918";

async function main() {
  console.log('='.repeat(80));
  console.log('テキストアノテーション取得テスト');
  console.log('='.repeat(80));
  console.log(`RecordID: ${RECORD_ID}\n`);

  try {
    // 1. Kintoneからレコード取得
    console.log('[1/4] Kintoneからレコード取得中...');
    const recordUrl = `https://${KINTONE_DOMAIN}/k/v1/records.json?app=${APP_ID}&query=$id="${RECORD_ID}"`;

    const recordResponse = await axios.get(recordUrl, {
      headers: { "X-Cybozu-API-Token": KINTONE_API_TOKEN },
    });

    const record = recordResponse.data.records[0];
    const mainBankFiles = record["メイン通帳＿添付ファイル"]?.value || [];

    if (mainBankFiles.length === 0) {
      console.log('エラー: メイン通帳ファイルが見つかりません');
      return;
    }

    console.log(`  - メイン通帳ファイル: ${mainBankFiles.length}件\n`);

    // 2. ファイルダウンロード
    console.log('[2/4] PDFファイルダウンロード中...');
    const file = mainBankFiles[0];
    const downloadUrl = `https://${KINTONE_DOMAIN}/k/v1/file.json?fileKey=${file.fileKey}`;

    const fileResponse = await axios.get(downloadUrl, {
      headers: { "X-Cybozu-API-TOKEN": KINTONE_API_TOKEN },
      responseType: "arraybuffer",
    });

    const base64Content = Buffer.from(fileResponse.data).toString("base64");
    console.log(`  - ファイル名: ${file.name}`);
    console.log(`  - サイズ: ${Math.round(fileResponse.data.length / 1024)}KB\n`);

    // 3. PDFを1ページずつ処理（textDetectionを使用）
    console.log('[3/4] OCR処理中（1ページずつ textDetection）...');
    console.log('  注意: PDFを直接 textDetection で処理することはできません');
    console.log('  代わりに、asyncBatchAnnotate を使って個別ページ処理を試みます\n');

    // 4. 代替案: asyncBatchAnnotate でページごとに処理
    console.log('[4/4] 代替案: ページ4と5を個別に処理...');

    const targetPages = [4, 5]; // 7/31と8/20が含まれるページ

    for (const pageNum of targetPages) {
      console.log(`\n--- ページ ${pageNum} の処理 ---`);

      try {
        const request = {
          requests: [{
            inputConfig: {
              content: base64Content,
              mimeType: 'application/pdf',
            },
            features: [{ type: 'TEXT_DETECTION' }],
            pages: [pageNum],
          }],
        };

        const [result] = await visionClient.batchAnnotateFiles(request);

        if (result.responses?.[0]?.responses?.[0]) {
          const pageResponse = result.responses[0].responses[0];

          console.log(`\n[ページ ${pageNum} の結果]`);
          console.log(`  - レスポンスのキー: ${Object.keys(pageResponse).join(', ')}`);

          // textAnnotations の確認
          console.log(`\n  [textAnnotations]`);
          console.log(`    - 存在: ${pageResponse.textAnnotations !== undefined}`);
          console.log(`    - 配列: ${Array.isArray(pageResponse.textAnnotations)}`);
          console.log(`    - 長さ: ${pageResponse.textAnnotations?.length || 0}`);

          if (pageResponse.textAnnotations && pageResponse.textAnnotations.length > 0) {
            console.log(`\n    最初の20件のテキスト:`);
            pageResponse.textAnnotations.slice(0, 20).forEach((annotation, idx) => {
              const text = annotation.description.replace(/\n/g, '\\n');
              console.log(`      ${idx}: "${text}"`);
            });
          } else {
            console.log(`    ⚠️ textAnnotations は空です`);
          }

          // fullTextAnnotation の確認
          console.log(`\n  [fullTextAnnotation]`);
          if (pageResponse.fullTextAnnotation) {
            const fullText = pageResponse.fullTextAnnotation.text;
            const preview = fullText.substring(0, 200).replace(/\n/g, ' ');
            console.log(`    - テキストプレビュー: "${preview}..."`);

            // 「中央建設」「チュウオウケンセツ」を検索
            const keywords = ['中央建設', 'チュウオウケンセツ', 'カ)チュウオウケンセツ', 'カンチユウオウケンセツ'];
            console.log(`\n    キーワード検索:`);
            keywords.forEach(keyword => {
              const found = fullText.includes(keyword);
              console.log(`      - "${keyword}": ${found ? '✓ 見つかった' : '✗ 見つからない'}`);
            });

            // blocks -> paragraphs -> words から詳細検索
            if (pageResponse.fullTextAnnotation.pages?.[0]?.blocks) {
              const blocks = pageResponse.fullTextAnnotation.pages[0].blocks;
              console.log(`\n    - ブロック数: ${blocks.length}件`);

              // 全単語を抽出
              const allWords = [];
              blocks.forEach(block => {
                block.paragraphs?.forEach(paragraph => {
                  paragraph.words?.forEach(word => {
                    const text = word.symbols?.map(s => s.text).join('') || '';
                    allWords.push(text);
                  });
                });
              });

              console.log(`    - 総単語数: ${allWords.length}件`);
              console.log(`\n    最初の30単語:`);
              allWords.slice(0, 30).forEach((word, idx) => {
                console.log(`      ${idx}: "${word}"`);
              });
            }
          }
        }
      } catch (error) {
        console.error(`ページ ${pageNum} の処理エラー:`, error.message);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('テスト完了');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('エラー:', error.message);
    console.error(error);
  }
}

main();
