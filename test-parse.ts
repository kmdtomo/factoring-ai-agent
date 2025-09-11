// Test OCR response parsing

const testResponse = `1. この請求書に「4,027,740円」という金額が記載されていますか？  
   回答：はい

2. この請求書の宛先（〇〇御中の部分）に「株式会社中央建設」と書かれていますか？  
   回答：はい

3. この請求書の発行者（会社名/ロゴ）は「株式会社中山総業」ですか？  
   回答：はい`;

console.log('=== Testing OCR Response Parsing ===');
console.log('Raw Response:', testResponse);
console.log('\n');

// Test parsing logic
const lines = testResponse.split('\n');
console.log('Split lines:', lines.length, 'lines');
lines.forEach((line, i) => {
  console.log(`Line ${i}: "${line}"`);
});

// Initialize results
let amountMatch: "match" | "mismatch" | "not_found" = "not_found";
let companyMatch: "match" | "mismatch" | "not_found" = "not_found";

// Parse responses
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  // 1. 請求金額の判定
  if (line.includes('1.') && line.includes('金額')) {
    console.log(`\nFound question 1 at line ${i}`);
    const answerLine = line.includes('回答') ? line : (lines[i + 1] || '');
    console.log(`Answer line: "${answerLine}"`);
    if (answerLine.includes('はい')) {
      console.log('Found はい for amount');
      amountMatch = "match";
    } else if (answerLine.includes('いいえ')) {
      amountMatch = "mismatch";
    }
  }
  
  // 2. 請求先の判定
  if (line.includes('2.') && line.includes('宛先')) {
    console.log(`\nFound question 2 at line ${i}`);
    const answerLine = line.includes('回答') ? line : (lines[i + 1] || '');
    console.log(`Answer line: "${answerLine}"`);
    if (answerLine.includes('はい')) {
      console.log('Found はい for company');
      companyMatch = "match";
    } else if (answerLine.includes('いいえ')) {
      companyMatch = "mismatch";
    }
  }
}

console.log('\n=== Final Results ===');
console.log('amountMatch:', amountMatch);
console.log('companyMatch:', companyMatch);

// Test summary generation
const summary = amountMatch === "match" && companyMatch === "match" ?
  `請求金額（総債権額）と請求先企業名の両方が一致しました` :
  amountMatch === "match" ?
    `請求金額は一致しましたが、請求先が${companyMatch === "mismatch" ? "不一致" : "確認できません"}` :
    companyMatch === "match" ?
      `請求先は一致しましたが、請求金額が${amountMatch === "mismatch" ? "不一致" : "確認できません"}` :
      `請求金額と請求先の両方が${amountMatch === "mismatch" || companyMatch === "mismatch" ? "不一致" : "確認できません"}`;

console.log('Summary:', summary);