import { put, get } from '@vercel/blob';

const roomKey = (code) => `tournaments/${code}.json`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST' });
  }

  try {
    const { code, action, room } = req.body || {};
    if (!code || !action) {
      return res.status(400).json({ error: 'Missing code or action' });
    }

    if (action === 'get_room') {
      const result = await get(roomKey(code)); // читает JSON с сервера [web:248]
      if (!result || !result.blob) {
        return res.status(404).json({ error: 'Room not found' });
      }

      const text = await result.blob.text();
      const data = JSON.parse(text);
      return res.status(200).json(data);
    }

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
