import { createTool } from "@mastra/core/tools";
import { z } from "zod";

// 支払い能力分析ツール（事実データのみ）
export const paymentAnalysisV2Tool = createTool({
  id: "payment-analysis-v2",
  description: "買取情報と担保情報から統計的事実を抽出",
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
    // 買取情報の事実データ
    purchaseFactData: z.object({
      kakemeRate: z.number().describe("掛目率（%）"),
      totalPurchaseAmount: z.number().describe("買取債権額合計"),
      totalPaymentAmount: z.number().describe("買取額合計"),
      purchasesByCompany: z.array(z.object({
        companyName: z.string(),
        purchaseAmount: z.number(),
        paymentAmount: z.number(),
        individualKakemeRate: z.number().describe("個別掛目率（%）"),
      })),
    }),
    
    // 担保情報の事実データ
    collateralFactData: z.object({
      coverageRate: z.number().describe("担保カバー率（%）"),
      totalNextPayment: z.number().describe("次回入金予定額合計"),
      largestPaymentCompany: z.object({
        name: z.string().optional(),
        amount: z.number().optional(),
        percentage: z.number().optional().describe("全体に占める割合（%）"),
      }).describe("最大入金予定企業"),
      companyPaymentData: z.array(z.object({
        name: z.string(),
        nextPaymentAmount: z.number(),
        pastThreeMonthsPayments: z.array(z.number()).describe("過去3ヶ月の支払い額"),
        average: z.number().describe("過去3ヶ月平均"),
        standardDeviation: z.number().describe("標準偏差"),
        variability: z.number().describe("変動係数（%）"),
        paymentCount: z.number().describe("支払い実績回数"),
        hasNote: z.boolean(),
        noteContent: z.string().optional(),
      })),
    }),
    
    // 統計サマリー（事実のみ）
    statistics: z.object({
      totalCompanies: z.number().describe("全企業数"),
      companiesWithPaymentHistory: z.number().describe("支払い履歴のある企業数"),
      companiesWithoutHistory: z.number().describe("支払い履歴のない企業数"),
      overallAveragePayment: z.number().describe("全体の平均支払い額"),
      overallPaymentVariability: z.number().describe("全体の支払い変動係数（%）"),
    }),
  }),
  
  execute: async ({ context }) => {
    const { purchaseInfo, collateralInfo, registryInfo } = context;
    
    // 1. 買取情報の事実データ抽出
    const kakemeRate = (purchaseInfo.totalPaymentAmount / purchaseInfo.totalPurchaseAmount) * 100;
    
    const purchasesByCompany = purchaseInfo.purchases.map(purchase => ({
      companyName: purchase.companyName,
      purchaseAmount: purchase.purchaseAmount,
      paymentAmount: purchase.paymentAmount,
      individualKakemeRate: Math.round((purchase.paymentAmount / purchase.purchaseAmount) * 100 * 10) / 10,
    }));
    
    // 2. 担保情報の事実データ抽出
    const totalNextPayment = collateralInfo.collaterals.reduce(
      (sum, c) => sum + c.nextPaymentAmount, 0
    );
    const coverageRate = (totalNextPayment / purchaseInfo.totalPaymentAmount) * 100;
    
    // 最大入金予定企業の特定
    const largestPaymentCompany = collateralInfo.collaterals
      .filter(c => c.nextPaymentAmount > 0)
      .sort((a, b) => b.nextPaymentAmount - a.nextPaymentAmount)[0];
    
    const largestPaymentData = largestPaymentCompany ? {
      name: largestPaymentCompany.companyName,
      amount: largestPaymentCompany.nextPaymentAmount,
      percentage: Math.round((largestPaymentCompany.nextPaymentAmount / totalNextPayment) * 100 * 10) / 10,
    } : {
      name: undefined,
      amount: undefined,
      percentage: undefined,
    };
    
    // 3. 各企業の支払いデータ分析
    const companyPaymentData = collateralInfo.collaterals.map(company => {
      const pastPayments = [
        company.pastPayments.threeMonthsAgo,
        company.pastPayments.twoMonthsAgo,
        company.pastPayments.lastMonth,
      ];
      
      const validPayments = pastPayments.filter(p => p > 0);
      const average = validPayments.length > 0
        ? validPayments.reduce((a, b) => a + b, 0) / validPayments.length
        : 0;
      
      let stdDev = 0;
      let variability = 0;
      
      if (validPayments.length > 1) {
        const variance = validPayments.reduce((sum, p) => sum + Math.pow(p - average, 2), 0) / validPayments.length;
        stdDev = Math.sqrt(variance);
        variability = average > 0 ? (stdDev / average) * 100 : 0;
      }
      
      return {
        name: company.companyName,
        nextPaymentAmount: company.nextPaymentAmount,
        pastThreeMonthsPayments: pastPayments,
        average: Math.round(average),
        standardDeviation: Math.round(stdDev),
        variability: Math.round(variability * 10) / 10,
        paymentCount: validPayments.length,
        hasNote: !!company.note,
        noteContent: company.note,
      };
    });
    
    // 4. 統計サマリー
    const companiesWithHistory = companyPaymentData.filter(c => c.paymentCount > 0).length;
    const companiesWithoutHistory = companyPaymentData.filter(c => c.paymentCount === 0).length;
    
    const allValidPayments = companyPaymentData.filter(c => c.average > 0);
    const overallAveragePayment = allValidPayments.length > 0
      ? allValidPayments.reduce((sum, c) => sum + c.average, 0) / allValidPayments.length
      : 0;
    
    const significantCompanies = allValidPayments.filter(c => c.average > 100000);
    const overallVariability = significantCompanies.length > 0
      ? significantCompanies.reduce((sum, c) => sum + c.variability, 0) / significantCompanies.length
      : 0;
    
    return {
      purchaseFactData: {
        kakemeRate: Math.round(kakemeRate * 10) / 10,
        totalPurchaseAmount: purchaseInfo.totalPurchaseAmount,
        totalPaymentAmount: purchaseInfo.totalPaymentAmount,
        purchasesByCompany,
      },
      collateralFactData: {
        coverageRate: Math.round(coverageRate),
        totalNextPayment,
        largestPaymentCompany: largestPaymentData,
        companyPaymentData,
      },
      statistics: {
        totalCompanies: collateralInfo.collaterals.length,
        companiesWithPaymentHistory: companiesWithHistory,
        companiesWithoutHistory: companiesWithoutHistory,
        overallAveragePayment: Math.round(overallAveragePayment),
        overallPaymentVariability: Math.round(overallVariability * 10) / 10,
      },
    };
  },
});