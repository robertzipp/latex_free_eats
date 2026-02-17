require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_DIST = path.join(__dirname, 'frontend', 'dist');

const rawGoogleApiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
const GOOGLE_PLACES_API_KEY = rawGoogleApiKey.trim().replace(/^['\"]|['\"]$/g, '');
const GOOGLE_API_KEY_SOURCE = process.env.GOOGLE_PLACES_API_KEY
  ? 'GOOGLE_PLACES_API_KEY'
  : process.env.GOOGLE_MAPS_API_KEY
    ? 'GOOGLE_MAPS_API_KEY'
    : null;

const ALLOWED_GLOVE_TYPES = ['vinyl', 'nitrile', 'latex', 'none'];

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

app.use(express.json());
app.use(express.static(FRONTEND_DIST));

async function initializeDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Please configure your PostgreSQL connection string.');
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS submissions (
      id UUID PRIMARY KEY,
      place_id TEXT NOT NULL,
      restaurant_name TEXT NOT NULL,
      address TEXT NOT NULL,
      glove_type TEXT NOT NULL CHECK (glove_type IN ('vinyl', 'nitrile', 'latex', 'none')),
      notes TEXT DEFAULT '',
      submitted_by TEXT DEFAULT 'anonymous',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

function toApiSubmission(row) {
  return {
    id: row.id,
    placeId: row.place_id,
    restaurantName: row.restaurant_name,
    address: row.address,
    gloveType: row.glove_type,
    notes: row.notes,
    submittedBy: row.submitted_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function aggregateGloveInfo(submissions) {
  const byPlace = new Map();

  for (const submission of submissions) {
    if (!byPlace.has(submission.placeId)) {
      byPlace.set(submission.placeId, []);
    }
    byPlace.get(submission.placeId).push(submission);
  }

  const aggregated = new Map();
  for (const [placeId, list] of byPlace.entries()) {
    const latest = [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    const gloveTypeCounts = list.reduce((acc, item) => {
      acc[item.gloveType] = (acc[item.gloveType] || 0) + 1;
      return acc;
    }, {});

    aggregated.set(placeId, {
      latestGloveType: latest.gloveType,
      latestNotes: latest.notes,
      latestSubmittedAt: latest.createdAt,
      submissionCount: list.length,
      gloveTypeCounts
    });
  }

  return aggregated;
}

async function fetchGoogleRestaurants(searchTerm = 'restaurants') {
  if (!GOOGLE_PLACES_API_KEY) {
    return [
      {
        place_id: 'sample-1',
        name: 'Sample Deli (configure GOOGLE_PLACES_API_KEY for live data)',
        formatted_address: 'Midtown Manhattan, New York, NY',
        rating: 4.2
      },
      {
        place_id: 'sample-2',
        name: 'Sample Pizza Spot',
        formatted_address: 'Lower Manhattan, New York, NY',
        rating: 4.5
      }
    ];
  }

  const query = encodeURIComponent(`${searchTerm} in New York City`);
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${GOOGLE_PLACES_API_KEY}`;
  let response;

  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(`Could not reach Google Places API (${error.message}).`);
  }

  if (!response.ok) {
    throw new Error(`Google Places API request failed with status ${response.status}`);
  }

  const payload = await response.json();
  if (payload.status !== 'OK' && payload.status !== 'ZERO_RESULTS') {
    const detail = payload.error_message ? ` ${payload.error_message}` : '';
    throw new Error(`Google Places API error: ${payload.status}.${detail}`);
  }

  return (payload.results || []).map((place) => ({
    place_id: place.place_id,
    name: place.name,
    formatted_address: place.formatted_address,
    rating: place.rating ?? null
  }));
}

app.get('/api/restaurants', async (req, res) => {
  try {
    const query = (req.query.query || 'restaurants').toString();
    const submissionsResult = await pool.query('SELECT * FROM submissions ORDER BY created_at DESC;');
    const submissions = submissionsResult.rows.map(toApiSubmission);

    const [restaurants, gloveMap] = await Promise.all([
      fetchGoogleRestaurants(query),
      Promise.resolve(aggregateGloveInfo(submissions))
    ]);

    const merged = restaurants.map((restaurant) => ({
      ...restaurant,
      gloveInfo: gloveMap.get(restaurant.place_id) || null
    }));

    res.json({
      source: GOOGLE_PLACES_API_KEY ? 'google_places_api' : 'sample_data_no_api_key',
      googleApiConfigured: Boolean(GOOGLE_PLACES_API_KEY),
      googleApiKeySource: GOOGLE_API_KEY_SOURCE,
      restaurants: merged
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load restaurants.' });
  }
});

app.get('/api/submissions', async (req, res) => {
  try {
    const placeId = req.query.placeId;
    const hasPlaceFilter = Boolean(placeId);
    const query = hasPlaceFilter
      ? {
          text: 'SELECT * FROM submissions WHERE place_id = $1 ORDER BY created_at DESC;',
          values: [placeId]
        }
      : {
          text: 'SELECT * FROM submissions ORDER BY created_at DESC;',
          values: []
        };

    const result = await pool.query(query);
    res.json({ submissions: result.rows.map(toApiSubmission) });
  } catch {
    res.status(500).json({ error: 'Failed to load submissions.' });
  }
});

app.get('/api/reported-restaurants', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM submissions ORDER BY created_at DESC;');
    const submissions = result.rows.map(toApiSubmission);
    const groupedByPlace = new Map();

    for (const submission of submissions) {
      if (!groupedByPlace.has(submission.placeId)) {
        groupedByPlace.set(submission.placeId, []);
      }
      groupedByPlace.get(submission.placeId).push(submission);
    }

    const restaurants = [...groupedByPlace.entries()].map(([placeId, list]) => {
      const latest = [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
      const gloveTypeCounts = list.reduce((acc, item) => {
        acc[item.gloveType] = (acc[item.gloveType] || 0) + 1;
        return acc;
      }, {});

      return {
        place_id: placeId,
        name: latest.restaurantName,
        formatted_address: latest.address,
        gloveInfo: {
          latestGloveType: latest.gloveType,
          latestNotes: latest.notes,
          latestSubmittedAt: latest.createdAt,
          submissionCount: list.length,
          gloveTypeCounts
        }
      };
    });

    res.json({ restaurants });
  } catch {
    res.status(500).json({ error: 'Failed to load reported restaurants.' });
  }
});

app.get('/api/submissions/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM submissions WHERE id = $1;', [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Submission not found.' });
    }

    return res.json({ submission: toApiSubmission(result.rows[0]) });
  } catch {
    return res.status(500).json({ error: 'Failed to load submission.' });
  }
});

app.post('/api/submissions', async (req, res) => {
  try {
    const { placeId, restaurantName, address, gloveType, notes = '', submittedBy = 'anonymous' } = req.body;

    if (!placeId || !restaurantName || !address) {
      return res.status(400).json({ error: 'placeId, restaurantName, and address are required.' });
    }

    if (!ALLOWED_GLOVE_TYPES.includes(gloveType)) {
      return res.status(400).json({
        error: `gloveType must be one of: ${ALLOWED_GLOVE_TYPES.join(', ')}`
      });
    }

    const submission = {
      id: crypto.randomUUID(),
      placeId,
      restaurantName,
      address,
      gloveType,
      notes,
      submittedBy
    };

    const createdResult = await pool.query(
      `
      INSERT INTO submissions (
        id, place_id, restaurant_name, address, glove_type, notes, submitted_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
      `,
      [
        submission.id,
        submission.placeId,
        submission.restaurantName,
        submission.address,
        submission.gloveType,
        submission.notes,
        submission.submittedBy
      ]
    );

    return res.status(201).json({ message: 'Submission saved.', submission: toApiSubmission(createdResult.rows[0]) });
  } catch {
    return res.status(500).json({ error: 'Failed to save submission.' });
  }
});

app.put('/api/submissions/:id', async (req, res) => {
  try {
    const { gloveType, notes = '', submittedBy = 'anonymous' } = req.body;

    if (!ALLOWED_GLOVE_TYPES.includes(gloveType)) {
      return res.status(400).json({ error: `gloveType must be one of: ${ALLOWED_GLOVE_TYPES.join(', ')}` });
    }

    const updatedResult = await pool.query(
      `
      UPDATE submissions
      SET glove_type = $2,
          notes = $3,
          submitted_by = $4,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *;
      `,
      [req.params.id, gloveType, notes, submittedBy]
    );

    if (updatedResult.rowCount === 0) {
      return res.status(404).json({ error: 'Submission not found.' });
    }

    return res.json({ message: 'Submission updated.', submission: toApiSubmission(updatedResult.rows[0]) });
  } catch {
    return res.status(500).json({ error: 'Failed to update submission.' });
  }
});

app.delete('/api/submissions/:id', async (req, res) => {
  try {
    const deleteResult = await pool.query('DELETE FROM submissions WHERE id = $1 RETURNING id;', [req.params.id]);
    if (deleteResult.rowCount === 0) {
      return res.status(404).json({ error: 'Submission not found.' });
    }

    return res.json({ message: 'Submission deleted.', id: deleteResult.rows[0].id });
  } catch {
    return res.status(500).json({ error: 'Failed to delete submission.' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Latex Free Eats running at http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database:', error.message);
    process.exit(1);
  });
