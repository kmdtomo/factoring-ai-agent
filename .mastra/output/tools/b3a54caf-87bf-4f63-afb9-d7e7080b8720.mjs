function extractPurchaseDataForOCR(record) {
  const firstPurchase = record.purchases?.[0];
  if (!firstPurchase) {
    throw new Error("\u8CB7\u53D6\u60C5\u5831\u30C7\u30FC\u30BF\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093");
  }
  const totalDebtAmountStr = firstPurchase["\u7DCF\u50B5\u6A29\u984D"] || firstPurchase["\u7DCF\u50B5\u6A29\u984D\uFF08\u5408\u8A08\uFF09"];
  const totalDebtAmount = parseInt(totalDebtAmountStr?.toString().replace(/[,\s円]/g, "") || "0");
  const purchaseAmountStr = firstPurchase["\u8CB7\u53D6\u984D"] || firstPurchase["\u8CB7\u53D6\u984D\uFF08\u5408\u8A08\uFF09"];
  const purchaseAmount = parseInt(purchaseAmountStr?.toString().replace(/[,\s円]/g, "") || "0");
  return {
    recordId: record.recordId,
    purchaseData: {
      totalDebtAmount,
      // 請求書記載の金額
      debtorCompany: firstPurchase["\u4F1A\u793E\u540D_\u7B2C\u4E09\u50B5\u52D9\u8005_\u8CB7\u53D6"] || "",
      purchaseAmount
      // 参考情報
    },
    applicantCompany: record.basic?.["\u4F1A\u793E_\u5C4B\u53F7\u540D"] || ""
  };
}
function extractCollateralDataForOCR(record) {
  const collaterals = record.collaterals || [];
  return collaterals.map((collateral) => {
    const pastPayments = [
      {
        amount: parseInt(collateral["\u904E\u53BB\u306E\u5165\u91D1_\u5148\u3005\u6708"]?.toString().replace(/[,\s円]/g, "") || "0"),
        period: "\u524D\u524D\u3005\u56DE"
      },
      {
        amount: parseInt(collateral["\u904E\u53BB\u306E\u5165\u91D1_\u5148\u6708"]?.toString().replace(/[,\s円]/g, "") || "0"),
        period: "\u524D\u3005\u56DE"
      },
      {
        amount: parseInt(collateral["\u904E\u53BB\u306E\u5165\u91D1_\u4ECA\u6708"]?.toString().replace(/[,\s円]/g, "") || "0"),
        period: "\u524D\u56DE"
      }
    ];
    const nextPaymentAmount = parseInt(collateral["\u8ACB\u6C42\u984D"]?.toString().replace(/[,\s円]/g, "") || "0");
    return {
      companyName: collateral["\u4F1A\u793E\u540D_\u7B2C\u4E09\u50B5\u52D9\u8005_\u62C5\u4FDD"] || "",
      pastPayments,
      nextPayment: {
        amount: nextPaymentAmount,
        date: collateral["\u5165\u91D1\u4E88\u5B9A\u65E5"] || ""
      }
    };
  });
}

export { extractCollateralDataForOCR, extractPurchaseDataForOCR };
