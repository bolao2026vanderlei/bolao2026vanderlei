// api/admin.js — Vercel Serverless Function
// Service role key fica APENAS aqui, nunca no browser

const SUPA_URL    = 'https://kqtjievcjocjuyswwvow.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANON_KEY    = process.env.SUPABASE_ANON_KEY;
const ADMIN_EMAIL = 'silvaveterinario@gmail.com';

// Headers com service role — bypassa RLS completamente
const serviceHeaders = {
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal'
};

// Verifica se o token JWT pertence ao admin
async function verificarAdmin(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.replace('Bearer ', '');
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

async function supaFetch(method, path, body, extraHeaders = {}) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    method,
    headers: { ...serviceHeaders, ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Valida admin
  const isAdmin = await verificarAdmin(req.headers.authorization);
  if (!isAdmin) return res.status(403).json({ error: 'Acesso negado — apenas admin' });

  const { action, jogo_id, gol_casa, gol_fora } = req.body;

  // ── UPSERT RESULTADO ────────────────────────────────────────────────────────
  if (action === 'upsert_resultado') {
    // 1. Verifica se já existe
    const checkRes = await fetch(
      `${SUPA_URL}/rest/v1/resultados?jogo_id=eq.${jogo_id}&select=jogo_id`,
      { headers: serviceHeaders }
    );
    const existing = await checkRes.json();

    let r;
    if (existing.length > 0) {
      // UPDATE
      r = await supaFetch('PATCH', `resultados?jogo_id=eq.${jogo_id}`, {
        gol_casa, gol_fora, inserido_em: new Date().toISOString()
      });
    } else {
      // INSERT
      r = await supaFetch('POST', 'resultados', {
        jogo_id, gol_casa, gol_fora, inserido_em: new Date().toISOString()
      });
    }

    if (!r.ok) return res.status(500).json({ error: r.text });

    // 2. Bloqueia todos os palpites deste jogo automaticamente
    const bloqRes = await supaFetch(
      'PATCH',
      `palpites?jogo_id=eq.${jogo_id}`,
      { bloqueado: true },
      { 'Prefer': 'return=minimal' }
    );

    if (!bloqRes.ok) {
      console.error(`Aviso: falha ao bloquear palpites do jogo ${jogo_id}:`, bloqRes.text);
      // Não retorna erro — o resultado foi salvo, o bloqueio é secundário
    }

    return res.status(200).json({
      success: true,
      palpites_bloqueados: bloqRes.ok
    });

  // ── DELETE RESULTADO ────────────────────────────────────────────────────────
  } else if (action === 'delete_resultado') {
    // 1. Remove o resultado
    const r = await supaFetch('DELETE', `resultados?jogo_id=eq.${jogo_id}`);
    if (!r.ok) return res.status(500).json({ error: r.text });

    // 2. Desbloqueia os palpites deste jogo (permite corrigir antes de reinserir)
    const desbloqRes = await supaFetch(
      'PATCH',
      `palpites?jogo_id=eq.${jogo_id}`,
      { bloqueado: false }
    );

    if (!desbloqRes.ok) {
      console.error(`Aviso: falha ao desbloquear palpites do jogo ${jogo_id}`);
    }

    return res.status(200).json({
      success: true,
      palpites_desbloqueados: desbloqRes.ok
    });

  } else {
    return res.status(400).json({ error: 'Acao invalida' });
  }
}
