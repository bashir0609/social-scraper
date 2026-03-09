# Deployment Guide: Netlify

## Prerequisites
- Netlify CLI installed (optional, for local dev).
- A Webshare proxy account.

## Netlify Setup
1.  **Connect Repo**: Push the code to GitHub/GitLab and connect to Netlify.
2.  **Build Settings**:
    - Build Command: `node build-noop.js` (no compilation needed).
    - Publish Directory: `public`.
    - Functions Directory: `netlify/functions`.
3.  **Environment Variables**: Add your `WEBSHARE_PROXY_*` variables in the Site Settings.

## Local Development
Run `netlify dev` to start the local emulator:
```bash
npm install --ignore-scripts # Use ignore-scripts on Node v25+
netlify dev
```
The scraper will be available at `http://localhost:8888`.
