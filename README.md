# Netlify Crawllee Social Scraper v5 (Webshare Targeting)

This version is optimized for lead-sheet enrichment and Webshare-based crawling.

## New in v5
- Lead sheet CSV mapping
- Output preserves original lead columns
- Country/session proxy controls in the UI
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

## Deploy to Netlify
- Push to GitHub
- Import into Netlify
- Build command: `node build-noop.js`
- Publish directory: `public`
- Functions directory: `netlify/functions`
- Add Webshare env vars in Site settings

## Deploy to Vercel
- Push to GitHub
- Import into Vercel
- Framework preset: `Other`
- Root directory: project root
- Build command: `node build-noop.js`
- Output directory: leave empty (routing handled by `vercel.json`)
- Add Webshare env vars in Project Settings

## Notes
- Country/session settings are implemented as labels carried through the app and request session IDs. Exact country pinning depends on the proxy endpoint format your Webshare plan supports.
- For large jobs, move this logic to a worker environment.
