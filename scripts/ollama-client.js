const axios = require('axios');

class OllamaClient {
  constructor(apiUrl = 'http://localhost:11434', model = 'llama3.2:3b') {
    this.apiUrl = apiUrl;
    this.model = model;
  }

  async chat(messages, options = {}) {
    try {
      const response = await axios.post(`${this.apiUrl}/api/chat`, {
        model: this.model,
        messages: messages,
        stream: false,
        ...options
      });

      return {
        success: true,
        content: response.data.message.content,
        model: response.data.model,
        done: response.data.done
      };
    } catch (error) {
      console.error('Ollama API error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async generate(prompt, options = {}) {
    try {
      const response = await axios.post(`${this.apiUrl}/api/generate`, {
        model: this.model,
        prompt: prompt,
        stream: false,
        ...options
      });

      return {
        success: true,
        response: response.data.response,
        model: response.data.model,
        done: response.data.done
      };
    } catch (error) {
      console.error('Ollama API error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async listModels() {
    try {
      const response = await axios.get(`${this.apiUrl}/api/tags`);
      return {
        success: true,
        models: response.data.models || []
      };
    } catch (error) {
      console.error('Ollama API error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async healthCheck() {
    try {
      const response = await axios.get(`${this.apiUrl}/api/tags`);
      return {
        success: true,
        status: 'healthy',
        models: response.data.models?.length || 0
      };
    } catch (error) {
      return {
        success: false,
        status: 'unhealthy',
        error: error.message
      };
    }
  }
}

module.exports = OllamaClient;
