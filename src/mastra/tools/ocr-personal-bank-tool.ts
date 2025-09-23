import { Tool } from "@mastra/core";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import axios from "axios";

export const ocrPersonalBankTool = new Tool({
  id: "ocr-personal-bank-tool",
  description: "個人口座（その他通帳）の使途分析専用OCR。特徴的な取引パターンを事実ベースで抽出・報告",
  inputSchema: z.object({
    recordId: z.string().describe("KintoneレコードID（その他通帳＿添付ファイルを自動取得）"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    processingDetails: z.object({
      recordId: z.string(),
      filesFound: z.number(),
      accountHolder: z.string().optional().describe("口座名義人"),
      bankName: z.string().optional().describe("金融機関名"),
      analysisMonths: z.number().optional().describe("分析対象月数"),
    }),
    notableTransactions: z.array(z.string()).describe("特徴的・注目すべき取引パターン"),
    usageSummary: z.object({
      entertainment: z.string().optional().describe("娯楽・レジャー関連の特徴"),
      business: z.string().optional().describe("事業関連の特徴"),
      cash: z.string().optional().describe("現金使用の特徴"),
      others: z.string().optional().describe("その他特徴的な使途"),
    }),
    totalTransactions: z.number().optional().describe("総取引件数"),
    summary: z.string().describe("個人口座使途の総括"),
    fileProcessed: z.string().optional().describe("処理したファイル名"),
    error: z.string().optional(),
  }),
  execute: async ({ context }) => {
    try {
      const { recordId } = context;
      const domain = process.env.KINTONE_DOMAIN;
      const apiToken = process.env.KINTONE_API_TOKEN;
      
      if (!domain || !apiToken) {
        throw new Error("Kintone環境変数が設定されていません");
      }

      console.log(`🏦 [個人口座OCR] 開始 - Record ID: ${recordId}`);

      // Kintoneからその他通帳ファイルを取得（他のツールと同じ方式）
      const fileUrl = `https://${domain}/k/v1/records.json?app=37&query=$id="${recordId}"`;
      const recordResponse = await axios.get(fileUrl, {
        headers: { 'X-Cybozu-API-Token': apiToken },
      });
      
      const recordData = recordResponse.data;
      
      // records配列から最初のレコードを取得（他のツールと同じ）
      if (!recordData.records || recordData.records.length === 0) {
        return {
          success: false,
          processingDetails: {
            recordId,
            filesFound: 0,
          },
          notableTransactions: [],
          usageSummary: {},
          summary: "レコードが見つかりませんでした",
        };
      }
      
      const record = recordData.records[0];
      
      // その他通帳ファイルを取得
      const personalBankFiles = record.その他通帳＿添付ファイル?.value || [];
      
      if (personalBankFiles.length === 0) {
        console.log(`⚠️ [個人口座OCR] その他通帳＿添付ファイルが見つかりません`);
        return {
          success: true,  // ファイルなしは正常な状態として扱う
          processingDetails: {
            recordId,
            filesFound: 0,
          },
          notableTransactions: [],
          usageSummary: {},
          summary: "その他通帳（個人口座）の添付ファイルがありません。処理をスキップしました。",
          fileProcessed: "なし",
        };
      }

      console.log(`📄 [個人口座OCR] ファイル数: ${personalBankFiles.length}`);

      // 上位3ファイルを処理対象とする
      const filesToProcess = personalBankFiles.slice(0, 3);

      // ファイルをbase64で取得
      const base64Images = [];
      for (const file of filesToProcess) {
        const downloadUrl = `https://${domain}/k/v1/file.json?fileKey=${file.fileKey}`;
        const fileResponse = await axios.get(downloadUrl, {
          headers: { 'X-Cybozu-API-Token': apiToken },
          responseType: 'arraybuffer',
        });
        
        if (fileResponse.status === 200) {
          const base64Content = Buffer.from(fileResponse.data).toString('base64');
          const isPDF = file.contentType === 'application/pdf';
          
          if (isPDF) {
            // PDFの場合はdata URLとして送信
            base64Images.push({
              type: "image" as const,
              image: `data:application/pdf;base64,${base64Content}`,
            });
          } else {
            // 画像の場合
            base64Images.push({
              type: "image" as const,
              image: `data:${file.contentType};base64,${base64Content}`,
            });
          }
        }
      }

      if (base64Images.length === 0) {
        return {
          success: false,
          processingDetails: {
            recordId,
            filesFound: personalBankFiles.length,
          },
          notableTransactions: [],
          usageSummary: {},
          summary: "通帳画像の取得に失敗しました",
          error: "通帳画像の取得に失敗しました",
        };
      }

      // OCR + 使途分析プロンプト
      const prompt = `この個人口座の通帳画像（${filesToProcess.length}ファイル）を分析してください：

🎯 【分析目的】
個人口座の使途を客観的に分析し、特徴的・注目すべき取引パターンを事実ベースで報告する

📋 【抽出項目】
1. 口座名義人・金融機関名
2. 特徴的な取引パターン（頻繁利用先、大額取引、特異なパターン等）
3. 使途別の概要（娯楽、事業、現金使用等の特徴）
4. 総取引件数・分析期間

🔍 【重要な視点】
- 価値判断は行わず、事実のみを客観的に記載
- 細かい生活費は省略し、目立つ取引のみに焦点
- 頻度・金額・パターン性から重要と思われるもののみ抽出
- ギャンブル等も含め、全て中立的に「事実」として記載

📊 【出力形式】
- notableTransactions: 特徴的な取引を箇条書きで
- usageSummary: カテゴリ別の特徴を簡潔に
- 総合的な使途の傾向を要約

AIの判断で重要度を決定し、目立つもののみを報告してください。`;

      console.log(`🤖 [個人口座OCR] OpenAI API 実行中...`);

      const result = await generateObject({
        model: openai("gpt-4o"),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              ...base64Images,
            ],
          },
        ],
        schema: z.object({
          accountHolder: z.string().optional().describe("口座名義人"),
          bankName: z.string().optional().describe("金融機関名"),
          analysisMonths: z.number().optional().describe("分析対象月数"),
          notableTransactions: z.array(z.string()).describe("特徴的・注目すべき取引パターン"),
          usageSummary: z.object({
            entertainment: z.string().optional().describe("娯楽・レジャー関連の特徴"),
            business: z.string().optional().describe("事業関連の特徴"),
            cash: z.string().optional().describe("現金使用の特徴"),
            others: z.string().optional().describe("その他特徴的な使途"),
          }),
          totalTransactions: z.number().optional().describe("総取引件数"),
          summary: z.string().describe("個人口座使途の総括"),
        }),
      });

      console.log(`✅ [個人口座OCR] 完了 - 特徴的取引: ${result.object.notableTransactions.length}件`);

      return {
        success: true,
        processingDetails: {
          recordId,
          filesFound: personalBankFiles.length,
          accountHolder: result.object.accountHolder,
          bankName: result.object.bankName,
          analysisMonths: result.object.analysisMonths,
        },
        notableTransactions: result.object.notableTransactions,
        usageSummary: result.object.usageSummary,
        totalTransactions: result.object.totalTransactions,
        summary: result.object.summary,
        fileProcessed: filesToProcess.map((f: any) => f.name).join(", "),
      };

    } catch (error) {
      console.error("❌ [個人口座OCR] エラー:", error);
      
      return {
        success: false,
        processingDetails: {
          recordId: context.recordId,
          filesFound: 0,
        },
        notableTransactions: [],
        usageSummary: {},
        summary: "個人口座OCR処理中にエラーが発生しました",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});
