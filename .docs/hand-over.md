# WIT Agent - Mastra実装引き継ぎ資料

## プロジェクト概要
WIT (Web3 Intelligence Tool) は、暗号資産取引のコンプライアンス監視とリスク評価を自動化するシステムです。
Mastraフレームワークを活用して、真のエージェント型アーキテクチャで実装してください。

## 技術要件
- **フレームワーク**: Mastra
- **AI**: Claude 3.5 Sonnet (claude-3-5-sonnet-latest)
- **データソース**: Kintone API
- **パッケージマネージャー**: pnpm

## 環境変数
```env
ANTHROPIC_API_KEY=xxx
KINTONE_API_TOKEN=xxx
KINTONE_DOMAIN=xxx.cybozu.com
KINTONE_APP_ID=xxx
GOOGLE_API_KEY=xxx
GOOGLE_CX=xxx
```

## 主要な評価項目（3大カテゴリ）

### 1. 取引先データ評価（40%）
- エゴサーチ（代表者名で「詐欺」「逮捕」を含む検索）
- 詐欺情報サイトでのチェック
- 企業実在性確認（Web検索）
- 支払い能力評価

### 2. 資金使途評価（30%）
- 資金使途の妥当性（業種との整合性）
- 税金・保険料滞納チェック
- 他社ファクタリング利用状況
- 横領リスク評価

### 3. 入出金履歴評価（30%）
- 通帳OCR分析（口座名義確認、取引パターン）
- 本人確認書類の照合
- 請求書OCR（金額の整合性確認）
- 必要書類の提出状況

## Kintoneデータ構造

### 基本情報
```typescript
{
  顧客番号: string;
  入金日: string;
  会社_屋号名: string;
  代表者名: string;
  生年月日: string;
  携帯番号_ハイフンなし: string;
  会社所在地?: string;
  自宅所在地?: string;
}
```

### 買取情報（配列）
```typescript
{
  会社名_第三債務者_買取: string;
  買取債権額: number;
  買取額: number;
  掛目: string;
  買取債権支払日: string;
  状態_0: string;
}[]
```

### 担保情報（配列）
```typescript
{
  会社名_第三債務者_担保: string;
  請求額: number;
  入金予定日: string;
  過去の入金_先々月: number;
  過去の入金_先月: number;
  過去の入金_今月: number;
  平均: number;
}[]
```

### 財務・リスク情報
```typescript
{
  売上: number;
  業種: string;
  資金使途: string;
  ファクタリング利用: string;
  納付状況_税金: string;
  税金滞納額_0: number;
  納付状況_税金_0: string;
  保険料滞納額: number;
}
```

### 添付ファイル
```typescript
{
  買取情報_成因証書_謄本類_名刺等_添付ファイル: AttachmentFile[];
  通帳_メイン_添付ファイル: AttachmentFile[];
  通帳_その他_添付ファイル: AttachmentFile[];
  顧客情報_添付ファイル: AttachmentFile[];
  担保情報_成因証書_謄本類_名刺等_添付ファイル: AttachmentFile[];
  // 他のファイルカテゴリ
}
```

## 期待する出力形式

### 基本構造
```json
{
  "recordId": "9559",
  "timestamp": "2024-01-26T10:30:00Z",
  "overall": {
    "decision": "APPROVE" | "CONDITIONAL" | "REJECT",
    "riskLevel": "safe" | "caution" | "danger",
    "score": 0-100
  },
  "categories": {
    "counterparty": { /* 詳細 */ },
    "fundUsage": { /* 詳細 */ },
    "transaction": { /* 詳細 */ }
  },
  "issues": [],
  "recommendations": [],
  "detailedReports": {
    "counterparty": "文章形式の詳細レポート",
    "fundUsage": "文章形式の詳細レポート",
    "transaction": "文章形式の詳細レポート"
  }
}
```

### カテゴリ詳細構造
```json
{
  "name": "取引先データ評価",
  "status": "safe" | "caution" | "danger",
  "reason": "総合的な評価理由の説明文",
  "details": [
    {
      "item": "チェック項目名",
      "value": "検出値",
      "evaluation": "評価結果（✓ クリア、要注意など）",
      "detail": "詳細説明",
      "evidence": {
        // 具体的なエビデンスデータ（URL、検索結果、数値など）
      }
    }
  ]
}
```

## 詳細レポートの書き方

レポートは「データから何を読み取り、どう判断したか」を説明する形式で記述してください。

### 良い例（取引先データ評価）
```
本評価では、代表者の信頼性と企業の実在性を多角的に検証しました。

代表者「田中太郎」氏に関するエゴサーチ（3種類のクエリで合計15件のWeb検索）では、
詐欺情報サイト2件での該当がなく、逮捕歴や金融トラブルの記録も発見されませんでした。
むしろ内装業界での20年にわたる活動記録が確認され、地域の商工会での講演実績なども
見つかりました。これは同氏が業界で一定の信頼を築いていることを示唆しています。

[以下、データを基にした分析と判断を続ける]
```

## 実装方針

### Mastraの活用
1. **エージェント中心設計**: エージェントが必要なツールを自律的に選択・実行
2. **並列処理**: Web検索、OCR処理などを効率的に並行実行
3. **ストリーミング**: 処理の進捗をリアルタイムで返す
4. **型安全性**: Zodによるスキーマ定義

### ディレクトリ構造（推奨）
```
wit-agent/
├── mastra.config.ts
├── src/
│   └── mastra/
│       └── planA/
│           ├── agents/
│           │   └── compliance-agent.ts
│           ├── tools/
│           │   ├── ego-search.ts
│           │   ├── company-verify.ts
│           │   ├── payment-analysis.ts
│           │   └── document-ocr.ts
│           ├── workflows/
│           │   └── compliance-workflow.ts
│           └── types/
│               └── index.ts
```

## 重要な注意事項

1. **プランA思想**: すべてのデータ（Kintone + 画像 + PDF）を一度にエージェントに渡す
2. **自律的判断**: エージェントが状況に応じて必要なツールを選択
3. **並列実行**: 可能な限りツールを並行実行して高速化
4. **日本語対応**: すべての評価理由、レポートは日本語で記述

## 期待する成果

- 処理時間: 10-15秒（現在の30-45秒から大幅短縮）
- コード量: 現在の1/3程度
- 保守性: Mastraのベストプラクティスに沿った実装

## 追加リソース

詳細な出力例は `/Users/komodatomo/Desktop/mastra/wit-agent/.docs/mastra-implementation-plan.md` の
「2. 最終レポート形式（詳細版）」セクションを参照してください。