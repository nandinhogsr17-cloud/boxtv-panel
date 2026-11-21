# Colocar o site no ar (opcional)

O app (APK) funciona sozinho. Este passo é só se você quer o **site** com player no navegador.
O site precisa do painel ligado, porque é ele que repassa o vídeo do provedor.

## Render (grátis)
1. Suba esta pasta inteira para um repositório no GitHub.
2. No Render: **New > Blueprint** e escolha o repositório. Ele lê o `render.yaml`.
3. Quando pedir, preencha `ADMIN_PASSWORD` (senha do admin). O servidor do provedor já está configurado.
4. Espere o deploy. O endereço sai como `https://boxtv-panel.onrender.com`.
5. Abra o endereço e entre com o usuário e a senha do seu Xtream.

## Cuidados
- No plano grátis o painel dorme após uns 15 min parado (a primeira abertura demora) e o disco é apagado a cada reinício. A chave de recuperação do login cobre isso.
- Para guardar favoritos entre reinícios, preencha `SNAPSHOT_URL` e `SNAPSHOT_TOKEN`, ou use plano pago com disco.
- Se o vídeo não tocar no site, a tela mostra a causa (provedor recusou, telas demais, etc.).
- Lista extra de filmes e séries: preencha `EXTRA_M3U_URL` com o link público da sua lista .m3u.
