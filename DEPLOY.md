# OpenStream Deployment Guide for Unraid

This guide walks you through deploying OpenStream on your Unraid server using Docker Hub + GitHub Actions for automatic builds.

## Architecture Overview

```
                    ┌─────────────────────┐
                    │     GitHub Repo     │
                    └──────────┬──────────┘
                               │ push to main
                               ▼
                    ┌─────────────────────┐
                    │   GitHub Actions    │
                    │  (builds + pushes)  │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │     Docker Hub      │
                    │ (stores the image)  │
                    └──────────┬──────────┘
                               │
                               ▼
┌───────────────────────────────────────────────────────┐
│                    Unraid Server                       │
│  ┌─────────────┐    ┌─────────────┐    ┌───────────┐  │
│  │ Watchtower  │───▶│ OpenStream  │◀───│  Music    │  │
│  │(auto-update)│    │  Container  │    │  Library  │  │
│  └─────────────┘    └──────┬──────┘    └───────────┘  │
│                            │                           │
│                            ▼                           │
│                    ┌─────────────┐                     │
│                    │ Cloudflare  │                     │
│                    │   Tunnel    │                     │
│                    └──────┬──────┘                     │
└───────────────────────────┼───────────────────────────┘
                            │
                            ▼
                    ┌─────────────────────┐
                    │   Your Devices      │
                    │ (phone, web, etc.)  │
                    └─────────────────────┘
```

## Benefits of This Approach

- ✅ **Auto-builds**: Push code → Image built automatically
- ✅ **Auto-updates**: Watchtower pulls new images and restarts container
- ✅ **Persistent storage**: Database and artwork survive updates
- ✅ **Start on boot**: Container auto-starts with Unraid
- ✅ **Multi-arch**: Builds for both AMD64 and ARM64

---

## Prerequisites

1. **GitHub Account** with a repository for this project
2. **Docker Hub Account** (free at [hub.docker.com](https://hub.docker.com))
3. **Unraid 6.x+** with Docker enabled
4. **Music library** accessible via an Unraid share

---

## Step 1: Set Up GitHub Secrets

In your GitHub repository, go to **Settings → Secrets and variables → Actions** and add:

| Secret Name | Value |
|------------|-------|
| `DOCKERHUB_USERNAME` | Your Docker Hub username |
| `DOCKERHUB_TOKEN` | Docker Hub access token ([create one here](https://hub.docker.com/settings/security)) |

> **Note**: Create an Access Token (not your password!) at Docker Hub → Account Settings → Security → New Access Token

---

## Step 2: Push to GitHub

```bash
cd /home/adam/Documents/music-streamer
git add .
git commit -m "Add Docker deployment configuration"
git push origin main
```

Check **Actions** tab in your GitHub repo to watch the build. It will:
1. Build the Docker image
2. Push to `cowmilk69/openstream:latest` on Docker Hub

---

## Step 3: Deploy on Unraid

### Option A: Docker Compose (Recommended)

SSH into your Unraid server:

```bash
ssh root@192.168.12.153
```

Create a directory and download the compose file:

```bash
mkdir -p /mnt/user/appdata/openstream
cd /mnt/user/appdata/openstream

# Download the compose file (or create it manually)
wget https://raw.githubusercontent.com/cowmilk69/openstream/main/docker-compose.unraid.yml -O docker-compose.yml
```

Edit the file with your settings:

```bash
nano docker-compose.yml
```

**Required changes:**
1. Replace `YOUR_DOCKERHUB_USERNAME` with your Docker Hub username
2. Replace `/mnt/user/Music` with your actual music share path
3. Generate and set `JWT_SECRET`:
   ```bash
   openssl rand -base64 32
   ```

Start the containers:

```bash
docker-compose up -d
```

### Option B: Unraid Docker UI

1. Go to **Docker** tab in Unraid
2. Click **Add Container**
3. Configure:

| Setting | Value |
|---------|-------|
| **Name** | openstream |
| **Repository** | `cowmilk69/openstream:latest` |
| **Network** | Bridge |
| **Port** | Host `3001` → Container `3001` |

4. Add **Paths** (Volumes):

| Container Path | Host Path | Mode |
|----------------|-----------|------|
| `/music` | `/mnt/user/Music` (your music share) | Read Only |
| `/data` | `/mnt/user/appdata/openstream/data` | Read/Write |
| `/app/server/storage/art` | `/mnt/user/appdata/openstream/art` | Read/Write |

5. Add **Variables** (Environment):

| Name | Value |
|------|-------|
| `PORT` | `3001` |
| `MUSIC_LIBRARY_PATH` | `/music` |
| `DATABASE_PATH` | `/data/library.db` |
| `ARTWORK_PATH` | `/app/server/storage/art` |
| `JWT_SECRET` | (generate with `openssl rand -base64 32`) |
| `NODE_ENV` | `production` |

6. Set **Extra Parameters**: `--restart=always`
7. Click **Apply**

---

## Step 4: Add Watchtower for Auto-Updates (Optional)

Watchtower automatically pulls new images when you push updates.

If not using docker-compose, add a second container in Unraid:

| Setting | Value |
|---------|-------|
| **Name** | watchtower |
| **Repository** | `containrrr/watchtower` |
| **Port** | (none needed) |

Add **Path**:
| Container Path | Host Path | Mode |
|----------------|-----------|------|
| `/var/run/docker.sock` | `/var/run/docker.sock` | Read/Write |

Add **Variables**:
| Name | Value |
|------|-------|
| `WATCHTOWER_POLL_INTERVAL` | `300` (check every 5 minutes) |
| `WATCHTOWER_CLEANUP` | `true` |

---

## Step 5: Cloudflare Tunnel Setup

### Install cloudflared on Unraid

```bash
# Download
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared
```

### Create and Configure Tunnel

```bash
# Login to Cloudflare
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create openstream

# Route DNS
cloudflared tunnel route dns openstream music.yourdomain.com
```

Create config file `/mnt/user/appdata/cloudflared/config.yml`:

```yaml
tunnel: <your-tunnel-id>
credentials-file: /root/.cloudflared/<your-tunnel-id>.json

ingress:
  - hostname: music.yourdomain.com
    service: http://localhost:3001
  - service: http_status:404
```

### Make Tunnel Persistent

Add to Unraid's Go script (`/boot/config/go`):

```bash
# Start cloudflared tunnel
/usr/local/bin/cloudflared tunnel --config /mnt/user/appdata/cloudflared/config.yml run openstream &
```

Or run immediately:

```bash
nohup cloudflared tunnel --config /mnt/user/appdata/cloudflared/config.yml run openstream &
```

---

## Step 6: First-Time Setup

1. Access the server:
   - **Local**: `http://192.168.12.153:3001`
   - **External**: `https://music.yourdomain.com`

2. Create your admin account (first user becomes admin)

3. Go to Settings and trigger a library scan for `/music`

4. Configure your mobile app with the server URL

---

## Updating

With the CI/CD pipeline:

1. Make changes locally
2. Push to GitHub: `git push origin main`
3. GitHub Actions builds new image
4. Watchtower automatically pulls and restarts (within 5 minutes)

**That's it!** No manual SSH needed for updates.

---

## Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `DATABASE_PATH` | `./library.db` | SQLite database location |
| `MUSIC_LIBRARY_PATH` | `/music` | Root path for music scanning |
| `ARTWORK_PATH` | `./storage/art` | Artwork cache directory |
| `JWT_SECRET` | (required) | Secret for auth tokens |
| `NODE_ENV` | `development` | Set to `production` |
| `LASTFM_API_KEY` | - | Last.fm API key |
| `LASTFM_API_SECRET` | - | Last.fm API secret |

---

## Troubleshooting

### Check container logs
```bash
docker logs openstream
```

### Container won't start
```bash
# Ensure data directory exists and is writable
mkdir -p /mnt/user/appdata/openstream/data
mkdir -p /mnt/user/appdata/openstream/art
chmod -R 777 /mnt/user/appdata/openstream
```

### Force pull latest image
```bash
docker pull cowmilk69/openstream:latest
docker-compose up -d
```

### View running containers
```bash
docker ps
```

### Check if Watchtower is working
```bash
docker logs watchtower
```
