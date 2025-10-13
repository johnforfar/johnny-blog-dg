#!/usr/bin/env node

/**
 * Create Metadata Files for Encrypted Datagraph
 * 
 * Generates public metadata files for posts, images, and chunks
 */

import * as fs from 'fs-extra';
import * as path from 'path';

class MetadataCreator {
  private dataDir: string;
  private metadataDir: string;

  constructor() {
    this.dataDir = path.join(__dirname, '../data');
    this.metadataDir = path.join(__dirname, '../metadata');
  }

  /**
   * Create posts metadata
   */
  async createPostsMetadata(): Promise<void> {
    console.log('📝 Creating posts metadata...');
    
    const postsDir = path.join(this.dataDir, 'posts');
    const posts: any[] = [];
    
    if (await fs.pathExists(postsDir)) {
      const files = await fs.readdir(postsDir);
      
      for (const file of files) {
        if (file.endsWith('.age')) {
          const filePath = path.join(postsDir, file);
          const stats = await fs.stat(filePath);
          
          // Extract slug from filename
          const slug = file.replace('.mdx.age', '').replace('.md.age', '');
          
          posts.push({
            slug,
            title: slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            size: stats.size,
            encryptedFile: file,
            createdAt: stats.mtime.toISOString()
          });
        }
      }
    }
    
    const metadata = { posts };
    await fs.writeJson(path.join(this.metadataDir, 'posts.json'), metadata, { spaces: 2 });
    
    console.log(`   ✅ Created metadata for ${posts.length} posts`);
  }

  /**
   * Create images metadata
   */
  async createImagesMetadata(): Promise<void> {
    console.log('🖼️  Creating images metadata...');
    
    const imagesDir = path.join(this.dataDir, 'images');
    const images: any[] = [];
    
    if (await fs.pathExists(imagesDir)) {
      const files = await fs.readdir(imagesDir);
      
      for (const file of files) {
        if (file.endsWith('.age')) {
          const filePath = path.join(imagesDir, file);
          const stats = await fs.stat(filePath);
          
          // Extract original filename
          const originalFile = file.replace('.age', '');
          
          images.push({
            filename: originalFile,
            size: stats.size,
            encryptedFile: file,
            createdAt: stats.mtime.toISOString()
          });
        }
      }
    }
    
    const metadata = { images };
    await fs.writeJson(path.join(this.metadataDir, 'images.json'), metadata, { spaces: 2 });
    
    console.log(`   ✅ Created metadata for ${images.length} images`);
  }

  /**
   * Create chunks metadata
   */
  async createChunksMetadata(): Promise<void> {
    console.log('📦 Creating chunks metadata...');
    
    const chunks: any[] = [];
    let totalSize = 0;
    let totalFiles = 0;
    
    const scanDirectory = async (dir: string, type: string): Promise<void> => {
      if (!(await fs.pathExists(dir))) return;
      
      const files = await fs.readdir(dir);
      
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.isFile() && file.endsWith('.age')) {
          totalFiles++;
          totalSize += stats.size;
          
          chunks.push({
            file: path.relative(this.dataDir, filePath),
            size: stats.size,
            type
          });
        }
      }
    };
    
    await scanDirectory(path.join(this.dataDir, 'posts'), 'posts');
    await scanDirectory(path.join(this.dataDir, 'images'), 'images');
    await scanDirectory(path.join(this.dataDir, 'database'), 'database');
    
    const metadata = {
      chunks,
      summary: {
        totalFiles,
        totalSize,
        averageSize: Math.round(totalSize / totalFiles) || 0
      }
    };
    
    await fs.writeJson(path.join(this.metadataDir, 'chunks.json'), metadata, { spaces: 2 });
    
    console.log(`   ✅ Created metadata for ${totalFiles} chunks (${Math.round(totalSize / 1024 / 1024)}MB total)`);
  }

  /**
   * Create all metadata files
   */
  async createAllMetadata(): Promise<void> {
    console.log('📋 Creating all metadata files...');
    
    await fs.ensureDir(this.metadataDir);
    
    await this.createPostsMetadata();
    await this.createImagesMetadata();
    await this.createChunksMetadata();
    
    console.log('✅ All metadata files created successfully!');
  }
}

// CLI interface
async function main(): Promise<void> {
  const creator = new MetadataCreator();
  await creator.createAllMetadata();
}

if (require.main === module) {
  main();
}

export { MetadataCreator };
