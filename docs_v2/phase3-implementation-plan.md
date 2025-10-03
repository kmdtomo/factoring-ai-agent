# Phase 3: 本人確認・企業実在性確認ステップ - 実装計画書

最終更新: 2025-10-02

---

## 📋 目次

1. [実装概要](#実装概要)
2. [ステップごとの詳細設計](#ステップごとの詳細設計)
3. [既存ツールの活用](#既存ツールの活用)
4. [実装順序](#実装順序)
5. [テストケース](#テストケース)

---

## 実装概要

### 目標

申込者と企業の実在性・信頼性を確認し、人的リスクを検出する。

**重要**: Phase 3は**既存ツール100%活用**で実装できる。新規ツール作成は不要。

### 設計方針（Phase 1と同じ）

```
❌ AIエージェントを使わない
✅ ワークフローステップ内でツールを直接実行
✅ 構造化データを変数として渡す
✅ シンプルで判断しやすいログ
✅ 2層の出力（人間用 + プログラム用）
```

### 処理時間・コスト

- **処理時間**: 約10-15秒（Web検索含む）
- **コスト**: 約$0.020-0.030
- **状態**: 🔮 将来実装（Phase 2完了後）

---

## ステップごとの詳細設計

### 全体フロー

```
入力: { recordId, phase1Results, phase2Results }
  ↓
Step 1: 本人確認書類OCR + 照合
  ↓
Step 2: 申込者のエゴサーチ
  ↓
Step 3: 企業実在性確認（並列実行）
  ├─ 申込企業
  ├─ 買取企業（複数）
  └─ 担保企業（複数）
  ↓
Step 4: 代表者リスク検索（並列実行）
  ├─ 買取企業代表者（複数）
  └─ 担保企業代表者（複数）
  ↓
出力: { 結果サマリー, phase3Results }
```

---

### Step 1: 本人確認書類OCR + 照合

#### 使用ツール

`ocrIdentityToolV2`

#### 入力

```typescript
{
  recordId: string,  // Kintoneから自動取得
}
```

#### 処理フロー

```typescript
const identityResult = await ocrIdentityToolV2.execute!({
  context: { recordId },
  runtimeContext: new RuntimeContext(),
});

// ツールが自動で以下を実行:
// 1. Kintoneから「顧客情報＿添付ファイル」を取得
// 2. Kintoneから「代表者名」「生年月日」「住所」を取得
// 3. マルチモーダルLLM（Claude/GPT-4o Vision）で画像を分析
//    ※ Google Vision単体では免許証の「色」判定は困難
// 4. 抽出情報とKintone情報を照合
// 5. 免許証の色・違反回数を確認
```

#### 出力

```typescript
{
  success: boolean,
  processingDetails: {
    recordId: string,
    expectedName: string,       // Kintoneから取得した期待値
    expectedBirthDate: string,
    expectedAddress: string,
    filesFound: number,
  },
  extractedInfo: {
    name: string,               // OCRで抽出した情報
    birthDate: string,
    address: string,
  },
  documentType: "運転免許証" | "パスポート" | "マイナンバーカード",
  licenseInfo: {
    licenseColor: "gold" | "blue" | "green" | "unknown",
    expiryDate: string,
    violations: number,         // 違反回数
  },
  processedFiles: string[],
  summary: string,              // 人間向けサマリー
}
```

#### 照合ロジック

ツール内部で自動実行される照合ロジック：

```typescript
// 名前の正規化
function normalizeName(name: string): string {
  return name
    .replace(/\s+/g, '')          // スペース削除
    .replace(/[　]/g, '')         // 全角スペース削除
    .toLowerCase();
}

// 照合判定
const nameMatch = normalizeName(extractedName) === normalizeName(expectedName) 
  ? "match" : "mismatch";

const birthDateMatch = extractedBirthDate === expectedBirthDate 
  ? "match" : "mismatch";

// 住所は部分一致も考慮
const addressMatch = 
  extractedAddress.includes(expectedAddress) || expectedAddress.includes(extractedAddress)
    ? "match" : "mismatch";
```

#### ログ出力

```
━━━ 本人確認 ━━━

【書類OCR】
  書類タイプ: 運転免許証
  処理ファイル数: 1

【抽出情報】
  氏名: 山田太郎
  生年月日: 1985-04-15
  住所: 東京都新宿区西新宿1-1-1

【Kintone照合】
  ✓ 氏名: 一致
  ✓ 生年月日: 一致
  ✓ 住所: 一致

【免許証情報】
  色: ゴールド免許
  有効期限: 2028-04-15
  違反回数: 0回
```

---

### Step 2: 申込者のエゴサーチ

#### 使用ツール

`egoSearchTool`

#### 入力

```typescript
{
  recordId: string,  // または
  name?: string,
  birthDate?: string,
}
```

#### 処理フロー

```typescript
const applicantEgoSearch = await egoSearchTool.execute!({
  context: { recordId },  // recordIdから代表者名を自動取得
  runtimeContext: new RuntimeContext(),
});

// ツールが自動で以下を実行:
// 1. Kintoneから「代表者名」「生年月日」を取得
// 2. 詐欺情報サイト（eradicationofblackmoney等）で検索
// 3. Google検索で「[名前] 詐欺」「[名前] 逮捕」等を検索
// 4. 検索結果に実際に名前が含まれているか確認
```

#### 詐欺情報サイト

```typescript
const fraudSites = [
  {
    name: "eradicationofblackmoney",
    url: "https://eradicationofblackmoneyscammers.com/",
    searchUrl: (name) => `https://eradicationofblackmoneyscammers.com/?s=${encodeURIComponent(name)}`,
  },
  // 将来的に追加可能
];
```

#### ネガティブ検索キーワード

```typescript
const negativeQueries = [
  `${name} 詐欺`,
  `${name} 逮捕`,
  `${name} 容疑`,
  `${name} 被害`,
];
```

#### 出力

```typescript
{
  fraudSiteResults: [{
    siteName: "eradicationofblackmoney",
    url: string,
    found: boolean,
    details: string,
  }],
  negativeSearchResults: [{
    query: "山田太郎 詐欺",
    found: boolean,
    results: [{
      title: string,
      url: string,
      snippet: string,
    }],
  }],
  summary: {
    hasNegativeInfo: boolean,
    fraudHits: number,
    details: string,
  },
}
```

#### ログ出力

```
━━━ 申込者エゴサーチ ━━━

対象: 山田太郎（生年月日: 1985-04-15）

【詐欺情報サイト】
  ✓ eradicationofblackmoney: 該当なし

【Web検索】
  ✓ "山田太郎 詐欺": 該当なし
  ✓ "山田太郎 逮捕": 該当なし
  ✓ "山田太郎 容疑": 該当なし
  ✓ "山田太郎 被害": 該当なし

【判定】
  ネガティブ情報: なし ✓
```

**ネガティブ情報検出時の例**:

```
━━━ 申込者エゴサーチ ━━━

対象: 田中一郎（生年月日: 1980-01-01）

【詐欺情報サイト】
  ⚠️ eradicationofblackmoney: 該当あり
     詳細: 田中一郎に関する情報が見つかりました

【Web検索】
  ⚠️ "田中一郎 詐欺": 2件検出
     1. 詐欺容疑で逮捕 - ニュースサイト
        https://example.com/news/...
     2. 被害者の会 - 掲示板
        https://example.com/forum/...

【判定】
  ⚠️ ネガティブ情報: あり（要確認）
     詐欺情報サイト: 1件
     Web検索: 2件
```

---

### Step 3: 企業実在性確認

#### 使用ツール

`companyVerifyTool`

#### 入力

```typescript
{
  companyName: string,
  location?: string,            // 所在地（検索精度向上用）
  registryInfo?: {
    capital: string,            // 資本金
    established: string,        // 設立年月日
    representative: string,     // 代表者名
  },
}
```

#### 処理フロー

```typescript
// 3種類の企業を並列で検証

// 1. 申込企業
const applicantCompany = await companyVerifyTool.execute!({
  context: {
    companyName: phase1Results.purchaseVerification.purchaseInfo.applicantCompany,
    location: "...",  // Kintoneから取得
  },
  runtimeContext: new RuntimeContext(),
});

// 2. 買取企業（複数）
const purchaseCompanies = phase1Results.purchaseVerification.purchaseInfo.debtorCompanies;
const purchaseCompanyResults = await Promise.all(
  purchaseCompanies.map((company) =>
    companyVerifyTool.execute!({
      context: { 
        companyName: company.name,
        location: "建設業",  // 業種で検索精度向上
      },
      runtimeContext: new RuntimeContext(),
    })
  )
);

// 3. 担保企業（複数）
const collateralCompanies = phase1Results.collateralVerification.collateralInfo.companies;
const collateralCompanyResults = await Promise.all(
  collateralCompanies.map((company) =>
    companyVerifyTool.execute!({
      context: {
        companyName: company.name,
        location: company.location,
        registryInfo: {
          capital: company.capital?.toString(),
          established: company.establishedDate,
          representative: company.representatives?.[0],
        },
      },
      runtimeContext: new RuntimeContext(),
    })
  )
);
```

#### 検索クエリの構築

ツール内部で以下のクエリを自動生成：

```typescript
const queries = [
  companyName,                        // "株式会社ABC"
  `${companyName} 建設業`,             // "株式会社ABC 建設業"
  `${companyName} 建設`,               // "株式会社ABC 建設"
];

if (location) {
  queries.push(`${companyName} ${location}`);  // "株式会社ABC 東京"
}
```

#### 公式サイトの検出

```typescript
function isOfficialWebsite(searchResult, companyName) {
  const url = searchResult.url.toLowerCase();
  const title = searchResult.title.toLowerCase();
  const normalizedName = companyName.replace(/株式会社|（株）/g, '').toLowerCase();
  
  // URLやタイトルに企業名が含まれているか
  return url.includes(normalizedName) || title.includes(normalizedName);
}
```

#### 出力

```typescript
{
  verified: boolean,              // 実在性確認できたか
  confidence: number,             // 信頼度 0-100
  webPresence: {
    hasWebsite: boolean,          // 公式サイトがあるか
    websiteUrl: string,
    companyDetails: {
      businessDescription: string,
      capital: string,
      employees: string,
      revenue: string,
      established: string,
    },
  },
  searchResults: [{
    title: string,
    url: string,
    snippet: string,
    relevance: number,
  }],
  riskFactors: string[],          // リスク要因（例: "公式サイトなし"）
}
```

#### ログ出力

```
━━━ 企業実在性確認 ━━━

【申込企業】
  ✓ 株式会社ABC建設: 実在確認
     公式サイト: https://abc-kensetsu.co.jp
     信頼度: 95%
     事業内容: 総合建設業

【買取企業】
  ✓ 株式会社A工業: 実在確認
     公式サイト: https://a-kogyo.co.jp
     信頼度: 90%
     資本金: 1,000万円
  
  ⚠️ 株式会社B建設: 公式サイトなし
     信頼度: 60%
     検索結果: 3件（業界サイト等）
     リスク要因: 公式サイトなし

【担保企業】
  ✓ 株式会社C商事: 実在確認
     公式サイト: https://c-shoji.co.jp
     信頼度: 85%
     設立: 2010年
```

---

### Step 4: 代表者リスク検索

#### 使用ツール

`egoSearchTool`（Step 2と同じツール）

#### 処理フロー

```typescript
// 買取企業・担保企業の代表者情報を収集
const representatives = [];

// 買取企業の代表者（Phase 1の結果から取得は難しいため、企業検索結果から取得）
for (const result of purchaseCompanyResults) {
  if (result.webPresence?.companyDetails?.representative) {
    representatives.push({
      name: result.webPresence.companyDetails.representative,
      company: result.companyName,
      type: "買取企業",
    });
  }
}

// 担保企業の代表者（Phase 1の担保検証結果から取得）
for (const company of phase1Results.collateralVerification.collateralInfo.companies) {
  if (company.representatives?.length > 0) {
    representatives.push({
      name: company.representatives[0],
      company: company.name,
      type: "担保企業",
    });
  }
}

// 並列でエゴサーチ実行
const representativeEgoSearches = await Promise.all(
  representatives.map((rep) =>
    egoSearchTool.execute!({
      context: { name: rep.name },
      runtimeContext: new RuntimeContext(),
    })
    .then(result => ({ ...result, ...rep }))
  )
);
```

#### ログ出力

```
━━━ 代表者リスク検索 ━━━

【買取企業代表者】
  ✓ 佐藤一郎（株式会社A工業）
     詐欺情報サイト: 該当なし
     Web検索: ネガティブ情報なし
  
  ✓ 鈴木二郎（株式会社B建設）
     詐欺情報サイト: 該当なし
     Web検索: ネガティブ情報なし

【担保企業代表者】
  ✓ 田中三郎（株式会社C商事）
     詐欺情報サイト: 該当なし
     Web検索: ネガティブ情報なし

【判定】
  代表者リスク: なし ✓
```

**リスク検出時の例**:

```
━━━ 代表者リスク検索 ━━━

【買取企業代表者】
  ⚠️ 山田太郎（株式会社XYZ）
     詐欺情報サイト: 1件検出
     Web検索: "山田太郎 詐欺" - 3件検出
     詳細: 過去に詐欺容疑で調査された記録あり

【判定】
  ⚠️ 代表者リスク: あり（要確認）
     リスク検出: 1社/3社
```

---

## 実装順序

### フェーズ1: 本人確認（1日）

1. ✅ `ocrIdentityToolV2`の動作確認
2. ✅ ワークフローステップでの統合
3. ✅ ログ出力の実装

### フェーズ2: エゴサーチ（0.5日）

1. ✅ `egoSearchTool`の動作確認
2. ✅ 申込者のエゴサーチ実装
3. ✅ ログ出力の実装

### フェーズ3: 企業実在性確認（1日）

1. ✅ `companyVerifyTool`の動作確認
2. ✅ 3種類の企業（申込・買取・担保）の並列検索実装
3. ✅ Phase 1の結果からの企業情報抽出
4. ✅ ログ出力の実装

### フェーズ4: 代表者リスク検索（0.5日）

1. ✅ 代表者情報の収集ロジック
2. ✅ 並列エゴサーチ実装
3. ✅ ログ出力の実装

### フェーズ5: 統合・テスト（1日）

1. ✅ 全体の統合
2. ✅ エラーハンドリング強化
3. ✅ 実データでのテスト
4. ✅ 結果サマリーの生成

**合計: 約4日**

---

## テストケース

### テストデータ: recordId "9918"

#### 期待される結果

```json
{
  "recordId": "9918",
  "結果サマリー": {
    "本人確認": {
      "書類タイプ": "運転免許証",
      "照合結果": "全て一致",
      "免許証の色": "ゴールド",
      "違反回数": 0
    },
    "申込者エゴサーチ": {
      "ネガティブ情報": false,
      "詐欺情報サイト": 0,
      "Web検索": 0
    },
    "企業実在性": {
      "申込企業": {
        "確認": true,
        "公式サイト": "https://..."
      },
      "買取企業": {
        "確認済み": 2,
        "未確認": 0
      },
      "担保企業": {
        "確認済み": 0,
        "未確認": 0,
        "備考": "担保謄本ファイルなし"
      }
    },
    "代表者リスク": {
      "検索対象": 2,
      "リスク検出": 0
    }
  },
  "phase3Results": {
    "identityVerification": { ... },
    "applicantEgoSearch": { ... },
    "companyVerification": { ... },
    "representativeEgoSearches": [ ... ]
  }
}
```

### エッジケース

1. **本人確認書類がない場合**
   - エラー → Phase 3全体をスキップまたは警告

2. **企業が実在しない場合**
   - `verified: false`
   - `riskFactors: ["公式サイトなし", "検索結果少数"]`
   - ログに警告表示

3. **代表者情報が取得できない場合**
   - 代表者リスク検索をスキップ
   - ログに「代表者情報なし」と表示

4. **エゴサーチでネガティブ情報検出**
   - `hasNegativeInfo: true`
   - 詳細な検索結果を返す
   - ログに警告表示

---

## データ構造定義

### Phase 3 Results

```typescript
interface Phase3Results {
  identityVerification: {
    success: boolean;
    extractedInfo: {
      name: string;
      birthDate: string;
      address: string;
    };
    documentType: string;
    licenseInfo: {
      licenseColor: "gold" | "blue" | "green" | "unknown";
      expiryDate: string;
      violations: number;
    };
    summary: string;
  };
  
  applicantEgoSearch: {
    fraudSiteResults: Array<{
      siteName: string;
      found: boolean;
      details?: string;
    }>;
    negativeSearchResults: Array<{
      query: string;
      found: boolean;
      results?: Array<{
        title: string;
        url: string;
        snippet: string;
      }>;
    }>;
    summary: {
      hasNegativeInfo: boolean;
      fraudHits: number;
      details: string;
    };
  };
  
  companyVerification: {
    applicantCompany: CompanyVerificationResult;
    purchaseCompanies: CompanyVerificationResult[];
    collateralCompanies: CompanyVerificationResult[];
  };
  
  representativeEgoSearches: Array<{
    name: string;
    company: string;
    type: "買取企業" | "担保企業";
    egoSearchResult: EgoSearchResult;
  }>;
}

interface CompanyVerificationResult {
  verified: boolean;
  confidence: number;
  webPresence: {
    hasWebsite: boolean;
    websiteUrl?: string;
    companyDetails?: {
      businessDescription?: string;
      capital?: string;
      employees?: string;
      revenue?: string;
      established?: string;
    };
  };
  searchResults: Array<{
    title: string;
    url: string;
    snippet: string;
    relevance: number;
  }>;
  riskFactors: string[];
}
```

---

## まとめ

Phase 3は、**既存ツール100%活用**で実装できるため、新規ツール開発は不要。

**重要ポイント**:
- ✅ エージェントレス設計
- ✅ 既存ツール活用（`ocrIdentityToolV2`, `egoSearchTool`, `companyVerifyTool`）
- ✅ 並列実行でパフォーマンス最適化（企業検索・代表者検索）
- ✅ シンプルで判断しやすいログ
- ✅ 2層の出力（人間用 + プログラム用）

この計画に従って実装を進める。

