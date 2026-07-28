# AI Research Feed

A full-stack AI web app that takes a research topic and a URL, scrapes the page, and generates a grounded summary using a Retrieve-Augment-Generate (RAG) pipeline — with live progress updates streamed to the browser.

Submit a topic + URL, watch the pipeline work in real time (scraping → summarizing → done), read the AI summary, and browse a history of past results.

## How it works

The app is built around a "feels instant" design: the API responds immediately by queuing a background job, while a separate worker handles the slow work (scraping + AI) asynchronously.
Frontend → API → Queue (BullMQ/Valkey) → Worker → Scrape (Playwright) → Summarize (OpenRouter) → MongoDB
↓
Live progress streamed back: Worker → Valkey pub/sub → API (SSE) → Browser

1. The user submits a topic + URL from the frontend.
2. The API validates the input, enqueues a job, and returns a job ID in under 500ms.
3. The frontend opens an SSE stream to follow the job's progress live.
4. A worker picks up the job, checks a 1-hour cache, scrapes the page with Playwright if needed, and caches the result.
5. The worker trims the text, builds a prompt, and calls an AI model via OpenRouter (RAG).
6. The result is saved to MongoDB and a `done` event is streamed to the browser.
7. Failed jobs retry up to 3 times with exponential backoff before failing permanently.

## Tech stack

- **Frontend:** Next.js (React) + Tailwind CSS
- **Backend API:** NestJS
- **Job queue:** BullMQ, backed by Valkey (Redis-compatible)
- **Worker:** standalone Node.js process
- **Web scraping:** Playwright (headless Chromium)
- **AI access:** OpenRouter
- **Database:** MongoDB
- **Live updates:** Server-Sent Events (SSE)

## Prerequisites

- Node.js v22+
- Docker & Docker Compose
- A free OpenRouter API key ([get one here](https://openrouter.ai/keys))

## Setup

**1. Clone the repo**
```bash
git clone https://github.com/ahmedbettaieb11/ai-research-feed.git
cd ai-research-feed
```

**2. Set up environment variables**

Copy the example files and fill in your values:
```bash
cp api/.env.example api/.env
cp worker/.env.example worker/.env
```
Then edit `worker/.env` and add your OpenRouter API key.

**3. Install dependencies** (each part has its own)
```bash
cd api && npm install && cd ..
cd worker && npm install && cd ..
cd frontend && npm install && cd ..
```

**4. Install Playwright's browser** (for the worker)
```bash
cd worker && npx playwright install chromium && cd ..
```

## Running the app

Start each part in its own terminal, in this order:

**1. Infrastructure (Valkey + MongoDB):**
```bash
docker compose up -d
```

**2. API** (start before the frontend so it claims port 3000):
```bash
cd api && npm run start:dev
```

**3. Worker:**
```bash
cd worker && npx tsx src/index.ts
```

**4. Frontend:**
```bash
cd frontend && npm run dev
```

Then open **http://localhost:3001** in your browser.

## Features

- Submit a research topic and URL for AI summarization
- Live progress updates via SSE (no polling)
- 1-hour cache to avoid re-scraping the same URL
- Automatic retries with exponential backoff on failure
- Persistent history of all past results
- Clear error states for failed jobs

## Notes

- API keys and connection strings live in `.env` files, which are git-ignored. Use the `.env.example` templates as a starting point.
- Free OpenRouter models can be rate-limited or occasionally unavailable; the retry logic handles most transient failures automatically.