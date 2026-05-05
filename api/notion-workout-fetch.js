const { WORKOUT_DB_ID, notionFetch, setCors } = require('./_helpers');

const SESSION_TO_DAY_TYPE = {
  'Legs — Quad Focus':             'legs-quad',
  'Push — Chest · Tri · Shoulder': 'push',
  'Legs — Ham · Glute Focus':      'legs-ham',
  'Pull — Back · Bis':             'pull',
};

function parseExercises(notes) {
  if (!notes) return [];
  return notes.split('\n').map(line => {
    const colonIdx = line.indexOf(':');
    if (colonIdx < 0) return null;
    const name    = line.slice(0, colonIdx).trim();
    const setsStr = line.slice(colonIdx + 1).trim();
    if (!name) return null;
    const sets = setsStr === '—' ? [{ reps: '', weight: '' }] : setsStr.split(',').map(s => {
      s = s.trim();
      const full = s.match(/(\d+)\s+reps\s+@\s+([\d.]+)\s+lbs/);
      if (full) return { reps: full[1], weight: full[2] };
      const repsOnly = s.match(/(\d+)\s+reps/);
      if (repsOnly) return { reps: repsOnly[1], weight: '' };
      const wtOnly = s.match(/([\d.]+)\s+lbs/);
      if (wtOnly) return { reps: '', weight: wtOnly[1] };
      return { reps: '', weight: '' };
    });
    return { name, sets: sets.length ? sets : [{ reps: '', weight: '' }] };
  }).filter(Boolean);
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const r = await notionFetch('POST', `/v1/databases/${WORKOUT_DB_ID}/query`, { page_size: 100 });
  const json = await r.json();

  const entries = (json.results || []).map(page => {
    const props   = page.properties;
    const session = props['Session']?.title?.[0]?.plain_text || '';
    const date    = props['Date']?.date?.start || '';
    const notes   = props['Notes']?.rich_text?.[0]?.plain_text || '';

    if (!date) return null;

    const dayType   = SESSION_TO_DAY_TYPE[session] || 'push';
    const exercises = parseExercises(notes);

    return {
      notionPageId: page.id,
      date,
      dayType,
      exercises: exercises.length ? exercises : [{ name: session || 'Exercise', sets: [{ reps: '', weight: '' }] }],
    };
  }).filter(Boolean);

  res.status(200).json(entries);
};
