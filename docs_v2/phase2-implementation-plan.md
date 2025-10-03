# Phase 2: 通帳分析ステップ - 実装計画書

最終更新: 2025-10-02

---

## 📋 目次

1. [実装概要](#実装概要)
2. [ステップごとの詳細設計](#ステップごとの詳細設計)
3. [ツール設計](#ツール設計)
4. [データ構造定義](#データ構造定義)
5. [実装順序](#実装順序)
6. [テストケース](#テストケース)

---

## 実装概要

### 目標

メイン通帳とサブ通帳をOCR処理し、以下の分析を行う：

1. **メイン通帳（法人口座）**:
   - Kintone担保情報テーブルとの入金照合
   - 入金率の計算
   - 資金移動検出
   - ギャンブル検出
   - 大口資金検出

2. **サブ通帳（個人口座）**:
   - ギャンブル検出
   - 大口資金検出

3. **統合分析**:
   - 通帳間資金移動の照合
   - 他社ファクタリング業者の検出

### 設計方針（Phase 1と同じ）

```
❌ AIエージェントを使わない
✅ ワークフローステップ内でツールを直接実行
✅ 構造化データを変数として渡す
✅ シンプルで判断しやすいログ
✅ 2層の出力（人間用 + プログラム用）
```

---

## ステップごとの詳細設計

### Step 1: Google Vision OCR処理

#### 入力

```typescript
{
  recordId: string,
  mainBankFieldName?: string,  // デフォルト: "通帳_メイン_添付ファイル"
  subBankFieldName?: string,   // デフォルト: "通帳_その他_添付ファイル"
  maxPagesPerFile?: number,    // デフォルト: 50
}
```

#### 処理フロー

```typescript
// 1. Kintoneからファイル取得
const record = await fetchKintoneRecord(recordId);
const mainBankFiles = record[mainBankFieldName] || [];
const subBankFiles = record[subBankFieldName] || [];

// 2. Google Vision APIでOCR処理
const mainBankDocuments = await processFilesWithVision(mainBankFiles);
const subBankDocuments = await processFilesWithVision(subBankFiles);
```

#### 出力

```typescript
{
  success: boolean,
  processingDetails: {
    recordId: string,
    mainBankFiles: number,
    subBankFiles: number,
    totalPages: number,
  },
  mainBankDocuments: [{
    fileName: string,
    text: string,
    pageCount: number,
    tokenEstimate: number,
  }],
  subBankDocuments: [{
    fileName: string,
    text: string,
    pageCount: number,
    tokenEstimate: number,
  }],
}
```

#### ログ出力

```
━━━ OCR抽出結果 ━━━

【メイン通帳】
  📄 通帳_メイン.pdf (25ページ)
     先頭: "普通預金 口座番号 1234567 株式会社ABC..."

【サブ通帳】
  📄 通帳_個人.pdf (15ページ)
     先頭: "普通預金 口座番号 9876543 山田太郎..."
```

---

### Step 2: メイン通帳分析

#### 入力

```typescript
{
  recordId: string,
  mainBankDocuments: [...],  // OCR結果
}
```

#### 処理フロー

##### 2-1. Kintone担保情報の取得

```typescript
// Kintoneから担保情報テーブルを取得
const collaterals = await fetchCollateralInfo(recordId);

// データ構造:
collaterals = [{
  会社名_第三債務者_担保: "株式会社A工業",
  請求額: 2100000,
  入金予定日: "2025-09-30",
  過去の入金_先々月: 2000000,
  過去の入金_先月: 2050000,
  過去の入金_今月: 2100000,
  平均: 2050000,
}]
```

##### 2-2. AI分析でOCRテキストから取引抽出

**設計方針**: 
- ✅ **全取引を抽出**: Google Visionで通帳の全テキストを抽出（資金移動検出に必須）
- ✅ **AI照合で優先度判定**: 担保情報との一致度でスコアリング
- ✅ **複雑なパターンも対応**: 合算入金・分割入金・部分一致も自動検出
- ❌ **マーカー検出は不要**: 全取引から照合すれば特定の取引を優先できる

```typescript
// Claude/GPTで取引情報を構造化
const analysisPrompt = `
この通帳のOCRテキストから、全ての取引を抽出してください。

【OCRテキスト】
${mainBankDocuments[0].text}

【期待される入金企業（Kintone担保情報）】
${collaterals.map(c => `- ${c.会社名_第三債務者_担保}: 約¥${c.平均.toLocaleString()}`).join('\n')}

【抽出ルール】
1. 全ての取引を抽出（入金・出金両方）
2. 日付、金額、振込元/振込先名を正確に読み取る
3. 企業名の表記ゆれに注意（例: (カ)Aコウギョウ = 株式会社A工業）
4. 残高も可能であれば抽出

JSON形式で出力:
{
  "transactions": [
    {
      "date": "2025-09-15",
      "amount": 2000000,  // プラス=入金、マイナス=出金
      "payer": "カ)Aコウギョウ",
      "description": "振込",
      "balance": 5000000
    }
  ]
}
`;

const result = await generateObject({
  model: anthropic("claude-3-5-sonnet-20241022"),
  prompt: analysisPrompt,
  schema: z.object({
    transactions: z.array(z.object({
      date: z.string(),
      amount: z.number(),
      payer: z.string(),
      description: z.string().optional(),
    })),
  }),
});
```

##### 2-3. 担保情報との照合（合算・分割パターン対応）

```typescript
// 企業名の正規化関数
function normalizeCompanyName(name: string): string {
  return name
    .replace(/株式会社|（株）|\(株\)|カ\)|カブシキガイシャ/gi, '')
    .replace(/\s/g, '')
    .toLowerCase();
}

// 照合ロジック（3段階）
const matches = [];
const unmatchedTransactions = [...extractedTransactions];
const unmatchedCollaterals = [...collaterals];

// 【Step 1】1対1の完全一致を優先
for (const transaction of [...unmatchedTransactions]) {
  for (const collateral of [...unmatchedCollaterals]) {
    const normalizedPayer = normalizeCompanyName(transaction.payer);
    const normalizedCompany = normalizeCompanyName(collateral.会社名_第三債務者_担保);
    
    const nameMatches = normalizedPayer.includes(normalizedCompany) || 
                        normalizedCompany.includes(normalizedPayer);
    const amountMatches = Math.abs(transaction.amount - collateral.平均) < 1000;  // 誤差1000円以内
    
    if (nameMatches && amountMatches) {
      matches.push({
        type: "完全一致",
        company: collateral.会社名_第三債務者_担保,
        expectedAmount: collateral.平均,
        actualTransactions: [transaction],
        actualAmount: transaction.amount,
        date: transaction.date,
      });
      // マッチしたものを除外
      unmatchedTransactions.splice(unmatchedTransactions.indexOf(transaction), 1);
      unmatchedCollaterals.splice(unmatchedCollaterals.indexOf(collateral), 1);
    }
  }
}

// 【Step 2】分割入金の検出（1つの期待値 = 複数の取引）
for (const collateral of [...unmatchedCollaterals]) {
  const normalizedCompany = normalizeCompanyName(collateral.会社名_第三債務者_担保);
  
  // 同じ企業名で7日以内の取引を探す
  const candidateTransactions = unmatchedTransactions.filter(t => {
    const normalizedPayer = normalizeCompanyName(t.payer);
    return normalizedPayer.includes(normalizedCompany) || normalizedCompany.includes(normalizedPayer);
  });
  
  // 2件の合算を試行
  for (let i = 0; i < candidateTransactions.length; i++) {
    for (let j = i + 1; j < candidateTransactions.length; j++) {
      const sum = candidateTransactions[i].amount + candidateTransactions[j].amount;
      if (Math.abs(sum - collateral.平均) < 1000) {
        matches.push({
          type: "分割入金（2件合算）",
          company: collateral.会社名_第三債務者_担保,
          expectedAmount: collateral.平均,
          actualTransactions: [candidateTransactions[i], candidateTransactions[j]],
          actualAmount: sum,
          date: `${candidateTransactions[i].date} ～ ${candidateTransactions[j].date}`,
        });
        // マッチしたものを除外
        unmatchedTransactions.splice(unmatchedTransactions.indexOf(candidateTransactions[i]), 1);
        unmatchedTransactions.splice(unmatchedTransactions.indexOf(candidateTransactions[j]), 1);
        unmatchedCollaterals.splice(unmatchedCollaterals.indexOf(collateral), 1);
        break;
      }
    }
  }
}

// 【Step 3】部分一致（金額のみ一致、企業名不一致）
for (const transaction of [...unmatchedTransactions]) {
  for (const collateral of [...unmatchedCollaterals]) {
    const amountMatches = Math.abs(transaction.amount - collateral.平均) < 1000;
    
    if (amountMatches) {
      matches.push({
        type: "部分一致（金額のみ）",
        company: collateral.会社名_第三債務者_担保,
        expectedAmount: collateral.平均,
        actualTransactions: [transaction],
        actualAmount: transaction.amount,
        date: transaction.date,
        warning: `企業名不一致: "${transaction.payer}"`,
      });
      unmatchedTransactions.splice(unmatchedTransactions.indexOf(transaction), 1);
      unmatchedCollaterals.splice(unmatchedCollaterals.indexOf(collateral), 1);
    }
  }
}

// 入金率計算
const totalExpected = collaterals.reduce((sum, c) => sum + c.平均, 0);
const totalActual = matches.reduce((sum, m) => sum + m.actualAmount, 0);
const depositRate = (totalActual / totalExpected) * 100;
```

##### 2-4. リスク検出（ギャンブル・大口・資金移動）

```typescript
// ギャンブルキーワードリスト
const gamblingKeywords = [
  'パチンコ', 'スロット', 'PACHINKO', 'SLOT',
  '競馬', '競輪', '競艇', 'KEIBA',
  'カジノ', 'CASINO',
];

// ギャンブル検出
const gamblingTransactions = extractedTransactions.filter(t => 
  gamblingKeywords.some(keyword => 
    t.payer.includes(keyword) || t.description?.includes(keyword)
  )
);

// 大口出金検出（50万円以上）
const largeCashWithdrawals = extractedTransactions
  .filter(t => t.amount < 0 && Math.abs(t.amount) >= 500000)
  .map(t => ({
    date: t.date,
    amount: Math.abs(t.amount),
    description: t.description,
  }));

// 資金移動検出（同日の入出金）
const fundTransfers = [];
for (const inbound of extractedTransactions.filter(t => t.amount > 0)) {
  const outbound = extractedTransactions.find(t => 
    t.date === inbound.date && 
    Math.abs(t.amount + inbound.amount) < 100 // 同額または近似
  );
  if (outbound) {
    fundTransfers.push({
      date: inbound.date,
      amount: inbound.amount,
      from: inbound.payer,
      to: outbound.payer,
    });
  }
}
```

#### 出力

```typescript
{
  success: boolean,
  collateralMatching: {
    totalExpectedAmount: number,
    totalActualAmount: number,
    depositRate: number,  // %
    matches: [{
      company: string,
      expectedAmount: number,
      actualAmount: number,
      date: string,
      status: "完全一致" | "部分一致" | "不一致",
    }],
    unmatchedCompanies: string[],  // 入金がない企業
  },
  riskDetection: {
    gambling: [{
      date: string,
      amount: number,
      destination: string,
    }],
    largeCashWithdrawals: [{
      date: string,
      amount: number,
      description: string,
    }],
    fundTransfers: [{
      date: string,
      amount: number,
      from: string,
      to: string,
    }],
  },
  extractedTransactions: [...],  // 全取引データ
}
```

#### ログ出力

```
━━━ メイン通帳分析 ━━━

【担保情報との照合】
  入金率: 95.2%
  
  企業別照合:
    ✓ 株式会社A工業
       期待値: ¥2,050,000 (平均)
       実際: ¥2,000,000
       状態: 部分一致
    
    ✓ 株式会社B建設
       期待値: ¥2,027,740 (平均)
       実際: ¥2,027,740
       状態: 完全一致
    
    ✗ 株式会社C商事
       期待値: ¥1,500,000 (平均)
       実際: 入金なし ⚠️

【リスク検出】
  ギャンブル: 1件
    - 2025-09-20: -¥50,000 (パチンコXXX)
  
  大口出金: 2件
    - 2025-09-25: -¥1,000,000 (現金引き出し)
    - 2025-09-28: -¥800,000 (現金引き出し)
  
  資金移動: 1件
    - 2025-09-10: ¥500,000 (A工業 → 引き出し)
```

---

### Step 3: サブ通帳分析

#### 入力

```typescript
{
  subBankDocuments: [...],  // OCR結果
}
```

#### 処理フロー

サブ通帳は個人口座なので、担保情報との照合は不要。
リスク検出のみ実施。

```typescript
// メイン通帳のStep 2-4と同じロジック
const subBankAnalysis = {
  gambling: detectGambling(subBankTransactions),
  largeCashWithdrawals: detectLargeCash(subBankTransactions),
};
```

#### ログ出力

```
━━━ サブ通帳分析 ━━━

【リスク検出】
  ギャンブル: 0件
  
  大口出金: 1件
    - 2025-09-15: -¥600,000 (現金引き出し)
```

---

### Step 4: 通帳間資金移動照合

#### 入力

```typescript
{
  mainBankTransactions: [...],
  subBankTransactions: [...],
}
```

#### 処理フロー

```typescript
function detectCrossBankTransfers(mainTransactions, subTransactions) {
  const crossTransfers = [];
  
  // メイン → サブ
  for (const mainOut of mainTransactions.filter(t => t.amount < 0)) {
    const subIn = subTransactions.find(t => 
      Math.abs(t.date - mainOut.date) <= 1 &&  // 前後1日
      Math.abs(t.amount - Math.abs(mainOut.amount)) < 1000  // 金額が近似
    );
    
    if (subIn) {
      crossTransfers.push({
        date: mainOut.date,
        amount: Math.abs(mainOut.amount),
        from: "メイン",
        to: "サブ",
        mainEntry: mainOut,
        subEntry: subIn,
      });
    }
  }
  
  // サブ → メイン（同様のロジック）
  // ...
  
  return crossTransfers;
}
```

#### ログ出力

```
━━━ 通帳間資金移動 ━━━

  メイン → サブ: 2件
    - 2025-09-10: ¥300,000
    - 2025-09-20: ¥500,000
  
  サブ → メイン: 1件
    - 2025-09-25: ¥200,000
```

---

### Step 5: 他社ファクタリング業者検出

#### 入力

```typescript
{
  mainBankTransactions: [...],
  subBankTransactions: [...],
  factoringCompanyList: string[],  // 他社リスト
}
```

#### ファクタリング業者リスト

```typescript
const factoringCompanies = [
  // 大手
  "ビートレーディング", "BUY TRADING", "ビーティー",
  "アクセルファクター", "ACCEL FACTOR",
  "三共サービス", "SANKYO SERVICE",
  "OLTA", "オルタ",
  "ペイトナー", "PAYTONAR",
  
  // 中堅
  "日本中小企業金融サポート機構",
  "ベストファクター",
  "トラストゲートウェイ",
  "QuQuMo", "ククモ",
  "labol", "ラボル",
  
  // その他
  "GMO", "ジーエムオー",
  "エスコム",
  "えんナビ",
  // ... 100社以上
];
```

#### 処理フロー

```typescript
function detectFactoringCompanies(transactions, factoringList) {
  const detected = [];
  
  for (const transaction of transactions) {
    for (const company of factoringList) {
      const normalizedPayer = transaction.payer.replace(/\s/g, '').toLowerCase();
      const normalizedCompany = company.replace(/\s/g, '').toLowerCase();
      
      if (normalizedPayer.includes(normalizedCompany)) {
        detected.push({
          companyName: company,
          date: transaction.date,
          amount: transaction.amount,
          transactionType: transaction.amount > 0 ? "入金" : "出金",
          description: transaction.description,
        });
      }
    }
  }
  
  return detected;
}
```

#### ログ出力

```
━━━ 他社ファクタリング検出 ━━━

  ⚠️ 検出: 2件
    - 2025-09-05: +¥1,500,000 (ビートレーディング) 入金
    - 2025-09-12: -¥50,000 (OLTA) 出金
```

---

## ツール設計

### 選択肢1: 既存ツールを活用

Phase 1と同様に、既存の`ocrBankStatementTool`と`ocrPersonalBankTool`を活用する。

**メリット**:
- ✅ 既に実装済み
- ✅ マーク検出などの高度な機能あり

**デメリット**:
- ❌ 出力形式が少し複雑
- ❌ 一部カスタマイズが必要

### 選択肢2: 新規ツール作成

新たに`bankStatementOcrTool`を作成する。

**メリット**:
- ✅ Phase 1との統一感
- ✅ シンプルな出力

**デメリット**:
- ❌ 実装コストがかかる

### 推奨: ハイブリッドアプローチ

```typescript
// Step 1: 新規OCRツール（Google Vision API直接呼び出し）
const ocrTool = new GoogleVisionBankOcrTool();

// Step 2-5: ワークフローステップ内で直接AI分析
// generateObjectでClaude/GPTを直接呼ぶ
```

---

## データ構造定義

### Kintone担保情報

```typescript
interface CollateralInfo {
  会社名_第三債務者_担保: string;
  請求額: number;
  入金予定日: string;
  過去の入金_先々月: number;
  過去の入金_先月: number;
  過去の入金_今月: number;
  平均: number;
}
```

### 取引データ

```typescript
interface BankTransaction {
  date: string;           // YYYY-MM-DD
  amount: number;         // プラス=入金、マイナス=出金
  payer: string;          // 振込元/振込先
  description?: string;   // 摘要
  balance?: number;       // 残高
}
```

### 照合結果

```typescript
interface CollateralMatch {
  company: string;
  expectedAmount: number;
  actualAmount: number;
  date: string;
  status: "完全一致" | "部分一致" | "不一致";
}
```

### リスク検出結果

```typescript
interface RiskDetection {
  gambling: Array<{
    date: string;
    amount: number;
    destination: string;
  }>;
  largeCashWithdrawals: Array<{
    date: string;
    amount: number;
    description: string;
  }>;
  fundTransfers: Array<{
    date: string;
    amount: number;
    from: string;
    to: string;
  }>;
}
```

---

## 実装順序

### フェーズ1: OCR処理（1日）

1. ✅ Google Vision OCRツールの作成/既存ツール活用
2. ✅ Kintoneファイル取得ロジック
3. ✅ ログ出力の実装

### フェーズ2: メイン通帳分析（2日）

1. ✅ Kintone担保情報取得
2. ✅ AI分析で取引抽出
3. ✅ 照合ロジック実装
4. ✅ 入金率計算
5. ✅ リスク検出ロジック

### フェーズ3: サブ通帳分析（0.5日）

1. ✅ メイン通帳と同じリスク検出ロジックを適用

### フェーズ4: 統合分析（1日）

1. ✅ 通帳間資金移動検出
2. ✅ 他社ファクタリング業者検出
3. ✅ 結果統合・サマリー生成

### フェーズ5: テスト・調整（1日）

1. ✅ 実データでのテスト
2. ✅ ログ出力の調整
3. ✅ エラーハンドリング強化

**合計: 約5.5日**

---

## テストケース

### テストデータ: recordId "9918"

#### 期待される結果

```json
{
  "recordId": "9918",
  "結果サマリー": {
    "メイン通帳": {
      "入金照合": {
        "入金率": 95.2,
        "一致企業数": 2,
        "不一致企業数": 1
      },
      "リスク検出": {
        "ギャンブル": 1,
        "大口出金": 2,
        "資金移動": 1
      }
    },
    "サブ通帳": {
      "リスク検出": {
        "ギャンブル": 0,
        "大口出金": 1
      }
    },
    "通帳間資金移動": 2,
    "他社ファクタリング": 1
  }
}
```

### エッジケース

1. **通帳ファイルがない場合**
   - メイン通帳なし → エラー
   - サブ通帳なし → スキップ（警告ログ）

2. **担保情報がない場合**
   - 入金照合スキップ
   - リスク検出のみ実施

3. **OCRで取引が抽出できない場合**
   - 警告ログ
   - 空の結果を返す

4. **企業名の表記ゆれ**
   - 正規化関数で対応
   - 部分一致も考慮

---

## まとめ

Phase 2は、Phase 1の設計パターンを踏襲しつつ、より複雑な分析ロジックを実装する。

**重要ポイント**:
- ✅ エージェントレス設計
- ✅ プログラマティックなツール実行
- ✅ AI分析はgenerateObjectで直接呼ぶ
- ✅ シンプルで判断しやすいログ
- ✅ 2層の出力（人間用 + プログラム用）

この計画に従って実装を進める。

