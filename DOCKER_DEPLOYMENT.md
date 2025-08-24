# Docker Deployment Guide for Football AI API

## Overview
This guide explains how to deploy the Football AI API using Docker and Docker Compose.

## Prerequisites
- Docker and Docker Compose installed
- At least 4GB of available RAM
- Ports 3000, 5432, 6379, 80, 443 available

## Quick Start

### 1. Environment Setup
Copy the environment file and update values as needed:
```bash
cp env.example .env
```

**Important**: Update these values in `.env`:
- `FOOTBALL_API_KEY`: Your Football-Data.org API key
- `JWT_SECRET`: A strong secret for JWT tokens
- `DB_PASSWORD`: Database password
- `REDIS_PASSWORD`: Redis password

### 2. Start Services
```bash
# Start all services
docker-compose up -d

# Start with development tools
docker-compose --profile dev up -d

# Start with monitoring
docker-compose --profile monitoring up -d
```

### 3. Check Status
```bash
docker-compose ps
docker-compose logs api
```

## Service Architecture

### Core Services
- **API**: Node.js application (port 3000)
- **PostgreSQL**: Database (port 5432)
- **Redis**: Cache and session store (port 6379)
- **Nginx**: Reverse proxy (ports 80, 443)

### Optional Services
- **Redis Commander**: Redis management UI (port 8081)
- **pgAdmin**: Database management (port 8080)
- **Prometheus**: Metrics collection (port 9090)
- **Grafana**: Monitoring dashboard (port 3001)

## Configuration

### Database
- Database: `football_ai_db`
- User: `postgres`
- Default password: `321007`

### Redis
- Default password: `321007`
- Persistence enabled with AOF

### API Configuration
- Rate limiting: 100 requests per 15 minutes
- CORS enabled for localhost:3000
- JWT token expiration: 24 hours

## Health Checks

The API includes health checks at `/health` endpoint:
```bash
curl http://localhost:3000/health
```

## Troubleshooting

### Common Issues

1. **Port conflicts**: Ensure ports are not used by other services
2. **Permission errors**: Check file permissions for logs, models, and data directories
3. **Database connection**: Wait for PostgreSQL to be fully ready
4. **Redis connection**: Ensure Redis password matches in configuration

### Logs
```bash
# View API logs
docker-compose logs -f api

# View database logs
docker-compose logs -f postgres

# View Redis logs
docker-compose logs -f redis
```

### Reset Everything
```bash
# Stop and remove all containers
docker-compose down -v

# Remove all volumes
docker volume prune

# Rebuild and start
docker-compose up --build -d
```

## Production Considerations

1. **Environment Variables**: Use proper secrets management
2. **SSL/TLS**: Enable HTTPS in production
3. **Backup**: Set up database and Redis backups
4. **Monitoring**: Enable Prometheus and Grafana profiles
5. **Scaling**: Consider using Docker Swarm or Kubernetes

## API Endpoints

- Health: `GET /health`
- API Base: `GET /api/v1/`
- Competitions: `GET /api/v1/competitions`
- Teams: `GET /api/v1/teams`
- Matches: `GET /api/v1/matches`
- Predictions: `GET /api/v1/predictions`
- Betting: `GET /api/v1/betting`
- Analytics: `GET /api/v1/analytics`
- Admin: `GET /api/v1/admin`

## Performance Tuning

- Database connection pool: 10 max connections in production
- Redis connection pooling enabled
- Rate limiting configured
- Compression middleware enabled
- Helmet security headers configured
