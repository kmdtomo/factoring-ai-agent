# Phase 2: 通帳分析フェーズ 仕様書

## 概要

Phase 2では、メイン通帳（法人口座）とサブ通帳（個人口座）をOCR処理し、担保企業からの入金照合とリスク検出を行います。
担保情報との照合は2段階判定アプローチを採用し、全取引を抽出してから最適な組み合わせを判定します。

---

## 処理フロー

### ステップ1: OCR処理

**入力:**
- recordId (Kintone レコードID)
- メイン通帳フィールド: `通帳＿法人口座＿添付ファイル`
- サブ通帳フィールド: `通帳＿個人口座＿添付ファイル`

**処理内容:**
1. Google Vision APIでOCR実行
2. 通帳の取引明細をテキストとして抽出

---

### ステップ2: メイン通帳AI分析（2段階判定）

**入力:**
- メイン通帳OCRテキスト
- Kintone担保情報（会社名、過去3ヶ月の期待入金額）
- ファクタリング業者リスト（110社）
- ギャンブルキーワードリスト（30種以上）

**処理内容:**

#### フェーズ1: 全取引の抽出
- 企業名の表記ゆれを考慮（法人格、カナ/漢字、略称を無視）
- 各担保企業からの全入金取引を抽出
- **重要**: `allTransactions`に抽出した全取引を記録（何も除外しない）
- `expectedValues`にKintone期待値（過去3ヶ月分）を記録

#### フェーズ2: 全体最適化照合
- 全取引と全期待値を俯瞰して、最適な組み合わせを判定
- **重要**: 月ごとに個別判断せず、全体で最適解を見つける

**照合の原則:**
- 各取引は1つの期待値にのみ対応（重複使用禁止）
- 期待値±1,000円を許容
- 日付は柔軟に対応（前月末～翌月初も含む）
- 1つの入金を分割して複数月に割り当てない

**分割入金の柔軟な対応:**
- 月内分割: 同月内の複数入金を合算
- 月またぎ分割: 前月末±7日、当月初±7日の入金を合算
- 複数月分割: 前後の月の入金も含めて合算可能
- 前払い/後払い: 期待月の前後1ヶ月以内の入金も考慮

**matchType分類:**
- 単独一致: 1回の入金で期待値と一致
- 月内分割: 同月内の複数入金で期待値と一致
- 月またぎ分割: 前月末～当月初の入金で期待値と一致
- 複数月分割: 複数月にまたがる入金で期待値と一致
- 前払い/後払い: 期待月の前後1ヶ月の入金で一致
- 不一致: 期待値と一致する入金が見つからない

**リスク検出:**
1. ギャンブル関連取引
   - 30種以上のキーワード（ウィンチケット、マルハン、ダイナム、ベラジョン、競馬、パチンコ等）
   - 振込先/摘要にキーワードが含まれる出金取引を検出

2. 他社ファクタリング業者
   - 110社の業者リスト（GMO、OLTA、ビートレーディング、ペイトナー等）
   - 業者名を含む取引（入金または出金）を検出

---

### ステップ3: サブ通帳AI分析

**入力:**
- サブ通帳OCRテキスト
- ファクタリング業者リスト
- ギャンブルキーワードリスト

**処理内容:**
- ギャンブルリスク検出
- 他社ファクタリング業者検出

---

### ステップ4: 通帳間資金移動検出（未実装）

**予定機能:**
- メイン通帳とサブ通帳間の資金移動を検出
- 現在は空配列を返す

---

## Phase 2の出力構造

```json
{
  "recordId": "9918",
  "phase2Results": {
    "mainBankAnalysis": {
      "collateralMatches": [
        {
          "company": "株式会社〇〇",
          "allTransactions": [
            {
              "date": "07-04",
              "amount": 1099725,
              "payerName": "カ)〇〇"
            },
            {
              "date": "09-04",
              "amount": 1572688,
              "payerName": "カ)〇〇"
            }
          ],
          "expectedValues": [
            {"month": "2025-08", "amount": 1099725},
            {"month": "2025-09", "amount": 6714029},
            {"month": "2025-10", "amount": 1572688}
          ],
          "monthlyResults": [
            {
              "month": "2025-08",
              "expected": 1099725,
              "actual": 1099725,
              "actualSource": "¥1,099,725 ← カ)〇〇",
              "matched": true,
              "matchType": "単独一致",
              "matchedTransactions": [
                {
                  "date": "07-04",
                  "amount": 1099725,
                  "payerName": "カ)〇〇"
                }
              ],
              "unmatchedTransactions": []
            },
            {
              "month": "2025-09",
              "expected": 6714029,
              "actual": 6714029,
              "actualSource": "¥5,264,304 ← カ)〇〇 + ¥1,449,725 ← カ)〇〇",
              "matched": true,
              "matchType": "月またぎ分割",
              "matchedTransactions": [
                {
                  "date": "07-31",
                  "amount": 5264304,
                  "payerName": "カ)〇〇"
                },
                {
                  "date": "08-20",
                  "amount": 1449725,
                  "payerName": "カ)〇〇"
                }
              ],
              "unmatchedTransactions": []
            },
            {
              "month": "2025-10",
              "expected": 1572688,
              "actual": 0,
              "actualSource": "検出なし",
              "matched": false,
              "matchType": "不一致",
              "matchedTransactions": [],
              "unmatchedTransactions": []
            }
          ]
        }
      ],
      "riskDetection": {
        "gambling": [
          {
            "date": "2023-07-16",
            "amount": -108880,
            "destination": "ウィンチケット",
            "keyword": "ウィンチケット"
          }
        ]
      }
    },
    "subBankAnalysis": {
      "riskDetection": {
        "gambling": []
      }
    },
    "crossBankTransfers": [],
    "factoringCompanies": [
      {
        "companyName": "株式会社ウィット",
        "date": "07-09-04",
        "amount": 500000,
        "transactionType": "入金"
      }
    ]
  },
  "summary": {
    "processingTime": 59.861,
    "totalCost": 0.052656
  }
}
```

---

## 出力フィールド詳細

### collateralMatches（担保企業照合結果）

| フィールド | 型 | 説明 |
|----------|---|------|
| company | string | 担保企業名 |
| allTransactions | array | OCRから抽出された全入金取引（何も除外していない生データ） |
| expectedValues | array | Kintone期待値（過去3ヶ月分） |
| monthlyResults | array | 月次照合結果 |

### monthlyResults（月次照合結果）

| フィールド | 型 | 説明 |
|----------|---|------|
| month | string | 対象月（YYYY-MM形式） |
| expected | number | Kintone期待値 |
| actual | number | OCR検出合計 |
| actualSource | string | OCRソース（例: "¥1,099,725 ← カ)〇〇"、分割の場合は"+"で連結） |
| matched | boolean | 照合結果 |
| matchType | string | 照合タイプ（単独一致、月内分割、月またぎ分割、複数月分割、前払い、後払い、不一致） |
| matchedTransactions | array | 期待値と照合できた入金取引 |
| unmatchedTransactions | array | 期待値外の入金取引（別案件の可能性） |

### matchedTransactions / unmatchedTransactions

| フィールド | 型 | 説明 |
|----------|---|------|
| date | string | 取引日（MM-DD形式） |
| amount | number | 取引金額 |
| payerName | string | 通帳記載の振込元名 |
| purpose | string (optional) | 推測される用途（unmatchedTransactionsのみ） |

### riskDetection.gambling（ギャンブル検出）

| フィールド | 型 | 説明 |
|----------|---|------|
| date | string | 取引日 |
| amount | number | 取引金額（マイナスは出金） |
| destination | string | 振込先/摘要 |
| keyword | string | 一致したギャンブルキーワード（必須・空文字列不可） |

### factoringCompanies（他社ファクタリング業者検出）

| フィールド | 型 | 説明 |
|----------|---|------|
| companyName | string | 検出された業者名 |
| date | string | 取引日 |
| amount | number | 取引金額 |
| transactionType | string | 取引種別（入金/出金） |

---

## Phase 4（レポートフェーズ）への引き継ぎ事項

### Phase 2で照合済みの項目

✅ **担保企業からの入金照合**
- `monthlyResults`に照合結果あり
- `allTransactions`で全取引を確認可能
- `matchedTransactions`で一致した取引の詳細を確認可能
- `unmatchedTransactions`で期待値外の取引を確認可能

✅ **リスク検出（ギャンブル・他社ファクタリング）**
- `riskDetection.gambling`にギャンブル取引あり
- `factoringCompanies`に他社ファクタリング業者取引あり

### Phase 2で照合していない項目（レポートで判断が必要）

#### 1. 担保企業の詳細評価
- **抽出済みデータ:** `monthlyResults`に照合結果
- **レポートでの判断:**
  - 不一致の理由を分析（遅延入金、金額相違、未入金など）
  - 複数月の入金パターンを評価
  - 期待値外の取引（unmatchedTransactions）の重要性を判断

#### 2. ギャンブルリスクの評価
- **抽出済みデータ:** `riskDetection.gambling`に検出取引
- **レポートでの判断:**
  - 頻度と金額からリスクレベルを判定
  - 事業資金との関連性を評価

#### 3. 他社ファクタリング利用状況
- **抽出済みデータ:** `factoringCompanies`に検出取引
- **レポートでの判断:**
  - 他社利用の程度を評価
  - 資金繰りの状況を推測

#### 4. 通帳間資金移動（未実装）
- **予定データ:** `crossBankTransfers`
- **レポートでの判断:**
  - 資金の流れの透明性
  - 不自然な資金移動の有無

---

## 技術仕様

### 使用AI
- **OCR:** Google Vision API
- **通帳分析:** OpenAI GPT-4.1-2025-04-14

### レート制限対策
- OpenAI選択理由: Claude API (50 RPM, 30K TPM) より OpenAI (3,500+ RPM, 90K+ TPM) の方が制限が緩い
- GPT-4.1は32,768 max output tokens対応

### コスト構造
- Google Vision API: ページ単価 $0.0015
- GPT-4.1: 入力 $0.000003/token, 出力 $0.000012/token

---

## 設計思想

### なぜ2段階判定アプローチを採用するのか？

**従来の問題点:**
- 月ごとに個別判断すると、月またぎの分割入金を正しく判定できない
- 例: 9月期待値¥650万に対し、7月末¥500万 + 8月中旬¥150万 の入金を「別々の月」と誤判断

**2段階判定の利点:**
1. **全取引を先に抽出**: 何も除外せず、全入金を記録
2. **全体最適化**: 全取引と全期待値を俯瞰して最適な組み合わせを判定
3. **柔軟な対応**: 月またぎ、複数月分割、前払い/後払いを正しく判定

### 事実ベースの記録

Phase 2は「何が検出されたか」を正確に記録することに重点を置いています。
- `allTransactions`: OCRから抽出された全取引（生データ）
- `matchedTransactions`: 期待値と照合できた取引
- `unmatchedTransactions`: 期待値外の取引
- `actualSource`: OCRソースの明示

これにより、レポートAIが全体を俯瞰して総合的な判断を下せるようにしています。

---

## 更新履歴

- 2025-10-04: 初版作成
- Phase 2の処理内容と出力構造を明記
- 2段階判定アプローチの説明を追加
