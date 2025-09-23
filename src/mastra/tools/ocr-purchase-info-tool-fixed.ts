import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import axios from "axios";

// 買取情報書類（請求書・発注書）専用OCRツール（バッチ処理版）
export const ocrPurchaseInfoToolFixed = createTool({
  id: "ocr-purchase-info-fixed",
  description: "買取情報書類（請求書・発注書）をバッチOCR処理し、買取債権額と企業名を照合。recordIdから成因証書ファイル+買取情報テーブルを自動取得",
  inputSchema: z.object({
    recordId: z.string().describe("KintoneレコードID（成因証書＿添付ファイル+買取情報テーブル+買取債権額_合計を自動取得）"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    // 📊 OCR検証結果（最重要）
    verification: z.object({
      amountMatch: z.enum(["match", "mismatch", "not_found"]),
      companyMatch: z.enum(["match", "mismatch", "not_found"]),
      invoiceNumber: z.string().optional(),
      paymentDueDate: z.string().optional(),
    }),
    // 🔍 抽出データ（デバッグ用）
    extracted: z.object({
      amount: z.number().optional().describe("OCR抽出金額"),
      company: z.string().optional().describe("OCR抽出会社名"),
    }),
    // 📈 期待値（参照用）
    expected: z.object({
      amount: z.number().describe("期待金額（Kintone）"),
      company: z.string().describe("期待会社名（Kintone）"),
    }),
    // 💰 最終レポート用データ（掛目分析に必要）
    purchaseInfo: z.object({
      totalDebtAmount: z.number().describe("総債権額"),
      purchaseDebtAmount: z.number().describe("買取債権額"),
      purchaseAmount: z.number().describe("実際の買取額"),
      collateralRate: z.number().describe("掛目（%）"),
      company: z.string().describe("買取対象企業名"),
      paymentDate: z.string().describe("支払予定日"),
    }),
    // 📝 要約
    summary: z.string(),
    confidence: z.number().min(0).max(100).describe("OCR信頼度"),
  }),
  
  execute: async ({ context }) => {
    const { recordId } = context;
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
      
      // 買取情報から期待値を取得
      const buyInfo = record.買取情報?.value || [];
      const totalDebtAmount = parseInt(record.買取債権額_合計?.value || "0");
      const purchaseCompany = buyInfo[0]?.value?.会社名_第三債務者_買取?.value || "";
      
      console.log(`[OCR Purchase Info Fixed] 期待値: 総債権額=${totalDebtAmount}, 企業名=${purchaseCompany}`);
      
      console.log(`[OCR Purchase Info Fixed] Total files found: ${purchaseFiles.length}`);
      
      if (purchaseFiles.length === 0) {
        return {
          success: false,
          verification: {
            amountMatch: "not_found" as const,
            companyMatch: "not_found" as const,
          },
          extracted: {},
          expected: {
            amount: totalDebtAmount,
            company: purchaseCompany,
          },
          purchaseInfo: {
            totalDebtAmount: 0,
            purchaseDebtAmount: 0,
            purchaseAmount: 0,
            collateralRate: 0,
            company: "",
            paymentDate: "",
          },
          summary: "買取情報書類が添付されていません",
          confidence: 0,
        };
      }
      
      // シンプル: 上から3ファイルを処理
      const filesToProcess = purchaseFiles.slice(0, 3);
      console.log(`[OCR Purchase Info Fixed] Batch processing ${filesToProcess.length} files`);
      
      // 全ファイルをダウンロードしてデータURLを準備
      const fileContents = [];
      const processedFiles = [];
      
      for (const file of filesToProcess) {
        console.log(`[OCR Purchase Info Fixed] Downloading: ${file.name}`);
        
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
        
        fileContents.push({ type: "image" as const, image: dataUrl });
        processedFiles.push({
          fileName: file.name,
          result: "バッチ処理済み",
        });
      }
      
      // 1回のAPI呼び出しで全ファイルを処理
      const prompt = `これらの書類（${filesToProcess.length}ファイル）を分析してください：

まず各ファイルが買取関連書類か判定:
- 請求書・発注書・契約書・明細書等 → 詳細分析継続
- 迷った場合・不明な場合 → 詳細分析継続（誤スキップ防止）
- 明らかに無関係（個人写真・メモ等） → スキップ（skipReason記載）

⚠️ 重要: 請求書系は積極的に処理してください。疑わしい場合はスキップしないでください。

🎯 【重要】期待値と完全一致する金額を探してください:
- 対象金額: ${totalDebtAmount.toLocaleString()}円（この金額と完全一致するものを最優先で探す）
- 対象企業: ${purchaseCompany}

📋 【抽出ルール】:
1. 金額: ${totalDebtAmount.toLocaleString()}円と完全一致する金額があるか確認
2. 完全一致する金額がある → extracted_amount に設定、q1_amount_present = "match"
3. 完全一致する金額がない → extracted_amount は最も大きい金額、q1_amount_present = "mismatch"

⚠️ 【重要】金額の数字を正確に読み取ってください。8/3、9/0、6/5の混動に注意。

抽出項目: 文書関連性、金額判定、企業判定、実際の金額、実際の企業、請求書番号、支払期日`;
      
      const content = [
        { type: "text" as const, text: prompt },
        ...fileContents
      ];
      
      const result = await generateObject({
        model: openai("gpt-4o"),
        messages: [{ role: "user", content }],
        schema: z.object({
          documentRelevance: z.object({
            isPurchaseRelated: z.boolean().describe("買取関連書類かどうか"),
            skipReason: z.string().optional().describe("買取と関係ない場合の理由")
          }),
          q1_amount_present: z.enum(["match","mismatch","unknown"]),
          extracted_amount: z.number().optional().describe("OCRで抽出した実際の金額（数値のみ）"),
          q2_addressee_present: z.enum(["match","mismatch","unknown"]),
          extracted_company: z.string().optional().describe("OCRで抽出した実際の会社名"),
          q3_issuer_present: z.enum(["match","mismatch","unknown"]),
          bestMatchFile: z.string().optional().describe("最も一致度の高いファイル名"),
          invoiceNumber: z.string().optional(),
          paymentDueDate: z.string().optional(),
          confidence: z.number().min(0).max(100).optional(),
          notes: z.string().optional()
        }),
        mode: "json",
        temperature: 0,
      });

      // 結果を設定
      const q1 = result.object.q1_amount_present;
      const q2 = result.object.q2_addressee_present;
      
      let amountMatch: "match" | "mismatch" | "not_found" = "not_found";
      let foundAmount: number | undefined = undefined;
      let companyMatch: "match" | "mismatch" | "not_found" = "not_found";
      let foundCompany: string | undefined = undefined;
      
      if (q1 === "match") {
        amountMatch = "match";
        foundAmount = totalDebtAmount;
      } else if (q1 === "mismatch") {
        amountMatch = "mismatch";
        // デバッグ: OCRが抽出した実際の金額を表示
        foundAmount = result.object.extracted_amount || undefined;
        console.log(`[OCR Purchase Info Fixed] 金額不一致: 期待=${totalDebtAmount}, OCR抽出=${foundAmount}`);
      }
      
      if (q2 === "match") {
        companyMatch = "match";
        foundCompany = purchaseCompany;
      } else if (q2 === "mismatch") {
        companyMatch = "mismatch";
        // デバッグ: OCRが抽出した実際の会社名を表示
        foundCompany = result.object.extracted_company || "不明";
        console.log(`[OCR Purchase Info Fixed] 会社名不一致: 期待=${purchaseCompany}, OCR抽出=${foundCompany}`);
      }
      
      const invoiceNumber = result.object.invoiceNumber;
      const paymentDueDate = result.object.paymentDueDate;
      
      // スキップされていないファイル数をカウント
      const processedFileCount = result.object.documentRelevance?.isPurchaseRelated ? filesToProcess.length : 0;
      
      console.log(`[OCR Purchase Info Fixed] バッチ処理完了: 金額=${q1}, 宛先=${q2}, 処理ファイル数=${processedFileCount}, 最適ファイル=${result.object.bestMatchFile}`);
      
      // 信頼度計算
      let confidence = 0;
      if (amountMatch === "match") confidence += 40;
      if (companyMatch === "match") confidence += 40;
      if (result.object.q3_issuer_present === "match") confidence += 20;
      
      // 買取情報テーブルを整理して返却用に準備
      console.log(`[OCR Purchase Info Fixed] 買取情報: ${buyInfo.length}件, 総債権額: ${totalDebtAmount}, 買取額: ${record.買取額_合計?.value || "0"}`);
      
      const summary = `請求書OCR完了（${processedFileCount}ファイル処理）。金額: ${amountMatch}, 宛先: ${companyMatch}${result.object.documentRelevance?.isPurchaseRelated === false ? '（一部ファイルスキップ）' : ''}`;
      
      // 最初の買取情報を取得（通常は1件のみ）
      const firstBuyInfo = buyInfo[0];
      const purchaseInfoData = {
        totalDebtAmount: parseInt(firstBuyInfo?.value?.総債権額?.value || "0"),
        purchaseDebtAmount: parseInt(firstBuyInfo?.value?.買取債権額?.value || "0"),
        purchaseAmount: parseInt(firstBuyInfo?.value?.買取額?.value || "0"),
        collateralRate: parseFloat(firstBuyInfo?.value?.掛目?.value || "0"),
        company: firstBuyInfo?.value?.会社名_第三債務者_買取?.value || "",
        paymentDate: firstBuyInfo?.value?.買取債権支払日?.value || "",
      };

      return {
        success: amountMatch === "match" && companyMatch === "match",
        verification: {
          amountMatch,
          companyMatch,
          invoiceNumber,
          paymentDueDate,
        },
        extracted: {
          amount: foundAmount,
          company: foundCompany,
        },
        expected: {
          amount: totalDebtAmount,
          company: purchaseCompany,
        },
        purchaseInfo: purchaseInfoData,
        summary,
        confidence,
      };
      
    } catch (error) {
      console.error("[OCR Purchase Info Fixed] Error:", error);
      return {
        success: false,
        verification: {
          amountMatch: "not_found" as const,
          companyMatch: "not_found" as const,
        },
        extracted: {},
        expected: {
          amount: 0,
          company: "",
        },
        purchaseInfo: {
          totalDebtAmount: 0,
          purchaseDebtAmount: 0,
          purchaseAmount: 0,
          collateralRate: 0,
          company: "",
          paymentDate: "",
        },
        summary: `OCR処理エラー: ${error instanceof Error ? error.message : "不明なエラー"}`,
        confidence: 0,
      };
    }
  },
});
