# CupRush — jogo mobile (repositório PRIVADO)

CupRush é um desafio estratégico de copos para navegador mobile, com visual exclusivo e modos **1 jogador contra CPU** e **2 jogadores pela internet**. No online, perfis de convidado possuem códigos individuais, lista de amigos, presença, convites, aceite e revanche.

## Rodar localmente

Requer Node.js 22+.

```bash
node server.js
# acesse http://localhost:3000
```

Se abrir `index.html` diretamente, o modo CPU funciona sem servidor, mas o multiplayer não. O frontend é um HTML autossuficiente com imagens embutidas.

## Estrutura

- `index.template.html`: frontend-fonte; referências `__ASSET_NN__` usadas pelo empacotador.
- `assets/`: PNGs dos elementos usados no jogo.
- `embed_assets.py`: gera `index.html` com as imagens incorporadas.
- `index.html`: build standalone pronto para o navegador.
- `server.js`, `tiny-ws.js`: Node HTTP + WebSocket com jogadas, amigos e partidas.
- `Dockerfile`, `docker-compose.yml`: execução isolada na VPS.
- `CODEX.md`: procedimento de implantação pelo Codex.

Para regenerar o HTML após editar o fonte ou os PNGs: `python3 embed_assets.py`.

## VPS Hostinger

1. Codex clona este repositório **privado** com chave de deploy somente leitura.
2. Confere portas, DNS e proxy existentes; não interfere com outros serviços.
3. Configura `.env` na VPS com `ALLOWED_ORIGINS=https://seu-subdominio`.
4. `docker compose config` e `docker compose up -d --build`.
5. Configura HTTPS/WSS por proxy reverso; verifica `/health` e testa dois celulares.

Veja `CODEX.md` para checklist de segurança e rollback.

## Segurança / limites do MVP

**Manter GitHub Private.** Não usar GitHub Pages, não commitar segredos, dados, perfis ou tokens. O JS frontend é visível para visitantes do site (inevitável na Web); backend fica na VPS. O login atual é token de visitante, dados persistem em JSON local; não está pronto para escala pública. Antes de lançar para muitos usuários: autenticação, PostgreSQL, rate limiting e monitoramento.

Nenhum código desta pasta precisa ser público para o Codex fazer deploy.