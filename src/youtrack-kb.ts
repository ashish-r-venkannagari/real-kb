const YOUTRACK_BASE_URL = process.env.YOUTRACK_BASE_URL || '';
const YOUTRACK_TOKEN = process.env.YOUTRACK_TOKEN || '';
const YOUTRACK_DEFAULT_PROJECT = process.env.YOUTRACK_DEFAULT_PROJECT || '';

interface YouTrackArticle {
  id: string;
  idReadable: string;
  summary: string;
  content?: string;
  created?: number;
  updated?: number;
  project?: { id: string; name: string; shortName: string };
  parentArticle?: { id: string; idReadable: string; summary: string };
  childArticles?: Array<{ id: string; idReadable: string; summary: string }>;
}

function getBaseUrl(): string {
  // Ensure base URL ends with /api
  let url = YOUTRACK_BASE_URL.replace(/\/+$/, '');
  if (!url.endsWith('/api')) {
    url += '/api';
  }
  return url;
}

async function youtrackFetch(path: string, params?: Record<string, string>): Promise<any> {
  const base = getBaseUrl();
  const url = new URL(`${base}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${YOUTRACK_TOKEN}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`YouTrack API error ${response.status}: ${text}`);
  }

  return response.json();
}

export async function searchKBArticles(query: string, limit: number = 10): Promise<YouTrackArticle[]> {
  const fields = 'id,idReadable,summary,content,created,updated,project(id,name,shortName),parentArticle(id,idReadable,summary)';

  try {
    const articles = await youtrackFetch('/articles', {
      query,
      fields,
      $top: String(limit),
    });

    return Array.isArray(articles) ? articles : [];
  } catch (error) {
    console.error('Error searching KB articles:', error);
    return [];
  }
}

export async function getKBArticle(articleId: string): Promise<YouTrackArticle | null> {
  const fields = 'id,idReadable,summary,content,created,updated,project(id,name,shortName),parentArticle(id,idReadable,summary),childArticles(id,idReadable,summary)';

  try {
    const article = await youtrackFetch(`/articles/${articleId}`, { fields });
    return article;
  } catch (error) {
    console.error(`Error fetching KB article ${articleId}:`, error);
    return null;
  }
}

export async function getArticleTree(projectShortName?: string, depth: number = 3): Promise<YouTrackArticle[]> {
  const project = projectShortName || YOUTRACK_DEFAULT_PROJECT;
  const query = project ? `project: ${project}` : '';
  const fields = 'id,idReadable,summary,project(id,name,shortName),parentArticle(id,idReadable,summary),childArticles(id,idReadable,summary)';

  try {
    const articles = await youtrackFetch('/articles', {
      query,
      fields,
      $top: '100',
    });

    return Array.isArray(articles) ? articles : [];
  } catch (error) {
    console.error('Error fetching article tree:', error);
    return [];
  }
}

export async function searchAndFetchArticles(query: string, maxArticles: number = 5): Promise<string> {
  const articles = await searchKBArticles(query, maxArticles);

  if (articles.length === 0) {
    return 'No YouTrack knowledge base articles found for this query.';
  }

  const results: string[] = [];
  for (const article of articles) {
    const fullArticle = await getKBArticle(article.idReadable || article.id);
    if (fullArticle) {
      results.push(formatArticle(fullArticle));
    }
  }

  return results.join('\n\n---\n\n');
}

function formatArticle(article: YouTrackArticle): string {
  const parts: string[] = [];
  parts.push(`## ${article.summary}`);
  parts.push(`**ID:** ${article.idReadable}`);

  if (article.project) {
    parts.push(`**Project:** ${article.project.name} (${article.project.shortName})`);
  }
  if (article.parentArticle) {
    parts.push(`**Parent:** ${article.parentArticle.summary} (${article.parentArticle.idReadable})`);
  }
  if (article.childArticles && article.childArticles.length > 0) {
    parts.push(`**Sub-articles:** ${article.childArticles.map(c => `${c.summary} (${c.idReadable})`).join(', ')}`);
  }
  if (article.content) {
    parts.push('');
    parts.push(article.content);
  }

  return parts.join('\n');
}
