import 'dotenv/config';
import { Worker } from 'bullmq';
import { chromium } from 'playwright';
import Redis from 'ioredis';
import { MongoClient } from 'mongodb';

const connection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
};

const cache = new Redis(connection);
const publisher = new Redis(connection);
const CACHE_TTL_SECONDS = 3600;
const MAX_CHARS = 12000;

const mongo = new MongoClient(process.env.MONGO_URL!);
const results = mongo.db('research').collection('results');

async function publish(jobId: string, stage: string, data: object = {}) {
  const message = JSON.stringify({ stage, ...data });
  await publisher.publish(`progress:${jobId}`, message);
  console.log(`[job ${jobId}] 📡 ${stage}`);
}

async function scrape(url: string): Promise<string> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const text = await page.innerText('body');
    return text.replace(/\s+/g, ' ').trim();
  } finally {
    await browser.close();
  }
}

async function getPageText(url: string, jobId: string): Promise<string> {
  const cacheKey = `scrape:${url}`;
  const cached = await cache.get(cacheKey);
  if (cached) {
    console.log(`[job ${jobId}] cache HIT — skipping Playwright`);
    return cached;
  }
  console.log(`[job ${jobId}] cache MISS — launching Playwright`);
  const text = await scrape(url);
  await cache.set(cacheKey, text, 'EX', CACHE_TTL_SECONDS);
  return text;
}

async function summarize(topic: string, pageText: string): Promise<string> {
  const trimmed = pageText.slice(0, MAX_CHARS);

  const prompt = `You are a research assistant. Summarize the following web page content, focusing on anything relevant to the topic: "${topic}".

Write a clear summary in 3-5 sentences. Base your summary ONLY on the content provided below. If the content is not relevant to the topic, say so.

--- PAGE CONTENT ---
${trimmed}
--- END CONTENT ---`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenRouter ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

const worker = new Worker(
  'research',
  async (job) => {
    const { topic, url } = job.data;
    const jobId = job.id!;

    await publish(jobId, 'received', { topic, url });

    await publish(jobId, 'scraping_started');
    const text = await getPageText(url, jobId);
    await publish(jobId, 'scraping_complete', { chars: text.length });

    await publish(jobId, 'summarizing_started');
    const summary = await summarize(topic, text);

    await results.insertOne({
      jobId,
      topic,
      url,
      summary,
      createdAt: new Date(),
    });

    await publish(jobId, 'done', { summary });

    return { summary };
  },
  { connection },
);

worker.on('completed', (job) => console.log(`[job ${job.id}] ✅ completed`));

worker.on('failed', async (job, err) => {
  if (!job) return;

  const attemptsMade = job.attemptsMade;
  const maxAttempts = job.opts.attempts ?? 1;
  const isFinalAttempt = attemptsMade >= maxAttempts;

  console.log(
    `[job ${job.id}] ❌ attempt ${attemptsMade}/${maxAttempts} failed: ${err.message}`,
  );

  if (!isFinalAttempt) {
    console.log(`[job ${job.id}] will retry with backoff...`);
    return;
  }

  console.log(`[job ${job.id}] 💀 permanently failed after ${maxAttempts} attempts`);

  await results.insertOne({
    jobId: job.id,
    topic: job.data.topic,
    url: job.data.url,
    status: 'failed',
    error: err.message,
    createdAt: new Date(),
  });

  await publish(job.id!, 'failed', {
    message: 'Sorry — we could not summarize that page. Please try again.',
  });
});

async function start() {
  await mongo.connect();
  console.log('Connected to MongoDB');
  console.log('Worker started, watching the "research" queue...');
}

start();