# ファクタリングAIシステム ワークフロー設計書

最終更新: 2025-10-02

---

## 📋 目次

1. [なぜこの設計にしたのか](#なぜこの設計にしたのか)
2. [全体アーキテクチャ](#全体アーキテクチャ)
3. [Phase 1: 買取・担保情報ステップ（実装済み）](#phase-1-買取担保情報ステップ実装済み)
4. [Phase 2: 通帳分析ステップ（計画中）](#phase-2-通帳分析ステップ計画中)
5. [Phase 3以降の展望](#phase-3以降の展望)
6. [技術的な学び](#技術的な学び)

---

## なぜこの設計にしたのか

### ❌ 従来の設計（失敗）

```
ワークフロー
  ├─ Phase 1 Agent（買取・担保情報エージェント）
  │   ├─ OCRツール実行
  │   ├─ 買取検証ツール実行  ← ❌ 7000文字の構造化データをAIがコピーできず無限ループ
  │   └─ 担保検証ツール実行
  │
  ├─ Phase 2 Agent（通帳分析エージェント）
  └─ Phase 3 Agent（最終分析エージェント）
```

**問題点**:
- **Mastraのエージェント（AI）が次のツール引数を生成する仕組み**
- OCRで7,000文字以上抽出 → AIが次のツール引数にこのデータをコピーしようとする
- AIモデルの制約で大量の構造化データを完全にコピーできない
- **結果: 無限ループまたは処理が終わらない**

### ✅ 新しい設計（成功）

```
ワークフロー
  ├─ Phase 1 Step（ワークフローステップ）
  │   ├─ OCRツールを直接実行（プログラマティック）
  │   ├─ 買取検証ツールを直接実行（変数として構造化データを渡す）
  │   └─ 担保検証ツールを直接実行（変数として構造化データを渡す）
  │
  ├─ Phase 2 Step
  └─ Phase 3 Step
```

**利点**:
- ✅ **AIを介さず、TypeScriptで直接ツールを呼ぶ**
- ✅ **大量データも変数として確実に渡せる**
- ✅ **処理フローがプログラマティックに制御できる**
- ✅ **デバッグしやすい**
- ✅ **高速（AI判断のオーバーヘッドなし）**
- ✅ **コスト削減（不要なAI呼び出しなし）**

### 🎯 設計方針

| 要素 | 従来（エージェント方式） | 新設計（ステップ方式） |
|------|-------------------|------------------|
| **ツール実行** | AIが判断して実行 | プログラムが直接実行 |
| **データ受け渡し** | AIがコピー生成 | 変数として直接渡す |
| **処理フロー** | AIが決定 | プログラムで明示的に制御 |
| **大量データ** | ❌ 無限ループ | ✅ 確実に処理 |
| **デバッグ** | ❌ 難しい | ✅ 簡単 |
| **実行速度** | ❌ 遅い | ✅ 速い |

---

## 全体アーキテクチャ

### システム構成図

```
Mastra Playground / API
        ↓
┌───────────────────────────────────────────────┐
│  fullComplianceWorkflow                       │
│  （メインワークフロー）                          │
└───────────────────────────────────────────────┘
        ↓
┌───────────────────────────────────────────────┐
│  Phase 1 Step: 買取・担保情報処理               │ ✅ 実装済み
│  ├─ Google Vision OCR                        │
│  ├─ 買取検証（企業名・金額抽出）                │
│  └─ 担保検証（担保企業情報・関係性分析）        │
└───────────────────────────────────────────────┘
        ↓
┌───────────────────────────────────────────────┐
│  Phase 2 Step: 通帳分析                       │ 🔜 次の実装
│  ├─ Google Vision OCR（メイン・サブ通帳）      │
│  ├─ メイン通帳分析                            │
│  │  ├─ 担保情報との入金照合・入金率計算        │
│  │  ├─ 資金移動検出                           │
│  │  ├─ ギャンブル検出                         │
│  │  └─ 大口資金検出                           │
│  ├─ サブ通帳分析                              │
│  │  ├─ ギャンブル検出                         │
│  │  └─ 大口資金検出                           │
│  ├─ 通帳間資金移動照合                        │
│  └─ 他社ファクタリング業者検出                │
└───────────────────────────────────────────────┘
        ↓
┌───────────────────────────────────────────────┐
│  Phase 3 Step: 本人確認・企業実在性確認        │ 🔜 将来実装
│  ├─ 本人確認書類OCR + 照合                    │
│  │  ├─ Google Vision OCR （本人確認）                    │
│  │  ├─ 名前・生年月日・住所の照合              │
│  │  └─ 免許証の色・違反回数の確認              │
│  ├─ 申込者のエゴサーチ                        │
│  │  ├─ 詐欺情報サイト検索                     │
│  │  └─ 逮捕歴・容疑のWeb検索                  │
│  ├─ 企業実在性確認                            │
│  │  ├─ 申込企業のWeb検索                      │
│  │  ├─ 買取企業のWeb検索（複数社）              │
│  └─ 代表者リスク検索                          │
│     ├─ 買取企業代表者のエゴサーチ             │            │
└───────────────────────────────────────────────┘
        ↓
┌───────────────────────────────────────────────┐
│  Phase 4 Step: 最終分析・レポート生成          │ 🔮 将来実装
│  ├─ 全データ統合（Phase 1〜3の結果）          │
│  ├─ リスク評価                                │
│  │  ├─ 申込者属性リスク（年齢・事業形態）      │
│  │  ├─ 担保集中リスク（担保企業数・依存度）    │
│  │  ├─ 入金変動リスク（変動率・安定性）        │
│  │  ├─ 通帳リスク（ギャンブル・資金移動）      │
│  │  └─ 人的リスク（詐欺歴・逮捕歴）            │
│  ├─ 総合判定（承認/条件付き/再検討/却下）      │
│  └─ 構造化レポート生成                        │
└───────────────────────────────────────────────┘
```

### ディレクトリ構成

```
src/mastra/
├── workflows/
│   ├── phase1-purchase-collateral-step.ts        ✅ Step実装
│   ├── phase1-purchase-collateral-workflow.ts    ✅ Workflow定義
│   ├── phase2-bank-statement-step.ts             🔜 次の実装
│   ├── phase2-bank-statement-workflow.ts         🔜 次の実装
│   └── full-compliance-workflow.ts               🔮 統合ワークフロー
│
├── tools/
│   ├── google-vision-purchase-collateral-ocr-tool.ts  ✅ OCRツール
│   ├── purchase-verification-tool-minimal.ts          ✅ 買取検証ツール
│   ├── collateral-verification-tool.ts                ✅ 担保検証ツール
│   ├── ocr-bank-statement-tool.ts                     ✅ 通帳OCRツール
│   └── ... (他のツール)
│
└── agents/  (参考用・レガシー)
    └── phase1-purchase-collateral-agent.ts  ❌ 使わない（7000文字問題あり）
```

---

## Phase 1: 買取・担保情報ステップ（実装済み）

### 概要

**目的**: 買取請求書と担保謄本をOCR処理し、Kintoneデータと照合する

**処理時間**: 約17秒（14ページPDFの場合）

**コスト**: 約$0.055（約8円）

### データフロー

```
入力: { recordId: "9918" }
  ↓
┌─────────────────────────────────────────┐
│ Step 1: Google Vision OCR処理           │
│ ・Kintoneからファイル取得                 │
│ ・PDFからテキスト抽出                     │
│ ・ファイル名フィルタ: "請求"を含むもののみ  │
└─────────────────────────────────────────┘
  ↓
  purchaseDocuments: [{ fileName, text, pageCount, ... }]
  collateralDocuments: [{ fileName, text, pageCount, ... }]
  ↓
┌─────────────────────────────────────────┐
│ Step 2: 買取検証                         │
│ ・OCRテキスト → AI分析 → 企業名・金額抽出 │
│ ・Kintone買取情報テーブルと照合           │
└─────────────────────────────────────────┘
  ↓
  purchaseInfo: {
    totalAmount: 4027740,
    debtorCompanies: [
      { name: "株式会社A", amount: 2000000 },
      { name: "株式会社B", amount: 2027740 }
    ],
  }
  ↓
┌─────────────────────────────────────────┐
│ Step 3: 担保検証                         │
│ ・OCRテキスト → AI分析 → 担保企業情報抽出 │
│ ・Kintone担保情報テーブルと照合           │
│ ・買取企業との関係性分析                  │
└─────────────────────────────────────────┘
  ↓
出力: { 結果サマリー, phase1Results, summary }
```

### 実装の詳細

#### ファイル: `phase1-purchase-collateral-step.ts`

**1. OCR処理（ツールを直接実行）**

```typescript
const ocrResult = await googleVisionPurchaseCollateralOcrTool.execute!({
  context: {
    recordId,
    purchaseFieldName: "成因証書＿添付ファイル",
    collateralFieldName: "担保情報＿添付ファイル",
    maxPagesPerFile: 20,
  },
  runtimeContext: new RuntimeContext(),
});

// 結果:
// ocrResult.purchaseDocuments: [{ fileName, text, pageCount, ... }]
// ocrResult.collateralDocuments: [{ fileName, text, pageCount, ... }]
```

**2. 買取検証（構造化データを直接渡す）**

```typescript
const purchaseResult = await purchaseVerificationToolMinimal.execute!({
  context: {
    recordId,
    purchaseDocuments: ocrResult.purchaseDocuments, // ← 構造化データを変数として渡す
    model: "claude-3-5-sonnet-20241022",
  },
  runtimeContext: new RuntimeContext(),
});

// 結果:
// purchaseResult.purchaseInfo.debtorCompanies: [企業名と金額のリスト]
```

**3. 担保検証（構造化データを直接渡す）**

```typescript
const purchaseCompanyNames = purchaseResult.purchaseInfo.debtorCompanies.map(
  (company: any) => company.name
);

const collateralResult = await collateralVerificationTool.execute!({
  context: {
    recordId,
    collateralDocuments: ocrResult.collateralDocuments, // ← 構造化データを変数として渡す
    purchaseCompanies: purchaseCompanyNames,
    model: "claude-3-5-sonnet-20241022",
  },
  runtimeContext: new RuntimeContext(),
});

// 結果:
// collateralResult.relationshipAnalysis.matchedCompanies: [一致した企業]
// collateralResult.relationshipAnalysis.unmatchedPurchaseCompanies: [担保がない企業]
```

### ログ出力（人間が判断できる形式）

```
━━━ OCR抽出結果 ━━━

【買取請求書】
  📄 請求書・発注書.pdf (14ページ)
     先頭: "御請求書 株式会社〇〇御中 下記の通り御請求申し上げます..."

【担保謄本】 ⚠️ ファイルなし

━━━ 買取検証 ━━━

【OCRから抽出】
  申込者: 株式会社△△建設
  総債権額: ¥4,027,740
  第三債務者:
    1. 株式会社A工業 - ¥2,000,000
    2. 株式会社B建設 - ¥2,027,740

【Kintone照合】
  判定: 一致
  ✓ 企業名: OCR="株式会社A工業" / Kintone="株式会社A工業"
  ✓ 債権額: OCR="¥2,000,000" / Kintone="¥2,000,000"

━━━ 担保検証 ━━━

⚠️  担保謄本ファイルなし（検証スキップ）
```

### 出力結果（プレイグラウンドで表示）

```json
{
  "recordId": "9918",
  "結果サマリー": {
    "申込者企業": "株式会社△△建設",
    "総債権額": "¥4,027,740",
    "第三債務者": [
      { "企業名": "株式会社A工業", "債権額": "¥2,000,000", "支払期日": "2025-11-30" },
      { "企業名": "株式会社B建設", "債権額": "¥2,027,740", "支払期日": "なし" }
    ],
    "担保企業": "ファイルなし",
    "担保状況": {
      "一致企業": [],
      "担保なし": ["株式会社A工業", "株式会社B建設"]
    },
    "照合結果": {
      "買取検証": "一致",
      "担保検証": "分析不可"
    },
    "処理時間": "17.04秒",
    "コスト": "$0.0550"
  },
  "phase1Results": { ... }  // 詳細な生データ
}
```

### 重要なポイント

1. **エージェント不使用**: AIの判断を介さず、TypeScriptで直接ツールを呼ぶ
2. **構造化データの受け渡し**: 変数として直接渡すため、7000文字でも問題なし
3. **シンプルなログ**: 人間が判断できる最小限の情報のみ表示
4. **2層の出力**:
   - `結果サマリー`: 人間が見やすい形式
   - `phase1Results`: プログラムが使う生データ

---

## Phase 2: 通帳分析ステップ（計画中）

### 概要

**目的**: メイン通帳とサブ通帳をOCR処理し、リスク分析・照合を行う

### データフロー

```
入力: { recordId: "9918", phase1Results: {...} }
  ↓
┌─────────────────────────────────────────┐
│ Step 1: Google Vision OCR処理           │
│ ・メイン通帳（通帳_メイン_添付ファイル）  │
│ ・サブ通帳（通帳_その他_添付ファイル）    │
└─────────────────────────────────────────┘
  ↓
  mainBankDocuments: [{ fileName, text, pageCount, ... }]
  subBankDocuments: [{ fileName, text, pageCount, ... }]
  ↓
┌─────────────────────────────────────────┐
│ Step 2: メイン通帳分析                   │
│ ・担保情報テーブルとの入金照合           │
│ ・入金率計算                             │
│ ・資金移動検出                           │
│ ・ギャンブル検出                         │
│ ・大口資金検出                           │
└─────────────────────────────────────────┘
  ↓
  mainBankAnalysis: {
    collateralMatching: { depositRate, matches, ... },
    fundTransfers: [...],
    gamblingDetected: [...],
    largeCashWithdrawals: [...]
  }
  ↓
┌─────────────────────────────────────────┐
│ Step 3: サブ通帳分析                     │
│ ・ギャンブル検出                         │
│ ・大口資金検出                           │
└─────────────────────────────────────────┘
  ↓
  subBankAnalysis: {
    gamblingDetected: [...],
    largeCashWithdrawals: [...]
  }
  ↓
┌─────────────────────────────────────────┐
│ Step 4: 通帳間資金移動照合               │
│ ・メイン ⇄ サブ の資金移動を検出         │
└─────────────────────────────────────────┘
  ↓
  crossBankTransfers: [...]
  ↓
┌─────────────────────────────────────────┐
│ Step 5: 他社ファクタリング業者検出       │
│ ・リストに基づいて検出                   │
└─────────────────────────────────────────┘
  ↓
出力: { 結果サマリー, phase2Results, summary }
```

### 実装予定のツール

#### 1. **既存ツールを活用**

- ✅ `googleVisionOcrTool` (新規作成または既存拡張)
- ✅ `ocrBankStatementTool` (一部機能が既にある)
- ✅ `ocrPersonalBankTool` (一部機能が既にある)

#### 2. **新規作成が必要なツール**

- ❌ `bankTransferVerifyTool`: 通帳間資金移動検出
- ❌ `factoringCompanyDetectTool`: 他社ファクタリング業者検出
- ❌ `riskTransactionDetectTool`: ギャンブル・大口資金検出

**または**、ワークフローステップ内で直接AI分析を実行する方法も検討中。

### Kintoneデータ構造（担保情報テーブル）

```typescript
担保情報: [{
  会社名_第三債務者_担保: string,
  請求額: number,
  入金予定日: string,
  過去の入金_先々月: number,
  過去の入金_先月: number,
  過去の入金_今月: number,
  平均: number,
}]
```

### メイン通帳分析の詳細ロジック

#### 入金照合

```
OCRで抽出した入金取引:
  2025-09-15: ¥2,000,000 (振込元: カ)Aコウギョウ)

Kintone担保情報:
  企業名: 株式会社A工業
  請求額: ¥2,100,000
  過去の入金_今月: ¥2,000,000

→ 一致判定:
  ✓ 企業名一致（表記ゆれ考慮）
  ✓ 金額一致
  → 入金率 = 2,000,000 / 2,100,000 = 95.2%
```

#### ギャンブル検出

```typescript
キーワードリスト:
- "パチンコ", "スロット"
- "競馬", "競輪", "競艇"
- "カジノ"
- "宝くじ"

振込先検出例:
  2025-09-20: -¥50,000 (振込先: パチンコXXX)
  → ⚠️ ギャンブル検出
```

#### 大口資金検出

```typescript
閾値: ¥500,000

検出例:
  2025-09-25: -¥1,000,000 (引き出し: 現金)
  → ⚠️ 大口引き出し検出
```

### 期待される出力（Phase 2）

```json
{
  "recordId": "9918",
  "結果サマリー": {
    "メイン通帳": {
      "入金照合": {
        "入金率": 95.2,
        "一致企業数": 2,
        "不一致企業数": 0
      },
      "リスク検出": {
        "ギャンブル": 1,
        "大口出金": 2,
        "資金移動": 3
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
  },
  "phase2Results": { ... }
}
```

### ログ出力イメージ

```
━━━ メイン通帳分析 ━━━

【担保情報との照合】
  入金率: 95.2%
  
  企業別照合:
    ✓ 株式会社A工業: OCR=¥2,000,000 / 期待値=¥2,100,000
    ✓ 株式会社B建設: OCR=¥2,027,740 / 期待値=¥2,027,740

【リスク検出】
  ⚠️ ギャンブル: 1件
    - 2025-09-20: -¥50,000 (パチンコXXX)
  
  ⚠️ 大口出金: 2件
    - 2025-09-25: -¥1,000,000 (現金)
    - 2025-09-28: -¥800,000 (現金)

━━━ 通帳間資金移動 ━━━

  メイン → サブ: 2件
    - 2025-09-10: ¥300,000
    - 2025-09-20: ¥500,000

━━━ 他社ファクタリング検出 ━━━

  ⚠️ 検出: 1件
    - 2025-09-05: +¥1,500,000 (ビートレーディング)
```

---

## Phase 3: 本人確認・企業実在性確認ステップ（将来実装）

### 概要

**目的**: 申込者・企業の実在性と信頼性を確認し、人的リスクを検出する

**処理時間**: 約10-15秒（Web検索含む）

**コスト**: 約$0.02-0.03

### データフロー

```
入力: { recordId, phase1Results, phase2Results }
  ↓
┌─────────────────────────────────────────┐
│ Step 1: 本人確認書類OCR + 照合           │
│ ・Google Vision OCRで免許証等を処理      │
│ ・Kintone基本情報との照合               │
└─────────────────────────────────────────┘
  ↓
  identityVerification: {
    nameMatch: "match",
    birthDateMatch: "match",
    addressMatch: "match",
    licenseColor: "gold",
    violations: 0,
  }
  ↓
┌─────────────────────────────────────────┐
│ Step 2: 申込者のエゴサーチ               │
│ ・詐欺情報サイト検索                    │
│ ・Web検索（逮捕歴・詐欺歴）             │
└─────────────────────────────────────────┘
  ↓
  applicantEgoSearch: {
    fraudSiteHits: 0,
    arrestRecords: false,
    negativeInfo: false,
  }
  ↓
┌─────────────────────────────────────────┐
│ Step 3: 企業実在性確認                  │
│ ・申込企業のWeb検索                     │
│ ・買取企業のWeb検索（複数社）           │
│ ・担保企業のWeb検索（複数社）           │
└─────────────────────────────────────────┘
  ↓
  companyVerification: {
    applicantCompany: { exists: true, hasWebsite: true },
    purchaseCompanies: [
      { name: "株式会社A", exists: true, hasWebsite: true },
      { name: "株式会社B", exists: true, hasWebsite: false },
    ],
    collateralCompanies: [
      { name: "株式会社C", exists: true, hasWebsite: true },
    ],
  }
  ↓
┌─────────────────────────────────────────┐
│ Step 4: 代表者リスク検索                 │
│ ・買取企業代表者のエゴサーチ            │
│ ・担保企業代表者のエゴサーチ            │
└─────────────────────────────────────────┘
  ↓
出力: { 結果サマリー, phase3Results }
```

### 使用する既存ツール

#### 1. **ocrIdentityToolV2**
**機能**:
- 本人確認書類（運転免許証・パスポート・マイナンバーカード）のOCR
- Kintoneの基本情報（代表者名・生年月日・住所）との自動照合
- 免許証の色・違反回数の確認

**入力**:
```typescript
{
  recordId: string,  // Kintoneから自動取得
}
```

**出力**:
```typescript
{
  success: boolean,
  processingDetails: {
    expectedName: string,
    expectedBirthDate: string,
    expectedAddress: string,
  },
  extractedInfo: {
    name: string,
    birthDate: string,
    address: string,
  },
  documentType: "運転免許証" | "パスポート" | "マイナンバーカード",
  licenseInfo: {
    licenseColor: "gold" | "blue" | "green" | "unknown",
    expiryDate: string,
    violations: number,
  },
  summary: string,
}
```

#### 2. **egoSearchTool**
**機能**:
- 詐欺情報サイト（eradicationofblackmoney等）での検索
- Web検索（Google）で詐欺・逮捕・容疑・被害の情報を検索

**入力**:
```typescript
{
  recordId?: string,  // または
  name?: string,
  birthDate?: string,
}
```

**出力**:
```typescript
{
  fraudSiteResults: [{
    siteName: string,
    url: string,
    found: boolean,
    details: string,
  }],
  negativeSearchResults: [{
    query: string,  // 例: "山田太郎 詐欺"
    found: boolean,
    results: [{ title, url, snippet }],
  }],
  summary: {
    hasNegativeInfo: boolean,
    fraudHits: number,
    details: string,
  },
}
```

#### 3. **companyVerifyTool**
**機能**:
- 企業のWeb検索（Google）
- 公式サイトの検出
- 企業情報の抽出

**入力**:
```typescript
{
  companyName: string,
  location?: string,  // 検索精度向上用
  registryInfo?: {
    capital: string,
    established: string,
    representative: string,
  },
}
```

**出力**:
```typescript
{
  verified: boolean,
  confidence: number,  // 0-100
  webPresence: {
    hasWebsite: boolean,
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
  riskFactors: string[],
}
```

### 実装イメージ（phase3-verification-step.ts）

```typescript
export const phase3VerificationStep = createStep({
  id: "phase3-verification",
  execute: async ({ inputData }) => {
    const { recordId, phase1Results } = inputData;
    
    // Step 1: 本人確認書類OCR + 照合
    const identityResult = await ocrIdentityToolV2.execute!({
      context: { recordId },
      runtimeContext: new RuntimeContext(),
    });
    
    // Step 2: 申込者のエゴサーチ
    const applicantEgoSearch = await egoSearchTool.execute!({
      context: { recordId },  // recordIdから代表者名を自動取得
      runtimeContext: new RuntimeContext(),
    });
    
    // Step 3: 企業実在性確認
    // 申込企業
    const applicantCompany = await companyVerifyTool.execute!({
      context: {
        companyName: phase1Results.purchaseVerification.purchaseInfo.applicantCompany,
        location: "...",  // Kintoneから取得
      },
      runtimeContext: new RuntimeContext(),
    });
    
    // 買取企業（複数）
    const purchaseCompanyResults = await Promise.all(
      phase1Results.purchaseVerification.purchaseInfo.debtorCompanies.map(
        (company: any) => companyVerifyTool.execute!({
          context: { companyName: company.name },
          runtimeContext: new RuntimeContext(),
        })
      )
    );
    
    // 担保企業（複数）
    const collateralCompanyResults = await Promise.all(
      phase1Results.collateralVerification.collateralInfo.companies.map(
        (company: any) => companyVerifyTool.execute!({
          context: { 
            companyName: company.name,
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
    
    // Step 4: 代表者リスク検索
    // 買取企業代表者
    const purchaseRepEgoSearches = await Promise.all(
      phase1Results.collateralVerification.collateralInfo.companies
        .filter((c: any) => c.representatives?.length > 0)
        .map((company: any) => egoSearchTool.execute!({
          context: { name: company.representatives[0] },
          runtimeContext: new RuntimeContext(),
        }))
    );
    
    return {
      recordId,
      結果サマリー: {
        本人確認: identityResult.summary,
        申込者エゴサーチ: applicantEgoSearch.summary.details,
        企業実在性: {
          申込企業: applicantCompany.verified,
          買取企業: purchaseCompanyResults.filter(r => r.verified).length,
          担保企業: collateralCompanyResults.filter(r => r.verified).length,
        },
        代表者リスク: purchaseRepEgoSearches.filter(r => r.summary.hasNegativeInfo).length,
      },
      phase3Results: { ... },
    };
  },
});
```

### ログ出力イメージ

```
━━━ 本人確認 ━━━

【書類OCR】
  書類タイプ: 運転免許証
  免許証の色: ゴールド免許
  違反回数: 0回

【Kintone照合】
  ✓ 氏名: 一致
  ✓ 生年月日: 一致
  ✓ 住所: 一致

━━━ 申込者エゴサーチ ━━━

【詐欺情報サイト】
  ✓ eradicationofblackmoney: 該当なし

【Web検索】
  ✓ "山田太郎 詐欺": 該当なし
  ✓ "山田太郎 逮捕": 該当なし
  ✓ "山田太郎 容疑": 該当なし

━━━ 企業実在性確認 ━━━

【申込企業】
  ✓ 株式会社ABC: 実在確認
     公式サイト: https://abc.co.jp

【買取企業】
  ✓ 株式会社A工業: 実在確認
     公式サイト: https://a-kogyo.co.jp
  ⚠️ 株式会社B建設: 公式サイトなし（要確認）

【担保企業】
  ✓ 株式会社C商事: 実在確認
     公式サイト: https://c-shoji.co.jp

━━━ 代表者リスク検索 ━━━

【買取企業代表者】
  ✓ 佐藤一郎（株式会社A工業）: ネガティブ情報なし
  ✓ 鈴木二郎（株式会社B建設）: ネガティブ情報なし

【担保企業代表者】
  ✓ 田中三郎（株式会社C商事）: ネガティブ情報なし
```

---

## Phase 4: 最終分析・レポート生成ステップ（将来実装）

### 概要

**目的**: Phase 1〜3の全データを統合し、総合的なリスク評価とレポート生成を行う

**処理時間**: 約5-10秒

**コスト**: 約$0.01-0.02

### データフロー

```
入力: {
  recordId,
  phase1Results,  // 買取・担保情報
  phase2Results,  // 通帳分析
  phase3Results,  // 本人確認・企業実在性
}
  ↓
┌─────────────────────────────────────────┐
│ Step 1: 全データ統合                    │
│ ・Kintoneデータも追加取得               │
│ ・Phase 1〜3の結果を構造化              │
└─────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────┐
│ Step 2: リスク評価                      │
│ ・申込者属性リスク                      │
│ ・担保集中リスク                        │
│ ・入金変動リスク                        │
│ ・通帳リスク                            │
│ ・人的リスク                            │
└─────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────┐
│ Step 3: 総合判定                        │
│ ・リスクスコア計算                      │
│ ・判定ロジック実行                      │
└─────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────┐
│ Step 4: 構造化レポート生成               │
│ ・AIで詳細レポート作成                  │
│ ・推奨事項の生成                        │
└─────────────────────────────────────────┘
  ↓
出力: {
  総合判定: "承認" | "条件付き承認" | "再検討" | "却下",
  リスクレベル: "低" | "中" | "高",
  リスクスコア: 75,
  詳細レポート: "...",
  推奨事項: [...],
}
```

### リスク評価の詳細

#### 1. **申込者属性リスク**

```typescript
// 年齢リスク
const age = calculateAge(birthDate);
const ageRisk = age < 30 ? "高" : age < 40 ? "中" : "低";

// 事業形態リスク
const isPersonalBusiness = !phase1Results.purchaseInfo.applicantCompany;
const businessRisk = isPersonalBusiness ? "高" : "低";

// 複合リスク
const personalRisk = {
  age,
  ageRisk,
  isPersonalBusiness,
  businessRisk,
  compositeRisk: (age < 30 && isPersonalBusiness) ? "特に高" : "通常",
};
```

#### 2. **担保集中リスク**

```typescript
const collateralCount = phase1Results.collateralVerification.collateralInfo.totalCompanies;
const totalAmount = phase1Results.purchaseVerification.purchaseInfo.totalAmount;

// 依存度計算
const largestCollateral = Math.max(...collateralAmounts);
const dependencyRate = (largestCollateral / totalAmount) * 100;

const concentrationRisk = 
  collateralCount === 1 ? "高（担保1社のみ）" :
  dependencyRate > 80 ? "高（1社への依存度80%以上）" :
  collateralCount >= 3 ? "低（リスク分散良好）" : "中";
```

#### 3. **入金変動リスク**

```typescript
// Kintone担保情報から過去3ヶ月の入金を取得
const payments = [先々月, 先月, 今月];
const average = payments.reduce((a, b) => a + b) / 3;
const stdDev = calculateStdDev(payments);
const variationRate = (stdDev / average) * 100;

const paymentRisk = 
  variationRate > 50 ? "高（入金不安定）" :
  variationRate > 30 ? "中" : "低";
```

#### 4. **通帳リスク**

```typescript
const bankRisk = {
  gambling: phase2Results.mainBank.riskDetection.gambling.length > 0,
  largeCash: phase2Results.mainBank.riskDetection.largeCashWithdrawals.length > 0,
  crossTransfer: phase2Results.crossBankTransfers.length > 0,
  otherFactoring: phase2Results.factoringCompanies.length > 0,
};

const bankRiskLevel = 
  (bankRisk.gambling && bankRisk.otherFactoring) ? "高" :
  (bankRisk.gambling || bankRisk.otherFactoring) ? "中" : "低";
```

#### 5. **人的リスク**

```typescript
const humanRisk = {
  applicantNegative: phase3Results.applicantEgoSearch.summary.hasNegativeInfo,
  representativeNegative: phase3Results.representativeEgoSearches.some(r => r.summary.hasNegativeInfo),
  identityMismatch: phase3Results.identityVerification.nameMatch !== "match",
};

const humanRiskLevel = 
  (humanRisk.applicantNegative || humanRisk.identityMismatch) ? "高" :
  humanRisk.representativeNegative ? "中" : "低";
```

### 総合判定ロジック

```typescript
// リスクスコア計算（100点満点）
let score = 100;

// 減点方式
if (personalRisk.ageRisk === "高") score -= 15;
if (concentrationRisk.includes("高")) score -= 20;
if (paymentRisk === "高") score -= 15;
if (bankRiskLevel === "高") score -= 20;
if (humanRiskLevel === "高") score -= 30;

// 総合判定
const decision = 
  score >= 80 ? "承認" :
  score >= 60 ? "条件付き承認" :
  score >= 40 ? "再検討" : "却下";

const riskLevel = 
  score >= 70 ? "低" :
  score >= 50 ? "中" : "高";
```

### 構造化レポート生成

```typescript
const reportPrompt = `
以下のデータから、ファクタリング審査の詳細レポートを作成してください。

【申込者情報】
- 氏名: ${applicantName}
- 年齢: ${age}歳
- 事業形態: ${isPersonalBusiness ? "個人事業主" : "法人"}

【買取情報】
- 総債権額: ¥${totalAmount}
- 第三債務者: ${debtorCount}社
- 照合結果: ${matchResult}

【担保情報】
- 担保企業数: ${collateralCount}社
- 担保集中リスク: ${concentrationRisk}

【通帳分析】
- 入金率: ${depositRate}%
- ギャンブル検出: ${gamblingCount}件
- 他社ファクタリング: ${factoringCount}件

【本人確認・企業実在性】
- 本人確認: ${identityResult}
- 申込者エゴサーチ: ${egoSearchResult}
- 企業実在性: ${companyVerificationResult}

【リスク評価】
- 総合スコア: ${score}点
- リスクレベル: ${riskLevel}

上記を踏まえて、以下の形式でレポートを作成してください：

1. **総合評価**
2. **主要なリスク要因**
3. **ポジティブな要因**
4. **推奨事項**
5. **留意事項**
`;

const report = await generateText({
  model: anthropic("claude-3-5-sonnet-20241022"),
  prompt: reportPrompt,
});
```

### 全体統合ワークフロー

```typescript
// full-compliance-workflow.ts

export const fullComplianceWorkflow = createWorkflow({
  id: "full-compliance-workflow",
  description: "ファクタリング審査の完全自動化ワークフロー",
  
  inputSchema: z.object({
    recordId: z.string().describe("KintoneレコードID"),
  }),
  
  outputSchema: z.object({
    recordId: z.string(),
    totalProcessingTime: z.string(),
    totalCost: z.string(),
    
    // 各Phaseの結果サマリー
    phase1Summary: z.string(),
    phase2Summary: z.string(),
    phase3Summary: z.string(),
    
    // 最終判定
    finalDecision: z.enum(["承認", "条件付き承認", "再検討", "却下"]),
    riskLevel: z.enum(["低", "中", "高"]),
    riskScore: z.number(),
    
    // 詳細レポート
    detailedReport: z.string(),
    recommendations: z.array(z.string()),
    warnings: z.array(z.string()),
    
    // 生データ
    phase1Results: z.any(),
    phase2Results: z.any(),
    phase3Results: z.any(),
  }),
})
  .then(phase1PurchaseCollateralStep)
  .then(phase2BankStatementStep)
  .then(phase3VerificationStep)
  .then(phase4FinalAnalysisStep)
  .commit();
```

### 最終出力イメージ

```json
{
  "recordId": "9918",
  "totalProcessingTime": "45.3秒",
  "totalCost": "$0.115",
  
  "phase1Summary": "買取・担保情報: 総債権額¥4,027,740、第三債務者2社、担保企業0社（ファイルなし）",
  "phase2Summary": "通帳分析: 入金率95.2%、ギャンブル1件、他社ファクタリング1件",
  "phase3Summary": "本人確認・実在性: 本人確認一致、申込者エゴサーチ問題なし、企業実在性確認完了",
  
  "finalDecision": "条件付き承認",
  "riskLevel": "中",
  "riskScore": 65,
  
  "detailedReport": "【総合評価】\n本案件は条件付き承認が妥当と判断されます...",
  "recommendations": [
    "担保企業が0社のため、追加担保の設定を検討してください",
    "他社ファクタリング利用が確認されているため、資金繰り状況の詳細確認が必要です",
    "入金率は95.2%と良好ですが、継続的なモニタリングが推奨されます"
  ],
  "warnings": [
    "担保謄本ファイルが添付されていません",
    "メイン通帳でギャンブル関連の出金が1件検出されました"
  ]
}
```

---

## ワークフロー実行フロー全体図

```
recordId: "9918" を入力
        ↓
┌───────────────────────────────────────────────┐
│ Phase 1: 買取・担保情報処理（17秒）            │
│ ・請求書PDF（14ページ）をOCR                  │
│ ・株式会社A工業: ¥2,000,000                   │
│ ・株式会社B建設: ¥2,027,740                   │
│ ・担保謄本: ファイルなし ⚠️                    │
│ コスト: $0.055                                │
└───────────────────────────────────────────────┘
        ↓
┌───────────────────────────────────────────────┐
│ Phase 2: 通帳分析（15秒）                     │
│ ・メイン通帳（25ページ）をOCR                 │
│ ・入金率: 95.2%（2社とも入金確認）            │
│ ・ギャンブル: 1件（-¥50,000）⚠️               │
│ ・他社ファクタリング: 1件（ビートレーディング）│
│ コスト: $0.035                                │
└───────────────────────────────────────────────┘
        ↓
┌───────────────────────────────────────────────┐
│ Phase 3: 本人確認・企業実在性（10秒）          │
│ ・本人確認: 運転免許証ゴールド免許 ✓           │
│ ・申込者エゴサーチ: 問題なし ✓                 │
│ ・企業実在性:                                 │
│   - 申込企業: 実在確認 ✓                      │
│   - 買取企業2社: 実在確認 ✓                   │
│ コスト: $0.020                                │
└───────────────────────────────────────────────┘
        ↓
┌───────────────────────────────────────────────┐
│ Phase 4: 最終分析・レポート生成（3秒）         │
│ ・申込者属性リスク: 低（40歳、法人）           │
│ ・担保集中リスク: 高（担保0社）⚠️              │
│ ・入金変動リスク: 低（安定）                   │
│ ・通帳リスク: 中（ギャンブル・他社利用）       │
│ ・人的リスク: 低（問題なし）                   │
│                                               │
│ 総合スコア: 65点                              │
│ 判定: 条件付き承認                            │
│ コスト: $0.005                                │
└───────────────────────────────────────────────┘
        ↓
最終レポート出力
```

---

## まとめ: 全体のフェーズ構成

### フェーズ一覧と実装状況

| Phase | 名称 | 処理時間 | コスト | 状態 |
|-------|------|---------|--------|------|
| Phase 1 | 買取・担保情報処理 | 17秒 | $0.055 | ✅ 実装済み |
| Phase 2 | 通帳分析 | 15秒 | $0.035 | 🔜 次の実装 |
| Phase 3 | 本人確認・企業実在性確認 | 10秒 | $0.020 | 🔮 将来実装 |
| Phase 4 | 最終分析・レポート生成 | 3秒 | $0.005 | 🔮 将来実装 |
| **合計** | **完全な審査** | **45秒** | **$0.115** | **25%完了** |

### 重要な設計判断

1. **エージェントレス設計**
   - 理由: 7000文字以上の構造化データで無限ループする問題を回避
   - 方法: ワークフローステップ内でツールを直接実行

2. **Phase分割の方針**
   - Phase 1: 独立データ（買取・担保情報）
   - Phase 2: 重い処理（通帳OCR）
   - Phase 3: Web検索系（本人確認・企業実在性）
   - Phase 4: 統合・分析（全データ統合）

3. **既存ツールの活用**
   - Phase 1: 新規作成（Google Vision OCR）
   - Phase 2: 一部既存ツール活用 + 新規作成
   - Phase 3: 既存ツール100%活用（`ocrIdentityToolV2`, `egoSearchTool`, `companyVerifyTool`）
   - Phase 4: AI分析（`generateText`直接呼び出し）

### 次のアクション

1. ✅ **Phase 1完了** → ドキュメント作成済み
2. 🔜 **Phase 2実装** → `phase2-implementation-plan.md`に詳細あり
3. 🔮 **Phase 3実装** → 既存ツール活用で比較的容易
4. 🔮 **Phase 4実装** → 全データ統合とAIレポート生成

この設計により、確実で保守性の高い、包括的なファクタリング審査AIシステムが構築できる。

---

## 技術的な学び

### 1. コンテキスト上限への対応

**懸念点**: Phase 1〜4を1つのワークフローで実行した際のコンテキスト上限

**実測値**:
- Phase 1: 買取・担保情報（約7,000文字）
- Phase 2: 通帳分析（約20,000～30,000文字、ページ数による）
- Phase 3: 本人確認・企業実在性（約10,000文字）
- Phase 4: 最終分析・レポート（約5,000文字）
- **合計: 約50,000～60,000文字**

**モデル選択**:
- **Claude 3.5 Sonnet**: 200Kトークン（約150K文字）→ **十分対応可能** ✅
- GPT-4.1: 100万トークン → 通帳が50ページ超の場合に推奨

**推奨事項**:
- 通常ケース（通帳30ページ以下）: Claude 3.5 Sonnet
- 大量データ（通帳50ページ超）: GPT-4.1またはClaude 3.5 Sonnet（ページ分割処理）

### 2. Mastraエージェントの制約

**発見した問題**:
- AIモデルが大量の構造化データをツール引数としてコピーできない
- 7,000文字程度でも無限ループや処理失敗が発生
- エージェントは「判断が必要な箇所」にのみ使うべき

**解決策**:
- データ処理はプログラマティックに実行
- AIは分析タスクのみに使用（generateTextで直接呼ぶ）

### 2. ワークフローステップの利点

**メリット**:
- ✅ 確実な処理フロー制御
- ✅ 大量データの安全な受け渡し
- ✅ デバッグの容易さ
- ✅ 並列処理が可能（Promise.all）
- ✅ コスト効率が良い

**デメリット**:
- ❌ AI自律的な判断はできない（必要なら条件分岐で対応）

### 3. ログ設計の重要性

**原則**:
- 人間が判断できる最小限の情報
- OCR結果の「ソース確認」ができること
- Kintone照合の「何と何を比較したか」が明確
- シンプルだが、必要十分

**避けるべき**:
- 不要な技術情報（信頼度、トークン数など）
- 冗長な説明文
- 複雑すぎる表示

### 4. 2層の出力設計

**結果サマリー（人間用）**:
```json
{
  "申込者企業": "株式会社ABC",
  "総債権額": "¥4,000,000",
  "第三債務者": [...]
}
```

**phase1Results（プログラム用）**:
```json
{
  "ocr": { "purchaseDocuments": [...] },
  "purchaseVerification": { "purchaseInfo": {...} },
  "collateralVerification": { "collateralInfo": {...} }
}
```

この2層構造により、プレイグラウンドでの確認と次のステップでの処理の両方に対応できる。

---

## まとめ

### Phase 1（実装済み）

- ✅ エージェントレス設計で7000文字問題を解決
- ✅ プログラマティックなツール実行
- ✅ シンプルで判断しやすいログ
- ✅ 2層の出力（人間用 + プログラム用）

### Phase 2（次の実装）

- 🔜 通帳OCR → 分析 → 照合の流れ
- 🔜 既存ツールの活用 + 新規ツール作成
- 🔜 Phase 1と同じ設計パターンを踏襲

### 今後の方針

1. **Phase 2実装**: 通帳分析ステップを作成
2. **Phase 3実装**: 統合分析・レポート生成
3. **全体統合**: fullComplianceWorkflowの完成
4. **最適化**: 並列処理、キャッシュ、パフォーマンス改善

この設計により、確実で保守性の高いAIワークフローシステムが構築できる。

