import { createTool } from "@mastra/core/tools";
import { z } from "zod";

/**
 * 買取情報OCR用のデータを準備するツール
 * エージェントがKintoneデータから正しいフィールドを抽出するのを支援
 */
export const purchaseDataPrepTool = createTool({
  id: "purchase-data-prep",
  description: "Kintoneデータから買取情報OCR用のデータを準備",
  inputSchema: z.object({
    kintoneData: z.object({
      purchases: z.array(z.any()).optional(),
      basic: z.any().optional(),
    }),
  }),
  outputSchema: z.object({
    recordId: z.string(),
    purchaseData: z.object({
      totalDebtAmount: z.number().describe("総債権額（請求書記載額）"),
      debtorCompany: z.string().describe("第三債務者名（請求先）"),
      purchaseAmount: z.number().describe("買取額（参考）"),
    }),
    applicantCompany: z.string().describe("申込者企業名（請求元）"),
  }),
  
  execute: async ({ context }) => {
    const { kintoneData } = context;
    
    // purchasesが配列の場合は最初の要素、オブジェクトの場合はそのまま使用
    const purchaseData = Array.isArray(kintoneData.purchases) 
      ? kintoneData.purchases[0] 
      : kintoneData.purchases;
    
    if (!purchaseData) {
      throw new Error('買取情報データが見つかりません');
    }

    console.log('[Purchase Data Prep] 買取情報データ:', purchaseData);

    // 総債権額を数値に変換（「4,027,740 円」→ 4027740）
    const totalDebtAmountStr = purchaseData['総債権額'] || purchaseData['総債権額（合計）'] || '';
    const totalDebtAmount = parseInt(totalDebtAmountStr.toString().replace(/[,\s円]/g, '') || '0');

    // 買取額を数値に変換  
    const purchaseAmountStr = purchaseData['買取額'] || purchaseData['買取額（合計）'] || '';
    const purchaseAmount = parseInt(purchaseAmountStr.toString().replace(/[,\s円]/g, '') || '0');

    console.log('[Purchase Data Prep] 抽出したデータ:');
    console.log('- 総債権額文字列:', totalDebtAmountStr);
    console.log('- 総債権額数値:', totalDebtAmount);
    console.log('- 買取額:', purchaseAmount);
    console.log('- 第三債務者:', purchaseData['会社名_第三債務者_買取']);

    return {
      recordId: kintoneData.recordId || '',
      purchaseData: {
        totalDebtAmount,  // 請求書記載の金額
        debtorCompany: purchaseData['会社名_第三債務者_買取'] || '',
        purchaseAmount,   // 参考情報
      },
      applicantCompany: kintoneData.basic?.['会社_屋号名'] || '',
    };
  },
});