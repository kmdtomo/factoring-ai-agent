// Test Bank OCR parsing logic

const testBankOCRParsing = () => {
  console.log('=== Testing Bank OCR Parsing ===\n');
  
  // 実際のマーク取引データ
  const markedTransactions = [
    { amount: 1089725, description: "", date: "07", isCredit: true },
    { amount: 5264304, description: "", date: "07", isCredit: true },
    { amount: 1449725, description: "", date: "08", isCredit: true },
    { amount: 1572688, description: "", date: "09", isCredit: true }
  ];
  
  // 期待される入金
  const collateralInfo = {
    companyName: "株式会社中央建設",
    pastPayments: [
      { amount: 1099725, period: "前前々回" },
      { amount: 6714029, period: "前々回" },
      { amount: 1572688, period: "前回" }
    ]
  };
  
  console.log('Marked Transactions:', markedTransactions);
  console.log('\nExpected Payments:', collateralInfo.pastPayments);
  
  // 模擬的なAIレスポンス
  const mockVerifyResponse = `1. 通帳にマーカーがされている入金の中に「1,099,725円」という金額がありますか？
   回答：いいえ

2. 通帳にマーカーがされている入金の中に「6,714,029円」という金額がありますか？
   回答：いいえ

3. 通帳にマーカーがされている入金の中に「1,572,688円」という金額がありますか？
   回答：はい`;
  
  console.log('\nMock AI Response:\n', mockVerifyResponse);
  
  // パース処理をシミュレート
  const verifyText = mockVerifyResponse;
  const verifyLines = verifyText.split('\n');
  const matchedPayments = [];
  
  for (let i = 0; i < collateralInfo.pastPayments.length; i++) {
    const payment = collateralInfo.pastPayments[i];
    let matchFound = false;
    
    // 各行をチェック
    for (let j = 0; j < verifyLines.length; j++) {
      const line = verifyLines[j];
      
      // 質問番号を含む行を探す
      if (line.includes(`${i + 1}.`) && line.includes('金額')) {
        console.log(`\nFound question ${i + 1} at line ${j}: "${line}"`);
        // 次の行または同じ行で「回答：」を探す
        const answerLine = line.includes('回答') ? line : (verifyLines[j + 1] || '');
        console.log(`Answer line: "${answerLine}"`);
        
        if (answerLine.includes('はい')) {
          console.log(`Found はい for amount ${payment.amount}`);
          matchFound = true;
          matchedPayments.push({
            expectedCompany: collateralInfo.companyName,
            expectedAmount: payment.amount,
            foundAmount: payment.amount,
            status: "match",
            period: payment.period,
            description: '',
          });
        } else if (answerLine.includes('いいえ')) {
          console.log(`Found いいえ for amount ${payment.amount}`);
        }
        break;
      }
    }
    
    if (!matchFound) {
      matchedPayments.push({
        expectedCompany: collateralInfo.companyName,
        expectedAmount: payment.amount,
        foundAmount: undefined,
        status: "not_found",
        period: payment.period,
        description: '',
      });
    }
  }
  
  console.log('\n=== Results ===');
  console.log('Matched Payments:', matchedPayments);
  
  // 分割入金の可能性もチェック
  console.log('\n=== Split Payment Check ===');
  for (const payment of collateralInfo.pastPayments) {
    if (payment.amount === 6714029) {
      const sum = markedTransactions[1].amount + markedTransactions[2].amount;
      console.log(`${markedTransactions[1].amount} + ${markedTransactions[2].amount} = ${sum}`);
      console.log(`Expected: ${payment.amount}, Match: ${sum === payment.amount}`);
    }
  }
};

testBankOCRParsing();