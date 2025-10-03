import { createStep } from "@mastra/core/workflows";
import { RuntimeContext } from "@mastra/core/runtime-context";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import axios from "axios";
import { googleVisionIdentityOcrTool } from "../tools/google-vision-identity-ocr-tool";
import { identityVerificationTool } from "../tools/identity-verification-tool";
import { egoSearchTool } from "../tools/ego-search-tool";
import { companyVerifyTool } from "../tools/company-verify-tool";

/**
 * Phase 3: 本人確認・企業実在性確認ステップ
 * エージェントを使わず、ワークフロー内でツールを直接実行
 */
export const phase3VerificationStep = createStep({
  id: "phase3-verification",
  description: "本人確認・企業実在性確認（本人確認OCR → エゴサーチ → 企業検証 → 代表者リスク検索）",
  
  inputSchema: z.object({
    recordId: z.string().describe("KintoneレコードID"),
    phase1Results: z.any().optional().describe("Phase 1の結果（買取・担保情報）"),
  }),
  
  outputSchema: z.object({
    recordId: z.string(),
    結果サマリー: z.object({
      本人確認: z.object({
        書類タイプ: z.string(),
        照合結果: z.string(),
        抽出情報: z.object({
          氏名: z.string(),
          生年月日: z.string(),
          住所: z.string(),
        }),
      }),
      申込者エゴサーチ: z.object({
        ネガティブ情報: z.boolean(),
        詐欺情報サイト: z.number(),
        Web検索: z.number(),
        詳細: z.string(),
      }),
      企業実在性: z.object({
        申込企業: z.object({
          確認: z.boolean().optional(),
          公式サイト: z.string().optional(),
        }).optional(),
        買取企業: z.object({
          確認済み: z.number(),
          未確認: z.number(),
        }),
        担保企業: z.object({
          確認済み: z.number(),
          未確認: z.number(),
          備考: z.string().optional(),
        }),
      }),
      代表者リスク: z.object({
        検索対象: z.number(),
        リスク検出: z.number(),
      }),
      処理時間: z.string(),
    }),
    phase3Results: z.object({
      identityVerification: z.object({
        success: z.boolean(),
        extractedInfo: z.any(),
        documentType: z.string(),
        summary: z.string(),
      }),
      applicantEgoSearch: z.object({
        fraudSiteResults: z.array(z.any()),
        negativeSearchResults: z.array(z.any()),
        summary: z.any(),
      }),
      companyVerification: z.object({
        applicantCompany: z.any().optional(),
        purchaseCompanies: z.array(z.any()).optional(),
        collateralCompanies: z.array(z.any()).optional(),
      }),
      representativeEgoSearches: z.array(z.any()),
    }),
    summary: z.string(),
  }),
  
  execute: async ({ inputData }) => {
    const { recordId, phase1Results } = inputData;
    
    const startTime = Date.now();
    
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🚀 [Phase 3] 本人確認・企業実在性確認 開始`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Record ID: ${recordId}`);
    
    // ========================================
    // Step 1-1: Google Vision OCR処理
    // ========================================
    console.log(`\n━━━ Step 1-1: Google Vision OCR処理 ━━━`);
    const ocrStartTime = Date.now();
    
    const ocrResult = await googleVisionIdentityOcrTool.execute!({
      context: {
        recordId,
        identityFieldName: "顧客情報＿添付ファイル",
        maxPagesPerFile: 10,
      },
      runtimeContext: new RuntimeContext(),
    });
    
    const ocrDuration = Date.now() - ocrStartTime;
    console.log(`OCR処理完了 - 処理時間: ${ocrDuration}ms`);
    console.log(`  - 本人確認書類: ${ocrResult.identityDocuments.length}件`);
    console.log(`  - 総ページ数: ${ocrResult.processingDetails.totalPages}ページ`);
    
    if (ocrResult.identityDocuments.length > 0) {
      console.log(`\n【本人確認書類】`);
      ocrResult.identityDocuments.forEach((doc, index) => {
        console.log(`  📄 ${doc.fileName} (${doc.pageCount}ページ)`);
        console.log(`     先頭: "${doc.text.substring(0, 50).replace(/\n/g, ' ')}..."`);
      });
    } else {
      console.log(`\n【本人確認書類】 ⚠️ ファイルなし`);
    }
    
    if (!ocrResult.success) {
      throw new Error(`OCR処理失敗: ${ocrResult.error}`);
    }
    
    // ========================================
    // Step 1-2: 本人確認検証（AI分析 + 照合）
    // ========================================
    console.log(`\n━━━ Step 1-2: 本人確認検証 ━━━`);
    const verificationStartTime = Date.now();
    
    const identityResult = await identityVerificationTool.execute!({
      context: {
        recordId,
        identityDocuments: ocrResult.identityDocuments,
        model: "gpt-4o",
      },
      runtimeContext: new RuntimeContext(),
    });
    
    const verificationDuration = Date.now() - verificationStartTime;
    console.log(`本人確認検証完了 - 処理時間: ${verificationDuration}ms`);
    
    console.log(`\n【書類タイプ】`);
    console.log(`  ${identityResult.documentType}`);
    
    if (identityResult.success) {
      console.log(`\n【抽出情報】`);
      console.log(`  氏名: ${identityResult.extractedInfo.name || "不明"}`);
      console.log(`  生年月日: ${identityResult.extractedInfo.birthDate || "不明"}`);
      console.log(`  住所: ${identityResult.extractedInfo.address || "不明"}（照合対象外）`);

      console.log(`\n【Kintone照合】`);
      console.log(`  ${identityResult.verificationResults.nameMatch ? "✓" : "✗"} 氏名: ${identityResult.verificationResults.nameMatch ? "一致" : "不一致"}`);
      console.log(`  ${identityResult.verificationResults.birthDateMatch ? "✓" : "✗"} 生年月日: ${identityResult.verificationResults.birthDateMatch ? "一致" : "不一致"}`);
      console.log(`\n  判定: ${identityResult.verificationResults.summary}`);
    } else {
      console.log(`\n⚠️  本人確認書類の処理に失敗しました`);
      console.log(`  理由: ${identityResult.summary}`);
    }
    
    // ========================================
    // Step 2: 申込者のエゴサーチ
    // ========================================
    console.log(`\n━━━ Step 2: 申込者のエゴサーチ ━━━`);
    
    const applicantEgoSearch = await egoSearchTool.execute!({
      context: { recordId },
      runtimeContext: new RuntimeContext(),
    });
    
    console.log(`\n対象: ${identityResult.processingDetails.expectedName || "不明"}（生年月日: ${identityResult.processingDetails.expectedBirthDate || "不明"}）`);
    
    console.log(`\n【詐欺情報サイト】`);
    for (const result of applicantEgoSearch.fraudSiteResults) {
      if (result.found) {
        console.log(`  ⚠️ ${result.siteName}: 該当あり`);
        if (result.details) {
          console.log(`     詳細: ${result.details}`);
        }
      } else {
        console.log(`  ✓ ${result.siteName}: 該当なし`);
      }
    }
    
    console.log(`\n【Web検索】`);
    
    // GPT-4.1でAI判定を行う
    const filteredNegativeResults = [];
    for (const result of applicantEgoSearch.negativeSearchResults) {
      if (result.found && result.results && result.results.length > 0) {
        console.log(`\n  "${result.query}": ${result.results.length}件の検索結果を分析中...`);
        
        // 各検索結果をAIで判定
        const relevantResults = [];
        for (const searchResult of result.results) {
          const isRelevant = await analyzeSearchResultRelevance(
            identityResult.processingDetails.expectedName,
            result.query,
            searchResult.title,
            searchResult.snippet
          );
          
          if (isRelevant.isRelevant) {
            relevantResults.push({
              ...searchResult,
              aiReason: isRelevant.reason,
            });
          }
        }
        
        if (relevantResults.length > 0) {
          console.log(`  ⚠️ "${result.query}": ${relevantResults.length}件検出（AI判定済み）`);
          relevantResults.slice(0, 2).forEach((r, idx) => {
            console.log(`     ${idx + 1}. ${r.title}`);
            console.log(`        ${r.url}`);
            console.log(`        理由: ${r.aiReason}`);
          });
          filteredNegativeResults.push({
            query: result.query,
            found: true,
            results: relevantResults,
          });
        } else {
          console.log(`  ✓ "${result.query}": 該当なし（AI判定により無関係と判断）`);
          filteredNegativeResults.push({
            query: result.query,
            found: false,
            results: undefined,
          });
        }
      } else {
        console.log(`  ✓ "${result.query}": 該当なし`);
        filteredNegativeResults.push(result);
      }
    }
    
    // AI判定後の結果で上書き
    applicantEgoSearch.negativeSearchResults = filteredNegativeResults;
    
    // サマリーを再計算
    const fraudHits = applicantEgoSearch.fraudSiteResults.filter((r: any) => r.found).length;
    const negativeHits = filteredNegativeResults.filter((r: any) => r.found);
    const hasNegativeInfo = negativeHits.length > 0 || fraudHits > 0;
    
    let details = "";
    if (!hasNegativeInfo) {
      details = "ネガティブ情報は見つかりませんでした。";
    } else {
      if (fraudHits > 0) {
        details = `詐欺情報サイトに${fraudHits}件の情報が見つかりました。`;
      }
      if (negativeHits.length > 0) {
        details += ` Web検索で${negativeHits.map((r: any) => r.query).join('、')}に関する情報が見つかりました（AI判定済み）。`;
      }
    }
    
    applicantEgoSearch.summary = {
      hasNegativeInfo,
      fraudHits,
      details,
    };
    
    console.log(`\n【判定】`);
    if (hasNegativeInfo) {
      console.log(`  ⚠️ ネガティブ情報: あり（要確認）`);
      console.log(`     ${details}`);
    } else {
      console.log(`  ✓ ネガティブ情報: なし`);
    }
    
    // ========================================
    // Step 3: 企業実在性確認（並列実行）
    // ========================================
    console.log(`\n━━━ Step 3: 企業実在性確認 ━━━`);

    let applicantCompany: any = undefined;
    let purchaseCompanyResults: any[] = [];
    let collateralCompanyResults: any[] = [];

    // 申込企業の検証（Kintoneから直接取得）
    console.log(`\n【申込企業】`);
    const applicantCompanyName = await fetchApplicantCompanyFromKintone(recordId);

    if (applicantCompanyName) {
      console.log(`  企業名: ${applicantCompanyName}`);

      applicantCompany = await companyVerifyTool.execute!({
        context: {
          companyName: applicantCompanyName,
          location: undefined,
        },
        runtimeContext: new RuntimeContext(),
      });

      printCompanyVerificationResult(applicantCompany, applicantCompanyName);
    } else {
      console.log(`  ⚠️ 申込企業名が取得できませんでした（屋号・会社名フィールドが空）`);
    }

    // 買取企業の検証（複数）- Phase 1の結果がある場合のみ
    if (phase1Results?.purchaseVerification?.purchaseInfo?.debtorCompanies?.length > 0) {
      console.log(`\n【買取企業】`);

      const purchaseInfo = phase1Results.purchaseVerification.purchaseInfo;

      purchaseCompanyResults = await Promise.all(
        purchaseInfo.debtorCompanies.map(async (company: any) => {
          console.log(`\n  企業名: ${company.name}`);

          const result = await companyVerifyTool.execute!({
            context: {
              companyName: company.name,
              location: "建設業", // 業種で検索精度向上
            },
            runtimeContext: new RuntimeContext(),
          });

          printCompanyVerificationResult(result, company.name);

          return result;
        })
      );
    } else {
      console.log(`\n【買取企業】`);
      console.log(`  ⚠️ Phase 1の結果がないため、買取企業情報を取得できません`);
    }
    
    // 担保企業の検証（Kintoneから必ず取得）
    console.log(`\n【担保企業】`);
    console.log(`  担保情報テーブルから企業名を取得中...`);

    const collateralCompanies = await fetchCollateralCompaniesFromKintone(recordId);

    if (collateralCompanies.length > 0) {
      console.log(`  取得: ${collateralCompanies.length}社`);

      collateralCompanyResults = await Promise.all(
        collateralCompanies.map(async (company: any) => {
          console.log(`\n  企業名: ${company.name}`);

          const result = await companyVerifyTool.execute!({
            context: {
              companyName: company.name,
              location: undefined, // Kintoneの担保情報テーブルには所在地がない
              registryInfo: undefined, // 代表者情報は謄本からのみ取得
            },
            runtimeContext: new RuntimeContext(),
          });

          printCompanyVerificationResult(result, company.name);

          // 企業名も結果に含める
          return { ...result, companyName: company.name };
        })
      );
    } else {
      console.log(`  ⚠️ 担保企業情報なし（担保テーブルが空）`);
    }
    
    // ========================================
    // Step 4: 代表者リスク検索（並列実行）
    // ========================================
    console.log(`\n━━━ Step 4: 代表者リスク検索 ━━━`);
    console.log(`\n代表者情報はPhase 1の担保検証結果（謄本）からのみ取得`);
    
    const representatives: Array<{ name: string; company: string; type: string }> = [];
    
    // 買取企業の代表者（企業検索結果から取得）
    for (let i = 0; i < purchaseCompanyResults.length; i++) {
      const result = purchaseCompanyResults[i];
      if (result.webPresence?.companyDetails?.representative) {
        representatives.push({
          name: result.webPresence.companyDetails.representative,
          company: phase1Results?.purchaseVerification?.purchaseInfo?.debtorCompanies?.[i]?.name || "不明",
          type: "買取企業",
        });
      }
    }
    
    // 担保企業の代表者（Phase 1の担保検証結果からのみ取得）
    // 注意: 担保謄本ファイルがない場合、代表者情報は取得できない
    if (phase1Results?.collateralVerification?.collateralInfo?.companies) {
      console.log(`  Phase 1の担保検証結果から代表者を取得中...`);
      for (const company of phase1Results.collateralVerification.collateralInfo.companies) {
        if (company.representatives?.length > 0) {
          representatives.push({
            name: company.representatives[0],
            company: company.name,
            type: "担保企業",
          });
        }
      }
      console.log(`  取得: ${phase1Results.collateralVerification.collateralInfo.companies.filter((c: any) => c.representatives?.length > 0).length}名`);
    } else {
      console.log(`  ⚠️ Phase 1の担保検証結果がないため、代表者情報を取得できません`);
      console.log(`     （担保謄本ファイルがアップロードされていない可能性）`);
    }
    
    let representativeEgoSearches: any[] = [];
    
    if (representatives.length > 0) {
      console.log(`\n検索対象: ${representatives.length}名`);
      
      representativeEgoSearches = await Promise.all(
        representatives.map(async (rep) => {
          const result = await egoSearchTool.execute!({
            context: { name: rep.name },
            runtimeContext: new RuntimeContext(),
          });
          
          return { ...rep, egoSearchResult: result };
        })
      );
      
      // 買取企業代表者
      const purchaseReps = representativeEgoSearches.filter(r => r.type === "買取企業");
      if (purchaseReps.length > 0) {
        console.log(`\n【買取企業代表者】`);
        for (const rep of purchaseReps) {
          printRepresentativeEgoSearchResult(rep);
        }
      }
      
      // 担保企業代表者
      const collateralReps = representativeEgoSearches.filter(r => r.type === "担保企業");
      if (collateralReps.length > 0) {
        console.log(`\n【担保企業代表者】`);
        for (const rep of collateralReps) {
          printRepresentativeEgoSearchResult(rep);
        }
      }
      
      console.log(`\n【判定】`);
      const riskyReps = representativeEgoSearches.filter(r => r.egoSearchResult.summary.hasNegativeInfo);
      if (riskyReps.length > 0) {
        console.log(`  ⚠️ 代表者リスク: あり（要確認）`);
        console.log(`     リスク検出: ${riskyReps.length}名/${representatives.length}名`);
      } else {
        console.log(`  ✓ 代表者リスク: なし`);
      }
    } else {
      console.log(`\n  代表者情報が取得できませんでした`);
    }
    
    // ========================================
    // 結果サマリーの生成
    // ========================================
    const endTime = Date.now();
    const processingTime = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✅ [Phase 3] 完了 (処理時間: ${processingTime}秒)`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    
    const summary = `Phase 3: 本人確認・企業実在性確認
処理時間: ${processingTime}秒
本人確認: ${identityResult.success ? "成功" : "失敗"}
申込者エゴサーチ: ${applicantEgoSearch.summary.hasNegativeInfo ? "リスク検出" : "問題なし"}
企業実在性確認: 申込企業=${applicantCompany ? "確認済み" : "未確認"}, 買取企業=${purchaseCompanyResults.length}社, 担保企業=${collateralCompanyResults.length}社
代表者リスク: ${representativeEgoSearches.filter(r => r.egoSearchResult.summary.hasNegativeInfo).length}名/${representatives.length}名`;
    
    // 本人確認のサマリー
    const 本人確認サマリー = {
      書類タイプ: identityResult.documentType,
      照合結果: identityResult.verificationResults.summary,
      抽出情報: {
        氏名: identityResult.extractedInfo.name || "不明",
        生年月日: identityResult.extractedInfo.birthDate || "不明",
        住所: identityResult.extractedInfo.address || "不明",
      },
    };
    
    // 申込者エゴサーチのサマリー
    const 申込者エゴサーチサマリー = {
      ネガティブ情報: applicantEgoSearch.summary.hasNegativeInfo,
      詐欺情報サイト: applicantEgoSearch.summary.fraudHits,
      Web検索: applicantEgoSearch.negativeSearchResults.filter((r: any) => r.found).length,
      詳細: applicantEgoSearch.summary.details,
    };
    
    // 企業実在性のサマリー
    const 企業実在性サマリー = {
      申込企業: applicantCompany ? {
        企業名: applicantCompanyName,
        確認: applicantCompany.verified,
        公式サイト: applicantCompany.webPresence.websiteUrl || "なし",
        信頼度: applicantCompany.confidence,
      } : applicantCompanyName ? {
        企業名: applicantCompanyName,
        確認: false,
        公式サイト: "確認失敗",
        信頼度: 0,
      } : {
        企業名: "取得失敗",
        確認: false,
        公式サイト: "なし",
        信頼度: 0,
      },
      買取企業: {
        総数: purchaseCompanyResults.length,
        確認済み: purchaseCompanyResults.filter((c: any) => c.verified).length,
        未確認: purchaseCompanyResults.filter((c: any) => !c.verified).length,
        企業リスト: purchaseCompanyResults.map((c: any, idx: number) => ({
          企業名: phase1Results?.purchaseVerification?.purchaseInfo?.debtorCompanies?.[idx]?.name || "不明",
          確認: c.verified,
          公式サイト: c.webPresence.websiteUrl || "なし",
          信頼度: c.confidence,
        })),
      },
      担保企業: {
        総数: collateralCompanyResults.length,
        確認済み: collateralCompanyResults.filter((c: any) => c.verified).length,
        未確認: collateralCompanyResults.filter((c: any) => !c.verified).length,
        備考: collateralCompanyResults.length === 0 ? "担保テーブルが空" : undefined,
        企業リスト: collateralCompanyResults.map((c: any, idx: number) => {
          const collateralCompanies = collateralCompanyResults.length > 0 ?
            collateralCompanyResults : [];
          return {
            企業名: collateralCompanies[idx]?.companyName || "不明",
            確認: c.verified,
            公式サイト: c.webPresence.websiteUrl || "なし",
            信頼度: c.confidence,
          };
        }),
      },
    };
    
    // 代表者リスクのサマリー
    const 代表者リスクサマリー = {
      検索対象: representativeEgoSearches.length,
      リスク検出: representativeEgoSearches.filter((r: any) => r.egoSearchResult?.summary?.hasNegativeInfo).length,
    };
    
    return {
      recordId,
      結果サマリー: {
        本人確認: 本人確認サマリー,
        申込者エゴサーチ: 申込者エゴサーチサマリー,
        企業実在性: 企業実在性サマリー,
        代表者リスク: 代表者リスクサマリー,
        処理時間: `${processingTime}秒`,
      },
      phase3Results: {
        identityVerification: {
          success: identityResult.success,
          extractedInfo: identityResult.extractedInfo,
          documentType: identityResult.documentType,
          summary: identityResult.summary,
        },
        applicantEgoSearch: {
          fraudSiteResults: applicantEgoSearch.fraudSiteResults,
          negativeSearchResults: applicantEgoSearch.negativeSearchResults,
          summary: applicantEgoSearch.summary,
        },
        companyVerification: {
          applicantCompany,
          purchaseCompanies: purchaseCompanyResults,
          collateralCompanies: collateralCompanyResults,
        },
        representativeEgoSearches,
      },
      summary,
    };
  },
});


// ========================================
// ヘルパー関数
// ========================================

/**
 * Web検索結果の関連性をAIで判定
 */
async function analyzeSearchResultRelevance(
  name: string,
  query: string,
  title: string,
  snippet: string
): Promise<{ isRelevant: boolean; reason: string }> {
  try {
    const result = await generateObject({
      model: openai("gpt-4o"),
      prompt: `以下のWeb検索結果のスニペットを分析し、
「${name}」に関する詐欺・被害・逮捕・容疑の情報が
本当に含まれているか判定してください。

検索クエリ: "${query}"
タイトル: "${title}"
スニペット: "${snippet}"

判定基準:
- 本人が詐欺・被害・逮捕・容疑に関わっている場合: true
- 単に名前が含まれているだけの無関係な記事: false
- 記念日、スポーツ、文化活動などの記事: false
- PDFファイル名やメタデータのみの場合: false

JSON形式で返してください。`,
      schema: z.object({
        isRelevant: z.boolean().describe("関連性があるか"),
        reason: z.string().describe("判定理由（50文字以内）"),
      }),
    });
    
    return result.object;
  } catch (error) {
    console.error(`AI判定エラー:`, error);
    // エラー時は安全側に倒して関連ありとする
    return {
      isRelevant: true,
      reason: "AI判定エラー（要手動確認）",
    };
  }
}

/**
 * Kintoneから申込企業名を取得
 */
async function fetchApplicantCompanyFromKintone(recordId: string): Promise<string> {
  const domain = process.env.KINTONE_DOMAIN;
  const apiToken = process.env.KINTONE_API_TOKEN;
  const appId = process.env.KINTONE_APP_ID || "37";

  if (!domain || !apiToken) {
    console.error("Kintone環境変数が設定されていません");
    return "";
  }

  try {
    const url = `https://${domain}/k/v1/records.json?app=${appId}&query=$id="${recordId}"`;
    const response = await axios.get(url, {
      headers: { 'X-Cybozu-API-Token': apiToken },
    });

    if (response.data.records.length === 0) {
      console.error(`レコードID: ${recordId} が見つかりません`);
      return "";
    }

    const record = response.data.records[0];
    // 屋号（個人事業主）または会社名（法人）を取得
    const companyName = record.屋号?.value || record.会社名?.value || "";

    return companyName;
  } catch (error) {
    console.error("Kintone申込企業情報取得エラー:", error);
    return "";
  }
}

/**
 * Kintoneから担保企業を取得
 */
async function fetchCollateralCompaniesFromKintone(recordId: string): Promise<Array<{ name: string }>> {
  const domain = process.env.KINTONE_DOMAIN;
  const apiToken = process.env.KINTONE_API_TOKEN;
  const appId = process.env.KINTONE_APP_ID || "37";

  if (!domain || !apiToken) {
    console.error("Kintone環境変数が設定されていません");
    return [];
  }

  try {
    const url = `https://${domain}/k/v1/records.json?app=${appId}&query=$id="${recordId}"`;
    const response = await axios.get(url, {
      headers: { 'X-Cybozu-API-Token': apiToken },
    });

    if (response.data.records.length === 0) {
      console.error(`レコードID: ${recordId} が見つかりません`);
      return [];
    }

    const record = response.data.records[0];
    const collateralTable = record.担保情報?.value || [];

    const companies = collateralTable
      .map((row: any) => {
        const companyName = row.value.会社名_第三債務者_担保?.value || "";
        return { name: companyName };
      })
      .filter((c: any) => c.name); // 空の会社名は除外

    return companies;
  } catch (error) {
    console.error("Kintone担保情報取得エラー:", error);
    return [];
  }
}

/**
 * テキストの正規化（照合用）
 */
function normalizeText(text: string): string {
  return text
    .replace(/\s+/g, '')          // スペース削除
    .replace(/[　]/g, '')         // 全角スペース削除
    .toLowerCase();
}


/**
 * 企業検証結果の表示
 */
function printCompanyVerificationResult(result: any, companyName: string): void {
  if (result.verified) {
    console.log(`  ✓ ${companyName}: 実在確認`);
    if (result.webPresence.hasWebsite) {
      console.log(`     公式サイト: ${result.webPresence.websiteUrl}`);
    }
    console.log(`     信頼度: ${result.confidence}%`);
    
    if (result.webPresence.companyDetails) {
      const details = result.webPresence.companyDetails;
      if (details.businessDescription) {
        console.log(`     事業内容: ${details.businessDescription}`);
      }
      if (details.capital) {
        console.log(`     資本金: ${details.capital}`);
      }
      if (details.established) {
        console.log(`     設立: ${details.established}`);
      }
    }
  } else {
    console.log(`  ⚠️ ${companyName}: 確認不十分`);
    console.log(`     信頼度: ${result.confidence}%`);
    if (result.webPresence.hasWebsite) {
      console.log(`     検索結果: ${result.searchResults.length}件`);
    } else {
      console.log(`     公式サイト: なし`);
    }
    
    if (result.riskFactors.length > 0) {
      console.log(`     リスク要因:`);
      result.riskFactors.forEach((factor: string) => {
        console.log(`       - ${factor}`);
      });
    }
  }
}

/**
 * 代表者エゴサーチ結果の表示
 */
function printRepresentativeEgoSearchResult(rep: any): void {
  const result = rep.egoSearchResult;
  
  if (result.summary.hasNegativeInfo) {
    console.log(`  ⚠️ ${rep.name}（${rep.company}）`);
    
    const fraudHits = result.fraudSiteResults.filter((r: any) => r.found);
    if (fraudHits.length > 0) {
      console.log(`     詐欺情報サイト: ${fraudHits.length}件検出`);
    }
    
    const negativeHits = result.negativeSearchResults.filter((r: any) => r.found);
    if (negativeHits.length > 0) {
      console.log(`     Web検索: ${negativeHits.map((r: any) => `"${r.query}"`).join('、')} - ${negativeHits.length}件検出`);
    }
    
    console.log(`     詳細: ${result.summary.details}`);
  } else {
    console.log(`  ✓ ${rep.name}（${rep.company}）`);
    console.log(`     詐欺情報サイト: 該当なし`);
    console.log(`     Web検索: ネガティブ情報なし`);
  }
}


