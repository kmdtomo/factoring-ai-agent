import { createTool } from "@mastra/core/tools";
import { z } from "zod";

// 新評価軸に対応した支払い能力分析ツール
export const paymentAnalysisV2Tool = createTool({
  id: "payment-analysis-v2",
  description: "買取情報と担保情報を分析し、新評価軸に基づいてスコアリング",
  inputSchema: z.object({
    // 買取情報
    purchaseInfo: z.object({
      totalPurchaseAmount: z.number().describe("買取債権額（合計）"),
      totalPaymentAmount: z.number().describe("買取額（合計）"),
      purchases: z.array(z.object({
        companyName: z.string(),
        purchaseAmount: z.number().describe("買取債権額"),
        paymentAmount: z.number().describe("買取額"),
        paymentDate: z.string(),
      })),
    }),
    // 担保情報
    collateralInfo: z.object({
      collaterals: z.array(z.object({
        companyName: z.string(),
        nextPaymentAmount: z.number().describe("次回入金予定額（請求額）"),
        paymentDate: z.string().describe("入金予定日"),
        pastPayments: z.object({
          threeMonthsAgo: z.number(),
          twoMonthsAgo: z.number(),
          lastMonth: z.number(),
          average: z.number(),
        }),
        note: z.string().optional().describe("備考"),
      })),
    }),
    // 謄本情報（債権種類との紐付け用）
    registryInfo: z.array(z.object({
      companyName: z.string(),
      debtType: z.enum(["買取", "担保", "買取担保"]),
      capital: z.string(),
      establishedYear: z.string(),
    })).optional(),
  }),
  outputSchema: z.object({
    // 買取情報評価
    purchaseEvaluation: z.object({
      kakemeRate: z.number().describe("掛目（%）"),
      kakemeScore: z.number().describe("掛目スコア（20点満点）"),
      kakemeRisk: z.enum(["low", "medium", "high"]),
      details: z.string(),
    }),
    
    // 担保評価
    collateralEvaluation: z.object({
      // 即時回収能力
      immediateCoverage: z.object({
        totalNextPayment: z.number().describe("次回入金予定額合計"),
        coverageRate: z.number().describe("カバー率（%）"),
        score: z.number().describe("即時回収能力スコア（20点満点）"),
        mainCompany: z.string().optional().describe("主要担保企業"),
        risk: z.enum(["low", "medium", "high"]),
      }),
      // 入金安定性
      paymentStability: z.object({
        companies: z.array(z.object({
          name: z.string(),
          average: z.number(),
          variability: z.number().describe("変動係数（%）"),
          reliability: z.enum(["stable", "moderate", "unstable"]),
        })),
        overallVariability: z.number().describe("全体の変動係数（%）"),
        score: z.number().describe("入金安定性スコア（20点満点）"),
        risk: z.enum(["low", "medium", "high"]),
      }),
    }),
    
    // 統合評価
    summary: z.object({
      totalScore: z.number().describe("買取＋担保の合計スコア（60点満点）"),
      mainRisks: z.array(z.string()),
      recommendations: z.array(z.string()),
      criticalFindings: z.array(z.string()).optional(),
    }),
  }),
  execute: async ({ context }) => {
    const { purchaseInfo, collateralInfo, registryInfo } = context;
    
    // 1. 買取情報評価（掛目分析）
    const kakemeRate = (purchaseInfo.totalPaymentAmount / purchaseInfo.totalPurchaseAmount) * 100;
    let kakemeScore = 0;
    let kakemeRisk: "low" | "medium" | "high" = "high";
    
    if (kakemeRate <= 80) {
      kakemeScore = 20;
      kakemeRisk = "low";
    } else if (kakemeRate <= 85) {
      kakemeScore = 10;
      kakemeRisk = "medium";
    } else {
      kakemeScore = 0;
      kakemeRisk = "high";
    }
    
    // 2. 担保評価 - 即時回収能力
    const totalNextPayment = collateralInfo.collaterals.reduce(
      (sum, c) => sum + c.nextPaymentAmount, 0
    );
    const coverageRate = (totalNextPayment / purchaseInfo.totalPaymentAmount) * 100;
    
    let coverageScore = 0;
    let coverageRisk: "low" | "medium" | "high" = "high";
    if (coverageRate >= 100) {
      coverageScore = 20;
      coverageRisk = "low";
    } else if (coverageRate >= 80) {
      coverageScore = 10;
      coverageRisk = "medium";
    } else {
      coverageScore = 0;
      coverageRisk = "high";
    }
    
    // 主要担保企業の特定
    const mainCompany = collateralInfo.collaterals
      .filter(c => c.nextPaymentAmount > 0)
      .sort((a, b) => b.nextPaymentAmount - a.nextPaymentAmount)[0]?.companyName;
    
    // 3. 担保評価 - 入金安定性
    const stabilityAnalysis = collateralInfo.collaterals.map(company => {
      const payments = [
        company.pastPayments.threeMonthsAgo,
        company.pastPayments.twoMonthsAgo,
        company.pastPayments.lastMonth,
      ].filter(p => p > 0);
      
      if (payments.length === 0) {
        return {
          name: company.companyName,
          average: 0,
          variability: 100,
          reliability: "unstable" as const,
        };
      }
      
      const average = payments.reduce((a, b) => a + b, 0) / payments.length;
      const variance = payments.reduce((sum, p) => sum + Math.pow(p - average, 2), 0) / payments.length;
      const stdDev = Math.sqrt(variance);
      const variability = average > 0 ? (stdDev / average) * 100 : 100;
      
      let reliability: "stable" | "moderate" | "unstable" = "unstable";
      if (variability <= 15) reliability = "stable";
      else if (variability <= 30) reliability = "moderate";
      
      return {
        name: company.companyName,
        average,
        variability: Math.round(variability * 10) / 10,
        reliability,
      };
    });
    
    // 全体の変動係数（主要企業のみ）
    const significantCompanies = stabilityAnalysis.filter(c => c.average > 100000);
    const overallVariability = significantCompanies.length > 0
      ? significantCompanies.reduce((sum, c) => sum + c.variability, 0) / significantCompanies.length
      : 100;
    
    let stabilityScore = 0;
    let stabilityRisk: "low" | "medium" | "high" = "high";
    if (overallVariability <= 15) {
      stabilityScore = 20;
      stabilityRisk = "low";
    } else if (overallVariability <= 30) {
      stabilityScore = 10;
      stabilityRisk = "medium";
    } else {
      stabilityScore = 0;
      stabilityRisk = "high";
    }
    
    // 4. リスク要因の特定
    const mainRisks: string[] = [];
    const recommendations: string[] = [];
    const criticalFindings: string[] = [];
    
    if (kakemeRisk === "high") {
      mainRisks.push(`掛目${kakemeRate.toFixed(1)}%は高リスク水準`);
      recommendations.push("掛目を80%以下に引き下げることを推奨");
    }
    
    if (coverageRisk === "high") {
      criticalFindings.push(`担保不足：次回入金で${coverageRate.toFixed(0)}%しかカバーできない`);
      recommendations.push("追加担保の設定が必要");
    } else if (mainCompany && coverageRate >= 100) {
      const mainCompanyPayment = collateralInfo.collaterals.find(c => c.companyName === mainCompany)?.nextPaymentAmount || 0;
      if (mainCompanyPayment >= purchaseInfo.totalPaymentAmount) {
        mainRisks.push(`${mainCompany}1社に依存（${(mainCompanyPayment / purchaseInfo.totalPaymentAmount * 100).toFixed(0)}%）`);
      }
    }
    
    if (stabilityRisk === "high") {
      mainRisks.push("入金履歴が不安定");
    }
    
    // 備考情報の活用
    collateralInfo.collaterals.forEach(c => {
      if (c.note && c.note.includes("早め入金")) {
        // ポジティブな要素
      } else if (c.note && c.nextPaymentAmount > 0 && c.pastPayments.average === 0) {
        criticalFindings.push(`${c.companyName}：過去実績なしで${c.nextPaymentAmount.toLocaleString()}円の入金予定`);
      }
    });
    
    const totalScore = kakemeScore + coverageScore + stabilityScore;
    
    return {
      purchaseEvaluation: {
        kakemeRate: Math.round(kakemeRate * 10) / 10,
        kakemeScore,
        kakemeRisk,
        details: `買取債権額${purchaseInfo.totalPurchaseAmount.toLocaleString()}円に対し、買取額${purchaseInfo.totalPaymentAmount.toLocaleString()}円（掛目${kakemeRate.toFixed(1)}%）`,
      },
      collateralEvaluation: {
        immediateCoverage: {
          totalNextPayment,
          coverageRate: Math.round(coverageRate),
          score: coverageScore,
          mainCompany,
          risk: coverageRisk,
        },
        paymentStability: {
          companies: stabilityAnalysis,
          overallVariability: Math.round(overallVariability * 10) / 10,
          score: stabilityScore,
          risk: stabilityRisk,
        },
      },
      summary: {
        totalScore,
        mainRisks,
        recommendations,
        criticalFindings: criticalFindings.length > 0 ? criticalFindings : undefined,
      },
    };
  },
});