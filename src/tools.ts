import { z } from 'zod/v3';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { searchKBArticles, getKBArticle, searchAndFetchArticles } from './youtrack-kb.js';
import { searchSupportSite, getSupportArticle, searchAndFetchSupportArticles } from './support-site.js';

export function registerTools(server: McpServer): void {

  server.registerTool(
    'ask_product_question',
    {
      description: 'Search through YouTrack knowledge base (PRDs, RFCs, documentation) and the Real Brokerage support site to gather relevant content for answering a product question. Returns content from both sources for synthesis. After receiving results, you should also look into the code for each of the microservices mentioned in the articles to provide a comprehensive, code-informed answer.',
      inputSchema: {
        question: z.string().describe('The product question to research'),
        max_kb_articles: z.number().optional().describe('Maximum number of YouTrack KB articles to fetch (default: 5)'),
        max_support_articles: z.number().optional().describe('Maximum number of support articles to fetch (default: 3)'),
      },
    },
    async ({ question, max_kb_articles, max_support_articles }) => {
      const kbLimit = max_kb_articles ?? 5;
      const supportLimit = max_support_articles ?? 3;

      const [kbContent, supportContent] = await Promise.all([
        searchAndFetchArticles(question, kbLimit),
        searchAndFetchSupportArticles(question, supportLimit),
      ]);

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
}
