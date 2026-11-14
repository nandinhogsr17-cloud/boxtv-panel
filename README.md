
## 10. Login só com usuário e senha

Defina o servidor da lista uma vez em **/admin → Servidor da lista** (só o endereço, ex.: `http://servidor:80`, e o formato `mpegts`, `ts` ou `m3u8`), ou pelas variáveis `DEFAULT_XTREAM_HOST` / `DEFAULT_XTREAM_OUTPUT`. Não coloque usuário e senha ali.

Depois disso o cliente só digita **Usuário e senha** (site, `/ativar` e app). O painel confere a conta no servidor (`player_api.php`: senha, vencimento, telas), monta o link `get.php?...&type=m3u_plus&output=...`, valida a lista e só então salva. Se o formato escolhido falhar, tenta `ts` e `m3u8` sozinho. Aceita também link inteiro ou `usuario:senha` colado no campo. Após ~10 senhas erradas, o aparelho fica bloqueado por 1 hora. Sem servidor definido, o app volta ao modo "link M3U".
