// api/tournament.js - FIXED VERSION
import { put, head } from '@vercel/blob';

const roomKey = (code) => `tournaments/${code}.json`;
const BLOB_BASE = 'https://awj11dvu2fwabtgr.public.blob.vercel-storage.com/tournaments';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST' });
  }

  try {
    const { code, action, room, playerName } = req.body || {};

    if (!code || !action) {
      return res.status(400).json({ error: 'Missing code or action' });
    }

    // ✅ Validate room code format
    if (!/^[A-Z0-9]{4}$/.test(code)) {
      return res.status(400).json({ error: 'Invalid room code format' });
    }

    // 🔹 GET ROOM
    if (action === 'get_room') {
      const url = `${BLOB_BASE}/${code}.json?download=1&t=${Date.now()}`;
      const resp = await fetch(url);
      
      if (!resp.ok) {
        return res.status(404).json({ error: 'Room not found' });
      }
      
      const data = await resp.json();
      return res.status(200).json(data);
    }

    // 🔹 CHECK IF ROOM EXISTS (for collision prevention)
    if (action === 'check_exists') {
      try {
        await head(`${BLOB_BASE}/${code}.json`);
        return res.json({ exists: true });
      } catch {
        return res.json({ exists: false });
      }
    }

    // 🔹 SAVE ROOM (with validation)
    if (action === 'save_room') {
      if (!room) {
        return res.status(400).json({ error: 'Missing room data' });
      }

      // ✅ Validate room structure
      if (!room.code || !room.host || !Array.isArray(room.players)) {
        return res.status(400).json({ error: 'Invalid room structure' });
      }

      // ✅ Validate status transitions
      const validStatuses = ['waiting', 'started', 'finished'];
      if (!validStatuses.includes(room.status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      // ✅ Sanitize player names (prevent XSS)
      room.players = room.players.map(name => 
        String(name).trim().slice(0, 12).replace(/[<>'"]/g, '')
      );

      // ✅ Validate scores are numbers
      if (room.scores) {
        Object.keys(room.scores).forEach(key => {
          room.scores[key] = Number(room.scores[key]) || 0;
        });
      }

      await put(roomKey(code), JSON.stringify(room, null, 2), {
        contentType: 'application/json',
        access: 'public',
        addRandomSuffix: false,
        cacheControlMaxAge: 0, // ✅ Disable caching for real-time updates
      });

      return res.json({ ok: true, room });
    }

    // 🔹 JOIN ROOM (atomic operation)
    if (action === 'join_room') {
      if (!playerName) {
        return res.status(400).json({ error: 'Missing playerName' });
      }

      // ✅ Sanitize player name
      const cleanName = String(playerName).trim().slice(0, 12).replace(/[<>'"]/g, '');
      
      if (!cleanName) {
        return res.status(400).json({ error: 'Invalid player name' });
      }

      // Get current room state
      const url = `${BLOB_BASE}/${code}.json?download=1&t=${Date.now()}`;
      const resp = await fetch(url);
      
      if (!resp.ok) {
        return res.status(404).json({ error: 'Room not found' });
      }
      
      const room = await resp.json();

      // ✅ Check if tournament already started
      if (room.status !== 'waiting') {
        return res.status(403).json({ error: 'Tournament already started' });
      }

      // ✅ Check for duplicate names
      if (room.players.includes(cleanName)) {
        return res.status(409).json({ error: 'Name already taken' });
      }

      // ✅ Add player atomically
      room.players.push(cleanName);
      room.scores = room.scores || {};
      room.played = room.played || {};
      room.scores[cleanName] = 0;
      room.played[cleanName] = false;

      // Save updated room
      await put(roomKey(code), JSON.stringify(room, null, 2), {
        contentType: 'application/json',
        access: 'public',
        addRandomSuffix: false,
        cacheControlMaxAge: 0,
      });

      return res.json({ ok: true, room });
    }

    // 🔹 START TOURNAMENT (only host can do this)
    if (action === 'start_tournament') {
      if (!playerName) {
        return res.status(400).json({ error: 'Missing playerName' });
      }

      // Get current room
      const url = `${BLOB_BASE}/${code}.json?download=1&t=${Date.now()}`;
      const resp = await fetch(url);
      
      if (!resp.ok) {
        return res.status(404).json({ error: 'Room not found' });
      }
      
      const room = await resp.json();

      // ✅ Verify player is host
      if (room.host !== playerName) {
        return res.status(403).json({ error: 'Only host can start tournament' });
      }

      // ✅ Check status
      if (room.status !== 'waiting') {
        return res.status(400).json({ error: 'Tournament already started' });
      }

      // ✅ Check minimum players
      if (room.players.length < 2) {
        return res.status(400).json({ error: 'Need at least 2 players' });
      }

      room.status = 'started';
      room.startedAt = new Date().toISOString();

      await put(roomKey(code), JSON.stringify(room, null, 2), {
        contentType: 'application/json',
        access: 'public',
        addRandomSuffix: false,
        cacheControlMaxAge: 0,
      });

      return res.json({ ok: true, room });
    }

    // 🔹 SUBMIT SCORE (with validation)
    if (action === 'submit_score') {
      const { score } = req.body;

      if (!playerName) {
        return res.status(400).json({ error: 'Missing playerName' });
      }

      if (typeof score !== 'number' || score < 0) {
        return res.status(400).json({ error: 'Invalid score' });
      }

      // Get current room
      const url = `${BLOB_BASE}/${code}.json?download=1&t=${Date.now()}`;
      const resp = await fetch(url);
      
      if (!resp.ok) {
        return res.status(404).json({ error: 'Room not found' });
      }
      
      const room = await resp.json();

      // ✅ Check tournament is started
      if (room.status !== 'started') {
        return res.status(400).json({ error: 'Tournament not started' });
      }

      // ✅ Check player is in tournament
      if (!room.players.includes(playerName)) {
        return res.status(403).json({ error: 'Player not in tournament' });
      }

      // ✅ Update score (keep highest)
      room.scores = room.scores || {};
      room.played = room.played || {};
      
      const currentScore = room.scores[playerName] || 0;
      room.scores[playerName] = Math.max(currentScore, score);
      room.played[playerName] = true;

      // ✅ Check if all players finished
      const allPlayed = room.players.every(name => room.played[name]);
      if (allPlayed) {
        room.status = 'finished';
        room.finishedAt = new Date().toISOString();
      }

      await put(roomKey(code), JSON.stringify(room, null, 2), {
        contentType: 'application/json',
        access: 'public',
        addRandomSuffix: false,
        cacheControlMaxAge: 0,
      });

      return res.json({ 
        ok: true, 
        room,
        tournamentFinished: allPlayed 
      });
    }

    return res.status(400).json({ error: 'Unknown action' });

  } catch (err) {
    console.error('Tournament API error:', err);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: err.message 
    });
  }
}
