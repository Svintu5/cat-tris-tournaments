import { put, get } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST' });
  
  const { code, action, playerName, score, host, name: roomName } = req.body;
  
  try {
    let roomData = { players: [], scores: {} };
    try {
      const blob = await get(`${code}.json`);
      roomData = JSON.parse(blob?.blob?.body || '{}');
    } catch {}

    if (action === 'create') {
      const newRoom = { code, host, name: roomName || 'Cat Battle', status: 'waiting', players: [host], scores: { [host]: 0 }, created: Date.now() };
      await put(`${code}.json`, JSON.stringify(newRoom), { access: 'public', token: process.env.BLOB_READ_WRITE_TOKEN });
      return res.json(newRoom);
    }
    
    if (action === 'join') {
      if (!roomData.players?.includes(playerName)) {
        roomData.players.push(playerName);
        roomData.scores[playerName] = 0;
        await put(`${code}.json`, JSON.stringify(roomData), { access: 'public', token: process.env.BLOB_READ_WRITE_TOKEN });
      }
      return res.json({ room: roomData });
    }
    
    if (action === 'submit_score') {
      roomData.scores[playerName] = score;
      roomData.status = 'finished';
      await put(`${code}.json`, JSON.stringify(roomData), { access: 'public', token: process.env.BLOB_READ_WRITE_TOKEN });
      const leaderboard = Object.entries(roomData.scores).sort(([,a], [,b]) => b - a).map(([name, score], i) => ({ rank: i+1, name, score }));
      return res.json({ leaderboard });
    }
    
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
