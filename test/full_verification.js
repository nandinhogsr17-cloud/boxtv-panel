// Teste Completo Automatizado da API e Plataforma BoxTv
const BASE = 'https://boxtv-panel.onrender.com';
const MAC = '02:AA:BB:CC:DD:EE';
const KEY = 'TESTSUITE123';
const USER = process.env.XTREAM_TEST_USER || '';
const PASS = process.env.XTREAM_TEST_PASSWORD || '';

const headers = {
  'X-MAC': MAC,
  'X-Key': KEY,
  'Accept': 'application/json'
};

async function testSuite() {
  console.log('====================================================');
  console.log('🚀 INICIANDO TESTE COMPLETO DO BOXTV (RENDER CLOUD)');
  console.log('Servidor:', BASE);
  console.log('Usuário:', USER);
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  async function check(name, fn) {
    process.stdout.write(`[TEST] ${name} ... `);
    const t0 = Date.now();
    try {
      const res = await fn();
      const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
      console.log(`✅ OK (${elapsed}s) - ${res}`);
      passed++;
    } catch (e) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
      console.log(`❌ FALHOU (${elapsed}s): ${e.message}`);
      failed++;
    }
  }

  // 1. Healthcheck
  await check('1. Servidor Online (/healthz)', async () => {
    const res = await fetch(`${BASE}/healthz`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    if (!j.ok) throw new Error('Servidor offline');
    return 'Servidor respondendo perfeitamente';
  });

  // 2. Configuração do Servidor Inteligente
  await check('2. Configuração pública (/api/v1/activate/config)', async () => {
    const res = await fetch(`${BASE}/api/v1/activate/config`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    return `Host: ${j.serverHost}`;
  });

  // 3. Login Xtream real: credenciais apenas pelo ambiente local de teste.
  let loginData = null;
  await check('3. Login do Usuário (/api/v1/auth/login)', async () => {
    const res = await fetch(`${BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: USER, password: PASS, mac: MAC, key: KEY })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    loginData = await res.json();
    if (loginData.status !== 'active') throw new Error(`Status ${loginData.status}`);
    const expYear = new Date(loginData.expiresAt).getFullYear();
    return `Login ativo! Vencimento: ${expYear} | M3U: ${loginData.m3u_url}`;
  });

  // 4. Verificação de Status (/api/v1/status)
  await check('4. Botão Conta / Status (/api/v1/status)', async () => {
    const res = await fetch(`${BASE}/api/v1/status`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    return `Aparelho ativo, Usuário: ${j.name}`;
  });

  // 5. Aba Início (/api/v1/home)
  await check('5. Aba Início e Carregamento do Catálogo (/api/v1/home)', async () => {
    const res = await fetch(`${BASE}/api/v1/home`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    const rows = j.rows ? j.rows.length : 0;
    const hero = j.hero ? j.hero.title : 'Nenhum';
    return `Destaque: "${hero}" | Fileiras na tela inicial: ${rows}`;
  });

  // 6. Aba Ao Vivo (/api/v1/browse?type=live)
  await check('6. Aba Ao Vivo / Canais (/api/v1/browse?type=live)', async () => {
    const res = await fetch(`${BASE}/api/v1/browse?type=live&offset=0&limit=15`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    return `${j.items?.length || 0} canais recebidos | ${j.groups?.length || 0} categorias de canais`;
  });

  // 7. Aba Filmes (/api/v1/browse?type=movie)
  await check('7. Aba Filmes (/api/v1/browse?type=movie)', async () => {
    const res = await fetch(`${BASE}/api/v1/browse?type=movie&offset=0&limit=15`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    const titulos = (j.items || []).slice(0, 2).map(i => i.title).join(', ');
    return `${j.items?.length || 0} filmes recebidos (Exemplos: ${titulos}) | ${j.groups?.length || 0} categorias`;
  });

  // 8. Aba Séries (/api/v1/browse?type=series)
  await check('8. Aba Séries (/api/v1/browse?type=series)', async () => {
    const res = await fetch(`${BASE}/api/v1/browse?type=series&offset=0&limit=15`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    const titulos = (j.items || []).slice(0, 2).map(i => i.title).join(', ');
    return `${j.items?.length || 0} séries recebidas (Exemplos: ${titulos}) | ${j.groups?.length || 0} categorias`;
  });

  // 9. Aba Favoritos (/api/v1/favorites)
  await check('9. Aba Favoritos (/api/v1/favorites)', async () => {
    const res = await fetch(`${BASE}/api/v1/favorites`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    return `Sucesso na rota de favoritos (${j.items?.length || 0} favoritos salvos)`;
  });

  // 10. Aba Jogos (/api/v1/games)
  await check('10. Aba Jogos (/api/v1/games)', async () => {
    const res = await fetch(`${BASE}/api/v1/games`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    return `Sucesso na rota de jogos (${j.games?.length || 0} partidas cadastradas)`;
  });

  // 11. Aba Buscar (/api/v1/search)
  await check('11. Aba Buscar (/api/v1/search?q=Vingadores)', async () => {
    const res = await fetch(`${BASE}/api/v1/search?q=Vingadores`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    const moviesFound = j.movie ? j.movie.length : 0;
    const seriesFound = j.series ? j.series.length : 0;
    return `Busca funcionando! ${moviesFound} filmes e ${seriesFound} séries encontrados`;
  });

  console.log('\n====================================================');
  console.log(`📊 RESULTADO FINAL: ${passed} PASSOU | ${failed} FALHOU`);
  console.log('====================================================');
}

testSuite();
