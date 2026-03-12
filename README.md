# Vercel Social Scraper v5 (Automatic Proxy Rotation)

This version is optimized for lead-sheet enrichment and Webshare-based crawling with automatic backend proxy rotation.

## New in v5
- Lead sheet CSV mapping
- Output preserves original lead columns
- Automatic proxy rotation from backend env vars
- Contact-first crawl mode
- Optional skip-social mode
- Better contact page detection and prioritization
- Row-level result merge for outreach workflows

## Supported input columns
The UI auto-detects common website/domain columns:
- `domain`
- `website`
- `url`
- `site`
- `homepage`

If you upload a wider lead CSV, v5 keeps all original columns and appends:
- `scrape_input_url`
- `scrape_final_url`
- `scrape_domain`
- `contact_page`
- `ads_txt_url`
- `ads_txt_status`
- `app_ads_txt_url`
- `app_ads_txt_status`
- `linkedin_urls`
- `facebook_urls`
- `instagram_urls`
- `twitter_urls`
- `tiktok_urls`
- `youtube_urls`
- `pinterest_urls`
- `emails_found`
- `phones_found`
- `pages_visited`
- `proxy_used`
- `scrape_status`

## Webshare environment variables
You can use any of these:
- `WEBSHARE_PROXY_URL`
- `WEBSHARE_PROXY_URLS`
- `WEBSHARE_PROXY_HOST`
- `WEBSHARE_PROXY_PORT`
- `WEBSHARE_PROXY_USERNAME`
- `WEBSHARE_PROXY_PASSWORD`
- `WEBSHARE_API_KEY`

## Deploy to Vercel
- Push to GitHub
- Import into Vercel
- Framework preset: `Other`
- Root directory: project root
- Build command: `node build-noop.js`
- Output directory: leave empty (routing handled by `vercel.json`)
- Add Webshare env vars in Project Settings

## Local Development (Docker)
You can easily run this project locally using Docker Compose without needing Node.js installed on your host machine.

1. Ensure Docker and Docker Compose are installed and running.
2. Run the following command in the project root:
   ```bash
   docker-compose up --build
   ```
3. The server will start and be available at `http://localhost:8888`.
4. Any changes you make to the local files (except `package.json`/`node_modules`) will be instantly reflected.

## Notes
- Proxy selection happens on the server automatically. The frontend does not need proxy configuration.
- For large jobs, move this logic to a worker environment.
