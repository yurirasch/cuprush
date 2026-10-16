'use strict';
/* Small RFC6455 WebSocket server for text JSON, ping/pong and browser clients.
   No external dependency; intended for small, single-process CupRush rooms. */
const crypto = require('crypto');
const {EventEmitter} = require('events');
const OPEN=1,CLOSED=3;
class SocketPeer extends EventEmitter{
  constructor(socket,head,onFinish){super();this.socket=socket;this.readyState=OPEN;this.buffer=Buffer.alloc(0);this.partials=[];this.partialsSize=0;this._onFinish=onFinish;
    socket.on('data',b=>this.receive(b));socket.on('close',()=>this.end());socket.on('error',()=>this.end());
    if(head?.length)this.receive(head);
  }
  receive(chunk){if(this.readyState!==OPEN)return;
    if(this.buffer.length+chunk.length>16384)return this.terminate();
    this.buffer=Buffer.concat([this.buffer,chunk]);let loops=0;
    while(this.buffer.length>=2&&loops++<100){
      let offset=2,byte1=this.buffer[0],byte2=this.buffer[1],opcode=byte1&0x0f,fin=!!(byte1&0x80),masked=!!(byte2&0x80),size=byte2&0x7f;
      if(!masked)return this.terminate();
      if(size===126){if(this.buffer.length<4)return;size=this.buffer.readUInt16BE(2);offset=4;}
      else if(size===127){if(this.buffer.length<10)return;const high=this.buffer.readUInt32BE(2),low=this.buffer.readUInt32BE(6);if(high||low>8192)return this.terminate();size=low;offset=10;}
      if(size>8192)return this.terminate();
      if(this.buffer.length<offset+4+size)return;
      const mask=this.buffer.subarray(offset,offset+4),part=Buffer.from(this.buffer.subarray(offset+4,offset+4+size));this.buffer=this.buffer.subarray(offset+4+size);
      for(let i=0;i<part.length;i++)part[i]^=mask[i&3];
      if(opcode===8){this.terminate();return;}
      if(opcode===9){this.frame(10,part);continue;}
      if(opcode===10){this.emit('pong');continue;}
      if(opcode!==0&&opcode!==1)return this.terminate();
      this.partials.push(part);this.partialsSize+=part.length;if(this.partialsSize>8192)return this.terminate();
      if(fin){const msg=Buffer.concat(this.partials);this.partials=[];this.partialsSize=0;this.emit('message',msg);}
    }
    if(loops>=100)this.terminate();
  }
  frame(opcode,data){if(this.readyState!==OPEN)return;const body=Buffer.isBuffer(data)?data:Buffer.from(String(data));const n=body.length;
    if(n>8192)return this.terminate();const header=Buffer.alloc(n<126?2:n<=65535?4:10);header[0]=0x80|opcode;
    if(n<126)header[1]=n;else if(n<=65535){header[1]=126;header.writeUInt16BE(n,2);}else{header[1]=127;header.writeUInt32BE(0,2);header.writeUInt32BE(n,6);}
    try{this.socket.write(Buffer.concat([header,body]));}catch(e){this.terminate();}
  }
  send(s){this.frame(1,s)}
  ping(){this.frame(9,Buffer.alloc(0))}
  close(){this.frame(8,Buffer.alloc(0));this.terminate()}
  terminate(){if(this.readyState!==OPEN)return;this.readyState=CLOSED;this.socket.destroy();this.end();}
  end(){if(this._ended)return;this._ended=true;this.readyState=CLOSED;this._onFinish?.(this);this.emit('close');}
}
class WebSocketServer extends EventEmitter{
  constructor({maxPayload=8192}={}){super();this.clients=new Set();this.maxPayload=maxPayload;}
  handleUpgrade(req,socket,head,cb){
    const key=req.headers['sec-websocket-key'];const raw=key&&Buffer.from(key,'base64');
    if(req.method!=='GET'||!key||!raw||raw.length!==16||String(req.headers.upgrade||'').toLowerCase()!=='websocket'||String(req.headers['sec-websocket-version'])!=='13'){socket.destroy();return;}
    const accept=crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
    const ws=new SocketPeer(socket,head,w=>this.clients.delete(w));this.clients.add(ws);cb(ws);
  }
}
module.exports={WebSocketServer,WebSocket:{OPEN}};