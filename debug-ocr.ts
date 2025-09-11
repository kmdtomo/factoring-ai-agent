// OCRツールのデバッグスクリプト

// 模擬的にOCRレスポンスをテストする関数
function mockOCRPurchaseParsing() {
  console.log('=== OCR Purchase Info Tool Debug ===\n');
  
  // 実際のレスポンスを模擬
  const mockResponse = {
    text: `1. この請求書に「4,027,740円」という金額が記載されていますか？  
   回答：はい

2. この請求書の宛先（〇〇御中の部分）に「株式会社中央建設」と書かれていますか？  
   回答：はい

3. この請求書の発行者（会社名/ロゴ）は「株式会社中山総業」ですか？  
   回答：はい`
  };
  
  const purchaseData = {
    totalDebtAmount: 4027740,
    debtorCompany: "株式会社中央建設",
    purchaseAmount: 1500000
  };
  
  console.log('Mock Response:', mockResponse.text);
  console.log('\nPurchase Data:', purchaseData);
  
  // パース処理をシミュレート
  const text = mockResponse.text;
  const lines = text.split('\n');
  console.log('\nSplit into', lines.length, 'lines');
  
  let amountMatch: "match" | "mismatch" | "not_found" = "not_found";
  let foundAmount = undefined;
  let companyMatch: "match" | "mismatch" | "not_found" = "not_found";
  let foundCompany = undefined;
  
  // 各質問の回答を見つける
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    console.log(`\nProcessing line ${i}: "${line}"`);
    
    // 1. 請求金額の判定
    if (line.includes('1.') && line.includes('金額')) {
      console.log('  -> Found amount question');
      const answerLine = line.includes('回答') ? line : (lines[i + 1] || '');
      console.log(`  -> Answer line: "${answerLine}"`);
      if (answerLine.includes('はい')) {
        console.log('  -> Found はい');
        foundAmount = purchaseData.totalDebtAmount;
        amountMatch = "match";
      }
    }
    
    // 2. 請求先の判定
    if (line.includes('2.') && line.includes('宛先')) {
      console.log('  -> Found company question');
      const answerLine = line.includes('回答') ? line : (lines[i + 1] || '');
      console.log(`  -> Answer line: "${answerLine}"`);
      if (answerLine.includes('はい')) {
        console.log('  -> Found はい');
        foundCompany = purchaseData.debtorCompany;
        companyMatch = "match";
      }
    }
  }
  
  console.log('\n=== Final Results ===');
  console.log('amountMatch:', amountMatch);
  console.log('companyMatch:', companyMatch);
  console.log('foundAmount:', foundAmount);
  console.log('foundCompany:', foundCompany);
  
  // サマリー生成
  const summary = amountMatch === "match" && companyMatch === "match" ?
    `請求金額（総債権額）と請求先企業名の両方が一致しました` :
    amountMatch === "match" ?
      `請求金額は一致しましたが、請求先が${companyMatch === "mismatch" ? "不一致" : "確認できません"}` :
      companyMatch === "match" ?
        `請求先は一致しましたが、請求金額が${amountMatch === "mismatch" ? "不一致" : "確認できません"}` :
        `請求金額と請求先の両方が${amountMatch === "mismatch" || companyMatch === "mismatch" ? "不一致" : "確認できません"}`;
  
  console.log('\nSummary:', summary);
  
  return {
    success: true,
    verificationResult: {
      amountMatch,
      foundAmount,
      companyMatch,
      foundCompany
    },
    summary,
    confidence: amountMatch === "match" && companyMatch === "match" ? 95 :
               amountMatch === "match" || companyMatch === "match" ? 50 : 10
  };
}

// 実行
const result = mockOCRPurchaseParsing();
console.log('\n=== Tool Output ===');
console.log(JSON.stringify(result, null, 2));