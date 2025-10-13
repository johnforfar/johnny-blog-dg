#!/usr/bin/env node

/**
 * GitHub-Compliant File Chunking System
 * 
 * Splits large files into chunks under 100MB for GitHub compliance
 * Each chunk is compressed and encrypted for security
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync } from 'child_process';
import {
  ChunkManifest,
  ChunkInfo,
  CompressionError,
  EncryptionError,
  ChunkError
} from '../types';

// Configuration
const CHUNK_SIZE = parseInt(process.env['CHUNK_SIZE'] || '10485760'); // 10MB default
const MAX_GITHUB_SIZE = 100 * 1024 * 1024; // 100MB GitHub limit
const COMPRESSION_LEVEL = parseInt(process.env['COMPRESSION_LEVEL'] || '19');

class FileChunker {
  constructor() {
    // Registry not needed for this implementation
  }

  /**
   * Chunk a file into GitHub-compliant pieces
   */
  async chunkFile(inputPath: string, outputDir: string, baseName: string): Promise<ChunkManifest> {
    console.log(`📦 Chunking ${inputPath}...`);
    
    const stats = await fs.stat(inputPath);
    const fileSize = stats.size;
    
    if (fileSize <= MAX_GITHUB_SIZE) {
      // File is small enough, just encrypt it
      return await this.processSmallFile(inputPath, outputDir, baseName);
    }
    
    // File is large, need to chunk it
    const numChunks = Math.ceil(fileSize / CHUNK_SIZE);
    console.log(`   Splitting into ${numChunks} chunks of ~${Math.round(CHUNK_SIZE / 1024 / 1024)}MB each`);
    
    const chunks: ChunkInfo[] = [];
    const fileHandle = await fs.open(inputPath, 'r');
    
    try {
      for (let i = 0; i < numChunks; i++) {
        const chunkPath = path.join(outputDir, `${baseName}.chunk.${i.toString().padStart(3, '0')}.age.zst`);
        
        // Read chunk
        const buffer = Buffer.alloc(Math.min(CHUNK_SIZE, fileSize - (i * CHUNK_SIZE)));
        const result = await fileHandle.read(buffer, 0, buffer.length, i * CHUNK_SIZE);
        
        // Compress and encrypt chunk
        await this.compressAndEncrypt(buffer, chunkPath);
        
        // Verify chunk size
        const chunkStats = await fs.stat(chunkPath);
        if (chunkStats.size > MAX_GITHUB_SIZE) {
          throw new ChunkError(`Chunk ${i} is ${Math.round(chunkStats.size / 1024 / 1024)}MB, exceeds GitHub limit!`);
        }
        
        chunks.push({
          index: i,
          path: chunkPath,
          size: chunkStats.size,
          hash: this.calculateHash(buffer)
        });
        
        console.log(`   ✅ Chunk ${i + 1}/${numChunks}: ${Math.round(chunkStats.size / 1024)}KB`);
      }
    } finally {
      await fileHandle.close();
    }
    
    // Create chunk manifest
    const manifest: ChunkManifest = {
      originalFile: baseName,
      originalSize: fileSize,
      numChunks: numChunks,
      chunkSize: CHUNK_SIZE,
      chunks: chunks,
      createdAt: new Date().toISOString()
    };
    
    const manifestPath = path.join(outputDir, `${baseName}.manifest.json`);
    await fs.writeJson(manifestPath, manifest, { spaces: 2 });
    
    console.log(`   📋 Manifest: ${manifestPath}`);
    console.log(`   💾 Total size: ${Math.round(fileSize / 1024 / 1024)}MB → ${Math.round(chunks.reduce((sum, c) => sum + c.size, 0) / 1024 / 1024)}MB`);
    
    return manifest;
  }
  
  /**
   * Process small files (under GitHub limit)
   */
  private async processSmallFile(inputPath: string, outputDir: string, baseName: string): Promise<ChunkManifest> {
    const buffer = await fs.readFile(inputPath);
    const outputPath = path.join(outputDir, `${baseName}.age.zst`);
    
    await this.compressAndEncrypt(buffer, outputPath);
    
    const stats = await fs.stat(outputPath);
    console.log(`   ✅ Single file: ${Math.round(stats.size / 1024)}KB`);
    
    return {
      originalFile: baseName,
      originalSize: buffer.length,
      numChunks: 1,
      isChunked: false,
      path: outputPath,
      size: stats.size,
      hash: this.calculateHash(buffer),
      chunkSize: CHUNK_SIZE,
      chunks: [],
      createdAt: new Date().toISOString()
    };
  }
  
  /**
   * Compress and encrypt data
   */
  private async compressAndEncrypt(data: Buffer, outputPath: string): Promise<void> {
    // Step 1: Compress with zstd
    const compressed = await this.compressZstd(data);
    
    // Step 2: Encrypt with age
    const encrypted = await this.encryptAge(compressed);
    
    // Step 3: Write to file
    await fs.writeFile(outputPath, encrypted);
  }
  
  /**
   * Compress data using zstd
   */
  private async compressZstd(data: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const result = execSync(`echo "${data.toString('base64')}" | base64 -d | zstd -${COMPRESSION_LEVEL}`, {
          input: data,
          encoding: 'buffer'
        });
        resolve(result);
      } catch (error) {
        reject(new CompressionError(`Zstd compression failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    });
  }
  
  /**
   * Encrypt data using age
   */
  private async encryptAge(data: Buffer): Promise<Buffer> {
    const publicKey = process.env['AGE_PUBLIC_KEY'];
    if (!publicKey) {
      throw new EncryptionError('AGE_PUBLIC_KEY environment variable required');
    }
    
    return new Promise((resolve, reject) => {
      try {
        const result = execSync(`age -e -r "${publicKey}"`, {
          input: data,
          encoding: 'buffer'
        });
        resolve(result);
      } catch (error) {
        reject(new EncryptionError(`Age encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    });
  }
  
  /**
   * Calculate SHA256 hash of data
   */
  private calculateHash(data: Buffer): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }
  
  /**
   * Process all files in a directory
   */
  async processDirectory(inputDir: string, outputDir: string): Promise<ChunkManifest[]> {
    console.log(`🔄 Processing directory: ${inputDir}`);
    
    const files = await fs.readdir(inputDir);
    const results: ChunkManifest[] = [];
    
    for (const file of files) {
      const inputPath = path.join(inputDir, file);
      const stats = await fs.stat(inputPath);
      
      if (stats.isFile()) {
        const baseName = path.parse(file).name;
        const result = await this.chunkFile(inputPath, outputDir, baseName);
        results.push(result);
      }
    }
    
    return results;
  }
}

// CLI interface
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log(`
Usage: node chunk-files.js <input> <output>

Examples:
  node chunk-files.js data/images/ data/chunks/images/
  node chunk-files.js large-video.mp4 data/chunks/videos/
  node chunk-files.js database.sql data/chunks/database/

Environment Variables:
  CHUNK_SIZE=10485760          # 10MB chunks (default)
  COMPRESSION_LEVEL=19         # Zstd compression level (default)
  AGE_PUBLIC_KEY=age1...       # Age public key (required)
`);
    process.exit(1);
  }
  
  const [input, output] = args;
  
  // Check required environment variables
  if (!process.env['AGE_PUBLIC_KEY']) {
    console.error('❌ AGE_PUBLIC_KEY environment variable required');
    process.exit(1);
  }
  
  // Ensure output directory exists
  await fs.ensureDir(output);
  
  const chunker = new FileChunker();
  
  try {
    const stats = await fs.stat(input);
    
    if (stats.isDirectory()) {
      await chunker.processDirectory(input, output);
    } else {
      const baseName = path.parse(input).name;
      await chunker.chunkFile(input, output, baseName);
    }
    
    console.log('✅ Chunking complete!');
  } catch (error) {
    console.error('❌ Chunking failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { FileChunker };