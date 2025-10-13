#!/usr/bin/env node

/**
 * GitHub-Compliant File Decryption System
 * 
 * Reassembles and decrypts chunked files from the datagraph
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync } from 'child_process';
import {
  ChunkManifest,
  DecryptionError,
  CompressionError,
  ChunkError
} from '../types';

class FileDecryptor {
  private cache: Map<string, Buffer>;

  constructor() {
    this.cache = new Map();
  }

  /**
   * Decrypt and reassemble a file from chunks
   */
  async decryptFile(manifestPath: string, outputPath: string): Promise<Buffer> {
    console.log(`🔓 Decrypting ${manifestPath}...`);
    
    // Read manifest
    const manifest: ChunkManifest = await fs.readJson(manifestPath);
    
    if (!manifest.isChunked) {
      // Single file, just decrypt
      return await this.decryptSingleFile(manifest.path!, outputPath);
    }
    
    // Chunked file, reassemble
    const chunks: Buffer[] = [];
    
    for (const chunkInfo of manifest.chunks) {
      console.log(`   📦 Loading chunk ${chunkInfo.index + 1}/${manifest.numChunks}...`);
      
      // Decrypt and decompress chunk
      const chunkData = await this.decryptAndDecompress(chunkInfo.path);
      
      // Verify hash
      const hash = this.calculateHash(chunkData);
      if (hash !== chunkInfo.hash) {
        throw new ChunkError(`Chunk ${chunkInfo.index} hash mismatch! Expected ${chunkInfo.hash}, got ${hash}`);
      }
      
      chunks[chunkInfo.index] = chunkData;
    }
    
    // Reassemble file
    const fullData = Buffer.concat(chunks);
    
    // Verify total size
    if (fullData.length !== manifest.originalSize) {
      throw new ChunkError(`File size mismatch! Expected ${manifest.originalSize}, got ${fullData.length}`);
    }
    
    // Write reassembled file
    await fs.writeFile(outputPath, fullData);
    
    console.log(`   ✅ Reassembled: ${Math.round(fullData.length / 1024 / 1024)}MB`);
    return fullData;
  }
  
  /**
   * Decrypt a single file
   */
  private async decryptSingleFile(inputPath: string, outputPath: string): Promise<Buffer> {
    const data = await this.decryptAndDecompress(inputPath);
    await fs.writeFile(outputPath, data);
    console.log(`   ✅ Decrypted: ${Math.round(data.length / 1024)}KB`);
    return data;
  }
  
  /**
   * Decrypt and decompress data
   */
  async decryptAndDecompress(inputPath: string): Promise<Buffer> {
    // Check cache first
    if (this.cache.has(inputPath)) {
      return this.cache.get(inputPath)!;
    }
    
    // Step 1: Decrypt with age
    const decrypted = await this.decryptAge(inputPath);
    
    // Step 2: Decompress with zstd
    const decompressed = await this.decompressZstd(decrypted);
    
    // Cache result
    this.cache.set(inputPath, decompressed);
    
    return decompressed;
  }
  
  /**
   * Decrypt data using age
   */
  private async decryptAge(inputPath: string): Promise<Buffer> {
    const privateKey = process.env.AGE_PRIVATE_KEY;
    if (!privateKey) {
      throw new DecryptionError('AGE_PRIVATE_KEY environment variable required');
    }
    
    return new Promise((resolve, reject) => {
      try {
        const result = execSync(`age -d -i <(echo "${privateKey}") "${inputPath}"`, {
          shell: '/bin/bash',
          encoding: 'buffer'
        });
        resolve(result);
      } catch (error) {
        reject(new DecryptionError(`Age decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    });
  }
  
  /**
   * Decompress data using zstd
   */
  private async decompressZstd(data: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const result = execSync('zstd -d', {
          input: data,
          encoding: 'buffer'
        });
        resolve(result);
      } catch (error) {
        reject(new CompressionError(`Zstd decompression failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
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
   * Find all manifests in a directory
   */
  async findManifests(directory: string): Promise<string[]> {
    const files = await fs.readdir(directory);
    return files.filter(file => file.endsWith('.manifest.json'));
  }
  
  /**
   * Decrypt all files in a directory
   */
  async decryptDirectory(inputDir: string, outputDir: string): Promise<Array<{ file: string; size: number; path: string }>> {
    console.log(`🔄 Decrypting directory: ${inputDir}`);
    
    const manifests = await this.findManifests(inputDir);
    const results: Array<{ file: string; size: number; path: string }> = [];
    
    for (const manifestFile of manifests) {
      const manifestPath = path.join(inputDir, manifestFile);
      const manifest: ChunkManifest = await fs.readJson(manifestPath);
      
      const outputPath = path.join(outputDir, manifest.originalFile);
      await fs.ensureDir(path.dirname(outputPath));
      
      const data = await this.decryptFile(manifestPath, outputPath);
      results.push({
        file: manifest.originalFile,
        size: data.length,
        path: outputPath
      });
    }
    
    return results;
  }
  
  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// CLI interface
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log(`
Usage: node decrypt-files.js <input> <output>

Examples:
  node decrypt-files.js data/chunks/images/ temp/decrypted/images/
  node decrypt-files.js data/chunks/posts/ temp/decrypted/posts/
  node decrypt-files.js file.manifest.json temp/decrypted/file.ext

Environment Variables:
  AGE_PRIVATE_KEY=age1...       # Age private key (required)
`);
    process.exit(1);
  }
  
  const [input, output] = args;
  
  // Check required environment variables
  if (!process.env.AGE_PRIVATE_KEY) {
    console.error('❌ AGE_PRIVATE_KEY environment variable required');
    process.exit(1);
  }
  
  // Ensure output directory exists
  await fs.ensureDir(output);
  
  const decryptor = new FileDecryptor();
  
  try {
    const stats = await fs.stat(input);
    
    if (stats.isDirectory()) {
      await decryptor.decryptDirectory(input, output);
    } else if (input.endsWith('.manifest.json')) {
      const baseName = path.parse(input).name.replace('.manifest', '');
      const outputPath = path.join(output, baseName);
      await decryptor.decryptFile(input, outputPath);
    } else {
      console.error('❌ Input must be a directory or .manifest.json file');
      process.exit(1);
    }
    
    console.log('✅ Decryption complete!');
  } catch (error) {
    console.error('❌ Decryption failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { FileDecryptor };