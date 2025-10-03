# Phase 4: 最終分析・レポート生成ステップ - 実装計画書

最終更新: 2025-10-02

---

## 📋 目次

1. [実装概要](#実装概要)
2. [リスク評価ロジック](#リスク評価ロジック)
3. [総合判定ロジック](#総合判定ロジック)
4. [レポート生成](#レポート生成)
5. [実装順序](#実装順序)
6. [テストケース](#テストケース)

---

## 実装概要

### 目標

Phase 1〜3の全データを統合し、総合的なリスク評価とレポート生成を行う。

### 設計方針

```
❌ AIエージェントを使わない
✅ ワークフローステップ内で直接ロジックを実行
✅ リスク評価は明確な減点方式
✅ AIはレポート生成のみに使用（generateTextで直接呼び出し）
✅ シンプルで判断しやすいログ
```

### 処理時間・コスト

- **処理時間**: 約5-10秒
- **コスト**: 約$0.005-0.010
- **状態**: 🔮 将来実装（Phase 3完了後）

---

## リスク評価ロジック

### 評価項目一覧

Phase 4では、以下の5つのリスク項目を評価する：

1. **申込者属性リスク** （配点: 15点）
2. **担保集中リスク** （配点: 20点）
3. **入金変動リスク** （配点: 15点）
4. **通帳リスク** （配点: 20点）
5. **人的リスク** （配点: 30点）

**合計: 100点満点**（減点方式）

---

### 1. 申込者属性リスク（15点）

#### 評価ロジック

```typescript
// Kintoneから生年月日を取得
const birthDate = kintoneRecord.生年月日.value;
const age = calculateAge(birthDate);

// 年齢リスク
let ageRiskScore = 0;
let ageRiskLevel = "低";

if (age < 30) {
  ageRiskScore = 10;  // 減点
  ageRiskLevel = "高";
} else if (age < 40) {
  ageRiskScore = 5;   // 減点
  ageRiskLevel = "中";
}

// 事業形態リスク
const companyName = kintoneRecord.会社名.value;
const isPersonalBusiness = !companyName || companyName === "";

let businessRiskScore = 0;
let businessRiskLevel = "低";

if (isPersonalBusiness) {
  businessRiskScore = 5;  // 減点
  businessRiskLevel = "高";
}

// 複合リスク（若年 + 個人事業主）
let compositeRisk = "通常";
if (age < 30 && isPersonalBusiness) {
  compositeRisk = "特に高";
  // さらに追加減点なし（既に年齢とビジネスで減点済み）
}

// 申込者属性リスクの合計減点
const personalRiskScore = ageRiskScore + businessRiskScore;  // 最大15点
```

#### 評価基準

| 条件 | 減点 | リスクレベル | 理由 |
|-----|------|------------|------|
| 30歳未満 | -10点 | 高 | 逃亡リスク高、事業経験不足 |
| 30-40歳未満 | -5点 | 中 | 一定のリスクあり |
| 40歳以上 | 0点 | 低 | 経験豊富、安定性高 |
| 個人事業主 | -5点 | 高 | 法的責任が限定的 |
| 法人 | 0点 | 低 | 法的責任明確 |

#### ログ出力

```
━━━ リスク評価 ━━━

【申込者属性リスク】
  年齢: 22歳
  年齢リスク: 高（30歳未満）
  減点: -10点
  
  事業形態: 個人事業主（会社名なし）
  事業形態リスク: 高
  減点: -5点
  
  複合リスク: 特に高（若年×個人事業主）
  
  合計減点: -15点
```

---

### 2. 担保集中リスク（20点）

#### 評価ロジック

```typescript
// Phase 1の結果から担保企業情報を取得
const collateralInfo = phase1Results.collateralVerification.collateralInfo;
const collateralCount = collateralInfo.totalCompanies;

// 買取情報から総債権額を取得
const totalAmount = phase1Results.purchaseVerification.purchaseInfo.totalAmount;

// 各担保企業の金額（Kintone担保情報テーブルから取得）
const collateralAmounts = await fetchCollateralAmounts(recordId);

let concentrationRiskScore = 0;
let concentrationRiskLevel = "低";
let description = "";

if (collateralCount === 0) {
  // 担保なし
  concentrationRiskScore = 20;  // 最大減点
  concentrationRiskLevel = "特に高";
  description = "担保企業なし（回収リスク極めて高）";
  
} else if (collateralCount === 1) {
  // 担保1社のみ
  concentrationRiskScore = 20;  // 最大減点
  concentrationRiskLevel = "高";
  description = "担保1社のみ（その企業が倒産すれば全額回収不能）";
  
} else {
  // 担保2社以上 → 依存度を計算
  const largestCollateral = Math.max(...collateralAmounts);
  const dependencyRate = (largestCollateral / totalAmount) * 100;
  
  if (dependencyRate > 80) {
    concentrationRiskScore = 15;
    concentrationRiskLevel = "高";
    description = `1社への依存度${dependencyRate.toFixed(1)}%（過度な集中）`;
  } else if (dependencyRate > 50) {
    concentrationRiskScore = 10;
    concentrationRiskLevel = "中";
    description = `1社への依存度${dependencyRate.toFixed(1)}%（やや集中）`;
  } else if (collateralCount >= 3) {
    concentrationRiskScore = 0;
    concentrationRiskLevel = "低";
    description = `${collateralCount}社に分散（リスク分散良好）`;
  } else {
    // 2社だが依存度50%以下
    concentrationRiskScore = 5;
    concentrationRiskLevel = "低〜中";
    description = `2社に分散（依存度${dependencyRate.toFixed(1)}%）`;
  }
}
```

#### 評価基準

| 条件 | 減点 | リスクレベル |
|-----|------|------------|
| 担保0社 | -20点 | 特に高 |
| 担保1社 | -20点 | 高 |
| 2社、依存度80%超 | -15点 | 高 |
| 2社、依存度50-80% | -10点 | 中 |
| 2社、依存度50%以下 | -5点 | 低〜中 |
| 3社以上、依存度50%以下 | 0点 | 低 |

#### ログ出力

```
【担保集中リスク】
  担保企業数: 1社
  リスクレベル: 高
  理由: 担保1社のみ（その企業が倒産すれば全額回収不能）
  減点: -20点
```

または

```
【担保集中リスク】
  担保企業数: 3社
  最大依存度: 35.5%（株式会社A工業）
  リスクレベル: 低
  理由: 3社に分散（リスク分散良好）
  減点: 0点
```

---

### 3. 入金変動リスク（15点）

#### 評価ロジック

```typescript
// Kintone担保情報テーブルから過去3ヶ月の入金を取得
const collaterals = await fetchCollateralInfo(recordId);

// 各企業の入金変動を計算
let maxVariationRate = 0;
const paymentAnalysis = [];

for (const collateral of collaterals) {
  const payments = [
    collateral.過去の入金_先々月.value || 0,
    collateral.過去の入金_先月.value || 0,
    collateral.過去の入金_今月.value || 0,
  ];
  
  const average = payments.reduce((a, b) => a + b, 0) / 3;
  const stdDev = calculateStdDev(payments);
  const variationRate = average > 0 ? (stdDev / average) * 100 : 100;
  
  paymentAnalysis.push({
    company: collateral.会社名_第三債務者_担保.value,
    payments,
    average,
    variationRate,
  });
  
  maxVariationRate = Math.max(maxVariationRate, variationRate);
}

// リスク判定
let paymentRiskScore = 0;
let paymentRiskLevel = "低";
let description = "";

if (maxVariationRate > 50) {
  paymentRiskScore = 15;
  paymentRiskLevel = "高";
  description = `変動率${maxVariationRate.toFixed(1)}%（入金不安定）`;
} else if (maxVariationRate > 30) {
  paymentRiskScore = 10;
  paymentRiskLevel = "中";
  description = `変動率${maxVariationRate.toFixed(1)}%（やや不安定）`;
} else {
  paymentRiskScore = 0;
  paymentRiskLevel = "低";
  description = `変動率${maxVariationRate.toFixed(1)}%（安定）`;
}
```

#### 標準偏差の計算

```typescript
function calculateStdDev(values: number[]): number {
  const average = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - average, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(variance);
}
```

#### 評価基準

| 条件 | 減点 | リスクレベル |
|-----|------|------------|
| 変動率50%超 | -15点 | 高 |
| 変動率30-50% | -10点 | 中 |
| 変動率30%以下 | 0点 | 低 |

#### ログ出力

```
【入金変動リスク】
  企業別分析:
    株式会社A工業:
      先々月: ¥2,000,000
      先月: ¥2,050,000
      今月: ¥2,100,000
      平均: ¥2,050,000
      変動率: 2.4%
    
    株式会社B建設:
      先々月: ¥6,710,000
      先月: ¥1,570,000
      今月: ¥1,570,000
      平均: ¥3,283,333
      変動率: 76.5% ⚠️
  
  最大変動率: 76.5%（株式会社B建設）
  リスクレベル: 高
  理由: 変動率76.5%（入金不安定）
  減点: -15点
```

---

### 4. 通帳リスク（20点）

#### 評価ロジック

```typescript
// Phase 2の結果から通帳分析データを取得
const mainBank = phase2Results.mainBank.riskDetection;
const subBank = phase2Results.subBank.riskDetection;
const crossTransfers = phase2Results.crossBankTransfers;
const factoringCompanies = phase2Results.factoringCompanies;

// リスク項目の検出
const hasGambling = mainBank.gambling.length > 0 || subBank.gambling.length > 0;
const hasLargeCash = mainBank.largeCashWithdrawals.length > 0 || subBank.largeCashWithdrawals.length > 0;
const hasCrossTransfer = crossTransfers.length > 0;
const hasOtherFactoring = factoringCompanies.length > 0;

// リスクスコア計算
let bankRiskScore = 0;
let bankRiskLevel = "低";
const riskReasons = [];

if (hasGambling) {
  bankRiskScore += 10;
  riskReasons.push(`ギャンブル${mainBank.gambling.length + subBank.gambling.length}件`);
}

if (hasOtherFactoring) {
  bankRiskScore += 10;
  riskReasons.push(`他社ファクタリング${factoringCompanies.length}社`);
}

if (hasLargeCash) {
  bankRiskScore += 5;
  riskReasons.push(`大口出金${mainBank.largeCashWithdrawals.length + subBank.largeCashWithdrawals.length}件`);
}

if (hasCrossTransfer && crossTransfers.length > 5) {
  bankRiskScore += 5;
  riskReasons.push(`通帳間資金移動${crossTransfers.length}件（多い）`);
}

// 最大20点まで
bankRiskScore = Math.min(bankRiskScore, 20);

// リスクレベル判定
if (bankRiskScore >= 15) {
  bankRiskLevel = "高";
} else if (bankRiskScore >= 10) {
  bankRiskLevel = "中";
} else {
  bankRiskLevel = "低";
}
```

#### 評価基準

| 検出項目 | 減点 |
|---------|------|
| ギャンブル検出 | -10点 |
| 他社ファクタリング検出 | -10点 |
| 大口出金検出 | -5点 |
| 通帳間資金移動（5件超） | -5点 |

**最大減点: 20点**

#### ログ出力

```
【通帳リスク】
  メイン通帳:
    ✓ ギャンブル: 1件
    ✓ 大口出金: 2件
    資金移動: 1件
  
  サブ通帳:
    ギャンブル: 0件
    大口出金: 1件
  
  通帳間資金移動: 3件
  他社ファクタリング: 1社（ビートレーディング）
  
  検出リスク:
    - ギャンブル1件
    - 他社ファクタリング1社
    - 大口出金3件
  
  リスクレベル: 高
  減点: -20点
```

---

### 5. 人的リスク（30点）

#### 評価ロジック

```typescript
// Phase 3の結果から人的リスク情報を取得
const identityVerification = phase3Results.identityVerification;
const applicantEgoSearch = phase3Results.applicantEgoSearch;
const representativeEgoSearches = phase3Results.representativeEgoSearches;

let humanRiskScore = 0;
let humanRiskLevel = "低";
const riskReasons = [];

// 1. 本人確認の不一致（最重要）
const nameMatch = identityVerification.extractedInfo.name === identityVerification.processingDetails.expectedName;
const birthDateMatch = identityVerification.extractedInfo.birthDate === identityVerification.processingDetails.expectedBirthDate;

if (!nameMatch || !birthDateMatch) {
  humanRiskScore += 30;  // 即時最大減点
  riskReasons.push("本人確認情報不一致");
  humanRiskLevel = "特に高";
}

// 2. 申込者のネガティブ情報
if (applicantEgoSearch.summary.hasNegativeInfo) {
  humanRiskScore += 30;  // 即時最大減点
  riskReasons.push(`申込者ネガティブ情報（詐欺サイト${applicantEgoSearch.summary.fraudHits}件）`);
  humanRiskLevel = "特に高";
}

// 3. 代表者のネガティブ情報
const representativesWithRisk = representativeEgoSearches.filter(r => r.egoSearchResult.summary.hasNegativeInfo);
if (representativesWithRisk.length > 0) {
  humanRiskScore += 15;
  riskReasons.push(`代表者ネガティブ情報（${representativesWithRisk.length}名）`);
  if (humanRiskLevel !== "特に高") {
    humanRiskLevel = "中";
  }
}

// 最大30点まで
humanRiskScore = Math.min(humanRiskScore, 30);
```

#### 評価基準

| 検出項目 | 減点 | リスクレベル |
|---------|------|------------|
| 本人確認情報不一致 | -30点 | 特に高 |
| 申込者ネガティブ情報 | -30点 | 特に高 |
| 代表者ネガティブ情報 | -15点 | 中 |

**最大減点: 30点**

#### ログ出力

```
【人的リスク】
  本人確認:
    ✓ 氏名: 一致
    ✓ 生年月日: 一致
    ✓ 住所: 一致
  
  申込者エゴサーチ:
    ✓ 詐欺情報サイト: 該当なし
    ✓ Web検索: ネガティブ情報なし
  
  代表者エゴサーチ（2名）:
    ✓ 佐藤一郎（株式会社A工業）: 問題なし
    ✓ 鈴木二郎（株式会社B建設）: 問題なし
  
  リスクレベル: 低
  減点: 0点
```

**リスク検出時の例**:

```
【人的リスク】
  本人確認:
    ✓ 氏名: 一致
    ✓ 生年月日: 一致
  
  申込者エゴサーチ:
    ⚠️ 詐欺情報サイト: 1件検出
    ⚠️ Web検索: "山田太郎 詐欺" - 3件
  
  検出リスク:
    - 申込者ネガティブ情報（詐欺サイト1件）
  
  リスクレベル: 特に高
  減点: -30点
```

---

## 総合判定ロジック

### スコア計算

```typescript
// 初期スコア: 100点
let totalScore = 100;

// 各リスク項目の減点を適用
totalScore -= personalRiskScore;        // 最大-15点
totalScore -= concentrationRiskScore;   // 最大-20点
totalScore -= paymentRiskScore;         // 最大-15点
totalScore -= bankRiskScore;            // 最大-20点
totalScore -= humanRiskScore;           // 最大-30点

// 最終スコア（0-100点）
totalScore = Math.max(totalScore, 0);
```

### 判定ロジック

```typescript
// スコアベースの判定
let finalDecision: "承認" | "条件付き承認" | "再検討" | "却下";
let riskLevel: "低" | "中" | "高";

if (totalScore >= 80) {
  finalDecision = "承認";
  riskLevel = "低";
} else if (totalScore >= 60) {
  finalDecision = "条件付き承認";
  riskLevel = "中";
} else if (totalScore >= 40) {
  finalDecision = "再検討";
  riskLevel = "高";
} else {
  finalDecision = "却下";
  riskLevel = "高";
}

// 致命的なリスク項目がある場合は自動却下
if (humanRiskScore >= 30) {
  finalDecision = "却下";
  riskLevel = "高";
}
```

### 判定基準表

| スコア | 判定 | リスクレベル | 説明 |
|--------|------|------------|------|
| 80-100点 | 承認 | 低 | リスク要因が少なく、承認可能 |
| 60-79点 | 条件付き承認 | 中 | 一定のリスクあり、条件付きで承認 |
| 40-59点 | 再検討 | 高 | 複数のリスク要因あり、再検討が必要 |
| 0-39点 | 却下 | 高 | リスクが高すぎるため却下 |

**例外ルール**:
- 人的リスク30点減点（本人確認不一致 or 申込者ネガティブ情報）→ 自動的に「却下」

### ログ出力

```
━━━ 総合判定 ━━━

【リスクスコア内訳】
  初期スコア: 100点
  
  申込者属性リスク: -15点
  担保集中リスク: -20点
  入金変動リスク: -15点
  通帳リスク: -20点
  人的リスク: 0点
  
  ───────────────
  最終スコア: 30点

【判定】
  総合判定: 却下
  リスクレベル: 高
  
【主要なリスク要因】
  1. 申込者属性リスク（若年×個人事業主）
  2. 担保集中リスク（担保1社のみ）
  3. 入金変動リスク（変動率76.5%）
  4. 通帳リスク（ギャンブル+他社ファクタリング）
```

---

## レポート生成

### AIプロンプト設計

```typescript
const reportPrompt = `
あなたはファクタリング審査の専門家です。以下のデータから、詳細な審査レポートを作成してください。

【申込者情報】
- 氏名: ${applicantName}
- 年齢: ${age}歳
- 事業形態: ${isPersonalBusiness ? "個人事業主" : "法人"}

【買取情報】
- 総債権額: ¥${totalAmount.toLocaleString()}
- 第三債務者: ${debtorCount}社
  ${debtorCompanies.map(c => `  - ${c.name}: ¥${c.amount.toLocaleString()}`).join('\n')}
- 照合結果: ${matchResult}

【担保情報】
- 担保企業数: ${collateralCount}社
- 担保集中リスク: ${concentrationRiskDescription}
  ${collateralCompanies.map(c => `  - ${c.name}: 資本金¥${c.capital.toLocaleString()}`).join('\n')}

【通帳分析】
- メイン通帳入金率: ${depositRate}%
- ギャンブル検出: ${gamblingCount}件
- 大口出金: ${largeCashCount}件
- 他社ファクタリング: ${factoringCount}社
  ${factoringCompanies.map(c => `  - ${c.name}`).join('\n')}

【本人確認・企業実在性】
- 本人確認: ${identityResult}
- 申込者エゴサーチ: ${egoSearchResult}
- 企業実在性確認:
  - 申込企業: ${applicantCompanyVerified ? "確認済み" : "未確認"}
  - 買取企業: ${purchaseCompanyVerifiedCount}/${purchaseCompanyTotalCount}社確認済み
  - 担保企業: ${collateralCompanyVerifiedCount}/${collateralCompanyTotalCount}社確認済み

【リスク評価】
- 総合スコア: ${totalScore}点 / 100点
- リスクレベル: ${riskLevel}
- リスク内訳:
  - 申込者属性リスク: -${personalRiskScore}点 ${personalRiskDescription}
  - 担保集中リスク: -${concentrationRiskScore}点 ${concentrationRiskDescription}
  - 入金変動リスク: -${paymentRiskScore}点 ${paymentRiskDescription}
  - 通帳リスク: -${bankRiskScore}点 ${bankRiskDescription}
  - 人的リスク: -${humanRiskScore}点 ${humanRiskDescription}

【総合判定】
${finalDecision}

---

上記を踏まえて、以下の形式で審査レポートを作成してください:

## 1. 総合評価
（判定結果とその理由を簡潔に記載）

## 2. 主要なリスク要因
（検出された重要なリスクを箇条書き）

## 3. ポジティブな要因
（評価できる点を箇条書き）

## 4. 推奨事項
（どのような条件で承認可能か、または改善すべき点）

## 5. 留意事項
（審査担当者が特に注意すべき点）

※ プロフェッショナルで明確な表現を使用してください。
※ 具体的な数値・事実に基づいた客観的な評価をしてください。
`;

const reportResult = await generateText({
  model: anthropic("claude-3-5-sonnet-20241022"),
  prompt: reportPrompt,
});

const detailedReport = reportResult.text;
```

### 推奨事項の自動生成

```typescript
const recommendations: string[] = [];

// 担保集中リスクへの推奨
if (concentrationRiskScore >= 15) {
  if (collateralCount === 0) {
    recommendations.push("担保企業が0社のため、必ず担保設定を要求してください");
  } else if (collateralCount === 1) {
    recommendations.push("担保企業が1社のみのため、追加担保の設定を強く推奨します");
  } else {
    recommendations.push(`1社への依存度が${dependencyRate.toFixed(1)}%と高いため、リスク分散を検討してください`);
  }
}

// 通帳リスクへの推奨
if (hasOtherFactoring) {
  recommendations.push("他社ファクタリング利用が確認されているため、資金繰り状況の詳細確認が必要です");
}

if (hasGambling) {
  recommendations.push("ギャンブル関連の出金が検出されているため、継続的な資金管理が必要です");
}

// 入金変動リスクへの推奨
if (paymentRiskScore >= 10) {
  recommendations.push("入金が不安定なため、継続的なモニタリングと早期アラート設定を推奨します");
}

// 人的リスクへの推奨
if (humanRiskScore > 0) {
  recommendations.push("人的リスクが検出されているため、追加の信用調査を実施してください");
}

// ポジティブな場合
if (totalScore >= 80) {
  recommendations.push("総合的にリスクが低く、通常の審査フローで承認可能です");
}
```

### 警告事項の自動生成

```typescript
const warnings: string[] = [];

// 致命的なリスク
if (humanRiskScore >= 30) {
  warnings.push("⚠️ 重大: 本人確認情報の不一致または申込者のネガティブ情報が検出されています");
}

// 高リスク項目
if (concentrationRiskScore >= 20) {
  warnings.push("⚠️ 担保企業が0社または1社のみです");
}

if (paymentRiskScore >= 15) {
  warnings.push("⚠️ 入金変動が大きく不安定です");
}

if (bankRiskScore >= 15) {
  warnings.push("⚠️ 通帳でギャンブルまたは他社ファクタリングが検出されています");
}

// ファイル不足
if (phase1Results.collateralVerification.collateralDocuments.length === 0) {
  warnings.push("担保謄本ファイルが添付されていません");
}
```

---

## 実装順序

### フェーズ1: データ統合（0.5日）

1. ✅ Phase 1〜3の結果を統合
2. ✅ Kintoneデータの追加取得

### フェーズ2: リスク評価実装（1日）

1. ✅ 5つのリスク評価ロジックの実装
2. ✅ スコア計算ロジック
3. ✅ ログ出力の実装

### フェーズ3: 総合判定実装（0.5日）

1. ✅ 判定ロジックの実装
2. ✅ 例外ルールの実装

### フェーズ4: レポート生成（1日）

1. ✅ AIプロンプトの設計
2. ✅ レポート生成ロジック
3. ✅ 推奨事項・警告事項の自動生成

### フェーズ5: テスト・調整（1日）

1. ✅ 実データでのテスト
2. ✅ 判定基準の調整
3. ✅ レポート品質の確認

**合計: 約4日**

---

## テストケース

### テストデータ: recordId "9918"

#### 期待されるスコア

```typescript
初期スコア: 100点

申込者属性リスク: -15点
  - 年齢22歳（-10点）
  - 個人事業主（-5点）

担保集中リスク: -20点
  - 担保0社（-20点）

入金変動リスク: -15点
  - 変動率76.5%（-15点）

通帳リスク: -20点
  - ギャンブル1件（-10点）
  - 他社ファクタリング1社（-10点）

人的リスク: 0点
  - 問題なし

最終スコア: 30点
判定: 却下
リスクレベル: 高
```

#### 期待される出力

```json
{
  "recordId": "9918",
  "totalProcessingTime": "45.3秒",
  "totalCost": "$0.115",
  
  "finalDecision": "却下",
  "riskLevel": "高",
  "riskScore": 30,
  
  "detailedReport": "## 1. 総合評価\n本案件は却下が妥当と判断されます...",
  
  "recommendations": [
    "担保企業が0社のため、必ず担保設定を要求してください",
    "他社ファクタリング利用が確認されているため、資金繰り状況の詳細確認が必要です",
    "ギャンブル関連の出金が検出されているため、継続的な資金管理が必要です",
    "入金が不安定なため、継続的なモニタリングと早期アラート設定を推奨します"
  ],
  
  "warnings": [
    "⚠️ 担保企業が0社または1社のみです",
    "⚠️ 入金変動が大きく不安定です",
    "⚠️ 通帳でギャンブルまたは他社ファクタリングが検出されています",
    "担保謄本ファイルが添付されていません"
  ],
  
  "phase1Results": { ... },
  "phase2Results": { ... },
  "phase3Results": { ... }
}
```

---

## まとめ

Phase 4は、全てのデータを統合し、明確な減点方式でリスク評価を行う。

**重要ポイント**:
- ✅ 明確な減点方式（100点満点）
- ✅ 5つのリスク項目を網羅的に評価
- ✅ 致命的なリスクは自動却下
- ✅ AIはレポート生成のみに使用
- ✅ 推奨事項・警告事項を自動生成

この計画に従って実装を進める。

