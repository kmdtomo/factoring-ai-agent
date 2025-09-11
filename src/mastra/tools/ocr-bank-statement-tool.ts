import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import axios from "axios";

// 通帳OCRツール - データ抽出と担保情報との照合
export const ocrBankStatementTool = createTool({
  id: "ocr-bank-statement",
  description: "通帳をOCR処理してマークされた入金を抽出し、担保情報と照合",
  inputSchema: z.object({
    recordId: z.string().describe("KintoneレコードID"),
    isMainAccount: z.boolean().default(true).describe("メイン通帳かどうか"),
    collateralInfo: z.array(z.object({
      companyName: z.string().describe("担保企業名"),
      pastPayments: z.object({
        threeMonthsAgo: z.number().describe("前前々月の入金"),
        twoMonthsAgo: z.number().describe("前々月の入金"),
        lastMonth: z.number().describe("前月の入金"),
      }).describe("過去3ヶ月の入金実績"),
    })).optional().describe("担保情報（照合用）"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    markedTransactions: z.array(z.object({
      amount: z.number().describe("入金額"),
      date: z.string().optional().describe("日付"),
      description: z.string().optional().describe("摘要"),
    })).describe("マークされた入金取引一覧"),
    extractedAmounts: z.string().describe("抽出された金額の要約"),
    matchingResults: z.object({
      summary: z.string().describe("照合結果の要約"),
      matches: z.array(z.object({
        amount: z.number(),
        matchedWith: z.string().optional().describe("一致した担保情報"),
        matchType: z.enum(["exact", "split", "partial", "none"]).describe("一致タイプ"),
      })).optional(),
    }).optional().describe("担保情報との照合結果"),
    rawOCRResponse: z.string().describe("OCRの生レスポンス"),
    fileProcessed: z.string().optional().describe("処理したファイル名"),
    error: z.string().optional(),
  }),
  
  execute: async ({ context }) => {
    const { recordId, isMainAccount, collateralInfo } = context;
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
      const bankFiles = isMainAccount ? 
        record.メイン通帳＿添付ファイル?.value || [] :
        record.その他通帳＿添付ファイル?.value || [];
      
      if (bankFiles.length === 0) {
        return {
          success: false,
          markedTransactions: [],
          extractedAmounts: "通帳が添付されていません",
          rawOCRResponse: "",
          error: `${isMainAccount ? "メイン" : "その他"}通帳が添付されていません`,
        };
      }
      
      // 最初のファイルのみ処理
      const file = bankFiles[0];
      console.log(`[OCR Bank Statement] Processing: ${file.name}`);
      
      // ファイルをダウンロード
      const downloadUrl = `https://${domain}/k/v1/file.json?fileKey=${file.fileKey}`;
      const fileResponse = await axios.get(downloadUrl, {
        headers: { 'X-Cybozu-API-Token': apiToken },
        responseType: 'arraybuffer',
      });
      
      const base64Content = Buffer.from(fileResponse.data).toString('base64');
      
      // シンプルなプロンプト - マークされた入金のリスト化
      const prompt = `通帳画像で、マーカー（蛍光ペン）で色がついている入金をすべて抽出してください。
黄色、ピンク、オレンジ、緑など、すべての色のマーカーが対象です。
薄くても色がついていれば含めてください。

【マークされた入金取引】
1. 金額: XXXX円 / 日付: MM/DD / 摘要: [内容]
2. 金額: YYYY円 / 日付: MM/DD / 摘要: [内容]
...`;
      
      // データURL形式で送信
      const isPDF = file.contentType === 'application/pdf';
      const dataUrl = isPDF 
        ? `data:application/pdf;base64,${base64Content}`
        : `data:${file.contentType};base64,${base64Content}`;
      
      const response = await generateText({
        model: openai("gpt-4o"),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { 
                type: "image", 
                image: dataUrl
              }
            ]
          }
        ],
      });
      
      const text = response.text;
      console.log(`[OCR Bank Statement] OCR Response:`, text);
      
      // シンプルなパース - マークされた取引を抽出
      const markedTransactions: Array<{amount: number; date?: string; description?: string}> = [];
      
      // 各行を処理
      const lines = text.split('\n');
      for (const line of lines) {
        // パターン: "N. 金額: XXX円 / 日付: MM/DD / 摘要: [内容]"
        const match = line.match(/\d+\.\s*金額:\s*([\d,]+)円\s*\/\s*日付:\s*([^\s\/]+)(?:\s*\/\s*摘要:\s*(.+))?/);
        if (match) {
          const amount = parseInt(match[1].replace(/,/g, ''));
          const date = match[2].trim();
          const description = match[3]?.trim() || "";
          
          markedTransactions.push({
            amount,
            date,
            description,
          });
        }
      }
      
      console.log(`[OCR Bank Statement] Found ${markedTransactions.length} marked transactions`);
      
      // 抽出された金額の要約を作成
      const extractedAmounts = markedTransactions.length > 0 ?
        `マークされた入金${markedTransactions.length}件：` + 
        markedTransactions.map((t, i) => 
          `\n${i + 1}. ${t.amount.toLocaleString()}円 (${t.date || '日付不明'})${t.description ? ` - ${t.description}` : ''}`
        ).join('') :
        'マークされた入金は見つかりませんでした';
      
      // 担保情報との照合を実施
      let matchingResults = undefined;
      if (collateralInfo && collateralInfo.length > 0) {
        const matches: Array<{amount: number; matchedWith?: string; matchType: "exact" | "split" | "partial" | "none"}> = [];
        const allPastPayments: Array<{company: string; amount: number}> = [];
        
        // 全ての過去の入金をフラットなリストに
        collateralInfo.forEach(company => {
          if (company.pastPayments.threeMonthsAgo > 0) {
            allPastPayments.push({ company: company.companyName, amount: company.pastPayments.threeMonthsAgo });
          }
          if (company.pastPayments.twoMonthsAgo > 0) {
            allPastPayments.push({ company: company.companyName, amount: company.pastPayments.twoMonthsAgo });
          }
          if (company.pastPayments.lastMonth > 0) {
            allPastPayments.push({ company: company.companyName, amount: company.pastPayments.lastMonth });
          }
        });
        
        // 各マーク付き入金を照合
        for (const transaction of markedTransactions) {
          // 完全一致を探す
          const exactMatch = allPastPayments.find(p => p.amount === transaction.amount);
          if (exactMatch) {
            matches.push({
              amount: transaction.amount,
              matchedWith: `${exactMatch.company}: ${exactMatch.amount.toLocaleString()}円`,
              matchType: "exact"
            });
            continue;
          }
          
          // 分割払いの可能性をチェック（2つの合計）
          let splitFound = false;
          for (let i = 0; i < allPastPayments.length; i++) {
            for (let j = i + 1; j < allPastPayments.length; j++) {
              if (allPastPayments[i].amount + allPastPayments[j].amount === transaction.amount) {
                matches.push({
                  amount: transaction.amount,
                  matchedWith: `${allPastPayments[i].company}(${allPastPayments[i].amount.toLocaleString()}円) + ${allPastPayments[j].company}(${allPastPayments[j].amount.toLocaleString()}円)`,
                  matchType: "split"
                });
                splitFound = true;
                break;
              }
            }
            if (splitFound) break;
          }
          
          if (!splitFound) {
            matches.push({
              amount: transaction.amount,
              matchType: "none"
            });
          }
        }
        
        // 照合結果の要約を作成
        const exactCount = matches.filter(m => m.matchType === "exact").length;
        const splitCount = matches.filter(m => m.matchType === "split").length;
        const noneCount = matches.filter(m => m.matchType === "none").length;
        
        let summary = `照合結果: `;
        if (exactCount > 0) summary += `完全一致${exactCount}件`;
        if (splitCount > 0) summary += `${exactCount > 0 ? '、' : ''}分割払い可能性${splitCount}件`;
        if (noneCount > 0) summary += `${(exactCount > 0 || splitCount > 0) ? '、' : ''}不一致${noneCount}件`;
        
        matchingResults = {
          summary,
          matches
        };
      }
      
      return {
        success: true,
        markedTransactions,
        extractedAmounts,
        matchingResults,
        rawOCRResponse: text,
        fileProcessed: file.name,
      };
      
    } catch (error) {
      console.error(`[OCR Bank Statement] Error:`, error);
      return {
        success: false,
        markedTransactions: [],
        extractedAmounts: "OCR処理に失敗しました",
        rawOCRResponse: "",
        error: error instanceof Error ? error.message : "OCR処理に失敗しました",
      };
    }
  },
});