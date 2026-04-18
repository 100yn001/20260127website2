module.exports = async function handler(req, res) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    res.status(500).json({ error: 'REPLICATE_API_TOKEN not set on server' });
    return;
  }

  try {
    if (req.method === 'POST') {
      const upstream = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
          Authorization: `Token ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(req.body),
      });
      const text = await upstream.text();
      res.status(upstream.status);
      res.setHeader('Content-Type', 'application/json');
      res.send(text);
      return;
    }

    if (req.method === 'GET') {
      const id = req.query && req.query.id;
      if (!id) {
        res.status(400).json({ error: 'id query param required' });
        return;
      }
      const upstream = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
        headers: { Authorization: `Token ${token}` },
      });
      const text = await upstream.text();
      res.status(upstream.status);
      res.setHeader('Content-Type', 'application/json');
      res.send(text);
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    res.status(500).json({ error: err && err.message ? err.message : String(err) });
  }
};
