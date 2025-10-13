#!/usr/bin/env node

/**
 * Simple Datagraph API Server (JavaScript version for quick testing)
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const { execSync } = require('child_process');

const app = express();
const PORT = process.env.DATAGRAPH_PORT || 3007;

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
    
    res.setHeader('Content-Type', 'text/markdown');
    res.send(decrypted);
    
  } catch (error) {
    console.error('Error loading post:', error);
    res.status(500).json({ error: 'Failed to load post' });
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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Datagraph API running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔍 Metadata: http://localhost:${PORT}/api/metadata/posts`);
  console.log(`🔒 Content: http://localhost:${PORT}/api/posts/:slug`);
});

module.exports = app;
