import { Tool } from "@mastra/core";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
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
    }),
    markedTransactions: z.array(z.string()).optional().describe("マーク/メモがある取引"),
    notablePoints: z.array(z.string()).optional().describe("特に目立つ点（あれば）"),
    summary: z.string().describe("簡潔な要約（特記事項なしも可）"),
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
          markedTransactions: [],
          notablePoints: [],
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
          markedTransactions: [],
          notablePoints: [],
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
          markedTransactions: [],
          notablePoints: [],
          summary: "通帳画像の取得に失敗しました",
          error: "通帳画像の取得に失敗しました",
        };
      }

      // OCR + 使途分析プロンプト
      const prompt = `この個人口座の通帳画像（${filesToProcess.length}ファイル）を分析してください：

📊 【分析方針】

🔍 まず確認すること:
- マークやメモ、手書きの印などがあるか確認
- あれば、それらは審査担当者が重要と判断した箇所

◆ マーク・メモがある場合:
→ マークされた取引や、メモの内容を最優先で報告

◆ マーク・メモがない場合:
→ 全体をざっと見て、以下に該当するものがあれば報告：
  - 異常に大きな金額の取引
  - 明らかに通常と異なるパターン
  - リスクを示唆する取引（ギャンブル、高額現金引出等）

📝 報告形式:
- 口座名義・銀行名
- マーク/メモの内容（あれば）
- 特記事項（本当に目立つものがあれば全て報告）
- なければ「特記事項なし」

⚠️ 重要: 日常的な取引の詳細は不要。本当に審査上重要と思われるもののみ。`;

      console.log(`🤖 [個人口座OCR] Claude 3.7 Sonnet 実行中...`);

      const result = await generateObject({
        model: anthropic("claude-3-7-sonnet-20250219") as any,
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
          markedTransactions: z.array(z.string()).optional().describe("マーク/メモがある取引"),
          notablePoints: z.array(z.string()).optional().describe("特に目立つ点（あれば）"),
          summary: z.string().describe("簡潔な要約（特記事項なしも可）"),
        }),
      });

      console.log(`✅ [個人口座OCR] 完了`);

      return {
        success: true,
        processingDetails: {
          recordId,
          filesFound: personalBankFiles.length,
          accountHolder: result.object.accountHolder,
          bankName: result.object.bankName,
        },
        markedTransactions: result.object.markedTransactions || [],
        notablePoints: result.object.notablePoints || [],
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
        markedTransactions: [],
        notablePoints: [],
        summary: "個人口座OCR処理中にエラーが発生しました",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});
