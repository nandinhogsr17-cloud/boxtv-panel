# BoxTv — revisão e alterações aplicadas

## O que foi alterado

- Corrigida a configuração do servidor Xtream para não assumir um host antigo quando nenhum servidor estiver configurado.
- Removidos os fallbacks de host fixos da interface de integrações; a interface passa a refletir a configuração real do servidor.
- Ajustado o Gradle Wrapper para 8.9, compatível com Android Gradle Plugin 8.7.2.
- Removido o caminho absoluto do Java e o `local.properties` específico de uma máquina.
- Marcado `android/gradlew` como executável.
- Atualizados os scripts de inicialização Windows para carregar `.env` com o suporte nativo do Node.js, sem parsing frágil e sem exibir senha padrão incorreta.
- Reforçadas regras de `.gitignore` para segredos, dados locais, caches e artefatos.
- Removido o token da URL remota Git; o `origin` agora usa HTTPS sem credenciais embutidas.
- Retirado `data/devices.json` do índice Git, mantendo o arquivo local para não descartar os dados do usuário.
- Criado `npm run test:github` para verificar leitura e permissão de escrita no repositório usando `GH_TOKEN`/`GITHUB_TOKEN` no ambiente ou uma sessão do GitHub CLI, sem salvar ou imprimir o token.
- Atualizada a documentação e os números de testes.

## Testes executados

Painel/API: 85 aprovados, 0 falhas.
Site/proxy: 70 aprovados, 0 falhas.
Ativação: 97 aprovados, 0 falhas.
Integrações: 21 aprovados, 0 falhas.

**Total: 273 verificações aprovadas, 0 falhas.**

Também passaram `node --check` para `server.js` e para o teste de conexão GitHub, além de `git diff --check`.

## O que ainda depende do ambiente do usuário

- A compilação Android não pôde ser concluída aqui: não há Android SDK instalado e o ambiente não conseguiu baixar Gradle 8.9 por falta de acesso à rede. Portanto, APK e funcionamento em TV real continuam sem validação.
- O teste autenticado do GitHub foi preparado, mas não executado: o token anterior estava exposto no ZIP e precisa ser revogado. Gere um token novo com acesso mínimo ao repositório e execute `cd panel && npm run test:github` com `GH_TOKEN` definido apenas na sessão do terminal ou com `gh auth login`.
- Nenhuma alteração foi enviada ao GitHub. O histórico local foi preservado e o remoto ficou sem credenciais embutidas. Os novos arquivos Android ainda precisam ser adicionados ao índice, commitados e enviados.
- O Android foi movido para `panel/android/`, dentro do repositório Git existente. Assim, o Android fica dentro do repositório existente e poderá ser versionado junto com painel, API e site após adicionar e enviar os novos arquivos; `server.js` e `render.yaml` continuam na raiz do deploy atual.

## Segurança e dados

- `panel/.env` foi retirado do pacote. Recrie-o a partir de `.env.example` e informe novamente as credenciais necessárias.
- O token GitHub anteriormente exposto não deve ser reutilizado. Revogue-o no GitHub.
- Os arquivos locais `panel/data/panel.db`, `panel/data/.credential-key` e `panel/data/devices.json` foram preservados no pacote privado para manter os dados locais, mas estão ignorados pelo Git. Não publique nem compartilhe esses arquivos.
- Antes de trocar `CREDENTIAL_ENCRYPTION_KEY`, faça migração das credenciais cifradas; não substitua a chave diretamente.
