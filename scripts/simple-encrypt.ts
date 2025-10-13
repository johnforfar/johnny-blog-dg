#!/usr/bin/env node

/**
 * Simple Encryption Script for Data Migration
 * 
 * Encrypts files using Age encryption for GitHub-safe storage
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { execSync } from 'child_process';

class SimpleEncryptor {
  private publicKey: string;
  private privateKey: string;

  constructor() {
    this.publicKey = process.env['AGE_PUBLIC_KEY'] || '';
    this.privateKey = process.env['AGE_PRIVATE_KEY'] || '';
    
    if (!this.publicKey || !this.privateKey) {
      throw new Error('AGE_PUBLIC_KEY and AGE_PRIVATE_KEY environment variables required');
    }
  }

  /**
   * Encrypt a single file
   */
  async encryptFile(inputPath: string, outputPath: string): Promise<void> {
    console.log(`🔒 Encrypting: ${path.basename(inputPath)}`);
    
    try {
      // Read file
      const data = await fs.readFile(inputPath);
      
      // Encrypt with age
      const encrypted = execSync(`age -e -r "${this.publicKey}"`, {
        input: data,
        encoding: 'buffer'
      });
      
      // Write encrypted file
      await fs.writeFile(outputPath, encrypted);
      
      const originalSize = Math.round(data.length / 1024);
      const encryptedSize = Math.round(encrypted.length / 1024);
      
      console.log(`   ✅ ${originalSize}KB → ${encryptedSize}KB`);
      
    } catch (error) {
      console.error(`   ❌ Failed to encrypt ${inputPath}:`, error);
      throw error;
    }
  }

  /**
   * Encrypt all files in a directory
   */
  async encryptDirectory(inputDir: string, outputDir: string): Promise<void> {
    console.log(`📁 Encrypting directory: ${inputDir}`);
    
    await fs.ensureDir(outputDir);
    
    const files = await fs.readdir(inputDir);
    let totalFiles = 0;
    let totalSize = 0;
    let encryptedSize = 0;
    
    for (const file of files) {
      const inputPath = path.join(inputDir, file);
      const stats = await fs.stat(inputPath);
      
      if (stats.isFile()) {
        const outputPath = path.join(outputDir, `${file}.age`);
        
        try {
          await this.encryptFile(inputPath, outputPath);
          
          totalFiles++;
          totalSize += stats.size;
          
          const encryptedStats = await fs.stat(outputPath);
          encryptedSize += encryptedStats.size;
          
        } catch (error) {
          console.error(`Failed to encrypt ${file}:`, error);
        }
      }
    }
    
    console.log(`📊 Summary: ${totalFiles} files, ${Math.round(totalSize / 1024 / 1024)}MB → ${Math.round(encryptedSize / 1024 / 1024)}MB`);
  }

  /**
   * Decrypt a file (for testing)
   */
  async decryptFile(inputPath: string, outputPath: string): Promise<void> {
    console.log(`🔓 Decrypting: ${path.basename(inputPath)}`);
    
    try {
      // Read encrypted file
      const encrypted = await fs.readFile(inputPath);
      
      // Decrypt with age
      const decrypted = execSync(`age -d -i <(echo "${this.privateKey}")`, {
        input: encrypted,
        encoding: 'buffer',
        shell: '/bin/bash'
      });
      
      // Write decrypted file
      await fs.writeFile(outputPath, decrypted);
      
      console.log(`   ✅ Decrypted successfully`);
      
    } catch (error) {
      console.error(`   ❌ Failed to decrypt ${inputPath}:`, error);
      throw error;
    }
  }
}

// CLI interface
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log(`
Usage: node simple-encrypt.ts <command> <input> <output>

Commands:
  encrypt <file|dir> <output>    Encrypt file or directory
  decrypt <file> <output>        Decrypt file (for testing)

Examples:
  node simple-encrypt.ts encrypt temp/source/posts/ data/posts/
  node simple-encrypt.ts encrypt large-file.txt data/large-file.txt.age
  node simple-encrypt.ts decrypt data/posts/file.age temp/decrypted/file

Environment Variables:
  AGE_PUBLIC_KEY=age1...         # Age public key (required)
  AGE_PRIVATE_KEY=AGE-SECRET...  # Age private key (required)
`);
    process.exit(1);
  }
  
  const [command, input, output] = args;
  
  if (!input || !output) {
    console.error('❌ Input and output paths required');
    process.exit(1);
  }
  
  const encryptor = new SimpleEncryptor();
  
  try {
    if (command === 'encrypt') {
      const stats = await fs.stat(input);
      
      if (stats.isDirectory()) {
        await encryptor.encryptDirectory(input, output);
      } else {
        await encryptor.encryptFile(input, output);
      }
      
      console.log('✅ Encryption complete!');
      
    } else if (command === 'decrypt') {
      await encryptor.decryptFile(input, output);
      console.log('✅ Decryption complete!');
      
    } else {
      console.error('❌ Unknown command. Use "encrypt" or "decrypt"');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('💥 Operation failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { SimpleEncryptor };
