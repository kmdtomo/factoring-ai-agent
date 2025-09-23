import { createWorkflow, createStep } from "@mastra/core/workflows";
import { RuntimeContext } from "@mastra/core/runtime-context";
import { z } from "zod";
import {
  kintoneFetchTool,
  purchaseDataPrepTool,
  ocrPurchaseInfoTool,
  ocrBankStatementTool,
  ocrIdentityToolV2,
  egoSearchTool,
  companyVerifyTool,
  ocrRegistryToolV2,
  ocrCollateralTool,
  paymentAnalysisV2Tool,
} from "../tools";

// 全処理を1つのステップで実行（シンプル）
const executeComplianceStep = createStep({
  id: "execute-compliance",
  description: "ファクタリング審査の全処理を実行",
  inputSchema: z.object({
    recordId: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    report: z.string(),
    errors: z.array(z.string()),
  }),
  execute: async ({ inputData }) => {
    const { recordId } = inputData;
    const errors: string[] = [];
    let report = "# ファクタリング審査レポート\n\n";

    try {
      // Phase 1: Kintoneデータ取得
      console.log("[Workflow] Phase 1: Kintoneデータ取得");
      const kintoneResult = await kintoneFetchTool.execute({
        context: { recordId },
        runtimeContext: new RuntimeContext(),
      });

      if (!kintoneResult.success) {
        throw new Error(`Kintoneデータ取得失敗: ${kintoneResult.error}`);
      }

      const kintoneData = kintoneResult.data;
      report += `## 基本情報\n- 申込者: ${kintoneData.basic?.代表者名}\n- 会社名: ${kintoneData.basic?.会社_屋号名}\n\n`;

      // Phase 2: OCR処理（順次実行）
      console.log("[Workflow] Phase 2: OCR処理");
      
      // 買取情報準備 + 請求書OCR
      try {
        const purchasePrepResult = await purchaseDataPrepTool.execute({
          context: { kintoneData },
          runtimeContext: new RuntimeContext(),
        });

        if (purchasePrepResult.purchaseData) {
          const purchaseOCRResult = await ocrPurchaseInfoTool.execute({
            context: {
              recordId,
            },
            runtimeContext: new RuntimeContext(),
          });
          
          if (purchaseOCRResult.success) {
            report += `## 請求書照合\n- 結果: ${purchaseOCRResult.verificationResult?.amountMatch === 'match' ? '✓ 一致' : '要確認'}\n\n`;
          }
        }
      } catch (error) {
        errors.push(`請求書OCR: ${error instanceof Error ? error.message : '不明なエラー'}`);
      }

      // 通帳OCR
      try {
        const collateralInfo = kintoneData.collaterals?.map((item: any) => ({
          companyName: item.会社名_第三債務者_担保,
          pastPayments: {
            threeMonthsAgo: item.過去の入金_先々月 || 0,
            twoMonthsAgo: item.過去の入金_先月 || 0,
            lastMonth: item.過去の入金_今月 || 0,
          },
        })) || [];

        const bankResult = await ocrBankStatementTool.execute({
          context: {
            recordId,
            isMainAccount: true,
          },
          runtimeContext: new RuntimeContext(),
        });

        if (bankResult.success) {
          report += `## 通帳分析\n- マーク取引: 確認済み\n- 照合結果: ${bankResult.matchingResults?.summary || '処理完了'}\n\n`;
        }
      } catch (error) {
        errors.push(`通帳OCR: ${error instanceof Error ? error.message : '不明なエラー'}`);
      }

      // 本人確認書類OCR
      try {
        if (ocrIdentityToolV2 && typeof ocrIdentityToolV2.execute === 'function') {
          const identityResult = await ocrIdentityToolV2.execute({
            context: {
              recordId,
            },
            runtimeContext: new RuntimeContext(),
          });

          if (identityResult.success) {
            report += `## 本人確認\n- 氏名照合: ${identityResult.verificationResult?.nameMatch === 'match' ? '✓ 一致' : '要確認'}\n\n`;
          }
        }
      } catch (error) {
        errors.push(`本人確認OCR: ${error instanceof Error ? error.message : '不明なエラー'}`);
      }

      // Phase 3: 検索・確認（並列実行）
      console.log("[Workflow] Phase 3: 検索・確認");
      try {
        const [egoResult, companyResult] = await Promise.all([
          egoSearchTool.execute({
            context: {
              name: kintoneData.basic.代表者名,
              birthDate: kintoneData.basic.生年月日,
            },
            runtimeContext: new RuntimeContext(),
          }),
          companyVerifyTool.execute({
            context: {
              companyName: kintoneData.basic.会社_屋号名,
            },
            runtimeContext: new RuntimeContext(),
          }),
        ]);

        report += `## 信用調査\n`;
        report += `- エゴサーチ: ${egoResult.summary?.hasNegativeInfo ? '⚠️ 要注意情報あり' : '✓ 問題なし'}\n`;
        report += `- 企業実在性: ${companyResult.verified ? '✓ 確認済み' : '要確認'}\n\n`;
      } catch (error) {
        errors.push(`検索処理: ${error instanceof Error ? error.message : '不明なエラー'}`);
      }

      // Phase 4: 統合分析
      console.log("[Workflow] Phase 4: 統合分析");
      try {
        const purchaseInfo = {
          totalPurchaseAmount: 0, // TODO: 集計フィールドから取得
          totalPaymentAmount: 0,  // TODO: 集計フィールドから取得
          purchases: kintoneData.purchases?.map((item: any) => ({
            companyName: item.会社名_第三債務者_買取,
            purchaseAmount: item.買取債権額 || 0,
            paymentAmount: item.買取額 || 0,
            paymentDate: item.買取債権支払日 || "",
          })) || [],
        };

        const collateralInfo = {
          collaterals: kintoneData.collaterals?.map((item: any) => ({
            companyName: item.会社名_第三債務者_担保,
            nextPaymentAmount: item.請求額 || 0,
            paymentDate: item.入金予定日 || "",
            pastPayments: {
              threeMonthsAgo: item.過去の入金_先々月 || 0,
              twoMonthsAgo: item.過去の入金_先月 || 0,
              lastMonth: item.過去の入金_今月 || 0,
              average: item.平均 || 0,
            },
            note: item.備考 || "",
          })) || [],
        };

        const analysisResult = await paymentAnalysisV2Tool.execute({
          context: {
            purchaseInfo,
            collateralInfo,
          },
          runtimeContext: new RuntimeContext(),
        });

        if (analysisResult.summary) {
          const score = analysisResult.summary.totalScore || 0;
          const riskLevel = score >= 80 ? "低" : score >= 60 ? "中" : "高";
          const recommendation = score >= 80 ? "承認推奨" : score >= 60 ? "条件付き承認" : "要再検討";

          report += `## 📊 審査サマリー\n`;
          report += `- 総合スコア: ${score}/100点\n`;
          report += `- リスクレベル: ${riskLevel}\n`;
          report += `- 推奨アクション: ${recommendation}\n\n`;
        }
      } catch (error) {
        errors.push(`統合分析: ${error instanceof Error ? error.message : '不明なエラー'}`);
      }

      // エラー情報の追加
      if (errors.length > 0) {
        report += `## ⚠️ 処理エラー\n`;
        errors.forEach(error => {
          report += `- ${error}\n`;
        });
        report += `\n`;
      }

      report += `---\n処理完了: ${new Date().toLocaleString('ja-JP')}\n`;

      return {
        success: errors.length === 0,
        report,
        errors,
      };

    } catch (criticalError) {
      const errorMessage = criticalError instanceof Error ? criticalError.message : "不明なエラー";
      return {
        success: false,
        report: `# 審査エラー\n\n致命的エラー: ${errorMessage}`,
        errors: [errorMessage],
      };
    }
  },
});

// シンプルなワークフロー
export const simpleComplianceWorkflow = createWorkflow({
  id: "simple-compliance-workflow",
  description: "ファクタリング審査のシンプルなワークフロー",
  inputSchema: z.object({
    recordId: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    report: z.string(),
    errors: z.array(z.string()),
  }),
})
.then(executeComplianceStep)
.commit();
