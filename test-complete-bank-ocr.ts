// Complete test of the bank OCR logic

// Simulate the improved bank OCR tool logic
function simulateBankOCRTool(markedTransactions: any[], collateralInfo: any) {
  console.log('=== Bank OCR Tool Simulation ===\n');
  
  const matchedPayments: any[] = [];
  
  // Step 1: Check for exact matches
  console.log('Step 1: Checking for exact matches...');
  for (const payment of collateralInfo.pastPayments) {
    const exactMatch = markedTransactions.find(t => t.amount === payment.amount);
    if (exactMatch) {
      console.log(`✓ Found exact match: ${payment.amount} on ${exactMatch.date}`);
      matchedPayments.push({
        expectedCompany: collateralInfo.companyName,
        expectedAmount: payment.amount,
        foundAmount: payment.amount,
        status: "match",
        period: payment.period,
        description: `${exactMatch.date}に入金`,
      });
    }
  }
  
  // Get unmatched payments
  const unmatchedPayments = collateralInfo.pastPayments.filter(
    (p: any) => !matchedPayments.some((m: any) => m.expectedAmount === p.amount && m.status === "match")
  );
  
  console.log(`\nUnmatched payments: ${unmatchedPayments.length}`);
  
  // Step 2: For unmatched payments, simulate AI verification (in real tool, this would call GPT-4o)
  if (unmatchedPayments.length > 0) {
    console.log('\nStep 2: Simulating AI verification for unmatched amounts...');
    
    // In this test, we'll simulate the AI response based on what we know
    for (const payment of unmatchedPayments) {
      // Check if it's close to any transaction (within 10,000 yen)
      const nearMatch = markedTransactions.find(
        t => Math.abs(t.amount - payment.amount) < 10000
      );
      
      if (nearMatch) {
        console.log(`✗ ${payment.amount} - No exact match (closest: ${nearMatch.amount})`);
      } else {
        console.log(`✗ ${payment.amount} - No match found`);
      }
      
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
  
  // Step 3: Check for split payments
  console.log('\nStep 3: Checking for split payments...');
  const unmatchedResults = matchedPayments.filter(m => m.status !== "match");
  const splitPaymentPossibilities: any[] = [];
  
  for (const unmatchedResult of unmatchedResults) {
    const targetAmount = unmatchedResult.expectedAmount;
    
    // Check 2-transaction combinations
    for (let i = 0; i < markedTransactions.length; i++) {
      for (let j = i + 1; j < markedTransactions.length; j++) {
        const sum = markedTransactions[i].amount + markedTransactions[j].amount;
        if (sum === targetAmount) {
          console.log(`✓ Found split payment for ${targetAmount}: ${markedTransactions[i].amount} + ${markedTransactions[j].amount}`);
          splitPaymentPossibilities.push({
            period: unmatchedResult.period,
            expectedAmount: targetAmount,
            transactions: [markedTransactions[i], markedTransactions[j]]
          });
          break;
        }
      }
    }
  }
  
  // Generate summary
  const matchCount = matchedPayments.filter(m => m.status === "match").length;
  let summary = `マーク取引${markedTransactions.length}件を確認。\n`;
  
  if (matchCount > 0) {
    summary += `\n【一致した入金】\n`;
    matchedPayments
      .filter(m => m.status === "match")
      .forEach(m => {
        summary += `- ${m.period}: ${m.expectedAmount.toLocaleString()}円 ✓\n`;
      });
  }
  
  const mismatchPayments = matchedPayments.filter(m => m.status !== "match");
  if (mismatchPayments.length > 0) {
    summary += `\n【確認できなかった入金】\n`;
    mismatchPayments.forEach(m => {
      summary += `- ${m.period}: ${m.expectedAmount.toLocaleString()}円 ?\n`;
      
      // Add split payment info if found
      const splitPossibility = splitPaymentPossibilities.find(s => s.period === m.period);
      if (splitPossibility) {
        summary += `  ※ 以下の入金の合計と一致する可能性があります：\n`;
        splitPossibility.transactions.forEach((t: any) => {
          summary += `    - ${t.date || '日付不明'}: ${t.amount.toLocaleString()}円\n`;
        });
        summary += `    合計: ${m.expectedAmount.toLocaleString()}円（完全一致）\n`;
      }
    });
  }
  
  summary += `\n照合結果: ${matchCount}/${collateralInfo.pastPayments.length}件が一致`;
  
  return {
    success: true,
    markedTransactions,
    matchedPayments,
    otherFindings: [],
    summary,
    humanCheckRequired: true
  };
}

// Test with actual data
const markedTransactions = [
  { amount: 1089725, description: "", date: "07", isCredit: true },
  { amount: 5264304, description: "", date: "07", isCredit: true },
  { amount: 1449725, description: "", date: "08", isCredit: true },
  { amount: 1572688, description: "", date: "09", isCredit: true }
];

const collateralInfo = {
  companyName: "株式会社中央建設",
  pastPayments: [
    { amount: 1099725, period: "前前々回" },
    { amount: 6714029, period: "前々回" },
    { amount: 1572688, period: "前回" }
  ]
};

const result = simulateBankOCRTool(markedTransactions, collateralInfo);
console.log('\n=== Final Result ===');
console.log(JSON.stringify(result, null, 2));