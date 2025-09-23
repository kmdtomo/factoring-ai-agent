# Kintoneデータ取得の最適化計画

## 現状の問題点

### 重複したKintoneデータ取得
- **Phase 1 OCRツール**: 各ツールが個別にKintone APIを呼び出し
  - `ocr-identity-tool-v2.ts`: recordIdから基本情報を取得
  - `ocr-bank-statement-tool.ts`: recordIdから担保情報を取得
  - `ocr-purchase-info-tool.ts`: recordIdから買取情報を取得
- **Phase 3 分析ツール**: 再度Kintoneデータが必要

### 問題
1. **APIコール数**: 同じrecordIdに対して5回以上のAPI呼び出し
2. **パフォーマンス**: 不要な待機時間
3. **データ不整合**: 処理中にデータが更新される可能性
4. **責務の混在**: OCRツールがKintoneデータ取得も担当

## 最適化案

### アーキテクチャ変更
```
現在:
各ツール → Kintone API → 処理

最適化後:
ワークフロー開始 → Kintone API（1回） → 全フェーズでデータ共有
```

### 実装イメージ

#### 1. ワークフローでの一括取得
```typescript
// multi-agent-compliance-workflow.ts
const phase1OCRStep = createStep({
  execute: async ({ inputData }) => {
    const { recordId } = inputData;
    
    // ワークフロー開始時に1回だけ取得
    const kintoneData = await fetchAllKintoneData(recordId);
    
    // Phase 1の各ツールに必要なデータを渡す
    const identityResult = await ocrIdentityToolV2.execute({
      context: {
        recordId,
        expectedName: kintoneData.代表者名,
        expectedBirthDate: kintoneData.生年月日,
        expectedAddress: kintoneData.住所,
        // Kintone取得は不要に
      }
    });
  }
});
```

#### 2. OCRツールの簡素化
```typescript
// ocr-identity-tool-v2.ts
inputSchema: z.object({
  recordId: z.string(),
  expectedName: z.string(),  // 外部から受け取る
  expectedBirthDate: z.string(),
  expectedAddress: z.string(),
  customerFiles: z.array(z.any()),  // ファイル情報も渡す
}),

execute: async ({ context }) => {
  // Kintone取得処理を削除
  // 純粋にOCR処理のみに専念
  const { customerFiles, expectedName, ... } = context;
  
  // OCR処理...
}
```

#### 3. 共有データ構造
```typescript
interface KintoneSharedData {
  // 基本情報
  recordId: string;
  代表者名: string;
  生年月日: string;
  住所: string;
  会社名: string;
  
  // 買取情報
  買取情報テーブル: Array<{
    会社名: string;
    買取債権額: number;
    買取額: number;
    // ...
  }>;
  
  // 担保情報
  担保情報テーブル: Array<{
    会社名: string;
    請求額: number;
    // ...
  }>;
  
  // ファイル情報
  添付ファイル: {
    顧客情報: FileInfo[];
    買取情報: FileInfo[];
    通帳_メイン: FileInfo[];
    通帳_その他: FileInfo[];
  };
}
```

## メリット

1. **パフォーマンス向上**
   - API呼び出し: 5回 → 1回
   - 処理時間: 約30%短縮見込み

2. **コードの簡素化**
   - 各ツールからKintone取得ロジックを削除
   - エラーハンドリングが1箇所に集約

3. **データ一貫性**
   - 全フェーズが同じデータを参照
   - タイミングによる不整合を防止

4. **責務の明確化**
   - OCRツール: 純粋にOCR処理のみ
   - ワークフロー: データ取得と配布

## 実装タイミング

Phase 3の実装時に合わせて実施予定

## 注意点

- 各ツールのinputSchemaの変更が必要
- 既存のテストの修正が必要
- 後方互換性を考慮した段階的な移行