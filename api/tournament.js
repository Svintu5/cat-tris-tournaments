// api/tournament.js

const rooms = {};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST' });
  }

  const { code, action, playerName, score, host, name: roomName } = req.body;

  if (!code || !action) {
    return res.status(400).json({ error: 'Missing code or action' });
  }

  // CREATE ROOM
  if (action === 'create') {
    if (rooms[code]) {
      return res.status(400).json({ error: 'Room already exists' });
    }

    const room = {
      code,
      host,
      name: roomName || `${host}'s Cat Battle`,
      status: 'waiting',
      players: [host],
      scores: { [host]: 0 }
    };

    rooms[code] = room;

    return res.json(room);
  }

  // JOIN ROOM
  if (action === 'join') {
    const room = rooms[code];
    if (!room) {
      return res.json({ room: null });
    }

    if (!playerName) {
      return res.status(400).json({ error: 'Missing playerName' });
    }

    if (!room.players.includes(playerName)) {
      room.players.push(playerName);
      room.scores[playerName] = 0;
    }

    return res.json({ room });
  }

  // START TOURNAMENT
  if (action === 'start') {
    const room = rooms[code];
    if (!room) {
      return res.status(400).json({ error: 'Room not found' });
    }

    room.status = 'started';
    return res.json({ room });
  }

  // SUBMIT SCORE
  if (action === 'submit_score') {
    const room = rooms[code];
    if (!room) {
      return res.status(400).json({ error: 'Room not found' });
    }
    if (!playerName) {
      return res.status(400).json({ error: 'Missing playerName' });
    }

    const prev = room.scores[playerName] || 0;
    const best = Math.max(prev, Number(score) || 0);
    room.scores[playerName] = best;

    const leaderboard = Object.entries(room.scores)
      .sort((a, b) => b[1] - a[1])
      .map(([name, sc], index) => ({
        rank: index + 1,
        name,
        score: sc
      }));

    return res.json({
      room: {
        code: room.code,
        name: room.name,
        status: room.status,
        players: room.players
      },
      leaderboard
    });
  }

  return res.status(400).json({ error: 'Unknown action' });
}
