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
