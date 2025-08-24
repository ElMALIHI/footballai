#!/bin/sh

# Create necessary directories (skip if they already exist)
mkdir -p logs models data

# Wait for database to be ready
echo "Waiting for database to be ready..."
while ! nc -z postgres 5432; do
  sleep 1
done
echo "Database is ready!"

# Wait for Redis to be ready
echo "Waiting for Redis to be ready..."
while ! nc -z redis 6379; do
  sleep 1
done
echo "Redis is ready!"

# Debug: Show environment variables
echo "Debug: Checking environment variables..."
echo "DB_HOST: $DB_HOST"
echo "DB_PORT: $DB_PORT"
echo "DB_NAME: $DB_NAME"
echo "REDIS_HOST: $REDIS_HOST"
echo "NODE_ENV: $NODE_ENV"

# Start the application
echo "Starting Football AI API..."
exec node src/app.js
