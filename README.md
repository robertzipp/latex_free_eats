# Latex Free Eats NYC

A full-stack app to help people with latex allergies find NYC restaurants and track kitchen glove usage.

## Monorepo Structure

- `server.js`: Node/Express API + static hosting for the React production build.
- `frontend/`: React application (Vite).
- Legacy `public/` CDN/Babel frontend files were removed so there is a single frontend path.
- `db/schema.sql`: PostgreSQL schema for the app.

## Tech Stack

- **Frontend:** React + Vite + Bootstrap
- **Backend:** Node.js + Express
- **Database:** PostgreSQL via `pg`

## Environment Variables

Create a `.env` file in the project root:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME
GOOGLE_PLACES_API_KEY=your_google_places_key
PORT=3000
```

`DATABASE_URL` is required.

## Local Development

```bash
npm install
npm run build
npm start
```

- `npm run build` builds the React frontend into `frontend/dist`.
- `npm start` runs Node and serves API + React build from one process.

## PostgreSQL Schema / Migration

Use the schema file:

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

The server also runs a startup `CREATE TABLE IF NOT EXISTS` safeguard.

## API (PostgreSQL-backed CRUD)

- `GET /api/restaurants?query=sushi` (restaurant search + glove summary)
- `GET /api/google-places-diagnostics` (verifies current server key against Google and returns troubleshooting guidance)
- `GET /api/submissions` (list all submissions)
- `GET /api/submissions?placeId=<google_place_id>` (list by place)
- `GET /api/submissions/:id` (get one)
- `POST /api/submissions` (create)
- `PUT /api/submissions/:id` (update gloveType/notes/submittedBy)
- `DELETE /api/submissions/:id` (delete)

Example create payload:

```json
{
  "placeId": "abc123",
  "restaurantName": "Example Deli",
  "address": "123 Main St, New York, NY",
  "gloveType": "nitrile",
  "notes": "Kitchen confirmed nitrile",
  "submittedBy": "alex"
}
```

## Deploy on Render.com

1. **Push this repo to GitHub.**
2. **Create a PostgreSQL database in Render:**
   - Render Dashboard → **New** → **PostgreSQL**
   - choose name/region/plan and create it.
3. **Create a Web Service in Render:**
   - Render Dashboard → **New** → **Web Service**
   - connect your repository/branch.
4. **Configure build and start commands:**
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
5. **Set environment variables in Web Service:**
   - `DATABASE_URL` = Internal Database URL from your Render PostgreSQL instance.
   - `GOOGLE_PLACES_API_KEY` (optional but recommended for live data)
   - `NODE_ENV=production`
6. **Deploy.**
   - Render builds frontend assets and starts the Node server.
   - Node serves static React files from `frontend/dist` and API routes from `/api/*`.

## Render Notes

- Keep the backend and frontend in one service for simplest deployment.
- Use Render's generated Postgres URL directly as `DATABASE_URL`.
- If Google API key is missing, `/api/restaurants` returns sample restaurant data.

- If Render has a key set but Google returns `REQUEST_DENIED`, call `/api/google-places-diagnostics` to confirm what Google status/error is returned from the server runtime and review the `guidance` field.
