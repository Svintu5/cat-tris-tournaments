// api/tournament.js
import { put, list } from '@vercel/blob'; // [web:60]

// путь к файлу комнаты в Blob
const roomKey = (code) => `tournaments/${code}.json`;

// прочитать JSON комнаты из Blob
async function loadRoom(code) {
  const key = roomKey(code);

  // list() потому что у Blob SDK нет прямого get(), ищем файл по pathname [web:60][web:91]
  const blobs = await list({ prefix: key });
  const blob = blobs.blobs.find((b) => b.pathname === key);
  if (!blob) return null;

  const res = await fetch(blob.url);
  return await res.json();
}

// сохранить JSON комнаты в Blob
async function saveRoom(room) {
  await put(roomKey(room.code), JSON.stringify(room, null, 2), {
    contentType: 'application/json',
    access: 'public'
  });
}

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
    let room = await loadRoom(code);
    if (room) {
      return res.status(400).json({ error: 'Room already exists' });
    }

    room = {
      code,
      host,
      name: roomName || `${host}'s Cat Battle`,
      status: 'waiting', // waiting | started | finished
      players: [host],
      scores: { [host]: 0 }
    };

    await saveRoom(room);
    return res.json(room);
  }

  // JOIN ROOM
  if (action === 'join') {
    const room = await loadRoom(code);
    if (!room) {
      // фронт ждёт { room: null } как "комната не найдена"
      return res.json({ room: null });
    }

    if (!playerName) {
      return res.status(400).json({ error: 'Missing playerName' });
    }

    if (!room.players.includes(playerName)) {
      room.players.push(playerName);
      room.scores[playerName] = room.scores[playerName] || 0;
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

    const prev = room.scores[playerName] || 0;
    const best = Math.max(prev, Number(score) || 0);
    room.scores[playerName] = best;

    // лидерборд
    const leaderboard = Object.entries(room.scores)
      .sort((a, b) => b[1] - a[1])
      .map(([name, sc], index) => ({
        rank: index + 1,
        name,
        score: sc
      }));

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

  return res.status(400).json({ error: 'Unknown action' });
}
