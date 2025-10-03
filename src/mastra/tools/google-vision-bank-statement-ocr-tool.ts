import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import axios from "axios";
import vision from '@google-cloud/vision';
import path from 'path';

// 環境変数の認証ファイルパスが相対パスの場合、絶対パスに変換
const authPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (authPath && !path.isAbsolute(authPath)) {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(process.cwd(), authPath);
}

// Google Vision クライアントの初期化
const visionClient = new vision.ImageAnnotatorClient();

// 環境変数は実行時に取得するように変更
const getKintoneConfig = () => ({
  KINTONE_DOMAIN: process.env.KINTONE_DOMAIN || "",
  KINTONE_API_TOKEN: process.env.KINTONE_API_TOKEN || "",
  APP_ID: process.env.KINTONE_APP_ID || "37"
});

export const googleVisionBankStatementOcrTool = createTool({
  id: "google-vision-bank-statement-ocr",
  description: "メイン通帳とサブ通帳を一括でOCR処理するGoogle Vision APIツール",
  
  inputSchema: z.object({
    recordId: z.string().describe("KintoneレコードID"),
    mainBankFieldName: z.string().describe("メイン通帳のフィールド名").default("メイン通帳＿添付ファイル"),
    subBankFieldName: z.string().describe("サブ通帳のフィールド名").default("その他通帳＿添付ファイル"),
    maxPagesPerFile: z.number().describe("1ファイルあたりの最大処理ページ数").default(50),
  }).describe("Google Vision OCR処理の入力パラメータ"),
  
  outputSchema: z.object({
    success: z.boolean(),
    processingDetails: z.object({
      recordId: z.string(),
      processedFiles: z.object({
        mainBank: z.number(),
        subBank: z.number(),
        total: z.number(),
      }).describe("処理されたファイル数"),
      totalPages: z.number(),
      timestamp: z.string(),
    }).describe("処理詳細情報"),
    mainBankDocuments: z.array(z.object({
      fileName: z.string().describe("ファイル名"),
      text: z.string().describe("抽出されたテキスト"),
      pageCount: z.number().describe("ページ数"),
      confidence: z.number().describe("信頼度"),
      tokenEstimate: z.number().describe("推定トークン数"),
    })).describe("メイン通帳ドキュメントリスト"),
    subBankDocuments: z.array(z.object({
      fileName: z.string().describe("ファイル名"),
      text: z.string().describe("抽出されたテキスト"),
      pageCount: z.number().describe("ページ数"),
      confidence: z.number().describe("信頼度"),
      tokenEstimate: z.number().describe("推定トークン数"),
    })).describe("サブ通帳ドキュメントリスト"),
    costAnalysis: z.object({
      googleVisionCost: z.number(),
      perDocumentType: z.object({
        mainBank: z.number(),
        subBank: z.number(),
      }).describe("ドキュメントタイプ別コスト"),
      estimatedSavings: z.number(),
    }).describe("コスト分析"),
    debugInfo: z.object({
      firstPageTextAnnotations: z.array(z.object({
        description: z.string(),
        confidence: z.number().optional(),
      })).optional(),
      blockCount: z.number().optional(),
    }).optional().describe("デバッグ情報"),
    error: z.string().optional(),
  }).describe("Google Vision OCR処理の出力結果"),
  
  execute: async ({ context }) => {
    const { recordId, mainBankFieldName, subBankFieldName, maxPagesPerFile } = context;
    const timestamp = new Date().toISOString();
    
    // 環境変数のチェック
    const { KINTONE_DOMAIN, KINTONE_API_TOKEN, APP_ID } = getKintoneConfig();
    if (!KINTONE_DOMAIN || !KINTONE_API_TOKEN) {
      throw new Error("Kintone環境変数が設定されていません");
    }
    
    try {
      // 1. KintoneからレコードIDをもとに情報を取得
      const recordUrl = `https://${KINTONE_DOMAIN}/k/v1/records.json?app=${APP_ID}&query=$id="${recordId}"`;
      
      const recordResponse = await axios.get(recordUrl, {
        headers: {
          "X-Cybozu-API-Token": KINTONE_API_TOKEN,
        },
      });
      
      if (recordResponse.data.records.length === 0) {
        return {
          success: false,
          processingDetails: {
            recordId,
            processedFiles: { mainBank: 0, subBank: 0, total: 0 },
            totalPages: 0,
            timestamp,
          },
          mainBankDocuments: [],
          subBankDocuments: [],
          costAnalysis: {
            googleVisionCost: 0,
            perDocumentType: { mainBank: 0, subBank: 0 },
            estimatedSavings: 0,
          },
          error: "指定されたレコードIDが見つかりません。",
        };
      }
      
      const record = recordResponse.data.records[0];
      
      // 2. メイン通帳とサブ通帳のファイルを取得
      const mainBankFiles = record[mainBankFieldName]?.value || [];
      const subBankFiles = record[subBankFieldName]?.value || [];
      
      console.log(`[通帳OCR] ファイル取得結果:`);
      console.log(`  - メイン通帳: ${mainBankFiles.length}件`);
      console.log(`  - サブ通帳: ${subBankFiles.length}件`);
      console.log(`  - 処理対象合計: ${mainBankFiles.length + subBankFiles.length}件`);
      
      // ファイル処理の共通関数
      const processFiles = async (files: any[], documentType: string) => {
        const results = [];
        let totalCost = 0;
        
        for (const file of files) {
          console.log(`\n[${documentType}] 処理中: ${file.name}`);
          
          // ファイルをダウンロード
          const downloadUrl = `https://${KINTONE_DOMAIN}/k/v1/file.json?fileKey=${file.fileKey}`;
          
          const fileResponse = await axios.get(downloadUrl, {
            headers: {
              "X-Cybozu-API-Token": KINTONE_API_TOKEN,
            },
            responseType: "arraybuffer",
          });
          
          const base64Content = Buffer.from(fileResponse.data).toString("base64");
          
          // PDFと画像で処理を分ける
          const isPDF = file.contentType === 'application/pdf';
          let extractedText = "";
          let confidence = 0;
          let pageCount = 1;
          
          if (isPDF) {
            // PDFファイルの処理（5ページごとにバッチ処理、段階的処理）
            console.log(`[${documentType}] PDFを処理中...`);
            
            // まず最初に実際のページ数を確認
            let actualPageCount = 0;
            console.log(`[${documentType}] PDFのページ数を確認中...`);
            
            try {
              // 1ページ目のみで試してPDFが読めるか確認
              const testRequest = {
                requests: [{
                  inputConfig: {
                    content: base64Content,
                    mimeType: 'application/pdf',
                  },
                  features: [{ type: 'DOCUMENT_TEXT_DETECTION' as const }],
                  pages: [1],
                }],
              };
              
              const [testResult] = await visionClient.batchAnnotateFiles(testRequest);
              
              if (testResult.responses?.[0]?.totalPages) {
                actualPageCount = testResult.responses[0].totalPages;
                console.log(`[${documentType}] PDFの総ページ数: ${actualPageCount}ページ`);
              } else {
                // totalPagesが取得できない場合は、段階的に確認
                console.log(`[${documentType}] ページ数を段階的に確認中...`);
                for (let testPage = 1; testPage <= maxPagesPerFile; testPage += 10) {
                  try {
                    const pageTestRequest = {
                      requests: [{
                        inputConfig: {
                          content: base64Content,
                          mimeType: 'application/pdf',
                        },
                        features: [{ type: 'TEXT_DETECTION' as const }],
                        pages: [testPage],
                      }],
                    };
                    await visionClient.batchAnnotateFiles(pageTestRequest);
                    actualPageCount = testPage;
                  } catch (e: any) {
                    if (e.message?.includes('Invalid pages')) {
                      break;
                    }
                  }
                }
                // より正確なページ数を特定
                if (actualPageCount > 1) {
                  for (let testPage = actualPageCount - 9; testPage <= actualPageCount + 10; testPage++) {
                    if (testPage < 1) continue;
                    try {
                      const pageTestRequest = {
                        requests: [{
                          inputConfig: {
                            content: base64Content,
                            mimeType: 'application/pdf',
                          },
                          features: [{ type: 'TEXT_DETECTION' as const }],
                          pages: [testPage],
                        }],
                      };
                      await visionClient.batchAnnotateFiles(pageTestRequest);
                      actualPageCount = testPage;
                    } catch (e: any) {
                      if (e.message?.includes('Invalid pages')) {
                        break;
                      }
                    }
                  }
                }
              }
            } catch (error: any) {
              console.error(`[${documentType}] ページ数確認エラー:`, error.message);
              // エラーの場合はmaxPagesPerFileを使用
              actualPageCount = maxPagesPerFile;
            }
            
            // 実際のページ数とmaxPagesPerFileの小さい方を使用
            const pagesToProcess = Math.min(actualPageCount, maxPagesPerFile);
            console.log(`[${documentType}] 処理対象: ${pagesToProcess}ページ (実際: ${actualPageCount}ページ, 最大: ${maxPagesPerFile}ページ)`);
            
            const pageTexts: string[] = [];
            let totalProcessedPages = 0;
            const batchSize = 5; // Google Vision APIの制限
            const numBatches = Math.ceil(pagesToProcess / batchSize);
            let processingError: Error | null = null;
            
            // バッチ処理計画を表示
            console.log(`[${documentType}] バッチ処理計画:`);
            console.log(`  - 実際のページ数: ${actualPageCount}`);
            console.log(`  - 処理ページ数: ${pagesToProcess}`);
            console.log(`  - バッチサイズ: ${batchSize}ページ/バッチ`);
            console.log(`  - 総バッチ数: ${numBatches}`);
            
            // バッチごとに段階的に処理
            for (let batch = 0; batch < numBatches; batch++) {
              const startPage = batch * batchSize + 1;
              const endPage = Math.min(startPage + batchSize - 1, pagesToProcess);
              const pagesToProcessInBatch = Array.from(
                { length: endPage - startPage + 1 }, 
                (_, i) => startPage + i
              );
              
              console.log(`  バッチ${batch + 1}/${numBatches}: ページ${startPage}-${endPage}を処理中...`);
              
              try {
                const request = {
                  requests: [{
                    inputConfig: {
                      content: base64Content,
                      mimeType: 'application/pdf',
                    },
                    features: [{ type: 'TEXT_DETECTION' as const }],
                    pages: pagesToProcessInBatch,
                  }],
                };
                
                const [result] = await visionClient.batchAnnotateFiles(request);

                if (result.responses?.[0]) {
                  const response = result.responses[0];
                  const pages = response.responses || [];

                  // デバッグ: 詳細レスポンスをログ出力
                  if (batch === 0 && pages[0]) {
                    console.log(`\n[デバッグ] Google Vision レスポンス構造確認:`);
                    console.log(`  - pages[0]のキー: ${Object.keys(pages[0]).join(', ')}`);

                    console.log(`  - textAnnotations の状態:`);
                    console.log(`    - 存在するか: ${pages[0].textAnnotations !== undefined}`);
                    console.log(`    - 型: ${typeof pages[0].textAnnotations}`);
                    console.log(`    - 配列か: ${Array.isArray(pages[0].textAnnotations)}`);
                    console.log(`    - 長さ: ${pages[0].textAnnotations?.length || 0}`);

                    if (pages[0].textAnnotations && pages[0].textAnnotations.length > 0) {
                      console.log(`  - 最初の10件:`);
                      pages[0].textAnnotations.slice(0, 10).forEach((annotation: any, idx: number) => {
                        console.log(`    ${idx}: "${annotation.description}" (confidence: ${annotation.confidence || 'N/A'})`);
                      });
                    } else if (Array.isArray(pages[0].textAnnotations) && pages[0].textAnnotations.length === 0) {
                      console.log(`  - textAnnotations: 空配列です`);
                    } else {
                      console.log(`  - textAnnotations: 存在しません (undefined)`);
                    }

                    if (pages[0].fullTextAnnotation?.pages?.[0]?.blocks) {
                      const blocks = pages[0].fullTextAnnotation.pages[0].blocks;
                      console.log(`  - ブロック数: ${blocks.length}件`);
                      console.log(`  - 最初のブロックの構造: ${Object.keys(blocks[0]).join(', ')}`);

                      // 最初のブロックの詳細を表示
                      if (blocks[0].paragraphs?.[0]?.words) {
                        const firstWords = blocks[0].paragraphs[0].words.slice(0, 5);
                        console.log(`  - 最初の5単語:`);
                        firstWords.forEach((word: any, idx: number) => {
                          const text = word.symbols?.map((s: any) => s.text).join('') || '';
                          console.log(`    ${idx}: "${text}"`);
                        });
                      }
                    }
                  }

                  const batchText = pages
                    .map((page: any) => page.fullTextAnnotation?.text || '')
                    .join('\n');

                  if (batchText) {
                    pageTexts.push(batchText);
                    totalProcessedPages += pages.length;
                  }

                  // 最初のバッチから信頼度を取得
                  if (batch === 0 && pages[0]?.fullTextAnnotation?.pages?.[0]) {
                    confidence = pages[0].fullTextAnnotation.pages[0].confidence || 0;
                  }

                  console.log(`    - ${pages.length}ページ処理完了`);
                }
              } catch (batchError: any) {
                // ページが存在しない場合は続行
                if (batchError.message?.includes('Invalid pages')) {
                  console.log(`    - ページ${startPage}-${endPage}は存在しません`);
                  break; // これ以降のページも存在しない可能性が高いため終了
                } else {
                  // その他のエラーの場合は、これまでの処理結果を保持して終了
                  console.error(`[${documentType}] バッチ${batch + 1}でエラー発生:`, batchError.message);
                  processingError = batchError;
                  break; // 段階的処理：エラー時点で処理を中断
                }
              }
            }
            
            // 処理結果を設定（エラーがあっても処理済みデータは保持）
            if (pageTexts.length > 0) {
              extractedText = pageTexts.join('\n');
              pageCount = totalProcessedPages;
              console.log(`[${documentType}] ${pageCount}ページの処理完了`);
              
              if (processingError) {
                // エラーがあった場合でも、処理済みページのデータは返す
                console.log(`[${documentType}] 注意: 全体の処理中にエラーが発生しましたが、${pageCount}ページ分のデータは取得できました`);
              }
            } else {
              // 1ページも処理できなかった場合
              extractedText = `PDFの処理中にエラーが発生しました: ${processingError ? processingError.message : '不明なエラー'}`;
              pageCount = 0;
            }
            
          } else {
            // 画像ファイルの処理
            try {
              const [result] = await visionClient.textDetection({
                image: {
                  content: base64Content,
                },
              });
              
              const fullTextAnnotation = result.fullTextAnnotation;
              extractedText = fullTextAnnotation?.text || "";
              confidence = fullTextAnnotation?.pages?.[0]?.confidence || 0;
              
            } catch (imageError) {
              console.error(`[${documentType}] 画像処理エラー (${file.name}):`, imageError);
              extractedText = `画像の処理中にエラーが発生しました`;
            }
          }
          
          // トークン数の推定
          const japaneseChars = (extractedText.match(/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/g) || []).length;
          const asciiChars = (extractedText.match(/[a-zA-Z0-9]/g) || []).length;
          const estimatedTokens = japaneseChars + Math.ceil(asciiChars / 4);
          
          results.push({
            fileName: file.name,
            text: extractedText,
            pageCount,
            confidence,
            tokenEstimate: estimatedTokens,
          });
          
          // コスト計算
          totalCost += 0.0015 * pageCount;
        }
        
        return { results, totalCost };
      };
      
      // 3. 両方のドキュメントタイプを並列処理
      console.log("\n=== メイン通帳の処理開始 ===");
      const mainBankProcessing = processFiles(mainBankFiles, "メイン通帳");
      
      console.log("\n=== サブ通帳の処理開始 ===");
      const subBankProcessing = processFiles(subBankFiles, "サブ通帳");
      
      // 並列実行して結果を待つ
      const [mainBankResult, subBankResult] = await Promise.all([
        mainBankProcessing,
        subBankProcessing,
      ]);
      
      // コスト分析
      const totalGoogleVisionCost = mainBankResult.totalCost + subBankResult.totalCost;
      const estimatedClaudeCost = totalGoogleVisionCost * 58.5; // 58.5倍のコスト
      const estimatedSavings = ((estimatedClaudeCost - totalGoogleVisionCost) / estimatedClaudeCost) * 100;
      
      console.log("\n[通帳OCR] 処理結果:");
      console.log(`  - メイン通帳: ${mainBankResult.results.length}件処理`);
      console.log(`  - サブ通帳: ${subBankResult.results.length}件処理`);
      console.log(`  - 総コスト: $${totalGoogleVisionCost.toFixed(4)}`);
      
      return {
        success: true,
        processingDetails: {
          recordId,
          processedFiles: {
            mainBank: mainBankResult.results.length,
            subBank: subBankResult.results.length,
            total: mainBankResult.results.length + subBankResult.results.length,
          },
          totalPages: mainBankResult.results.reduce((sum, doc) => sum + doc.pageCount, 0) +
                      subBankResult.results.reduce((sum, doc) => sum + doc.pageCount, 0),
          timestamp,
        },
        mainBankDocuments: mainBankResult.results,
        subBankDocuments: subBankResult.results,
        costAnalysis: {
          googleVisionCost: totalGoogleVisionCost,
          perDocumentType: {
            mainBank: mainBankResult.totalCost,
            subBank: subBankResult.totalCost,
          },
          estimatedSavings: Math.round(estimatedSavings),
        },
      };
      
    } catch (error: any) {
      console.error("[通帳OCR] エラー:", error);
      
      return {
        success: false,
        processingDetails: {
          recordId,
          processedFiles: { mainBank: 0, subBank: 0, total: 0 },
          totalPages: 0,
          timestamp,
        },
        mainBankDocuments: [],
        subBankDocuments: [],
        costAnalysis: {
          googleVisionCost: 0,
          perDocumentType: { mainBank: 0, subBank: 0 },
          estimatedSavings: 0,
        },
        error: `処理中にエラーが発生しました: ${error.message}`,
      };
    }
  },
});


