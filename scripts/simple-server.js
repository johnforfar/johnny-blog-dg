#!/usr/bin/env node

/**
 * Simple Datagraph API Server (JavaScript version for quick testing)
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const { execSync } = require('child_process');
const OllamaClient = require('./ollama-client');

const app = express();
const PORT = process.env.DATAGRAPH_PORT || 3007;

// Initialize Ollama client
const ollama = new OllamaClient(
  process.env.OLLAMA_API_URL || 'http://localhost:11434',
  process.env.OLLAMA_MODEL || 'llama3.2:3b'
);

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Get posts metadata
app.get('/api/metadata/posts', async (req, res) => {
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
});

// Get images metadata
app.get('/api/metadata/images', async (req, res) => {
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
});

// Helper function to extract frontmatter from MDX content
function extractFrontmatter(content) {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return {};
  
  const frontmatter = {};
  const lines = frontmatterMatch[1].split('\n');
  
  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match) {
      const key = match[1];
      let value = match[2].trim();
      
      // Remove quotes if present
      if ((value.startsWith("'") && value.endsWith("'")) || 
          (value.startsWith('"') && value.endsWith('"'))) {
        value = value.slice(1, -1);
      }
      
      // Handle arrays
      if (value.startsWith('[') && value.endsWith(']')) {
        try {
          value = JSON.parse(value);
        } catch (e) {
          // If JSON parsing fails, treat as string
        }
      }
      
      frontmatter[key] = value;
    }
  }
  
  return frontmatter;
}

// Get posts list (compatible with frontend)
app.get('/api/posts', async (req, res) => {
  try {
    const metadataPath = path.join(__dirname, '../metadata/posts.json');
    if (await fs.pathExists(metadataPath)) {
      const metadata = await fs.readJson(metadataPath);
      const privateKey = process.env.AGE_PRIVATE_KEY;
      
      if (!privateKey) {
        return res.status(500).json({ error: 'AGE_PRIVATE_KEY not configured' });
      }
      
      // Transform to match frontend expectations
      const posts = await Promise.all(metadata.posts.map(async (post) => {
        // Clean up titles by removing date prefixes like "2020 04 13"
        let cleanTitle = post.title;
        const dateMatch = post.title.match(/^\d{4}\s+\d{1,2}\s+\d{1,2}\s+(.+)$/);
        if (dateMatch) {
          cleanTitle = dateMatch[1];
        }
        
        // Try to get cover image from frontmatter
        let coverImage = post.coverImage;
        let tags = post.tags || [];
        let date = post.date;
        
        try {
          const encryptedPath = path.join(__dirname, '../data/posts', `${post.slug}.mdx.age`);
          if (await fs.pathExists(encryptedPath)) {
            const decrypted = execSync(`age -d -i <(echo "${privateKey}") "${encryptedPath}"`, {
              shell: '/bin/bash',
              encoding: 'utf8'
            });
            
            const frontmatter = extractFrontmatter(decrypted);
            coverImage = frontmatter.coverImage || coverImage;
            tags = frontmatter.tags || tags;
            date = frontmatter.date || date;
          }
        } catch (error) {
          console.error(`Error reading post ${post.slug}:`, error.message);
        }
        
        return {
          slug: post.slug,
          title: cleanTitle,
          date: date,
          tags: Array.isArray(tags) ? tags : [],
          categories: Array.isArray(tags) ? tags : [], // Use tags as categories for now
          coverImage: coverImage,
          thumbnailExists: !!coverImage
        };
      }));
      
      res.json(posts);
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('Error loading posts:', error);
    res.status(500).json({ error: 'Failed to load posts' });
  }
});

// Get decrypted post
app.get('/api/posts/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const encryptedPath = path.join(__dirname, '../data/posts', `${slug}.mdx.age`);
    
    if (!(await fs.pathExists(encryptedPath))) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    // Decrypt the post
    const privateKey = process.env.AGE_PRIVATE_KEY;
    if (!privateKey) {
      return res.status(500).json({ error: 'AGE_PRIVATE_KEY not configured' });
    }
    
    const decrypted = execSync(`age -d -i <(echo "${privateKey}") "${encryptedPath}"`, {
      shell: '/bin/bash',
      encoding: 'utf8'
    });
    
    // Parse frontmatter and content
    const frontmatter = extractFrontmatter(decrypted);
    const content = decrypted.replace(/^---\n[\s\S]*?\n---\n/, '');
    
    // Return JSON with parsed data
    res.json({
      slug: slug,
      title: frontmatter.title || 'Untitled',
      date: frontmatter.date || '',
      tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
      categories: Array.isArray(frontmatter.categories) ? frontmatter.categories : [],
      coverImage: frontmatter.coverImage || null,
      summary: frontmatter.summary || '',
      content: content,
      metadata: {
        title: frontmatter.title || 'Untitled',
        date: frontmatter.date || '',
        tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
        categories: Array.isArray(frontmatter.categories) ? frontmatter.categories : [],
        coverImage: frontmatter.coverImage || null,
        summary: frontmatter.summary || ''
      }
    });
    
  } catch (error) {
    console.error('Error loading post:', error);
    res.status(500).json({ error: 'Failed to load post' });
  }
});

// Serve images directly from /images/ for frontend compatibility
app.get('/images/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const encryptedPath = path.join(__dirname, '../data/images', `${filename}.age`);
    
    if (!(await fs.pathExists(encryptedPath))) {
      return res.status(404).json({ error: 'Image not found' });
    }
    
    // Decrypt the image
    const privateKey = process.env.AGE_PRIVATE_KEY;
    if (!privateKey) {
      return res.status(500).json({ error: 'AGE_PRIVATE_KEY not configured' });
    }
    
    const decrypted = execSync(`age -d -i <(echo "${privateKey}") "${encryptedPath}"`, {
      shell: '/bin/bash',
      encoding: 'buffer'
    });
    
    // Set appropriate content type
    const ext = path.extname(filename).toLowerCase();
    const types = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml'
    };
    
    res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.send(decrypted);
    
  } catch (error) {
    console.error('Error loading image:', error);
    res.status(500).json({ error: 'Failed to load image' });
  }
});

// Get decrypted image
app.get('/api/images/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const encryptedPath = path.join(__dirname, '../data/images', `${filename}.age`);
    
    if (!(await fs.pathExists(encryptedPath))) {
      return res.status(404).json({ error: 'Image not found' });
    }
    
    // Decrypt the image
    const privateKey = process.env.AGE_PRIVATE_KEY;
    if (!privateKey) {
      return res.status(500).json({ error: 'AGE_PRIVATE_KEY not configured' });
    }
    
    const decrypted = execSync(`age -d -i <(echo "${privateKey}") "${encryptedPath}"`, {
      shell: '/bin/bash',
      encoding: 'buffer'
    });
    
    // Set appropriate content type
    const ext = path.extname(filename).toLowerCase();
    const types = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml'
    };
    
    res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.send(decrypted);
    
  } catch (error) {
    console.error('Error loading image:', error);
    res.status(500).json({ error: 'Failed to load image' });
  }
});

// Ollama AI endpoints
app.get('/api/ai/health', async (req, res) => {
  try {
    const health = await ollama.healthCheck();
    res.json(health);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Ollama service unavailable',
      details: error.message 
    });
  }
});

app.get('/api/ai/models', async (req, res) => {
  try {
    const models = await ollama.listModels();
    res.json(models);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to list models',
      details: error.message 
    });
  }
});

app.post('/api/ai/chat', async (req, res) => {
  try {
    const { messages, model, options } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Messages array is required' 
      });
    }
    
    const result = await ollama.chat(messages, { 
      model: model || ollama.model,
      ...options 
    });
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Chat request failed',
      details: error.message 
    });
  }
});

app.post('/api/ai/generate', async (req, res) => {
  try {
    const { prompt, model, options } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ 
        success: false, 
        error: 'Prompt is required' 
      });
    }
    
    const result = await ollama.generate(prompt, { 
      model: model || ollama.model,
      ...options 
    });
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Generate request failed',
      details: error.message 
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Datagraph API running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔍 Metadata: http://localhost:${PORT}/api/metadata/posts`);
  console.log(`🔒 Content: http://localhost:${PORT}/api/posts/:slug`);
  console.log(`🤖 AI Chat: http://localhost:${PORT}/api/ai/chat`);
  console.log(`🧠 AI Generate: http://localhost:${PORT}/api/ai/generate`);
});

module.exports = app;


