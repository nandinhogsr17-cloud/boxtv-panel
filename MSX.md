# Media Station X (MSX) com o seu Xtream

O painel monta o menu do MSX na hora, direto do seu Xtream: Ao vivo, Filmes e Séries com capas e temporadas.

## 1. Colocar o painel no ar
Siga o `PUBLICAR_SITE.md`. No Render, em Environment, preencha também:
- `MSX_USER` = seu usuário Xtream
- `MSX_PASS` = sua senha Xtream
(Sem essas duas, o endereço do MSX fica desligado.)

Teste no navegador: `https://SEU-PAINEL.onrender.com/msx/start.json` deve mostrar um texto com `"parameter":"menu:..."`.

## 2. Configurar na TV
1. Abra o Media Station X.
2. Vá em **Settings → Start Parameter → Setup**.
3. Digite só o endereço: `SEU-PAINEL.onrender.com` (sem https:// e sem /msx).
4. Feche e abra o app: o menu BoxTv (Ao vivo, Filmes, Séries) aparece.

## Dicas
- Canais usam HLS (.m3u8). Se o seu provedor só libera .ts, no Render crie a variável `MSX_LIVE_FORMAT` com o valor `ts` e reinicie.
- Cada lista mostra até 600 itens; categorias maiores aparecem cortadas.
- No plano grátis do Render, a primeira abertura do dia demora uns 30 s (o painel acorda).
- O usuário e a senha ficam só no Render. Qualquer pessoa com o seu endereço consegue ver o seu catálogo e tocar, então não divulgue o link.

## Alternativa sem painel (limitada)
O MSX tem um conversor próprio de M3U. Monte o link assim (troque USUARIO e SENHA; o link do provedor precisa estar codificado):

`http://msx.benzac.de/services/m3u.php?type=video&headline=BoxTv&url=http%3A%2F%2Ftrevorcdn.online%3A80%2Fget.php%3Fusername%3DUSUARIO%26password%3DSENHA%26type%3Dm3u_plus%26output%3Dm3u8`

Limites: o conversor corta arquivos acima de 25 MB (listas grandes de IPTV passam disso), não separa séries por temporada e manda sua senha para o serviço do MSX. Por isso o painel é o caminho recomendado.
