const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_ORG = process.env.GITHUB_ORG || 'Realtyka';

const GITHUB_API_BASE = 'https://api.github.com';

interface GitHubCodeMatch {
  repository: string;
  filePath: string;
  url: string;
  textMatches: string[];
}

interface GitHubRepoMatch {
  name: string;
  fullName: string;
  description: string;
  language: string;
  url: string;
  htmlUrl: string;
}

export function isGitHubConfigured(): boolean {
  return GITHUB_TOKEN.length > 0;
}

async function githubFetch(path: string, params?: Record<string, string>): Promise<any> {
  const url = new URL(`${GITHUB_API_BASE}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.text-match+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API error ${response.status}: ${text}`);
  }

  return response.json();
}

export async function searchGitHubCode(
  query: string,
  org?: string,
  limit: number = 10
): Promise<GitHubCodeMatch[]> {
  const targetOrg = org || GITHUB_ORG;
  const fullQuery = targetOrg ? `${query} org:${targetOrg}` : query;

  try {
    const data = await githubFetch('/search/code', {
      q: fullQuery,
      per_page: String(limit),
    });

    const items = data.items || [];

    return items.map((item: any) => ({
      repository: item.repository?.full_name || '',
      filePath: item.path || '',
      url: item.html_url || '',
      textMatches: (item.text_matches || []).map((tm: any) => {
        const fragment = tm.fragment || '';
        return fragment.substring(0, 300);
      }),
    }));
  } catch (error) {
    console.error('Error searching GitHub code:', error);
    return [];
  }
}

export async function searchGitHubRepos(
  query: string,
  org?: string,
  limit: number = 5
): Promise<GitHubRepoMatch[]> {
  const targetOrg = org || GITHUB_ORG;
  const fullQuery = targetOrg ? `${query} org:${targetOrg}` : query;

  try {
    const data = await githubFetch('/search/repositories', {
      q: fullQuery,
      per_page: String(limit),
      sort: 'best-match',
    });

    const items = data.items || [];

    return items.map((item: any) => ({
      name: item.name || '',
      fullName: item.full_name || '',
      description: item.description || '',
      language: item.language || '',
      url: item.url || '',
      htmlUrl: item.html_url || '',
    }));
  } catch (error) {
    console.error('Error searching GitHub repos:', error);
    return [];
  }
}

export async function searchAndFetchGitHubResults(
  query: string,
  org?: string
): Promise<string> {
  if (!isGitHubConfigured()) {
    return 'GitHub search is not configured (GITHUB_TOKEN not set). Skipping code search.';
  }

  const [codeResults, repoResults] = await Promise.all([
    searchGitHubCode(query, org, 10),
    searchGitHubRepos(query, org, 5),
  ]);

  const parts: string[] = [];

  if (repoResults.length > 0) {
    parts.push('## Relevant Repositories');
    parts.push('');
    for (const repo of repoResults) {
      const desc = repo.description ? ` - ${repo.description}` : '';
      const lang = repo.language ? ` [${repo.language}]` : '';
      parts.push(`- **${repo.fullName}**${lang}${desc}`);
      parts.push(`  ${repo.htmlUrl}`);
    }
  } else {
    parts.push('No matching repositories found.');
  }

  parts.push('');

  if (codeResults.length > 0) {
    parts.push('## Code Matches');
    parts.push('');
    for (const match of codeResults) {
      parts.push(`### ${match.repository} / ${match.filePath}`);
      parts.push(`${match.url}`);
      if (match.textMatches.length > 0) {
        parts.push('```');
        parts.push(match.textMatches.join('\n...\n'));
        parts.push('```');
      }
      parts.push('');
    }
  } else {
    parts.push('No matching code found.');
  }

  return parts.join('\n');
}
