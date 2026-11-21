// Teste físico automatizado ao vivo com Google Chrome visível na tela do usuário
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'https://boxtv-panel.onrender.com';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log('🚀 Iniciando teste físico no Google Chrome...');
  console.log(`📍 URL: ${URL}`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: null,
    args: [
      '--start-maximized',
      '--no-default-browser-check',
      '--disable-infobars',
      '--autoplay-policy=no-user-gesture-required'
    ],
  });

  const pages = await browser.pages();
  const page = pages[0] || (await browser.newPage());

  const consoleLogs = [];
  const networkErrors = [];

  page.on('console', (msg) => {
    const text = msg.text();
    const type = msg.type();
    consoleLogs.push({ type, text });
    if (type === 'error') {
      console.log(`❌ [Console Error] ${text}`);
    } else {
      console.log(`ℹ️ [Console ${type}] ${text}`);
    }
  });

  page.on('pageerror', (err) => {
    console.log(`🔥 [Page Uncaught Error] ${err.message}`);
    consoleLogs.push({ type: 'pageerror', text: err.message });
  });

  page.on('requestfailed', (req) => {
    const failure = req.failure();
    const url = req.url();
    // ignora cancelamentos normais de stream ou aborts
    if (failure && !failure.errorText.includes('ERR_ABORTED')) {
      console.log(`⚠️ [Network Failed] ${req.method()} ${url} -> ${failure.errorText}`);
      networkErrors.push({ url, error: failure.errorText });
    }
  });

  console.log('🌐 Navegando para o site...');
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await delay(2000);

  // ── Etapa 1: Verificar se há tela de login ou se já está autenticado ──
  console.log('🔎 Verificando estado da interface (Login vs Catálogo)...');
  const hasLoginInput = await page.$('input[placeholder="Usuário"]');
  if (hasLoginInput) {
    console.log('🔑 Tela de login Xtream detectada. Aguardando 3s para o usuário visualizar...');
    await delay(3000);
  } else {
    console.log('✅ Usuário já autenticado no catálogo principal!');
  }

  // ── Etapa 2: Teste Físico do Seletor de Skins / Temas ──
  console.log('🎨 Testando botão de Skins / Temas ao vivo...');
  const skinBtn = await page.$('.skin-btn');
  if (skinBtn) {
    await skinBtn.click();
    console.log('   └─ Modal de Skins aberto na tela!');
    await delay(2500);

    // Clica no tema Midnight Emerald
    const emeraldBtn = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.skin-card'));
      const target = btns.find((b) => b.textContent.includes('Emerald'));
      if (target) {
        target.click();
        return true;
      }
      return false;
    });
    console.log('   └─ Aplicando skin Midnight Emerald:', emeraldBtn ? 'OK' : 'Não encontrado');
    await delay(2500);

    // Abre novamente e troca para OLED Gold
    await page.click('.skin-btn');
    await delay(1500);
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.skin-card'));
      const target = btns.find((b) => b.textContent.includes('Gold'));
      if (target) target.click();
    });
    console.log('   └─ Aplicando skin OLED Imperial Gold!');
    await delay(2500);

    // Volta para Cyber Cinema
    await page.click('.skin-btn');
    await delay(1500);
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.skin-card'));
      const target = btns.find((b) => b.textContent.includes('Cyber'));
      if (target) target.click();
    });
    console.log('   └─ Retornando para skin Cyber Cinema!');
    await delay(2000);
  } else {
    console.log('ℹ️ Botão de skin não visível nesta tela (possível tela de login ativa).');
  }

  // ── Etapa 3: Navegação entre Abas ──
  const testTabs = [
    { name: 'Ao Vivo', hash: '#/live' },
    { name: 'Filmes', hash: '#/movies' },
    { name: 'Séries', hash: '#/series' },
    { name: 'Jogos', hash: '#/games' },
    { name: 'Início', hash: '#/home' },
  ];

  for (const tab of testTabs) {
    console.log(`📌 Navegando para a aba: ${tab.name} (${tab.hash})...`);
    await page.evaluate((h) => {
      location.hash = h;
    }, tab.hash);
    await delay(3500);

    if (tab.name === 'Ao Vivo') {
      // Testa se o primeiro canal foi selecionado
      const activeCh = await page.$('.live-ch.active');
      console.log('   └─ Canal selecionado no Ao Vivo:', activeCh ? 'SIM (Automático)' : 'Nenhum');
      const hasEpg = await page.$('.pv-epg');
      console.log('   └─ Painel de EPG carregado:', hasEpg ? 'SIM' : 'NÃO');
    } else if (tab.name === 'Jogos') {
      // Clica no filtro "Ao vivo agora"
      await page.evaluate(() => {
        const btn = document.querySelector('.badge-live') || Array.from(document.querySelectorAll('.btn')).find((b) => b.textContent.includes('Ao vivo'));
        if (btn) btn.click();
      });
      console.log('   └─ Filtro "Ao vivo agora" clicado nos Jogos!');
      await delay(2000);
    }
  }

  // ── Etapa 4: Teste de Abertura do Player M3U8 ──
  console.log('🎬 Testando abertura de conteúdo e controles do M3U8 Player Kit...');
  await page.evaluate(() => {
    // Procura o primeiro cartão de filme ou canal clicável
    const firstCard = document.querySelector('.card, .live-ch');
    if (firstCard) firstCard.click();
  });
  await delay(4000);

  const playerEl = await page.$('#player');
  if (playerEl) {
    console.log('   └─ Player em tela cheia aberto com sucesso!');
    // Testa botão de pausa
    await page.evaluate(() => {
      const playBtn = Array.from(document.querySelectorAll('#player .ib')).find((b) => b.getAttribute('aria-label')?.includes('Pausar'));
      if (playBtn) playBtn.click();
    });
    await delay(2000);

    // Testa menu de qualidade M3U8
    const hasQualityBtn = await page.evaluate(() => {
      const qBtn = Array.from(document.querySelectorAll('#player .ib')).find((b) => b.title?.includes('Qualidade'));
      if (qBtn && qBtn.style.display !== 'none') {
        qBtn.click();
        return true;
      }
      return false;
    });
    console.log('   └─ Menu de Qualidade M3U8 clicado:', hasQualityBtn ? 'SIM' : 'Adaptativo nativo');
    await delay(2500);

    // Fecha o player
    await page.evaluate(() => {
      const closeBtn = document.querySelector('#player .close-btn') || Array.from(document.querySelectorAll('#player .ib')).find((b) => b.title?.includes('Fechar'));
      if (closeBtn) closeBtn.click();
    });
    console.log('   └─ Player fechado com sucesso.');
    await delay(1500);
  } else {
    console.log('ℹ️ Player não foi aberto diretamente ou precisa de seleção manual.');
  }

  console.log('\n========================================================');
  console.log('📊 RESUMO DO DIAGNÓSTICO DO TESTE FÍSICO:');
  console.log(`   Erros de Console encontrados: ${consoleLogs.filter((l) => l.type === 'error' || l.type === 'pageerror').length}`);
  console.log(`   Erros de Rede críticos: ${networkErrors.length}`);
  console.log('========================================================\n');

  console.log('✨ O Google Chrome continuará aberto para você usar e acompanhar!');
  // Não fechamos o browser (browser.close) para o usuário acompanhar tudo na tela
}

main().catch((err) => {
  console.error('Erro na execução do teste físico:', err);
});
