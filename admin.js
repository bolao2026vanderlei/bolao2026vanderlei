// api/admin.js — Vercel Serverless Function
// A service role key fica APENAS aqui no servidor, nunca no browser

const SUPA_URL    = 'https://kqtjievcjocjuyswwvow.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANON_KEY    = process.env.SUPABASE_ANON_KEY;
const ADMIN_EMAIL = 'silvaveterinario@gmail.com';

async function verificarAdmin(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.replace('Bearer ', '');
  
  // Verifica o token JWT com a API do Supabase
  const res = await fetch(`${SUPA_URL}/auth/v1/user`, {
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!res.ok) return false;
  const user = await res.json();
  return user.email === ADMIN_EMAIL;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({error: 'Method not allowed'});

  // Verifica se é admin autenticado
  const isAdmin = await verificarAdmin(req.headers.authorization);
  if (!isAdmin) {
    return res.status(403).json({error: 'Acesso negado — apenas admin'});
  }

  const { action, jogo_id, gol_casa, gol_fora } = req.body;

  let result;
  
  if (action === 'upsert_resultado') {
    // Verifica se já existe
    const checkRes = await fetch(
      `${SUPA_URL}/rest/v1/resultados?jogo_id=eq.${jogo_id}`,
      { headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` } }
    );
    const existing = await checkRes.json();
    
    if (existing.length > 0) {
      result = await fetch(
        `${SUPA_URL}/rest/v1/resultados?jogo_id=eq.${jogo_id}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SERVICE_KEY,
            'Authorization': `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({ gol_casa, gol_fora, inserido_em: new Date().toISOString() })
        }
      );
    } else {
      result = await fetch(
        `${SUPA_URL}/rest/v1/resultados`,
        {
          method: 'POST',
          headers: {
            'apikey': SERVICE_KEY,
            'Authorization': `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({ jogo_id, gol_casa, gol_fora, inserido_em: new Date().toISOString() })
        }
      );
    }
    
    if (!result.ok) {
      const err = await result.text();
      return res.status(500).json({error: err});
    }
    return res.status(200).json({success: true});
    
  } else if (action === 'delete_resultado') {
    result = await fetch(
      `${SUPA_URL}/rest/v1/resultados?jogo_id=eq.${jogo_id}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        }
      }
    );
    
    if (!result.ok) {
      const err = await result.text();
      return res.status(500).json({error: err});
    }
    return res.status(200).json({success: true});
    
  } else {
    return res.status(400).json({error: 'Acao invalida'});
  }
}
