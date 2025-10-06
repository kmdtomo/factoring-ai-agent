import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const paymentAnalysisTool = createTool({
  id: "payment-analysis",
  description: "\u62C5\u4FDD\u3068\u8CB7\u53D6\u984D\u306E\u5DEE\u984D\u3001\u904E\u53BB\u306E\u5165\u91D1\u5B9F\u7E3E\u304B\u3089\u652F\u6255\u3044\u80FD\u529B\u3092\u8A55\u4FA1",
  inputSchema: z.object({
    purchases: z.array(z.object({
      companyName: z.string(),
      amount: z.number(),
      paymentDate: z.string()
    })).describe("\u8CB7\u53D6\u60C5\u5831"),
    collaterals: z.array(z.object({
      companyName: z.string(),
      claimAmount: z.number(),
      monthlyPayments: z.object({
        twoMonthsAgo: z.number(),
        lastMonth: z.number(),
        thisMonth: z.number(),
        average: z.number()
      })
    })).describe("\u62C5\u4FDD\u60C5\u5831")
  }),
  outputSchema: z.object({
    totalPurchaseAmount: z.number(),
    totalCollateral: z.number(),
    collateralGap: z.number().describe("\u62C5\u4FDD\u5DEE\u984D\uFF08\u62C5\u4FDD-\u8CB7\u53D6\uFF09"),
    evaluation: z.object({
      collateralStatus: z.enum(["\u5341\u5206", "\u30AE\u30EA\u30AE\u30EA", "\u4E0D\u8DB3"]),
      gapAmount: z.number().describe("\u5DEE\u984D\u306E\u7D76\u5BFE\u5024"),
      riskLevel: z.enum(["\u554F\u984C\u306A\u3057", "\u8981\u6CE8\u610F", "\u30EA\u30B9\u30AF\u9AD8"]),
      reason: z.string()
    }),
    paymentHistory: z.array(z.object({
      companyName: z.string(),
      averagePayment: z.number(),
      stability: z.enum(["\u5B89\u5B9A", "\u5909\u52D5\u3042\u308A", "\u4E0D\u5B89\u5B9A"]),
      trend: z.enum(["\u5897\u52A0", "\u6A2A\u3070\u3044", "\u6E1B\u5C11"])
    })),
    recommendations: z.array(z.string())
  }),
  execute: async ({ context }) => {
    const { purchases, collaterals } = context;
    const totalPurchaseAmount = purchases.reduce((sum, p) => sum + p.amount, 0);
    const totalCollateral = collaterals.reduce(
      (sum, c) => sum + c.monthlyPayments.average * 3,
      0
    );
    const collateralGap = totalCollateral - totalPurchaseAmount;
    const gapAmount = Math.abs(collateralGap);
    let collateralStatus;
    let riskLevel;
    let reason = "";
    if (collateralGap >= 0) {
      collateralStatus = "\u5341\u5206";
      riskLevel = "\u554F\u984C\u306A\u3057";
      reason = `\u62C5\u4FDD\u304C\u8CB7\u53D6\u984D\u3092${collateralGap.toLocaleString()}\u5186\u4E0A\u56DE\u3063\u3066\u304A\u308A\u3001\u5341\u5206\u306A\u652F\u6255\u3044\u80FD\u529B\u304C\u3042\u308A\u307E\u3059\u3002`;
    } else if (gapAmount <= 1e6) {
      collateralStatus = "\u30AE\u30EA\u30AE\u30EA";
      riskLevel = "\u8981\u6CE8\u610F";
      reason = `\u62C5\u4FDD\u4E0D\u8DB3${gapAmount.toLocaleString()}\u5186\u3002100\u4E07\u5186\u4EE5\u5185\u306E\u4E0D\u8DB3\u306E\u305F\u3081\u3001\u8FFD\u52A0\u62C5\u4FDD\u306E\u691C\u8A0E\u304C\u5FC5\u8981\u3067\u3059\u3002`;
    } else {
      collateralStatus = "\u4E0D\u8DB3";
      riskLevel = "\u30EA\u30B9\u30AF\u9AD8";
      reason = `\u62C5\u4FDD\u4E0D\u8DB3${gapAmount.toLocaleString()}\u5186\u3002\u8CB7\u53D6\u984D\u306B\u5BFE\u3057\u3066\u62C5\u4FDD\u304C\u5927\u5E45\u306B\u4E0D\u8DB3\u3057\u3066\u3044\u307E\u3059\u3002`;
    }
    const paymentHistory = collaterals.map((collateral) => {
      const { twoMonthsAgo, lastMonth, thisMonth, average } = collateral.monthlyPayments;
      const payments = [twoMonthsAgo, lastMonth, thisMonth];
      const maxPayment = Math.max(...payments);
      const minPayment = Math.min(...payments);
      let stability;
      if (average === 0 || maxPayment === 0 && minPayment === 0) {
        stability = "\u4E0D\u5B89\u5B9A";
      } else {
        const variation = (maxPayment - minPayment) / average;
        if (variation < 0.2) {
          stability = "\u5B89\u5B9A";
        } else if (variation < 0.5) {
          stability = "\u5909\u52D5\u3042\u308A";
        } else {
          stability = "\u4E0D\u5B89\u5B9A";
        }
      }
      let trend;
      if (thisMonth > lastMonth && lastMonth > twoMonthsAgo) {
        trend = "\u5897\u52A0";
      } else if (thisMonth < lastMonth && lastMonth < twoMonthsAgo) {
        trend = "\u6E1B\u5C11";
      } else {
        trend = "\u6A2A\u3070\u3044";
      }
      return {
        companyName: collateral.companyName,
        averagePayment: average,
        stability,
        trend
      };
    });
    const recommendations = [];
    if (collateralStatus === "\u4E0D\u8DB3") {
      recommendations.push(`\u8FFD\u52A0\u62C5\u4FDD${gapAmount.toLocaleString()}\u5186\u76F8\u5F53\u306E\u8A2D\u5B9A\u3092\u5F37\u304F\u63A8\u5968`);
      recommendations.push("\u77ED\u671F\u56DE\u53CE\uFF0830\u65E5\u4EE5\u5185\uFF09\u3067\u306E\u5951\u7D04\u3092\u691C\u8A0E");
    } else if (collateralStatus === "\u30AE\u30EA\u30AE\u30EA") {
      recommendations.push("\u53EF\u80FD\u3067\u3042\u308C\u3070\u8FFD\u52A0\u62C5\u4FDD\u306E\u8A2D\u5B9A\u3092\u63A8\u5968");
      recommendations.push("\u5165\u91D1\u72B6\u6CC1\u306E\u5B9A\u671F\u30E2\u30CB\u30BF\u30EA\u30F3\u30B0\u3092\u5B9F\u65BD");
    }
    const unstableCompanies = paymentHistory.filter((h) => h.stability === "\u4E0D\u5B89\u5B9A");
    if (unstableCompanies.length > 0) {
      recommendations.push(
        `\u5165\u91D1\u304C\u4E0D\u5B89\u5B9A\u306A\u4F01\u696D\uFF08${unstableCompanies.map((c) => c.companyName).join("\u3001")}\uFF09\u306B\u3064\u3044\u3066\u500B\u5225\u78BA\u8A8D\u63A8\u5968`
      );
    }
    return {
      totalPurchaseAmount,
      totalCollateral,
      collateralGap,
      evaluation: {
        collateralStatus,
        gapAmount,
        riskLevel,
        reason
      },
      paymentHistory,
      recommendations
    };
  }
});

export { paymentAnalysisTool };
