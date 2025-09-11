import { KintoneRecord } from '../types';

/**
 * Kintoneレコードから買取情報OCR用のデータを抽出
 */
export function extractPurchaseDataForOCR(record: KintoneRecord) {
  // 買取情報テーブルの最初のレコードから取得
  const firstPurchase = record.purchases?.[0];
  
  if (!firstPurchase) {
    throw new Error('買取情報データが見つかりません');
  }

  // 総債権額を数値に変換（「4,027,740 円」→ 4027740）
  const totalDebtAmountStr = firstPurchase['総債権額'] || firstPurchase['総債権額（合計）'];
  const totalDebtAmount = parseInt(totalDebtAmountStr?.toString().replace(/[,\s円]/g, '') || '0');

  // 買取額を数値に変換
  const purchaseAmountStr = firstPurchase['買取額'] || firstPurchase['買取額（合計）'];
  const purchaseAmount = parseInt(purchaseAmountStr?.toString().replace(/[,\s円]/g, '') || '0');

  return {
    recordId: record.recordId,
    purchaseData: {
      totalDebtAmount,  // 請求書記載の金額
      debtorCompany: firstPurchase['会社名_第三債務者_買取'] || '',
      purchaseAmount,   // 参考情報
    },
    applicantCompany: record.basic?.['会社_屋号名'] || '',
  };
}

/**
 * Kintoneレコードから通帳OCR用のデータを抽出
 */
export function extractCollateralDataForOCR(record: KintoneRecord) {
  const collaterals = record.collaterals || [];
  
  // 各担保企業のデータを整形
  return collaterals.map((collateral: any) => {
    // 過去の入金を数値に変換
    const pastPayments = [
      {
        amount: parseInt(collateral['過去の入金_先々月']?.toString().replace(/[,\s円]/g, '') || '0'),
        period: '前前々回',
      },
      {
        amount: parseInt(collateral['過去の入金_先月']?.toString().replace(/[,\s円]/g, '') || '0'),
        period: '前々回',
      },
      {
        amount: parseInt(collateral['過去の入金_今月']?.toString().replace(/[,\s円]/g, '') || '0'),
        period: '前回',
      },
    ];

    // 次回入金予定
    const nextPaymentAmount = parseInt(collateral['請求額']?.toString().replace(/[,\s円]/g, '') || '0');
    
    return {
      companyName: collateral['会社名_第三債務者_担保'] || '',
      pastPayments,
      nextPayment: {
        amount: nextPaymentAmount,
        date: collateral['入金予定日'] || '',
      },
    };
  });
}