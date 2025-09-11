import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import axios from "axios";

// 担保情報専用OCRツール（柔軟な対応）
export const ocrCollateralTool = createTool({
  id: "ocr-collateral",
  description: "担保情報関連書類をOCR処理し、担保価値を評価（書類種類を問わず柔軟に対応）",
  inputSchema: z.object({
    recordId: z.string().describe("KintoneレコードID"),
    collateralCompanies: z.array(z.object({
      name: z.string(),
      expectedAmount: z.number().optional(),
    })).describe("担保企業リスト"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    findings: z.array(z.object({
      fileName: z.string(),
      documentType: z.string().describe("推定される書類種類"),
      relatedCompany: z.string().optional(),
      keyInformation: z.array(z.string()).describe("重要な発見事項"),
      amounts: z.array(z.object({
        description: z.string(),
        amount: z.number(),
      })).optional(),
      dates: z.array(z.string()).optional(),
      reliability: z.enum(["high", "medium", "low"]),
    })),
    collateralAssessment: z.object({
      totalValue: z.number().optional().describe("担保価値の合計（推定）"),
      keyRisks: z.array(z.string()),
      recommendations: z.array(z.string()),
    }),
    summary: z.string(),
  }),
  
  execute: async ({ context }) => {
    const { recordId, collateralCompanies } = context;
    const domain = process.env.KINTONE_DOMAIN;
    const apiToken = process.env.KINTONE_API_TOKEN;
    
    if (!domain || !apiToken) {
      throw new Error("Kintone環境変数が設定されていません");
    }
    
    try {
      // 担保関連ファイルを取得
      const fileUrl = `https://${domain}/k/v1/records.json?app=37&query=$id="${recordId}"`;
      const recordResponse = await axios.get(fileUrl, {
        headers: { 'X-Cybozu-API-Token': apiToken },
      });
      
      if (recordResponse.data.records.length === 0) {
        throw new Error(`レコードID: ${recordId} が見つかりません`);
      }
      
      const record = recordResponse.data.records[0];
      const collateralFiles = record.担保情報＿添付ファイル?.value || [];
      
      // 他のフィールドからも担保に関連しそうなファイルを探す
      const otherFiles = record.その他＿添付ファイル?.value || [];
      const additionalFiles = otherFiles.filter((f: any) => 
        f.name.includes('契約') || f.name.includes('保証') || f.name.includes('担保')
      );
      
      const allFiles = [...collateralFiles, ...additionalFiles];
      
      if (allFiles.length === 0) {
        return {
          success: false,
          findings: [],
          collateralAssessment: {
            keyRisks: ["担保関連書類が添付されていません"],
            recommendations: ["担保情報の書類提出を求めてください"],
          },
          summary: "担保関連書類が見つかりません",
        };
      }
      
      const findings = [];
      const keyRisks = [];
      const recommendations = [];
      let totalEstimatedValue = 0;
      
      // 各ファイルを柔軟に処理
      for (const file of allFiles.slice(0, 3)) { // 最大3ファイルまで処理
        console.log(`[OCR Collateral] Processing: ${file.name}`);
        
        // ファイルをダウンロード
        const downloadUrl = `https://${domain}/k/v1/file.json?fileKey=${file.fileKey}`;
        const fileResponse = await axios.get(downloadUrl, {
          headers: { 'X-Cybozu-API-Token': apiToken },
          responseType: 'arraybuffer',
        });
        
        const base64Content = Buffer.from(fileResponse.data).toString('base64');
        
        // GPT-4oで柔軟に解析
        const prompt = `この書類を分析して、担保価値の評価に役立つ情報を抽出してください：

1. **書類の種類を推定**（請求書、契約書、保証書、その他）
2. **金額情報**を全て抽出（請求額、保証額、契約額など）
3. **日付情報**を全て抽出（支払期日、契約日など）
4. **企業名・個人名**を抽出

特に以下の企業に関連する情報を探してください：
${collateralCompanies.map(c => `- ${c.name}${c.expectedAmount ? ` (期待額: ${c.expectedAmount.toLocaleString()}円)` : ''}`).join('\n')}

5. **担保価値に影響する要素**：
   - 支払条件
   - 保証内容
   - リスク要因
   - その他重要事項

事実のみを簡潔に報告してください。`;
        
        // データURL形式で送信
        const isPDF = file.contentType === 'application/pdf';
        const dataUrl = isPDF 
          ? `data:application/pdf;base64,${base64Content}`
          : `data:${file.contentType};base64,${base64Content}`;
        
        const response = await generateText({
          model: openai("gpt-4o"),
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image", image: dataUrl }
              ]
            }
          ],
        });
        
        const text = response.text;
        
        // 書類タイプを推定
        let documentType = "その他";
        if (text.includes("請求書") || file.name.includes("請求")) {
          documentType = "請求書";
        } else if (text.includes("契約書") || file.name.includes("契約")) {
          documentType = "契約書";
        } else if (text.includes("保証") || file.name.includes("保証")) {
          documentType = "保証書";
        } else if (text.includes("注文") || file.name.includes("発注")) {
          documentType = "発注書";
        }
        
        // 関連企業を特定
        let relatedCompany = undefined;
        for (const company of collateralCompanies) {
          if (text.includes(company.name) || file.name.includes(company.name)) {
            relatedCompany = company.name;
            break;
          }
        }
        
        // 金額を抽出
        const amounts = [];
        const amountMatches = text.matchAll(/([\d,]+)円/g);
        for (const match of amountMatches) {
          const amount = parseInt(match[1].replace(/,/g, ''));
          if (amount > 10000) { // 1万円以上のみ
            // 前後の文脈から説明を推定
            const start = Math.max(0, match.index - 20);
            const context = text.substring(start, match.index);
            amounts.push({
              description: context.trim() || "金額",
              amount,
            });
            totalEstimatedValue += amount;
          }
        }
        
        // 日付を抽出
        const dates = [];
        const dateMatches = text.matchAll(/(\d{4}[年/]\d{1,2}[月/]\d{1,2}日?)/g);
        for (const match of dateMatches) {
          dates.push(match[1]);
        }
        
        // 重要情報を抽出
        const keyInformation = [];
        if (documentType !== "その他") keyInformation.push(`書類種別: ${documentType}`);
        if (relatedCompany) keyInformation.push(`関連企業: ${relatedCompany}`);
        if (amounts.length > 0) keyInformation.push(`金額情報${amounts.length}件`);
        
        // リスク要因を探す
        if (text.includes("遅延") || text.includes("延滞")) {
          keyRisks.push(`${file.name}: 支払遅延の可能性`);
          keyInformation.push("⚠️ 支払遅延リスク");
        }
        if (text.includes("解除") || text.includes("取消")) {
          keyRisks.push(`${file.name}: 契約解除条項あり`);
          keyInformation.push("⚠️ 契約解除リスク");
        }
        
        // 信頼性を評価
        const reliability = relatedCompany && amounts.length > 0 ? "high" :
                          relatedCompany || amounts.length > 0 ? "medium" : "low";
        
        findings.push({
          fileName: file.name,
          documentType,
          relatedCompany,
          keyInformation,
          amounts,
          dates,
          reliability,
        });
      }
      
      // 推奨事項を生成
      const highReliabilityCount = findings.filter(f => f.reliability === "high").length;
      if (highReliabilityCount === 0) {
        recommendations.push("担保企業名と金額が明確な書類の提出を求めてください");
      }
      
      if (totalEstimatedValue === 0) {
        recommendations.push("担保価値を評価できる金額情報が不足しています");
      }
      
      // 各担保企業のカバー状況を確認
      for (const company of collateralCompanies) {
        const companyFindings = findings.filter(f => f.relatedCompany === company.name);
        if (companyFindings.length === 0) {
          recommendations.push(`${company.name}の担保書類が不足している可能性があります`);
        }
      }
      
      // サマリー生成
      const summary = `${allFiles.length}件中${findings.length}件の担保関連書類を分析。` +
        (totalEstimatedValue > 0 ? `推定担保価値: ${totalEstimatedValue.toLocaleString()}円。` : "") +
        (keyRisks.length > 0 ? `リスク要因${keyRisks.length}件検出。` : "");
      
      return {
        success: true,
        findings,
        collateralAssessment: {
          totalValue: totalEstimatedValue > 0 ? totalEstimatedValue : undefined,
          keyRisks,
          recommendations,
        },
        summary,
      };
      
    } catch (error) {
      console.error(`[OCR Collateral] Error:`, error);
      return {
        success: false,
        findings: [],
        collateralAssessment: {
          keyRisks: ["OCR処理でエラーが発生しました"],
          recommendations: ["技術的な問題を解決後、再度実行してください"],
        },
        summary: `エラー: ${error instanceof Error ? error.message : "OCR処理に失敗しました"}`,
      };
    }
  },
});