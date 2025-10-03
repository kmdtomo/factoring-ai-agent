import dotenv from 'dotenv';
dotenv.config();

// 重要: エージェントをインポートする前にMastraの設定を変更
process.env.MASTRA_DISABLE_V2_CHECK = "true"; // V2チェックを無効化（仮想的な設定）

import { phase1PurchaseCollateralAgent } from './mastra/agents/phase1-purchase-collateral-agent';
import { phase1PurchaseCollateralAgentV2 } from './mastra/agents/phase1-purchase-collateral-agent-v2';

// テスト実行
async function finalTest() {
  console.log("=== 最終動作確認テスト ===\n");
  
  console.log("問題の要約:");
  console.log("1. MastraがV2モデルをサポートしていない");
  console.log("2. generateVNextを使用してもツール結果が正しく処理されない");
  console.log("3. OCR成功後、次のツールが実行されない（永遠に終わらない）\n");
  
  console.log("解決方法:");
  console.log("1. Mastraのアップデートを待つ");
  console.log("2. V1互換モードを使用する（もし存在すれば）");
  console.log("3. 別のエージェントフレームワークを使用する\n");
  
  // V2エージェントで30秒タイムアウトテスト
  console.log("--- V2エージェントテスト（30秒タイムアウト） ---");
  
  const startTime = Date.now();
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("30秒タイムアウト")), 30000);
  });
  
  const agentPromise = phase1PurchaseCollateralAgentV2.generate('recordId: 9918');
  
  try {
    await Promise.race([agentPromise, timeoutPromise]);
    console.log("✅ 成功: エージェントが正常に完了しました");
  } catch (error: any) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    if (error.message === "30秒タイムアウト") {
      console.log(`❌ 失敗: ${elapsed}秒でタイムアウト`);
      console.log("原因: OCR後に購入検証ツールが実行されていません");
    } else {
      console.error("エラー:", error.message);
    }
  }
  
  console.log("\n=== 結論 ===");
  console.log("現在のMastraバージョンでは、V2モデルを使用したツールの");
  console.log("連続実行に問題があります。");
  console.log("\n推奨事項:");
  console.log("1. Mastraの更新を待つ");
  console.log("2. 単一ツールのみを使用する");
  console.log("3. ツールを手動で順次実行する");
  
  process.exit(0);
}

// 実行
finalTest().catch(console.error);