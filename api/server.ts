#!/usr/bin/env node

/**
 * Fast Datagraph API Server
 * 
 * Serves encrypted content with sub-50ms response times
 * Optimized for bare metal Xnode deployment
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import path from 'path';
import fs from 'fs-extra';
import { FileDecryptor } from '../scripts/decrypt-files';
import {
  HealthResponse,
  SearchResult,
  APIStats,
  CacheStats,
  MemoryUsage,
  DatagraphError,
  ContentType,
  SearchType,
  PostMetadata,
  ImageMetadata,
  ChunkMetadata
} from '../types';

class DatagraphAPI {
  private app: express.Application;
  private decryptor: FileDecryptor;
  private cache: Map<string, Buffer | string>;
  private readonly dataDir: string;
  private readonly metadataDir: string;
  private readonly tempDir: string;

  constructor() {
    this.app = express();
    this.decryptor = new FileDecryptor();
    this.cache = new Map();
    this.dataDir = path.join(__dirname, '../data');
    this.metadataDir = path.join(__dirname, '../metadata');
    this.tempDir = path.join(__dirname, '../temp');
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Security headers
    this.app.use(helmet({
      contentSecurityPolicy: false, // Allow inline scripts for development
      crossOriginEmbedderPolicy: false
    }));
    
    // CORS for Xnode deployment
    this.app.use(cors({
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true
    }));
    
    // Compression for better performance
    this.app.use(compression());
    
    // JSON parsing
    this.app.use(express.json({ limit: '10mb' }));
    
    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
      });
      next();
    });

    // Error handling middleware
    this.app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
      console.error('API Error:', error);
      
      if (error instanceof DatagraphError) {
        res.status(error.statusCode).json({ 
          error: error.message, 
          code: error.code 
        });
      } else {
        res.status(500).json({ 
          error: 'Internal server error',
          code: 'INTERNAL_ERROR'
        });
      }
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', this.getHealth.bind(this));

    // Metadata endpoints (public, unencrypted)
    this.app.get('/api/metadata/posts', this.getPostsMetadata.bind(this));
    this.app.get('/api/metadata/images', this.getImagesMetadata.bind(this));
    this.app.get('/api/metadata/chunks', this.getChunksMetadata.bind(this));

    // Content endpoints (encrypted, requires decryption)
    this.app.get('/api/posts/:slug', this.getPost.bind(this));
    this.app.get('/api/images/:filename', this.getImage.bind(this));
    this.app.get('/api/database/:table', this.getDatabase.bind(this));

    // Search endpoint
    this.app.get('/api/search', this.search.bind(this));

    // Admin endpoints
    this.app.post('/api/admin/refresh-cache', this.refreshCache.bind(this));
    this.app.get('/api/admin/stats', this.getStats.bind(this));
  }

  /**
   * Health check endpoint
   */
  private async getHealth(req: Request, res: Response): Promise<void> {
    const response: HealthResponse = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
    res.json(response);
  }

  /**
   * Get posts metadata (public)
   */
  private async getPostsMetadata(req: Request, res: Response): Promise<void> {
    try {
      const metadataPath = path.join(this.metadataDir, 'posts.json');
      
      if (await fs.pathExists(metadataPath)) {
        const metadata = await fs.readJson(metadataPath);
        res.json(metadata);
      } else {
        res.json({ posts: [] });
      }
    } catch (error) {
      console.error('Error loading posts metadata:', error);
      throw new DatagraphError('Failed to load posts metadata', 'METADATA_ERROR');
    }
  }

  /**
   * Get images metadata (public)
   */
  private async getImagesMetadata(req: Request, res: Response): Promise<void> {
    try {
      const metadataPath = path.join(this.metadataDir, 'images.json');
      
      if (await fs.pathExists(metadataPath)) {
        const metadata = await fs.readJson(metadataPath);
        res.json(metadata);
      } else {
        res.json({ images: [] });
      }
    } catch (error) {
      console.error('Error loading images metadata:', error);
      throw new DatagraphError('Failed to load images metadata', 'METADATA_ERROR');
    }
  }

  /**
   * Get chunks metadata (public)
   */
  private async getChunksMetadata(req: Request, res: Response): Promise<void> {
    try {
      const metadataPath = path.join(this.metadataDir, 'chunks.json');
      
      if (await fs.pathExists(metadataPath)) {
        const metadata = await fs.readJson(metadataPath);
        res.json(metadata);
      } else {
        res.json({ chunks: [] });
      }
    } catch (error) {
      console.error('Error loading chunks metadata:', error);
      throw new DatagraphError('Failed to load chunks metadata', 'METADATA_ERROR');
    }
  }

  /**
   * Get decrypted post content
   */
  private async getPost(req: Request, res: Response): Promise<void> {
    try {
      const { slug } = req.params;
      const cacheKey = `post:${slug}`;
      
      // Check cache first
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey) as string;
        res.setHeader('Content-Type', 'text/markdown');
        res.send(cached);
        return;
      }
      
      // Find post manifest
      const manifestPath = path.join(this.dataDir, 'posts', `${slug}.manifest.json`);
      
      if (!(await fs.pathExists(manifestPath))) {
        res.status(404).json({ error: 'Post not found' });
        return;
      }
      
      // Decrypt post
      const tempPath = path.join(this.tempDir, `${slug}.md`);
      await fs.ensureDir(path.dirname(tempPath));
      
      const content = await this.decryptor.decryptFile(manifestPath, tempPath);
      const markdown = content.toString('utf-8');
      
      // Cache result
      this.cache.set(cacheKey, markdown);
      
      // Clean up temp file
      await fs.remove(tempPath);
      
      res.setHeader('Content-Type', 'text/markdown');
      res.send(markdown);
      
    } catch (error) {
      console.error('Error loading post:', error);
      throw new DatagraphError('Failed to load post', 'POST_ERROR');
    }
  }

  /**
   * Get decrypted image
   */
  private async getImage(req: Request, res: Response): Promise<void> {
    try {
      const { filename } = req.params;
      const cacheKey = `image:${filename}`;
      
      // Check cache first
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey) as Buffer;
        res.setHeader('Content-Type', this.getImageContentType(filename));
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year
        res.send(cached);
        return;
      }
      
      // Find image manifest
      const manifestPath = path.join(this.dataDir, 'images', `${filename}.manifest.json`);
      
      if (!(await fs.pathExists(manifestPath))) {
        res.status(404).json({ error: 'Image not found' });
        return;
      }
      
      // Decrypt image
      const tempPath = path.join(this.tempDir, filename);
      await fs.ensureDir(path.dirname(tempPath));
      
      const imageData = await this.decryptor.decryptFile(manifestPath, tempPath);
      
      // Cache result
      this.cache.set(cacheKey, imageData);
      
      // Clean up temp file
      await fs.remove(tempPath);
      
      res.setHeader('Content-Type', this.getImageContentType(filename));
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year
      res.send(imageData);
      
    } catch (error) {
      console.error('Error loading image:', error);
      throw new DatagraphError('Failed to load image', 'IMAGE_ERROR');
    }
  }

  /**
   * Get decrypted database table
   */
  private async getDatabase(req: Request, res: Response): Promise<void> {
    try {
      const { table } = req.params;
      const cacheKey = `db:${table}`;
      
      // Check cache first
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey) as any;
        res.setHeader('Content-Type', 'application/json');
        res.json(cached);
        return;
      }
      
      // Find database manifest
      const manifestPath = path.join(this.dataDir, 'database', `${table}.manifest.json`);
      
      if (!(await fs.pathExists(manifestPath))) {
        res.status(404).json({ error: 'Database table not found' });
        return;
      }
      
      // Decrypt database
      const tempPath = path.join(this.tempDir, `${table}.json`);
      await fs.ensureDir(path.dirname(tempPath));
      
      const data = await this.decryptor.decryptFile(manifestPath, tempPath);
      const json = JSON.parse(data.toString('utf-8'));
      
      // Cache result
      this.cache.set(cacheKey, json);
      
      // Clean up temp file
      await fs.remove(tempPath);
      
      res.json(json);
      
    } catch (error) {
      console.error('Error loading database:', error);
      throw new DatagraphError('Failed to load database', 'DATABASE_ERROR');
    }
  }

  /**
   * Search across encrypted content
   */
  private async search(req: Request, res: Response): Promise<void> {
    try {
      const { q, type = 'all' } = req.query;
      
      if (!q || typeof q !== 'string') {
        res.status(400).json({ error: 'Query parameter required' });
        return;
      }
      
      const results: any[] = [];
      
      // Search posts
      if (type === 'all' || type === 'posts') {
        // TODO: Implement full-text search across decrypted content
        console.log(`Searching posts for: ${q}`);
      }
      
      // Search images
      if (type === 'all' || type === 'images') {
        // TODO: Implement image metadata search
        console.log(`Searching images for: ${q}`);
      }
      
      const response: SearchResult = {
        results,
        query: q,
        type: type as SearchType
      };
      
      res.json(response);
      
    } catch (error) {
      console.error('Error searching:', error);
      throw new DatagraphError('Search failed', 'SEARCH_ERROR');
    }
  }

  /**
   * Refresh cache
   */
  private async refreshCache(req: Request, res: Response): Promise<void> {
    try {
      this.cache.clear();
      this.decryptor.clearCache();
      
      res.json({ 
        message: 'Cache refreshed',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error refreshing cache:', error);
      throw new DatagraphError('Failed to refresh cache', 'CACHE_ERROR');
    }
  }

  /**
   * Get API statistics
   */
  private async getStats(req: Request, res: Response): Promise<void> {
    try {
      const cacheStats: CacheStats = {
        size: this.cache.size,
        keys: Array.from(this.cache.keys())
      };
      
      const memoryStats: MemoryUsage = process.memoryUsage();
      
      const stats: APIStats = {
        cache: cacheStats,
        memory: memoryStats,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      };
      
      res.json(stats);
    } catch (error) {
      console.error('Error getting stats:', error);
      throw new DatagraphError('Failed to get stats', 'STATS_ERROR');
    }
  }

  /**
   * Get content type for image
   */
  private getImageContentType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const types: { [key: string]: string } = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml'
    };
    return types[ext] || 'application/octet-stream';
  }

  /**
   * Start the server
   */
  public start(port: number = 3007): void {
    this.app.listen(port, () => {
      console.log(`🚀 Datagraph API running on port ${port}`);
      console.log(`📊 Health check: http://localhost:${port}/health`);
      console.log(`🔍 Metadata: http://localhost:${port}/api/metadata/posts`);
      console.log(`🔒 Content: http://localhost:${port}/api/posts/:slug`);
    });
  }
}

// Start server if run directly
if (require.main === module) {
  // Check required environment variables
  if (!process.env.AGE_PRIVATE_KEY) {
    console.error('❌ AGE_PRIVATE_KEY environment variable required');
    process.exit(1);
  }
  
  const port = parseInt(process.env.DATAGRAPH_PORT || '3007');
  const api = new DatagraphAPI();
  api.start(port);
}

export { DatagraphAPI };