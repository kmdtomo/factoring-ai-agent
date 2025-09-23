import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { anthropic } from "@ai-sdk/anthropic";
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
      payerName: z.string().optional().describe("振込元/支払者名"),
      description: z.string().optional().describe("摘要/その他情報"),
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
      
      // 第1段階: 純粋なOCR（期待値なし）
      const ocrPrompt = `この通帳画像（${filesToProcess.length}ファイル）を分析してください：

🔍 【ステップ1: マーク検出 - 最重要】
**取引行に付けられた強調マーク**を検出してください：
- 蛍光ペンでハイライトされた取引行
- 丸印（赤丸、青丸など）で囲まれた取引
- 下線や波線が引かれた取引
- 矢印で指し示された取引
- チェックマークが付いた取引

⚠️ 重要な区別: 
- ✅ 対象: 取引金額や日付を強調するマーク
- ❌ 対象外: 手書きのメモ、コメント、説明文
- ❌ 対象外: 取引と無関係な赤い文字や印

💡 判断基準:
- マークは「どの取引を見るべきか」を示すものです
- 手書きメモは内容の説明であり、マークではありません

🔎 スキャン方法:
- 通帳の最初のページから最後のページまで全て確認してください
- 特に最初の数ページは見逃しやすいので、入念にチェック
- 各ページの上部・中部・下部を漏れなく確認

📊 【ステップ2: 取引情報の抽出】

⚠️ 絶対的ルール:
- 画像に実際に記載されている内容のみを抽出
- 架空の企業名や金額を創作しない
- 読み取れない部分は無理に埋めない

◆ マークありモード（マークを検出した場合）:
  🔴 マークされた箇所の情報を全てそのまま抽出
  - マークされた行にある全ての情報（入金・出金問わず）を読み取る
  - 日付、金額（プラス/マイナス）、振込元/振込先名、摘要など
  - マークされた全ての取引を漏れなく報告

◆ 全体スキャンモード（マークがない場合）:
  通帳内の主要な入金取引を抽出
  - 大きな金額の入金を中心に抽出
  - 日付、金額、振込元名を正確に読み取る

📋 【抽出する情報】
各取引について：
- 金額: 通帳に記載の金額を正確に（入金はプラス、出金はマイナス）
- 日付: 記載されている日付
- 振込元名（payerName）: 通帳に実際に印字されている企業名・個人名
- 摘要: その他の付加情報があれば

🚫 【禁止事項】
- 存在しない企業名を創作しない
- 不明瞭な部分を推測で埋めない
- 画像にない情報を追加しない

出力: 実際に通帳から読み取れた情報のみを提供してください。`;
      
      const content = [
        { type: "text" as const, text: ocrPrompt },
        ...fileContents.map(f => ({ type: "image" as const, image: f.dataUrl }))
      ];
      
      let result;
      try {
        result = await generateObject({
          model: anthropic("claude-3-7-sonnet-20250219") as any,
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
              payerName: z.string().optional().describe("振込元/支払者名"),
              description: z.string().optional().describe("摘要/その他情報"),
            })),
            matchResults: z.array(z.object({
              amount: z.number(),
              matched: z.string().optional().describe("一致した企業と期間"),
              status: z.enum(["exact", "none"]).describe("照合結果"),
            })).optional(),
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
      
      console.log(`[OCR Bank Statement] バッチ処理完了: ${extractedTransactions.length}件の取引を${processedFiles.length}ファイルから抽出`);
      console.log(`[OCR Bank Statement] マーク検出結果:`, markDetection);
      
      // 第2段階: 期待値との照合（検索モードの場合のみ）
      let matchResults: any[] = [];
      if (markDetection.extractionMode === "search" || !markDetection.hasMarks) {
        // 期待値と抽出結果を照合
        const allExpectedAmounts = Object.entries(expectedPayments).flatMap(([company, amounts]) => 
          amounts.map(amount => ({ company, amount }))
        );
        
        matchResults = extractedTransactions.map(transaction => {
          const match = allExpectedAmounts.find(exp => exp.amount === transaction.amount);
          return {
            amount: transaction.amount,
            matched: match ? `${match.company}` : undefined,
            status: match ? "exact" : "none"
          };
        });
        
        console.log(`[OCR Bank Statement] 照合結果:`, matchResults);
      }
      
      // 要約を作成
      const summary = `通帳OCR完了（${processedFiles.length}ファイル処理）、${markDetection.extractionMode === "marked" ? "マーク" : "期待値"}モードで${extractedTransactions.length}件抽出`; // 、${matchResults.filter(m => m.status === "exact").length}件完全一致`;

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