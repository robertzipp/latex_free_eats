require('dotenv').config();
const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const DATA_FILE = path.join(__dirname, 'data', 'submissions.json');

const ALLOWED_GLOVE_TYPES = ['vinyl', 'nitrile', 'latex', 'none'];

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function ensureDataFile() {
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify({ submissions: [] }, null, 2));
  }
}

async function readSubmissions() {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed.submissions) ? parsed.submissions : [];
}

async function writeSubmissions(submissions) {
  await fs.writeFile(DATA_FILE, JSON.stringify({ submissions }, null, 2));
}

function aggregateGloveInfo(submissions) {
  const byPlace = new Map();

  for (const s of submissions) {
    if (!byPlace.has(s.placeId)) {
      byPlace.set(s.placeId, []);
    }
    byPlace.get(s.placeId).push(s);
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
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Google Places API request failed with status ${response.status}`);
  }

  const payload = await response.json();
  if (payload.status !== 'OK' && payload.status !== 'ZERO_RESULTS') {
    throw new Error(`Google Places API error: ${payload.status}`);
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
    const [restaurants, submissions] = await Promise.all([fetchGoogleRestaurants(query), readSubmissions()]);
    const gloveMap = aggregateGloveInfo(submissions);

    const merged = restaurants.map((restaurant) => ({
      ...restaurant,
      gloveInfo: gloveMap.get(restaurant.place_id) || null
    }));

    res.json({
      source: GOOGLE_PLACES_API_KEY ? 'google_places_api' : 'sample_data_no_api_key',
      googleApiConfigured: Boolean(GOOGLE_PLACES_API_KEY),
      restaurants: merged
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load restaurants.' });
  }
});

app.get('/api/submissions', async (req, res) => {
  try {
    const all = await readSubmissions();
    const placeId = req.query.placeId;
    const filtered = placeId ? all.filter((s) => s.placeId === placeId) : all;
    res.json({ submissions: filtered });
  } catch {
    res.status(500).json({ error: 'Failed to load submissions.' });
  }
});

app.post('/api/submissions', async (req, res) => {
  try {
    const {
      placeId,
      restaurantName,
      address,
      gloveType,
      notes = '',
      submittedBy = 'anonymous'
    } = req.body;

    if (!placeId || !restaurantName || !address) {
      return res.status(400).json({ error: 'placeId, restaurantName, and address are required.' });
    }

    if (!ALLOWED_GLOVE_TYPES.includes(gloveType)) {
      return res.status(400).json({
        error: `gloveType must be one of: ${ALLOWED_GLOVE_TYPES.join(', ')}`
      });
    }

    const submissions = await readSubmissions();
    const submission = {
      id: crypto.randomUUID(),
      placeId,
      restaurantName,
      address,
      gloveType,
      notes,
      submittedBy,
      createdAt: new Date().toISOString()
    };

    submissions.push(submission);
    await writeSubmissions(submissions);

    res.status(201).json({ message: 'Submission saved.', submission });
  } catch {
    res.status(500).json({ error: 'Failed to save submission.' });
  }
});

ensureDataFile().then(() => {
  app.listen(PORT, () => {
    console.log(`Latex Free Eats running at http://localhost:${PORT}`);
  });
});
