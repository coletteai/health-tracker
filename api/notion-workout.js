const { workoutProperties, WORKOUT_DB_ID, notionFetch, setCors } = require('./_helpers');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const data = req.body;
  const properties = workoutProperties(data);
  const isUpdate = !!data.notionPageId;

  const r = await notionFetch(
    isUpdate ? 'PATCH' : 'POST',
    isUpdate ? `/v1/pages/${data.notionPageId}` : '/v1/pages',
    isUpdate ? { properties } : { parent: { database_id: WORKOUT_DB_ID }, properties }
  );
  const json = await r.json();
  res.status(r.status).json(json);
};
