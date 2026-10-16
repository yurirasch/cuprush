# CupRush — instruções para agentes de código

Este é o repositório PRIVADO do CupRush: frontend WebGL2 mobile, assets exclusivos, backend Node.js/WebSocket com amigos, convites e multiplayer.

## Primeira leitura obrigatória
1. Leia **CODEX.md** integralmente e siga as instruções e o checklist de deploy seguro.
2. Leia README.md, docker-compose.yml, Dockerfile, .env.example e examine server.js / index.template.html.
3. Confira o histórico do Git e o estado dos arquivos antes de modificá-los.

## Quando o responsável pedir publicação na VPS
- Trabalhe diretamente com este repositório privado como única fonte do projeto; não peça ZIPs ao usuário.
- Use acesso GitHub de escopo restrito, somente leitura para o servidor. Nunca registre credenciais no código nem em logs.
- Inspecione primeiro serviços, portas, containers, DNS e proxy da VPS. **Não interrompa nem sobrescreva** outros serviços.
- Gere o HTML com `python3 embed_assets.py` após alterações de frontend; verifique o diff e rode `node --check server.js`, `node --check tiny-ws.js`.
- Configure `.env` **somente na VPS**, com `ALLOWED_ORIGINS` do domínio real e `HOST_PORT` livre; nunca comite valores secretos.
- Rode `docker compose config`, suba apenas o serviço CupRush, valide `/health` e WSS em `/ws` com HTTPS.
- Teste o jogo em 2 conexões: cadastro, amigos online, convite, aceite, turnos, vitória, revanche e reconexão. Registre SHA e rollback.
- Pergunte antes de alterar DNS, proxy compartilhado, serviços de terceiros ou de disponibilizar o aplicativo publicamente; tais ações podem afetar outros sistemas.

## Restrições
- **GitHub sempre PRIVATE**. Não criar mirror público, GitHub Pages ou repositórios alternativos públicos.
- Preserve as trilhas corretas: verticais só na coluna central, horizontais topo/meio/base e arcos no centro; nada de quatro verticais laterais.
- Não colocar números fixos em imagens de placar. Layout mobile vertical e fullscreen sob interação.
- Dados de jogadores e tokens ficam fora do Git: `data/`, `.env` e backups não devem ser commitados.
- O navegador sempre poderá inspecionar o JS cliente, mesmo com repositório privado; lógica e dados sensíveis permanecem no backend.
- MVP de servidor único com armazenamento JSON: não tratar como produção em larga escala sem autenticação adequada, rate limit e PostgreSQL.
