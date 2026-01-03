// api/tournament.js
import { put } from '@vercel/blob';

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

    // Единственное действие: сохранить целую комнату
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
