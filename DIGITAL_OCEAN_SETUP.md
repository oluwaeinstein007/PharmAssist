# Digital Ocean Deployment Setup Guide

## Prerequisites

1. **Digital Ocean Account**: Create a droplet with Ubuntu 20.04 or later
2. **Domain Name**: Point your domain to the Digital Ocean droplet IP
3. **GitHub Secrets**: Configure the following secrets in your GitHub repository

## GitHub Secrets Configuration

Add these secrets to your GitHub repository:

1. Go to **Settings → Secrets and variables → Actions**
2. Add the following secrets:

| Secret Name         | Value                                           |
| ------------------- | ----------------------------------------------- |
| `DO_SERVER_HOST`    | Your Digital Ocean droplet IP address or domain |
| `DO_SERVER_USER`    | SSH username (default: `root` or your user)     |
| `DO_SERVER_SSH_KEY` | Private SSH key for Digital Ocean droplet       |

## Digital Ocean Droplet Setup

### 1. Create SSH Key Pair

```bash
ssh-keygen -t ed25519 -C "PharmAssist-Deploy" -f pharma-deploy-key
```

Add the public key to your Digital Ocean droplet during creation.

### 2. Install Docker and Docker Compose

Connect to your droplet and run:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add your user to docker group (optional, skip if using root)
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify installation
docker --version
docker-compose --version
```

### 3. Clone Repository

```bash
# Clone your project
git clone https://github.com/oluwaeinstein007/PharmAssist.git
cd PharmAssist
```

### 4. Setup Environment Variables

```bash
# Copy the example env file
cp .env.example .env

# Edit with your actual values
nano .env

# Important: Update the following
# - LLM_API_KEY
# - GOOGLE_PROJECT_ID
# - QDRANT_HOST
# - QDRANT_KEY
# - UNIFIED_PRODUCTS_BASE_URL
```

### 5. Setup Nginx Reverse Proxy (Optional but Recommended)

```bash
# Install Nginx
sudo apt install nginx -y

# Create Nginx config
sudo nano /etc/nginx/sites-available/pharma-assist
```

Add this configuration:

```nginx
upstream pharma_frontend {
    server 127.0.0.1:3000;
}

upstream pharma_mcp {
    server 127.0.0.1:4000;
}

server {
    listen 80;
    server_name your-domain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL Configuration (use Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Frontend
    location / {
        proxy_pass http://pharma_frontend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # MCP Backend API
    location /api/ {
        proxy_pass http://pharma_mcp/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
    }

    # Health check endpoint
    location /health {
        access_log off;
        proxy_pass http://pharma_mcp/health;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/pharma-assist /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 6. Setup SSL with Let's Encrypt

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get certificate
sudo certbot certonly --nginx -d your-domain.com

# Auto-renew certificates
sudo systemctl enable certbot.timer
```

### 7. Manual Deployment (First Time)

```bash
cd ~/PharmAssist

# Build and start containers
docker-compose up -d

# View logs
docker-compose logs -f

# Check service status
docker-compose ps
```

## Automated Deployment Flow

1. Push code to `main` branch
2. GitHub Actions will:
   - Run tests and linting
   - Build Docker images
   - Push to GitHub Container Registry (ghcr.io)
   - SSH into Digital Ocean droplet
   - Pull latest images and restart containers

## Monitoring and Maintenance

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f mcp-backend
docker-compose logs -f frontend
```

### Update Services

```bash
# Pull latest images
docker-compose pull

# Restart services
docker-compose restart

# Or full restart
docker-compose down
docker-compose up -d
```

### Backup Data

```bash
# Create backup
docker-compose exec mcp-backend tar czf - /app/data > backup-$(date +%Y%m%d).tar.gz
```

### Resource Usage

```bash
# Check Docker stats
docker stats

# Clean up unused resources
docker system prune -a
```

## Troubleshooting

### Container won't start

```bash
# Check logs
docker-compose logs mcp-backend
docker-compose logs frontend

# Verify environment variables
docker-compose config | grep environment
```

### Connection issues

```bash
# Test backend connectivity
curl http://localhost:4000/health

# Test from host
curl http://your-domain.com/health
```

### SSL certificate issues

```bash
# Renew certificates manually
sudo certbot renew --force-renewal

# Check certificate expiry
sudo certbot certificates
```

## Security Best Practices

1. **Environment Variables**: Keep `.env` files secure and never commit to version control
2. **SSH Keys**: Use strong, unique SSH keys for deployment
3. **Firewall**: Configure Digital Ocean firewall rules
4. **Updates**: Regularly update Docker images and base OS
5. **Secrets**: Use GitHub Secrets for sensitive data
6. **Backups**: Regular backups of critical data
7. **Monitoring**: Setup alerts for service failures

## Scaling Considerations

- Use Docker Swarm or Kubernetes for multiple instances
- Setup load balancing with multiple app servers
- Use managed databases instead of local storage
- Implement caching with Redis
- Monitor performance metrics
