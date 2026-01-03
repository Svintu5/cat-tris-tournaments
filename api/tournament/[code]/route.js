import { put, get } from '@vercel/blob';

export async function POST(request, { params }) {
  const { code } = params;
  const { action, playerName, score, host, name: roomName } = await request.json();
  
  try {
    // Загружаем комнату из Blob
    let roomData = { players: [], scores: {} };
    try {
      const blob = await get(`${code}.json`);
      roomData = JSON.parse(blob?.blob?.body || '{}');
    } catch {}

    // CREATE — хост создаёт комнату
    if (action === 'create') {
      const newRoom = {
        code, 
        host, 
        name: roomName || 'Cat Battle', 
        status: 'waiting',
        players: [host], 
        scores: { [host]: 0 },
        created: Date.now()
      };
      await put(`${code}.json`, JSON.stringify(newRoom), {
        access: 'public', 
        token: process.env.BLOB_READ_WRITE_TOKEN
      });
      return Response.json(newRoom);
    }
    
    // JOIN — игрок присоединяется
    if (action === 'join') {
      if (roomData.status === 'started') {
        return Response.json({ room: roomData });
      }
      if (!roomData.players?.includes(playerName)) {
        roomData.players.push(playerName);
        roomData.scores[playerName] = 0;
        await put(`${code}.json`, JSON.stringify(roomData), {
          access: 'public', 
          token: process.env.BLOB_READ_WRITE_TOKEN
        });
      }
      return Response.json({ room: roomData });
    }
    
    // SUBMIT_SCORE — сохранение результата игры
    if (action === 'submit_score') {
      roomData.scores[playerName] = score;
      roomData.status = 'finished';
      await put(`${code}.json`, JSON.stringify(roomData), {
        access: 'public', 
        token: process.env.BLOB_READ_WRITE_TOKEN
      });
      
      // Формируем лидерборд
      const leaderboard = Object.entries(roomData.scores)
        .sort(([,a], [,b]) => b - a)
        .map(([name, score], i) => ({ rank: i+1, name, score }));
        
      return Response.json({ leaderboard });
    }
    
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
