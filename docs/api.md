# Football AI Prediction API Documentation

## Overview

The Football AI Prediction API provides comprehensive football data, AI-powered match predictions, betting analysis, and advanced analytics. Built with Node.js, Express, PostgreSQL, and Redis.

## Base URL

```
https://api.footballai.com/v1
```

## Authentication

Currently, the API is open access. Future versions will include JWT authentication.

## Rate Limiting

- **Rate Limit**: 100 requests per minute per IP
- **Headers**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

## Response Format

All responses follow this structure:

```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {
    // Response data
  },
  "timestamp": "2023-08-24T01:06:00.000Z"
}
```

Error responses:

```json
{
  "success": false,
  "error": {
    "message": "Error description",
    "details": "Additional error details"
  }
}
```

## Endpoints

### Competitions

#### GET /competitions
Get all competitions.

**Query Parameters:**
- `limit` (number, optional): Number of results (default: 20, max: 100)
- `offset` (number, optional): Number of results to skip (default: 0)
- `type` (string, optional): Filter by competition type (LEAGUE, CUP, FRIENDLY)

**Response:**
```json
{
  "success": true,
  "data": {
    "competitions": [
      {
        "id": 1,
        "name": "Premier League",
        "code": "PL",
        "type": "LEAGUE",
        "country": "England",
        "emblem": "https://example.com/pl.png",
        "currentSeason": 2023,
        "numberOfAvailableSeasons": 5,
        "lastUpdated": "2023-08-01T00:00:00Z"
      }
    ],
    "pagination": {
      "total": 50,
      "limit": 20,
      "offset": 0,
      "pages": 3
    }
  }
}
```

#### GET /competitions/:id
Get specific competition details.

#### GET /competitions/:id/matches
Get matches for a competition.

**Query Parameters:**
- `status` (string, optional): Filter by match status
- `limit` (number, optional): Number of results
- `offset` (number, optional): Number of results to skip

#### GET /competitions/:id/standings
Get competition standings/table.

### Teams

#### GET /teams
Get all teams with filtering options.

**Query Parameters:**
- `competitionId` (number, optional): Filter by competition
- `country` (string, optional): Filter by country
- `limit` (number, optional): Number of results
- `offset` (number, optional): Number of results to skip

#### GET /teams/:id
Get specific team details.

#### GET /teams/:id/matches
Get team's match history.

#### GET /teams/:id/form
Get team's recent form analysis.

#### GET /teams/:id/stats
Get detailed team statistics.

### Matches

#### GET /matches
Get matches with filtering options.

**Query Parameters:**
- `competitionId` (number, optional): Filter by competition
- `status` (string, optional): Filter by status
- `dateFrom` (string, optional): Start date (YYYY-MM-DD)
- `dateTo` (string, optional): End date (YYYY-MM-DD)
- `limit` (number, optional): Number of results
- `offset` (number, optional): Number of results to skip

#### GET /matches/:id
Get specific match details.

#### GET /matches/:id/head2head
Get head-to-head analysis between teams.

#### GET /matches/upcoming
Get upcoming matches.

#### GET /matches/live
Get live matches.

### Predictions

#### POST /predictions/train
Train ML models for a competition.

**Request Body:**
```json
{
  "competitionId": 1,
  "season": 2023,
  "modelTypes": ["random_forest", "neural_network"],
  "trainingOptions": {
    "randomForest": {
      "nEstimators": 100,
      "maxDepth": 10
    }
  }
}
```

#### POST /predictions/predict
Make a prediction for a specific match.

**Request Body:**
```json
{
  "matchId": 123,
  "modelName": "optional_model_name"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "match": {
      "id": 123,
      "homeTeam": "Team A",
      "awayTeam": "Team B",
      "utcDate": "2023-08-25T19:00:00Z"
    },
    "prediction": {
      "predictedWinner": "HOME_TEAM",
      "confidence": 0.75,
      "probabilities": {
        "homeTeamWin": 0.45,
        "draw": 0.25,
        "awayTeamWin": 0.30
      },
      "model": "random_forest_v1",
      "timestamp": "2023-08-24T01:06:00.000Z"
    }
  }
}
```

#### POST /predictions/bulk
Make predictions for multiple matches.

**Request Body:**
```json
{
  "matchIds": [123, 124, 125],
  "modelName": "optional_model_name"
}
```

#### GET /predictions/upcoming/:competition
Get upcoming matches for prediction.

#### GET /predictions/history
Get prediction history with accuracy.

**Query Parameters:**
- `competitionId` (number, optional): Filter by competition
- `modelName` (string, optional): Filter by model
- `limit` (number, optional): Number of results
- `offset` (number, optional): Number of results to skip

#### GET /predictions/models
List available trained models.

#### GET /predictions/performance/:modelName
Get model performance statistics.

### Betting

#### POST /betting/analyze
Analyze betting odds for value bets.

**Request Body:**
```json
{
  "matchId": 123,
  "odds": {
    "homeWin": 2.10,
    "draw": 3.20,
    "awayWin": 3.50
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "matchId": 123,
    "odds": {
      "homeWin": 2.10,
      "draw": 3.20,
      "awayWin": 3.50
    },
    "aiPrediction": {
      "predictedWinner": "HOME_TEAM",
      "confidence": 0.75,
      "probabilities": {
        "HOME_TEAM": 0.45,
        "DRAW": 0.25,
        "AWAY_TEAM": 0.30
      }
    },
    "valueAnalysis": [
      {
        "outcome": "HOME_TEAM",
        "aiProbability": 0.45,
        "impliedProbability": 0.476,
        "value": -0.026,
        "valuePercentage": -5.5,
        "odds": 2.10,
        "isValueBet": false
      }
    ],
    "kellyRecommendations": [
      {
        "outcome": "HOME_TEAM",
        "kellyFraction": 0.05,
        "cappedFraction": 0.05,
        "recommendedStake": 0.05,
        "isRecommended": true
      }
    ],
    "recommendations": {
      "overallRecommendation": "BUY",
      "confidence": 0.75,
      "riskLevel": "MEDIUM_HIGH",
      "reasoning": ["Value bet found: HOME_TEAM (5.5% value)"]
    }
  }
}
```

#### POST /betting/bulk-analyze
Analyze multiple matches for betting opportunities.

#### GET /betting/performance
Get betting performance metrics.

#### GET /betting/trends
Get betting trends and patterns.

#### GET /betting/value-bets
Find current value betting opportunities.

#### GET /betting/odds/:matchId
Get odds and implied probabilities for a match.

#### GET /betting/kelly/:matchId
Get Kelly Criterion recommendations for a match.

### Analytics

#### GET /analytics/dashboard
Get comprehensive dashboard analytics.

**Query Parameters:**
- `competitionId` (number, optional): Filter by competition
- `season` (number, optional): Filter by season
- `days` (number, optional): Time period in days (default: 30)

#### GET /analytics/team/:id
Get detailed team performance analytics.

#### GET /analytics/competition/:id
Get competition-specific analytics.

#### GET /analytics/trends
Get trend analysis and patterns.

#### GET /analytics/performance
Get performance metrics and statistics.

#### GET /analytics/teams/ranking
Get team rankings and leaderboards.

**Query Parameters:**
- `competitionId` (number, optional): Filter by competition
- `season` (number, optional): Filter by season
- `limit` (number, optional): Number of results (default: 20)
- `sortBy` (string, optional): Sort criteria (points, wins, goals, winRate)

#### GET /analytics/matches/upcoming
Get upcoming matches analytics.

### Admin

#### GET /admin/status
Get system status and health.

#### GET /admin/health
Get detailed health check.

#### POST /admin/jobs/:jobName/run
Manually trigger a background job.

#### POST /admin/setup
Initialize the system with data.

#### POST /admin/cache/clear
Clear all caches.

#### POST /admin/data/cleanup
Clean old data.

## Error Codes

| Code | Description |
|------|-------------|
| 400 | Bad Request - Invalid parameters |
| 401 | Unauthorized - Authentication required |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource not found |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error - Server error |
| 503 | Service Unavailable - Service temporarily unavailable |

## Data Models

### Competition
```json
{
  "id": 1,
  "name": "Premier League",
  "code": "PL",
  "type": "LEAGUE",
  "country": "England",
  "emblem": "https://example.com/pl.png",
  "currentSeason": 2023,
  "numberOfAvailableSeasons": 5,
  "lastUpdated": "2023-08-01T00:00:00Z",
  "isActive": true
}
```

### Team
```json
{
  "id": 1,
  "name": "Manchester United",
  "shortName": "Man United",
  "tla": "MUN",
  "crest": "https://example.com/mun.png",
  "address": "Sir Matt Busby Way, Manchester",
  "website": "https://www.manutd.com",
  "founded": 1878,
  "clubColors": "Red / White",
  "venue": "Old Trafford",
  "venueCapacity": 74140,
  "country": "England",
  "lastUpdated": "2023-08-01T00:00:00Z",
  "isActive": true
}
```

### Match
```json
{
  "id": 1,
  "competitionId": 1,
  "season": 2023,
  "stage": "REGULAR_SEASON",
  "matchday": 1,
  "homeTeamId": 1,
  "awayTeamId": 2,
  "homeTeamScore": 2,
  "awayTeamScore": 1,
  "winner": "HOME_TEAM",
  "utcDate": "2023-08-15T19:00:00Z",
  "status": "FINISHED",
  "venue": "Old Trafford",
  "referee": "John Smith",
  "homeTeamWinOdds": 2.10,
  "drawOdds": 3.20,
  "awayTeamWinOdds": 3.50,
  "isPredicted": true,
  "predictedWinner": "HOME_TEAM",
  "predictionConfidence": 0.75
}
```

### Prediction
```json
{
  "id": 1,
  "matchId": 1,
  "modelName": "random_forest_v1",
  "modelVersion": "1.0",
  "homeTeamWinProbability": 0.45,
  "drawProbability": 0.25,
  "awayTeamWinProbability": 0.30,
  "predictedWinner": "HOME_TEAM",
  "confidence": 0.75,
  "actualWinner": "HOME_TEAM",
  "isCorrect": true,
  "predictionTimestamp": "2023-08-14T10:00:00Z",
  "isProcessed": true
}
```

## Rate Limiting

The API implements rate limiting to ensure fair usage:

- **Free Tier**: 100 requests per minute
- **Premium Tier**: 1000 requests per minute
- **Enterprise Tier**: Custom limits

Rate limit headers are included in all responses:
- `X-RateLimit-Limit`: Maximum requests per window
- `X-RateLimit-Remaining`: Remaining requests in current window
- `X-RateLimit-Reset`: Time when the rate limit resets (Unix timestamp)

## Caching

The API uses Redis caching to improve performance:

- **Competition data**: 1 hour
- **Team data**: 30 minutes
- **Match data**: 15 minutes
- **Predictions**: 5 minutes
- **Analytics**: 10 minutes

Cache headers are included in responses:
- `Cache-Control`: Cache directives
- `ETag`: Entity tag for cache validation

## Webhooks

Webhook support is planned for future versions to notify clients of:
- New predictions
- Match result updates
- System status changes

## SDKs

Official SDKs are available for:
- JavaScript/Node.js
- Python
- PHP
- Java

## Support

For support and questions:
- **Email**: support@footballai.com
- **Documentation**: https://docs.footballai.com
- **Status Page**: https://status.footballai.com
- **GitHub**: https://github.com/footballai/api

## Changelog

### v1.0.0 (2023-08-24)
- Initial API release
- Core football data endpoints
- AI prediction system
- Betting analysis
- Advanced analytics
- Comprehensive testing suite
