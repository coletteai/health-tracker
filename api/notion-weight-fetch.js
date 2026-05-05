const { WEIGHT_DB_ID, notionFetch, setCors } = require('./_helpers');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const r = await notionFetch('POST', `/v1/databases/${WEIGHT_DB_ID}/query`, {});
  const json = await r.json();

  const entries = (json.results || []).map(page => ({
    notionPageId: page.id,
    date:   page.properties['Date']?.date?.start || '',
    weight: page.properties['Weight (lbs)']?.number ?? null,
    scale:  page.properties['Location']?.rich_text?.[0]?.plain_text || '',
  })).filter(e => e.date && e.weight !== null);

  res.status(200).json(entries);
};
