import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import axios from "axios";

// 通帳OCRツール - 統合モード（期待値表示→抽出→照合）
export const ocrBankStatementTool = createTool({
  id: "ocr-bank-statement", 
  description: "メイン通帳専用OCR。マーク検出→適応的抽出→期待値照合。法人口座の入金額照合に特化",
  inputSchema: z.object({
    recordId: z.string().describe("KintoneレコードID（メイン通帳＿添付ファイル+担保情報テーブルを自動取得）"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    processingDetails: z.object({
      recordId: z.string(),
      filesFound: z.number(),
      collateralEntriesFound: z.number(),
      expectedCompanies: z.array(z.string()),
    }),
    markDetection: z.object({
      hasMarks: z.boolean().describe("視覚的マークの有無"),
      markCount: z.number().optional().describe("検出されたマークの数"),
      extractionMode: z.enum(["marked", "search"]).describe("抽出モード"),
    }),
    expectedPayments: z.object({}).passthrough().describe("期待される入金額（会社別・月別）"),
    extractedTransactions: z.array(z.object({
      amount: z.number().describe("入金額"),
      date: z.string().optional().describe("日付"),
      description: z.string().optional().describe("摘要"),
    })).describe("抽出された入金取引一覧"),
    matchResults: z.array(z.object({
      amount: z.number(),
      matched: z.string().optional().describe("一致した企業と期間"),
      status: z.enum(["exact", "none"]).describe("照合結果"),
    })),
    summary: z.string().describe("処理結果の要約"),
    fileProcessed: z.string().optional().describe("処理したファイル名"),
    error: z.string().optional(),
  }),
  
  execute: async ({ context }) => {
    const { recordId } = context;
    const domain = process.env.KINTONE_DOMAIN;
    const apiToken = process.env.KINTONE_API_TOKEN;
    
    if (!domain || !apiToken) {
      throw new Error("Kintone環境変数が設定されていません");
    }
    
    try {
      // 通帳ファイルを取得
      const fileUrl = `https://${domain}/k/v1/records.json?app=37&query=$id="${recordId}"`;
      const recordResponse = await axios.get(fileUrl, {
        headers: { 'X-Cybozu-API-Token': apiToken },
      });
      
      if (recordResponse.data.records.length === 0) {
        throw new Error(`レコードID: ${recordId} が見つかりません`);
      }
      
      const record = recordResponse.data.records[0];
      const bankFiles = record.メイン通帳＿添付ファイル?.value || [];
      
      if (bankFiles.length === 0) {
        return {
          success: false,
          processingDetails: {
            recordId,
            filesFound: 0,
            collateralEntriesFound: 0,
            expectedCompanies: [],
          },
          markDetection: {
            hasMarks: false,
            markCount: 0,
            extractionMode: "search" as const,
          },
          expectedPayments: {},
          extractedTransactions: [],
          matchResults: [],
          summary: "メイン通帳が添付されていません",
          error: "メイン通帳が添付されていません",
        };
      }
      
      console.log(`[OCR Bank Statement] Candidate files: ${bankFiles.length}`);
      
      // 担保情報テーブルを先に取得して期待値を構築
      console.log(`[OCR Bank Statement] 担保情報テーブルを取得中...`);
      const collateralInfoRaw = record.担保情報?.value || [];
      console.log(`[OCR Bank Statement] 担保情報: ${collateralInfoRaw.length}件`);
      
      // 期待値を構築
      const expectedPayments: Record<string, number[]> = {};
      const expectedCompanies: string[] = [];
      
      collateralInfoRaw.forEach((item: any) => {
        const company = item.value?.会社名_第三債務者_担保?.value || "";
        if (company) {
          expectedCompanies.push(company);
          const payments = [
            parseInt(item.value?.過去の入金_先々月?.value || "0"),
            parseInt(item.value?.過去の入金_先月?.value || "0"), 
            parseInt(item.value?.過去の入金_今月?.value || "0")
          ].filter(p => p > 0); // 0円は除外
          
          if (payments.length > 0) {
            expectedPayments[company] = payments;
          }
        }
      });
      
      console.log(`[OCR Bank Statement] 期待値構築完了:`, expectedPayments);
      
      // バッチ処理: 全ファイルを1回のAPI呼び出しで処理
      const filesToProcess = bankFiles.slice(0, 3);
      console.log(`[OCR Bank Statement] Batch processing ${filesToProcess.length} files`);
      
      const fileContents: Array<{dataUrl: string}> = [];
      const processedFiles: string[] = [];
      
      for (const file of filesToProcess) {
        console.log(`[OCR Bank Statement] Downloading: ${file.name}`);
        
        // ファイルをダウンロード
        const downloadUrl = `https://${domain}/k/v1/file.json?fileKey=${file.fileKey}`;
        const fileResponse = await axios.get(downloadUrl, {
          headers: { 'X-Cybozu-API-Token': apiToken },
          responseType: 'arraybuffer',
        });
        
        const base64Content = Buffer.from(fileResponse.data).toString('base64');
        const isPDF = file.contentType === 'application/pdf';
        const dataUrl = isPDF 
          ? `data:application/pdf;base64,${base64Content}`
          : `data:${file.contentType};base64,${base64Content}`;
        
        fileContents.push({
          dataUrl
        });
        processedFiles.push(file.name);
      }
      
      // 期待値を文字列形式で整理
      const expectedPaymentsText = Object.entries(expectedPayments)
        .map(([company, amounts]) => 
          `${company}: ${amounts.map(a => a.toLocaleString()).join('円, ')}円`
        ).join('\n');
      
      // 統合モード: マーク検出+適応的抽出
      const prompt = `この通帳画像（${filesToProcess.length}ファイル）を分析してください：

🔍 【ステップ1: マーク検出】
視覚的マーク（蛍光ペン、ハイライト、色付け、赤丸、矢印等）の有無を判定してください。
マークがある場合は、その数も正確にカウントしてください。

📊 【ステップ2: 抽出モード選択と実行】

◆ マークありモード（マークを検出した場合）:
  🔴 マークされた入金を「全て漏れなく」抽出してください
  ⚠️ 重要: 
  - マークされた箇所は全て重要です。1つも見逃さないでください
  - 期待値の数に関係なく、マークされた全ての入金を抽出してください
  - 例: 期待値が3つでも、マークが5つあれば5つ全て抽出

◆ マークなしモード（マークがない場合のみ）:
  以下の期待値と完全一致する金額を探索してください：
  ${expectedPaymentsText}
  
  ⚠️ 重要: 
  - 通帳内の全ての入金取引を確認してください
  - カンマ区切りの数字も正確に読み取ってください（例: 1,099,725円）
  - 期待値と完全一致する金額のみを抽出してください

📋 【ステップ3: 抽出詳細】
各取引について以下を抽出：
- 入金額（整数）⚠️ 数字を正確に読み取ってください（8/3、9/0、6/5の混同に注意）
- 日付（可能な場合）
- 摘要・振込元（可能な場合）

🎯 【ステップ4: 照合（抽出後）】
抽出した金額と期待値の完全一致を判定してください。

出力: 指定されたJSONスキーマに従って構造化データを提供してください。`;
      
      const content = [
        { type: "text" as const, text: prompt },
        ...fileContents.map(f => ({ type: "image" as const, image: f.dataUrl }))
      ];
      
      let result;
      try {
        result = await generateObject({
          model: openai("gpt-4o"),
          messages: [{ role: "user", content }],
          schema: z.object({
            markDetection: z.object({
              hasMarks: z.boolean().describe("視覚的マークの有無"),
              markCount: z.number().optional().describe("検出されたマークの数"),
              extractionMode: z.enum(["marked", "search"]).describe("抽出モード"),
            }),
            extractedTransactions: z.array(z.object({
              amount: z.number().describe("入金額"),
              date: z.string().optional().describe("日付"),
              description: z.string().optional().describe("摘要"),
            })),
            matchResults: z.array(z.object({
              amount: z.number(),
              matched: z.string().optional().describe("一致した企業と期間"),
              status: z.enum(["exact", "none"]).describe("照合結果"),
            })),
            confidence: z.number().min(0).max(100).optional().describe("読み取り信頼度"),
          }),
          mode: "json",
          temperature: 0,
        });
      } catch (error) {
        console.error(`[OCR Bank Statement] OpenAI拒否エラー (バッチ処理):`, error);
        result = {
          object: {
            markDetection: {
              hasMarks: false,
              markCount: 0,
              extractionMode: "search" as const
            },
            extractedTransactions: [],
            matchResults: [],
            confidence: 0
          }
        };
      }

      const extractedTransactions = result.object.extractedTransactions || [];
      const markDetection = result.object.markDetection;
      const matchResults = result.object.matchResults || [];
      
      console.log(`[OCR Bank Statement] バッチ処理完了: ${extractedTransactions.length}件の取引を${processedFiles.length}ファイルから抽出`);
      console.log(`[OCR Bank Statement] マーク検出結果:`, markDetection);
      console.log(`[OCR Bank Statement] 照合結果:`, matchResults);
      
      // 要約を作成
      const summary = `通帳OCR完了（${processedFiles.length}ファイル処理）、${markDetection.extractionMode === "marked" ? "マーク" : "期待値"}モードで${extractedTransactions.length}件抽出、${matchResults.filter(m => m.status === "exact").length}件完全一致`;

      return {
        success: true,
        processingDetails: {
          recordId,
          filesFound: bankFiles.length,
          collateralEntriesFound: collateralInfoRaw.length,
          expectedCompanies,
        },
        markDetection,
        expectedPayments,
        extractedTransactions,
        matchResults,
        summary,
        fileProcessed: processedFiles.join(", "),
      };
      
    } catch (error) {
      console.error(`[OCR Bank Statement] Error:`, error);
      return {
        success: false,
        processingDetails: {
          recordId,
          filesFound: 0,
          collateralEntriesFound: 0,
          expectedCompanies: [],
        },
        markDetection: {
          hasMarks: false,
          markCount: 0,
          extractionMode: "search" as const,
        },
        expectedPayments: {},
        extractedTransactions: [],
        matchResults: [],
        summary: "OCR処理に失敗しました",
        error: error instanceof Error ? error.message : "OCR処理に失敗しました",
      };
    }
  },
});