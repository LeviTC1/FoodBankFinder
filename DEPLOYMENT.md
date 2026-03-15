# Deployment Guide

This repo is configured for:

- Frontend: **Vercel** (static build from `frontend/dist`)
- Backend: **Render** (Node web service from monorepo root)

## 1) Deploy the frontend (Vercel)

Use the repo root as the Vercel project root.

Build settings are already in [`vercel.json`](./vercel.json):

- Install: `npm ci`
- Build: `npm run build -w shared && npm run build -w frontend`
- Output: `frontend/dist`

Set Vercel environment variable:

- `VITE_API_BASE_URL=https://<your-render-backend-url>`

## 2) Deploy the backend (Render)

A blueprint is provided in [`render.yaml`](./render.yaml).

- Build: `npm ci && npm run build -w shared && npm run build -w backend`
- Start: `npm run start -w backend`
- Health check: `/health`

Required backend env vars:

- `DATABASE_URL` (Postgres with PostGIS)
- `CORS_ORIGIN` (frontend URL or comma-separated URLs)
- `OPENAI_API_KEY` (if enrichment is enabled)

Recommended env vars (defaults already set):

- `OPENAI_MODEL=gpt-4.1-mini`
- `GIVEFOOD_API_URL=https://www.givefood.org.uk/api/2/foodbanks/`
- `OVERPASS_URL=https://overpass-api.de/api/interpreter`
- `ENRICHMENT_BATCH_SIZE=50`
- `ENRICHMENT_RATE_LIMIT_MS=1000`
- `ENRICHMENT_MIN_CONFIDENCE=0.6`

## 3) Database setup

Use PostgreSQL with PostGIS enabled.

Then run initial ingest once against production DB:

```bash
npm run ingest:foodbanks
npm run normalize:referrals
npm run coverage:build
```

## 4) Post-deploy checks

- Frontend loads and map displays data.
- Backend health endpoint returns OK:

```bash
curl https://<backend-url>/health
```

- API query works:

```bash
curl "https://<backend-url>/api/foodbanks?page=1&limit=1"
```
