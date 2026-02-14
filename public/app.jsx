const { useEffect, useMemo, useState } = React;

function badgeClass(gloveType) {
  switch (gloveType) {
    case 'latex':
      return 'text-bg-danger';
    case 'nitrile':
      return 'text-bg-success';
    case 'vinyl':
      return 'text-bg-primary';
    case 'none':
      return 'text-bg-secondary';
    default:
      return 'text-bg-light';
  }
}

function gloveLabel(gloveType) {
  const map = {
    vinyl: 'Vinyl gloves',
    nitrile: 'Nitrile gloves',
    latex: 'Latex gloves',
    none: 'No gloves'
  };
  return map[gloveType] || 'No reports yet';
}

function App() {
  const [query, setQuery] = useState('restaurants');
  const [restaurants, setRestaurants] = useState([]);
  const [source, setSource] = useState('');
  const [googleApiConfigured, setGoogleApiConfigured] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hideLatex, setHideLatex] = useState(false);
  const [submitStatus, setSubmitStatus] = useState('');
  const [formData, setFormData] = useState({
    placeId: '',
    restaurantName: '',
    address: '',
    gloveType: '',
    submittedBy: '',
    notes: ''
  });

  const filteredRestaurants = useMemo(() => {
    if (!hideLatex) return restaurants;
    return restaurants.filter((r) => r.gloveInfo?.latestGloveType !== 'latex');
  }, [restaurants, hideLatex]);

  async function loadRestaurants(searchQuery = query) {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/restaurants?query=${encodeURIComponent(searchQuery)}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch restaurants.');
      }
      setRestaurants(data.restaurants || []);
      setSource(data.source || '');
      setGoogleApiConfigured(Boolean(data.googleApiConfigured));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRestaurants();
  }, []);

  function prefillFromRestaurant(restaurant) {
    setFormData((prev) => ({
      ...prev,
      placeId: restaurant.place_id,
      restaurantName: restaurant.name,
      address: restaurant.formatted_address
    }));
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitStatus('Submitting...');

    const response = await fetch('/api/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });

    const payload = await response.json();
    if (!response.ok) {
      setSubmitStatus(`Error: ${payload.error || 'Submission failed.'}`);
      return;
    }

    setSubmitStatus('Thanks! Your report was saved.');
    setFormData({
      placeId: '',
      restaurantName: '',
      address: '',
      gloveType: '',
      submittedBy: '',
      notes: ''
    });
    loadRestaurants();
  }

  return (
    <div className="container py-4">
      <div className="p-4 mb-4 bg-white rounded-3 shadow-sm border">
        <h1 className="h3 mb-2">Latex Free Eats NYC</h1>
        <p className="mb-0 text-muted">
          Find New York City restaurants and crowdsource kitchen glove information to help people
          with latex allergies make safer dining decisions.
        </p>
      </div>

      <div className="card mb-4 shadow-sm">
        <div className="card-body">
          <div className="row g-2 align-items-center">
            <div className="col-md-6">
              <input
                className="form-control"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Try sushi, deli, vegan..."
              />
            </div>
            <div className="col-md-auto">
              <button className="btn btn-primary" onClick={() => loadRestaurants(query)}>
                Search NYC Restaurants
              </button>
            </div>
            <div className="col-md-auto">
              <div className="form-check">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="hideLatex"
                  checked={hideLatex}
                  onChange={(e) => setHideLatex(e.target.checked)}
                />
                <label className="form-check-label" htmlFor="hideLatex">
                  Hide latex-reported restaurants
                </label>
              </div>
            </div>
          </div>
          {source === 'sample_data_no_api_key' && (
            <div className="alert alert-warning mt-3 mb-0">
              Using sample data. Set <code>GOOGLE_PLACES_API_KEY</code> for live Google Places data.
            </div>
          )}
          {source === 'google_places_api' && (
            <div className="alert alert-success mt-3 mb-0">
              Connected to live Google Places data for NYC.
            </div>
          )}
        </div>
      </div>

      <div className="mb-4">
        <h2 className="h4">Restaurant Results</h2>
        {!googleApiConfigured && (
          <p className="small text-muted">
            Google API key is not configured on the server process, so results are mocked.
          </p>
        )}
        {loading && <p className="text-muted">Loading restaurants...</p>}
        {error && <div className="alert alert-danger">{error}</div>}
        {!loading && !error && filteredRestaurants.length === 0 && (
          <p className="text-muted">No restaurants match your filter.</p>
        )}
        <div className="row g-3">
          {filteredRestaurants.map((r) => {
            const latest = r.gloveInfo?.latestGloveType;
            const latexClass = latest === 'latex' ? 'border-danger border-2' : '';
            return (
              <div className="col-12" key={r.place_id}>
                <div className={`card shadow-sm ${latexClass}`}>
                  <div className="card-body">
                    <h3 className="h5 card-title mb-1">{r.name}</h3>
                    <p className="card-text mb-1 text-muted">{r.formatted_address}</p>
                    <p className="card-text mb-2">Rating: {r.rating ?? 'N/A'}</p>
                    <p className="mb-2">
                      <span className={`badge ${badgeClass(latest)}`}>{gloveLabel(latest)}</span>
                    </p>
                    <p className="small text-muted mb-2">
                      {r.gloveInfo
                        ? `${r.gloveInfo.submissionCount} report(s). Latest note: ${r.gloveInfo.latestNotes || 'none'}`
                        : 'No glove submissions yet. Please contribute.'}
                    </p>
                    {r.gloveInfo?.gloveTypeCounts && (
                      <p className="small text-muted mb-3">
                        Breakdown: {Object.entries(r.gloveInfo.gloveTypeCounts)
                          .map(([type, count]) => `${type}: ${count}`)
                          .join(' · ')}
                      </p>
                    )}
                    <button className="btn btn-outline-primary btn-sm" onClick={() => prefillFromRestaurant(r)}>
                      Report this restaurant
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card shadow-sm">
        <div className="card-body">
          <h2 className="h4">Submit New Glove Information</h2>
          <form onSubmit={handleSubmit} className="row g-2">
            <div className="col-md-4">
              <input
                className="form-control"
                placeholder="Place ID"
                required
                value={formData.placeId}
                onChange={(e) => setFormData({ ...formData, placeId: e.target.value })}
              />
            </div>
            <div className="col-md-4">
              <input
                className="form-control"
                placeholder="Restaurant Name"
                required
                value={formData.restaurantName}
                onChange={(e) => setFormData({ ...formData, restaurantName: e.target.value })}
              />
            </div>
            <div className="col-md-4">
              <input
                className="form-control"
                placeholder="Address"
                required
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>
            <div className="col-md-4">
              <select
                className="form-select"
                required
                value={formData.gloveType}
                onChange={(e) => setFormData({ ...formData, gloveType: e.target.value })}
              >
                <option value="">Select glove type</option>
                <option value="vinyl">Vinyl</option>
                <option value="nitrile">Nitrile</option>
                <option value="latex">Latex</option>
                <option value="none">No gloves</option>
              </select>
            </div>
            <div className="col-md-4">
              <input
                className="form-control"
                placeholder="Your name (optional)"
                value={formData.submittedBy}
                onChange={(e) => setFormData({ ...formData, submittedBy: e.target.value })}
              />
            </div>
            <div className="col-12">
              <textarea
                className="form-control"
                rows="3"
                placeholder="Notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              ></textarea>
            </div>
            <div className="col-12">
              <button className="btn btn-success" type="submit">
                Submit Report
              </button>
            </div>
          </form>
          {submitStatus && <p className="mt-3 mb-0 text-muted">{submitStatus}</p>}
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
