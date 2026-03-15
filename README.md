# FoodBankFinder

FoodBankFinder is a full-stack UK food bank atlas designed for fast discovery, clear support details, and scalable ingestion of public datasets.

## Stack

- Frontend: React, TypeScript, Vite, TailwindCSS, Leaflet, `use-supercluster`
- Backend: Node.js, Express, PostgreSQL + PostGIS, Axios, Cheerio, cron jobs
- Data: GiveFood national API, Trussell Trust, IFAN, OpenStreetMap Overpass API
- Runtime target: Vercel (frontend) + Render/Railway (backend)

## Monorepo layout

```text
FoodBankFinder/
  frontend/
  backend/
  scripts/
  database/
  shared/
```

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Start PostgreSQL + PostGIS:

```bash
docker compose up -d db
```

3. Copy environment files:

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env
```

4. Run backend + frontend + shared package watch mode:

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`

## Database

Schema: `database/schema.sql`

Core table: `foodbanks`

- Unified normalized schema for national food bank locations
- PostGIS `geom` for radius queries
- Spatial and text indexes
- Duplicate protection via `name + postcode` matching during ingestion

## Ingestion scripts

Run individually:

```bash
npm run ingest:foodbanks
npm run ingest:trussell
npm run ingest:ifan
npm run ingest:osm
npm run normalize
```

Source behavior:

- GiveFood: uses `https://www.givefood.org.uk/api/2/foodbanks/`, expands location entries, normalizes records, and reloads the `foodbanks` table.
- Trussell Trust: uses `TRUSSELL_TRUST_DATA_URL` when provided, else fallback scrape
- IFAN: uses `IFAN_DATA_URL` when provided, else fallback scrape
- OSM: pulls UK-wide food-bank tags through Overpass API

## Background jobs

Run scheduler:

```bash
npm run jobs
```

Jobs implemented:

- `daily_update_foodbanks`
- `weekly_rebuild_dataset`
- `source_health_check`

## API routes

- `GET /api/foodbanks`
  - filters: `lat`, `lng`, `radius`, `postcode`, `open_now`, `referral_required`, `organisation`
- `GET /api/foodbanks/nearby?lat=&lng=&radius=`
- `GET /api/foodbanks/:id`
- `GET /api/foodbanks/search?postcode=&city=&organisation=&q=`
- `GET /api/foodbanks/stats`
- `GET /api/foodbanks/organisations`

## Frontend features

- UK map explorer with clustering
- Auto-location with UK fallback
- Glowing markers + glass panels + dark atlas styling
- Search and filter sidebar
- Detail panel with opening info, referral status, links, and Google directions

## Notes on source extensibility

Providers are modular in `backend/src/ingestion/providers`. Add future local council ingestors by implementing the `IngestionProvider` interface and plugging into the ingestion/job runners.
