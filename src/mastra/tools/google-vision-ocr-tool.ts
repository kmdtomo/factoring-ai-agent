import { createTool } from "@mastra/core";
import { z } from "zod";
import axios from "axios";
import { ImageAnnotatorClient } from '@google-cloud/vision';
import path from 'path';
import { fileURLToPath } from 'url';

// 現在のファイルのディレクトリを取得（ESMの場合）
const currentFileUrl = import.meta.url;
const currentDirname = path.dirname(fileURLToPath(currentFileUrl));

// Google Cloud認証設定
let visionClient: ImageAnnotatorClient;

if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
  // JSON文字列から認証情報を読み込む（本番環境用）
  const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
  visionClient = new ImageAnnotatorClient({ credentials });
} else {
  // ファイルパスから読み込む（ローカル環境用）
  const authPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (authPath && !path.isAbsolute(authPath)) {
    // プロジェクトのルートディレクトリを基準に絶対パスを作成
    const projectRoot = path.resolve(currentDirname, '../../../..');
    process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(projectRoot, authPath);
  }
  visionClient = new ImageAnnotatorClient();
}

// 環境変数から設定を取得
const KINTONE_DOMAIN = process.env.KINTONE_DOMAIN || "";
const KINTONE_API_TOKEN = process.env.KINTONE_API_TOKEN || "";
const APP_ID = process.env.KINTONE_APP_ID || "37";

export const googleVisionOcrTool = createTool({
  id: "google-vision-ocr",
  description: "Google Vision APIを使用した高精度・低コストOCR。PDFと画像の両方をサポート",
  
  inputSchema: z.object({
    recordId: z.string().describe("KintoneレコードID"),
    fieldName: z.string().describe("処理対象のフィールド名（例: メイン通帳＿添付ファイル）").optional(),
    maxPages: z.number().describe("PDFの最大処理ページ数（デフォルト: 100、制限なし）").optional(),
  }),
  
  outputSchema: z.object({
    success: z.boolean(),
    processingDetails: z.object({
      recordId: z.string(),
      fieldName: z.string().optional(),
      processedFiles: z.number(),
      totalPages: z.number().optional(),
      timestamp: z.string(),
      plannedProcessing: z.object({
        maxPagesRequested: z.number(),
        batchSize: z.number(),
        totalBatches: z.number(),
        batchRanges: z.array(z.object({
          batch: z.number(),
          startPage: z.number(),
          endPage: z.number(),
        })),
      }).optional(),
    }),
    extractedData: z.array(z.object({
      fileName: z.string(),
      fileType: z.string(),
      text: z.string().describe("抽出されたテキスト"),
      confidence: z.number().describe("信頼度スコア（0-1）"),
      pageCount: z.number().optional(),
      tokenEstimate: z.number().describe("推定トークン数"),
    })),
    costAnalysis: z.object({
      googleVisionCost: z.number(),
      estimatedClaudeCost: z.number(),
      estimatedGpt4Cost: z.number(),
      costSavingPercentage: z.number(),
    }),
    error: z.string().optional(),
  }),
  
  execute: async ({ context }) => {
    const { recordId, fieldName = "メイン通帳＿添付ファイル", maxPages = 100 } = context;
    const timestamp = new Date().toISOString();
    
    // 環境変数のチェック
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
            fieldName,
            processedFiles: 0,
            timestamp,
          },
          extractedData: [],
          costAnalysis: {
            googleVisionCost: 0,
            estimatedClaudeCost: 0,
            estimatedGpt4Cost: 0,
            costSavingPercentage: 0,
          },
          error: "指定されたレコードIDが見つかりません。",
        };
      }
      
      const record = recordResponse.data.records[0];
      
      // 2. 指定されたフィールドの添付ファイルを取得
      const files = record[fieldName]?.value || [];
      
      if (files.length === 0) {
        return {
          success: false,
          processingDetails: {
            recordId,
            fieldName,
            processedFiles: 0,
            timestamp,
          },
          extractedData: [],
          costAnalysis: {
            googleVisionCost: 0,
            estimatedClaudeCost: 0,
            estimatedGpt4Cost: 0,
            costSavingPercentage: 0,
          },
          error: `${fieldName}に添付ファイルがありません。`,
        };
      }
      
      console.log(`[Google Vision OCR] 処理対象: ${files.length}ファイル`);
      
      // 3. 各ファイルを処理
      const extractedData: Array<{
        fileName: string;
        fileType: string;
        text: string;
        confidence: number;
        pageCount?: number;
        tokenEstimate: number;
      }> = [];
      let totalGoogleVisionCost = 0;
      let totalEstimatedTokens = 0;
      let allBatchPlans: Array<{
        batch: number;
        startPage: number;
        endPage: number;
      }> = []; // すべてのファイルのバッチ計画
      
      for (const file of files) {
        console.log(`[Google Vision OCR] 処理中: ${file.name}`);
        
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
          console.log(`[Google Vision OCR] PDFを処理中...`);
          
          // まず最初に実際のページ数を確認
          let actualPageCount = 0;
          console.log(`[Google Vision OCR] PDFのページ数を確認中...`);
          
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
              console.log(`[Google Vision OCR] PDFの総ページ数: ${actualPageCount}ページ`);
            } else {
              // totalPagesが取得できない場合は、段階的に確認
              console.log(`[Google Vision OCR] ページ数を段階的に確認中...`);
              for (let testPage = 1; testPage <= maxPages; testPage += 10) {
                try {
                  const pageTestRequest = {
                    requests: [{
                      inputConfig: {
                        content: base64Content,
                        mimeType: 'application/pdf',
                      },
                      features: [{ type: 'DOCUMENT_TEXT_DETECTION' as const }],
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
                        features: [{ type: 'DOCUMENT_TEXT_DETECTION' as const }],
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
            console.error(`[Google Vision OCR] ページ数確認エラー:`, error.message);
            // エラーの場合はmaxPagesを使用
            actualPageCount = maxPages;
          }
          
          // 実際のページ数とmaxPagesの小さい方を使用
          const pagesToProcess = Math.min(actualPageCount, maxPages);
          console.log(`[Google Vision OCR] 処理対象: ${pagesToProcess}ページ (実際: ${actualPageCount}ページ, 最大: ${maxPages}ページ)`);
          
          const pageTexts: string[] = [];
          let totalProcessedPages = 0;
          const batchSize = 5; // Google Vision APIの制限
          const numBatches = Math.ceil(pagesToProcess / batchSize);
          let processingError: Error | null = null;
          
          // 事前にバッチ計画を作成
          const batchRanges: Array<{
            batch: number;
            startPage: number;
            endPage: number;
          }> = [];
          for (let i = 0; i < numBatches; i++) {
            const startPage = i * batchSize + 1;
            const endPage = Math.min(startPage + batchSize - 1, pagesToProcess);
            batchRanges.push({
              batch: i + 1,
              startPage,
              endPage,
            });
          }
          
          console.log(`[Google Vision OCR] バッチ処理計画:`);
          console.log(`  - 実際のページ数: ${actualPageCount}`);
          console.log(`  - 処理ページ数: ${pagesToProcess}`);
          console.log(`  - バッチサイズ: ${batchSize}ページ/バッチ`);
          console.log(`  - 総バッチ数: ${numBatches}`);
          if (numBatches <= 10) {
            batchRanges.forEach(range => {
              console.log(`  - バッチ${range.batch}: ページ${range.startPage}-${range.endPage}`);
            });
          } else {
            console.log(`  - バッチら1: ページ1-5`);
            console.log(`  - ...`);
            console.log(`  - バッチ${numBatches}: ページ${batchRanges[numBatches-1].startPage}-${batchRanges[numBatches-1].endPage}`);
          }
          
          // このファイルのバッチ計画を保存
          allBatchPlans = batchRanges; // PDFの場合のみ
          
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
                  features: [{ type: 'DOCUMENT_TEXT_DETECTION' as const }],
                  pages: pagesToProcessInBatch,
                }],
              };
              
              const [result] = await visionClient.batchAnnotateFiles(request);
              
              if (result.responses?.[0]) {
                const response = result.responses[0];
                const pages = response.responses || [];
                
                // このバッチのテキストを収集
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
                console.error(`[Google Vision OCR] バッチ${batch + 1}でエラー発生:`, batchError.message);
                processingError = batchError;
                break; // 段階的処理：エラー時点で処理を中断
              }
            }
          }
          
          // 処理結果を設定（エラーがあっても処理済みデータは保持）
          if (pageTexts.length > 0) {
            extractedText = pageTexts.join('\n');
            pageCount = totalProcessedPages;
            console.log(`[Google Vision OCR] ${pageCount}ページの処理完了`);
            
            if (processingError) {
              // エラーがあった場合でも、処理済みページのデータは返す
              console.log(`[Google Vision OCR] 注意: 全体の処理中にエラーが発生しましたが、${pageCount}ページ分のデータは取得できました`);
            }
          } else {
            // 1ページも処理できなかった場合
            extractedText = `PDFの処理中にエラーが発生しました: ${processingError ? processingError.message : '不明なエラー'}`;
            pageCount = 0;
          }
          
        } else {
          // 画像ファイルの処理
          try {
            const [result] = await visionClient.documentTextDetection({
              image: {
                content: base64Content,
              },
            });
            
            const fullTextAnnotation = result.fullTextAnnotation;
            extractedText = fullTextAnnotation?.text || "";
            confidence = fullTextAnnotation?.pages?.[0]?.confidence || 0;
            
          } catch (imageError) {
            console.error(`[Google Vision OCR] 画像処理エラー (${file.name}):`, imageError);
            extractedText = `画像の処理中にエラーが発生しました: ${(imageError as any).message}`;
          }
        }
        
        // トークン数の推定
        const japaneseChars = (extractedText.match(/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/g) || []).length;
        const asciiChars = (extractedText.match(/[a-zA-Z0-9]/g) || []).length;
        const estimatedTokens = japaneseChars + Math.ceil(asciiChars / 4);
        
        extractedData.push({
          fileName: file.name,
          fileType: file.contentType,
          text: extractedText,
          confidence: confidence,
          pageCount: pageCount,
          tokenEstimate: estimatedTokens,
        });
        
        // コスト計算
        totalGoogleVisionCost += 0.0015 * pageCount; // $1.50 per 1000 pages
        totalEstimatedTokens += estimatedTokens;
      }
      
      // コスト分析
      const claudeInputCost = (totalEstimatedTokens / 1000000) * 3;
      const claudeOutputCost = (totalEstimatedTokens / 1000000) * 15;
      const claudeTotalCost = claudeInputCost + claudeOutputCost;
      
      const gpt4InputCost = (totalEstimatedTokens / 1000000) * 10;
      const gpt4OutputCost = (totalEstimatedTokens / 1000000) * 30;
      const gpt4TotalCost = gpt4InputCost + gpt4OutputCost;
      
      const averageCostSaving = ((claudeTotalCost + gpt4TotalCost) / 2 - totalGoogleVisionCost) / ((claudeTotalCost + gpt4TotalCost) / 2) * 100;
      
      console.log(`[Google Vision OCR] 処理完了: ${extractedData.length}ファイル、総トークン数: ${totalEstimatedTokens}`);
      
      return {
        success: true,
        processingDetails: {
          recordId,
          fieldName,
          processedFiles: extractedData.length,
          totalPages: extractedData.reduce((sum, data) => sum + (data.pageCount || 1), 0),
          timestamp,
          plannedProcessing: allBatchPlans.length > 0 ? {
            maxPagesRequested: maxPages,
            batchSize: 5,
            totalBatches: allBatchPlans.length,
            batchRanges: allBatchPlans,
          } : undefined,
        },
        extractedData,
        costAnalysis: {
          googleVisionCost: totalGoogleVisionCost,
          estimatedClaudeCost: claudeTotalCost,
          estimatedGpt4Cost: gpt4TotalCost,
          costSavingPercentage: Math.round(averageCostSaving),
        },
      };
      
    } catch (error: any) {
      console.error("[Google Vision OCR] エラー:", error);
      
      return {
        success: false,
        processingDetails: {
          recordId,
          fieldName,
          processedFiles: 0,
          timestamp,
        },
        extractedData: [],
        costAnalysis: {
          googleVisionCost: 0,
          estimatedClaudeCost: 0,
          estimatedGpt4Cost: 0,
          costSavingPercentage: 0,
        },
        error: `処理中にエラーが発生しました: ${error.message}`,
      };
    }
  },
});