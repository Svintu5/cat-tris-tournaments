// api/tournament.js - ВЕРСИЯ С UPSTASH REDIS
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const roomKey = (code) => `tournament:${code}`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  try {
    const { code, action, room, playerName, score } = req.body || {};
    
    if (!code || !action) {
      return res.status(400).json({ error: 'Missing code or action' });
    }

    // Валидация формата кода комнаты
    if (!/^[A-Z0-9]{4}$/.test(code)) {
      return res.status(400).json({ error: 'Invalid room code format' });
    }

    // 🔹 ПОЛУЧИТЬ КОМНАТУ
    if (action === 'get_room') {
      console.log('📥 [API] get_room:', code);
      
      const roomJson = await redis.get(roomKey(code));
      
      if (!roomJson) {
        return res.status(404).json({ error: 'Room not found' });
      }
      
      const data = JSON.parse(roomJson);
      
      // Заголовки анти-кеширования
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      return res.status(200).json(data);
    }

    // 🔹 ПРОВЕРИТЬ СУЩЕСТВОВАНИЕ КОМНАТЫ
    if (action === 'check_exists') {
      const exists = await redis.exists(roomKey(code));
      return res.json({ exists: exists === 1 });
    }

    // 🔹 СОХРАНИТЬ КОМНАТУ
    if (action === 'save_room') {
      if (!room) {
        return res.status(400).json({ error: 'Missing room data' });
      }

      // Валидация структуры
      if (!room.code || !room.host || !Array.isArray(room.players)) {
        return res.status(400).json({ error: 'Invalid room structure' });
      }

      // Валидация статуса
      const validStatuses = ['waiting', 'started', 'finished'];
      if (!validStatuses.includes(room.status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      // Санитизация имён игроков
      room.players = room.players.map(name => 
        String(name).trim().slice(0, 12).replace(/[<>'"]/g, '')
      );

      // Валидация очков
      if (room.scores) {
        Object.keys(room.scores).forEach(key => {
          room.scores[key] = Number(room.scores[key]) || 0;
        });
      }

      await redis.set(roomKey(code), JSON.stringify(room));
      
      return res.json({ ok: true, room });
    }

    // 🔹 ВОЙТИ В КОМНАТУ (атомарная операция)
    if (action === 'join_room') {
      if (!playerName) {
        return res.status(400).json({ error: 'Missing playerName' });
      }

      // Санитизация имени
      const cleanName = String(playerName).trim().slice(0, 12).replace(/[<>'"]/g, '');
      
      if (!cleanName) {
        return res.status(400).json({ error: 'Invalid player name' });
      }

      // Получить текущее состояние комнаты
      const roomJson = await redis.get(roomKey(code));
      
      if (!roomJson) {
        return res.status(404).json({ error: 'Room not found' });
      }
      
      const room = JSON.parse(roomJson);

      // Проверка статуса турнира
      if (room.status !== 'waiting') {
        return res.status(403).json({ error: 'Tournament already started' });
      }

      // Проверка дубликатов имён
      if (room.players.includes(cleanName)) {
        return res.status(409).json({ error: 'Name already taken' });
      }

      // Добавить игрока
      room.players.push(cleanName);
      room.scores = room.scores || {};
      room.played = room.played || {};
      room.scores[cleanName] = 0;
      room.played[cleanName] = false;

      // Сохранить
      await redis.set(roomKey(code), JSON.stringify(room));

      return res.json({ ok: true, room });
    }

    // 🔹 НАЧАТЬ ТУРНИР (только хост)
    if (action === 'start_tournament') {
      console.log('🏁 [API] start_tournament:', { code, playerName });
      
      if (!playerName) {
        return res.status(400).json({ error: 'Missing playerName' });
      }

      // Получить комнату
      const roomJson = await redis.get(roomKey(code));
      
      if (!roomJson) {
        return res.status(404).json({ error: 'Room not found' });
      }
      
      const room = JSON.parse(roomJson);

      // Проверка что это хост
      if (room.host !== playerName) {
        return res.status(403).json({ error: 'Only host can start tournament' });
      }

      // Проверка статуса
      if (room.status !== 'waiting') {
        return res.status(400).json({ error: 'Tournament already started' });
      }

      // Проверка минимального количества игроков
      if (room.players.length < 1) {
        return res.status(400).json({ error: 'Need at least 1 player' });
      }

      room.status = 'started';
      room.startedAt = new Date().toISOString();
      
      console.log('✅ [API] Статус изменён на started:', room);

      await redis.set(roomKey(code), JSON.stringify(room));

      return res.json({ ok: true, room });
    }

    // 🔹 ОТПРАВИТЬ РЕЗУЛЬТАТ
    if (action === 'submit_score') {
      console.log('=== API: submit_score ===');
      console.log('📥 Получены данные:', { code, playerName, score });
      
      if (!playerName) {
        return res.status(400).json({ error: 'Missing playerName' });
      }

      if (typeof score !== 'number' || score < 0) {
        console.log('❌ Невалидный score:', score, typeof score);
        return res.status(400).json({ error: 'Invalid score' });
      }

      // Получить комнату
      const roomJson = await redis.get(roomKey(code));
      
      if (!roomJson) {
        console.log('❌ Комната не найдена');
        return res.status(404).json({ error: 'Room not found' });
      }
      
      const room = JSON.parse(roomJson);
      console.log('📊 Текущее состояние комнаты:', room);

      // Проверка статуса
      if (room.status !== 'started') {
        console.log('❌ Турнир не в статусе started:', room.status);
        return res.status(400).json({ error: 'Tournament not started' });
      }

      // Проверка что игрок в турнире
      if (!room.players.includes(playerName)) {
        console.log('❌ Игрок не в списке:', playerName, 'Список:', room.players);
        return res.status(403).json({ error: 'Player not in tournament' });
      }

      // ✅ Проверка: Уже сыграл?
      room.played = room.played || {};
      if (room.played[playerName] === true) {
        console.log('⚠️ Игрок уже сыграл:', playerName);
        return res.status(400).json({ error: 'You already played' });
      }

      // Обновить счёт
      room.scores = room.scores || {};
      room.scores[playerName] = score;
      room.played[playerName] = true;
      
      console.log('💾 Обновлённые очки:', room.scores);
      console.log('💾 Обновлённый played:', room.played);

      // Проверить завершение турнира (все сыграли?)
      const allPlayed = room.players.every(name => room.played[name] === true);
      console.log('🎮 Все сыграли?', allPlayed);
      console.log('👥 Игроки:', room.players);
      console.log('✅ Played статус:', room.played);

      // ✅ Автоматически завершаем турнир если все сыграли
      if (allPlayed) {
        room.status = 'finished';
        room.finishedAt = new Date().toISOString();
        console.log('🏁 Все сыграли! Автоматически завершаем турнир');
      }

      await redis.set(roomKey(code), JSON.stringify(room));
      
      console.log('✅ Данные сохранены в Redis');
      console.log('=== API: submit_score завершён ===');

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
