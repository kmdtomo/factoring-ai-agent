// Test exact match logic for bank OCR

const testExactMatchLogic = () => {
  console.log('=== Testing Exact Match Logic ===\n');
  
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
  
  const matchedPayments = [];
  
  // まず完全一致を自動的にチェック
  console.log('Step 1: Checking for exact matches...\n');
  for (const payment of collateralInfo.pastPayments) {
    const exactMatch = markedTransactions.find(t => t.amount === payment.amount);
    if (exactMatch) {
      console.log(`Found exact match: ${payment.amount} on ${exactMatch.date}`);
      matchedPayments.push({
        expectedCompany: collateralInfo.companyName,
        expectedAmount: payment.amount,
        foundAmount: payment.amount,
        status: "match",
        period: payment.period,
        description: `${exactMatch.date}に入金`,
      });
    } else {
      console.log(`No exact match for ${payment.amount} (${payment.period})`);
    }
  }
  
  console.log('\nMatched Payments after exact match:', matchedPayments);
  
  // 完全一致しなかった支払いのみを抽出
  const unmatchedPayments = collateralInfo.pastPayments.filter(
    p => !matchedPayments.some(m => m.expectedAmount === p.amount && m.status === "match")
  );
  
  console.log('\nUnmatched Payments:', unmatchedPayments);
  
  // 分割入金チェック
  console.log('\n=== Split Payment Analysis ===');
  for (const unmatched of unmatchedPayments) {
    if (unmatched.amount === 6714029) {
      console.log(`\nChecking split payment for ${unmatched.amount}:`);
      // 2つの組み合わせをチェック
      for (let i = 0; i < markedTransactions.length; i++) {
        for (let j = i + 1; j < markedTransactions.length; j++) {
          const sum = markedTransactions[i].amount + markedTransactions[j].amount;
          if (sum === unmatched.amount) {
            console.log(`✓ Found: ${markedTransactions[i].amount} + ${markedTransactions[j].amount} = ${sum}`);
          }
        }
      }
    }
  }
  
  // 近似値チェック
  console.log('\n=== Near Match Analysis ===');
  const tolerance = 10000; // 10,000円の誤差まで許容
  for (const unmatched of unmatchedPayments) {
    console.log(`\nChecking near matches for ${unmatched.amount}:`);
    for (const trans of markedTransactions) {
      const diff = Math.abs(trans.amount - unmatched.amount);
      if (diff <= tolerance && diff > 0) {
        console.log(`- ${trans.amount} (差額: ${diff}円)`);
      }
    }
  }
};

testExactMatchLogic();