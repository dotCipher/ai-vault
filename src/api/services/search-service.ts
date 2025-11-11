/**
 * Full-text search service for conversations
 *
 * Provides fast in-memory search across all archived conversations
 * Uses a simple but effective inverted index approach
 */

import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import type { VaultConfig as Config } from '../../types/index.js';
import { getDefaultStorageConfig } from '../../core/storage.js';

export interface SearchResult {
  id: string;
  provider: string;
  title: string;
  preview: string;
  score: number;
  matches: SearchMatch[];
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
  workspace?: string;
  project?: string;
}

export interface SearchMatch {
  text: string;
  context: string;
  position: number;
}

export interface SearchQuery {
  query: string;
  providers?: string[];
  since?: Date;
  until?: Date;
  limit?: number;
  fuzzy?: boolean;
}

interface IndexedDocument {
  id: string;
  provider: string;
  title: string;
  content: string;
  preview: string;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
  workspace?: string;
  project?: string;
  filePath: string;
}

export class SearchService {
  private index: Map<string, IndexedDocument> = new Map();
  private invertedIndex: Map<string, Set<string>> = new Map();
  private isIndexed = false;

  /**
   * Build search index from all archived conversations
   */
  async buildIndex(providers: string[], archiveDir?: string): Promise<void> {
    console.log('Building search index...');

    this.index.clear();
    this.invertedIndex.clear();

    const storageConfig = getDefaultStorageConfig(); if (archiveDir) storageConfig.baseDir = archiveDir;
    

    let totalDocs = 0;

    for (const provider of providers) {
      const providerPath = path.join(storageConfig.baseDir, provider);
      if (!existsSync(providerPath)) {
        continue;
      }

      // Load index to get conversation metadata
      const indexPath = path.join(providerPath, 'index.json');
      if (!existsSync(indexPath)) {
        continue;
      }

      const indexData = await fs.readFile(indexPath, 'utf-8');
      const providerIndex = JSON.parse(indexData);

      // Index each conversation
      for (const [conversationId, entry] of Object.entries(providerIndex) as any) {
        try {
          const conversationPath = path.join(providerPath, entry.filePath);
          if (!existsSync(conversationPath)) {
            continue;
          }

          const conversationData = await fs.readFile(conversationPath, 'utf-8');
          const conversation = JSON.parse(conversationData);

          // Extract text content from all messages
          const content = conversation.messages
            ?.map((msg: any) => {
              const parts = [];
              if (msg.content) {
                if (typeof msg.content === 'string') {
                  parts.push(msg.content);
                } else if (Array.isArray(msg.content)) {
                  for (const part of msg.content) {
                    if (typeof part === 'string') {
                      parts.push(part);
                    } else if (part.text) {
                      parts.push(part.text);
                    }
                  }
                }
              }
              return parts.join(' ');
            })
            .join('\n')
            .toLowerCase() || '';

          const doc: IndexedDocument = {
            id: conversationId,
            provider,
            title: conversation.title || entry.title || 'Untitled',
            content,
            preview: entry.preview || content.slice(0, 200),
            createdAt: entry.createdAt || conversation.createdAt,
            updatedAt: entry.updatedAt || conversation.updatedAt,
            messageCount: entry.messageCount,
            workspace: entry.workspace,
            project: entry.project,
            filePath: entry.filePath,
          };

          // Add to main index
          this.index.set(conversationId, doc);

          // Build inverted index (term -> document IDs)
          const terms = this.tokenize(doc.title + ' ' + doc.content);
          for (const term of terms) {
            if (!this.invertedIndex.has(term)) {
              this.invertedIndex.set(term, new Set());
            }
            this.invertedIndex.get(term)!.add(conversationId);
          }

          totalDocs++;
        } catch (error) {
          console.error(`Failed to index conversation ${conversationId}:`, error);
        }
      }
    }

    this.isIndexed = true;
    console.log(`Search index built: ${totalDocs} documents indexed`);
  }

  /**
   * Search conversations with full-text search
   */
  async search(query: SearchQuery): Promise<SearchResult[]> {
    if (!this.isIndexed) {
      throw new Error('Search index not built. Call buildIndex() first.');
    }

    const { query: queryText, providers, since, until, limit = 50, fuzzy = true } = query;

    // Tokenize query
    const queryTerms = this.tokenize(queryText.toLowerCase());
    if (queryTerms.length === 0) {
      return [];
    }

    // Find matching documents
    const docScores = new Map<string, number>();

    for (const term of queryTerms) {
      // Exact matches
      const exactMatches = this.invertedIndex.get(term);
      if (exactMatches) {
        for (const docId of exactMatches) {
          docScores.set(docId, (docScores.get(docId) || 0) + 1);
        }
      }

      // Fuzzy matches (if enabled)
      if (fuzzy) {
        for (const [indexedTerm, docIds] of this.invertedIndex.entries()) {
          if (this.isFuzzyMatch(term, indexedTerm)) {
            for (const docId of docIds) {
              docScores.set(docId, (docScores.get(docId) || 0) + 0.5); // Lower score for fuzzy
            }
          }
        }
      }
    }

    // Filter and score results
    const results: SearchResult[] = [];

    for (const [docId, score] of docScores.entries()) {
      const doc = this.index.get(docId);
      if (!doc) continue;

      // Apply filters
      if (providers && !providers.includes(doc.provider)) continue;
      if (since && new Date(doc.updatedAt) < since) continue;
      if (until && new Date(doc.updatedAt) > until) continue;

      // Find matches in content
      const matches = this.findMatches(doc, queryTerms);

      results.push({
        id: doc.id,
        provider: doc.provider,
        title: doc.title,
        preview: doc.preview,
        score,
        matches,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        messageCount: doc.messageCount,
        workspace: doc.workspace,
        project: doc.project,
      });
    }

    // Sort by score (descending) and limit
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * Get search suggestions based on partial query
   */
  getSuggestions(partialQuery: string, limit: number = 10): string[] {
    const terms = this.tokenize(partialQuery.toLowerCase());
    if (terms.length === 0) return [];

    const lastTerm = terms[terms.length - 1];
    const suggestions = new Set<string>();

    // Find terms that start with the last term
    for (const indexedTerm of this.invertedIndex.keys()) {
      if (indexedTerm.startsWith(lastTerm) && indexedTerm !== lastTerm) {
        suggestions.add(indexedTerm);
        if (suggestions.size >= limit) break;
      }
    }

    return Array.from(suggestions).slice(0, limit);
  }

  /**
   * Get index statistics
   */
  getStats() {
    return {
      documentsIndexed: this.index.size,
      termsIndexed: this.invertedIndex.size,
      isIndexed: this.isIndexed,
    };
  }

  /**
   * Tokenize text into searchable terms
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Remove punctuation
      .split(/\s+/) // Split on whitespace
      .filter((term) => term.length > 2); // Filter short terms
  }

  /**
   * Check if two terms are fuzzy matches (simple edit distance)
   */
  private isFuzzyMatch(term1: string, term2: string): boolean {
    if (Math.abs(term1.length - term2.length) > 2) return false;
    if (term1 === term2) return false;

    // Simple prefix/suffix matching
    if (term1.length >= 4 && term2.length >= 4) {
      if (term1.startsWith(term2.slice(0, 3)) || term2.startsWith(term1.slice(0, 3))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Find matches and extract context
   */
  private findMatches(doc: IndexedDocument, queryTerms: string[]): SearchMatch[] {
    const matches: SearchMatch[] = [];
    const content = doc.content.toLowerCase();

    for (const term of queryTerms) {
      let position = 0;
      while ((position = content.indexOf(term, position)) !== -1) {
        const start = Math.max(0, position - 50);
        const end = Math.min(content.length, position + term.length + 50);
        const context = '...' + content.slice(start, end) + '...';

        matches.push({
          text: term,
          context,
          position,
        });

        position += term.length;

        // Limit matches per term
        if (matches.length >= 3) break;
      }
    }

    return matches;
  }
}

// Singleton instance
let searchService: SearchService | null = null;

export function getSearchService(): SearchService {
  if (!searchService) {
    searchService = new SearchService();
  }
  return searchService;
}
