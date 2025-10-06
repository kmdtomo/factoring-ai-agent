import axios from 'axios';

async function performGoogleSearch(query) {
  const apiKey = process.env.GOOGLE_API_KEY;
  const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
  if (!apiKey || !searchEngineId) {
    console.warn("Google Search API credentials not found, returning empty results");
    return [];
  }
  try {
    const response = await axios.get("https://www.googleapis.com/customsearch/v1", {
      params: {
        key: apiKey,
        cx: searchEngineId,
        q: query,
        num: 3,
        // 最大3件
        hl: "ja"
        // 日本語優先
      }
    });
    if (!response.data.items || response.data.items.length === 0) {
      const totalResults = parseInt(response.data.searchInformation?.totalResults || "0");
      if (totalResults === 0) {
        console.log(`No results found for query: "${query}"`);
      }
      return [];
    }
    return response.data.items.map((item) => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet
    }));
  } catch (error) {
    console.error("Google Search API error:", error);
    return [];
  }
}

export { performGoogleSearch as p };
