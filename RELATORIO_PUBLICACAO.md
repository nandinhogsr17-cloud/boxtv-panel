# BoxTv — correção do fluxo inicial e preparação para publicação

## O que foi alterado no código local

- A página inicial do site deixa de exibir o código único e a espera por ativação remota.
- O primeiro acesso passa a mostrar login Xtream com usuário e senha.
- O campo de servidor pode ser expandido e editado; o endereço padrão é carregado da configuração pública do painel.
- O site remove o botão de ativação remota da barra principal.
- Ao sair da conta, a identidade local do navegador é renovada para permitir outro login.
- O endpoint público de configuração informa o servidor Xtream configurado.
- O projeto Android existente foi incluído no repositório local, com telas para celular e Android TV.
- Os arquivos de configuração e documentação foram alinhados ao fluxo Xtream e ao servidor padrão `http://trevorcdn.online:80`.

## Funcionalidades existentes no código

- Jogos: `android/app/src/main/java/com/iptvplayer/tv/ui/GamesScreen.kt` e `web/js/pages.js`.
- Continuar assistindo: `android/app/src/main/java/com/iptvplayer/tv/ui/HomeScreen.kt` e `web/js/pages.js`.
- Catálogo de canais, filmes e séries e player: código Android e site.

## Verificações

- `npm test`: 273 verificações aprovadas, 0 falhas.
- `node --check` nos arquivos JavaScript alterados: aprovado.
- `git diff --check` para as alterações de código do painel/site: aprovado antes de incluir o wrapper Android.
- APK Android: não compilado neste ambiente; o Gradle Wrapper precisa baixar Gradle e a rede/DNS deste ambiente não alcançou os servidores necessários.
- Login com credenciais reais de provedor: não testado.

## Estado da publicação

- Commit local criado: `dc7201e` (`Atualiza cliente web para login Xtream e inclui app Android`).
- O envio ao GitHub não foi concluído: o ambiente falhou ao resolver `github.com` (DNS).
- A integração GitHub conectada também recusou a criação de branch por falta de permissão de escrita (`403`).
- Portanto, o GitHub remoto e o site Render ainda não foram atualizados por esta execução.
- Quando o commit `dc7201e` chegar à branch conectada ao Render, o serviço poderá iniciar um novo deploy se o auto-deploy estiver habilitado. Isso depende da branch e da configuração do serviço.

## Proteção de dados

Não foram incluídos no pacote os arquivos locais de dispositivos, banco SQLite, chave de criptografia, `.env`, caches ou credenciais. O arquivo `data/devices.json` local foi mantido fora do commit e do ZIP para não publicar dados de aparelhos/clientes.
