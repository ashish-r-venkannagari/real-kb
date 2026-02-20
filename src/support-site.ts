import * as cheerio from 'cheerio';

const ZENDESK_API_BASE = 'https://support.therealbrokerage.com/api/v2/help_center';

interface SupportArticle {
  title: string;
  url: string;
  snippet?: string;
}

interface ZendeskArticle {
  id: number;
  title: string;
  html_url: string;
  body: string;
  snippet?: string;
  section_id: number;
  label_names: string[];
  created_at: string;
  updated_at: string;
}

export async function searchSupportSite(query: string, limit: number = 5): Promise<SupportArticle[]> {
  const searchUrl = `${ZENDESK_API_BASE}/articles/search.json?query=${encodeURIComponent(query)}&per_page=${limit}`;

  try {
    const response = await fetch(searchUrl, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Zendesk API returned ${response.status}`);
    }

    const data = await response.json() as { results: ZendeskArticle[] };

    return (data.results || []).map(article => ({
      title: article.title,
      url: article.html_url,
      snippet: article.snippet,
    }));
  } catch (error) {
    console.error('Error searching support site:', error);
    return [];
  }
}

export async function getSupportArticle(url: string): Promise<string> {
  try {
    // Extract article ID from URL like .../articles/13856836152087-...
    const match = url.match(/\/articles\/(\d+)/);
    if (!match) {
      return `Could not extract article ID from URL: ${url}`;
    }

    const articleId = match[1];
    const apiUrl = `${ZENDESK_API_BASE}/articles/${articleId}.json`;

    const response = await fetch(apiUrl, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Zendesk API returned ${response.status}`);
    }

    const data = await response.json() as { article: ZendeskArticle };
    const article = data.article;

    const parts: string[] = [];
    parts.push(`# ${article.title}`);
    parts.push(`**Source:** ${article.html_url}`);
    if (article.label_names && article.label_names.length > 0) {
      parts.push(`**Labels:** ${article.label_names.join(', ')}`);
    }

    if (article.body) {
      parts.push('');
      parts.push(htmlToMarkdown(article.body));
    }

    return parts.join('\n');
  } catch (error) {
    console.error(`Error fetching support article ${url}:`, error);
    return `Error fetching article: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function htmlToMarkdown(html: string): string {
  const $ = cheerio.load(html);

  // Remove script, style elements
  $('script, style').remove();

  const lines: string[] = [];

  $('h1, h2, h3, h4, h5, h6, p, li, tr, blockquote').each((_i, node) => {
    const $node = $(node);
    const tag = node.type === 'tag' ? node.tagName.toLowerCase() : '';
    const text = $node.clone().children('h1,h2,h3,h4,h5,h6,ul,ol,table,blockquote').remove().end().text().trim();

    if (!text) return;

    switch (tag) {
      case 'h1':
        lines.push(`\n# ${text}`);
        break;
      case 'h2':
        lines.push(`\n## ${text}`);
        break;
      case 'h3':
        lines.push(`\n### ${text}`);
        break;
      case 'h4':
      case 'h5':
      case 'h6':
        lines.push(`\n**${text}**`);
        break;
      case 'li':
        lines.push(`- ${text}`);
        break;
      case 'blockquote':
        lines.push(`> ${text}`);
        break;
      default:
        lines.push(text);
    }
  });

  // Deduplicate consecutive identical lines
  const result: string[] = [];
  for (const line of lines) {
    if (result.length === 0 || result[result.length - 1] !== line) {
      result.push(line);
    }
  }

  return result.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export async function searchAndFetchSupportArticles(query: string, maxArticles: number = 3): Promise<string> {
  const searchUrl = `${ZENDESK_API_BASE}/articles/search.json?query=${encodeURIComponent(query)}&per_page=${maxArticles}`;

  try {
    const response = await fetch(searchUrl, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Zendesk API returned ${response.status}`);
    }

    const data = await response.json() as { results: ZendeskArticle[] };
    const articles = data.results || [];

    if (articles.length === 0) {
      return 'No support articles found for this query.';
    }

    // The search API already returns the full body, so no need for extra fetches
    const results = articles.map(article => {
      const parts: string[] = [];
      parts.push(`# ${article.title}`);
      parts.push(`**Source:** ${article.html_url}`);
      if (article.label_names && article.label_names.length > 0) {
        parts.push(`**Labels:** ${article.label_names.join(', ')}`);
      }
      if (article.body) {
        parts.push('');
        parts.push(htmlToMarkdown(article.body));
      }
      return parts.join('\n');
    });

    return results.join('\n\n---\n\n');
  } catch (error) {
    console.error('Error searching and fetching support articles:', error);
    return `Error searching support articles: ${error instanceof Error ? error.message : String(error)}`;
  }
}
