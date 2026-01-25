# Docker Deployment Quick Start

This project is configured for Docker containerization and automated CI/CD deployment to Digital Ocean.

## Quick Start - Local Development

### Using Docker Compose

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Services

- **Frontend**: http://localhost:3000 (Next.js)
- **Backend (MCP)**: http://localhost:4000 (Node.js + HTTP)

## Building Images Individually

### Frontend

```bash
docker build -f frontend/Dockerfile -t pharmassist-frontend:latest ./frontend
docker run -p 3000:3000 pharmassist-frontend:latest
```

### Backend (MCP)

```bash
docker build -f Dockerfile -t pharmassist-backend:latest .
docker run -p 4000:4000 -e PORT=4000 pharmassist-backend:latest
```

## Environment Configuration

Create a `.env` file in the project root:

```env
# LLM Configuration
LLM_PROVIDER=gemini
LLM_API_KEY=your_api_key
GOOGLE_PROJECT_ID=your_project_id

# Qdrant Vector Database
QDRANT_HOST=your_qdrant_host
QDRANT_KEY=your_qdrant_key

# Other services
UNIFIED_PRODUCTS_BASE_URL=https://cc.medplusnig.com/api
```

## CI/CD with GitHub Actions

Two workflows are configured:

1. **test.yml** - Runs on PRs and dev pushes

   - Linting and tests
   - Frontend build validation

2. **deploy.yml** - Runs on main branch pushes
   - Build and test
   - Push Docker images to ghcr.io
   - Deploy to Digital Ocean via SSH

### Required GitHub Secrets

```
DO_SERVER_HOST        - Digital Ocean droplet IP/domain
DO_SERVER_USER        - SSH username
DO_SERVER_SSH_KEY     - Private SSH key for deployment
```

## Production Deployment

See [DIGITAL_OCEAN_SETUP.md](./DIGITAL_OCEAN_SETUP.md) for complete Digital Ocean setup and deployment guide.

## File Structure

```
├── Dockerfile              # Backend (MCP) Docker image
├── docker-compose.yml      # Docker Compose orchestration
├── frontend/
│   └── Dockerfile         # Frontend (Next.js) Docker image
├── .github/workflows/
│   ├── deploy.yml         # CI/CD deployment workflow
│   └── test.yml           # Test and lint workflow
├── DIGITAL_OCEAN_SETUP.md # Digital Ocean setup guide
└── .env.example           # Environment variables template
```

## Docker Best Practices

- ✅ Multi-stage builds for smaller images
- ✅ Health checks configured
- ✅ Proper layer caching
- ✅ Non-root user (when possible)
- ✅ Environment variable configuration
- ✅ Service dependencies managed

## Useful Commands

```bash
# View container logs
docker-compose logs -f [service-name]

# Execute command in container
docker-compose exec mcp-backend sh

# Rebuild services
docker-compose build --no-cache

# View service status
docker-compose ps

# Clean up all Docker resources
docker system prune -a
```
