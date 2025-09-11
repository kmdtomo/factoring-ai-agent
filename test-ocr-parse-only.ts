// Test just the parsing part of OCR tool

function testParsing(responseText: string) {
  console.log('=== Testing OCR Purchase Info Parsing ===');
  
  const lines = responseText.split('\n');
  
  let amountMatch: "match" | "mismatch" | "not_found" = "not_found";
  let foundAmount = undefined;
  let companyMatch: "match" | "mismatch" | "not_found" = "not_found";
  let foundCompany = undefined;
  
  const purchaseData = {
    totalDebtAmount: 4027740,
    debtorCompany: "株式会社中央建設"
  };
  
  // 各質問の回答を見つける
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // 1. 請求金額の判定
    if (line.includes('1.') && line.includes('金額')) {
      // 次の行または同じ行で「回答：」を探す
      const answerLine = line.includes('回答') ? line : (lines[i + 1] || '');
      if (answerLine.includes('はい')) {
        foundAmount = purchaseData.totalDebtAmount;
        amountMatch = "match";
      } else if (answerLine.includes('いいえ')) {
        amountMatch = "mismatch";
      }
    }
    
    // 2. 請求先の判定
    if (line.includes('2.') && line.includes('宛先')) {
      const answerLine = line.includes('回答') ? line : (lines[i + 1] || '');
      if (answerLine.includes('はい')) {
        foundCompany = purchaseData.debtorCompany;
        companyMatch = "match";
      } else if (answerLine.includes('いいえ')) {
        companyMatch = "mismatch";
      }
    }
  }
  
  console.log('Parsing results:', {
    amountMatch,
    foundAmount,
    companyMatch,
    foundCompany
  });
  
  // 結果サマリーを生成
  const summary = amountMatch === "match" && companyMatch === "match" ?
    `請求金額（総債権額）と請求先企業名の両方が一致しました` :
    amountMatch === "match" ?
      `請求金額は一致しましたが、請求先が${companyMatch === "mismatch" ? "不一致" : "確認できません"}` :
      companyMatch === "match" ?
        `請求先は一致しましたが、請求金額が${amountMatch === "mismatch" ? "不一致" : "確認できません"}` :
        `請求金額と請求先の両方が${amountMatch === "mismatch" || companyMatch === "mismatch" ? "不一致" : "確認できません"}`;
  
  console.log('Summary:', summary);
  
  return {
    verificationResult: {
      amountMatch,
      foundAmount,
      companyMatch,
      foundCompany
    },
    summary
  };
}

// Test with your actual response
const actualResponse = `1. この請求書に「4,027,740円」という金額が記載されていますか？  
   回答：はい

2. この請求書の宛先（〇〇御中の部分）に「株式会社中央建設」と書かれていますか？  
   回答：はい

3. この請求書の発行者（会社名/ロゴ）は「株式会社中山総業」ですか？  
   回答：はい`;

testParsing(actualResponse);