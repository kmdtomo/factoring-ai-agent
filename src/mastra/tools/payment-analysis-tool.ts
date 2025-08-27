import { createTool } from "@mastra/core/tools";
import { z } from "zod";

// 支払い能力分析ツール（カバー率なしのシンプル版）
export const paymentAnalysisTool = createTool({
  id: "payment-analysis",
  description: "担保と買取額の差額、過去の入金実績から支払い能力を評価",
  inputSchema: z.object({
    purchases: z.array(z.object({
      companyName: z.string(),
      amount: z.number(),
      paymentDate: z.string(),
    })).describe("買取情報"),
    collaterals: z.array(z.object({
      companyName: z.string(),
      claimAmount: z.number(),
      monthlyPayments: z.object({
        twoMonthsAgo: z.number(),
        lastMonth: z.number(),
        thisMonth: z.number(),
        average: z.number(),
      }),
    })).describe("担保情報"),
  }),
  outputSchema: z.object({
    totalPurchaseAmount: z.number(),
    totalCollateral: z.number(),
    collateralGap: z.number().describe("担保差額（担保-買取）"),
    evaluation: z.object({
      collateralStatus: z.enum(["十分", "ギリギリ", "不足"]),
      gapAmount: z.number().describe("差額の絶対値"),
      riskLevel: z.enum(["問題なし", "要注意", "リスク高"]),
      reason: z.string(),
    }),
    paymentHistory: z.array(z.object({
      companyName: z.string(),
      averagePayment: z.number(),
      stability: z.enum(["安定", "変動あり", "不安定"]),
      trend: z.enum(["増加", "横ばい", "減少"]),
    })),
    recommendations: z.array(z.string()),
  }),
  execute: async ({ context }) => {
    const { purchases, collaterals } = context;
    // 買取総額の計算
    const totalPurchaseAmount = purchases.reduce((sum, p) => sum + p.amount, 0);
    
    // 担保総額の計算（3ヶ月分の平均を基準）
    const totalCollateral = collaterals.reduce(
      (sum, c) => sum + (c.monthlyPayments.average * 3), 
      0
    );
    
    // 担保差額の計算
    const collateralGap = totalCollateral - totalPurchaseAmount;
    const gapAmount = Math.abs(collateralGap);
    
    // 担保状況の評価
    let collateralStatus: "十分" | "ギリギリ" | "不足";
    let riskLevel: "問題なし" | "要注意" | "リスク高";
    let reason = "";
    
    if (collateralGap >= 0) {
      collateralStatus = "十分";
      riskLevel = "問題なし";
      reason = `担保が買取額を${collateralGap.toLocaleString()}円上回っており、十分な支払い能力があります。`;
    } else if (gapAmount <= 1000000) {
      collateralStatus = "ギリギリ";
      riskLevel = "要注意";
      reason = `担保不足${gapAmount.toLocaleString()}円。100万円以内の不足のため、追加担保の検討が必要です。`;
    } else {
      collateralStatus = "不足";
      riskLevel = "リスク高";
      reason = `担保不足${gapAmount.toLocaleString()}円。買取額に対して担保が大幅に不足しています。`;
    }
    
    // 各社の支払い履歴分析
    const paymentHistory = collaterals.map(collateral => {
      const { twoMonthsAgo, lastMonth, thisMonth, average } = collateral.monthlyPayments;
      
      // 安定性の判定（簡易版）
      const payments = [twoMonthsAgo, lastMonth, thisMonth];
      const maxPayment = Math.max(...payments);
      const minPayment = Math.min(...payments);
      
      let stability: "安定" | "変動あり" | "不安定";
      
      // 平均が0または全ての支払いが0の場合
      if (average === 0 || (maxPayment === 0 && minPayment === 0)) {
        stability = "不安定";
      } else {
        const variation = (maxPayment - minPayment) / average;
        if (variation < 0.2) {
          stability = "安定";
        } else if (variation < 0.5) {
          stability = "変動あり";
        } else {
          stability = "不安定";
        }
      }
      
      // トレンド判定
      let trend: "増加" | "横ばい" | "減少";
      if (thisMonth > lastMonth && lastMonth > twoMonthsAgo) {
        trend = "増加";
      } else if (thisMonth < lastMonth && lastMonth < twoMonthsAgo) {
        trend = "減少";
      } else {
        trend = "横ばい";
      }
      
      return {
        companyName: collateral.companyName,
        averagePayment: average,
        stability,
        trend,
      };
    });
    
    // 推奨事項の生成
    const recommendations = [];
    
    if (collateralStatus === "不足") {
      recommendations.push(`追加担保${gapAmount.toLocaleString()}円相当の設定を強く推奨`);
      recommendations.push("短期回収（30日以内）での契約を検討");
    } else if (collateralStatus === "ギリギリ") {
      recommendations.push("可能であれば追加担保の設定を推奨");
      recommendations.push("入金状況の定期モニタリングを実施");
    }
    
    // 不安定な取引先がある場合
    const unstableCompanies = paymentHistory.filter(h => h.stability === "不安定");
    if (unstableCompanies.length > 0) {
      recommendations.push(
        `入金が不安定な企業（${unstableCompanies.map(c => c.companyName).join("、")}）について個別確認推奨`
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
        reason,
      },
      paymentHistory,
      recommendations,
    };
  },
});