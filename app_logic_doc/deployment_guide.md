# Deployment Guide: Vercel

## Prerequisites
- Vercel account or Vercel CLI for local dev.
- A Webshare proxy account.

## Vercel Setup
1.  **Connect Repo**: Push the code to GitHub/GitLab and import it into Vercel.
2.  **Build Settings**:
    - Build Command: `node build-noop.js` (no compilation needed).
    - Framework Preset: `Other`.
    - Output Directory: leave empty.
3.  **Environment Variables**: Add your `WEBSHARE_PROXY_*` variables in Project Settings.

## Local Development
Run Vercel dev to start the local server:
```bash
npm install
npx --yes vercel dev --listen 8888
```
The scraper will be available at `http://localhost:8888`.
