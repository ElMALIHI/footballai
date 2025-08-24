# 🏈 Football AI Prediction API - Complete User Guide

## 🚀 Quick Start

### Base URL
```
http://localhost:3000/api/v1
```

### Health Check
First, check if the API is running:
```bash
curl http://localhost:3000/health
```

## 📚 Available Endpoints

### 1. 🏆 Competitions

#### Get All Competitions
```bash
GET /competitions
```

**Query Parameters:**
- `limit` (optional): Number of results (default: 20, max: 100)
- `offset` (optional): Number of results to skip (default: 0)
- `plan` (optional): Filter by plan (TIER_ONE, TIER_TWO, TIER_THREE, TIER_FOUR)
- `areas` (optional): Filter by areas

**Example:**
```bash
curl "http://localhost:3000/api/v1/competitions?limit=10&plan=TIER_ONE"
```

#### Get Specific Competition
```bash
GET /competitions/:id
```

**Example:**
```bash
curl "http://localhost:3000/api/v1/competitions/1"
```

#### Get Competition Matches
```bash
GET /competitions/:id/matches
```

**Query Parameters:**
- `season` (optional): Filter by season (e.g., 2023)
- `limit` (optional): Number of results
- `offset` (optional): Number of results to skip

**Example:**
```bash
curl "http://localhost:3000/api/v1/competitions/1/matches?season=2023"
```

#### Get Competition Standings
```bash
GET /competitions/:id/standings
```

**Example:**
```bash
curl "http://localhost:3000/api/v1/competitions/1/standings"
```

### 2. ⚽ Teams

#### Get All Teams
```bash
GET /teams
```

**Query Parameters:**
- `competitionId` (optional): Filter by competition
- `country` (optional): Filter by country
- `limit` (optional): Number of results
- `offset` (optional): Number of results to skip

**Example:**
```bash
curl "http://localhost:3000/api/v1/teams?competitionId=1&limit=20"
```

#### Get Specific Team
```bash
GET /teams/:id
```

**Example:**
```bash
curl "http://localhost:3000/api/v1/teams/1"
```

#### Get Team Matches
```bash
GET /teams/:id/matches
```

**Query Parameters:**
- `season` (optional): Filter by season
- `limit` (optional): Number of results
- `offset` (optional): Number of results to skip

**Example:**
```bash
curl "http://localhost:3000/api/v1/teams/1/matches?season=2023"
```

#### Get Team Form
```bash
GET /teams/:id/form
```

**Example:**
```bash
curl "http://localhost:3000/api/v1/teams/1/form"
```

#### Get Team Stats
```bash
GET /teams/:id/stats
```

**Example:**
```bash
curl "http://localhost:3000/api/v1/teams/1/stats"
```

### 3. 🎯 Matches

#### Get All Matches
```bash
GET /matches
```

**Query Parameters:**
- `competitionId` (optional): Filter by competition
- `status` (optional): Filter by status (SCHEDULED, LIVE, FINISHED, etc.)
- `dateFrom` (optional): Start date (YYYY-MM-DD)
- `dateTo` (optional): End date (YYYY-MM-DD)
- `limit` (optional): Number of results
- `offset` (optional): Number of results to skip

**Example:**
```bash
curl "http://localhost:3000/api/v1/matches?competitionId=1&status=FINISHED&dateFrom=2023-08-01&dateTo=2023-08-31"
```

#### Get Specific Match
```bash
GET /matches/:id
```

**Example:**
```bash
curl "http://localhost:3000/api/v1/matches/1"
```

#### Get Head-to-Head Analysis
```bash
GET /matches/:id/head2head
```

**Example:**
```bash
curl "http://localhost:3000/api/v1/matches/1/head2head"
```

#### Get Upcoming Matches
```bash
GET /matches/upcoming
```

**Query Parameters:**
- `competitionId` (optional): Filter by competition
- `limit` (optional): Number of results

**Example:**
```bash
curl "http://localhost:3000/api/v1/matches/upcoming?competitionId=1&limit=10"
```

#### Get Live Matches
```bash
GET /matches/live
```

**Example:**
```bash
curl "http://localhost:3000/api/v1/matches/live"
```

### 4. 🤖 AI Predictions

#### Train ML Models
```bash
POST /predictions/train
```

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
    },
    "neuralNetwork": {
      "layers": [64, 32, 16],
      "learningRate": 0.001,
      "epochs": 100
    }
  }
}
```

**Example:**
```bash
curl -X POST "http://localhost:3000/api/v1/predictions/train" \
  -H "Content-Type: application/json" \
  -d '{
    "competitionId": 1,
    "season": 2023,
    "modelTypes": ["random_forest"]
  }'
```

#### Make Match Prediction
```bash
POST /predictions/predict
```

**Request Body:**
```json
{
  "matchId": 123,
  "modelName": "random_forest_v1"
}
```

**Example:**
```bash
curl -X POST "http://localhost:3000/api/v1/predictions/predict" \
  -H "Content-Type: application/json" \
  -d '{
    "matchId": 123
  }'
```

#### Bulk Predictions
```bash
POST /predictions/bulk
```

**Request Body:**
```json
{
  "matchIds": [123, 124, 125],
  "modelName": "random_forest_v1"
}
```

**Example:**
```bash
curl -X POST "http://localhost:3000/api/v1/predictions/bulk" \
  -H "Content-Type: application/json" \
  -d '{
    "matchIds": [123, 124, 125]
  }'
```

#### Get Prediction History
```bash
GET /predictions/history
```

**Query Parameters:**
- `competitionId` (optional): Filter by competition
- `modelName` (optional): Filter by model
- `limit` (optional): Number of results (default: 100, max: 1000)
- `offset` (optional): Number of results to skip
- `includeResults` (optional): Include actual results (default: true)

**Example:**
```bash
curl "http://localhost:3000/api/v1/predictions/history?competitionId=1&limit=50"
```

#### Get Available Models
```bash
GET /predictions/models
```

**Example:**
```bash
curl "http://localhost:3000/api/v1/predictions/models"
```

#### Get Model Performance
```bash
GET /predictions/performance/:modelName
```

**Example:**
```bash
curl "http://localhost:3000/api/v1/predictions/performance/random_forest_v1"
```

### 5. 💰 Betting Analysis

#### Analyze Betting Odds
```bash
POST /betting/analyze
```

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

**Example:**
```bash
curl -X POST "http://localhost:3000/api/v1/betting/analyze" \
  -H "Content-Type: application/json" \
  -d '{
    "matchId": 123,
    "odds": {
      "homeWin": 2.10,
      "draw": 3.20,
      "awayWin": 3.50
    }
  }'
```

#### Bulk Betting Analysis
```bash
POST /betting/bulk-analyze
```

**Request Body:**
```json
{
  "matches": [
    {
      "matchId": 123,
      "odds": {
        "homeWin": 2.10,
        "draw": 3.20,
        "awayWin": 3.50
      }
    }
  ]
}
```

#### Get Betting Performance
```bash
GET /betting/performance
```

**Query Parameters:**
- `competitionId` (optional): Filter by competition
- `days` (optional): Time period in days (default: 30)

**Example:**
```bash
curl "http://localhost:3000/api/v1/betting/performance?days=90"
```

#### Get Betting Trends
```bash
GET /betting/trends
```

**Example:**
```bash
curl "http://localhost:3000/api/v1/betting/trends"
```

#### Find Value Bets
```bash
GET /betting/value-bets
```

**Query Parameters:**
- `competitionId` (optional): Filter by competition
- `minValue` (optional): Minimum value percentage (default: 5.0)
- `limit` (optional): Number of results

**Example:**
```bash
curl "http://localhost:3000/api/v1/betting/value-bets?minValue=10.0&limit=20"
```

#### Get Match Odds
```bash
GET /betting/odds/:matchId
```

**Example:**
```bash
curl "http://localhost:3000/api/v1/betting/odds/123"
```

#### Get Kelly Criterion Recommendations
```bash
GET /betting/kelly/:matchId
```

**Example:**
```bash
curl "http://localhost:3000/api/v1/betting/kelly/123"
```

### 6. 📊 Analytics

#### Get Dashboard Analytics
```bash
GET /analytics/dashboard
```

**Query Parameters:**
- `competitionId` (optional): Filter by competition
- `season` (optional): Filter by season
- `days` (optional): Time period in days (default: 30)

**Example:**
```bash
curl "http://localhost:3000/api/v1/analytics/dashboard?competitionId=1&days=90"
```

#### Get Team Analytics
```bash
GET /analytics/team/:id
```

**Query Parameters:**
- `season` (optional): Filter by season
- `days` (optional): Time period in days

**Example:**
```bash
curl "http://localhost:3000/api/v1/analytics/team/1?season=2023"
```

#### Get Competition Analytics
```bash
GET /analytics/competition/:id
```

**Example:**
```bash
curl "http://localhost:3000/api/v1/analytics/competition/1"
```

#### Get Trend Analysis
```bash
GET /analytics/trends
```

**Query Parameters:**
- `competitionId` (optional): Filter by competition
- `days` (optional): Time period in days

**Example:**
```bash
curl "http://localhost:3000/api/v1/analytics/trends?days=60"
```

#### Get Performance Metrics
```bash
GET /analytics/performance
```

**Example:**
```bash
curl "http://localhost:3000/api/v1/analytics/performance"
```

#### Get Team Rankings
```bash
GET /analytics/teams/ranking
```

**Query Parameters:**
- `competitionId` (optional): Filter by competition
- `season` (optional): Filter by season
- `limit` (optional): Number of results (default: 20)
- `sortBy` (optional): Sort criteria (points, wins, goals, winRate)

**Example:**
```bash
curl "http://localhost:3000/api/v1/analytics/teams/ranking?competitionId=1&sortBy=points&limit=10"
```

#### Get Upcoming Matches Analytics
```bash
GET /analytics/matches/upcoming
```

**Example:**
```bash
curl "http://localhost:3000/api/v1/analytics/matches/upcoming"
```

### 7. 🔧 Admin

#### Get System Status
```bash
GET /admin/status
```

**Example:**
```bash
curl "http://localhost:3000/api/v1/admin/status"
```

#### Get Health Check
```bash
GET /admin/health
```

**Example:**
```bash
curl "http://localhost:3000/api/v1/admin/health"
```

#### Run Background Job
```bash
POST /admin/jobs/:jobName/run
```

**Example:**
```bash
curl -X POST "http://localhost:3000/api/v1/admin/jobs/updateMatches/run"
```

#### Initialize System
```bash
POST /admin/setup
```

**Example:**
```bash
curl -X POST "http://localhost:3000/api/v1/admin/setup"
```

#### Clear Cache
```bash
POST /admin/cache/clear
```

**Example:**
```bash
curl -X POST "http://localhost:3000/api/v1/admin/cache/clear"
```

#### Clean Old Data
```bash
POST /admin/data/cleanup
```

**Example:**
```bash
curl -X POST "http://localhost:3000/api/v1/admin/data/cleanup"
```

## 🔍 Response Format

All API responses follow this structure:

### Success Response
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {
    // Response data here
  },
  "timestamp": "2023-08-24T01:06:00.000Z"
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "message": "Error description",
    "details": "Additional error details"
  }
}
```

## 📝 Common HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | OK - Request successful |
| 201 | Created - Resource created successfully |
| 400 | Bad Request - Invalid parameters |
| 401 | Unauthorized - Authentication required |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource not found |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error - Server error |
| 503 | Service Unavailable - Service temporarily unavailable |

## 🚦 Rate Limiting

- **Rate Limit**: 100 requests per minute per IP
- **Headers**: 
  - `X-RateLimit-Limit`: Maximum requests per window
  - `X-RateLimit-Remaining`: Remaining requests in current window
  - `X-RateLimit-Reset`: Time when the rate limit resets

## 💾 Caching

The API uses Redis caching for improved performance:
- **Competition data**: 1 hour
- **Team data**: 30 minutes
- **Match data**: 15 minutes
- **Predictions**: 5 minutes
- **Analytics**: 10 minutes

## 🛠️ Testing Examples

### 1. Get Premier League Competitions
```bash
curl "http://localhost:3000/api/v1/competitions?plan=TIER_ONE&limit=5"
```

### 2. Get Team Matches for Season 2023
```bash
curl "http://localhost:3000/api/v1/teams/1/matches?season=2023&limit=10"
```

### 3. Get Upcoming Matches
```bash
curl "http://localhost:3000/api/v1/matches/upcoming?limit=5"
```

### 4. Train AI Model for Competition
```bash
curl -X POST "http://localhost:3000/api/v1/predictions/train" \
  -H "Content-Type: application/json" \
  -d '{
    "competitionId": 1,
    "season": 2023,
    "modelTypes": ["random_forest"]
  }'
```

### 5. Get Match Prediction
```bash
curl -X POST "http://localhost:3000/api/v1/predictions/predict" \
  -H "Content-Type: application/json" \
  -d '{
    "matchId": 123
  }'
```

### 6. Analyze Betting Odds
```bash
curl -X POST "http://localhost:3000/api/v1/betting/analyze" \
  -H "Content-Type: application/json" \
  -d '{
    "matchId": 123,
    "odds": {
      "homeWin": 2.10,
      "draw": 3.20,
      "awayWin": 3.50
    }
  }'
```

### 7. Get Dashboard Analytics
```bash
curl "http://localhost:3000/api/v1/analytics/dashboard?days=30"
```

## 🔧 Troubleshooting

### Common Issues

1. **Connection Refused**: Make sure the API server is running
2. **Rate Limit Exceeded**: Wait for the rate limit to reset
3. **Validation Errors**: Check request parameters and body format
4. **Redis Connection Issues**: Check if Redis service is running

### Debug Commands

1. **Check API Health**:
   ```bash
   curl http://localhost:3000/health
   ```

2. **Check Redis Connection**:
   ```bash
   node test-redis.js
   ```

3. **Debug Redis Issues**:
   ```bash
   node debug-redis.js
   ```

## 📚 Additional Resources

- **API Documentation**: Check the `/docs/api.md` file
- **Environment Variables**: See `env.example` for configuration options
- **Docker Setup**: Use `docker-compose.yml` for easy deployment
- **Testing**: Run tests with `npm test`

## 🆘 Support

If you encounter issues:
1. Check the API health endpoint
2. Review the logs in the `logs/` directory
3. Check Docker container status
4. Verify environment variables are set correctly

---

**Happy coding with the Football AI Prediction API! 🚀⚽**
