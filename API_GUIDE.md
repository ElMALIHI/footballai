# 🚀 Football AI API Guide

## 📍 **Base URL**
```
http://localhost:3000/api/v1
```

## 🔍 **Health Check**
```bash
curl http://localhost:3000/health
```

## 🧠 **AI Model Training** ⭐ **NEW!**

### **Train AI Models**
```bash
curl -X POST "http://localhost:3000/api/v1/admin/ai/train" \
  -H "Content-Type: application/json" \
  -d "{
    \"modelTypes\": [\"random_forest\"],
    \"crossValidationFolds\": 5,
    \"hyperparameterTuning\": true,
    \"maxTrainingTime\": 15
  }"
```

**Options:**
- `modelTypes`: Array of model types (`random_forest`, `neural_network`)
- `crossValidationFolds`: Number of CV folds (2-10, default: 5)
- `hyperparameterTuning`: Enable/disable optimization (default: true)
- `maxTrainingTime`: Maximum training time in minutes (5-120, default: 30)
- `season`: Specific season to train on (optional)
- `competitionId`: Specific competition to train on (optional)
- `daysBack`: How far back to use data (90-1095 days, default: 730)

### **List All Models**
```bash
curl "http://localhost:3000/api/v1/admin/ai/models"
```

### **Get Model Details**
```bash
curl "http://localhost:3000/api/v1/admin/ai/models/random_forest_best"
```

### **Evaluate Model**
```bash
curl -X POST "http://localhost:3000/api/v1/admin/ai/evaluate/random_forest_best" \
  -H "Content-Type: application/json" \
  -d "{
    \"daysBack\": 365,
    \"competitionId\": 2021
  }"
```

### **Make Predictions**
```bash
curl -X POST "http://localhost:3000/api/v1/admin/ai/predict" \
  -H "Content-Type: application/json" \
  -d "{
    \"matchId\": 12345,
    \"modelName\": \"random_forest_best\"
  }"
```

### **Training Statistics**
```bash
curl "http://localhost:3000/api/v1/admin/ai/training-stats"
```

### **Delete Model**
```bash
curl -X DELETE "http://localhost:3000/api/v1/admin/ai/models/old_model"
```

## 🏆 **Competitions**

### **Get All Competitions**
```bash
curl "http://localhost:3000/api/v1/competitions"
```

### **Get Competitions with Limit**
```bash
curl "http://localhost:3000/api/v1/competitions?limit=5"
```

### **Get Specific Competition**
```bash
curl "http://localhost:3000/api/v1/competitions/2021"
```

## ⚽ **Teams**

### **Get All Teams**
```bash
curl "http://localhost:3000/api/v1/teams"
```

### **Get Teams with Pagination**
```bash
curl "http://localhost:3000/api/v1/teams?page=1&limit=20"
```

### **Get Specific Team**
```bash
curl "http://localhost:3000/api/v1/teams/1"
```

### **Get Teams by Competition**
```bash
curl "http://localhost:3000/api/v1/teams?competitionId=2021"
```

## 🏟️ **Matches**

### **Get All Matches**
```bash
curl "http://localhost:3000/api/v1/matches"
```

### **Get Matches with Filters**
```bash
curl "http://localhost:3000/api/v1/matches?status=FINISHED&limit=10"
```

### **Get Specific Match**
```bash
curl "http://localhost:3000/api/v1/matches/12345"
```

### **Get Matches by Competition**
```bash
curl "http://localhost:3000/api/v1/matches?competitionId=2021"
```

### **Get Matches by Date Range**
```bash
curl "http://localhost:3000/api/v1/matches?dateFrom=2024-01-01&dateTo=2024-12-31"
```

## 🔮 **Predictions**

### **Get All Predictions**
```bash
curl "http://localhost:3000/api/v1/predictions"
```

### **Get Predictions by Match**
```bash
curl "http://localhost:3000/api/v1/predictions?matchId=12345"
```

### **Create Prediction**
```bash
curl -X POST "http://localhost:3000/api/v1/predictions" \
  -H "Content-Type: application/json" \
  -d "{
    \"matchId\": 12345,
    \"predictedWinner\": \"HOME_TEAM\",
    \"confidence\": 0.75
  }"
```

## 💰 **Betting Analysis**

### **Get Betting Analysis**
```bash
curl "http://localhost:3000/api/v1/betting/analyze?matchId=12345"
```

### **Get Value Bets**
```bash
curl "http://localhost:3000/api/v1/betting/value-bets?competitionId=2021"
```

## 📊 **Analytics**

### **Get Team Analytics**
```bash
curl "http://localhost:3000/api/v1/analytics/teams/1"
```

### **Get Competition Analytics**
```bash
curl "http://localhost:3000/api/v1/analytics/competitions/2021"
```

### **Get Performance Metrics**
```bash
curl "http://localhost:3000/api/v1/analytics/performance?days=30"
```

## ⚙️ **Admin & Setup**

### **System Status**
```bash
curl "http://localhost:3000/api/v1/admin/status"
```

### **Setup System (Regular)**
```bash
curl -X POST "http://localhost:3000/api/v1/admin/setup" \
  -H "Content-Type: application/json" \
  -d "{
    \"includeTeams\": true,
    \"includeMatches\": true,
    \"daysBack\": 30
  }"
```

### **Setup System (Conservative)**
```bash
curl -X POST "http://localhost:3000/api/v1/admin/setup-conservative" \
  -H "Content-Type: application/json" \
  -d "{
    \"includeTeams\": true,
    \"includeMatches\": true,
    \"daysBack\": 30
  }"
```

### **Setup System (Free Tier Optimized)** ⭐ **NEW!**
```bash
curl -X POST "http://localhost:3000/api/v1/admin/setup-free-tier" \
  -H "Content-Type: application/json" \
  -d "{
    \"includeTeams\": true,
    \"includeMatches\": true,
    \"daysBack\": 365
  }"
```

### **Run Background Job**
```bash
curl -X POST "http://localhost:3000/api/v1/admin/jobs/updateMatches/run"
```

### **Health Check**
```bash
curl "http://localhost:3000/api/v1/admin/health"
```

### **Clear Cache**
```bash
curl -X POST "http://localhost:3000/api/v1/admin/cache/clear"
```

### **Data Cleanup**
```bash
curl -X POST "http://localhost:3000/api/v1/admin/data/cleanup" \
  -H "Content-Type: application/json" \
  -d "{\"daysToKeep\": 730}"
```

## 📝 **Response Format**

### **Success Response**
```json
{
  "success": true,
  "data": {
    // Response data here
  },
  "message": "Operation completed successfully"
}
```

### **Error Response**
```json
{
  "success": false,
  "error": {
    "message": "Error description",
    "details": "Detailed error information"
  }
}
```

## 🔒 **Authentication & Rate Limiting**

- **Authentication**: Currently not required (development mode)
- **Rate Limiting**: Respects Football-Data.org API limits (10 req/min for free tier)
- **CORS**: Enabled for development

## 📚 **Data Models**

### **Match Structure**
```json
{
  "id": 12345,
  "homeTeamId": 1,
  "awayTeamId": 2,
  "homeTeamScore": 2,
  "awayTeamScore": 1,
  "status": "FINISHED",
  "winner": "HOME_TEAM",
  "utcDate": "2024-01-15T20:00:00Z",
  "competitionId": 2021,
  "season": 2024
}
```

### **Team Structure**
```json
{
  "id": 1,
  "name": "Manchester United",
  "shortName": "Man Utd",
  "tla": "MUN",
  "venueCapacity": 74140,
  "competitionId": 2021
}
```

### **Competition Structure**
```json
{
  "id": 2021,
  "name": "Premier League",
  "code": "PL",
  "type": "LEAGUE",
  "plan": "TIER_ONE",
  "country": "England",
  "countryCode": "GB"
}
```

## 🚀 **Quick Start Examples**

### **1. Check System Health**
```bash
curl http://localhost:3000/health
```

### **2. Setup Data Collection**
```bash
curl -X POST "http://localhost:3000/api/v1/admin/setup-free-tier" \
  -H "Content-Type: application/json" \
  -d "{\"includeTeams\":true,\"includeMatches\":true,\"daysBack\":365}"
```

### **3. Train AI Model**
```bash
curl -X POST "http://localhost:3000/api/v1/admin/ai/train" \
  -H "Content-Type: application/json" \
  -d "{\"modelTypes\":[\"random_forest\"],\"maxTrainingTime\":15}"
```

### **4. Make Prediction**
```bash
curl -X POST "http://localhost:3000/api/v1/admin/ai/predict" \
  -H "Content-Type: application/json" \
  -d "{\"matchId\":12345}"
```

## 📖 **Additional Resources**

- **AI Training Guide**: `AI_TRAINING_GUIDE.md`
- **Docker Deployment**: `DOCKER_DEPLOYMENT.md`
- **Project Plan**: `plan.md`

---

**Happy Coding! 🚀⚽**
