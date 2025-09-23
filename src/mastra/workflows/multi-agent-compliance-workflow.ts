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
  egoSearchTool,
  companyVerifyTool,
  paymentAnalysisV2Tool,
} from "../tools";

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
          recordId,
          targetCompanies
        },
        runtimeContext: new RuntimeContext(),
      });
      
      // 個人口座OCRツールも実行
      const personalBankResult = await ocrPersonalBankTool?.execute({
        context: { recordId },
        runtimeContext: new RuntimeContext(),
      });
      
      console.log(`[PHASE 1] OCR処理完了`);
      
      return {
        success: true,
        purchaseData: {
          success: purchaseResult.success,
          summary: `買取情報処理: ${purchaseResult.success ? '成功' : '失敗'}`
        },
        bankData: {
          success: bankResult.success,
          summary: `通帳処理: ${bankResult.success ? '成功' : '失敗'}`
        },
        identityData: {
          success: identityResult.success,
          summary: `本人確認処理: ${identityResult.success ? '成功' : '失敗'}`
        },
        registryData: {
          success: registryResult.success,
          summary: `登記簿処理: ${registryResult.success ? '成功' : '失敗'}`
        },
        nextPhaseInputs: {
          representativeName: identityResult.basicInfo?.representativeName || "不明",
          companyName: identityResult.basicInfo?.companyName || "不明",
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
    identityData: z.any(),
    registryData: z.any(),
    nextPhaseInputs: z.object({
      representativeName: z.string(),
      companyName: z.string(),
    }),
    summary: z.string(),
  }),
  outputSchema: z.object({
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
      const egoResult = await egoSearchTool.execute({
        context: { name: representativeName },
        runtimeContext: new RuntimeContext(),
      });
      
      const companyResult = await companyVerifyTool.execute({
        context: { companyName },
        runtimeContext: new RuntimeContext(),
      });
      
      console.log(`[PHASE 2] 外部調査完了`);
      
      return {
        success: true,
        egoSearchResult: {
          hasNegativeInfo: egoResult.summary?.hasNegativeInfo || false,
          riskLevel: egoResult.summary?.hasNegativeInfo ? "中" : "低",
          summary: egoResult.summary?.details || "ネガティブ情報なし"
        },
        companyVerifyResult: {
          verified: companyResult.verified || false,
          confidence: companyResult.confidence || 0,
          trustScore: companyResult.verified ? 80 : 40,
          webPresence: companyResult.webPresence || {},
          searchResults: companyResult.searchResults || [],
          riskFactors: companyResult.riskFactors || [],
          summary: companyResult.verified ? "企業実在性確認済み" : "要確認"
        },
        riskFlags: egoResult.summary?.hasNegativeInfo ? ["代表者リスク"] : [],
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
  }),
  execute: async ({ inputData }) => {
    
    try {
      console.log(`[PHASE 3] 最終分析開始`);
      
      // 簡易分析
      const baseScore = 60;
      const phase1Score = 10; // Phase1のデータは前ステップの結果から参照
      const phase2Score = inputData.egoSearchResult?.hasNegativeInfo ? 30 : 80;
      
      const finalScore = Math.min(100, Math.max(0, baseScore + phase1Score + (phase2Score - 50)));
      
      console.log(`[PHASE 3] 最終分析完了 - スコア: ${finalScore}`);
      
      const result = {
        success: true,
        finalScore,
        riskLevel: finalScore >= 80 ? "低" : finalScore >= 60 ? "中" : "高",
        recommendation: finalScore >= 80 ? "承認推奨" : finalScore >= 60 ? "条件付き承認" : "要再検討",
        summary: `Phase 3: 最終分析完了 - スコア: ${finalScore}点 (${finalScore >= 80 ? "低リスク" : finalScore >= 60 ? "中リスク" : "高リスク"})`,
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
