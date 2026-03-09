# API Specification: /api/scrape

The scraper core is exposed via a Netlify Function.

## Endpoint
`POST /api/scrape` (Redirected from `/.netlify/functions/scrape` via `netlify.toml`)

## Request Body (JSON)
| Field | Type | Description | Default |
| :--- | :--- | :--- | :--- |
| `urls` | `Array<string>` | List of URLs to scrape (max 200) | Required |
| `originalRows` | `Array<Object>` | Original lead data rows for merging | `[]` |
| `originalHeader` | `Array<string>` | Original CSV header for merging | `[]` |
| `detectedUrlColumn`| `string` | The column in `originalRows` containing the URL | `''` |
| `outputMode` | `string` | `merge` (preserve rows) or `flat` (only scrap results) | `merge` |
| `maxPagesPerSite` | `number` | Max pages to visit per domain (1-25) | `5` |
| `maxDepth` | `number` | Crawling depth from root (0-3) | `1` |
| `concurrency` | `number` | Concurrent site scraping jobs (1-10) | `3` |
| `timeoutMs` | `number` | Request timeout per page | `10000` |
| `proxyCountry` | `string` | Country label for proxy rotation | `''` |
| `proxySession` | `string` | Session ID for sticky proxy sessions | `''` |

## Response Body (JSON)
- `rows`: The resulting data rows (merged or flat).
- `header`: The resulting CSV header.
- `proxyEnabled`: Boolean indicating if proxies were used.
- `proxyCount`: Number of configured proxy URLs.
