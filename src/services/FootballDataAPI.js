const axios = require('axios');
const logger = require('../config/logger');
const { redis } = require('../config/redis');

class FootballDataAPI {
  constructor() {
    this.baseURL = process.env.FOOTBALL_API_BASE_URL || 'https://api.football-data.org/v4';
    this.apiKey = process.env.FOOTBALL_API_KEY;
    this.rateLimit = parseInt(process.env.FOOTBALL_API_RATE_LIMIT) || 10;
    this.requestCount = 0;
    this.lastResetTime = Date.now();

    if (!this.apiKey) {
      logger.warn('Football API key not provided. Some features may not work.');
    }

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'X-Auth-Token': this.apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    // Add request interceptor for rate limiting
    this.client.interceptors.request.use(async (config) => {
      await this.checkRateLimit();
      return config;
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => {
        this.requestCount++;
        return response;
      },
      (error) => {
        logger.error('Football API request failed:', {
          url: error.config?.url,
          method: error.config?.method,
          status: error.response?.status,
          message: error.message,
        });
        throw error;
      }
    );
  }

  async checkRateLimit() {
    const now = Date.now();
    const timeWindow = 60 * 1000; // 1 minute

    // Reset counter if time window has passed
    if (now - this.lastResetTime > timeWindow) {
      this.requestCount = 0;
      this.lastResetTime = now;
    }

    // Check if we're at the rate limit
    if (this.requestCount >= this.rateLimit) {
      const waitTime = timeWindow - (now - this.lastResetTime);
      logger.warn(`Rate limit reached. Waiting ${waitTime}ms before next request.`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.requestCount = 0;
      this.lastResetTime = Date.now();
    }
  }

  async makeRequest(endpoint, useCache = true, cacheTime = 300) {
    const cacheKey = `football_api:${endpoint}`;

    try {
      // Check cache first
      if (useCache) {
        const cachedData = await redis.get(cacheKey);
        if (cachedData) {
          logger.debug(`Cache hit for endpoint: ${endpoint}`);
          return cachedData;
        }
      }

      // Make API request
      logger.debug(`Making request to: ${endpoint}`);
      const response = await this.client.get(endpoint);
      
      // Cache the response
      if (useCache && response.data) {
        await redis.setEx(cacheKey, cacheTime, response.data);
      }

      return response.data;
    } catch (error) {
      logger.error(`API request failed for ${endpoint}:`, error.message);
      throw error;
    }
  }

  // Competitions endpoints
  async getCompetitions(plan = null, areas = null) {
    let endpoint = '/competitions';
    const params = new URLSearchParams();
    
    if (plan) params.append('plan', plan);
    if (areas) params.append('areas', areas);
    
    if (params.toString()) {
      endpoint += `?${params.toString()}`;
    }

    return this.makeRequest(endpoint);
  }

  async getCompetition(id) {
    return this.makeRequest(`/competitions/${id}`);
  }

  async getCompetitionStandings(id, season = null) {
    let endpoint = `/competitions/${id}/standings`;
    if (season) {
      endpoint += `?season=${season}`;
    }
    return this.makeRequest(endpoint);
  }

  async getCompetitionMatches(id, filters = {}) {
    let endpoint = `/competitions/${id}/matches`;
    const params = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        params.append(key, value);
      }
    });
    
    if (params.toString()) {
      endpoint += `?${params.toString()}`;
    }

    return this.makeRequest(endpoint);
  }

  // Teams endpoints
  async getTeams(competitionId, season = null) {
    let endpoint = `/competitions/${competitionId}/teams`;
    if (season) {
      endpoint += `?season=${season}`;
    }
    return this.makeRequest(endpoint);
  }

  async getTeam(id) {
    return this.makeRequest(`/teams/${id}`);
  }

  async getTeamMatches(id, filters = {}) {
    let endpoint = `/teams/${id}/matches`;
    const params = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        params.append(key, value);
      }
    });
    
    if (params.toString()) {
      endpoint += `?${params.toString()}`;
    }

    return this.makeRequest(endpoint);
  }

  // Matches endpoints
  async getMatches(filters = {}) {
    let endpoint = '/matches';
    const params = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        params.append(key, value);
      }
    });
    
    if (params.toString()) {
      endpoint += `?${params.toString()}`;
    }

    return this.makeRequest(endpoint);
  }

  async getMatch(id) {
    return this.makeRequest(`/matches/${id}`);
  }

  async getMatchHead2Head(id, limit = 10) {
    return this.makeRequest(`/matches/${id}/head2head?limit=${limit}`);
  }

  // Areas endpoints
  async getAreas() {
    return this.makeRequest('/areas');
  }

  async getArea(id) {
    return this.makeRequest(`/areas/${id}`);
  }

  // Utility methods
  async getUpcomingMatches(competitionId = null, days = 7) {
    const filters = {
      dateFrom: new Date().toISOString().split('T')[0],
      dateTo: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'SCHEDULED',
    };

    if (competitionId) {
      return this.getCompetitionMatches(competitionId, filters);
    } else {
      return this.getMatches(filters);
    }
  }

  async getRecentMatches(competitionId = null, days = 7) {
    const filters = {
      dateFrom: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      dateTo: new Date().toISOString().split('T')[0],
      status: 'FINISHED',
    };

    if (competitionId) {
      return this.getCompetitionMatches(competitionId, filters);
    } else {
      return this.getMatches(filters);
    }
  }

  // Clear cache for specific endpoint
  async clearCache(endpoint) {
    const cacheKey = `football_api:${endpoint}`;
    await redis.del(cacheKey);
    logger.debug(`Cache cleared for: ${endpoint}`);
  }

  // Clear all cache
  async clearAllCache() {
    // This would need to be implemented based on your Redis setup
    // For now, we'll just log it
    logger.info('Cache clear requested for all Football API data');
  }
}

module.exports = FootballDataAPI;
