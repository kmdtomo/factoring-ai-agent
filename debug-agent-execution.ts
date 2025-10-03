import { phase1PurchaseCollateralAgent } from "./src/mastra/agents/phase1-purchase-collateral-agent";

async function debugAgentExecution() {
  console.log("=== Phase1購入担保エージェント実行デバッグ ===");
  console.log("開始時刻:", new Date().toISOString());
  console.log("recordId: 9918");
  
  try {
    const stream = await phase1PurchaseCollateralAgent.stream("recordId: 9918");
    
    console.log("\n--- ストリーム開始 ---");
    
    let stepCount = 0;
    let toolCallCount = 0;
    let lastEventTime = Date.now();
    const eventLog: any[] = [];
    
    for await (const event of stream) {
      const currentTime = Date.now();
      const timeSinceLastEvent = currentTime - lastEventTime;
      lastEventTime = currentTime;
      
      // イベントをログに記録
      eventLog.push({
        timestamp: new Date().toISOString(),
        type: event.type,
        timeSinceLastEvent,
        event: event
      });
      
      // イベントタイプごとの処理
      switch (event.type) {
        case 'text':
          console.log(`\n[TEXT] ${new Date().toISOString()} (+${timeSinceLastEvent}ms)`);
          console.log("内容:", event.text?.substring(0, 200) + "...");
          break;
          
        case 'tool-call':
          toolCallCount++;
          console.log(`\n[TOOL-CALL #${toolCallCount}] ${new Date().toISOString()} (+${timeSinceLastEvent}ms)`);
          console.log("ツール名:", event.toolName);
          console.log("引数:", JSON.stringify(event.args, null, 2));
          break;
          
        case 'tool-result':
          console.log(`\n[TOOL-RESULT] ${new Date().toISOString()} (+${timeSinceLastEvent}ms)`);
          console.log("ツール名:", event.toolName);
          console.log("成功:", event.result?.success);
          
          // 結果の詳細を表示
          if (event.result) {
            console.log("結果概要:", {
              success: event.result.success,
              summary: event.result.summary?.substring(0, 100) + '...',
              documentCount: event.result.purchaseDocuments?.length || event.result.collateralDocuments?.length || 0
            });
          }
          break;
          
        case 'step-finish':
          stepCount++;
          console.log(`\n[STEP-FINISH #${stepCount}] ${new Date().toISOString()} (+${timeSinceLastEvent}ms)`);
          console.log("ステップ使用状況:", event.usage);
          break;
          
        case 'error':
          console.error(`\n[ERROR] ${new Date().toISOString()} (+${timeSinceLastEvent}ms)`);
          console.error("エラー:", event.error);
          break;
          
        default:
          console.log(`\n[${event.type}] ${new Date().toISOString()} (+${timeSinceLastEvent}ms)`);
          console.log("イベント:", JSON.stringify(event, null, 2));
      }
      
      // 長時間待機を検出
      if (timeSinceLastEvent > 10000) {
        console.warn(`⚠️ 警告: 前のイベントから${timeSinceLastEvent}ms経過しています`);
      }
    }
    
    console.log("\n--- ストリーム終了 ---");
    console.log("終了時刻:", new Date().toISOString());
    console.log("合計ステップ数:", stepCount);
    console.log("合計ツール呼び出し数:", toolCallCount);
    
    // イベントサマリー
    console.log("\n=== イベントサマリー ===");
    const eventTypes = eventLog.reduce((acc, log) => {
      acc[log.type] = (acc[log.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    Object.entries(eventTypes).forEach(([type, count]) => {
      console.log(`${type}: ${count}回`);
    });
    
    // 最後の5イベントを表示
    console.log("\n=== 最後の5イベント ===");
    eventLog.slice(-5).forEach((log, index) => {
      console.log(`${index + 1}. ${log.type} at ${log.timestamp} (+${log.timeSinceLastEvent}ms)`);
    });
    
  } catch (error: any) {
    console.error("\n=== エラー詳細 ===");
    console.error("エラータイプ:", error.constructor.name);
    console.error("エラーメッセージ:", error.message);
    console.error("スタックトレース:", error.stack);
    
    // エラーの追加情報
    if (error.cause) {
      console.error("\nエラー原因:", error.cause);
    }
    if (error.code) {
      console.error("エラーコード:", error.code);
    }
  }
}

// 実行
debugAgentExecution().catch(console.error);