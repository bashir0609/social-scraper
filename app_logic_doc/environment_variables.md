# Environment Variables & Proxy Configuration

The scraper supports Webshare proxy integration via specific environment variables.

## Supported Variables
The scraper checks these variables in order of priority:

1.  `WEBSHARE_PROXY_URLS`: A comma-separated list of full proxy URLs.
2.  `WEBSHARE_PROXY_URL`: A single full proxy URL.
3.  `WEBSHARE_PROXY_HOST`, `WEBSHARE_PROXY_PORT`, `WEBSHARE_PROXY_USERNAME`, `WEBSHARE_PROXY_PASSWORD`: For a single credential-based proxy.

## Rotation Behavior
When multiple proxy URLs are available, the backend rotates them automatically across scrape jobs.
No frontend proxy inputs are required.
