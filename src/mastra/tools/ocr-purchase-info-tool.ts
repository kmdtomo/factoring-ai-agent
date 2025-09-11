import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import axios from "axios";

// 買取情報書類（請求書・発注書）専用OCRツール
export const ocrPurchaseInfoTool = createTool({
  id: "ocr-purchase-info",
  description: "買取情報書類（請求書・発注書）をOCR処理し、買取債権額と企業名を照合",
  inputSchema: z.object({
    recordId: z.string().describe("KintoneレコードID"),
    purchaseData: z.object({
      totalDebtAmount: z.number().describe("総債権額（請求書記載額）"),
      debtorCompany: z.string().describe("第三債務者名（請求先）"),
      purchaseAmount: z.number().optional().describe("買取債権額（参考）"),
    }),
    applicantCompany: z.string().describe("申込者企業名（請求元）"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    verificationResult: z.object({
      amountMatch: z.enum(["match", "mismatch", "not_found"]),
      foundAmount: z.number().optional(),
      companyMatch: z.enum(["match", "mismatch", "not_found"]),
      foundCompany: z.string().optional(),
      invoiceNumber: z.string().optional(),
      paymentDueDate: z.string().optional(),
    }),
    processedFiles: z.array(z.object({
      fileName: z.string(),
      result: z.string(),
    })),
    summary: z.string(),
    confidence: z.number().min(0).max(100),
  }),
  
  execute: async ({ context }) => {
    const { recordId, purchaseData, applicantCompany } = context;
    const domain = process.env.KINTONE_DOMAIN;
    const apiToken = process.env.KINTONE_API_TOKEN;
    
    if (!domain || !apiToken) {
      throw new Error("Kintone環境変数が設定されていません");
    }
    
    try {
      // 買取情報関連の添付ファイルを取得
      const fileUrl = `https://${domain}/k/v1/records.json?app=37&query=$id="${recordId}"`;
      const recordResponse = await axios.get(fileUrl, {
        headers: { 'X-Cybozu-API-Token': apiToken },
      });
      
      if (recordResponse.data.records.length === 0) {
        throw new Error(`レコードID: ${recordId} が見つかりません`);
      }
      
      const record = recordResponse.data.records[0];
      const purchaseFiles = record.成因証書＿添付ファイル?.value || [];
      
      console.log(`[OCR Purchase Info] Total files found: ${purchaseFiles.length}`);
      if (purchaseFiles.length > 0) {
        console.log(`[OCR Purchase Info] File list:`, purchaseFiles.map((f: any) => ({
          name: f.name,
          contentType: f.contentType,
          size: f.size
        })));
      }
      
      if (purchaseFiles.length === 0) {
        return {
          success: false,
          verificationResult: {
            amountMatch: "not_found" as const,
            companyMatch: "not_found" as const,
          },
          processedFiles: [],
          summary: "買取情報書類が添付されていません",
          confidence: 0,
        };
      }
      
      const processedFiles = [];
      let amountMatch: "match" | "mismatch" | "not_found" = "not_found";
      let foundAmount = undefined;
      let companyMatch: "match" | "mismatch" | "not_found" = "not_found";
      let foundCompany = undefined;
      let invoiceNumber = undefined;
      let paymentDueDate = undefined;
      
      // 請求書・発注書のみを処理（PDFファイルを優先）
      let invoiceFiles = purchaseFiles.filter((f: any) => 
        f.contentType === 'application/pdf' && 
        (f.name.includes('請求書') || f.name.includes('発注書'))
      );
      
      console.log(`[OCR Purchase Info] Found ${invoiceFiles.length} PDF invoice files`);
      
      if (invoiceFiles.length === 0) {
        // PDFファイルがない場合、全てのファイルから処理
        console.log(`[OCR Purchase Info] No PDF invoice files found, checking all files`);
        invoiceFiles = purchaseFiles.filter((f: any) => 
          f.name.includes('請求書') || f.name.includes('発注書')
        );
        console.log(`[OCR Purchase Info] Found ${invoiceFiles.length} total invoice files`);
      }
      
      for (const file of invoiceFiles.slice(0, 1)) { // 最初の1ファイルのみ処理
        console.log(`[OCR Purchase Info] Processing: ${file.name}`);
        
        // ファイルをダウンロード
        const downloadUrl = `https://${domain}/k/v1/file.json?fileKey=${file.fileKey}`;
        const fileResponse = await axios.get(downloadUrl, {
          headers: { 'X-Cybozu-API-Token': apiToken },
          responseType: 'arraybuffer',
        });
        
        const base64Content = Buffer.from(fileResponse.data).toString('base64');
        
        // GPT-4oで照合処理（シンプルなYes/No形式）
        const prompt = `請求書を確認し、以下の3つの質問に答えてください。

1. この請求書に「${purchaseData.totalDebtAmount.toLocaleString()}円」という金額が記載されていますか？
2. この請求書の宛先（〇〇御中の部分）に「${purchaseData.debtorCompany}」と書かれていますか？
3. この請求書の発行者（会社名/ロゴ）は「${applicantCompany}」ですか？

各質問に対して「はい」または「いいえ」で回答してください。
必ず以下の形式で回答してください：
1. はい（またはいいえ）
2. はい（またはいいえ）
3. はい（またはいいえ）`;
        
        // PDFファイルの場合はデータURLとして送信
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
                  image: dataUrl  // PDFもimageタイプとして送信（データURL形式）
                }
              ]
            }
          ],
        });
        
        // レスポンスを解析
        const text = response.text;
        console.log(`[OCR Purchase Info] GPT-4o response:`, text);
        
        // シンプルなパターンマッチング
        // 「1. はい」「2. いいえ」などの形式を探す
        const answer1Match = text.match(/1\.\s*(はい|いいえ)/i);
        const answer2Match = text.match(/2\.\s*(はい|いいえ)/i);
        const answer3Match = text.match(/3\.\s*(はい|いいえ)/i);
        
        console.log(`[OCR Purchase Info] Parsed answers:`, {
          answer1: answer1Match?.[1],
          answer2: answer2Match?.[1],
          answer3: answer3Match?.[1]
        });
        
        // 1. 請求金額の判定
        if (answer1Match) {
          if (answer1Match[1] === 'はい') {
            foundAmount = purchaseData.totalDebtAmount;
            amountMatch = "match";
            console.log(`[OCR Purchase Info] Amount matches: ${foundAmount}`);
          } else {
            amountMatch = "mismatch";
            console.log(`[OCR Purchase Info] Amount does not match`);
          }
        }
        
        // 2. 請求先の判定
        if (answer2Match) {
          if (answer2Match[1] === 'はい') {
            foundCompany = purchaseData.debtorCompany;
            companyMatch = "match";
            console.log(`[OCR Purchase Info] Company matches: ${foundCompany}`);
          } else {
            companyMatch = "mismatch";
            console.log(`[OCR Purchase Info] Company does not match`);
          }
        }
        
        // 3. 請求元の判定
        let applicantMatch = "not_found";
        if (answer3Match) {
          applicantMatch = answer3Match[1] === 'はい' ? "match" : "mismatch";
          console.log(`[OCR Purchase Info] Applicant ${applicantMatch}`);
        }
        
        // 請求書番号と支払期日も抽出（追加プロンプトで取得する場合）
        // 現在のプロンプトには含まれていないため、必要に応じて後で実装
        
        // より詳細な結果を記録
        const detailedResult = `照合結果:
` +
          `1. 請求金額 ${purchaseData.totalDebtAmount.toLocaleString()}円: ${amountMatch === "match" ? "✓ 一致" : amountMatch === "mismatch" ? "✗ 不一致" : "? 確認不能"}
` +
          `2. 請求先 ${purchaseData.debtorCompany}: ${companyMatch === "match" ? "✓ 一致" : companyMatch === "mismatch" ? "✗ 不一致" : "? 確認不能"}
` +
          `3. 請求元 ${applicantCompany}: ${applicantMatch === "match" ? "✓ 一致" : applicantMatch === "mismatch" ? "✗ 不一致" : "? 確認不能"}\n\n` +
          `GPT応答: ${text}`;
        
        processedFiles.push({
          fileName: file.name,
          result: detailedResult,
        });
        
        console.log(`[OCR Purchase Info] 解析結果:`, {
          amountMatch,
          foundAmount,
          companyMatch,
          foundCompany,
          applicantMatch,
          answer1: answer1Match?.[1],
          answer2: answer2Match?.[1],
          answer3: answer3Match?.[1],
          rawResponse: text
        });
      }
      
      // 結果サマリーを生成
      const summary = amountMatch === "match" && companyMatch === "match" ?
        `請求金額（総債権額）と請求先企業名の両方が一致しました` :
        amountMatch === "match" ?
          `請求金額は一致しましたが、請求先が${companyMatch === "mismatch" ? "不一致" : "確認できません"}` :
          companyMatch === "match" ?
            `請求先は一致しましたが、請求金額が${amountMatch === "mismatch" ? "不一致" : "確認できません"}` :
            `請求金額と請求先の両方が${amountMatch === "mismatch" || companyMatch === "mismatch" ? "不一致" : "確認できません"}`;
      
      const confidence = amountMatch === "match" && companyMatch === "match" ? 95 :
                        amountMatch === "match" || companyMatch === "match" ? 50 : 10;
      
      return {
        success: true,
        verificationResult: {
          amountMatch,
          foundAmount,
          companyMatch,
          foundCompany,
          invoiceNumber,
          paymentDueDate,
        },
        processedFiles,
        summary,
        confidence,
      };
      
    } catch (error) {
      console.error(`[OCR Purchase Info] Error:`, error);
      return {
        success: false,
        verificationResult: {
          amountMatch: "not_found" as const,
          companyMatch: "not_found" as const,
        },
        processedFiles: [],
        summary: `エラー: ${error instanceof Error ? error.message : "OCR処理に失敗しました"}`,
        confidence: 0,
      };
    }
  },
});