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
  SearchType
} from '../types';

class DatagraphAPI {
  constructor() {
    this.app = express();
    this.decryptor = new FileDecryptor();
    this.cache = new Map();
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
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
    this.app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
      });
      next();
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    });

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
   * Get posts metadata (public)
   */
  async getPostsMetadata(req, res) {
    try {
      const metadataPath = path.join(__dirname, '../metadata/posts.json');
      
      if (await fs.pathExists(metadataPath)) {
        const metadata = await fs.readJson(metadataPath);
        res.json(metadata);
      } else {
        res.json({ posts: [] });
      }
    } catch (error) {
      console.error('Error loading posts metadata:', error);
      res.status(500).json({ error: 'Failed to load posts metadata' });
    }
  }

  /**
   * Get images metadata (public)
   */
  async getImagesMetadata(req, res) {
    try {
      const metadataPath = path.join(__dirname, '../metadata/images.json');
      
      if (await fs.pathExists(metadataPath)) {
        const metadata = await fs.readJson(metadataPath);
        res.json(metadata);
      } else {
        res.json({ images: [] });
      }
    } catch (error) {
      console.error('Error loading images metadata:', error);
      res.status(500).json({ error: 'Failed to load images metadata' });
    }
  }

  /**
   * Get chunks metadata (public)
   */
  async getChunksMetadata(req, res) {
    try {
      const metadataPath = path.join(__dirname, '../metadata/chunks.json');
      
      if (await fs.pathExists(metadataPath)) {
        const metadata = await fs.readJson(metadataPath);
        res.json(metadata);
      } else {
        res.json({ chunks: [] });
      }
    } catch (error) {
      console.error('Error loading chunks metadata:', error);
      res.status(500).json({ error: 'Failed to load chunks metadata' });
    }
  }

  /**
   * Get decrypted post content
   */
  async getPost(req, res) {
    try {
      const { slug } = req.params;
      const cacheKey = `post:${slug}`;
      
      // Check cache first
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        res.setHeader('Content-Type', 'text/markdown');
        return res.send(cached);
      }
      
      // Find post manifest
      const manifestPath = path.join(__dirname, '../data/posts', `${slug}.manifest.json`);
      
      if (!(await fs.pathExists(manifestPath))) {
        return res.status(404).json({ error: 'Post not found' });
      }
      
      // Decrypt post
      const tempPath = path.join(__dirname, '../temp', `${slug}.md`);
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
      res.status(500).json({ error: 'Failed to load post' });
    }
  }

  /**
   * Get decrypted image
   */
  async getImage(req, res) {
    try {
      const { filename } = req.params;
      const cacheKey = `image:${filename}`;
      
      // Check cache first
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        res.setHeader('Content-Type', this.getImageContentType(filename));
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year
        return res.send(cached);
      }
      
      // Find image manifest
      const manifestPath = path.join(__dirname, '../data/images', `${filename}.manifest.json`);
      
      if (!(await fs.pathExists(manifestPath))) {
        return res.status(404).json({ error: 'Image not found' });
      }
      
      // Decrypt image
      const tempPath = path.join(__dirname, '../temp', filename);
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
      res.status(500).json({ error: 'Failed to load image' });
    }
  }

  /**
   * Get decrypted database table
   */
  async getDatabase(req, res) {
    try {
      const { table } = req.params;
      const cacheKey = `db:${table}`;
      
      // Check cache first
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        res.setHeader('Content-Type', 'application/json');
        return res.json(cached);
      }
      
      // Find database manifest
      const manifestPath = path.join(__dirname, '../data/database', `${table}.manifest.json`);
      
      if (!(await fs.pathExists(manifestPath))) {
        return res.status(404).json({ error: 'Database table not found' });
      }
      
      // Decrypt database
      const tempPath = path.join(__dirname, '../temp', `${table}.json`);
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
      res.status(500).json({ error: 'Failed to load database' });
    }
  }

  /**
   * Search across encrypted content
   */
  async search(req, res) {
    try {
      const { q, type = 'all' } = req.query;
      
      if (!q) {
        return res.status(400).json({ error: 'Query parameter required' });
      }
      
      const results = [];
      
      // Search posts
      if (type === 'all' || type === 'posts') {
        const postsMetadata = await this.getPostsMetadata(req, res);
        // TODO: Implement full-text search across decrypted content
      }
      
      // Search images
      if (type === 'all' || type === 'images') {
        const imagesMetadata = await this.getImagesMetadata(req, res);
        // TODO: Implement image metadata search
      }
      
      res.json({ results, query: q, type });
      
    } catch (error) {
      console.error('Error searching:', error);
      res.status(500).json({ error: 'Search failed' });
    }
  }

  /**
   * Refresh cache
   */
  async refreshCache(req, res) {
    try {
      this.cache.clear();
      this.decryptor.clearCache();
      
      res.json({ 
        message: 'Cache refreshed',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error refreshing cache:', error);
      res.status(500).json({ error: 'Failed to refresh cache' });
    }
  }

  /**
   * Get API statistics
   */
  async getStats(req, res) {
    try {
      const stats = {
        cache: {
          size: this.cache.size,
          keys: Array.from(this.cache.keys())
        },
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      };
      
      res.json(stats);
    } catch (error) {
      console.error('Error getting stats:', error);
      res.status(500).json({ error: 'Failed to get stats' });
    }
  }

  /**
   * Get content type for image
   */
  getImageContentType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const types = {
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
  start(port = 3007) {
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
  
  const port = parseInt(process.env.DATAGRAPH_PORT) || 3007;
  const api = new DatagraphAPI();
  api.start(port);
}

module.exports = { DatagraphAPI };
