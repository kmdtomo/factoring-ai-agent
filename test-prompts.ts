// Test script to check if our prompts are generating the expected format

const testPurchasePrompt = (totalDebtAmount: number, debtorCompany: string, applicantCompany: string) => {
  const prompt = `以下の質問にはい/いいえで答えてください：

1. この請求書に「${totalDebtAmount.toLocaleString()}円」という金額が記載されていますか？
   回答：はい/いいえ

2. この請求書の宛先（〇〇御中の部分）に「${debtorCompany}」と書かれていますか？
   回答：はい/いいえ

3. この請求書の発行者（会社名/ロゴ）は「${applicantCompany}」ですか？
   回答：はい/いいえ

各質問に「はい」または「いいえ」のみで回答してください。`;
  
  console.log('=== Purchase OCR Prompt ===');
  console.log(prompt);
  console.log('\n');
};

const testBankPrompt = (pastPayments: Array<{amount: number, period: string}>) => {
  const listPrompt = `通帳のマーカーや赤丸でマークされている入金取引をすべてリストアップしてください。
以下の形式で記載してください：

【マークされた入金】
- 金額: XXXX円 / 日付: MM/DD
- 金額: YYYY円 / 日付: MM/DD

※マーカーがされている入金のみをリストアップしてください。`;
  
  const verifyPrompt = `以下の質問にはい/いいえで答えてください：

${pastPayments.map((p, i) => 
`${i + 1}. 通帳にマーカーがされている入金の中に「${p.amount.toLocaleString()}円」という金額がありますか？
   回答：はい/いいえ`
).join('\n\n')}

各質問に「はい」または「いいえ」のみで回答してください。`;
  
  console.log('=== Bank OCR List Prompt ===');
  console.log(listPrompt);
  console.log('\n=== Bank OCR Verify Prompt ===');
  console.log(verifyPrompt);
  console.log('\n');
};

// Test with sample data
testPurchasePrompt(4027740, "テスト株式会社", "申込者株式会社");

testBankPrompt([
  { amount: 5264304, period: "先々月" },
  { amount: 1449725, period: "先月" },
  { amount: 6714029, period: "今月" }
]);

// Example of how AI might respond
console.log('=== Expected AI Response Format (Purchase) ===');
console.log(`1. この請求書に「4,027,740円」という金額が記載されていますか？
   回答：はい

2. この請求書の宛先（〇〇御中の部分）に「テスト株式会社」と書かれていますか？
   回答：はい

3. この請求書の発行者（会社名/ロゴ）は「申込者株式会社」ですか？
   回答：はい`);

console.log('\n=== Expected AI Response Format (Bank List) ===');
console.log(`【マークされた入金】
- 金額: 5,264,304円 / 日付: 07/28
- 金額: 1,449,725円 / 日付: 08/15
- 金額: 6,714,029円 / 日付: 09/10`);

console.log('\n=== Expected AI Response Format (Bank Verify) ===');
console.log(`1. 通帳にマーカーがされている入金の中に「5,264,304円」という金額がありますか？
   回答：はい

2. 通帳にマーカーがされている入金の中に「1,449,725円」という金額がありますか？
   回答：はい

3. 通帳にマーカーがされている入金の中に「6,714,029円」という金額がありますか？
   回答：はい`);