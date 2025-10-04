import { createStep } from "@mastra/core/workflows";
import { RuntimeContext } from "@mastra/core/runtime-context";
import { z } from "zod";
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
 * Phase 4: 最終分析・レポート生成ステップ
 * 全フェーズの結果とKintoneデータを統合し、AIによる包括的な審査レポートを生成
 */
export const phase4FinalAnalysisStep = createStep({
  id: "phase4-final-analysis",
  description: "最終分析・レポート生成（全データ統合・AI総合評価）",
  
  inputSchema: z.object({
    recordId: z.string().describe("KintoneレコードID"),
    phase1Results: z.any().describe("Phase 1の結果（買取・担保情報）"),
    phase2Results: z.any().optional().describe("Phase 2の結果（通帳分析）"),
    phase3Results: z.any().optional().describe("Phase 3の結果（本人確認・企業実在性）"),
  }),
  
  outputSchema: z.object({
    recordId: z.string(),
    
    // 最終判定
    最終判定: z.enum(["承諾", "リスクあり承諾", "否認"]),
    リスクレベル: z.enum(["低リスク", "中リスク", "高リスク"]),
    総評: z.string(),
    
    // 審査サマリー
    審査サマリー: z.object({
      申込者: z.string(),
      申込企業: z.string(),
      買取先: z.string(),
      買取額: z.string(),
      総債権額: z.string(),
      掛目: z.string(),
      審査日: z.string(),
      処理時間: z.string(),
      総コスト: z.string(),
    }),
    
    // 詳細評価データ
    回収可能性評価: z.any(),
    担保の安定性評価: z.any(),
    申込者信頼性評価: z.any().optional(),
    リスク要因評価: z.any(),
    推奨事項: z.array(z.any()),
    留意事項: z.array(z.string()),
    
    // 全Phase結果（引き継ぎ）
    phase1Results: z.any(),
    phase2Results: z.any().optional(),
    phase3Results: z.any().optional(),
    phase4Results: z.any(),
  }),
  
  execute: async ({ inputData }) => {
    const startTime = Date.now();
    const { recordId, phase1Results, phase2Results, phase3Results } = inputData;
    
    console.log(`\n${"=".repeat(80)}`);
    console.log(`[Phase 4] 最終分析・レポート生成開始 - recordId: ${recordId}`);
    console.log(`${"=".repeat(80)}\n`);
    
    try {
      // ========================================
      // Step 1: Kintoneデータ取得
      // ========================================
      console.log(`[Phase 4 - Step 1/4] Kintoneデータ取得`);
      
      const config = getEnvConfig();
      const recordUrl = `https://${config.KINTONE_DOMAIN}/k/v1/records.json?app=${config.APP_ID}&query=$id="${recordId}"`;
      
      const recordResponse = await axios.get(recordUrl, {
        headers: { "X-Cybozu-API-Token": config.KINTONE_API_TOKEN },
      });
      
      if (recordResponse.data.records.length === 0) {
        throw new Error(`レコードID: ${recordId} が見つかりません`);
      }
      
      const record = recordResponse.data.records[0];
      
      // 基本情報
      const 氏名 = record.顧客情報＿氏名?.value || "";
      const 生年月日 = record.生年月日?.value || "";
      const 屋号 = record.屋号?.value || "";
      const 会社名 = record.会社名?.value || "";
      const 申込企業 = 会社名 || 屋号 || "不明";
      const 事業形態 = 会社名 ? "法人" : "個人事業主";
      
      // 年齢計算
      const 年齢 = calculateAge(生年月日);
      
      // 買取情報テーブル
      const 買取情報 = record.買取情報?.value || [];
      const 買取額 = 買取情報.reduce((sum: number, item: any) => 
        sum + parseInt(item.value?.買取額?.value || "0"), 0);
      const 総債権額 = 買取情報.reduce((sum: number, item: any) => 
        sum + parseInt(item.value?.総債権額?.value || "0"), 0);
      
      // 担保情報テーブル
      const 担保情報 = record.担保情報?.value || [];
      
      console.log(`  - 申込者: ${氏名}（${年齢}歳）`);
      console.log(`  - 申込企業: ${申込企業}（${事業形態}）`);
      console.log(`  - 買取額: ¥${買取額.toLocaleString()}`);
      console.log(`  - 総債権額: ¥${総債権額.toLocaleString()}`);
      
      const kintoneData = {
        氏名,
        生年月日,
        年齢,
        屋号,
        会社名,
        申込企業,
        事業形態,
        買取額,
        総債権額,
        買取情報,
        担保情報,
      };
      
      // ========================================
      // Step 2: カテゴリ別データ統合
      // ========================================
      console.log(`\n[Phase 4 - Step 2/4] カテゴリ別データ統合`);
      
      // 回収可能性評価
      const 回収可能性評価 = integrateRecoverability(
        phase1Results,
        phase3Results,
        kintoneData
      );
      console.log(`  - 回収可能性評価: 完了`);
      
      // 担保の安定性評価
      const 担保の安定性評価 = integrateCollateralStability(
        phase1Results,
        phase2Results,
        phase3Results,
        kintoneData
      );
      console.log(`  - 担保の安定性評価: 完了`);
      
      // 申込者信頼性評価
      let 申込者信頼性評価 = null;
      if (phase3Results) {
        申込者信頼性評価 = integrateApplicantReliability(
          phase3Results,
          kintoneData
        );
        console.log(`  - 申込者信頼性評価: 完了`);
      } else {
        console.log(`  - 申込者信頼性評価: スキップ（Phase 3未実行）`);
      }
      
      // リスク要因評価
      const リスク要因評価 = integrateRiskFactors(
        phase1Results,
        phase2Results,
        kintoneData
      );
      console.log(`  - リスク要因評価: 完了`);
      
      // ========================================
      // Step 3: AIによる総合評価（GPT-4.1）
      // ========================================
      console.log(`\n[Phase 4 - Step 3/4] AIによる総合評価（GPT-4.1）`);
      const aiStartTime = Date.now();
      
      const evaluationPrompt = buildEvaluationPrompt(
        回収可能性評価,
        担保の安定性評価,
        申込者信頼性評価,
        リスク要因評価,
        kintoneData
      );
      
      const aiResult = await generateObject({
        model: openai("gpt-4o-2024-08-06"),
        prompt: evaluationPrompt,
        schema: z.object({
          最終判定: z.enum(["承諾", "リスクあり承諾", "否認"]),
          リスクレベル: z.enum(["低リスク", "中リスク", "高リスク"]),
          総評: z.string().describe("6つのセクション構成（回収可能性、担保安定性、買取真正性、申込者信頼性、リスク要因、結論）"),
          推奨事項: z.array(z.object({
            対応策: z.string(),
            優先度: z.enum(["高", "中", "低"]),
            理由: z.string(),
            期待効果: z.string(),
          })),
          留意事項: z.array(z.string()),
        }),
        temperature: 0.3,
      });
      
      const aiDuration = Date.now() - aiStartTime;
      console.log(`  - AI評価完了: ${aiDuration}ms`);
      console.log(`  - 最終判定: ${aiResult.object.最終判定}`);
      console.log(`  - リスクレベル: ${aiResult.object.リスクレベル}`);
      
      // ========================================
      // Step 4: レポート生成
      // ========================================
      console.log(`\n[Phase 4 - Step 4/4] レポート生成`);
      
      const totalDuration = Date.now() - startTime;
      const phase1Time = phase1Results?.summary?.match(/合計: ([\d.]+)秒/)?.[1] || "0";
      const phase2Time = phase2Results?.summary?.match(/合計: ([\d.]+)秒/)?.[1] || "0";
      const phase3Time = phase3Results?.summary?.match(/(\d+\.\d+)秒/)?.[1] || "0";
      const phase4Time = (totalDuration / 1000).toFixed(2);
      
      const phase1Cost = parseFloat(phase1Results?.結果サマリー?.コスト?.replace("$", "") || "0");
      const phase2Cost = parseFloat(phase2Results?.結果サマリー?.コスト?.replace("$", "") || "0");
      const phase3Cost = 0.02; // Phase 3の概算
      const phase4Cost = 0.005; // Phase 4の概算
      const totalCost = phase1Cost + phase2Cost + phase3Cost + phase4Cost;
      
      // 掛目計算
      const 掛目 = 総債権額 > 0 ? ((買取額 / 総債権額) * 100).toFixed(1) : "0.0";
      
      // 買取先企業リスト
      const 買取先リスト = phase1Results?.phase1Results?.purchaseVerification?.purchaseInfo?.debtorCompanies || [];
      const 買取先 = 買取先リスト.length > 0
        ? 買取先リスト.length === 1
          ? 買取先リスト[0].name
          : `${買取先リスト[0].name} ほか${買取先リスト.length - 1}社`
        : "不明";
      
      const 審査サマリー = {
        申込者: `${氏名}（${年齢}歳）`,
        申込企業: `${申込企業}（${事業形態}${会社名 && 担保情報.length > 0 ? `・所在地: あり` : ""}）`,
        買取先,
        買取額: `¥${買取額.toLocaleString()}`,
        総債権額: `¥${総債権額.toLocaleString()}`,
        掛目: `${掛目}%`,
        審査日: new Date().toISOString().split('T')[0] + " " + new Date().toTimeString().split(' ')[0],
        処理時間: `${(parseFloat(phase1Time) + parseFloat(phase2Time) + parseFloat(phase3Time) + parseFloat(phase4Time)).toFixed(1)}秒`,
        総コスト: `$${totalCost.toFixed(4)}`,
      };
      
      console.log(`\n${"=".repeat(80)}`);
      console.log(`[Phase 4] 最終分析・レポート生成完了 - 処理時間: ${phase4Time}秒`);
      console.log(`${"=".repeat(80)}\n`);
      
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`【最終判定】`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(aiResult.object.最終判定);
      console.log();
      console.log(`【リスクレベル】`);
      console.log(aiResult.object.リスクレベル);
      console.log();
      console.log(`【総評】`);
      console.log(aiResult.object.総評);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
      
      return {
        recordId,
        
        // 最終判定
        最終判定: aiResult.object.最終判定,
        リスクレベル: aiResult.object.リスクレベル,
        総評: aiResult.object.総評,
        
        // 審査サマリー
        審査サマリー,
        
        // 詳細評価データ
        回収可能性評価,
        担保の安定性評価,
        申込者信頼性評価,
        リスク要因評価,
        推奨事項: aiResult.object.推奨事項,
        留意事項: aiResult.object.留意事項,
        
        // 全Phase結果（引き継ぎ）
        phase1Results,
        phase2Results,
        phase3Results,
        phase4Results: {
          kintoneData,
          aiEvaluation: aiResult.object,
          processingTime: phase4Time,
        },
      };
      
    } catch (error: any) {
      console.error(`\n[Phase 4] エラー発生:`, error.message);
      console.error(error);
      
      throw new Error(`Phase 4 処理失敗: ${error.message}`);
    }
  },
});


// ========================================
// ヘルパー関数
// ========================================

/**
 * 年齢計算
 */
function calculateAge(birthDateString: string): number {
  if (!birthDateString) return 0;
  
  const birthDate = new Date(birthDateString);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
}

/**
 * 回収可能性評価の統合
 */
function integrateRecoverability(phase1: any, phase3: any, kintone: any): any {
  const 担保企業数 = kintone.担保情報.length;
  const 次回入金予定総額 = kintone.担保情報.reduce((sum: number, item: any) => 
    sum + parseInt(item.value?.請求額?.value || "0"), 0);
  const 買取額 = kintone.買取額;
  const 回収率 = 買取額 > 0 ? Math.round((次回入金予定総額 / 買取額) * 100) : 0;
  const 掛目 = kintone.総債権額 > 0 ? ((買取額 / kintone.総債権額) * 100).toFixed(1) : "0.0";
  
  // 買取情報の真正性
  const purchaseVerification = phase1?.phase1Results?.purchaseVerification;
  const OCR照合 = purchaseVerification?.metadata?.verificationResults?.総合評価 === "一致" ? "✓ 完全一致" : "✗ 不一致";
  
  // 買取先企業の実在性
  const 買取先企業 = phase3?.phase3Results?.companyVerification?.purchaseCompanies || [];
  const 実在確認済み = 買取先企業.filter((c: any) => c.verified).length;
  const 平均信頼度 = 買取先企業.length > 0
    ? Math.round(買取先企業.reduce((sum: number, c: any) => sum + c.confidence, 0) / 買取先企業.length)
    : 0;
  
  return {
    即時回収能力: {
      担保企業数: `${担保企業数}社`,
      次回入金予定総額: `¥${次回入金予定総額.toLocaleString()}`,
      買取額: `¥${買取額.toLocaleString()}`,
      回収率: `${回収率}%`,
      掛目: `${掛目}%（${parseFloat(掛目) <= 80 ? "低リスク" : parseFloat(掛目) <= 90 ? "中リスク" : "高リスク"}）`,
      評価: `${担保企業数}社で買取額の${Math.round(回収率 / 100)}倍をカバー${回収率 >= 500 ? "可能" : 回収率 >= 200 ? "（許容範囲）" : "不十分"}`,
    },
    買取情報の真正性: {
      OCR照合,
      改ざんリスク: OCR照合.includes("✓") ? "なし" : "あり",
      評価: OCR照合.includes("✓") ? "✅ 書類の真正性を確認、取引実在" : "⚠️ OCR不一致、要確認",
    },
    買取先企業の実在性: {
      総数: 買取先企業.length,
      実在確認済み,
      平均信頼度,
      評価: 実在確認済み === 買取先企業.length ? "✅ 全企業実在確認済み、債権回収可能性高い" : `⚠️ ${買取先企業.length - 実在確認済み}社未確認`,
    },
  };
}

/**
 * 担保の安定性評価の統合
 */
function integrateCollateralStability(phase1: any, phase2: any, phase3: any, kintone: any): any {
  const 担保企業数 = kintone.担保情報.length;
  
  // 入金実績の安定性（Phase 2）
  let 過去3ヶ月連続入金 = 0;
  let OCR一致企業 = 0;
  let OCR不一致企業 = 0;
  
  if (phase2?.phase2Results?.mainBankAnalysis?.collateralMatches) {
    const matches = phase2.phase2Results.mainBankAnalysis.collateralMatches;
    
    matches.forEach((match: any) => {
      // 3ヶ月連続入金チェック
      const 全月一致 = match.monthlyResults?.every((m: any) => m.matched);
      if (全月一致) {
        過去3ヶ月連続入金++;
        OCR一致企業++;
      } else {
        const 一致月数 = match.monthlyResults?.filter((m: any) => m.matched).length || 0;
        if (一致月数 >= 2) {
          OCR一致企業++;
        } else {
          OCR不一致企業++;
        }
      }
    });
  }
  
  // 担保企業の実在性と登記情報（Phase 1 + Phase 3）
  const 担保企業リスト = phase3?.phase3Results?.companyVerification?.collateralCompanies || [];
  const 実在確認済み = 担保企業リスト.filter((c: any) => c.verified).length;
  const 平均信頼度 = 担保企業リスト.length > 0
    ? Math.round(担保企業リスト.reduce((sum: number, c: any) => sum + c.confidence, 0) / 担保企業リスト.length)
    : 0;
  
  // 登記情報（Phase 1）
  const 登記情報 = phase1?.phase1Results?.collateralVerification?.collateralInfo?.companies || [];
  const 登記情報取得 = 登記情報.length;
  
  // 資本金・業歴の評価
  const 資本金評価結果 = evaluateCapitalStats(登記情報);
  const 業歴評価結果 = evaluateEstablishedStats(登記情報);
  
  // 担保謄本の有無
  const 担保謄本添付 = phase1?.phase1Results?.ocr?.collateralDocuments?.length || 0;
  
  return {
    入金実績の安定性: {
      対象企業数: 担保企業数,
      過去3ヶ月連続入金,
      OCR一致企業,
      OCR不一致企業,
      評価: 過去3ヶ月連続入金 >= 担保企業数 * 0.8 ? "✅ 安定" : 過去3ヶ月連続入金 >= 担保企業数 * 0.5 ? "△ やや不安定" : "⚠️ 不安定",
    },
    担保企業の実在性と健全性: {
      総数: 担保企業数,
      実在確認済み,
      平均信頼度,
      登記情報取得,
      資本金評価: 資本金評価結果,
      業歴評価: 業歴評価結果,
      評価: `${実在確認済み}社実在確認済み、登記情報${登記情報取得}社取得`,
    },
    担保謄本の有無: {
      担保企業数,
      謄本添付: 担保謄本添付,
      評価: 担保謄本添付 === 0 ? "⚠️ 担保謄本未添付（重大リスク）" : `✅ ${担保謄本添付}社添付`,
      リスク: 担保謄本添付 === 0 ? "債権保全が不十分、追加担保設定が必須" : "債権保全あり",
    },
  };
}

/**
 * 申込者信頼性評価の統合
 */
function integrateApplicantReliability(phase3: any, kintone: any): any {
  const identity = phase3?.phase3Results?.identityVerification;
  const egoSearch = phase3?.phase3Results?.applicantEgoSearch;
  const companyVerification = phase3?.phase3Results?.companyVerification;
  
  // 飛ぶリスク評価
  const 飛ぶリスク = evaluateFlyRisk(kintone.年齢, kintone.事業形態, kintone.会社名);
  
  return {
    本人確認と代表者照合: {
      書類種別: identity?.documentType || "なし",
      照合結果: identity?.verificationResults?.summary || identity?.summary || "未実施",
      評価: identity?.success ? "✅ 本人確認完了、代表者一致" : "⚠️ 照合不一致または未実施",
    },
    申込者属性_飛ぶリスク評価: 飛ぶリスク,
    申込企業の実在性: {
      企業名: kintone.申込企業,
      実在確認: companyVerification?.applicantCompany?.verified ? "✓ 確認済み" : "✗ 未確認",
      信頼度: companyVerification?.applicantCompany?.confidence || 0,
      評価: companyVerification?.applicantCompany?.verified ? "✅ 企業実在確認済み" : "⚠️ 実在確認できず",
    },
    ネガティブ情報: {
      申込者エゴサーチ: {
        ネガティブ情報: egoSearch?.summary?.hasNegativeInfo || false,
        詳細: egoSearch?.summary?.details || "なし",
        評価: egoSearch?.summary?.hasNegativeInfo ? "⚠️ ネガティブ情報あり" : "✅ 問題なし",
      },
      代表者リスク: {
        検索対象: phase3?.phase3Results?.representativeEgoSearches?.length || 0,
        リスク検出: phase3?.phase3Results?.representativeEgoSearches?.filter((r: any) => r.egoSearchResult?.summary?.hasNegativeInfo).length || 0,
        評価: phase3?.phase3Results?.representativeEgoSearches?.some((r: any) => r.egoSearchResult?.summary?.hasNegativeInfo) ? "⚠️ リスクあり" : "✅ 問題なし",
      },
    },
  };
}

/**
 * リスク要因評価の統合
 */
function integrateRiskFactors(phase1: any, phase2: any, kintone: any): any {
  // 通帳リスク（Phase 2）
  const ギャンブル = phase2?.phase2Results?.mainBankAnalysis?.riskDetection?.gambling || [];
  const 他社ファクタリング = phase2?.phase2Results?.factoringCompaniesDetected || [];
  const 大口出金 = phase2?.phase2Results?.mainBankAnalysis?.riskDetection?.largeCashWithdrawals || [];
  
  // 登記情報リスク（Phase 1）
  const 登記情報 = phase1?.phase1Results?.collateralVerification?.collateralInfo?.companies || [];
  const 資本金リスク = 登記情報.filter((c: any) => c.capital && c.capital <= 2000000);
  const 業歴リスク = 登記情報.filter((c: any) => c.establishedDate && c.establishedDate.includes("令和"));
  
  // 担保謄本
  const 担保謄本添付 = phase1?.phase1Results?.ocr?.collateralDocuments?.length || 0;
  
  return {
    通帳リスク: {
      ギャンブル: {
        件数: ギャンブル.length,
        総額: ギャンブル.reduce((sum: number, g: any) => sum + Math.abs(g.amount), 0),
        評価: ギャンブル.length === 0 ? "問題なし" : ギャンブル.length <= 2 && ギャンブル.reduce((sum: number, g: any) => sum + Math.abs(g.amount), 0) <= 100000 ? "低リスク（小額・単発）" : "⚠️ 中～高リスク",
      },
      他社ファクタリング: {
        件数: 他社ファクタリング.length,
        評価: 他社ファクタリング.length === 0 ? "問題なし" : 他社ファクタリング.length <= 2 ? "⚠️ 中リスク（他社利用あり）" : "⚠️ 高リスク（複数社利用）",
      },
      大口出金: {
        件数: 大口出金.length,
        評価: 大口出金.length === 0 ? "問題なし" : "⚠️ 要注意",
      },
    },
    登記情報リスク: {
      資本金リスク: {
        弱い企業: 資本金リスク.length,
        評価: 資本金リスク.length === 0 ? "問題なし" : `⚠️ ${資本金リスク.length}社が資本金¥200万以下`,
      },
      業歴リスク: {
        令和設立企業: 業歴リスク.length,
        評価: 業歴リスク.length === 0 ? "問題なし" : `⚠️ ${業歴リスク.length}社が令和設立`,
      },
    },
    構造リスク: {
      担保謄本: {
        添付: `${担保謄本添付}/${kintone.担保情報.length}社`,
        評価: 担保謄本添付 === 0 ? "⚠️ 高リスク（債権保全不十分）" : "問題あり",
      },
    },
  };
}

/**
 * 資本金統計評価
 */
function evaluateCapitalStats(companies: any[]): any {
  if (companies.length === 0) return { 平均資本金: "¥0", 総合評価: "データなし" };
  
  const capitals = companies.filter(c => c.capital).map(c => c.capital);
  const average = capitals.length > 0 ? Math.round(capitals.reduce((a, b) => a + b, 0) / capitals.length) : 0;
  const 良好 = capitals.filter(c => c >= 5000000).length;
  const 普通 = capitals.filter(c => c >= 3000000 && c < 5000000).length;
  const 弱い = capitals.filter(c => c <= 2000000).length;
  
  return {
    平均資本金: `¥${average.toLocaleString()}`,
    良好_500万以上: 良好,
    普通_300～500万: 普通,
    弱い_200万以下: 弱い,
    総合評価: 良好 >= companies.length * 0.5 ? "✅ 良好" : 弱い > 0 ? `⚠️ ${弱い}社が弱い` : "普通",
  };
}

/**
 * 業歴統計評価
 */
function evaluateEstablishedStats(companies: any[]): any {
  if (companies.length === 0) return { 平均業歴: "0年", 総合評価: "データなし" };
  
  const currentYear = new Date().getFullYear();
  const years = companies.filter(c => c.establishedDate).map(c => {
    const established = c.establishedDate;
    let year = 0;
    if (established.includes("令和")) {
      const reiwaYear = parseInt(established.match(/\d+/)?.[0] || "0");
      year = 2018 + reiwaYear;
    } else if (established.includes("平成")) {
      const heiseiYear = parseInt(established.match(/\d+/)?.[0] || "0");
      year = 1988 + heiseiYear;
    } else if (established.includes("昭和")) {
      const showaYear = parseInt(established.match(/\d+/)?.[0] || "0");
      year = 1925 + showaYear;
    }
    return currentYear - year;
  });
  
  const average = years.length > 0 ? Math.round(years.reduce((a, b) => a + b, 0) / years.length) : 0;
  const 長い = years.filter(y => y >= 20).length;
  const 令和設立 = companies.filter(c => c.establishedDate && c.establishedDate.includes("令和")).length;
  
  return {
    平均業歴: `${average}年`,
    "20年以上": 長い,
    令和設立,
    総合評価: 令和設立 > 0 ? `⚠️ ${令和設立}社が令和設立` : 長い >= companies.length * 0.5 ? "✅ 安定" : "普通",
  };
}

/**
 * 飛ぶリスク評価
 */
function evaluateFlyRisk(age: number, businessType: string, companyName: string): any {
  const 年齢リスク = age < 25 ? "⚠️ 若年層（高リスク）" : age < 30 ? "⚠️ 若年（中リスク）" : "✓ 問題なし";
  const 事業形態リスク = businessType === "個人事業主" ? "⚠️ 個人事業主（高リスク）" : "✓ 法人（低リスク）";
  const 所在地リスク = companyName ? "✓ 所在地あり（追跡可能）" : "⚠️ 所在地なし（高リスク）";
  
  let 総合リスク = "低リスク";
  if (age < 25 && businessType === "個人事業主") {
    総合リスク = "特に高リスク（若年 + 個人事業主）";
  } else if (age < 30 || businessType === "個人事業主") {
    総合リスク = "中～高リスク";
  } else if (age < 30 && businessType === "法人") {
    総合リスク = "中リスク（若年だが法人）";
  }
  
  return {
    年齢: `${age}歳`,
    年齢リスク,
    事業形態: businessType,
    事業形態リスク,
    所在地リスク,
    総合リスク,
    評価: age < 30 ? `⚠️ ${age}歳は要注意${businessType === "法人" && companyName ? "だが、法人・所在地ありのため許容範囲" : ""}` : "✅ 問題なし",
  };
}

/**
 * AI評価プロンプト構築
 */
function buildEvaluationPrompt(
  回収可能性: any,
  担保安定性: any,
  申込者信頼性: any | null,
  リスク要因: any,
  kintone: any
): string {
  return `
あなたはファクタリング審査の専門家です。以下の申込を総合的に評価し、判定してください。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【基本情報】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 申込者: ${kintone.氏名}（${kintone.年齢}歳）
- 申込企業: ${kintone.申込企業}（${kintone.事業形態}）
- 買取額: ¥${kintone.買取額.toLocaleString()}
- 総債権額: ¥${kintone.総債権額.toLocaleString()}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【1. 最重要: 回収可能性】⭐⭐⭐
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

■ 即時回収能力
${JSON.stringify(回収可能性.即時回収能力, null, 2)}

■ 買取情報の真正性
${JSON.stringify(回収可能性.買取情報の真正性, null, 2)}

■ 買取先企業の実在性
${JSON.stringify(回収可能性.買取先企業の実在性, null, 2)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【2. 重要: 担保の安定性】⭐⭐
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

■ 入金実績の安定性
${JSON.stringify(担保安定性.入金実績の安定性, null, 2)}

■ 担保企業の実在性と健全性
${JSON.stringify(担保安定性.担保企業の実在性と健全性, null, 2)}

■ 担保謄本の有無
${JSON.stringify(担保安定性.担保謄本の有無, null, 2)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【3. 重要: 申込者信頼性】⭐⭐
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${申込者信頼性 ? JSON.stringify(申込者信頼性, null, 2) : "Phase 3未実行（データなし）"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【4. リスク要因】⭐
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${JSON.stringify(リスク要因, null, 2)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【評価指示】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

以下の優先順位で評価してください:

**最重要（審査の核心）:**
1. 回収可能性（担保企業数・回収率・OCR確認・買取先実在性）
2. 担保の安定性（入金実績・登記情報・実在性）

**重要（信頼性の基盤）:**
3. 買取情報の真正性（OCR照合・改ざんチェック）
4. 申込者信頼性（本人確認・年齢・事業形態・所在地）

**参考情報:**
5. リスク要因（ギャンブル・他社ファクタリング・登記リスク）

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【判定基準】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**承諾**: 回収率高い + 入金安定 + OCR一致 + 申込者信頼性高い → リスク極めて低い
**リスクあり承諾**: 一部リスクあり（若年、担保未添付、他社利用等）だが、軽減策で対応可能
**否認**: 重大リスク（本人確認不一致、ネガティブ情報、回収率低い等）

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【総評の書き方（重要）】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

以下の6つのセクションで構成してください:

【回収可能性】担保企業X社・次回入金予定総額XXX万円で買取額XXX万円をカバー（回収率XXX%）。OCR照合で全企業の入金実績を確認、改ざんなし。

【担保の安定性】主要担保X社は3ヶ月連続入金、通帳OCRと完全一致。X社すべて実在確認済み（平均信頼度XX点）。登記情報: 平均資本金XXX万円、平均業歴XX年。⚠️ X社が令和設立・資本金低いなど。

【買取の真正性】OCR照合で請求先「XXX」、請求元「XXX」、総債権額XXX万円が完全一致。書類改ざんなし。

【申込者信頼性】本人確認書類で氏名・生年月日・会社名が一致。代表者「XXX」XX歳・法人・本店所在地あり。詐欺歴なし。⚠️ 若年層のため飛ぶリスク中。

【リスク要因】⚠️ 若年層（XX歳）・担保謄本未添付・他社ファクタリング利用X件・担保X社が令和設立など。

【結論】主要担保X社は健全で入金安定、回収率XXX%のため回収リスクは低い。ただしXXXを考慮し「リスクあり承諾」と判定。XXXを条件に承諾推奨。

JSON形式で返答してください。
`;
}

