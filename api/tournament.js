export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST' });
  
  const { code, action, playerName, score, host, name: roomName } = req.body;
  
  // ТЕСТОВЫЙ РЕЖИМ — без Blob сначала
  if (action === 'create') {
    return res.json({ 
      code, 
      host, 
      name: roomName || 'Cat Battle', 
      status: 'waiting',
      players: [host], 
      scores: { [host]: 0 }
    });
  }
  
  if (action === 'join') {
    return res.json({ 
      room: {
        code,
        name: 'Test Room', 
        status: 'waiting',
        players: [host || playerName]
      }
    });
  }
  
  if (action === 'submit_score') {
    return res.json({
      leaderboard: [
        { rank: 1, name: playerName || 'Winner', score }
      ]
    });
  }
  
  res.status(400).json({ error: 'Unknown action' });
}
