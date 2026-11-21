# BoxTv — atualização para login Xtream

## Alterações desta etapa

- O fluxo inicial do Android agora abre a tela de login Xtream após a animação de abertura; não exige código ou tela de ativação.
- A tela antiga de ativação do Android foi removida do código-fonte do app.
- Os métodos Android usados para ativar dispositivos enviando URL M3U foram removidos.
- O login aceita usuário, senha e endereço do servidor Xtream. O endereço padrão é `http://trevorcdn.online:80`, fica salvo localmente e pode ser editado em **Configurar Servidor Xtream**.
- O endereço Xtream foi separado do endereço do painel BoxTv. Alterar o servidor do provedor não altera o endereço da API/painel do aplicativo.
- O backend valida o endereço informado no login, consulta `player_api.php` para autenticar a conta e usa o cliente `XtreamCatalog` para buscar categorias, canais, filmes e séries pela API Xtream.
- O cliente Xtream agora usa o transporte protegido do servidor (incluindo validação de destinos), em vez de fazer chamadas de catálogo por um `fetch` sem as proteções do painel.
- A tela de abertura existente foi preservada: animação da marca BoxTv, brilho e slogan “O MELHOR DO ENTRETENIMENTO”. A interface de login continua adaptável a celular e Android TV.

## Verificações

- `node --check server.js`: aprovado.
- `node --check src/catalog.js`: aprovado.
- `node --check src/xtream.js`: aprovado.
- `npm test`: 273 verificações aprovadas, 0 falhas (85 painel/API, 70 site/proxy, 97 ativação/integrações e 21 integrações adicionais).
- `git diff --check`: aprovado.
- O arquivo `.git/config` foi verificado: não contém token GitHub nem credenciais embutidas na URL remota.

## Pendências que não puderam ser validadas neste ambiente

- O APK não foi compilado. O Gradle Wrapper tentou baixar Gradle 8.9, mas o ambiente não conseguiu resolver `services.gradle.org` (falha de DNS/rede). Portanto, ainda não há confirmação de build Android nem de funcionamento em aparelho físico/Android TV.
- O login no servidor `trevorcdn.online:80` não foi testado com uma conta real. O usuário e a senha devem ser inseridos diretamente no aplicativo; não os envie pelo chat.
- Nenhuma alteração foi enviada ao GitHub nesta etapa. A autenticação GitHub deve ser conectada pelo usuário ou feita localmente com `gh auth login`/`GH_TOKEN` no terminal, sem gravar o token no projeto.

## Segurança importante

O endereço informado usa HTTP, não HTTPS. Isso significa que as credenciais Xtream podem trafegar sem criptografia entre o aplicativo/servidor e o provedor. Se o provedor oferecer HTTPS, prefira o endereço HTTPS. O endereço solicitado foi mantido como padrão, mas pode ser editado.

## Compatibilidade M3U

O aplicativo Android não oferece mais login/importação M3U nem a antiga tela de ativação. O backend ainda conserva partes antigas do painel e do armazenamento para compatibilidade com dados e rotas legadas; a autenticação e o carregamento do catálogo do novo fluxo são feitos pela API Xtream. Essas partes legadas não foram apagadas nesta etapa para evitar perda de dados ou quebra do painel existente.
