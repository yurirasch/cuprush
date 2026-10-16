# Instruções ao Codex — CupRush | REPOSITÓRIO PRIVADO

Objetivo: preparar e implantar CupRush na VPS Hostinger, preservando privacidade, isolamento e os demais apps existentes. **Não modificar a visibilidade Private** e não criar GitHub Pages, forks ou mirrors públicos.

Arquitetura: Node.js HTTP/WebSocket em uma instância; frontend HTML estático servido pelo próprio processo; persistência temporária de cadastro/amigos no volume `./data`. O site deve usar HTTPS + WSS (upgrade em `/ws`) pelo proxy da VPS.

## Deploy seguro

1. Inspecione `node --check server.js`, `node --check tiny-ws.js`, `python3 embed_assets.py` e eventuais erros de console. Verifique conformidade do frontend e servidor.
2. Inspecione portas, DNS, containers, certificados e proxy; NÃO altere configurações de outros jogos/aplicações.
3. Obtenha acesso somente leitura ao repo privado por chave SSH de deploy; nunca exponha chaves/tokens nos logs ou no repositório.
4. Clonar num diretório independente, por ex. `/opt/cuprush`; configurar `.env` apenas na VPS com `ALLOWED_ORIGINS` exato e `HOST_PORT` disponível.
5. `docker compose config` -> `docker compose up -d --build` -> `docker compose ps`; validar `curl -fsS http://127.0.0.1:<HOST_PORT>/health`.
6. Publicar pelo reverse proxy HTTPS e WSS com upgrade de WebSocket; nunca abrir porta do Node na interface pública da VPS.
7. Fazer testes reais com dois dispositivos: perfil, amizade, presença, convite, aceite, jogadas alternadas, vitória, revanche e desconexão/reconexão.
8. Registrar SHA implantado, testar backup da pasta `data` e definir rollback; só automatizar deploy após autorização.

## Regras obrigatórias do gameplay e interface

- Tabuleiro: ligações verticais **somente na coluna central**, horizontais em topo/meio/base e arco central. Sem as quatro verticais laterais rejeitadas.
- HUD vertical mobile, placar atualizado por JS (números jamais fixos nos PNGs), botões simples, fullscreen via interação do usuário.
- Online: servidor valida turnos/movimentos; nunca confiar em posições ou placar enviados pelo cliente.
- Inicialmente uma única instância de servidor. Antes de lançar comercialmente: PostgreSQL, autenticação, proteção por IP, observabilidade e política de recuperação de perfis.

## Privacidade

Nunca versionar `.env`, `data/`, `cuprush-data.json`, backups, tokens e credenciais. Repositório privado **não** significa que frontend servido no navegador fique oculto ao jogador. Back-end deve permanecer somente na VPS.