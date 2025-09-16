import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
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
      
      // ファイル選定ロジック（汎用化）
      // 1) 名前で請求書/発注書を優先（PDF→画像の順）
      const byName = purchaseFiles.filter((f: any) =>
        (f.name || '').includes('請求書') || (f.name || '').includes('発注書')
      );
      const byNamePdf = byName.filter((f: any) => f.contentType === 'application/pdf');
      const byNameImage = byName.filter((f: any) => (f.contentType || '').startsWith('image/'));
      
      // 2) 何も見つからなければ、全PDF/画像を対象
      const allPdf = purchaseFiles.filter((f: any) => f.contentType === 'application/pdf');
      const allImages = purchaseFiles.filter((f: any) => (f.contentType || '').startsWith('image/'));
      
      let invoiceFiles = [...byNamePdf, ...byNameImage];
      if (invoiceFiles.length === 0) {
        invoiceFiles = [...allPdf, ...allImages];
      }
      
      console.log(`[OCR Purchase Info] Candidate files: ${invoiceFiles.length}`);
      
      for (const file of invoiceFiles.slice(0, 3)) { // 最大3ファイルまで処理（汎用化とコスト配慮）
        console.log(`[OCR Purchase Info] Processing: ${file.name}`);
        
        // ファイルをダウンロード
        const downloadUrl = `https://${domain}/k/v1/file.json?fileKey=${file.fileKey}`;
        const fileResponse = await axios.get(downloadUrl, {
          headers: { 'X-Cybozu-API-Token': apiToken },
          responseType: 'arraybuffer',
        });
        
        const base64Content = Buffer.from(fileResponse.data).toString('base64');
        
        // JSONスキーマで厳格に照合＋任意項目抽出
        const prompt = `PDF/画像の全ページを確認し、以下を判断・抽出してください。

必須の判定:
1) 金額: 書類のどこかに「${purchaseData.totalDebtAmount.toLocaleString()}円」と明記があるか。
2) 宛先: 宛先（〇〇御中 等）に「${purchaseData.debtorCompany}」が記載されているか。
3) 発行者: 発行元（会社名/ロゴ）が「${applicantCompany}」であるか。

任意の抽出（見つかる場合のみ）:
- 請求書番号（invoiceNumber）: 原文そのまま。
- 支払期日（paymentDueDate）: YYYY-MM-DD 形式が望ましいが、原文のままでも可。

ルール:
- 見えない/判別不能な場合は unknown を返す（false ではない）。
- 推測や補完は禁止。画面で確認できる根拠があるもののみ。
- 出力は指定JSONのみ。説明文や断り書きは禁止。`;
        
        // PDFファイルの場合はデータURLとして送信
        const isPDF = file.contentType === 'application/pdf';
        const dataUrl = isPDF 
          ? `data:application/pdf;base64,${base64Content}`
          : `data:${file.contentType};base64,${base64Content}`;
        
        const result = await generateObject({
          model: openai("gpt-4o"),
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image", image: dataUrl }
              ]
            }
          ],
          schema: z.object({
            q1_amount_present: z.enum(["match","mismatch","unknown"]),
            q2_addressee_present: z.enum(["match","mismatch","unknown"]),
            q3_issuer_present: z.enum(["match","mismatch","unknown"]),
            invoiceNumber: z.string().optional(),
            paymentDueDate: z.string().optional(),
            notes: z.string().optional()
          }),
          mode: "json",
          temperature: 0,
        });

        // 判定値に変換
        const q1 = result.object.q1_amount_present;
        const q2 = result.object.q2_addressee_present;
        const q3 = result.object.q3_issuer_present;
        const notes = result.object.notes || "";

        // グローバル集約（最も強い一致を優先）
        if (q1 === "match") {
          foundAmount = foundAmount ?? purchaseData.totalDebtAmount;
          amountMatch = "match";
        } else if (q1 === "mismatch" && amountMatch !== "match") {
          amountMatch = "mismatch";
        }

        if (q2 === "match") {
          foundCompany = foundCompany ?? purchaseData.debtorCompany;
          companyMatch = "match";
        } else if (q2 === "mismatch" && companyMatch !== "match") {
          companyMatch = "mismatch";
        }

        const applicantMatch = q3 === "match" ? "match" : q3 === "mismatch" ? "mismatch" : "not_found";

        // 任意抽出（初回のみ採用）
        if (!invoiceNumber && result.object.invoiceNumber) {
          invoiceNumber = result.object.invoiceNumber;
        }
        if (!paymentDueDate && result.object.paymentDueDate) {
          paymentDueDate = result.object.paymentDueDate;
        }
        
        // 請求書番号と支払期日も抽出（追加プロンプトで取得する場合）
        // 現在のプロンプトには含まれていないため、必要に応じて後で実装
        
        // より詳細な結果を記録
        const detailedResult = `照合結果\n` +
          `1. 請求金額 ${purchaseData.totalDebtAmount.toLocaleString()}円: ${amountMatch === "match" ? "✓ 一致" : amountMatch === "mismatch" ? "✗ 不一致" : "? 確認不能"}\n` +
          `2. 請求先 ${purchaseData.debtorCompany}: ${companyMatch === "match" ? "✓ 一致" : companyMatch === "mismatch" ? "✗ 不一致" : "? 確認不能"}\n` +
          `3. 請求元 ${applicantCompany}: ${applicantMatch === "match" ? "✓ 一致" : applicantMatch === "mismatch" ? "✗ 不一致" : "? 確認不能"}` +
          (invoiceNumber ? `\n請求書番号: ${invoiceNumber}` : "") +
          (paymentDueDate ? `\n支払期日: ${paymentDueDate}` : "") +
          (notes ? `\n備考: ${notes}` : "");
        
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
          rawResponse: JSON.stringify(result.object)
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