// api/tournament.js
import { put } from '@vercel/blob';

const roomKey = (code) => `tournaments/${code}.json`;
const BLOB_BASE =
  'https://awj11dvu2fwabtgr.public.blob.vercel-storage.com/tournaments';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST' });
  }

  try {
    const { code, action, room } = req.body || {};
    if (!code || !action) {
      return res.status(400).json({ error: 'Missing code or action' });
    }

    // 🔹 получить комнату
    if (action === 'get_room') {
      const url = `${BLOB_BASE}/${code}.json?download=1`;
      const resp = await fetch(url); // серверный fetch, CORS не мешает [web:248]

      if (!resp.ok) {
        return res.status(resp.status).json({ error: 'Room not found' });
      }

      const data = await resp.json();
      return res.status(200).json(data);
    }

    // 🔹 сохранить комнату
    if (action === 'save_room') {
      if (!room) {
        return res.status(400).json({ error: 'Missing room' });
      }

      await put(roomKey(code), JSON.stringify(room, null, 2), {
        contentType: 'application/json',
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
      });

      return res.json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('Tournament API error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
