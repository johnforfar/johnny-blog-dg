#!/usr/bin/env node

/**
 * Performance Testing Suite
 * 
 * Tests encryption, decryption, compression, and API performance
 * Optimized for bare metal Xnode deployment
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync } from 'child_process';
import { FileChunker } from './chunk-files';
import { FileDecryptor } from './decrypt-files';
import {
  PerformanceMetrics,
  BenchmarkResult,
  DatagraphError
} from '../types';

class PerformanceTester {
  private testDataDir: string;
  private resultsDir: string;

  constructor() {
    this.testDataDir = path.join(__dirname, '../temp/test-data');
    this.resultsDir = path.join(__dirname, '../temp/results');
  }

  /**
   * Generate test data of various sizes
   */
  async generateTestData(): Promise<void> {
    console.log('📊 Generating test data...');
    
    await fs.ensureDir(this.testDataDir);
    
    // Generate different sized test files
    const sizes = [
      { name: 'small', size: 1024 * 1024 },      // 1MB
      { name: 'medium', size: 10 * 1024 * 1024 }, // 10MB
      { name: 'large', size: 100 * 1024 * 1024 }  // 100MB
    ];
    
    for (const { name, size } of sizes) {
      const data = crypto.randomBytes(size);
      const filePath = path.join(this.testDataDir, `${name}.bin`);
      await fs.writeFile(filePath, data);
      console.log(`   ✅ Generated ${name}: ${Math.round(size / 1024 / 1024)}MB`);
    }
  }

  /**
   * Test compression performance
   */
  async testCompression(): Promise<BenchmarkResult[]> {
    console.log('🗜️  Testing compression performance...');
    
    const results: BenchmarkResult[] = [];
    const files = await fs.readdir(this.testDataDir);
    
    for (const file of files) {
      const filePath = path.join(this.testDataDir, file);
      const stats = await fs.stat(filePath);
      
      if (stats.isFile()) {
        const data = await fs.readFile(filePath);
        const startTime = Date.now();
        
        try {
          // Test zstd compression
          const compressed = execSync('zstd -19', {
            input: data,
            encoding: 'buffer'
          });
          
          const endTime = Date.now();
          const duration = endTime - startTime;
          const throughput = (data.length / 1024 / 1024) / (duration / 1000);
          
          const metrics: PerformanceMetrics = {
            encryptionTime: 0,
            decryptionTime: 0,
            compressionTime: duration,
            decompressionTime: 0,
            totalTime: duration,
            throughput
          };
          
          const result: BenchmarkResult = {
            operation: 'compression',
            fileSize: data.length,
            metrics,
            timestamp: new Date().toISOString()
          };
          
          results.push(result);
          
          console.log(`   ✅ ${file}: ${Math.round(throughput)}MB/s (${Math.round(compressed.length / data.length * 100)}% compression)`);
          
        } catch (error) {
          console.error(`   ❌ ${file}: Compression failed`, error);
        }
      }
    }
    
    return results;
  }

  /**
   * Test encryption performance
   */
  async testEncryption(): Promise<BenchmarkResult[]> {
    console.log('🔒 Testing encryption performance...');
    
    if (!process.env.AGE_PUBLIC_KEY) {
      throw new DatagraphError('AGE_PUBLIC_KEY environment variable required');
    }
    
    const results: BenchmarkResult[] = [];
    const files = await fs.readdir(this.testDataDir);
    
    for (const file of files) {
      const filePath = path.join(this.testDataDir, file);
      const stats = await fs.stat(filePath);
      
      if (stats.isFile()) {
        const data = await fs.readFile(filePath);
        const startTime = Date.now();
        
        try {
          // Test age encryption
          const encrypted = execSync(`age -e -r "${process.env.AGE_PUBLIC_KEY}"`, {
            input: data,
            encoding: 'buffer'
          });
          
          const endTime = Date.now();
          const duration = endTime - startTime;
          const throughput = (data.length / 1024 / 1024) / (duration / 1000);
          
          const metrics: PerformanceMetrics = {
            encryptionTime: duration,
            decryptionTime: 0,
            compressionTime: 0,
            decompressionTime: 0,
            totalTime: duration,
            throughput
          };
          
          const result: BenchmarkResult = {
            operation: 'encryption',
            fileSize: data.length,
            metrics,
            timestamp: new Date().toISOString()
          };
          
          results.push(result);
          
          console.log(`   ✅ ${file}: ${Math.round(throughput)}MB/s`);
          
        } catch (error) {
          console.error(`   ❌ ${file}: Encryption failed`, error);
        }
      }
    }
    
    return results;
  }

  /**
   * Test chunking performance
   */
  async testChunking(): Promise<BenchmarkResult[]> {
    console.log('📦 Testing chunking performance...');
    
    const results: BenchmarkResult[] = [];
    const chunker = new FileChunker();
    const outputDir = path.join(this.testDataDir, 'chunks');
    
    await fs.ensureDir(outputDir);
    
    const files = await fs.readdir(this.testDataDir);
    
    for (const file of files) {
      const filePath = path.join(this.testDataDir, file);
      const stats = await fs.stat(filePath);
      
      if (stats.isFile() && !file.includes('chunk')) {
        const startTime = Date.now();
        
        try {
          const baseName = path.parse(file).name;
          await chunker.chunkFile(filePath, outputDir, baseName);
          
          const endTime = Date.now();
          const duration = endTime - startTime;
          const throughput = (stats.size / 1024 / 1024) / (duration / 1000);
          
          const metrics: PerformanceMetrics = {
            encryptionTime: 0,
            decryptionTime: 0,
            compressionTime: 0,
            decompressionTime: 0,
            totalTime: duration,
            throughput
          };
          
          const result: BenchmarkResult = {
            operation: 'chunking',
            fileSize: stats.size,
            metrics,
            timestamp: new Date().toISOString()
          };
          
          results.push(result);
          
          console.log(`   ✅ ${file}: ${Math.round(throughput)}MB/s`);
          
        } catch (error) {
          console.error(`   ❌ ${file}: Chunking failed`, error);
        }
      }
    }
    
    return results;
  }

  /**
   * Test decryption performance
   */
  async testDecryption(): Promise<BenchmarkResult[]> {
    console.log('🔓 Testing decryption performance...');
    
    if (!process.env.AGE_PRIVATE_KEY) {
      throw new DatagraphError('AGE_PRIVATE_KEY environment variable required');
    }
    
    const results: BenchmarkResult[] = [];
    const decryptor = new FileDecryptor();
    const chunksDir = path.join(this.testDataDir, 'chunks');
    const outputDir = path.join(this.testDataDir, 'decrypted');
    
    await fs.ensureDir(outputDir);
    
    if (!(await fs.pathExists(chunksDir))) {
      console.log('   ⚠️  No chunks found, skipping decryption test');
      return results;
    }
    
    const manifests = await fs.readdir(chunksDir);
    
    for (const manifest of manifests) {
      if (manifest.endsWith('.manifest.json')) {
        const manifestPath = path.join(chunksDir, manifest);
        const startTime = Date.now();
        
        try {
          const baseName = path.parse(manifest).name.replace('.manifest', '');
          const outputPath = path.join(outputDir, baseName);
          
          await decryptor.decryptFile(manifestPath, outputPath);
          
          const endTime = Date.now();
          const duration = endTime - startTime;
          
          const stats = await fs.stat(outputPath);
          const throughput = (stats.size / 1024 / 1024) / (duration / 1000);
          
          const metrics: PerformanceMetrics = {
            encryptionTime: 0,
            decryptionTime: duration,
            compressionTime: 0,
            decompressionTime: 0,
            totalTime: duration,
            throughput
          };
          
          const result: BenchmarkResult = {
            operation: 'decryption',
            fileSize: stats.size,
            metrics,
            timestamp: new Date().toISOString()
          };
          
          results.push(result);
          
          console.log(`   ✅ ${baseName}: ${Math.round(throughput)}MB/s`);
          
        } catch (error) {
          console.error(`   ❌ ${manifest}: Decryption failed`, error);
        }
      }
    }
    
    return results;
  }

  /**
   * Run all performance tests
   */
  async runAllTests(): Promise<void> {
    console.log('🚀 Starting performance test suite...');
    
    try {
      // Generate test data
      await this.generateTestData();
      
      // Run tests
      const compressionResults = await this.testCompression();
      const encryptionResults = await this.testEncryption();
      const chunkingResults = await this.testChunking();
      const decryptionResults = await this.testDecryption();
      
      // Combine results
      const allResults = [
        ...compressionResults,
        ...encryptionResults,
        ...chunkingResults,
        ...decryptionResults
      ];
      
      // Save results
      await this.saveResults(allResults);
      
      // Print summary
      this.printSummary(allResults);
      
      console.log('🎉 Performance tests completed!');
      
    } catch (error) {
      console.error('💥 Performance tests failed:', error);
      process.exit(1);
    }
  }

  /**
   * Save test results to file
   */
  private async saveResults(results: BenchmarkResult[]): Promise<void> {
    await fs.ensureDir(this.resultsDir);
    
    const resultsPath = path.join(this.resultsDir, `performance-${Date.now()}.json`);
    await fs.writeJson(resultsPath, results, { spaces: 2 });
    
    console.log(`📊 Results saved to: ${resultsPath}`);
  }

  /**
   * Print performance summary
   */
  private printSummary(results: BenchmarkResult[]): void {
    console.log('\n📈 Performance Summary:');
    console.log('=' .repeat(50));
    
    const operations = ['compression', 'encryption', 'chunking', 'decryption'];
    
    for (const operation of operations) {
      const opResults = results.filter(r => r.operation === operation);
      
      if (opResults.length > 0) {
        const avgThroughput = opResults.reduce((sum, r) => sum + r.metrics.throughput, 0) / opResults.length;
        const avgTime = opResults.reduce((sum, r) => sum + r.metrics.totalTime, 0) / opResults.length;
        
        console.log(`${operation.padEnd(12)}: ${Math.round(avgThroughput)}MB/s avg, ${Math.round(avgTime)}ms avg`);
      }
    }
    
    console.log('=' .repeat(50));
  }

  /**
   * Clean up test data
   */
  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up test data...');
    await fs.remove(this.testDataDir);
    console.log('✅ Cleanup complete');
  }
}

// CLI interface
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node test-performance.js [options]

Options:
  --help, -h     Show this help message
  --cleanup      Clean up test data only
  --compression  Test compression only
  --encryption   Test encryption only
  --chunking     Test chunking only
  --decryption   Test decryption only

Environment Variables:
  AGE_PUBLIC_KEY     Age public key (required for encryption tests)
  AGE_PRIVATE_KEY    Age private key (required for decryption tests)

Examples:
  node test-performance.js                    # Run all tests
  node test-performance.js --compression     # Test compression only
  node test-performance.js --cleanup         # Clean up test data
`);
    process.exit(0);
  }
  
  const tester = new PerformanceTester();
  
  if (args.includes('--cleanup')) {
    await tester.cleanup();
  } else if (args.includes('--compression')) {
    await tester.generateTestData();
    await tester.testCompression();
  } else if (args.includes('--encryption')) {
    await tester.generateTestData();
    await tester.testEncryption();
  } else if (args.includes('--chunking')) {
    await tester.generateTestData();
    await tester.testChunking();
  } else if (args.includes('--decryption')) {
    await tester.generateTestData();
    await tester.testChunking();
    await tester.testDecryption();
  } else {
    await tester.runAllTests();
  }
}

if (require.main === module) {
  main();
}

export { PerformanceTester };


