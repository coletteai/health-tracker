const { sleepProperties, SLEEP_DB_ID, notionFetch, setCors } = require('./_helpers');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const data = req.body;

  if (req.method === 'DELETE') {
    if (!data.notionPageId) return res.status(400).json({ error: 'notionPageId required' });
    const r = await notionFetch('PATCH', `/v1/pages/${data.notionPageId}`, { archived: true });
    const json = await r.json();
    return res.status(r.status).json(json);
  }

  const properties = sleepProperties(data);
  const isUpdate = !!data.notionPageId;

  const r = await notionFetch(
    isUpdate ? 'PATCH' : 'POST',
    isUpdate ? `/v1/pages/${data.notionPageId}` : '/v1/pages',
    isUpdate ? { properties } : { parent: { database_id: SLEEP_DB_ID }, properties }
  );
  const json = await r.json();
  res.status(r.status).json(json);
};
