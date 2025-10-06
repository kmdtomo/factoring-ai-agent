#!/usr/bin/env node
import axios from 'axios';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const recordId = process.argv[2] || '9918';

async function fetchKintoneData() {
  const domain = process.env.KINTONE_DOMAIN;
  const apiToken = process.env.KINTONE_API_TOKEN;
  const appId = process.env.KINTONE_APP_ID;

  if (!domain || !apiToken || !appId) {
    throw new Error('Kintone環境変数が設定されていません');
  }

  console.log(`📊 Kintoneデータ取得開始 - Record ID: ${recordId}`);

  const url = `https://${domain}/k/v1/records.json?app=${appId}&query=$id="${recordId}"`;

  const response = await axios.get(url, {
    headers: { 'X-Cybozu-API-Token': apiToken },
  });

  if (response.data.records.length === 0) {
    throw new Error(`レコードID: ${recordId} が見つかりません`);
  }

  const record = response.data.records[0];

  // 基本情報
  const basicInfo = {
    顧客番号: record.顧客番号?.value || "",
    種別: record.種別?.value || "",
    屋号: record.屋号?.value || "",
    会社名: record.会社名?.value || "",
    代表者名: record.代表者名?.value || "",
    生年月日: record.生年月日?.value || "",
    年齢: record.年齢?.value || "",
    携帯番号: record.携帯番号_ハイフンなし?.value || "",
    自宅所在地: record.自宅所在地?.value || "",
    会社所在地: record.会社所在地?.value || "",
    入金日: record.入金日?.value || "",
    設立年: record.設立年?.value || "",
    年商: record.年商?.value || "",
  };

  // 財務・リスク情報
  const financialInfo = {
    売上: record.売上?.value || "",
    業種: record.業種?.value || "",
    資金使途: record.資金使途?.value || "",
    ファクタリング利用: record.ファクタリング利用?.value || "",
    納付状況_税金: record.納付状況_税金?.value || "",
    税金滞納額: record.税金滞納額_0?.value || "",
    納付状況_保険料: record.納付状況_保険料?.value || "",
    保険料滞納額: record.保険料滞納額?.value || "",
  };

  // 買取情報テーブル
  const 買取情報 = (record.買取情報?.value || []).map((row) => ({
    企業名: row.value.会社名_第三債務者_買取?.value || "",
    総債権額: row.value.総債権額?.value || "",
    買取債権額: row.value.買取債権額?.value || "",
    買取額: row.value.買取額?.value || "",
    掛目: row.value.掛目?.value || "",
    粗利額: row.value.粗利額?.value || "",
    粗利率: row.value.粗利率?.value || "",
    買取債権支払日: row.value.買取債権支払日?.value || "",
    状態: row.value.状態_0?.value || "",
    再契約の意思: row.value.再契約の意思?.value || "",
    再契約時買取債権額: row.value.再契約時買取債権額?.value || "",
    再契約時買取額: row.value.再契約時買取額?.value || "",
    再契約時粗利額: row.value.再契約時粗利額?.value || "",
    再契約粗利率: row.value.再契約粗利率?.value || "",
  }));

  // 担保情報テーブル
  const 担保情報 = (record.担保情報?.value || []).map((row) => ({
    担保企業名: row.value.会社名_第三債務者_担保?.value || "",
    請求額: row.value.請求額?.value || "",
    入金予定日: row.value.入金予定日?.value || "",
    過去の入金_先々月: row.value.過去の入金_先々月?.value || "",
    過去の入金_先月: row.value.過去の入金_先月?.value || "",
    過去の入金_今月: row.value.過去の入金_今月?.value || "",
    平均: row.value.平均?.value || "",
  }));

  // 謄本情報テーブル
  const 謄本情報 = (record.謄本情報_営業?.value || []).map((row) => ({
    会社名: row.value.会社名_第三債務者_0?.value || "",
    資本金の額: row.value.資本金の額?.value || "",
    会社成立: row.value.会社成立?.value || "",
    債権の種類: row.value.債権の種類?.value || "",
    年: row.value.年?.value || "",
    最終登記取得日: row.value.最終登記取得日?.value || "",
  }));

  // 回収情報テーブル
  const 回収情報 = (record.回収情報?.value || []).map((row) => ({
    回収予定日: row.value.回収予定日?.value || "",
    回収金額: row.value.回収金額?.value || "",
  }));

  const kintoneData = {
    recordId,
    basicInfo,
    financialInfo,
    買取情報,
    担保情報,
    謄本情報,
    回収情報,
  };

  // JSONファイルに保存
  const jsonPath = `./docs/kintone-data-${recordId}.json`;
  fs.writeFileSync(jsonPath, JSON.stringify(kintoneData, null, 2), 'utf-8');

  // Markdownファイルに保存
  const mdContent = generateMarkdown(kintoneData);
  const mdPath = `./docs/kintone-data-${recordId}.md`;
  fs.writeFileSync(mdPath, mdContent, 'utf-8');

  console.log(`✅ データ取得完了`);
  console.log(`💾 JSON: ${jsonPath}`);
  console.log(`📄 MD: ${mdPath}`);
}

function generateMarkdown(data) {
  let md = `# Kintoneデータ - Record ID: ${data.recordId}\n\n`;

  md += `## 基本情報\n\n`;
  md += `| 項目 | 値 |\n|------|----|\n`;
  Object.entries(data.basicInfo).forEach(([key, value]) => {
    md += `| ${key} | ${value} |\n`;
  });

  md += `\n## 財務・リスク情報\n\n`;
  md += `| 項目 | 値 |\n|------|----|\n`;
  Object.entries(data.financialInfo).forEach(([key, value]) => {
    md += `| ${key} | ${value} |\n`;
  });

  md += `\n## 買取情報テーブル\n\n`;
  if (data.買取情報.length > 0) {
    const keys = Object.keys(data.買取情報[0]);
    md += `| ${keys.join(' | ')} |\n`;
    md += `| ${keys.map(() => '---').join(' | ')} |\n`;
    data.買取情報.forEach(row => {
      md += `| ${keys.map(k => row[k]).join(' | ')} |\n`;
    });
  } else {
    md += `（データなし）\n`;
  }

  md += `\n## 担保情報テーブル\n\n`;
  if (data.担保情報.length > 0) {
    const keys = Object.keys(data.担保情報[0]);
    md += `| ${keys.join(' | ')} |\n`;
    md += `| ${keys.map(() => '---').join(' | ')} |\n`;
    data.担保情報.forEach(row => {
      md += `| ${keys.map(k => row[k]).join(' | ')} |\n`;
    });
  } else {
    md += `（データなし）\n`;
  }

  md += `\n## 謄本情報テーブル\n\n`;
  if (data.謄本情報.length > 0) {
    const keys = Object.keys(data.謄本情報[0]);
    md += `| ${keys.join(' | ')} |\n`;
    md += `| ${keys.map(() => '---').join(' | ')} |\n`;
    data.謄本情報.forEach(row => {
      md += `| ${keys.map(k => row[k]).join(' | ')} |\n`;
    });
  } else {
    md += `（データなし）\n`;
  }

  md += `\n## 回収情報テーブル\n\n`;
  if (data.回収情報.length > 0) {
    const keys = Object.keys(data.回収情報[0]);
    md += `| ${keys.join(' | ')} |\n`;
    md += `| ${keys.map(() => '---').join(' | ')} |\n`;
    data.回収情報.forEach(row => {
      md += `| ${keys.map(k => row[k]).join(' | ')} |\n`;
    });
  } else {
    md += `（データなし）\n`;
  }

  return md;
}

fetchKintoneData().catch(console.error);
