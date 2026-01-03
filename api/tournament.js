// api/tournament.js
import { put, list, get } from '@vercel/blob'; // добавь get

const roomKey = (code) => `tournaments/${code}.json`;

async function loadRoom(code) {
  const key = roomKey(code);
  const blobs = await list({ prefix: key });
  const blob = blobs.blobs.find((b) => b.pathname === key);
  if (!blob) return null;

  // 🔹 читаем содержимое через SDK, без fetch(blob.url)
  const file = await get(blob.pathname);        // или get(key)
  const text = await file.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error('Failed to parse room JSON for', code, 'got:', text.slice(0, 200));
    return null;
  }
}

async function saveRoom(room) {
  await put(roomKey(room.code), JSON.stringify(room, null, 2), {
    contentType: 'application/json',
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true
  });
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Only POST' });
    }

    const { code, action, playerName, score, host, name: roomName } = req.body || {};

    if (!code || !action) {
      return res.status(400).json({ error: 'Missing code or action' });
    }

    // CREATE ROOM
    if (action === 'create') {
      let room = await loadRoom(code);
      if (room) {
        return res.status(400).json({ error: 'Room already exists' });
      }

      room = {
        code,
        host,
        name: roomName || `${host || 'Host'}'s Cat Battle`,
        status: 'waiting',
        players: [host || 'Host'],
        scores: { [host || 'Host']: 0 },
        played: { [host || 'Host']: false }
      };

      await saveRoom(room);
      return res.json(room);
    }

    // JOIN ROOM
    if (action === 'join') {
      const room = await loadRoom(code);
      if (!room) {
        return res.json({ room: null });
      }

      if (!playerName) {
        return res.status(400).json({ error: 'Missing playerName' });
      }

      if (!room.players.includes(playerName)) {
        room.players.push(playerName);
        room.scores = room.scores || {};
        room.played = room.played || {};
        room.scores[playerName] = room.scores[playerName] || 0;
        room.played[playerName] = false;
        await saveRoom(room);
      }

      return res.json({ room });
    }

    // START TOURNAMENT
    if (action === 'start') {
      const room = await loadRoom(code);
      if (!room) {
        return res.status(400).json({ error: 'Room not found' });
      }

      room.status = 'started';
      await saveRoom(room);

      return res.json({ room });
    }

    // SUBMIT SCORE
    if (action === 'submit_score') {
      const room = await loadRoom(code);
      if (!room) {
        return res.status(400).json({ error: 'Room not found' });
      }
      if (!playerName) {
        return res.status(400).json({ error: 'Missing playerName' });
      }

      room.scores = room.scores || {};
      room.played = room.played || {};

      const prev = room.scores[playerName] || 0;
      const best = Math.max(prev, Number(score) || 0);
      room.scores[playerName] = best;

      // отмечаем, что игрок закончил
      room.played[playerName] = true;

      const leaderboard = Object.entries(room.scores)
        .sort((a, b) => b[1] - a[1])
        .map(([name, sc], index) => ({
          rank: index + 1,
          name,
          score: sc
        }));

      // проверяем, все ли уже сыграли
      const allDone = room.players.every(name => room.played?.[name]);

      room.status = allDone ? 'finished' : 'started';

      await saveRoom(room);

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

    // STATE — для поллинга и финального экрана
    if (action === 'state') {
      const room = await loadRoom(code);
      if (!room) {
        return res.status(400).json({ error: 'Room not found' });
      }

      room.scores = room.scores || {};
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
  } catch (err) {
    console.error('Tournament API error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
