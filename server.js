const http  = require('http');
const https = require('https');

// ─── CONFIG ────────────────────────────────────────────────
const NOTION_TOKEN  = process.env.NOTION_TOKEN;
const SLEEP_DB_ID   = 'f9ef3fd2-2a84-4568-8596-0a0e100edb66';
const WORKOUT_DB_ID = '9b5caa9a-ba58-44eb-a4a4-fb6fddaa25ff';
const WEIGHT_DB_ID  = 'eb480314-a0fe-49c4-a435-aebd03dbf0a4';
const PORT          = 3001;
// ───────────────────────────────────────────────────────────

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
function calcHours(bedtime, wakeTime) {
  if (!bedtime || !wakeTime) return null;
  const [bh, bm] = bedtime.split(':').map(Number);
  const [wh, wm] = wakeTime.split(':').map(Number);
  let bMin = bh * 60 + bm, wMin = wh * 60 + wm;
  if (wMin <= bMin) wMin += 1440;
  return parseFloat(((wMin - bMin) / 60).toFixed(2));
}
function fmtDate(str) {
  if (!str) return '';
  const [y, m, d] = str.split('-').map(Number);
  return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m-1]} ${d}, ${y}`;
}

// ─── PROPERTY BUILDERS ─────────────────────────────────────

function sleepProperties(sleep) {
  const hours = calcHours(sleep.bedtime, sleep.wakeTime);
  const props = {
    'Date':      { title:     [{ text: { content: fmtDate(sleep.date) } }] },
    'Bedtime':   { rich_text: [{ text: { content: fmtTime(sleep.bedtime) } }] },
    'Wake Time': { rich_text: [{ text: { content: fmtTime(sleep.wakeTime) } }] },
  };
  if (hours !== null) props['Hours Slept'] = { number: hours };
  if (sleep.alarm)    props['Alarm?'] = { select: { name: sleep.alarm === 'with' ? 'Alarm' : 'Without Alarm' } };
  if (sleep.morningEnergy != null) props['Energy Level'] = { select: { name: String(sleep.morningEnergy) } };
  const notes = [sleep.wokeUp ? `Woke up: ${sleep.wokeUp}` : '', sleep.notes || ''].filter(Boolean).join(' · ');
  if (notes) props['Notes'] = { rich_text: [{ text: { content: notes } }] };
  return props;
}

const DAY_TYPE_MAP = {
  'legs-quad': { session: 'Legs — Quad Focus',             muscleGroup: 'Legs' },
  'push':      { session: 'Push — Chest · Tri · Shoulder', muscleGroup: 'Chest / Tri / Shoulders' },
  'legs-ham':  { session: 'Legs — Ham · Glute Focus',      muscleGroup: 'Legs' },
  'pull':      { session: 'Pull — Back · Bis',             muscleGroup: 'Back & Bis' },
};

function workoutProperties(workout) {
  const map = DAY_TYPE_MAP[workout.dayType] || { session: workout.dayType || 'Workout', muscleGroup: null };
  const notes = (workout.exercises || []).map(ex => {
    const sets = (ex.sets || []).filter(s => s.reps || s.weight)
      .map(s => [s.reps && `${s.reps} reps`, s.weight && `${s.weight} lbs`].filter(Boolean).join(' @ '));
    return `${ex.name}: ${sets.join(', ') || '—'}`;
  }).join('\n');
  const props = {
    'Session': { title: [{ text: { content: map.session } }] },
    'Date':    { date:  { start: workout.date } },
  };
  if (map.muscleGroup) props['Muscle Group'] = { multi_select: [{ name: map.muscleGroup }] };
  if (notes) props['Notes'] = { rich_text: [{ text: { content: notes.slice(0, 2000) } }] };
  return props;
}

function weightProperties(entry) {
  const kg = entry.weight ? parseFloat((entry.weight / 2.20462).toFixed(2)) : null;
  const props = {
    'Name':         { title:  [{ text: { content: fmtDate(entry.date) } }] },
    'Date':         { date:   { start: entry.date } },
    'Weight (lbs)': { number: entry.weight },
  };
  if (kg !== null) props['Weight (kg)'] = { number: kg };
  if (entry.scale) props['Location'] = { rich_text: [{ text: { content: entry.scale } }] };
  return props;
}

const PROPERTY_BUILDERS = {
  '/notion-sleep':   { build: sleepProperties,   dbId: SLEEP_DB_ID },
  '/notion-workout': { build: workoutProperties, dbId: WORKOUT_DB_ID },
  '/notion-weight':  { build: weightProperties,  dbId: WEIGHT_DB_ID },
};

// ─── NOTION REQUEST ────────────────────────────────────────

function notionRequest(method, path, payload, res) {
  const options = {
    hostname: 'api.notion.com',
    path,
    method,
    headers: {
      'Authorization':  `Bearer ${NOTION_TOKEN}`,
      'Content-Type':   'application/json',
      'Notion-Version': '2022-06-28',
      'Content-Length': Buffer.byteLength(payload),
    },
  };
  const req = https.request(options, notionRes => {
    let data = '';
    notionRes.on('data', chunk => data += chunk);
    notionRes.on('end', () => {
      console.log(`Notion ${method} ${notionRes.statusCode}:`, data.slice(0, 120));
      res.writeHead(notionRes.statusCode, { 'Content-Type': 'application/json' });
      res.end(data);
    });
  });
  req.on('error', err => {
    console.error('Notion error:', err.message);
    res.writeHead(500);
    res.end(JSON.stringify({ error: err.message }));
  });
  req.write(payload);
  req.end();
}

// ─── WEIGHT FETCH ──────────────────────────────────────────

function fetchWeightsFromNotion(res) {
  const body = '{}';
  const options = {
    hostname: 'api.notion.com',
    path:     `/v1/databases/${WEIGHT_DB_ID}/query`,
    method:   'POST',
    headers: {
      'Authorization':  `Bearer ${NOTION_TOKEN}`,
      'Content-Type':   'application/json',
      'Notion-Version': '2022-06-28',
      'Content-Length': Buffer.byteLength(body),
    },
  };
  const req = https.request(options, notionRes => {
    let data = '';
    notionRes.on('data', chunk => data += chunk);
    notionRes.on('end', () => {
      try {
        const json = JSON.parse(data);
        const entries = (json.results || []).map(page => ({
          notionPageId: page.id,
          date:   page.properties['Date']?.date?.start || '',
          weight: page.properties['Weight (lbs)']?.number ?? null,
          scale:  page.properties['Location']?.rich_text?.[0]?.plain_text || '',
        })).filter(e => e.date && e.weight !== null);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(entries));
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  });
  req.on('error', err => { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); });
  req.write(body);
  req.end();
}

// ─── HTTP SERVER ───────────────────────────────────────────

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  if (req.method === 'GET' && req.url === '/notion-weight-fetch') {
    fetchWeightsFromNotion(res);
    return;
  }

  const route = PROPERTY_BUILDERS[req.url];
  if (route && (req.method === 'POST' || req.method === 'PATCH')) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data       = JSON.parse(body);
        const properties = route.build(data);
        if (data.notionPageId) {
          // Update existing Notion page
          notionRequest('PATCH', `/v1/pages/${data.notionPageId}`,
            JSON.stringify({ properties }), res);
        } else {
          // Create new Notion page
          notionRequest('POST', '/v1/pages',
            JSON.stringify({ parent: { database_id: route.dbId }, properties }), res);
        }
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n✓ Notion proxy running → http://localhost:${PORT}`);
  console.log(`  Sleep   → ${SLEEP_DB_ID}`);
  console.log(`  Workout → ${WORKOUT_DB_ID}`);
  console.log(`  Weight  → ${WEIGHT_DB_ID}\n`);
});
