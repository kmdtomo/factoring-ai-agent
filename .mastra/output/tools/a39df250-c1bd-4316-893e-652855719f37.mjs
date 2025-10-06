import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const paymentAnalysisV2Tool = createTool({
  id: "payment-analysis-v2",
  description: "\u8CB7\u53D6\u60C5\u5831\u3068\u62C5\u4FDD\u60C5\u5831\u304B\u3089\u7D71\u8A08\u7684\u4E8B\u5B9F\u3092\u62BD\u51FA",
  inputSchema: z.object({
    // 買取情報
    purchaseInfo: z.object({
      totalPurchaseAmount: z.number().describe("\u8CB7\u53D6\u50B5\u6A29\u984D\uFF08\u5408\u8A08\uFF09"),
      totalPaymentAmount: z.number().describe("\u8CB7\u53D6\u984D\uFF08\u5408\u8A08\uFF09"),
      purchases: z.array(z.object({
        companyName: z.string(),
        purchaseAmount: z.number().describe("\u8CB7\u53D6\u50B5\u6A29\u984D"),
        paymentAmount: z.number().describe("\u8CB7\u53D6\u984D"),
        paymentDate: z.string()
      }))
    }),
    // 担保情報
    collateralInfo: z.object({
      collaterals: z.array(z.object({
        companyName: z.string(),
        nextPaymentAmount: z.number().describe("\u6B21\u56DE\u5165\u91D1\u4E88\u5B9A\u984D\uFF08\u8ACB\u6C42\u984D\uFF09"),
        paymentDate: z.string().describe("\u5165\u91D1\u4E88\u5B9A\u65E5"),
        pastPayments: z.object({
          threeMonthsAgo: z.number(),
          twoMonthsAgo: z.number(),
          lastMonth: z.number(),
          average: z.number()
        }),
        note: z.string().optional().describe("\u5099\u8003")
      }))
    }),
    // 謄本情報（債権種類との紐付け用）
    registryInfo: z.array(z.object({
      companyName: z.string(),
      debtType: z.enum(["\u8CB7\u53D6", "\u62C5\u4FDD", "\u8CB7\u53D6\u62C5\u4FDD"]),
      capital: z.string(),
      establishedYear: z.string()
    })).optional()
  }),
  outputSchema: z.object({
    // 買取情報の事実データ
    purchaseFactData: z.object({
      kakemeRate: z.number().describe("\u639B\u76EE\u7387\uFF08%\uFF09"),
      totalPurchaseAmount: z.number().describe("\u8CB7\u53D6\u50B5\u6A29\u984D\u5408\u8A08"),
      totalPaymentAmount: z.number().describe("\u8CB7\u53D6\u984D\u5408\u8A08"),
      purchasesByCompany: z.array(z.object({
        companyName: z.string(),
        purchaseAmount: z.number(),
        paymentAmount: z.number(),
        individualKakemeRate: z.number().describe("\u500B\u5225\u639B\u76EE\u7387\uFF08%\uFF09")
      }))
    }),
    // 担保情報の事実データ
    collateralFactData: z.object({
      coverageRate: z.number().describe("\u62C5\u4FDD\u30AB\u30D0\u30FC\u7387\uFF08%\uFF09"),
      totalNextPayment: z.number().describe("\u6B21\u56DE\u5165\u91D1\u4E88\u5B9A\u984D\u5408\u8A08"),
      largestPaymentCompany: z.object({
        name: z.string().optional(),
        amount: z.number().optional(),
        percentage: z.number().optional().describe("\u5168\u4F53\u306B\u5360\u3081\u308B\u5272\u5408\uFF08%\uFF09")
      }).describe("\u6700\u5927\u5165\u91D1\u4E88\u5B9A\u4F01\u696D"),
      companyPaymentData: z.array(z.object({
        name: z.string(),
        nextPaymentAmount: z.number(),
        pastThreeMonthsPayments: z.array(z.number()).describe("\u904E\u53BB3\u30F6\u6708\u306E\u652F\u6255\u3044\u984D"),
        average: z.number().describe("\u904E\u53BB3\u30F6\u6708\u5E73\u5747"),
        standardDeviation: z.number().describe("\u6A19\u6E96\u504F\u5DEE"),
        variability: z.number().describe("\u5909\u52D5\u4FC2\u6570\uFF08%\uFF09"),
        paymentCount: z.number().describe("\u652F\u6255\u3044\u5B9F\u7E3E\u56DE\u6570"),
        hasNote: z.boolean(),
        noteContent: z.string().optional()
      }))
    }),
    // 統計サマリー（事実のみ）
    statistics: z.object({
      totalCompanies: z.number().describe("\u5168\u4F01\u696D\u6570"),
      companiesWithPaymentHistory: z.number().describe("\u652F\u6255\u3044\u5C65\u6B74\u306E\u3042\u308B\u4F01\u696D\u6570"),
      companiesWithoutHistory: z.number().describe("\u652F\u6255\u3044\u5C65\u6B74\u306E\u306A\u3044\u4F01\u696D\u6570"),
      overallAveragePayment: z.number().describe("\u5168\u4F53\u306E\u5E73\u5747\u652F\u6255\u3044\u984D"),
      overallPaymentVariability: z.number().describe("\u5168\u4F53\u306E\u652F\u6255\u3044\u5909\u52D5\u4FC2\u6570\uFF08%\uFF09")
    })
  }),
  execute: async ({ context }) => {
    const { purchaseInfo, collateralInfo} = context;
    const kakemeRate = purchaseInfo.totalPaymentAmount / purchaseInfo.totalPurchaseAmount * 100;
    const purchasesByCompany = purchaseInfo.purchases.map((purchase) => ({
      companyName: purchase.companyName,
      purchaseAmount: purchase.purchaseAmount,
      paymentAmount: purchase.paymentAmount,
      individualKakemeRate: Math.round(purchase.paymentAmount / purchase.purchaseAmount * 100 * 10) / 10
    }));
    const totalNextPayment = collateralInfo.collaterals.reduce(
      (sum, c) => sum + c.nextPaymentAmount,
      0
    );
    const coverageRate = totalNextPayment / purchaseInfo.totalPaymentAmount * 100;
    const largestPaymentCompany = collateralInfo.collaterals.filter((c) => c.nextPaymentAmount > 0).sort((a, b) => b.nextPaymentAmount - a.nextPaymentAmount)[0];
    const largestPaymentData = largestPaymentCompany ? {
      name: largestPaymentCompany.companyName,
      amount: largestPaymentCompany.nextPaymentAmount,
      percentage: Math.round(largestPaymentCompany.nextPaymentAmount / totalNextPayment * 100 * 10) / 10
    } : {
      name: void 0,
      amount: void 0,
      percentage: void 0
    };
    const companyPaymentData = collateralInfo.collaterals.map((company) => {
      const pastPayments = [
        company.pastPayments.threeMonthsAgo,
        company.pastPayments.twoMonthsAgo,
        company.pastPayments.lastMonth
      ];
      const validPayments = pastPayments.filter((p) => p > 0);
      const average = validPayments.length > 0 ? validPayments.reduce((a, b) => a + b, 0) / validPayments.length : 0;
      let stdDev = 0;
      let variability = 0;
      if (validPayments.length > 1) {
        const variance = validPayments.reduce((sum, p) => sum + Math.pow(p - average, 2), 0) / validPayments.length;
        stdDev = Math.sqrt(variance);
        variability = average > 0 ? stdDev / average * 100 : 0;
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
        noteContent: company.note
      };
    });
    const companiesWithHistory = companyPaymentData.filter((c) => c.paymentCount > 0).length;
    const companiesWithoutHistory = companyPaymentData.filter((c) => c.paymentCount === 0).length;
    const allValidPayments = companyPaymentData.filter((c) => c.average > 0);
    const overallAveragePayment = allValidPayments.length > 0 ? allValidPayments.reduce((sum, c) => sum + c.average, 0) / allValidPayments.length : 0;
    const significantCompanies = allValidPayments.filter((c) => c.average > 1e5);
    const overallVariability = significantCompanies.length > 0 ? significantCompanies.reduce((sum, c) => sum + c.variability, 0) / significantCompanies.length : 0;
    return {
      purchaseFactData: {
        kakemeRate: Math.round(kakemeRate * 10) / 10,
        totalPurchaseAmount: purchaseInfo.totalPurchaseAmount,
        totalPaymentAmount: purchaseInfo.totalPaymentAmount,
        purchasesByCompany
      },
      collateralFactData: {
        coverageRate: Math.round(coverageRate),
        totalNextPayment,
        largestPaymentCompany: largestPaymentData,
        companyPaymentData
      },
      statistics: {
        totalCompanies: collateralInfo.collaterals.length,
        companiesWithPaymentHistory: companiesWithHistory,
        companiesWithoutHistory,
        overallAveragePayment: Math.round(overallAveragePayment),
        overallPaymentVariability: Math.round(overallVariability * 10) / 10
      }
    };
  }
});

export { paymentAnalysisV2Tool };
