# App IPTV (Site + Android TV / Fire Stick / Google TV) + Painel

> **Fluxo atual do cliente:** o site e o app Android entram com **usuário e senha Xtream**. A tela antiga de código único/M3U não faz mais parte do fluxo inicial do cliente. As rotas antigas de ativação e gerenciamento remoto permanecem no backend por compatibilidade com aparelhos já cadastrados; não devem ser usadas como tela inicial do novo cliente. O servidor padrão é configurável e pode ser alterado no login.

Projetos que trabalham juntos:

| Pasta | O que é |
|---|---|
| `./` | Painel + API (Node.js 22, sem dependências). Cadastra MAC, guarda a lista M3U de cada cliente, valida/expira acessos, sincroniza favoritos e "continuar assistindo", monta a aba "Jogos de hoje". |
| `web/` | **Site (navegador)**: o mesmo app em HTML/JS puro, servido pelo próprio painel em `/`. Funciona em PC, celular e no navegador de TVs/Fire Stick (Silk). Veja a seção 7. |
| `android/` | App Android TV (Kotlin + Jetpack Compose + Media3/ExoPlayer). Visual estilo Netflix, controle remoto, ativação por MAC. |

## Como funciona (fluxo do cliente)

1. O cliente instala o app e abre. O app cria o **MAC** e a **chave** dele e mostra na tela ("Ative este aparelho").
2. Você abre o painel (`/admin`), o aparelho já aparece como **Aguardando**. Clique em **Editar**, cole o link da **M3U**, escolha a validade e salve.
3. Em até 5 segundos o app libera sozinho e mostra a home.

O painel baixa e organiza a M3U (canais, filmes, séries, temporadas) e entrega JSON pronto ao app — listas de 50 mil itens abrem rápido.

### MAC do app
O Android não deixa o app ler o MAC real, então o app gera um MAC aleatório próprio (bit "administrado localmente") e uma chave, guardados só no aparelho. **Se o app for desinstalado ou os dados forem limpos, o MAC muda** (o backup está desligado); basta entrar de novo com usuário e senha. O app entra sozinho quando já há login salvo; há botão **Sair da conta** em Conta.

## 1. Rodar o painel

```bash
# Opcional: copie .env.example para .env e preencha as variáveis locais
ADMIN_PASSWORD='uma-senha-forte' node server.js     # Node 22.13 ou mais novo
# abre http://localhost:8080/admin  (usuário: admin)
```

Variáveis (veja `.env.example`): `PORT`, `DATA_DIR`, `ADMIN_USER`, `ADMIN_PASSWORD`, `FOOTBALL_DATA_TOKEN`, `FOOTBALL_COMPETITIONS`, `TMDB_KEY`, `TZ_NAME`, `CATALOG_TTL_MIN`, `AUTO_REGISTER`, `TRUST_PROXY` e, para o site, `CORS_ORIGIN`, `WEB_SECRET`, `STREAM_UA`, `ALLOW_PRIVATE_STREAMS`.

- **Produção:** ponha atrás de HTTPS (Caddy/Nginx/Cloudflare) e use `TRUST_PROXY=1`. Sem `ADMIN_PASSWORD` o painel gera uma senha temporária a cada execução.
- **Docker:** `docker build -t iptv-panel . && docker run -d -p 8080:8080 -v iptv-data:/data -e ADMIN_PASSWORD=... iptv-panel`
- **Testes:** `npm test` (sobe o servidor de verdade: 85 do painel/API + 70 do site/proxy + 97 da ativação + 21 das integrações + 11 de segurança).
- `AUTO_REGISTER=0` faz o painel recusar MACs que você não cadastrou antes.

## 2. Compilar o app

Precisa do Android Studio (Ladybug ou mais novo) e JDK 17.

1. Abra a pasta `android/` no Android Studio.
2. Edite `android/gradle.properties`: `panelUrl` (endereço do seu painel, de preferência `https://`).
3. Troque o nome em `res/values/strings.xml`, o ícone (`drawable/ic_launcher.xml`) e o banner (`drawable/banner.xml`).
4. **Build → Build APK(s)**, ou `cd android && ./gradlew assembleRelease -PpanelUrl=https://seu-painel.com` (assine o APK para distribuir).
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

Os players **hls.js** e **mpegts.js** são carregados do CDN jsdelivr (versões fixas). Para não depender do CDN, copie os dois arquivos para `web/vendor/` (veja o `LEIA-ME.txt` lá). Se nenhum dos dois estiver acessível, o site mostra uma mensagem clara no player.

**Teclado / controle remoto:** setas navegam, Enter abre. No player: espaço/Enter pausa, ◀ ▶ ±10 s, ▲ ▼ troca de canal (ou volume em filme), `F` tela cheia, `M` mudo, Esc/Voltar sai, tecla de menu favorita. Clique direito (ou toque longo no celular de alguns navegadores) num cartão favorita.

**Segurança do proxy:** exige o token assinado do aparelho (vale 12 h e deixa de valer na hora se você bloquear/expirar o aparelho), aceita só `http/https`, **bloqueia endereços internos** (localhost, 10.x, 192.168.x, 169.254.x…) na hora da conexão e limita redirecionamentos e tamanho. Não ligue `ALLOW_PRIVATE_STREAMS=1` em servidor público.

**Editar o visual:** o site é HTML + CSS + JS puro, sem build (`web/`): `style.css` (cores no `:root`), `config.js` (nome do app), `js/pages.js` (telas). Dá para colar esses arquivos no Google AI Studio e pedir mudanças, e depois copiar de volta. O Lovable gera os próprios projetos React, então ele serve de inspiração/prompt, mas não importa esta pasta diretamente.

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

O remoto Git fica sem token embutido na URL. Use Git Credential Manager/GitHub CLI para operações Git. Nunca coloque tokens em `origin`, commits, `.env.example` ou arquivos versionados. O token anteriormente exposto deve ser revogado. Para testar um token novo, defina `GH_TOKEN` temporariamente no ambiente ou autentique com `gh auth login`; depois execute `npm run test:github`. O teste verifica leitura e permissão de escrita no repositório sem exibir ou salvar o token.


---

## Observações específicas do painel

## 10. Login só com usuário e senha

O servidor Xtream pode ser definido em **/admin → Servidor da lista** ou pela variável `DEFAULT_XTREAM_HOST`. Se nenhum servidor estiver configurado, o cliente usa o modo de link M3U; não há endereço de provedor fixo no código. Use apenas o endereço base (por exemplo, `http://servidor:80`), sem `/player_api.php` ou `/get.php`. Não coloque usuário e senha ali.

Depois disso o cliente só digita **Usuário e senha** (site, `/ativar` e app). O painel confere a conta no servidor (`player_api.php`: senha, vencimento, telas), monta o link `get.php?...&type=m3u_plus&output=...`, valida a lista e só então salva. Se o formato escolhido falhar, tenta `ts` e `m3u8` sozinho. Aceita também link inteiro ou `usuario:senha` colado no campo. Após ~10 senhas erradas, o aparelho fica bloqueado por 1 hora. Sem servidor definido, o app volta ao modo "link M3U".

## Credenciais e armazenamento

As URLs Xtream/M3U são cifradas no SQLite com AES-256-GCM. Em produção, defina `CREDENTIAL_ENCRYPTION_KEY` como um segredo estável de 32 bytes em base64url e mantenha o diretório `DATA_DIR` em armazenamento persistente; perder a chave impede a leitura das listas já cifradas. Sem a variável, o painel cria `.credential-key` dentro de `DATA_DIR`, que também precisa persistir. O backup `data/devices.json` não contém URLs/credenciais. Para Render, configure o segredo no painel do serviço e use armazenamento persistente compatível com SQLite; o plano atual do manifesto é gratuito e não declara disco persistente.


## Segurança — mudanças recentes

- Removidas as rotas públicas antigas `/api/v1/devices*` e `/api/v1/config/server` (expunham chaves e senhas Xtream e permitiam trocar o servidor). Use o `/admin`. O `test/security-tests.js` garante que não voltem.
- Login Xtream agora também é limitado por IP (além do MAC).
- No Render o `TRUST_PROXY` liga sozinho; o `render.yaml` fica na raiz do repositório com `rootDir: panel`. Defina `ADMIN_PASSWORD` no painel do Render. No plano grátis o disco é efêmero: aparelhos e banco se perdem a cada reinício.
