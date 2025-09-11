import { ocrPurchaseInfoTool } from './src/mastra/tools/ocr-purchase-info-tool';
import { ocrBankStatementTool } from './src/mastra/tools/ocr-bank-statement-tool';

async function testOCRTools() {
  console.log('=== Testing OCR Tools ===');
  
  // Test Purchase OCR
  console.log('\n1. Testing Purchase OCR Tool with Yes/No approach');
  try {
    const purchaseResult = await ocrPurchaseInfoTool.execute({
      context: {
        recordId: "1",
        purchaseData: {
          totalDebtAmount: 4027740,
          debtorCompany: "テスト株式会社",
          purchaseAmount: 1500000,
        },
        applicantCompany: "申込者株式会社"
      }
    });
    console.log('Purchase OCR Result:', JSON.stringify(purchaseResult, null, 2));
  } catch (error) {
    console.error('Purchase OCR Error:', error);
  }
  
  // Test Bank OCR
  console.log('\n2. Testing Bank OCR Tool with Step-based approach');
  try {
    const bankResult = await ocrBankStatementTool.execute({
      context: {
        recordId: "1",
        collateralInfo: {
          companyName: "担保企業A",
          pastPayments: [
            { amount: 5264304, period: "先々月" },
            { amount: 1449725, period: "先月" },
            { amount: 6714029, period: "今月" }
          ],
          nextPayment: {
            amount: 2000000,
            date: "2024-04-10"
          }
        },
        isMainAccount: true
      }
    });
    console.log('Bank OCR Result:', JSON.stringify(bankResult, null, 2));
  } catch (error) {
    console.error('Bank OCR Error:', error);
  }
}

testOCRTools().catch(console.error);