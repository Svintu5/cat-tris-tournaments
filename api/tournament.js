// api/tournament.js - ИСПРАВЛЕННАЯ ВЕРСИЯ
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const roomKey = (code) => `tournament:${code}`;

export default async function handler(req, res) {
  // ✅ Анти-кеш заголовки для ВСЕХ запросов
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  try {
    const { code, action, room, playerName, score } = req.body || {};
    
    if (!code || !action) {
      return res.status(400).json({ error: 'Missing code or action' });
    }

    if (!/^[A-Z0-9]{4}$/.test(code)) {
      return res.status(400).json({ error: 'Invalid room code format' });
    }

    // 🔹 ПОЛУЧИТЬ КОМНАТУ
    if (action === 'get_room') {
      console.log('📥 [GET] Room:', code);
      
      const roomJson = await redis.get(roomKey(code));
      
      if (!roomJson) {
        return res.status(404).json({ error: 'Room not found' });
      }
      
      const data = typeof roomJson === 'string' ? JSON.parse(roomJson) : roomJson;
      console.log('✅ [GET] Returned:', { status: data.status, players: data.players, scores: data.scores, played: data.played });
      
      return res.status(200).json(data);
    }

    // 🔹 ПРОВЕРИТЬ СУЩЕСТВОВАНИЕ
    if (action === 'check_exists') {
      const exists = await redis.exists(roomKey(code));
      return res.json({ exists: exists === 1 });
    }

    // 🔹 СОХРАНИТЬ КОМНАТУ
    if (action === 'save_room') {
      if (!room) {
        return res.status(400).json({ error: 'Missing room data' });
      }

      if (!room.code || !room.host || !Array.isArray(room.players)) {
        return res.status(400).json({ error: 'Invalid room structure' });
      }

      const validStatuses = ['waiting', 'started', 'finished'];
      if (!validStatuses.includes(room.status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      room.players = room.players.map(name => 
        String(name).trim().slice(0, 12).replace(/[<>'"]/g, '')
      );

      if (room.scores) {
        Object.keys(room.scores).forEach(key => {
          room.scores[key] = Number(room.scores[key]) || 0;
        });
      }

      await redis.set(roomKey(code), JSON.stringify(room));
      console.log('💾 [SAVE] Room saved:', room);
      
      return res.json({ ok: true, room });
    }

    // 🔹 ВОЙТИ В КОМНАТУ
    if (action === 'join_room') {
      if (!playerName) {
        return res.status(400).json({ error: 'Missing playerName' });
      }

      const cleanName = String(playerName).trim().slice(0, 12).replace(/[<>'"]/g, '');
      
      if (!cleanName) {
        return res.status(400).json({ error: 'Invalid player name' });
      }

      const roomJson = await redis.get(roomKey(code));
      
      if (!roomJson) {
        return res.status(404).json({ error: 'Room not found' });
      }
      
      const room = typeof roomJson === 'string' ? JSON.parse(roomJson) : roomJson;

      if (room.status !== 'waiting') {
        return res.status(403).json({ error: 'Tournament already started' });
      }

      if (room.players.includes(cleanName)) {
        return res.status(409).json({ error: 'Name already taken' });
      }

      room.players.push(cleanName);
      room.scores = room.scores || {};
      room.played = room.played || {};
      room.scores[cleanName] = 0;
      room.played[cleanName] = false;

      await redis.set(roomKey(code), JSON.stringify(room));

      return res.json({ ok: true, room });
    }

    // 🔹 НАЧАТЬ ТУРНИР
    if (action === 'start_tournament') {
      console.log('🏁 [START] Tournament:', { code, playerName });
      
      if (!playerName) {
        return res.status(400).json({ error: 'Missing playerName' });
      }

      const roomJson = await redis.get(roomKey(code));
      
      if (!roomJson) {
        return res.status(404).json({ error: 'Room not found' });
      }
      
      const room = typeof roomJson === 'string' ? JSON.parse(roomJson) : roomJson;

      if (room.host !== playerName) {
        return res.status(403).json({ error: 'Only host can start tournament' });
      }

      if (room.status !== 'waiting') {
        return res.status(400).json({ error: 'Tournament already started' });
      }

      if (room.players.length < 1) {
        return res.status(400).json({ error: 'Need at least 1 player' });
      }

      room.status = 'started';
      room.startedAt = new Date().toISOString();
      
      console.log('✅ [START] Changed status to started');

      await redis.set(roomKey(code), JSON.stringify(room));

      return res.json({ ok: true, room });
    }

    // 🔹 ОТПРАВИТЬ РЕЗУЛЬТАТ
    if (action === 'submit_score') {
      console.log('=== [SUBMIT] Start ===');
      console.log('📥 Data:', { code, playerName, score });
      
      if (!playerName) {
        return res.status(400).json({ error: 'Missing playerName' });
      }

      if (typeof score !== 'number' || score < 0) {
        console.log('❌ Invalid score:', score, typeof score);
        return res.status(400).json({ error: 'Invalid score' });
      }

      const roomJson = await redis.get(roomKey(code));
      
      if (!roomJson) {
        console.log('❌ Room not found');
        return res.status(404).json({ error: 'Room not found' });
      }
      
      const room = typeof roomJson === 'string' ? JSON.parse(roomJson) : roomJson;
      console.log('📊 Current room state:', { 
        status: room.status, 
        players: room.players,
        scores: room.scores,
        played: room.played 
      });

      if (room.status !== 'started') {
        console.log('❌ Tournament not started:', room.status);
        return res.status(400).json({ error: 'Tournament not started' });
      }

      if (!room.players.includes(playerName)) {
        console.log('❌ Player not in tournament:', playerName);
        return res.status(403).json({ error: 'Player not in tournament' });
      }

      // ✅ Инициализируем объекты если их нет
      room.scores = room.scores || {};
      room.played = room.played || {};

      // ✅ Проверка: Уже сыграл?
      if (room.played[playerName] === true) {
        console.log('⚠️ Player already played:', playerName);
        return res.status(400).json({ error: 'You already played' });
      }

      // ✅ Обновить счёт ЭТОГО игрока
      room.scores[playerName] = score;
      room.played[playerName] = true;
      
      console.log('💾 Updated scores:', room.scores);
      console.log('💾 Updated played:', room.played);

      // Проверить завершение
      const allPlayed = room.players.every(name => room.played[name] === true);
      console.log('🎮 All played?', allPlayed);
      console.log('👥 Players:', room.players);
      console.log('✅ Played status:', room.played);

      if (allPlayed) {
        room.status = 'finished';
        room.finishedAt = new Date().toISOString();
        console.log('🏁 Tournament finished automatically');
      }

      // ✅ Сохранить обновлённую комнату
      await redis.set(roomKey(code), JSON.stringify(room));
      
      console.log('✅ Saved to Redis');
      console.log('=== [SUBMIT] End ===');

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
