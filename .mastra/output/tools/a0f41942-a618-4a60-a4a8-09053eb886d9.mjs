import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const purchaseDataPrepTool = createTool({
  id: "purchase-data-prep",
  description: "Kintone\u30C7\u30FC\u30BF\u304B\u3089\u8CB7\u53D6\u60C5\u5831OCR\u7528\u306E\u30C7\u30FC\u30BF\u3092\u6E96\u5099",
  inputSchema: z.object({
    kintoneData: z.object({
      purchases: z.array(z.any()).optional(),
      basic: z.any().optional()
    })
  }),
  outputSchema: z.object({
    recordId: z.string(),
    purchaseData: z.object({
      totalDebtAmount: z.number().describe("\u7DCF\u50B5\u6A29\u984D\uFF08\u8ACB\u6C42\u66F8\u8A18\u8F09\u984D\uFF09"),
      debtorCompany: z.string().describe("\u7B2C\u4E09\u50B5\u52D9\u8005\u540D\uFF08\u8ACB\u6C42\u5148\uFF09"),
      purchaseAmount: z.number().describe("\u8CB7\u53D6\u984D\uFF08\u53C2\u8003\uFF09")
    }),
    applicantCompany: z.string().describe("\u7533\u8FBC\u8005\u4F01\u696D\u540D\uFF08\u8ACB\u6C42\u5143\uFF09")
  }),
  execute: async ({ context }) => {
    const { kintoneData } = context;
    const purchaseData = Array.isArray(kintoneData.purchases) ? kintoneData.purchases[0] : kintoneData.purchases;
    if (!purchaseData) {
      throw new Error("\u8CB7\u53D6\u60C5\u5831\u30C7\u30FC\u30BF\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093");
    }
    console.log("[Purchase Data Prep] \u8CB7\u53D6\u60C5\u5831\u30C7\u30FC\u30BF:", purchaseData);
    const totalDebtAmountStr = purchaseData["\u7DCF\u50B5\u6A29\u984D"] || purchaseData["\u7DCF\u50B5\u6A29\u984D\uFF08\u5408\u8A08\uFF09"] || "";
    const totalDebtAmount = parseInt(totalDebtAmountStr.toString().replace(/[,\s円]/g, "") || "0");
    const purchaseAmountStr = purchaseData["\u8CB7\u53D6\u984D"] || purchaseData["\u8CB7\u53D6\u984D\uFF08\u5408\u8A08\uFF09"] || "";
    const purchaseAmount = parseInt(purchaseAmountStr.toString().replace(/[,\s円]/g, "") || "0");
    console.log("[Purchase Data Prep] \u62BD\u51FA\u3057\u305F\u30C7\u30FC\u30BF:");
    console.log("- \u7DCF\u50B5\u6A29\u984D\u6587\u5B57\u5217:", totalDebtAmountStr);
    console.log("- \u7DCF\u50B5\u6A29\u984D\u6570\u5024:", totalDebtAmount);
    console.log("- \u8CB7\u53D6\u984D:", purchaseAmount);
    console.log("- \u7B2C\u4E09\u50B5\u52D9\u8005:", purchaseData["\u4F1A\u793E\u540D_\u7B2C\u4E09\u50B5\u52D9\u8005_\u8CB7\u53D6"]);
    return {
      recordId: kintoneData.recordId || "",
      purchaseData: {
        totalDebtAmount,
        // 請求書記載の金額
        debtorCompany: purchaseData["\u4F1A\u793E\u540D_\u7B2C\u4E09\u50B5\u52D9\u8005_\u8CB7\u53D6"] || "",
        purchaseAmount
        // 参考情報
      },
      applicantCompany: kintoneData.basic?.["\u4F1A\u793E_\u5C4B\u53F7\u540D"] || ""
    };
  }
});

export { purchaseDataPrepTool };
