const { SLEEP_DB_ID, notionFetch, setCors } = require('./_helpers');

function parseFmtDate(str) {
  const months = {Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
  const m = str.match(/(\w{3})\s+(\d+),\s+(\d{4})/);
  if (!m) return '';
  return `${m[3]}-${String(months[m[1]]).padStart(2,'0')}-${String(parseInt(m[2])).padStart(2,'0')}`;
}

function parseTime(str) {
  if (!str) return '';
  const m = str.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return '';
  let h = parseInt(m[1]);
  const min = m[2];
  if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
  if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2,'0')}:${min}`;
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const r = await notionFetch('POST', `/v1/databases/${SLEEP_DB_ID}/query`, { page_size: 100 });
  const json = await r.json();

  const entries = (json.results || []).map(page => {
    const props = page.properties;
    const dateStr    = props['Date']?.title?.[0]?.plain_text || '';
    const bedtimeStr = props['Bedtime']?.rich_text?.[0]?.plain_text || '';
    const wakeStr    = props['Wake Time']?.rich_text?.[0]?.plain_text || '';
    const notesRaw   = props['Notes']?.rich_text?.[0]?.plain_text || '';
    const alarmSel   = props['Alarm?']?.select?.name;

    const date = parseFmtDate(dateStr);
    if (!date) return null;

    // Notes field may start with "Woke up: tired · actual notes"
    let wokeUp = null, notes = notesRaw;
    const wm = notesRaw.match(/^Woke up:\s*(\w+)(?:\s+·\s+(.*))?$/s);
    if (wm) { wokeUp = wm[1]; notes = (wm[2] || '').trim(); }

    return {
      notionPageId: page.id,
      date,
      bedtime:  parseTime(bedtimeStr),
      wakeTime: parseTime(wakeStr),
      alarm:    alarmSel === 'Alarm' ? 'with' : alarmSel === 'Without Alarm' ? 'without' : null,
      wokeUp,
      notes,
    };
  }).filter(Boolean);

  res.status(200).json(entries);
};
