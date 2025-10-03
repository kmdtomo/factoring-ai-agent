import { createStep } from "@mastra/core/workflows";
import { RuntimeContext } from "@mastra/core/runtime-context";
import { z } from "zod";
import { googleVisionPurchaseCollateralOcrTool } from "../tools/google-vision-purchase-collateral-ocr-tool";
import { purchaseVerificationToolMinimal } from "../tools/purchase-verification-tool-minimal";
import { collateralVerificationTool } from "../tools/collateral-verification-tool";

/**
 * Phase 1: 買取・担保情報処理ステップ
 * エージェントを使わず、ワークフロー内でツールを直接実行
 */
export const phase1PurchaseCollateralStep = createStep({
  id: "phase1-purchase-collateral",
  description: "買取請求書と担保謄本の処理（OCR → 買取検証 → 担保検証）",
  
  inputSchema: z.object({
    recordId: z.string().describe("KintoneレコードID"),
  }),
  
  outputSchema: z.object({
    recordId: z.string(),
    phase1Results: z.object({
      ocr: z.object({
        success: z.boolean(),
        purchaseDocuments: z.array(z.any()),
        collateralDocuments: z.array(z.any()),
        processingDetails: z.any(),
      }),
      purchaseVerification: z.object({
        success: z.boolean(),
        summary: z.string(),
        purchaseInfo: z.any(),
        metadata: z.any(),
      }),
      collateralVerification: z.object({
        success: z.boolean(),
        summary: z.string(),
        collateralInfo: z.any(),
        relationshipAnalysis: z.any(),
      }),
    }),
    summary: z.string(),
  }),
  
  execute: async ({ inputData }) => {
    const { recordId } = inputData;
    
    console.log(`\n${"=".repeat(80)}`);
    console.log(`[Phase 1] 買取・担保情報処理開始 - recordId: ${recordId}`);
    console.log(`${"=".repeat(80)}\n`);
    
    try {
      // ========================================
      // ステップ1: OCR処理（ツールを直接実行）
      // ========================================
      console.log(`[Phase 1 - Step 1/3] OCR処理開始`);
      const ocrStartTime = Date.now();
      
      const ocrResult = await googleVisionPurchaseCollateralOcrTool.execute!({
        context: {
          recordId,
          purchaseFieldName: "成因証書＿添付ファイル",
          collateralFieldName: "担保情報＿添付ファイル",
          maxPagesPerFile: 20,
        },
        runtimeContext: new RuntimeContext(),
      });
      
      const ocrDuration = Date.now() - ocrStartTime;
      console.log(`[Phase 1 - Step 1/3] OCR処理完了 - 処理時間: ${ocrDuration}ms`);
      console.log(`  - 買取書類: ${ocrResult.purchaseDocuments.length}件`);
      console.log(`  - 担保書類: ${ocrResult.collateralDocuments.length}件`);
      console.log(`  - 総ページ数: ${ocrResult.processingDetails.totalPages}ページ`);
      
      // OCR結果の詳細表示
      console.log(`\n━━━ OCR抽出結果 ━━━`);
      if (ocrResult.purchaseDocuments.length > 0) {
        console.log(`\n【買取請求書】`);
        ocrResult.purchaseDocuments.forEach((doc, index) => {
          console.log(`  📄 ${doc.fileName} (${doc.pageCount}ページ)`);
          console.log(`     先頭: "${doc.text.substring(0, 50).replace(/\n/g, ' ')}..."`);
        });
      } else {
        console.log(`\n【買取請求書】 ⚠️ ファイルなし`);
      }
      
      if (ocrResult.collateralDocuments.length > 0) {
        console.log(`\n【担保謄本】`);
        ocrResult.collateralDocuments.forEach((doc, index) => {
          console.log(`  📄 ${doc.fileName} (${doc.pageCount}ページ)`);
          console.log(`     先頭: "${doc.text.substring(0, 50).replace(/\n/g, ' ')}..."`);
        });
      } else {
        console.log(`\n【担保謄本】 ⚠️ ファイルなし`);
      }
      console.log(`━━━━━━━━━━━━━━━━━━━━━━\n`);
      
      if (!ocrResult.success) {
        throw new Error(`OCR処理失敗: ${ocrResult.error}`);
      }
      
      // ========================================
      // ステップ2: 買取検証（構造化データを直接渡す）
      // ========================================
      console.log(`\n[Phase 1 - Step 2/3] 買取検証開始`);
      const purchaseStartTime = Date.now();
      
      const purchaseResult = await purchaseVerificationToolMinimal.execute!({
        context: {
          recordId,
          purchaseDocuments: ocrResult.purchaseDocuments, // 構造化データをそのまま渡す
          model: "claude-3-5-sonnet-20241022",
        },
        runtimeContext: new RuntimeContext(),
      });
      
      const purchaseDuration = Date.now() - purchaseStartTime;
      console.log(`[Phase 1 - Step 2/3] 買取検証完了 - 処理時間: ${purchaseDuration}ms`);
      
      // 買取検証結果の詳細表示
      console.log(`\n━━━ 買取検証 ━━━`);
      console.log(`\n【OCRから抽出】`);
      console.log(`  申込者: ${purchaseResult.purchaseInfo.applicantCompany}`);
      console.log(`  総債権額: ¥${purchaseResult.purchaseInfo.totalAmount.toLocaleString()}`);
      
      if (purchaseResult.purchaseInfo.debtorCompanies.length > 0) {
        console.log(`  第三債務者:`);
        purchaseResult.purchaseInfo.debtorCompanies.forEach((company: any, index: number) => {
          console.log(`    ${index + 1}. ${company.name} - ¥${company.amount.toLocaleString()}`);
        });
      } else {
        console.log(`  第三債務者: ⚠️ 抽出失敗`);
      }
      
      console.log(`\n【Kintone照合】`);
      console.log(`  判定: ${purchaseResult.metadata.verificationResults.総合評価}`);
      
      if (purchaseResult.metadata.verificationResults.詳細.length > 0) {
        purchaseResult.metadata.verificationResults.詳細.forEach((detail: any) => {
          const icon = detail.判定 === "一致" ? "✓" : "✗";
          console.log(`  ${icon} ${detail.項目}: OCR="${detail.OCR値}" / Kintone="${detail.Kintone値}"`);
        });
      }
      console.log(`━━━━━━━━━━━━━━━━━━━━━━\n`);
      
      if (!purchaseResult.success) {
        throw new Error(`買取検証失敗: ${purchaseResult.summary}`);
      }
      
      // ========================================
      // ステップ3: 担保検証（構造化データを直接渡す）
      // ========================================
      console.log(`\n[Phase 1 - Step 3/3] 担保検証開始`);
      const collateralStartTime = Date.now();
      
      // 買取企業名リストを抽出
      const purchaseCompanyNames = purchaseResult.purchaseInfo.debtorCompanies.map(
        (company: any) => company.name
      );
      
      const collateralResult = await collateralVerificationTool.execute!({
        context: {
          recordId,
          collateralDocuments: ocrResult.collateralDocuments, // 構造化データをそのまま渡す
          purchaseCompanies: purchaseCompanyNames,
          model: "claude-3-5-sonnet-20241022",
        },
        runtimeContext: new RuntimeContext(),
      });
      
      const collateralDuration = Date.now() - collateralStartTime;
      console.log(`[Phase 1 - Step 3/3] 担保検証完了 - 処理時間: ${collateralDuration}ms`);
      
      // 担保検証結果の詳細表示
      console.log(`\n━━━ 担保検証 ━━━`);
      
      if (ocrResult.collateralDocuments.length === 0) {
        console.log(`\n⚠️  担保謄本ファイルなし（検証スキップ）`);
      } else {
        console.log(`\n【OCRから抽出】`);
        if (collateralResult.collateralInfo.companies.length > 0) {
          console.log(`  担保企業:`);
          collateralResult.collateralInfo.companies.forEach((company: any, index: number) => {
            console.log(`    ${index + 1}. ${company.name}${company.capital ? ` (資本金: ¥${company.capital.toLocaleString()})` : ''}`);
          });
        } else {
          console.log(`  担保企業: ⚠️ 抽出失敗`);
        }
        
        console.log(`\n【買取企業との照合】`);
        if (collateralResult.relationshipAnalysis.matchedCompanies.length > 0) {
          collateralResult.relationshipAnalysis.matchedCompanies.forEach((company: string) => {
            console.log(`  ✓ ${company} (担保あり)`);
          });
        }
        if (collateralResult.relationshipAnalysis.unmatchedPurchaseCompanies.length > 0) {
          collateralResult.relationshipAnalysis.unmatchedPurchaseCompanies.forEach((company: string) => {
            console.log(`  ✗ ${company} (担保なし)`);
          });
        }
        
        console.log(`\n【Kintone照合】`);
        console.log(`  判定: ${collateralResult.metadata.verificationResults.総合評価}`);
        
        if (collateralResult.metadata.verificationResults.詳細.length > 0) {
          collateralResult.metadata.verificationResults.詳細.forEach((detail: any) => {
            const icon = detail.判定 === "一致" ? "✓" : "✗";
            console.log(`  ${icon} ${detail.項目}: OCR="${detail.OCR値}" / Kintone="${detail.Kintone値}"`);
          });
        }
      }
      console.log(`━━━━━━━━━━━━━━━━━━━━━━\n`);
      
      if (!collateralResult.success && ocrResult.collateralDocuments.length > 0) {
        // 担保ファイルがある場合のみエラーとする
        throw new Error(`担保検証失敗: ${collateralResult.summary}`);
      }
      
      // ========================================
      // 結果のサマリー生成
      // ========================================
      const totalDuration = ocrDuration + purchaseDuration + collateralDuration;
      
      // 第三債務者リストを作成
      const debtorsList = purchaseResult.purchaseInfo.debtorCompanies
        .map((c: any, i: number) => `${i + 1}. ${c.name} (¥${c.amount.toLocaleString()})`)
        .join('\n  ');
      
      // 担保企業リストを作成
      const collateralList = collateralResult.collateralInfo.companies.length > 0
        ? collateralResult.collateralInfo.companies
            .map((c: any, i: number) => `${i + 1}. ${c.name}${c.capital ? ` (資本金: ¥${c.capital.toLocaleString()})` : ''}`)
            .join('\n  ')
        : 'なし（ファイル未添付）';
      
      const summary = `
Phase 1 処理完了 - recordId: ${recordId}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【処理時間】
  - OCR処理: ${(ocrDuration / 1000).toFixed(2)}秒
  - 買取検証: ${(purchaseDuration / 1000).toFixed(2)}秒
  - 担保検証: ${(collateralDuration / 1000).toFixed(2)}秒
  - 合計: ${(totalDuration / 1000).toFixed(2)}秒

【OCR処理結果】
  - 買取書類: ${ocrResult.purchaseDocuments.length}件${ocrResult.purchaseDocuments.length === 0 ? ' ⚠️' : ''}
  - 担保書類: ${ocrResult.collateralDocuments.length}件${ocrResult.collateralDocuments.length === 0 ? ' ⚠️' : ''}
  - 総ページ数: ${ocrResult.processingDetails.totalPages}ページ

【買取検証結果】
  - 申込者企業: ${purchaseResult.purchaseInfo.applicantCompany}
  - 総債権額: ¥${purchaseResult.purchaseInfo.totalAmount.toLocaleString()}
  - 第三債務者: ${purchaseResult.purchaseInfo.debtorCompanies.length}社
  ${debtorsList ? `  ${debtorsList}` : ''}
  - Kintone照合: ${purchaseResult.metadata.verificationResults.総合評価}

【担保検証結果】
  - 担保企業: ${collateralResult.collateralInfo.totalCompanies}社
  ${collateralList ? `  ${collateralList}` : ''}
  - 買取企業との一致: ${collateralResult.relationshipAnalysis.purchaseCollateralMatch ? "✓ 一致" : "✗ 不一致"}
${collateralResult.relationshipAnalysis.matchedCompanies.length > 0 ? `  - 一致企業: ${collateralResult.relationshipAnalysis.matchedCompanies.join(", ")}` : ''}
${collateralResult.relationshipAnalysis.unmatchedPurchaseCompanies.length > 0 ? `  - 担保なし: ${collateralResult.relationshipAnalysis.unmatchedPurchaseCompanies.join(", ")} ⚠️` : ''}
  - Kintone照合: ${collateralResult.metadata.verificationResults.総合評価}

【コスト分析】
  - Google Vision API: $${ocrResult.costAnalysis.googleVisionCost.toFixed(4)}
  - 買取検証AI: $${purchaseResult.costInfo.totalCost.toFixed(4)}
  - 担保検証AI: $${collateralResult.costInfo.totalCost.toFixed(4)}
  - 合計: $${(ocrResult.costAnalysis.googleVisionCost + purchaseResult.costInfo.totalCost + collateralResult.costInfo.totalCost).toFixed(4)} (約¥${Math.round((ocrResult.costAnalysis.googleVisionCost + purchaseResult.costInfo.totalCost + collateralResult.costInfo.totalCost) * 150)})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`.trim();
      
      console.log(`\n${summary}\n`);
      
      // 人間が読みやすい結果データを作成
      const readableResults = {
        申込者企業: purchaseResult.purchaseInfo.applicantCompany,
        総債権額: `¥${purchaseResult.purchaseInfo.totalAmount.toLocaleString()}`,
        第三債務者: purchaseResult.purchaseInfo.debtorCompanies.map((c: any) => ({
          企業名: c.name,
          債権額: `¥${c.amount.toLocaleString()}`,
          支払期日: c.dueDate || "なし",
        })),
        担保企業: collateralResult.collateralInfo.companies.length > 0
          ? collateralResult.collateralInfo.companies.map((c: any) => ({
              企業名: c.name,
              資本金: c.capital ? `¥${c.capital.toLocaleString()}` : "不明",
              法人番号: c.registrationNumber || "不明",
            }))
          : "ファイルなし",
        担保状況: {
          一致企業: collateralResult.relationshipAnalysis.matchedCompanies,
          担保なし: collateralResult.relationshipAnalysis.unmatchedPurchaseCompanies,
        },
        照合結果: {
          買取検証: purchaseResult.metadata.verificationResults.総合評価,
          担保検証: collateralResult.metadata.verificationResults.総合評価,
        },
        処理時間: `${(totalDuration / 1000).toFixed(2)}秒`,
        コスト: `$${(ocrResult.costAnalysis.googleVisionCost + purchaseResult.costInfo.totalCost + collateralResult.costInfo.totalCost).toFixed(4)}`,
      };
      
      return {
        recordId,
        // プレイグラウンドで見やすい形式
        結果サマリー: readableResults,
        // 詳細な生データ（API連携用）
        phase1Results: {
          ocr: {
            success: ocrResult.success,
            purchaseDocuments: ocrResult.purchaseDocuments,
            collateralDocuments: ocrResult.collateralDocuments,
            processingDetails: ocrResult.processingDetails,
          },
          purchaseVerification: {
            success: purchaseResult.success,
            summary: purchaseResult.summary,
            purchaseInfo: purchaseResult.purchaseInfo,
            metadata: purchaseResult.metadata,
          },
          collateralVerification: {
            success: collateralResult.success,
            summary: collateralResult.summary,
            collateralInfo: collateralResult.collateralInfo,
            relationshipAnalysis: collateralResult.relationshipAnalysis,
          },
        },
        summary,
      };
      
    } catch (error: any) {
      console.error(`\n[Phase 1] エラー発生:`, error.message);
      console.error(error);
      
      throw new Error(`Phase 1 処理失敗: ${error.message}`);
    }
  },
});

