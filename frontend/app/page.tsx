'use client';

import { useState, useEffect } from 'react';

const STAGE_LABELS: Record<string, string> = {
  received: 'Job received…',
  scraping_started: 'Reading the page…',
  scraping_complete: 'Page read successfully…',
  summarizing_started: 'Asking the AI to summarize…',
  done: 'Done!',
  failed: 'Something went wrong.',
};

type Result = {
  _id: string;
  jobId: string;
  topic: string;
  url: string;
  summary?: string;
  status?: string;
  error?: string;
  createdAt: string;
};

export default function Home() {
  const [topic, setTopic] = useState('');
  const [url, setUrl] = useState('');
  const [stage, setStage] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);

  async function loadResults() {
    const res = await fetch('http://localhost:3000/research');
    const data = await res.json();
    setResults(data);
  }

  useEffect(() => {
    loadResults();
  }, []);

  async function handleSubmit() {
    setStage(null);
    setSummary(null);
    setError(null);

    const res = await fetch('http://localhost:3000/research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, url }),
    });
    const data = await res.json();
    const jobId = data.jobId;

    const source = new EventSource(`http://localhost:3000/research/${jobId}/stream`);

    source.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      setStage(payload.stage);

      if (payload.stage === 'done') {
        setSummary(payload.summary);
        source.close();
        loadResults();
      }

      if (payload.stage === 'failed') {
        setError(payload.message);
        source.close();
        loadResults();
      }
    };

    source.onerror = () => {
      source.close();
    };
  }

  return (
    <main className="max-w-2xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">AI Research Feed</h1>

      <div className="flex flex-col gap-4">
        <input
          className="border rounded px-3 py-2"
          placeholder="Research topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
        <input
          className="border rounded px-3 py-2"
          placeholder="URL to summarize"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button
          className="bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700"
          onClick={handleSubmit}
        >
          Summarize
        </button>
      </div>

      {stage && stage !== 'done' && stage !== 'failed' && (
        <p className="mt-6 text-blue-700 animate-pulse">{STAGE_LABELS[stage]}</p>
      )}

      {summary && (
        <div className="mt-6 border rounded p-4 bg-gray-50">
          <h2 className="font-semibold mb-2">Summary</h2>
          <p className="text-gray-800">{summary}</p>
        </div>
      )}

      {error && (
        <div className="mt-6 border border-red-300 rounded p-4 bg-red-50">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      <h2 className="text-2xl font-bold mt-10 mb-4">Past Results</h2>
      <div className="flex flex-col gap-4">
        {results.map((r) => (
          <div key={r._id} className="border rounded p-4">
            <div className="flex justify-between items-start gap-4">
              <h3 className="font-semibold">{r.topic}</h3>
              <span className="text-xs text-gray-500 whitespace-nowrap">
                {new Date(r.createdAt).toLocaleString()}
              </span>
            </div>
            <a
              href={r.url}
              target="_blank"
              className="text-sm text-blue-600 break-all"
            >
              {r.url}
            </a>
            {r.status === 'failed' ? (
              <p className="mt-2 text-red-700 text-sm">Failed to summarize this page.</p>
            ) : (
              <p className="mt-2 text-gray-800 text-sm">{r.summary}</p>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}