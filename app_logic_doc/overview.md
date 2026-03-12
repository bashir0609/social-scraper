# Project Overview: Social Scraper

This project is a high-performance web scraper designed for local or Vercel deployment. It focuses on enriching lead sheets with social media URLs, contact information, and technical metadata (ads.txt/app-ads.txt).

## Core Architecture

- **Frontend**: A single-page application (`index.html`) using Vanilla JS for CSV handling, UI state management, and interaction with the backend API.
- **Backend**: A Vercel API route backed by a shared scraper module, utilizing:
  - **Crawllee**: For robust crawling, request queuing, and DOM parsing (Cheerio).
  - **got-scraping**: For high-level HTTP requests with browser-like signatures.
  - **Webshare Proxy Integration**: Native support for automatic proxy rotation from server-side environment variables.

## Goal

The primary goal is to provide a user-friendly interface for bulk scraping social media profiles and contact details from a list of domains or a CSV file, while preserving original data rows for seamless outreach workflows.
