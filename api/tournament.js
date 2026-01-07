// api/tournament.js - ПОЛНОСТЬЮ РАБОЧАЯ ВЕРСИЯ
import { put } from '@vercel/blob';

const roomKey = (code) => `tournaments/${code}.json`;
const BLOB_BASE = 'https://awj11dvu2fwabtgr.public.blob.vercel-storage.com/tournaments';

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
      const url = `${BLOB_BASE}/${code}.json?download=1&t=${Date.now()}`;
      console.log('🌐 Запрос к Blob:', url);
      const resp = await fetch(url);
      console.log('📊 Ответ от Blob:', resp.status);
      
      if (!resp.ok) {
        return res.status(404).json({ error: 'Room not found' });
      }
      
      const data = await resp.json();
      return res.status(200).json(data);
    }

    // 🔹 ПРОВЕРИТЬ СУЩЕСТВОВАНИЕ КОМНАТЫ
    if (action === 'check_exists') {
      const url = `${BLOB_BASE}/${code}.json`;
      const resp = await fetch(url, { method: 'HEAD' });
      return res.json({ exists: resp.ok });
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

      await put(roomKey(code), JSON.stringify(room, null, 2), {
        contentType: 'application/json',
        access: 'public',
        addRandomSuffix: false,
        cacheControlMaxAge: 0,
        allowOverwrite: true,
      });

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
      const url = `${BLOB_BASE}/${code}.json?download=1&t=${Date.now()}`;
      const resp = await fetch(url);
      
      if (!resp.ok) {
        return res.status(404).json({ error: 'Room not found' });
      }
      
      const room = await resp.json();

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
      await put(roomKey(code), JSON.stringify(room, null, 2), {
        contentType: 'application/json',
        access: 'public',
        addRandomSuffix: false,
        cacheControlMaxAge: 0,
        allowOverwrite: true,
      });

      return res.json({ ok: true, room });
    }

    // 🔹 НАЧАТЬ ТУРНИР (только хост)
    if (action === 'start_tournament') {
      console.log('🏁 [API] start_tournament:', { code, playerName });
      
      if (!playerName) {
        return res.status(400).json({ error: 'Missing playerName' });
      }
      room.status = 'started';

      // Получить комнату
      const url = `${BLOB_BASE}/${code}.json?download=1&t=${Date.now()}`;
      const resp = await fetch(url);
      
      if (!resp.ok) {
        return res.status(404).json({ error: 'Room not found' });
      }
      
      const room = await resp.json();

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

      await put(roomKey(code), JSON.stringify(room, null, 2), {
        contentType: 'application/json',
        access: 'public',
        addRandomSuffix: false,
        cacheControlMaxAge: 0,
        allowOverwrite: true,
      });

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
  const url = `${BLOB_BASE}/${code}.json?download=1&t=${Date.now()}`;
  console.log('🌐 Загружаем комнату из:', url);
  
  const resp = await fetch(url);
  
  if (!resp.ok) {
    console.log('❌ Комната не найдена, статус:', resp.status);
    return res.status(404).json({ error: 'Room not found' });
  }
  
  const room = await resp.json();
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

  await put(roomKey(code), JSON.stringify(room, null, 2), {
    contentType: 'application/json',
    access: 'public',
    addRandomSuffix: false,
    cacheControlMaxAge: 0,
    allowOverwrite: true,
  });

  console.log('✅ Данные сохранены в Blob');
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
