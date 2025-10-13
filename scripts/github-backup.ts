#!/usr/bin/env node

/**
 * GitHub Backup System
 * 
 * Automatically backs up encrypted datagraph to GitHub
 * Ensures all data is safely stored in the public repository
 */

import { execSync } from 'child_process';
import * as fs from 'fs-extra';
import * as path from 'path';
import {
  PostMetadata,
  ImageMetadata,
  ChunkMetadata,
  ChunksSummary,
  GitHubError
} from '../types';

class GitHubBackup {
  private repoPath: string;
  private gitHubRepo: string;
  private gitHubToken: string | undefined;

  constructor() {
    this.repoPath = process.cwd();
    this.gitHubRepo = process.env.GITHUB_REPO || 'johnforfar/johnny-blog-dg';
    this.gitHubToken = process.env.GITHUB_TOKEN;
  }

  /**
   * Initialize git repository if needed
   */
  async initializeGit(): Promise<void> {
    try {
      // Check if git is initialized
      await execSync('git status', { cwd: this.repoPath, stdio: 'pipe' });
      console.log('✅ Git repository already initialized');
    } catch (error) {
      console.log('🔧 Initializing git repository...');
      await execSync('git init', { cwd: this.repoPath });
      await execSync('git remote add origin https://github.com/' + this.gitHubRepo + '.git', { cwd: this.repoPath });
    }
  }

  /**
   * Check repository size compliance
   */
  async checkSizeCompliance(): Promise<boolean> {
    console.log('📊 Checking repository size compliance...');
    
    const dataDir = path.join(this.repoPath, 'data');
    if (!(await fs.pathExists(dataDir))) {
      console.log('⚠️  No data directory found, skipping size check');
      return true;
    }

    let totalSize = 0;
    const largeFiles: Array<{ path: string; size: string }> = [];

    const checkDirectory = async (dir: string): Promise<void> => {
      const files = await fs.readdir(dir);
      
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.isDirectory()) {
          await checkDirectory(filePath);
        } else {
          totalSize += stats.size;
          
          if (stats.size > 100 * 1024 * 1024) { // 100MB
            largeFiles.push({
              path: filePath,
              size: Math.round(stats.size / 1024 / 1024) + 'MB'
            });
          }
        }
      }
    };

    await checkDirectory(dataDir);

    console.log(`   Total data size: ${Math.round(totalSize / 1024 / 1024)}MB`);

    if (largeFiles.length > 0) {
      console.error('❌ Files exceed GitHub 100MB limit:');
      largeFiles.forEach(file => {
        console.error(`   ${file.path}: ${file.size}`);
      });
      return false;
    }

    if (totalSize > 1024 * 1024 * 1024) { // 1GB
      console.error(`❌ Total repository size (${Math.round(totalSize / 1024 / 1024)}MB) exceeds GitHub 1GB limit`);
      return false;
    }

    console.log('✅ Repository size compliant with GitHub limits');
    return true;
  }

  /**
   * Create metadata files
   */
  async createMetadata(): Promise<void> {
    console.log('📋 Creating metadata files...');
    
    const metadataDir = path.join(this.repoPath, 'metadata');
    await fs.ensureDir(metadataDir);

    // Create posts metadata
    const postsMetadata = await this.scanPosts();
    await fs.writeJson(path.join(metadataDir, 'posts.json'), postsMetadata, { spaces: 2 });

    // Create images metadata
    const imagesMetadata = await this.scanImages();
    await fs.writeJson(path.join(metadataDir, 'images.json'), imagesMetadata, { spaces: 2 });

    // Create chunks metadata
    const chunksMetadata = await this.scanChunks();
    await fs.writeJson(path.join(metadataDir, 'chunks.json'), chunksMetadata, { spaces: 2 });

    console.log('✅ Metadata files created');
  }

  /**
   * Scan posts directory for metadata
   */
  private async scanPosts(): Promise<{ posts: PostMetadata[] }> {
    const postsDir = path.join(this.repoPath, 'data', 'posts');
    
    if (!(await fs.pathExists(postsDir))) {
      return { posts: [] };
    }

    const files = await fs.readdir(postsDir);
    const posts: PostMetadata[] = [];

    for (const file of files) {
      if (file.endsWith('.manifest.json')) {
        const manifestPath = path.join(postsDir, file);
        const manifest = await fs.readJson(manifestPath);
        
        posts.push({
          slug: manifest.originalFile,
          title: manifest.originalFile.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          size: manifest.originalSize,
          chunks: manifest.numChunks,
          createdAt: manifest.createdAt,
          manifestFile: file
        });
      }
    }

    return { posts };
  }

  /**
   * Scan images directory for metadata
   */
  private async scanImages(): Promise<{ images: ImageMetadata[] }> {
    const imagesDir = path.join(this.repoPath, 'data', 'images');
    
    if (!(await fs.pathExists(imagesDir))) {
      return { images: [] };
    }

    const files = await fs.readdir(imagesDir);
    const images: ImageMetadata[] = [];

    for (const file of files) {
      if (file.endsWith('.manifest.json')) {
        const manifestPath = path.join(imagesDir, file);
        const manifest = await fs.readJson(manifestPath);
        
        images.push({
          filename: manifest.originalFile,
          size: manifest.originalSize,
          chunks: manifest.numChunks,
          createdAt: manifest.createdAt,
          manifestFile: file
        });
      }
    }

    return { images };
  }

  /**
   * Scan all chunks for metadata
   */
  private async scanChunks(): Promise<{ chunks: ChunkMetadata[]; summary: ChunksSummary }> {
    const dataDir = path.join(this.repoPath, 'data');
    
    if (!(await fs.pathExists(dataDir))) {
      return { chunks: [], summary: { totalChunks: 0, totalSize: 0, averageSize: 0 } };
    }

    const chunks: ChunkMetadata[] = [];
    let totalChunks = 0;
    let totalSize = 0;

    const scanDirectory = async (dir: string): Promise<void> => {
      const files = await fs.readdir(dir);
      
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.isDirectory()) {
          await scanDirectory(filePath);
        } else if (file.endsWith('.age.zst')) {
          totalChunks++;
          totalSize += stats.size;
          
          chunks.push({
            file: path.relative(this.repoPath, filePath),
            size: stats.size,
            type: path.basename(dir)
          });
        }
      }
    };

    await scanDirectory(dataDir);

    const summary: ChunksSummary = {
      totalChunks,
      totalSize,
      averageSize: Math.round(totalSize / totalChunks) || 0
    };

    return { chunks, summary };
  }

  /**
   * Commit and push changes
   */
  async commitAndPush(): Promise<void> {
    console.log('📤 Committing and pushing to GitHub...');
    
    try {
      // Add all files
      await execSync('git add .', { cwd: this.repoPath });
      
      // Check if there are changes
      const status = execSync('git status --porcelain', { cwd: this.repoPath, encoding: 'utf8' });
      
      if (!status.trim()) {
        console.log('✅ No changes to commit');
        return;
      }

      // Commit changes
      const timestamp = new Date().toISOString();
      const commitMessage = `Datagraph backup: ${timestamp}`;
      
      await execSync(`git commit -m "${commitMessage}"`, { cwd: this.repoPath });
      
      // Push to GitHub
      if (this.gitHubToken) {
        const remoteUrl = `https://${this.gitHubToken}@github.com/${this.gitHubRepo}.git`;
        await execSync(`git remote set-url origin ${remoteUrl}`, { cwd: this.repoPath });
      }
      
      await execSync('git push origin main', { cwd: this.repoPath });
      
      console.log('✅ Successfully backed up to GitHub');
      
    } catch (error) {
      throw new GitHubError(`Failed to commit/push: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Run full backup process
   */
  async runBackup(): Promise<void> {
    console.log('🚀 Starting GitHub backup process...');
    
    try {
      // Initialize git if needed
      await this.initializeGit();
      
      // Check size compliance
      const isCompliant = await this.checkSizeCompliance();
      if (!isCompliant) {
        throw new GitHubError('Repository size exceeds GitHub limits');
      }
      
      // Create metadata
      await this.createMetadata();
      
      // Commit and push
      await this.commitAndPush();
      
      console.log('🎉 Backup completed successfully!');
      
    } catch (error) {
      console.error('💥 Backup failed:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  }
}

// CLI interface
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node github-backup.js [options]

Options:
  --help, -h     Show this help message
  --check        Only check size compliance
  --metadata     Only create metadata files
  --commit       Only commit and push changes

Environment Variables:
  GITHUB_REPO    GitHub repository (default: johnforfar/johnny-blog-dg)
  GITHUB_TOKEN   GitHub personal access token (optional)

Examples:
  node github-backup.js                    # Full backup
  node github-backup.js --check           # Check size only
  node github-backup.js --metadata        # Create metadata only
`);
    process.exit(0);
  }
  
  const backup = new GitHubBackup();
  
  if (args.includes('--check')) {
    await backup.checkSizeCompliance();
  } else if (args.includes('--metadata')) {
    await backup.createMetadata();
  } else if (args.includes('--commit')) {
    await backup.commitAndPush();
  } else {
    await backup.runBackup();
  }
}

if (require.main === module) {
  main();
}

export { GitHubBackup };