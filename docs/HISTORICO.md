# Histórico de versões

# App IPTV (Site + Android TV / Fire Stick / Google TV) + Painel

Projetos que trabalham juntos:

| Pasta | O que é |
|---|---|
| `panel/` | Painel + API (Node.js 22, sem dependências). Cadastra MAC, guarda a lista M3U de cada cliente, valida/expira acessos, sincroniza favoritos e "continuar assistindo", monta a aba "Jogos de hoje". |
| `panel/web/` | **Site (navegador)**: o mesmo app em HTML/JS puro, servido pelo próprio painel em `/`. Funciona em PC, celular e no navegador de TVs/Fire Stick (Silk). Veja a seção 7. |
| `panel/android/` | App Android TV (Kotlin + Jetpack Compose + Media3/ExoPlayer). Visual estilo Netflix, controle remoto, ativação por MAC. |

## Como funciona (fluxo do cliente)

1. O cliente instala o app e abre. O app cria o **MAC** e a **chave** dele e mostra na tela ("Ative este aparelho").
2. Você abre o painel (`/admin`), o aparelho já aparece como **Aguardando**. Clique em **Editar**, cole o link da **M3U**, escolha a validade e salve.
3. Em até 5 segundos o app libera sozinho e mostra a home.

O painel baixa e organiza a M3U (canais, filmes, séries, temporadas) e entrega JSON pronto ao app — listas de 50 mil itens abrem rápido.

### MAC do app
O Android não deixa o app ler o MAC real, então o app gera um MAC aleatório próprio (bit "administrado localmente") e uma chave, guardados só no aparelho. **Se o app for desinstalado ou os dados forem limpos, o MAC muda** (o backup está desligado); basta entrar de novo com usuário e senha. O app entra sozinho quando já há login salvo; há botão **Sair da conta** em Conta.

## 1. Rodar o painel

```bash
cd panel
# Opcional: copie .env.example para .env e preencha as variáveis locais
ADMIN_PASSWORD='uma-senha-forte' node server.js     # Node 22.13 ou mais novo
# abre http://localhost:8080/admin  (usuário: admin)
```

Variáveis (veja `.env.example`): `PORT`, `DATA_DIR`, `ADMIN_USER`, `ADMIN_PASSWORD`, `FOOTBALL_DATA_TOKEN`, `FOOTBALL_COMPETITIONS`, `TMDB_KEY`, `TZ_NAME`, `CATALOG_TTL_MIN`, `AUTO_REGISTER`, `TRUST_PROXY` e, para o site, `CORS_ORIGIN`, `WEB_SECRET`, `STREAM_UA`, `ALLOW_PRIVATE_STREAMS`.

- **Produção:** ponha atrás de HTTPS (Caddy/Nginx/Cloudflare) e use `TRUST_PROXY=1`. Sem `ADMIN_PASSWORD` o painel gera uma senha temporária a cada execução.
- **Docker:** `docker build -t iptv-panel panel && docker run -d -p 8080:8080 -v iptv-data:/data -e ADMIN_PASSWORD=... iptv-panel`
- **Testes:** `cd panel && npm test` (sobe o servidor de verdade: 85 do painel/API + 70 do site/proxy + 97 da ativação + 21 das integrações + 11 de segurança).
- `AUTO_REGISTER=0` faz o painel recusar MACs que você não cadastrou antes.

## 2. Compilar o app

Precisa do Android Studio (Ladybug ou mais novo) e JDK 17.

1. Abra a pasta `panel/android/` no Android Studio.
2. Edite `panel/android/gradle.properties`: `panelUrl` (endereço do seu painel, de preferência `https://`).
3. Troque o nome em `res/values/strings.xml`, o ícone (`drawable/ic_launcher.xml`) e o banner (`drawable/banner.xml`).
4. **Build → Build APK(s)**, ou `cd panel/android && ./gradlew assembleRelease -PpanelUrl=https://seu-painel.com` (assine o APK para distribuir).
5. Instalar no Fire Stick: app **Downloader** apontando para o APK, ou `adb connect IP && adb install app-release.apk`.

> **Importante:** o ambiente em que gerei este código não tinha acesso ao Android SDK, então o **app não foi compilado nem testado em TV**. O painel foi testado de ponta a ponta; o app foi escrito com cuidado para usar só APIs estáveis, mas é normal o primeiro build pedir um ajuste pequeno (import, versão). Se aparecer erro, me mande a mensagem que eu corrijo.

## 3. Jogos de hoje

- **Manual (sempre funciona):** no admin, seção "Jogos de hoje". Em *Canais* escreva onde passa (ex.: `SporTV, Premiere`).
- **Automático (opcional):** crie uma chave grátis em football-data.org e defina `FOOTBALL_DATA_TOKEN` (e, se quiser, `FOOTBALL_COMPETITIONS=BSA,CL`). Essa API traz os jogos mas **não** diz em qual canal passam, e eu não pude testar essa chamada com a API real (só com resposta simulada) — confira com seu token.
- O painel liga cada jogo aos **canais da playlist do cliente**: pelo nome da emissora (SporTV, Premiere, ESPN…) e por canais de evento que tenham o nome dos dois times (ex.: "Flamengo x Palmeiras"). No app, abrir o jogo toca o canal; ▲▼ troca entre os canais encontrados.

## 4. Capas e sinopses (opcional)

Com `TMDB_KEY`, a tela de detalhe mostra sinopse, nota e fundo. **Atenção:** o TMDB é gratuito só para uso **não comercial**; para vender/revender o app é preciso acordo comercial com eles (ou trocar a fonte, por exemplo TheTVDB, que tem faixa gratuita com atribuição para receita baixa — confira os termos atuais). Sem a chave, o app usa só as capas que vêm na própria M3U. Se usar o TMDB, mostre a atribuição exigida por eles.

## 5. Controle remoto

| Onde | Tecla | Ação |
|---|---|---|
| Qualquer tela | setas / OK | navegar / abrir |
| Lista de canais | MENU | favoritar canal |
| Player (canal) | ▲ ▼ ou CH+ CH- | trocar canal |
| Player (canal) | MENU | favoritar |
| Player (filme/episódio) | ◀ ▶ | -10 s / +10 s |
| Player | OK / play-pause | pausar / continuar |
| Player | VOLTAR | sair (salva onde parou) |

## 6. API do app (resumo)

Todas as rotas (exceto `register` e `healthz`) exigem os cabeçalhos `X-Mac` e `X-Key`. Dispositivo não ativo recebe `403 {error:"device_not_active", status:"pending|expired|blocked"}`.

`POST /api/v1/register` · `GET /status` · `GET /home` · `GET /browse?type=live|movie|series&group=&offset=&limit=` · `GET /search?q=` · `GET /series/:id` · `GET /item/:id` · `GET /meta?id=` · `GET|POST /favorites` · `DELETE /favorites/:id` · `POST /progress` · `GET /games` · `POST /refresh` · (site) `GET /web/token` · `GET /web/play?id=` · (público) `POST /activate {mac,key,m3uUrl | xtream:{host,user,pass}, dryRun?}`

## 7. Site (versão navegador)

Abra o endereço do painel (ex.: `https://seu-painel.com/`): é o site. O `/admin` continua sendo o painel.

**Como funciona:** o navegador cria um MAC e uma chave **só dele** (guardados no `localStorage`) e mostra na tela de ativação; você ativa pelo `/admin` igual ao app de TV. A tela libera sozinha. Favoritos, "continuar assistindo" e jogos de hoje usam a mesma conta/API do app.

**Por que o painel faz o proxy do vídeo:** o navegador só toca stream se o servidor do provedor mandar CORS (quase nenhum manda) e bloqueia `http://` dentro de página `https://`. Então o painel busca o vídeo e entrega ao navegador (`/p/v`) e as capas (`/p/i`). Consequência: **o tráfego de vídeo dos clientes do site passa pela sua VM**. Cada tela assistindo = a banda do stream (≈2–8 Mbps) saindo do seu servidor; dimensione a VM/plano para isso. O app Android toca direto do provedor e não gasta a banda do painel.

**O que toca no navegador**

| Formato | Resultado |
|---|---|
| HLS (`.m3u8`) | toca (hls.js) |
| Canal ao vivo `.ts` (o mais comum) | toca (mpegts.js), com reconexão automática |
| `.mp4` / `.webm` | toca nativo, com avançar/voltar e retomada |
| `.mkv` / `.avi` | em geral **não toca** (depende do navegador); o site avisa. Use o app Android |
| Vídeo com áudio AC3/E-AC3/DTS | pode ficar sem som no navegador |

Os players **hls.js** e **mpegts.js** são carregados do CDN jsdelivr (versões fixas). Para não depender do CDN, copie os dois arquivos para `panel/web/vendor/` (veja o `LEIA-ME.txt` lá). Se nenhum dos dois estiver acessível, o site mostra uma mensagem clara no player.

**Teclado / controle remoto:** setas navegam, Enter abre. No player: espaço/Enter pausa, ◀ ▶ ±10 s, ▲ ▼ troca de canal (ou volume em filme), `F` tela cheia, `M` mudo, Esc/Voltar sai, tecla de menu favorita. Clique direito (ou toque longo no celular de alguns navegadores) num cartão favorita.

**Segurança do proxy:** exige o token assinado do aparelho (vale 12 h e deixa de valer na hora se você bloquear/expirar o aparelho), aceita só `http/https`, **bloqueia endereços internos** (localhost, 10.x, 192.168.x, 169.254.x…) na hora da conexão e limita redirecionamentos e tamanho. Não ligue `ALLOW_PRIVATE_STREAMS=1` em servidor público.

**Editar o visual:** o site é HTML + CSS + JS puro, sem build (`panel/web/`): `style.css` (cores no `:root`), `config.js` (nome do app), `js/pages.js` (telas). Dá para colar esses arquivos no Google AI Studio e pedir mudanças, e depois copiar de volta. O Lovable gera os próprios projetos React, então ele serve de inspiração/prompt, mas não importa esta pasta diretamente.

**Site em outro endereço (opcional):** se hospedar o `web/` em outro lugar, em `config.js` coloque `apiBase: 'https://seu-painel.com'` e no painel `CORS_ORIGIN=https://endereco-do-site`. O vídeo continua passando pelo painel.

**Limites desta versão:** não testei com hls.js/mpegts.js reais (o ambiente onde construí não tinha acesso ao CDN); o painel e o fluxo do site foram testados de ponta a ponta no Chromium com vídeo mp4, e o proxy de HLS/TS foi testado no servidor (reescrita de playlist, Range, sem extensão, redirecionamentos). Falta uma checagem com um provedor real. Não foi testado em Safari/Firefox nem em navegador de TV.

### Lista de clientes no `/admin`
Cada aparelho aparece com **nome do cliente**, MAC, chave, status, validade ("em 3 d" / "venceu há 3 d"), último acesso, observações e a lista. Dá para: buscar por nome/MAC/observação; filtrar clicando em Ativos / Aguardando / Vencidos / Bloqueados / "Vencem em 7 dias" / "Ativados pelo cliente"; ordenar (recentes, nome, vence primeiro, último acesso); mudar o nome no ✎; copiar MAC/chave; editar, renovar +30 d, testar a lista, bloquear, excluir; **Exportar CSV** (sem o link das listas) e **Copiar link de ativação** para mandar ao cliente.

## 8. Ativação feita pelo cliente (MAC + chave + lista)

Além do `/admin`, o **próprio cliente** (ou outra pessoa que tenha o MAC e a chave, de qualquer lugar) pode colocar a lista:

- **Dentro do app** (site e Android): na tela "Ative este aparelho" há o campo "Link da lista M3U".
- **Página pública `/ativar`** (ex.: `https://seu-painel.com/ativar`): a pessoa digita MAC + chave + link da lista, ou **servidor + usuário + senha** (o painel monta o link `get.php` sozinho). O link `.../ativar?mac=...&key=...` já abre preenchido.

**O que o painel confere antes de ativar (nada é gravado se falhar):**
1. MAC existe (o app foi aberto uma vez) e a **chave confere** (senão `key_mismatch`; muitas tentativas bloqueiam o IP).
2. Aparelho não está bloqueado.
3. O link é http(s) válido e **não aponta para rede interna** (anti-SSRF).
4. A lista **baixa** (tamanho máximo 250 MB), **é M3U de verdade** (recusa página HTML, JSON de login, texto solto, lista vazia) e tem canais/filmes/séries.
5. Testa alguns streams: se nenhum abrir **a lista é ativada mesmo assim, mas com aviso** (o seu provedor pode liberar só o IP do aparelho, não o do servidor).

Se passar: grava, guarda a lista já pronta no cache (o app abre rápido) e o app que estava esperando **abre sozinho em até 5 s**. Se o aparelho já tinha lista e falhar, **a lista antiga continua valendo**. Cada ativação do cliente fica anotada nas "notas" do aparelho no admin (data, IP).

**Pontos de decisão seus (variáveis):**
- `SELF_DAYS` (padrão `0`): quando o cliente ativa sozinho e você não definiu validade, o aparelho fica **sem vencimento**. Se vende acesso, ou defina a validade no admin antes, ou use `SELF_DAYS=7` (teste) / `SELF_ACTIVATE=0` (só você ativa).
- Aparelho **vencido não é revivido** pelo cliente: ele grava a lista mas continua "expirado" até você renovar. Aparelho **bloqueado** não ativa.
- `SELF_REPLACE=0` deixa o cliente ativar só uma vez; trocar a lista depois fica só com você.
- Quem tem MAC + chave controla a lista daquele aparelho: trate a chave como senha.

## 9. APIs reais (tela "Integrações" no /admin)

Cole as chaves no `/admin` → **Integrações**, clique **Salvar** e **Testar**: o painel faz uma chamada de verdade e mostra se funcionou (token recusado, campeonato fora do plano, limite por minuto, sem internet). As chaves ficam salvas no painel (aparecem mascaradas), valem na hora sem reiniciar e têm prioridade sobre as variáveis de ambiente.

| Integração | Serve para | Observações |
|---|---|---|
| **football-data.org** (token grátis) | "Jogos de hoje" automáticos, com escudos, horário e placar | Plano grátis: 10 pedidos/min e só alguns campeonatos. A API **não informa em que canal passa**: o painel liga o jogo aos canais da lista pelo nome da emissora e pelos nomes dos times; se quiser o canal certo, cadastre o jogo na mão (os manuais têm prioridade). |
| **TMDB** (chave v3 ou token v4) | sinopse, nota e capa nos detalhes de filme/série | Grátis só para uso **não comercial** e exige atribuição. |

**Fora do ar nesta versão:** guia de programação (EPG/XMLTV) e placar ao vivo com canal oficial. Eu não consegui chamar as APIs reais de dentro do ambiente onde construí (sem internet de saída): conferi o formato das respostas na documentação do football-data.org e testei o painel com respostas simuladas. O primeiro teste de verdade é o botão **Testar** na sua instalação.

## Segurança

- Chaves e senha comparadas em tempo constante; limite de tentativas por IP; admin protegido por senha (Basic) **e** cabeçalho anti-CSRF.
- Use sempre HTTPS no painel. O app aceita `http://` apenas porque muitos provedores de IPTV entregam os streams assim.
- Publique o app **sem nenhum conteúdo embutido** (só player + ativação). Você é responsável pelas listas que seus clientes usam.

## Próximos passos sugeridos

- Plano B de player (libVLC) para streams que o ExoPlayer não abrir.
- Guia de programação (EPG/XMLTV) nos canais.
- Perfis de usuário e PIN para conteúdo adulto.
- Notificação de "vai começar" para o time favorito.


## GitHub e credenciais

O remoto Git fica sem token embutido na URL. Use Git Credential Manager/GitHub CLI para operações Git. Nunca coloque tokens em `origin`, commits, `.env.example` ou arquivos versionados. O token anteriormente exposto deve ser revogado. Para testar um token novo, defina `GH_TOKEN` temporariamente no ambiente ou autentique com `gh auth login`; depois execute `cd panel && npm run test:github`. O teste verifica leitura e permissão de escrita no repositório sem exibir ou salvar o token.


## Segurança — mudanças recentes

- Removidas as rotas públicas antigas `/api/v1/devices*` e `/api/v1/config/server` (expunham chaves e senhas Xtream e permitiam trocar o servidor). Use o `/admin`. O `test/security-tests.js` garante que não voltem.
- Login Xtream agora também é limitado por IP (além do MAC).
- No Render o `TRUST_PROXY` liga sozinho; o `render.yaml` fica na raiz do repositório com `rootDir: panel`. Defina `ADMIN_PASSWORD` no painel do Render. No plano grátis o disco é efêmero: aparelhos e banco se perdem a cada reinício.

## Versão do celular e limpeza do cliente

- O app (celular e TV) e o site **não têm mais** tela de ativação, MAC, chave nem link M3U: só login com usuário e senha Xtream. A página `/ativar` foi removida. O MAC/chave continuam existindo só por dentro, para identificar o aparelho na API.
- A API legada de ativação (`/api/v1/activate`) continua no servidor, mas o `render.yaml` a deixa **desligada** (`SELF_ACTIVATE=0`).
- Celular: nova aparência (dourado sobre azul-noite), barra inferior Início · Ao vivo · Filmes · Séries · Futebol, busca no topo, seletor de categoria e grade de 3 colunas. A TV mantém o visual anterior.
- Transmissão (Chromecast/Google Cast) envia **só o vídeo do player**, nunca a tela inteira do celular; o botão fica dentro do player. A `MainActivity` agora é `FragmentActivity` (exigência do botão de Cast).

## Ajuste de tela (TV, TV Box, Fire Stick e celular)

- **Automático:** a TV é ajustada para uma tela de projeto de 960×540 dp, qualquer que seja a resolução/densidade que o aparelho informa (TV Box com densidade errada deixava tudo minúsculo ou gigante). O celular mantém o tamanho do sistema; tablets/dobráveis crescem um pouco e a grade ganha mais colunas.
- **Manual (opcional):** em *Conta → Tela → Ajuste fino (opcional)* ou tecla **MENU** do controle. Tamanho da interface (60–160%) e, na TV, margem lateral e superior/inferior (0–12%). O botão "Voltar ao automático" restaura o recomendado. Na tela de login não há mais botão de ajuste.
- **Inteligente:** o app classifica o aparelho (TV HD / Full HD / 4K, celular pequeno, celular, tablet) e guarda o ajuste manual junto com a "assinatura" da tela (resolução + densidade). Se você trocar de TV ou de resolução, o ajuste antigo é descartado e volta o automático.
- **Automático por padrão:** a TV usa base 960×540 dp com margem segura de 3% (não vale dentro do player, que fica em tela cheia); o celular mantém o tamanho do sistema, encolhe se a largura for menor que 320 dp e cresce até 1,2× em tablets. A TV não informa de forma confiável o overscan, por isso a margem de 3% é um padrão seguro.
- **Sem risco de ficar preso:** todo ajuste é um teste de 15 s e volta sozinho se não for confirmado; só o confirmado é gravado; se o app falhar 3 vezes seguidas ao abrir, volta ao recomendado; o painel sempre aparece em escala normal. Fonte do sistema limitada a 0,85–1,3× para não quebrar o layout.
- Código: `ScreenMath.kt` (cálculo puro, com testes em `src/test`), `ScreenController.kt` (estado, teste/confirmação, aplicação global) e `ScreenCalibration.kt` (painel).


## Visual da TV e configurações (v7)

- **TV:** barra lateral de ícones (Início, Ao vivo, Filmes, Séries, Futebol · Buscar, Favoritos, Configurações), data e hora no topo, paleta dourada igual à do celular. Subir/descer na barra troca de tela; voltar do conteúdo para a barra não troca.
- **Filmes e Séries (TV):** coluna de categorias com contagem, grade de capas e painel do título em foco (capa, ano, nota, sinopse buscada com pequeno atraso). **Ao vivo:** canais numerados e grupos com contagem.
- **Configurações:** cartão de assinatura (situação, validade, dias restantes), lista de ações (Atualizar lista, Sair desta conta) e janelas para *Player e buffer*, *Áudio e legendas*, *Tela* e *Atalhos*. Sem MAC e sem painel de ativação.
- **Ainda não existe (precisa de servidor/API):** senha de conteúdo adulto, limpar histórico, perfis, prévia do canal com guia (EPG) na tela Ao vivo, formato/zoom do ao vivo e tempo de abertura.
- **Aviso:** o código Android não foi compilado neste ambiente; faça o build no Android Studio e teste na TV e no celular.

## Fluidez e inteligência (v8)

- **Repetição automática:** pedidos de leitura que falham por rede ou com o servidor acordando (502/503/504) são repetidos até 3 vezes (1,5 s e 3 s) antes de mostrar erro.
- **Último conteúdo conhecido:** se a rede cair depois de já ter carregado uma tela, o app mostra os dados antigos em vez de uma tela de erro.
- **Capas:** cache em disco de 150 MB e ignorando cabeçalhos "no-cache"; em aparelhos com pouca memória usa menos RAM e imagens mais leves (RGB 565).
- **Categoria lembrada:** Ao vivo, Filmes e Séries reabrem na última categoria usada; se ela não existir mais, voltam para "Todos".

## Correções urgentes (v9)

- **Sinopse sem TMDB:** o painel usa a sinopse, gêneros, nota e elenco que o próprio servidor Xtream informa (`get_vod_info` / `get_series_info`). O TMDB continua sendo usado se houver chave. A página mostra "Fonte: seu servidor" ou "TMDB".
- **Vídeo começa sozinho:** se o navegador bloquear o início automático com som, o site começa sem som e avisa para tocar em 🔇, sem exigir outro clique em Assistir.
- **Erro explicado:** quando o vídeo não abre, o painel pergunta ao provedor o motivo (recusou a conexão, bloqueou o servidor, não achou o vídeo, demorou) e mostra em português (`/api/v1/web/diag`).
- Teste novo: `test/playback-tests.js` (sinopse, canal, filme e episódio com provedor falso).

## Reinício do servidor sem perder o acesso (v10)

- **Problema:** na Render grátis o serviço dorme e reinicia com o disco zerado. O painel passava a responder `device_not_active` (403) para tudo, e nada tocava até digitar a senha de novo.
- **Site:** o login agora devolve uma *chave de recuperação* (conta cifrada com `WEB_SECRET`, que fica fixo no Render). O navegador guarda esse texto e, ao receber `device_not_active`, reativa o aparelho sozinho e repete o pedido. Sair da conta apaga a chave.
- **App Android:** reentra sozinho também quando recebe 403 `device_not_active` (antes só reagia ao 401).
- **Importante:** mantenha `WEB_SECRET` fixo no Render. Se ele mudar, as chaves salvas deixam de valer e é preciso entrar de novo.
- Testes novos em `test/playback-tests.js` (reinício, chave adulterada, chave de outro servidor).

## v11 — segurança, CI, perfil e persistência

- **Segurança:** o login não devolve mais o link M3U nem o modelo; a senha do Xtream só viaja cifrada (chave de recuperação). Defina `ADMIN_PASSWORD` no Render e mantenha `WEB_SECRET` fixo.
- **CI:** `.github/workflows/ci.yml` roda `npm test` e compila o APK (`testDebugUnitTest assembleDebug`) a cada push; o APK de debug fica como artefato. Erros de compilação do Android aparecem ali.
- **Perfil (app):** *Limpar histórico* (apaga o "Continuar assistindo") e *Senha do conteúdo adulto* (4–6 números, guardada só no aparelho; oculta categorias, buscas e destaques adultos até liberar).
- **Assinatura:** o cartão mostra "Telas simultâneas X de Y em uso" quando o provedor informa.
- **Persistência (Render grátis):** defina `SNAPSHOT_URL` (e `SNAPSHOT_TOKEN`, opcional) para um endereço HTTP que aceite `PUT` e `GET` (Cloudflare Worker/KV, S3 com URL assinada etc.). O painel salva aparelhos, favoritos e progresso cifrados a cada 2 min e ao receber SIGTERM, e restaura sozinho quando o disco volta vazio. Alternativa: disco pago em `/data`.
- **TV ao vivo:** ao focar um canal, o painel da direita mostra "Agora", barra de progresso e "A seguir" (EPG).

## v12 — filmes e séries por fora do Xtream

Sem servidor próprio e sem PC ligado: crie uma lista `.m3u` (modelo em `extras-exemplo.m3u`), coloque num link público (GitHub raw/Gist) e defina `EXTRA_M3U_URL` no Render (`EXTRA_LABEL` muda o nome da categoria padrão). O painel soma a lista ao catálogo do Xtream: aparecem nas mesmas telas, em categorias próprias, com busca, episódios e reprodução. Se o link da lista cair, o Xtream segue normal. Os vídeos precisam estar em links diretos (`.mp4`, `.mkv`, `.m3u8`) em hospedagem sua (ex.: Cloudflare R2, Backblaze B2). Use só conteúdo que você tem direito de distribuir. Para atualizar a lista, edite o arquivo e use "Atualizar lista" no app.

## v13 — app sozinho (sem painel)

O aplicativo agora fala direto com o servidor Xtream do usuário (`data/DirectBackend.kt`): login, canais, filmes, séries, sinopse, EPG e conexões vêm do próprio provedor. Favoritos e "Continuar assistindo" ficam no aparelho. Em **Configurações → Perfil → Lista extra (link M3U)** o usuário cola o link de uma lista `.m3u` própria, que é somada ao catálogo. O painel no Render deixa de ser necessário para o app (continua existindo para o site). A aba de jogos fica vazia nesse modo, pois dependia do painel. O User-Agent padrão do player passou a ser o do VLC, que os provedores costumam aceitar.

## v14 — fluidez na TV

- Trocar o foco entre capas não recompõe mais a grade: só o painel de detalhes (ou o da programação) atualiza.
- Capas decodificadas em tamanho reduzido e com transição curta, o que alivia memória e CPU em TV box simples.
- Animação de foco mais curta (110 ms) e pincéis de borda reaproveitados.
- Itens das listas com `contentType`, para o Compose reaproveitar os cartões ao rolar.

## v15 — player mais esperto

Se um vídeo falha, o player tenta sozinho o mesmo conteúdo em outro formato (ao vivo: `.ts` ↔ `.m3u8`; filmes e episódios: `.mp4` ↔ `.mkv`) antes de reconectar ou desistir. A mensagem final mostra o código do erro do player, que ajuda a achar a causa.

## v16 — conferido com a documentação Xtream + banner novo

- Conferido com a documentação pública da API Xtream: `exp_date` pode ser nulo, `status: Expired` conta como vencido, `backdrop_path` pode vir como lista, `get_short_epg` traz título/descrição em Base64 e `user_info.allowed_output_formats` indica os formatos liberados.
- O ao vivo agora usa `.ts` quando o servidor libera (ou não informa) e o primeiro formato liberado (ex.: `m3u8`) quando `.ts` não é permitido.
- Novo banner da TV (`res/drawable-nodpi/banner.png`, 16:9 com o nome do app), seguindo as regras do Android TV.

## v17 — visual

- Abertura (splash) refeita na paleta azul-marinho e dourado, com emblema, brilho pulsante e barra de progresso com luz que corre.
- Ícone do app novo: emblema dourado com play sobre fundo azul-marinho (igual ao banner).
- Carregamento das listas com esqueleto de capas brilhando (`PosterSkeleton`), no lugar do círculo girando.

## v18 — cache inteligente em disco

O app guarda em disco as respostas do Xtream (categorias, canais, filmes e séries por categoria, detalhes): abre na hora por 30 min (2 h na busca completa, 6–24 h nos detalhes) e, se a rede ou o provedor falharem, usa a cópia antiga em vez de mostrar erro. "Atualizar lista" limpa o cache.

## v20 — primeiro uso e diagnóstico

- O servidor padrão do login vem de `xtreamUrl` no `gradle.properties` (vazio = o cliente digita; a tela já abre o campo do servidor com exemplo e dica).
- Mensagens de erro claras: servidor não encontrado, demorou, fora do ar/porta errada, falha segura, usuário ou senha.
- Configurações → "Ajuda e diagnóstico": versão, aparelho, tela, servidor e o último erro que fechou o app, com botão de copiar.

## v21
- Removida a API falsa: o app usa só o Xtream real do provedor.

## v23
- Dados mais atuais: listas 10 min, busca 30 min, séries 1 h, detalhes de filme 6 h (antes 30 min/2 h/6 h/24 h). Cópia antiga só se o provedor falhar.

## v24
- Revisão do Kotlin: `loadedCats` agora é seguro para várias threads; séries aceitam `episodes` como objeto ou lista de listas.
- Player: número do canal pelo controle (digite 1–4 dígitos), áudio (tecla Áudio/Info) e legenda (tecla Legenda/Guia) alternando faixas.
- Opção "Abrir no último canal" em Configurações (desligada por padrão).
- Busca tolerante a 1 erro de digitação (só quando a busca exata não acha nada).
- Celular: imagem dentro de imagem ao sair do app com vídeo na tela.
- Perfis (até 8) com favoritos e histórico separados, em Configurações > Quem está assistindo.
- Tela de diagnóstico no rodapé agora mostra "v24".

## v25
- Adicionado PUBLICAR_SITE.md (passo a passo do Render para o site).

## v26
- Revisão das telas: MENU não abre mais o ajuste de tela ao favoritar; vídeo pausa ao sair do app; toque na tela (celular) mostra os controles e toque duplo pausa; dígitos do canal por código de tecla; canal sem endereço para o vídeo anterior.

## v27
- Início mais inteligente: fileira "Seus canais" (os que você mais abre, por perfil) e "Porque você curte <categoria>" (títulos novos das categorias que você mais assiste ou favorita).

## v28
- Media Station X: painel serve /msx/start.json, menu e listas (ao vivo, filmes, séries com temporadas) a partir do Xtream (MSX_USER/MSX_PASS). Teste test/msx-tests.js. Guia: MSX.md.

## v29
- MSX: variável MSX_LIVE_FORMAT (ts ou m3u8) e alternativa por link M3U no MSX.md.

## v30
- Motor mais esperto: aprende o formato do ao vivo que funciona no seu provedor (ts/m3u8) depois do plano B e passa a usá-lo; guia de programação (EPG) com cache de 1 min; busca ordenada por relevância (título igual, começa com, palavra inteira, contém).

## v31
- Workflow manual "Capturas reais": abre o APK num emulador e salva fotos reais da tela (abertura e login) e o log de erros.

## v32
- Bugs: Fire Stick antigo (Android 5/6) fechava ao pausar por causa de isInPictureInPictureMode (API 24) e ConcurrentHashMap.newKeySet (API 24); login não era lembrado em boxes com cofre do Android quebrado (agora guarda na área privada do app).

## v33
- Configurações (TV): ao fechar uma janela, o foco do controle volta para a lista.

## v34
- Aba Jogos volta a funcionar no modo "só aplicativo": a agenda e os placares vêm do painel (boxtv-panel no Render, o mesmo do site) e os canais são trocados pelos do seu Xtream para tocar direto.

## v35
- Configurações > Rede e DNS: Automático (aparelho, depois Cloudflare e Google), Cloudflare, Google ou só o aparelho; consulta por DNS sobre HTTPS; botão "Testar com o meu provedor". Vale para lista, vídeo (agora via OkHttp) e capas. Nova dependência media3-datasource-okhttp.

## v36
- Servidor IPTV único: GET/POST /api/v1/server no painel (senha SERVER_EDIT_PASSWORD, padrão box54321; 5 erros = 15 min de espera; confere se o servidor responde; migra os aparelhos já ativados; guarda histórico). App: Configurações > Servidor IPTV e sincronização a cada 10 min com teste da conta antes de trocar. Site: Minha conta > Servidor IPTV. MSX acompanha o servidor. Teste test/server-switch-tests.js.
