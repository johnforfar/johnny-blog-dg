/**
 * TypeScript type definitions for Johnny Blog Datagraph
 */

// Chunk-related types
export interface DataChunk {
  id: string;
  hash: string;
  size: number;
  index: number;
  encrypted_data: Buffer;
  xnodes: string[];
}

export interface ChunkManifest {
  originalFile: string;
  originalSize: number;
  numChunks: number;
  chunkSize: number;
  chunks: ChunkInfo[];
  createdAt: string;
  isChunked?: boolean;
  path?: string;
  size?: number;
  hash?: string;
}

export interface ChunkInfo {
  index: number;
  path: string;
  size: number;
  hash: string;
}

// Metadata types
export interface PostMetadata {
  slug: string;
  title: string;
  size: number;
  chunks: number;
  createdAt: string;
  manifestFile: string;
}

export interface ImageMetadata {
  filename: string;
  size: number;
  chunks: number;
  createdAt: string;
  manifestFile: string;
}

export interface ChunkMetadata {
  file: string;
  size: number;
  type: string;
}

export interface ChunksSummary {
  totalChunks: number;
  totalSize: number;
  averageSize: number;
}

export interface MetadataResponse {
  posts?: PostMetadata[];
  images?: ImageMetadata[];
  chunks?: ChunkMetadata[];
  summary?: ChunksSummary;
}

// API response types
export interface HealthResponse {
  status: string;
  timestamp: string;
  version: string;
}

export interface SearchResult {
  results: any[];
  query: string;
  type: string;
}

export interface CacheStats {
  size: number;
  keys: string[];
}

export interface MemoryUsage {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
}

export interface APIStats {
  cache: CacheStats;
  memory: MemoryUsage;
  uptime: number;
  timestamp: string;
}

// Xnode registry types
export interface XnodeRegistry {
  xnode_id: string;
  chunks: {
    [chunkId: string]: {
      hash: string;
      size: number;
      last_verified: string;
      availability: number;
    };
  };
  metadata: {
    location: string;
    capacity: number;
    bandwidth: number;
    uptime: number;
  };
}

// Environment variables
export interface EnvironmentConfig {
  AGE_PRIVATE_KEY: string;
  AGE_PUBLIC_KEY: string;
  DATAGRAPH_PORT?: number;
  FRONTEND_URL?: string;
  GITHUB_REPO?: string;
  GITHUB_TOKEN?: string;
  CHUNK_SIZE?: number;
  COMPRESSION_LEVEL?: number;
}

// Error types
export class DatagraphError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'DatagraphError';
  }
}

export class EncryptionError extends DatagraphError {
  constructor(message: string) {
    super(message, 'ENCRYPTION_ERROR', 500);
    this.name = 'EncryptionError';
  }
}

export class DecryptionError extends DatagraphError {
  constructor(message: string) {
    super(message, 'DECRYPTION_ERROR', 500);
    this.name = 'DecryptionError';
  }
}

export class CompressionError extends DatagraphError {
  constructor(message: string) {
    super(message, 'COMPRESSION_ERROR', 500);
    this.name = 'CompressionError';
  }
}

export class ChunkError extends DatagraphError {
  constructor(message: string) {
    super(message, 'CHUNK_ERROR', 500);
    this.name = 'ChunkError';
  }
}

export class GitHubError extends DatagraphError {
  constructor(message: string) {
    super(message, 'GITHUB_ERROR', 500);
    this.name = 'GitHubError';
  }
}

// Utility types
export type ContentType = 'posts' | 'images' | 'database';
export type SearchType = 'all' | 'posts' | 'images' | 'database';

// Configuration types
export interface DatagraphConfig {
  port: number;
  frontendUrl: string;
  dataDir: string;
  user: string;
  group: string;
  chunkSize: number;
  compressionLevel: number;
  maxCacheSize: number;
  cacheTtl: number;
}

// Performance monitoring types
export interface PerformanceMetrics {
  encryptionTime: number;
  decryptionTime: number;
  compressionTime: number;
  decompressionTime: number;
  totalTime: number;
  throughput: number; // MB/s
}

export interface BenchmarkResult {
  operation: string;
  fileSize: number;
  metrics: PerformanceMetrics;
  timestamp: string;
}
