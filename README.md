
## 10. Login só com usuário e senha

O servidor padrão já vem configurado como `http://trevorcdn.online:80`. Para trocá-lo, edite **/admin → Servidor da lista** ou configure `DEFAULT_XTREAM_HOST`; o campo do painel continua editável. Use apenas o endereço base (por exemplo, `http://servidor:80`), sem `/player_api.php` ou `/get.php`. Não coloque usuário e senha ali.

Depois disso o cliente só digita **Usuário e senha** (site, `/ativar` e app). O painel confere a conta no servidor (`player_api.php`: senha, vencimento, telas), monta o link `get.php?...&type=m3u_plus&output=...`, valida a lista e só então salva. Se o formato escolhido falhar, tenta `ts` e `m3u8` sozinho. Aceita também link inteiro ou `usuario:senha` colado no campo. Após ~10 senhas erradas, o aparelho fica bloqueado por 1 hora. Sem servidor definido, o app volta ao modo "link M3U".

## Credenciais e armazenamento

As URLs Xtream/M3U são cifradas no SQLite com AES-256-GCM. Em produção, defina `CREDENTIAL_ENCRYPTION_KEY` como um segredo estável de 32 bytes em base64url e mantenha o diretório `DATA_DIR` em armazenamento persistente; perder a chave impede a leitura das listas já cifradas. Sem a variável, o painel cria `.credential-key` dentro de `DATA_DIR`, que também precisa persistir. O backup `data/devices.json` não contém URLs/credenciais. Para Render, configure o segredo no painel do serviço e use armazenamento persistente compatível com SQLite; o plano atual do manifesto é gratuito e não declara disco persistente.