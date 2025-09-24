import { createWorkflow, createStep } from "@mastra/core/workflows";
import { RuntimeContext } from "@mastra/core/runtime-context";
import { z } from "zod";
import axios from "axios";
import { 
  ocrPurchaseInfoTool,
  ocrBankStatementTool,
  ocrPersonalBankTool,
  ocrIdentityToolV2,
  ocrRegistryToolV2,
  fraudSiteSearchTool,
  companyVerifyAITool,
  paymentAnalysisV2Tool,
} from "../tools";
import { phase3AnalysisAgent } from "../agents/phase3-analysis-agent";

// Phase 1: OCRステップ
const phase1OCRStep = createStep({
  id: "phase1-ocr-processing",
  description: "Phase 1: 書類OCR処理とデータ抽出",
  inputSchema: z.object({
    recordId: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    purchaseData: z.any(),
    bankData: z.any(),
    personalBankData: z.any(),
    identityData: z.any(),
    registryData: z.any(),
    nextPhaseInputs: z.object({
      representativeName: z.string(),
      companyName: z.string(),
    }),
    summary: z.string(),
  }),
  execute: async ({ inputData }) => {
    const { recordId } = inputData;
    
    try {
      console.log(`[PHASE 1] OCR処理開始 (recordId: ${recordId})`);
      
      // Kintoneからデータを取得して動的にtargetCompaniesを構築
      const domain = process.env.KINTONE_DOMAIN;
      const apiToken = process.env.KINTONE_API_TOKEN;
      
      if (!domain || !apiToken) {
        throw new Error("Kintone環境変数が設定されていません");
      }
      
      console.log(`[PHASE 1] Kintoneデータ取得中...`);
      const fileUrl = `https://${domain}/k/v1/records.json?app=37&query=$id="${recordId}"`;
      const recordResponse = await axios.get(fileUrl, {
        headers: { 'X-Cybozu-API-Token': apiToken },
      });
      
      if (!recordResponse.data.records || recordResponse.data.records.length === 0) {
        throw new Error(`レコードID: ${recordId} が見つかりません`);
      }
      
      const record = recordResponse.data.records[0];
      
      // 買取情報から買取企業を取得
      const buyerCompanies: Array<{ name: string; type: "買取" | "申込者" }> = [];
      const purchaseInfo = record.買取情報?.value || [];
      purchaseInfo.forEach((item: any) => {
        const companyName = item.value.会社名_第三債務者_買取?.value;
        if (companyName) {
          buyerCompanies.push({
            name: companyName,
            type: "買取"
          });
        }
      });
      
      // 申込者企業を取得
      const applicantCompany = {
        name: record.屋号?.value || record.会社_屋号名?.value || "不明",
        type: "申込者" as const
      };
      
      const targetCompanies = [...buyerCompanies, applicantCompany];
      console.log(`[PHASE 1] 対象企業: ${targetCompanies.map(c => `${c.name}(${c.type})`).join(', ')}`);
      
      // Phase 1: 順次OCRツール実行
      const purchaseResult = await ocrPurchaseInfoTool.execute({
        context: { recordId },
        runtimeContext: new RuntimeContext(),
      });
      
      // recordIdを結果に含める
      purchaseResult.recordId = recordId;
      
      const bankResult = await ocrBankStatementTool.execute({
        context: { recordId },
        runtimeContext: new RuntimeContext(),
      });
      
      const identityResult = await ocrIdentityToolV2.execute({
        context: { recordId },
        runtimeContext: new RuntimeContext(),
      });
      
      const registryResult = await ocrRegistryToolV2.execute({
        context: { 
          recordId
        },
        runtimeContext: new RuntimeContext(),
      });
      
      // 個人口座OCRツールも実行
      const personalBankResult = await ocrPersonalBankTool.execute({
        context: { recordId },
        runtimeContext: new RuntimeContext(),
      });
      
      console.log(`[PHASE 1] OCR処理完了`);
      
      // 代表者名と会社名を取得（identityResultから取得できない場合はKintoneデータから）
      const representativeName = identityResult.extractedInfo?.name || 
                               identityResult.processingDetails?.expectedName || 
                               record.代表者名?.value || 
                               "不明";
      const companyName = applicantCompany.name || "不明";
      
      return {
        success: true,
        purchaseData: {
          success: purchaseResult.success,
          summary: `買取情報処理: ${purchaseResult.success ? '成功' : '失敗'}`,
          data: purchaseResult
        },
        bankData: {
          success: bankResult.success,
          summary: `通帳処理: ${bankResult.success ? '成功' : '失敗'}`,
          data: bankResult
        },
        personalBankData: {
          success: personalBankResult.success,
          summary: `個人口座処理: ${personalBankResult.success ? '成功' : '失敗'}`,
          data: personalBankResult
        },
        identityData: {
          success: identityResult.success,
          summary: `本人確認処理: ${identityResult.success ? '成功' : '失敗'}`,
          data: identityResult
        },
        registryData: {
          success: registryResult.success,
          summary: `登記簿処理: ${registryResult.success ? '成功' : '失敗'}`,
          data: registryResult
        },
        nextPhaseInputs: {
          representativeName,
          companyName,
        },
        summary: "Phase 1: OCR処理完了"
      };
      
    } catch (error) {
      console.error(`[PHASE 1] エラー:`, error);
      throw error;
    }
  },
});

// Phase 2: 外部調査ステップ
const phase2ResearchStep = createStep({
  id: "phase2-external-research",
  description: "Phase 2: 外部調査とリスク評価",
  inputSchema: z.object({
    success: z.boolean(),
    purchaseData: z.any(),
    bankData: z.any(),
    personalBankData: z.any(),
    identityData: z.any(),
    registryData: z.any(),
    nextPhaseInputs: z.object({
      representativeName: z.string(),
      companyName: z.string(),
    }),
    summary: z.string(),
  }),
  outputSchema: z.object({
    // Phase 1の全データを保持
    phase1Data: z.object({
      purchaseData: z.any(),
      bankData: z.any(),
      personalBankData: z.any(),
      identityData: z.any(),
      registryData: z.any(),
    }),
    // Phase 2の結果
    success: z.boolean(),
    egoSearchResult: z.any(),
    companyVerifyResult: z.any(),
    riskFlags: z.array(z.string()),
    summary: z.string(),
  }),
  execute: async ({ inputData }) => {
    const { representativeName, companyName } = inputData.nextPhaseInputs;
    
    try {
      console.log(`[PHASE 2] 外部調査開始`);
      
      // Phase 2: 外部調査ツール実行
      // recordIdから取得する方が確実
      const recordId = inputData.purchaseData?.data?.recordId || inputData.identityData?.data?.processingDetails?.recordId;
      
      const egoResult = await fraudSiteSearchTool.execute({
        context: recordId ? { recordId } : { name: representativeName },
        runtimeContext: new RuntimeContext(),
      });
      
      const companyResult = await companyVerifyAITool.execute({
        context: recordId ? { recordId } : { companyName },
        runtimeContext: new RuntimeContext(),
      });
      
      console.log(`[PHASE 2] 外部調査完了`);
      
      return {
        // Phase 1の全データを保持して渡す
        phase1Data: {
          purchaseData: inputData.purchaseData,
          bankData: inputData.bankData,
          personalBankData: inputData.personalBankData,
          identityData: inputData.identityData,
          registryData: inputData.registryData,
        },
        success: true,
        // fraudSiteSearchToolの実際の出力形式
        egoSearchResult: {
          name: egoResult.name,
          fraudSites: egoResult.fraudSites || [],
          negativeSearchResults: egoResult.negativeSearchResults || [],
          // 判定用の追加フィールド
          hasNegativeInfo: (egoResult.fraudSites?.some(site => site.searchResults.length > 0) || 
                           egoResult.negativeSearchResults?.some(result => result.results.length > 0)) || false
        },
        // companyVerifyAIToolの実際の出力形式
        companyVerifyResult: {
          companyName: companyResult.companyName,
          companyLocation: companyResult.companyLocation,
          homeLocation: companyResult.homeLocation,
          searchQueries: companyResult.searchQueries || []
        },
        riskFlags: [],
        summary: "Phase 2: 外部調査完了"
      };
      
    } catch (error) {
      console.error(`[PHASE 2] エラー:`, error);
      throw error;
    }
  },
});

// Phase 3: 最終分析ステップ
const phase3AnalysisStep = createStep({
  id: "phase3-final-analysis",
  description: "Phase 3: 最終分析とレポート生成",
  inputSchema: z.object({
    // Phase 1の全データ
    phase1Data: z.object({
      purchaseData: z.any(),
      bankData: z.any(),
      personalBankData: z.any(),
      identityData: z.any(),
      registryData: z.any(),
    }),
    // Phase 2のデータ
    success: z.boolean(),
    egoSearchResult: z.any(),
    companyVerifyResult: z.any(),
    riskFlags: z.array(z.string()),
    summary: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    finalScore: z.number(),
    riskLevel: z.string(),
    recommendation: z.string(),
    summary: z.string(),
    detailedReport: z.string().optional(),
  }),
  execute: async ({ inputData }) => {
    
    try {
      console.log(`[PHASE 3] 最終分析開始`);
      console.log(`[PHASE 3] 受け取ったデータ:`, {
        phase1DataKeys: Object.keys(inputData.phase1Data),
        phase2DataKeys: ['egoSearchResult', 'companyVerifyResult', 'riskFlags']
      });
      
      // Phase 3エージェントを呼び出し、全データを渡す
      const phase3Response = await phase3AnalysisAgent.generate(
        `以下の全データを統合して最終分析レポートを作成してください：
        
        Phase 1 データ:
        ${JSON.stringify(inputData.phase1Data, null, 2)}
        
        Phase 2 データ:
        - エゴサーチ結果: ${JSON.stringify(inputData.egoSearchResult, null, 2)}
        - 企業確認結果: ${JSON.stringify(inputData.companyVerifyResult, null, 2)}
        - リスクフラグ: ${JSON.stringify(inputData.riskFlags, null, 2)}`
      );
      
      // 簡易分析（フォールバック用）
      const baseScore = 60;
      const phase1Score = 10;
      const phase2Score = inputData.egoSearchResult?.hasNegativeInfo ? 30 : 80;
      const finalScore = Math.min(100, Math.max(0, baseScore + phase1Score + (phase2Score - 50)));
      
      console.log(`[PHASE 3] 最終分析完了`);
      
      const result = {
        success: true,
        finalScore,
        riskLevel: finalScore >= 80 ? "低" : finalScore >= 60 ? "中" : "高",
        recommendation: finalScore >= 80 ? "承認推奨" : finalScore >= 60 ? "条件付き承認" : "要再検討",
        summary: `Phase 3: 最終分析完了`,
        detailedReport: phase3Response.text || phase3Response.toString()
      };
      
      console.log(`[PHASE 3] 最終結果:`, JSON.stringify(result, null, 2));
      
      return result;
      
    } catch (error) {
      console.error(`[PHASE 3] エラー:`, error);
      throw error;
    }
  },
});

// マルチエージェント統合ワークフロー - Mastra公式推奨パターン
export const multiAgentComplianceWorkflow = createWorkflow({
  id: "multi-agent-compliance-workflow",
  inputSchema: z.object({
    recordId: z.string().describe("KintoneレコードID"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    finalScore: z.number(),
    riskLevel: z.string(),
    recommendation: z.string(),
    summary: z.string(),
  }),
})
.then(phase1OCRStep)
.then(phase2ResearchStep) 
.then(phase3AnalysisStep)
.commit();
