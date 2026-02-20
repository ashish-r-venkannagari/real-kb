import { z } from 'zod/v3';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { searchKBArticles, getKBArticle, searchAndFetchArticles } from './youtrack-kb.js';
import { searchSupportSite, getSupportArticle, searchAndFetchSupportArticles } from './support-site.js';
import { isGitHubConfigured, searchGitHubCode, searchGitHubRepos, searchAndFetchGitHubResults, getGitHubFile, listRepoContents } from './github-search.js';

export function registerTools(server: McpServer): void {

  server.registerTool(
    'ask_product_question',
    {
      description: 'Search through YouTrack knowledge base (PRDs, RFCs, documentation) and the Real Brokerage support site to gather relevant content for answering a product question. Returns content from both sources along with initial GitHub code search results. IMPORTANT: After receiving results, use search_github_code to find relevant implementations, then use list_github_repo_contents and get_github_file to read the actual source code of microservices mentioned in the articles. This helps verify whether features described in PRDs are actually implemented and provides code-informed answers.',
      inputSchema: {
        question: z.string().describe('The product question to research'),
        max_kb_articles: z.number().optional().describe('Maximum number of YouTrack KB articles to fetch (default: 5)'),
        max_support_articles: z.number().optional().describe('Maximum number of support articles to fetch (default: 3)'),
        include_github: z.boolean().optional().describe('Include GitHub code search results (default: true if GITHUB_TOKEN is configured)'),
      },
    },
    async ({ question, max_kb_articles, max_support_articles, include_github }) => {
      const kbLimit = max_kb_articles ?? 5;
      const supportLimit = max_support_articles ?? 3;
      const shouldSearchGitHub = include_github ?? isGitHubConfigured();

      const promises: Promise<string>[] = [
        searchAndFetchArticles(question, kbLimit),
        searchAndFetchSupportArticles(question, supportLimit),
      ];

      if (shouldSearchGitHub && isGitHubConfigured()) {
        promises.push(searchAndFetchGitHubResults(question));
      }

      const [kbContent, supportContent, githubContent] = await Promise.all(promises);

      const response = [
        '# YouTrack Knowledge Base Results',
        '',
        kbContent,
        '',
        '---',
        '',
        '# Support Site Results',
        '',
        supportContent,
        '',
        '---',
        '',
        '# GitHub Code Search Results',
        '',
        githubContent || 'GitHub search is not configured (GITHUB_TOKEN not set). Skipping code search.',
      ].join('\n');

      return {
        content: [{ type: 'text' as const, text: response }],
      };
    }
  );

  server.registerTool(
    'search_kb_articles',
    {
      description: 'Search YouTrack knowledge base articles (PRDs, RFCs, documentation) and return titles and summaries',
      inputSchema: {
        query: z.string().describe('Search query for knowledge base articles'),
        limit: z.number().optional().describe('Maximum number of results (default: 10)'),
      },
    },
    async ({ query, limit }) => {
      const articles = await searchKBArticles(query, limit ?? 10);

      if (articles.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No knowledge base articles found.' }],
        };
      }

      const text = articles.map(a => {
        const parts = [`**${a.summary}** (${a.idReadable})`];
        if (a.project) parts.push(`  Project: ${a.project.name}`);
        if (a.parentArticle) parts.push(`  Parent: ${a.parentArticle.summary}`);
        if (a.content) {
          const preview = a.content.substring(0, 200).replace(/\n/g, ' ');
          parts.push(`  ${preview}...`);
        }
        return parts.join('\n');
      }).join('\n\n');

      return {
        content: [{ type: 'text' as const, text }],
      };
    }
  );

  server.registerTool(
    'get_kb_article',
    {
      description: 'Get the full content of a specific YouTrack knowledge base article by its ID',
      inputSchema: {
        article_id: z.string().describe('The article ID (e.g., "RV2-A-123")'),
      },
    },
    async ({ article_id }) => {
      const article = await getKBArticle(article_id);

      if (!article) {
        return {
          content: [{ type: 'text' as const, text: `Article ${article_id} not found.` }],
        };
      }

      const parts: string[] = [];
      parts.push(`# ${article.summary}`);
      parts.push(`**ID:** ${article.idReadable}`);
      if (article.project) parts.push(`**Project:** ${article.project.name} (${article.project.shortName})`);
      if (article.parentArticle) parts.push(`**Parent:** ${article.parentArticle.summary} (${article.parentArticle.idReadable})`);
      if (article.childArticles && article.childArticles.length > 0) {
        parts.push(`**Sub-articles:** ${article.childArticles.map(c => `${c.summary} (${c.idReadable})`).join(', ')}`);
      }
      if (article.content) {
        parts.push('');
        parts.push(article.content);
      }

      return {
        content: [{ type: 'text' as const, text: parts.join('\n') }],
      };
    }
  );

  server.registerTool(
    'search_support_site',
    {
      description: 'Search the Real Brokerage support site (support.therealbrokerage.com) and return article titles and URLs',
      inputSchema: {
        query: z.string().describe('Search query for support articles'),
        limit: z.number().optional().describe('Maximum number of results (default: 5)'),
      },
    },
    async ({ query, limit }) => {
      const articles = await searchSupportSite(query, limit ?? 5);

      if (articles.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No support articles found.' }],
        };
      }

      const text = articles.map(a => {
        const parts = [`**${a.title}**`, `  ${a.url}`];
        if (a.snippet) parts.push(`  ${a.snippet}`);
        return parts.join('\n');
      }).join('\n\n');

      return {
        content: [{ type: 'text' as const, text }],
      };
    }
  );

  server.registerTool(
    'get_support_article',
    {
      description: 'Fetch and return the full content of a specific Real Brokerage support article by URL',
      inputSchema: {
        url: z.string().describe('The full URL of the support article'),
      },
    },
    async ({ url }) => {
      const content = await getSupportArticle(url);
      return {
        content: [{ type: 'text' as const, text: content }],
      };
    }
  );

  server.registerTool(
    'search_github_code',
    {
      description: 'Search for code across GitHub repositories in the organization. Useful for finding implementations, configurations, or references to specific features, services, or patterns.',
      inputSchema: {
        query: z.string().describe('Search query (e.g., "TransactionService", "commission calculation", "class AgentProfile")'),
        org: z.string().optional().describe('GitHub organization to search in (default: Realtyka)'),
        limit: z.number().optional().describe('Maximum number of results (default: 10)'),
      },
    },
    async ({ query, org, limit }) => {
      if (!isGitHubConfigured()) {
        return {
          content: [{ type: 'text' as const, text: 'GitHub search is not configured. Set GITHUB_TOKEN environment variable to enable this tool.' }],
        };
      }

      const results = await searchGitHubCode(query, org, limit ?? 10);

      if (results.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No code matches found.' }],
        };
      }

      const text = results.map(match => {
        const parts = [`**${match.repository}** / \`${match.filePath}\``];
        parts.push(`  ${match.url}`);
        if (match.textMatches.length > 0) {
          parts.push('```');
          parts.push(match.textMatches.join('\n...\n'));
          parts.push('```');
        }
        return parts.join('\n');
      }).join('\n\n');

      return {
        content: [{ type: 'text' as const, text }],
      };
    }
  );

  server.registerTool(
    'search_github_repos',
    {
      description: 'Search for repositories in the GitHub organization. Useful for discovering microservices, libraries, or projects related to a feature or domain.',
      inputSchema: {
        query: z.string().describe('Search query (e.g., "commission", "notification", "agent-service")'),
        org: z.string().optional().describe('GitHub organization to search in (default: Realtyka)'),
        limit: z.number().optional().describe('Maximum number of results (default: 5)'),
      },
    },
    async ({ query, org, limit }) => {
      if (!isGitHubConfigured()) {
        return {
          content: [{ type: 'text' as const, text: 'GitHub search is not configured. Set GITHUB_TOKEN environment variable to enable this tool.' }],
        };
      }

      const results = await searchGitHubRepos(query, org, limit ?? 5);

      if (results.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No matching repositories found.' }],
        };
      }

      const text = results.map(repo => {
        const parts = [`**${repo.fullName}**`];
        if (repo.language) parts.push(`  Language: ${repo.language}`);
        if (repo.description) parts.push(`  ${repo.description}`);
        parts.push(`  ${repo.htmlUrl}`);
        return parts.join('\n');
      }).join('\n\n');

      return {
        content: [{ type: 'text' as const, text }],
      };
    }
  );

  server.registerTool(
    'get_github_file',
    {
      description: 'Fetch the full content of a specific file from a GitHub repository. Use this after finding relevant files via search_github_code to read the actual implementation and verify if a feature is implemented.',
      inputSchema: {
        repo: z.string().describe('Full repository name (e.g., "Realtyka/transaction-service")'),
        path: z.string().describe('File path within the repository (e.g., "src/main/java/com/real/service/CommissionService.java")'),
        ref: z.string().optional().describe('Branch, tag, or commit SHA (default: repo default branch)'),
      },
    },
    async ({ repo, path, ref }) => {
      if (!isGitHubConfigured()) {
        return {
          content: [{ type: 'text' as const, text: 'GitHub search is not configured. Set GITHUB_TOKEN environment variable to enable this tool.' }],
        };
      }

      const file = await getGitHubFile(repo, path, ref);

      if (!file) {
        return {
          content: [{ type: 'text' as const, text: `File not found: ${repo}/${path}` }],
        };
      }

      const header = [
        `**${repo}** / \`${path}\``,
        `**Size:** ${file.size} bytes`,
        `**URL:** ${file.htmlUrl}`,
        '',
      ].join('\n');

      // Truncate very large files to avoid overwhelming the context
      const maxChars = 50000;
      let content = file.content;
      let truncated = false;
      if (content.length > maxChars) {
        content = content.substring(0, maxChars);
        truncated = true;
      }

      const text = header + '```\n' + content + '\n```' +
        (truncated ? `\n\n*File truncated at ${maxChars} characters. Total size: ${file.size} bytes.*` : '');

      return {
        content: [{ type: 'text' as const, text }],
      };
    }
  );

  server.registerTool(
    'list_github_repo_contents',
    {
      description: 'List files and directories in a GitHub repository path. Use this to explore repository structure — find source directories, configuration files, or locate specific service implementations before reading them with get_github_file.',
      inputSchema: {
        repo: z.string().describe('Full repository name (e.g., "Realtyka/transaction-service")'),
        path: z.string().optional().describe('Directory path within the repository (default: root). e.g., "src/main/java/com/real/service"'),
        ref: z.string().optional().describe('Branch, tag, or commit SHA (default: repo default branch)'),
      },
    },
    async ({ repo, path, ref }) => {
      if (!isGitHubConfigured()) {
        return {
          content: [{ type: 'text' as const, text: 'GitHub search is not configured. Set GITHUB_TOKEN environment variable to enable this tool.' }],
        };
      }

      const entries = await listRepoContents(repo, path || '', ref);

      if (entries.length === 0) {
        return {
          content: [{ type: 'text' as const, text: `No contents found at ${repo}/${path || ''}` }],
        };
      }

      // Sort: directories first, then files
      entries.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      const text = entries.map(entry => {
        const icon = entry.type === 'dir' ? '📁' : '📄';
        const size = entry.type === 'file' ? ` (${entry.size} bytes)` : '';
        return `${icon} ${entry.path}${size}`;
      }).join('\n');

      return {
        content: [{ type: 'text' as const, text: `**${repo}** / \`${path || '/'}\`\n\n${text}` }],
      };
    }
  );
}
