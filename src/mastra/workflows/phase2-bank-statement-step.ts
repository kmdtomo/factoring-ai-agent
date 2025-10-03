import { createStep } from "@mastra/core/workflows";
import { RuntimeContext } from "@mastra/core/runtime-context";
import { z } from "zod";
import { googleVisionBankStatementOcrToolImproved } from "../tools/google-vision-bank-statement-ocr-tool-improved";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import axios from "axios";

// 環境変数取得
const getEnvConfig = () => ({
  KINTONE_DOMAIN: process.env.KINTONE_DOMAIN || "",
  KINTONE_API_TOKEN: process.env.KINTONE_API_TOKEN || "",
  APP_ID: process.env.KINTONE_APP_ID || "37"
});

/**
 * Phase 2: 通帳分析ステップ（改善版）
 * - AI判定を1回のAPI呼び出しで完結
 * - 企業名の表記ゆれを自動考慮
 * - 分割入金・合算入金の自動検出
 */
export const phase2BankStatementStep = createStep({
  id: "phase2-bank-statement",
  description: "通帳分析（OCR → AI分析・照合 → リスク検出）",
  
  inputSchema: z.object({
    recordId: z.string().describe("KintoneレコードID"),
    phase1Results: z.any().optional().describe("Phase 1の結果（オプション）"),
  }),
  
  outputSchema: z.object({
    recordId: z.string(),
    結果サマリー: z.object({
      メイン通帳: z.object({
        入金照合: z.object({
          入金率: z.number(),
          一致企業数: z.number(),
          不一致企業数: z.number(),
          総合信頼度: z.number(),
        }),
        リスク検出: z.object({
          ギャンブル: z.number(),
          大口出金: z.number(),
          資金移動: z.number(),
        }),
      }).optional(),
      サブ通帳: z.object({
        リスク検出: z.object({
          ギャンブル: z.number(),
          大口出金: z.number(),
        }),
      }).optional(),
      通帳間資金移動: z.number(),
      他社ファクタリング: z.number(),
      処理時間: z.string(),
      コスト: z.string(),
    }),
    phase2Results: z.object({
      ocr: z.object({
        success: z.boolean(),
        mainBankDocuments: z.array(z.any()),
        subBankDocuments: z.array(z.any()),
        processingDetails: z.any(),
      }),
      mainBankAnalysis: z.any().optional(),
      subBankAnalysis: z.any().optional(),
      crossBankTransfers: z.array(z.any()),
      factoringCompaniesDetected: z.array(z.any()),
    }),
    summary: z.string(),
  }),
  
  execute: async ({ inputData }) => {
    const { recordId, phase1Results } = inputData;
    
    console.log(`\n${"=".repeat(80)}`);
    console.log(`[Phase 2] 通帳分析開始 - recordId: ${recordId}`);
    console.log(`${"=".repeat(80)}\n`);
    
    try {
      const startTime = Date.now();
      
      // ========================================
      // ステップ1: OCR処理
      // ========================================
      console.log(`[Phase 2 - Step 1/4] OCR処理開始`);
      const ocrStartTime = Date.now();
      
      const ocrResult = await googleVisionBankStatementOcrToolImproved.execute!({
        context: {
          recordId,
          mainBankFieldName: "メイン通帳＿添付ファイル",
          subBankFieldName: "その他通帳＿添付ファイル",
          maxPagesPerFile: 50,
        },
        runtimeContext: new RuntimeContext(),
      });
      
      const ocrDuration = Date.now() - ocrStartTime;
      console.log(`[Phase 2 - Step 1/4] OCR処理完了 - 処理時間: ${ocrDuration}ms`);
      console.log(`  - メイン通帳: ${ocrResult.mainBankDocuments.length}件 (${ocrResult.mainBankDocuments.reduce((sum, doc) => sum + doc.pageCount, 0)}ページ)`);
      console.log(`  - サブ通帳: ${ocrResult.subBankDocuments.length}件 (${ocrResult.subBankDocuments.reduce((sum, doc) => sum + doc.pageCount, 0)}ページ)`);
      
      if (!ocrResult.success) {
        throw new Error(`OCR処理失敗: ${ocrResult.error}`);
      }
      
      // ========================================
      // ステップ2: メイン通帳AI分析（1回のAPI呼び出しで完結）
      // ========================================
      let mainBankAnalysis: any = null;
      let mainBankAICost = 0;
      
      if (ocrResult.mainBankDocuments.length > 0) {
        console.log(`\n[Phase 2 - Step 2/4] メイン通帳AI分析開始`);
        const mainBankStartTime = Date.now();
        
        // Kintone担保情報の取得
        const config = getEnvConfig();
        const recordUrl = `https://${config.KINTONE_DOMAIN}/k/v1/records.json?app=${config.APP_ID}&query=$id="${recordId}"`;
        
        const recordResponse = await axios.get(recordUrl, {
          headers: { "X-Cybozu-API-Token": config.KINTONE_API_TOKEN },
        });
        
        const record = recordResponse.data.records[0];
        const collateralInfo = record.担保情報?.value || [];
        
        // 現在の月を取得（日本時間）
        const now = new Date();
        const currentMonth = now.getMonth() + 1; // 1-12
        const currentYear = now.getFullYear();
        
        // 過去3ヶ月の月名を生成
        const getMonthName = (offset: number) => {
          const date = new Date(currentYear, currentMonth - 1 - offset, 1);
          return `${date.getFullYear()}年${date.getMonth() + 1}月`;
        };
        
        const collaterals = collateralInfo.map((item: any) => ({
          会社名: item.value?.会社名_第三債務者_担保?.value || "",
          先々月: Number(item.value?.過去の入金_先々月?.value || 0),
          先月: Number(item.value?.過去の入金_先月?.value || 0),
          今月: Number(item.value?.過去の入金_今月?.value || 0),
        }));
        
        console.log(`  - 担保情報: ${collaterals.length}社取得`);
        
        // OCRテキストを結合
        const mainBankText = ocrResult.mainBankDocuments
          .map(doc => `【${doc.fileName}】\n${doc.text}`)
          .join("\n\n---\n\n");
        
        // AI分析プロンプト（1回で全て完結）
        const analysisPrompt = `
あなたは通帳分析の専門家です。以下の通帳OCRテキストを分析し、担保情報との照合とリスク検出を行ってください。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【通帳OCRテキスト（メイン通帳・法人口座）】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${mainBankText}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【Kintone担保情報（期待される入金）】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${collaterals.map((c: any, idx: number) => `
${idx + 1}. ${c.会社名}
   - ${getMonthName(2)}（先々月）: ¥${c.先々月.toLocaleString()}
   - ${getMonthName(1)}（先月）: ¥${c.先月.toLocaleString()}
   - ${getMonthName(0)}（今月）: ¥${c.今月.toLocaleString()}
`).join('\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【分析指示】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

■ タスク1: 全取引の抽出
- 通帳から全ての取引（入金・出金）を抽出
- 日付、金額、振込元/振込先名、摘要を正確に読み取る
- 金額: 入金はプラス、出金はマイナスで表現

■ タスク2: 担保情報との照合（最重要）

【企業名の表記ゆれ対応ルール】
⚠️ 以下は全て同一企業として扱ってください:
- 「株式会社ABC建設」「(カ)ABCケンセツ」「ABCケンセツ」「ABC建設」
- 「有限会社XYZ工業」「(ユ)XYZコウギョウ」「XYZ工業」
- 法人格（株式会社、有限会社、(カ)、(ユ)など）の有無は無視
- カタカナ・漢字の違いは同一企業と判断
- 略称・省略形も考慮（例: 「中央」と「チュウオウ」）

【処理手順】
各企業について以下の手順で処理:

ステップ1: **該当企業の全入金を抽出**
- 通帳全体から、その企業に該当する全ての入金取引を抽出
- 月に関係なく、全ての入金を列挙
- 企業名の表記ゆれを考慮して漏れなく抽出

ステップ2: **期待値との照合分析**
- 抽出した全入金の中から、各月の期待値と照合
- 単独の取引で一致する場合 → その取引を記録
- 単独で一致しない場合 → 複数の取引を足し算して期待値になる組み合わせを探す
- 組み合わせが見つかった場合 → 「分割入金」として記録
- どうしても一致しない場合 → 「該当なし」

【照合ルール】
1. **完全一致**: 1つの入金が期待値と完全一致（±1,000円以内）→ 信頼度100%
2. **分割入金**: 複数の入金を合算して期待値と一致（±1,000円以内）→ 信頼度95%
3. **不一致**: 該当する入金がない、または合算しても一致しない → 信頼度0%

■ タスク3: リスク検出

【ギャンブル検出】
以下のキーワードを含む取引を検出:
- パチンコ、スロット、PACHINKO、SLOT
- 競馬、競輪、競艇、KEIBA、KEIRIN、KYOTEI
- カジノ、CASINO
- 宝くじ、ロト、LOTO

【大口出金検出】
- ¥500,000以上の出金を検出
- 振込先・摘要も記録

【資金移動検出】
- 同日内に同額または近似額（±100円）の入出金がある場合を検出

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【出力形式】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

以下のJSON形式で出力してください。
`;
        
        const schema = z.object({
          allTransactions: z.array(z.object({
            date: z.string().describe("YYYY-MM-DD形式"),
            amount: z.number().describe("金額（プラス=入金、マイナス=出金）"),
            payerOrPayee: z.string().describe("振込元/振込先名"),
            description: z.string().optional().describe("摘要"),
          })),
          
          collateralMatches: z.array(z.object({
            company: z.string().describe("企業名（Kintone登録名）"),
            allRelatedTransactions: z.array(z.object({
              date: z.string(),
              amount: z.number(),
              payer: z.string().describe("通帳に記載されている振込元名"),
            })).describe("この企業に関連する全ての入金（月に関係なく全て）"),
            monthlyAnalysis: z.array(z.object({
              month: z.string().describe("対象月"),
              expectedAmount: z.number().describe("期待値"),
              matchedTransactions: z.array(z.object({
                date: z.string(),
                amount: z.number(),
                payer: z.string().describe("通帳に記載されている振込元名"),
              })),
              totalMatched: z.number().describe("一致した入金の合計"),
              difference: z.number().describe("差異（期待値 - 実際）"),
              matched: z.boolean().describe("一致したか"),
              matchType: z.string().describe("完全一致/分割入金/該当なし"),
              confidence: z.number().describe("信頼度0-100"),
            })),
          })),
          
          riskDetection: z.object({
            gambling: z.array(z.object({
              date: z.string(),
              amount: z.number(),
              destination: z.string(),
              keyword: z.string().describe("一致したキーワード"),
            })),
            largeCashWithdrawals: z.array(z.object({
              date: z.string(),
              amount: z.number(),
              destination: z.string(),
            })),
            fundTransfers: z.array(z.object({
              date: z.string(),
              amount: z.number(),
              from: z.string(),
              to: z.string(),
            })),
          }),
        });
        
        const result = await generateObject({
          model: openai("gpt-4o"),
          prompt: analysisPrompt,
          schema,
        });
        
        mainBankAnalysis = result.object;
        
        // AI APIコストの推定
        const inputTokens = Math.ceil(analysisPrompt.length / 4);
        const outputTokens = Math.ceil(JSON.stringify(result.object).length / 4);
        mainBankAICost = (inputTokens / 1000) * 0.003 + (outputTokens / 1000) * 0.015;
        
        const mainBankDuration = Date.now() - mainBankStartTime;
        console.log(`[Phase 2 - Step 2/4] メイン通帳AI分析完了 - 処理時間: ${mainBankDuration}ms`);
        console.log(`  - 抽出取引数: ${mainBankAnalysis.allTransactions.length}件`);
        console.log(`  - 照合企業数: ${mainBankAnalysis.collateralMatches.length}社`);
        
        // 結果表示
        console.log(`\n${"━".repeat(80)}`);
        console.log(`メイン通帳分析結果`);
        console.log(`${"━".repeat(80)}\n`);
        
        for (const match of mainBankAnalysis.collateralMatches) {
          console.log(`【企業: ${match.company}】\n`);
          
          console.log(`＜Kintone担保情報（期待される入金）＞`);
          match.monthlyAnalysis.forEach((month: any) => {
            console.log(`  - ${month.month}: ¥${month.expectedAmount.toLocaleString()}`);
          });
          
          console.log(`\n＜OCR抽出（${match.company}の全入金）＞`);
          if (match.allRelatedTransactions.length > 0) {
            match.allRelatedTransactions.forEach((t: any, idx: number) => {
              console.log(`  ${idx + 1}. ${t.date}: +¥${t.amount.toLocaleString()} 「${t.payer}」`);
            });
          } else {
            console.log(`  該当する入金なし`);
          }
          
          console.log(`\n＜照合分析＞`);
          match.monthlyAnalysis.forEach((month: any) => {
            const icon = month.matched ? "✓" : "✗";
            const status = month.matched ? "一致" : "不一致";
            console.log(`  ${icon} ${month.month}: ${status} (${month.matchType})`);
            console.log(`     期待値: ¥${month.expectedAmount.toLocaleString()}`);
            
            if (month.matched && month.matchedTransactions.length > 0) {
              console.log(`     使用した取引:`);
              month.matchedTransactions.forEach((t: any, idx: number) => {
                console.log(`       ${idx + 1}. ${t.date}: +¥${t.amount.toLocaleString()} 「${t.payer}」`);
              });
              console.log(`     合計: ¥${month.totalMatched.toLocaleString()}`);
              console.log(`     差異: ¥${Math.abs(month.difference).toLocaleString()}`);
            } else {
              console.log(`     ⚠️ 該当する入金が見つからない、または合算しても一致しない`);
            }
            console.log();
          });
        }
        
        console.log(`【リスク検出】\n`);
        
        console.log(`＜ギャンブル＞`);
        console.log(`  検出ルール: パチンコ、スロット、競馬、競輪、競艇、カジノ、宝くじ`);
        if (mainBankAnalysis.riskDetection.gambling.length > 0) {
          console.log(`  ⚠️ 検出: ${mainBankAnalysis.riskDetection.gambling.length}件`);
          mainBankAnalysis.riskDetection.gambling.forEach((g: any, idx: number) => {
            console.log(`    ${idx + 1}. ${g.date}: -¥${Math.abs(g.amount).toLocaleString()} 「${g.destination}」`);
            console.log(`       一致キーワード: 「${g.keyword}」`);
          });
        } else {
          console.log(`  検出なし`);
        }
        
        console.log(`\n＜大口出金＞`);
        console.log(`  検出ルール: ¥500,000以上の出金`);
        if (mainBankAnalysis.riskDetection.largeCashWithdrawals.length > 0) {
          console.log(`  検出: ${mainBankAnalysis.riskDetection.largeCashWithdrawals.length}件`);
          mainBankAnalysis.riskDetection.largeCashWithdrawals.forEach((w: any, idx: number) => {
            console.log(`    ${idx + 1}. ${w.date}: -¥${Math.abs(w.amount).toLocaleString()} 「${w.destination}」`);
          });
        } else {
          console.log(`  検出なし`);
        }
        
        console.log(`\n＜資金移動＞`);
        console.log(`  検出ルール: 同日内の同額または近似額（±100円）の入出金`);
        if (mainBankAnalysis.riskDetection.fundTransfers.length > 0) {
          console.log(`  検出: ${mainBankAnalysis.riskDetection.fundTransfers.length}件`);
          mainBankAnalysis.riskDetection.fundTransfers.forEach((t: any, idx: number) => {
            console.log(`    ${idx + 1}. ${t.date}: ¥${t.amount.toLocaleString()}`);
            console.log(`       ${t.from} → ${t.to}`);
          });
        } else {
          console.log(`  検出なし`);
        }
        
        console.log(`\n${"━".repeat(80)}\n`);
      } else {
        console.log(`\n[Phase 2 - Step 2/4] メイン通帳分析スキップ（ファイルなし）`);
      }
      
      // ========================================
      // ステップ3: サブ通帳AI分析
      // ========================================
      let subBankAnalysis: any = null;
      let subBankAICost = 0;
      
      if (ocrResult.subBankDocuments.length > 0) {
        console.log(`\n[Phase 2 - Step 3/4] サブ通帳AI分析開始`);
        const subBankStartTime = Date.now();
        
        const subBankText = ocrResult.subBankDocuments
          .map(doc => `【${doc.fileName}】\n${doc.text}`)
          .join("\n\n---\n\n");
        
        const subAnalysisPrompt = `
あなたは通帳分析の専門家です。以下のサブ通帳（個人口座）のOCRテキストを分析し、リスク検出を行ってください。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【通帳OCRテキスト（サブ通帳・個人口座）】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${subBankText}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【分析指示】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

■ タスク1: 全取引の抽出
- 通帳から全ての取引（入金・出金）を抽出

■ タスク2: リスク検出

【ギャンブル検出】
キーワード: パチンコ、スロット、競馬、競輪、競艇、カジノ、宝くじ

【大口出金検出】
閾値: ¥500,000以上の出金

JSON形式で出力してください。
`;
        
        const subSchema = z.object({
          allTransactions: z.array(z.object({
            date: z.string(),
            amount: z.number(),
            payerOrPayee: z.string(),
            description: z.string().optional(),
          })),
          riskDetection: z.object({
            gambling: z.array(z.object({
              date: z.string(),
              amount: z.number(),
              destination: z.string(),
              keyword: z.string(),
            })),
            largeCashWithdrawals: z.array(z.object({
              date: z.string(),
              amount: z.number(),
              destination: z.string(),
            })),
          }),
        });
        
        const subResult = await generateObject({
          model: openai("gpt-4o"),
          prompt: subAnalysisPrompt,
          schema: subSchema,
        });
        
        subBankAnalysis = subResult.object;
        
        const inputTokens = Math.ceil(subAnalysisPrompt.length / 4);
        const outputTokens = Math.ceil(JSON.stringify(subResult.object).length / 4);
        subBankAICost = (inputTokens / 1000) * 0.003 + (outputTokens / 1000) * 0.015;
        
        const subBankDuration = Date.now() - subBankStartTime;
        console.log(`[Phase 2 - Step 3/4] サブ通帳AI分析完了 - 処理時間: ${subBankDuration}ms`);
        console.log(`  - 抽出取引数: ${subBankAnalysis.allTransactions.length}件`);
        
        // 結果表示
        console.log(`\n${"━".repeat(80)}`);
        console.log(`サブ通帳分析結果`);
        console.log(`${"━".repeat(80)}\n`);
        
        console.log(`【リスク検出】\n`);
        
        console.log(`＜ギャンブル＞`);
        if (subBankAnalysis.riskDetection.gambling.length > 0) {
          console.log(`  ⚠️ 検出: ${subBankAnalysis.riskDetection.gambling.length}件`);
          subBankAnalysis.riskDetection.gambling.forEach((g: any, idx: number) => {
            console.log(`    ${idx + 1}. ${g.date}: -¥${Math.abs(g.amount).toLocaleString()} 「${g.destination}」`);
            console.log(`       一致キーワード: 「${g.keyword}」`);
          });
        } else {
          console.log(`  検出なし`);
        }
        
        console.log(`\n＜大口出金＞`);
        if (subBankAnalysis.riskDetection.largeCashWithdrawals.length > 0) {
          console.log(`  検出: ${subBankAnalysis.riskDetection.largeCashWithdrawals.length}件`);
          subBankAnalysis.riskDetection.largeCashWithdrawals.forEach((w: any, idx: number) => {
            console.log(`    ${idx + 1}. ${w.date}: -¥${Math.abs(w.amount).toLocaleString()} 「${w.destination}」`);
          });
        } else {
          console.log(`  検出なし`);
        }
        
        console.log(`\n${"━".repeat(80)}\n`);
      } else {
        console.log(`\n[Phase 2 - Step 3/4] サブ通帳分析スキップ（ファイルなし）`);
      }
      
      // ========================================
      // ステップ4: 統合分析（通帳間資金移動・他社ファクタリング）
      // ========================================
      console.log(`\n[Phase 2 - Step 4/4] 統合分析開始`);
      
      const crossBankTransfers: any[] = [];
      const factoringCompaniesDetected: any[] = [];
      
      // 他社ファクタリング業者リスト
      const factoringCompanies = [
        "ビートレーディング", "BUY TRADING", "ビーティー",
        "アクセルファクター", "ACCEL FACTOR",
        "三共サービス", "SANKYO SERVICE",
        "OLTA", "オルタ",
        "ペイトナー", "PAYTONAR",
        "日本中小企業金融サポート機構",
        "ベストファクター",
        "トラストゲートウェイ",
        "QuQuMo", "ククモ",
        "labol", "ラボル",
        "GMO", "ジーエムオー",
        "エスコム",
        "えんナビ",
      ];
      
      // 通帳間資金移動検出
      if (mainBankAnalysis && subBankAnalysis) {
        const mainTransactions = mainBankAnalysis.allTransactions;
        const subTransactions = subBankAnalysis.allTransactions;
        
        for (const mainOut of mainTransactions.filter((t: any) => t.amount < 0)) {
          const subIn = subTransactions.find((t: any) => {
            const dateDiff = Math.abs(new Date(t.date).getTime() - new Date(mainOut.date).getTime());
            const oneDayInMs = 24 * 60 * 60 * 1000;
            return t.amount > 0 &&
                   dateDiff <= oneDayInMs &&
                   Math.abs(t.amount - Math.abs(mainOut.amount)) < 1000;
          });
          
          if (subIn) {
            crossBankTransfers.push({
              date: mainOut.date,
              amount: Math.abs(mainOut.amount),
              from: "メイン",
              to: "サブ",
            });
          }
        }
        
        for (const subOut of subTransactions.filter((t: any) => t.amount < 0)) {
          const mainIn = mainTransactions.find((t: any) => {
            const dateDiff = Math.abs(new Date(t.date).getTime() - new Date(subOut.date).getTime());
            const oneDayInMs = 24 * 60 * 60 * 1000;
            return t.amount > 0 &&
                   dateDiff <= oneDayInMs &&
                   Math.abs(t.amount - Math.abs(subOut.amount)) < 1000;
          });
          
          if (mainIn) {
            crossBankTransfers.push({
              date: subOut.date,
              amount: Math.abs(subOut.amount),
              from: "サブ",
              to: "メイン",
            });
          }
        }
      }
      
      // 他社ファクタリング業者検出
      const allTransactions = [
        ...(mainBankAnalysis?.allTransactions || []),
        ...(subBankAnalysis?.allTransactions || []),
      ];
      
      for (const transaction of allTransactions) {
        for (const company of factoringCompanies) {
          const normalized = transaction.payerOrPayee.replace(/\s/g, '').toLowerCase();
          const normalizedCompany = company.replace(/\s/g, '').toLowerCase();
          
          if (normalized.includes(normalizedCompany)) {
            factoringCompaniesDetected.push({
              companyName: company,
              date: transaction.date,
              amount: transaction.amount,
              transactionType: transaction.amount > 0 ? "入金" : "出金",
              payerOrPayee: transaction.payerOrPayee,
            });
          }
        }
      }
      
      console.log(`[Phase 2 - Step 4/4] 統合分析完了`);
      console.log(`  - 通帳間資金移動: ${crossBankTransfers.length}件`);
      console.log(`  - 他社ファクタリング: ${factoringCompaniesDetected.length}件`);
      
      if (crossBankTransfers.length > 0 || factoringCompaniesDetected.length > 0) {
        console.log(`\n${"━".repeat(80)}`);
        console.log(`統合分析結果`);
        console.log(`${"━".repeat(80)}\n`);
        
        if (crossBankTransfers.length > 0) {
          console.log(`【通帳間資金移動】`);
          console.log(`  検出ルール: 前後1日以内、±1,000円以内の入出金\n`);
          crossBankTransfers.forEach((t, idx) => {
            console.log(`  ${idx + 1}. ${t.date}: ¥${t.amount.toLocaleString()}`);
            console.log(`     ${t.from} → ${t.to}`);
          });
          console.log();
        }
        
        if (factoringCompaniesDetected.length > 0) {
          console.log(`【他社ファクタリング業者検出】`);
          console.log(`  検出ルール: 約50社の業者リストと照合\n`);
          console.log(`  ⚠️ 検出: ${factoringCompaniesDetected.length}件`);
          factoringCompaniesDetected.forEach((f, idx) => {
            const sign = f.transactionType === "入金" ? "+" : "-";
            console.log(`    ${idx + 1}. ${f.date}: ${sign}¥${Math.abs(f.amount).toLocaleString()} (${f.transactionType})`);
            console.log(`       業者名: 「${f.companyName}」`);
            console.log(`       通帳記載: 「${f.payerOrPayee}」`);
          });
        }
        
        console.log(`\n${"━".repeat(80)}\n`);
      }
      
      // ========================================
      // 結果のサマリー生成
      // ========================================
      const totalDuration = Date.now() - startTime;
      const totalCost = ocrResult.costAnalysis.googleVisionCost + mainBankAICost + subBankAICost;
      
      // 人間が読みやすい結果データを作成
      const readableResults: any = {
        処理時間: `${(totalDuration / 1000).toFixed(2)}秒`,
        コスト: `$${totalCost.toFixed(4)}`,
        通帳間資金移動: crossBankTransfers.length,
        他社ファクタリング: factoringCompaniesDetected.length,
      };
      
      if (mainBankAnalysis) {
        // 各企業の月次照合結果を集計
        let totalMonths = 0;
        let matchedMonths = 0;
        let totalConfidence = 0;
        let confidenceCount = 0;
        
        mainBankAnalysis.collateralMatches.forEach((m: any) => {
          m.monthlyAnalysis.forEach((month: any) => {
            totalMonths++;
            if (month.matched) {
              matchedMonths++;
            }
            if (month.confidence > 0) {
              totalConfidence += month.confidence;
              confidenceCount++;
            }
          });
        });
        
        const avgConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;
        
        readableResults.メイン通帳 = {
          照合結果: {
            対象企業数: mainBankAnalysis.collateralMatches.length,
            総月数: totalMonths,
            一致月数: matchedMonths,
            不一致月数: totalMonths - matchedMonths,
            平均信頼度: parseFloat(avgConfidence.toFixed(1)),
          },
          リスク検出: {
            ギャンブル: mainBankAnalysis.riskDetection.gambling.length,
            大口出金: mainBankAnalysis.riskDetection.largeCashWithdrawals.length,
            資金移動: mainBankAnalysis.riskDetection.fundTransfers.length,
          },
        };
      }
      
      if (subBankAnalysis) {
        readableResults.サブ通帳 = {
          リスク検出: {
            ギャンブル: subBankAnalysis.riskDetection.gambling.length,
            大口出金: subBankAnalysis.riskDetection.largeCashWithdrawals.length,
          },
        };
      }
      
      const summary = `
Phase 2 処理完了 - recordId: ${recordId}
${"━".repeat(80)}
【処理時間】
  - OCR処理: ${(ocrDuration / 1000).toFixed(2)}秒
  - メイン通帳分析: ${mainBankAnalysis ? "実施" : "スキップ"}
  - サブ通帳分析: ${subBankAnalysis ? "実施" : "スキップ"}
  - 合計: ${(totalDuration / 1000).toFixed(2)}秒

【コスト分析】
  - Google Vision API: $${ocrResult.costAnalysis.googleVisionCost.toFixed(4)}
  - Claude API: $${(mainBankAICost + subBankAICost).toFixed(4)}
  - 合計: $${totalCost.toFixed(4)} (約¥${Math.round(totalCost * 150)})
${"━".repeat(80)}
`.trim();
      
      console.log(`\n${summary}\n`);
      
      return {
        recordId,
        結果サマリー: readableResults,
        phase2Results: {
          ocr: {
            success: ocrResult.success,
            mainBankDocuments: ocrResult.mainBankDocuments,
            subBankDocuments: ocrResult.subBankDocuments,
            processingDetails: ocrResult.processingDetails,
          },
          mainBankAnalysis,
          subBankAnalysis,
          crossBankTransfers,
          factoringCompaniesDetected,
        },
        summary,
      };
      
    } catch (error: any) {
      console.error(`\n[Phase 2] エラー発生:`, error.message);
      console.error(error);
      
      throw new Error(`Phase 2 処理失敗: ${error.message}`);
    }
  },
});
