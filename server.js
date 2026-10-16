'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('./tiny-ws');
const PORT = Number(process.env.PORT || 3000);
const STORE = process.env.DATA_PATH || path.join(__dirname, 'cuprush-data.json');
const ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomCode = n => Array.from(crypto.randomBytes(n), b => alphabet[b % alphabet.length]).join('');
const randomId = () => crypto.randomUUID();
const cleanName = val => (typeof val === 'string' ? val : 'Jogador').trim().replace(/[<>\x00-\x1f]/g, '').slice(0, 20) || 'Jogador';
let db = { users: {}, requests: [] };
try {
  const d = JSON.parse(fs.readFileSync(STORE, 'utf8'));
  if (d && d.users && Array.isArray(d.requests)) db = d;
} catch(e) { if(e.code !== 'ENOENT') console.warn('Could not load user store:', e.message); }
let saveQueue = Promise.resolve();
function save() {
  const content = JSON.stringify(db);
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    const tmp = STORE + '.' + process.pid + '.tmp';
    await fs.promises.writeFile(tmp, content, { mode: 0o600 });
    await fs.promises.rename(tmp, STORE);
  }).catch(err => console.error('Unable to persist user data:', err.message));
}
const sockets = new Map();
const challenges = new Map();
const matches = new Map();
const lastMatches = new Map();
const LEVEL = Array.from({length:15}, (_,id)=>({ id, r:Math.floor(id/3),c:id%3 }));
const edges = Array.from({length:15},()=>new Set());
function connect(a,b){edges[a].add(b);edges[b].add(a);}
for(let r=0;r<4;r++) connect(r*3+1,(r+1)*3+1);
for(const r of [0,2,4]) for(let c=0;c<2;c++) connect(r*3+c,r*3+c+1);
for(const [a,b] of [[4,8],[8,10],[10,6],[6,4]]) connect(a,b);
function legalMoves(from,pieces){
  const positions = new Set(pieces.filter(p=>p.active).map(p=>p.at));
  const list=[];
  for(const next of edges[from]){
    if(!positions.has(next)){list.push(next);continue;}
    const one=LEVEL[from], mid=LEVEL[next],dr=mid.r-one.r,dc=mid.c-one.c;
    if(Math.abs(dr)+Math.abs(dc)!==1) continue;
    const r=mid.r+dr, c=mid.c+dc;
    if(r<0||r>4||c<0||c>2)continue;
    const after=r*3+c;
    if(edges[next].has(after)&&!positions.has(after))list.push(after);
  }
  return list;
}
function newMatch(from,to){
  const pieces=[];
  for(let c=0;c<3;c++){
    pieces.push({id:'r'+c,team:0,at:12+c,active:true});
    pieces.push({id:'b'+c,team:1,at:c,active:true});
  }
  const m={id:randomId(),players:[from,to],pieces,turn:0,scores:[0,0],winner:null,status:'playing',updated:Date.now(),votes:[]};
  matches.set(m.id,m); lastMatches.set(from,m.id);lastMatches.set(to,m.id);return m;
}
function connected(id){return (sockets.get(id)?.size||0)>0;}
function send(ws,type,extra={}){if(ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify({type,...extra}));}
function sendTo(id,type,extra={}){for(const ws of sockets.get(id)||[])send(ws,type,extra);}
function safeUser(u){return {id:u.id,code:u.code,name:u.name,online:connected(u.id)};}
function snapshot(id){
  const u=db.users[id];if(!u)return;
  const friends=(u.friends||[]).map(fid=>db.users[fid]).filter(Boolean).map(safeUser).sort((a,b)=>Number(b.online)-Number(a.online)||a.name.localeCompare(b.name));
  const requests=db.requests.filter(r=>r.to===id).map(r=>({id:r.id,from:safeUser(db.users[r.from])})).filter(r=>r.from);
  const sent=db.requests.filter(r=>r.from===id).map(r=>r.to);
  const invites=[...challenges.values()].filter(c=>c.to===id&&c.expires>Date.now()).map(c=>({...c,from:safeUser(db.users[c.from])}));
  sendTo(id,'SOCIAL',{friends,requests,sent,invites});
}
function notifyCircle(ids){const set=new Set(ids);for(const id of ids){const u=db.users[id];if(u)for(const fid of u.friends||[])set.add(fid);}for(const id of set)snapshot(id);}
function publicState(m){return {id:m.id,players:m.players.map(id=>safeUser(db.users[id])),pieces:m.pieces,turn:m.turn,scores:m.scores,winner:m.winner,status:m.status,updated:m.updated,votes:m.votes};}
function updateMatch(m){const state=publicState(m);for(const pid of m.players)sendTo(pid,'MATCH',{match:state});}
function error(ws,message){send(ws,'ERROR',{message});}
function rateOK(ws){const now=Date.now();const hist=ws.rate||(ws.rate=[]);while(hist.length&&hist[0]<now-10000)hist.shift();if(hist.length>=65)return false;hist.push(now);return true;}
function isPlayerInMatch(id){const mid=lastMatches.get(id),m=matches.get(mid);return !!m&&m.status==='playing'&&m.players.includes(id);}
function handle(ws,msg){
  if(!msg||typeof msg.type!=='string')return;
  if(!rateOK(ws)){error(ws,'Muitas ações. Aguarde.');return;}
  if(msg.type==='HELLO'){
    if(ws.uid){error(ws,'Sessão já iniciada.');return;}
    let user=Object.values(db.users).find(u=>u.token===msg.token && typeof msg.token==='string'&&msg.token.length>24);
    if(!user){
      let code=randomCode(8);while(Object.values(db.users).some(u=>u.code===code))code=randomCode(8);
      user={id:randomId(),code,name:cleanName(msg.name),token:crypto.randomBytes(32).toString('hex'),friends:[]};
      db.users[user.id]=user;save();
    }
    ws.uid=user.id;
    let ss=sockets.get(user.id);if(!ss){ss=new Set();sockets.set(user.id,ss);}ss.add(ws);
    send(ws,'WELCOME',{user:safeUser(user),token:user.token,onlineEnabled:true});
    snapshot(user.id);notifyCircle([user.id]);
    const mid=lastMatches.get(user.id),match=matches.get(mid);
    if(match&&match.players.includes(user.id))updateMatch(match);
    return;
  }
  const uid=ws.uid;if(!uid){error(ws,'Entre primeiro.');return;}
  const u=db.users[uid];if(!u)return;
  if(msg.type==='NAME'){
    u.name=cleanName(msg.name);save();sendTo(uid,'PROFILE',{user:safeUser(u)});notifyCircle([uid]);return;
  }
  if(msg.type==='FRIEND_REQUEST'){
    const code=String(msg.code||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
    const other=Object.values(db.users).find(v=>v.code===code);
    if(!other)return error(ws,'Código de amigo não encontrado.');
    if(other.id===uid)return error(ws,'Esse código é seu.');
    if(u.friends.includes(other.id))return error(ws,'Vocês já são amigos.');
    if(db.requests.some(r=>r.from===uid&&r.to===other.id))return error(ws,'Pedido já enviado.');
    if(db.requests.some(r=>r.from===other.id&&r.to===uid)){
      db.requests=db.requests.filter(r=>!([r.from,r.to].includes(uid)&&[r.from,r.to].includes(other.id)));
      u.friends.push(other.id);other.friends.push(uid);save();notifyCircle([uid,other.id]);
      sendTo(uid,'NOTICE',{message:'Amigo adicionado!'});sendTo(other.id,'NOTICE',{message:'Amigo adicionado!'});return;
    }
    db.requests.push({id:randomId(),from:uid,to:other.id,at:Date.now()});save();snapshot(uid);snapshot(other.id);
    send(ws,'NOTICE',{message:'Pedido enviado!'});return;
  }
  if(msg.type==='FRIEND_ACCEPT'||msg.type==='FRIEND_DECLINE'){
    const req=db.requests.find(r=>r.id===msg.id&&r.to===uid);
    if(!req)return error(ws,'Pedido indisponível.');
    db.requests=db.requests.filter(r=>r!==req);
    if(msg.type==='FRIEND_ACCEPT'){
      const other=db.users[req.from];if(other){u.friends=u.friends||[];other.friends=other.friends||[];if(!u.friends.includes(other.id))u.friends.push(other.id);if(!other.friends.includes(uid))other.friends.push(uid);}
    }
    save();notifyCircle([uid,req.from]);return;
  }
  if(msg.type==='INVITE'){
    const target=String(msg.to||'');
    if(!u.friends.includes(target))return error(ws,'Adicione esse jogador primeiro.');
    if(!connected(target))return error(ws,'O amigo está offline.');
    if(isPlayerInMatch(uid)||isPlayerInMatch(target))return error(ws,'Um de vocês já está jogando.');
    for(const [cid,c] of challenges){if(c.from===uid&&c.to===target)challenges.delete(cid);}
    const challenge={id:randomId(),from:uid,to:target,expires:Date.now()+120000};
    challenges.set(challenge.id,challenge);snapshot(target);send(ws,'NOTICE',{message:'Desafio enviado!'});return;
  }
  if(msg.type==='INVITE_ACCEPT'||msg.type==='INVITE_DECLINE'){
    const c=challenges.get(msg.id);
    if(!c||c.to!==uid||c.expires<Date.now())return error(ws,'Desafio expirado.');
    challenges.delete(c.id);snapshot(uid);
    if(msg.type==='INVITE_DECLINE'){sendTo(c.from,'NOTICE',{message:'Desafio recusado.'});return;}
    if(!connected(c.from))return error(ws,'O amigo saiu.');
    if(isPlayerInMatch(c.from)||isPlayerInMatch(uid))return error(ws,'Um de vocês já está jogando.');
    const m=newMatch(c.from,uid);updateMatch(m);notifyCircle([c.from,uid]);return;
  }
  if(msg.type==='MOVE'){
    const match=matches.get(msg.matchId),from=Number(msg.from),to=Number(msg.to);
    if(!match||!match.players.includes(uid)||match.status!=='playing')return error(ws,'Partida indisponível.');
    const team=match.players.indexOf(uid);
    if(team!==match.turn)return error(ws,'Não é sua vez.');
    if(!connected(match.players[1-team]))return error(ws,'Aguarde o amigo reconectar.');
    if(!Number.isInteger(from)||!Number.isInteger(to))return error(ws,'Movimento inválido.');
    const p=match.pieces.find(p=>p.team===team&&p.active&&p.at===from);
    if(!p||!legalMoves(from,match.pieces).includes(to))return error(ws,'Movimento não permitido.');
    p.at=to;
    if(LEVEL[to].r===(team===0?0:4)){p.active=false;match.scores[team]++;}
    if(match.scores[team]>=3){match.winner=team;match.status='finished';}
    else {match.turn=1-team;
      const next=match.turn, possible=match.pieces.some(pp=>pp.active&&pp.team===next&&legalMoves(pp.at,match.pieces).length);
      if(!possible) match.turn=team;
    }
    match.updated=Date.now();updateMatch(match);return;
  }
  if(msg.type==='REMATCH'){
    const m=matches.get(msg.matchId);if(!m||!m.players.includes(uid)||m.status!=='finished')return error(ws,'Partida não concluída.');
    if(!m.votes.includes(uid))m.votes.push(uid);
    if(m.votes.length===2){const n=newMatch(m.players[1],m.players[0]);updateMatch(n);}
    else updateMatch(m);return;
  }
  if(msg.type==='LEAVE'){
    const m=matches.get(msg.matchId);if(m&&m.players.includes(uid)&&m.status==='playing'){
      m.status='finished';m.winner=1-m.players.indexOf(uid);m.updated=Date.now();updateMatch(m);
    }
    lastMatches.delete(uid);snapshot(uid);return;
  }
  if(msg.type==='PING'){send(ws,'PONG',{at:Date.now()});return;}
}
const server=http.createServer((req,res)=>{
  const route=(req.url||'/').split('?')[0];
  if(route==='/health'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify({ok:true,service:'CupRush Online',playersOnline:[...sockets].filter(([id,ss])=>ss.size).length}));}
  if(route!=='/'&&route!=='/index.html'){res.writeHead(404);return res.end('Not found');}
  fs.readFile(path.join(__dirname,'index.html'),(err,html)=>{
    if(err){res.writeHead(500);return res.end('Missing index.html');}
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'});res.end(html);
  });
});
const wss=new WebSocketServer({noServer:true,perMessageDeflate:false,maxPayload:8192});
server.on('upgrade',(request,socket,head)=>{
  if(request.url!=='/ws')return socket.destroy();
  const origin=request.headers.origin;
  if(ORIGINS.length&&origin&&!ORIGINS.includes(origin))return socket.destroy();
  wss.handleUpgrade(request,socket,head,ws=>wss.emit('connection',ws,request));
});
wss.on('connection',ws=>{
  ws.isAlive=true;
  ws.on('pong',()=>ws.isAlive=true);
  ws.on('message',raw=>{try{const data=JSON.parse(raw.toString());handle(ws,data);}catch(e){error(ws,'Mensagem inválida.');console.error('message error',e.message);}});
  ws.on('close',()=>{
    const id=ws.uid;if(!id)return;
    const group=sockets.get(id);if(group){group.delete(ws);if(!group.size)sockets.delete(id);}
    notifyCircle([id]);const mid=lastMatches.get(id),match=matches.get(mid);if(match)updateMatch(match);
  });
});
setInterval(()=>{
  for(const ws of wss.clients){if(!ws.isAlive){ws.terminate();continue;}ws.isAlive=false;ws.ping();}
  const now=Date.now();for(const [id,c] of challenges)if(c.expires<now)challenges.delete(id);
  for(const [id,m] of matches)if(now-m.updated>1000*60*60*8){matches.delete(id);for(const uid of m.players)if(lastMatches.get(uid)===id)lastMatches.delete(uid);}
},30000).unref();
server.listen(PORT,'0.0.0.0',()=>console.log('CupRush Online listening on http://0.0.0.0:'+PORT));