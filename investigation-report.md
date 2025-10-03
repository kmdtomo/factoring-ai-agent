# phase1-purchase-collateral-agent OCR後ツール呼び出し問題 調査レポート

## 調査日時
2025-10-02

## 問題の概要
phase1-purchase-collateral-agentがOCRツールの実行後、次のpurchaseVerificationToolを呼び出さずに処理が停止する。

## 調査結果

### 1. purchase-verification-toolの複雑さ

#### 問題点
- **AI呼び出しが2回ある**: 
  1. 分析用のgenerateText呼び出し（114-143行目）
  2. 構造化データ抽出用のgenerateText呼び出し（148-182行目）
- **処理時間**: 各AI呼び出しに数秒かかるため、合計で10秒以上かかる可能性
- **エラーハンドリング**: JSON解析エラーが発生した場合のフォールバック処理が複雑

#### 影響
- ツールの実行時間が長くなり、エージェントがタイムアウトする可能性
- AI呼び出しのコストが高い
- エラー発生時の原因特定が困難

### 2. データ受け渡しの問題

#### OCRツールの出力
```typescript
{
  purchaseDocuments: [{
    fileName: string,
    text: string,      // 大量のテキスト
    pageCount: number,
    confidence: number,
    tokenEstimate: number  // トークン数の推定値
  }],
  // ... 他のフィールド
}
```

#### 潜在的な問題
- **データサイズ**: OCRで20ページ処理すると、テキストが非常に大きくなる
- **トークン数**: エージェントのコンテキストウィンドウを超える可能性
- **ストリーミング**: 大量データのストリーミング処理で問題が発生する可能性

### 3. Mastraエージェントの実行メカニズム

#### ストリーミング処理
- エージェントはストリーミングAPIを使用してイベントを送信
- イベントタイプ: 'text', 'tool-call', 'tool-result', 'step-finish', 'error'

#### 問題の可能性
1. **大量データによるストリーミングの詰まり**
2. **エージェントのmaxSteps（10）に到達**
3. **暗黙的なタイムアウト**
4. **エラーが握りつぶされている**

### 4. 具体的な停止箇所

デバッグログから推測される停止パターン：
1. OCRツールは正常に完了
2. エージェントがツール呼び出しの生成を試みる
3. 大量のOCRデータを含むプロンプトが生成される
4. AI APIへのリクエストが失敗またはタイムアウト
5. エラーイベントが発生せず、ストリームが停止

## 改善案

### 1. 即効性のある対策

#### A. 簡略版ツールの使用
```typescript
// purchase-verification-tool-simple.ts を作成済み
// AI呼び出しを削除し、単純なテキストマッチングで実装
export const purchaseVerificationToolSimple = createTool({
  // AI未使用、単純なパターンマッチング
});
```

#### B. データサイズの削減
```typescript
// OCRツールでテキストを要約または切り詰め
const truncatedText = doc.text.substring(0, 5000); // 最初の5000文字のみ
```

### 2. デバッグ方法

#### A. 詳細ログの追加
```typescript
// debug-agent-execution.ts を作成済み
// 各イベントの時間計測とログ出力
```

#### B. 最小限のテストケース
```typescript
// test-minimal-agent.ts を作成済み
// 単純なツールで問題を再現
```

### 3. 根本的な解決策

#### A. ツールの分割
- purchaseVerificationToolを複数の小さなツールに分割
- 各ツールは単一のAI呼び出しのみ実行

#### B. 非同期処理の改善
```typescript
// バッチ処理やキューイングの実装
const processInBatches = async (documents: any[]) => {
  const batchSize = 3;
  const results = [];
  for (let i = 0; i < documents.length; i += batchSize) {
    const batch = documents.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(doc => processDocument(doc))
    );
    results.push(...batchResults);
  }
  return results;
};
```

#### C. エラーハンドリングの強化
```typescript
// タイムアウトとリトライの実装
const withTimeout = async (promise: Promise<any>, timeoutMs: number) => {
  const timeout = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Timeout')), timeoutMs)
  );
  return Promise.race([promise, timeout]);
};
```

## 推奨アクション

1. **即座に実行**:
   - `test-simple-agent.ts`を実行して簡略版ツールの動作確認
   - `test-minimal-agent.ts`で基本的なエージェント動作を確認

2. **短期的対策**:
   - purchaseVerificationToolSimpleを本番環境で使用
   - OCRツールの出力テキストサイズを制限

3. **長期的対策**:
   - Mastraフレームワークへのタイムアウト設定の追加
   - ストリーミング処理の最適化
   - エラーハンドリングの改善

## 実行コマンド

```bash
# 簡略版エージェントのテスト
npx tsx test-simple-agent.ts

# 最小限エージェントのテスト
npx tsx test-minimal-agent.ts

# デバッグ実行
npx tsx debug-agent-execution.ts
```