# Latex Free Eats NYC

A web app to help people with latex allergies find NYC restaurants and track kitchen food-prep glove usage.

## Stack
- **Express.js** API/server
- **React** frontend (loaded via CDN)
- **Bootstrap 5** UI styling

## Features
- Search New York City restaurants via Google Places Text Search API.
- View latest crowd-sourced glove report per restaurant (`vinyl`, `nitrile`, `latex`, `none`).
- Highlight and optionally hide restaurants with latest `latex` report.
- Submit new glove information for any restaurant.
- Persist submissions in `data/submissions.json`.
- Fallback sample restaurant data when `GOOGLE_PLACES_API_KEY` is not set.

## Setup
```bash
npm install
GOOGLE_PLACES_API_KEY=your_key_here npm start
```

Open: http://localhost:3000

### Example run with an API key
```bash
export GOOGLE_PLACES_API_KEY="<your_google_places_key>"
npm start
```

## API
- `GET /api/restaurants?query=sushi`
- `GET /api/submissions?placeId=<google_place_id>`
- `POST /api/submissions`

## Environment variables
Create a `.env` file in the project root with **one key/value per line**:

```env
GOOGLE_PLACES_API_KEY=your_google_places_key
```

`GOOGLE_MAPS_API_KEY` is also accepted as a fallback name.

## Troubleshooting Google API
If the UI does not show live Google data:

1. Confirm `/api/restaurants` returns `"googleApiConfigured": true`.
2. Confirm your key has **Places API** enabled and billing is active.
3. Confirm key restrictions allow **Places Text Search** from this server environment.
4. If the API request fails with a network error, your server cannot reach `maps.googleapis.com` (proxy/firewall issue).
