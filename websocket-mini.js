'use strict';
/* RFC6455 minimal text WebSocket server, no external dependencies.
   Intended for this small prototype; production deployments should use a hardened WS library. */
const crypto=require('crypto');
const EventEmitter=require('events');
const GUID='258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
function frame(opcode,data){
  data=Buffer.isBuffer(data)?data:Buffer.from(data||'');const n=data.length;
  let header;
  if(n<126){header=Buffer.alloc(2);header[1]=n;}
  else if(n<=65535){header=Buffer.alloc(4);header[1]=126;header.writeUInt16BE(n,2);}
  else{header=Buffer.alloc(10);header[1]=127;header.writeBigUInt64BE(BigInt(n),2);}
  header[0]=0x80|opcode;return Buffer.concat([header,data]);
}
class Client extends EventEmitter{
  constructor(socket,head,maxPayload){
    super();this.socket=socket;this.maxPayload=maxPayload;this.readyState=1;this.buffer=Buffer.alloc(0);this.frags=[];this.fragSize=0;
    socket.on('data',chunk=>this.feed(chunk));socket.on('error',()=>this.destroy());socket.on('close',()=>{this.readyState=3;this.emit('close');});
    if(head?.length)this.feed(head);
  }
  send(text){if(this.readyState===1)this.socket.write(frame(1,Buffer.from(String(text))));}
  close(){if(this.readyState!==1)return;this.readyState=2;try{this.socket.write(frame(8,Buffer.alloc(0)));}catch{}this.socket.end();}
  destroy(){this.socket.destroy();}
  feed(chunk){
    if(this.readyState!==1)return;
    this.buffer=Buffer.concat([this.buffer,chunk]);
    while(this.buffer.length>=2){
      const b=this.buffer,fin=!!(b[0]&128),opcode=b[0]&15,masked=!!(b[1]&128);
      let length=b[1]&127,offset=2;
      if(length===126){if(b.length<4)return;length=b.readUInt16BE(2);offset=4;}
      else if(length===127){if(b.length<10)return;const l=b.readBigUInt64BE(2);if(l>BigInt(this.maxPayload)){this.destroy();return;}length=Number(l);offset=10;}
      if(!masked||length>this.maxPayload||this.fragSize+length>this.maxPayload){this.destroy();return;}
      if(b.length<offset+4+length)return;
      const mask=b.subarray(offset,offset+4);offset+=4;
      const data=Buffer.from(b.subarray(offset,offset+length));
      for(let i=0;i<data.length;i++)data[i]^=mask[i%4];
      this.buffer=b.subarray(offset+length);
      if(opcode===8){this.close();return;}
      if(opcode===9){this.socket.write(frame(10,data));continue;}
      if(opcode===10)continue;
      if(opcode===1&&fin){this.emit('message',data);continue;}
      if(opcode===1&&!fin){this.frags=[data];this.fragSize=data.length;continue;}
      if(opcode===0&&this.frags.length){this.frags.push(data);this.fragSize+=data.length;if(fin){this.emit('message',Buffer.concat(this.frags));this.frags=[];this.fragSize=0;}continue;}
      this.destroy();return;
    }
  }
}
Client.OPEN=1;
class MiniWSServer extends EventEmitter{
  constructor({maxPayload=16384}={}){super();this.maxPayload=maxPayload;this.clients=new Set();}
  handleUpgrade(req,socket,head,callback){
    const key=req.headers['sec-websocket-key'];
    if(req.headers.upgrade?.toLowerCase()!=='websocket'||!key||req.headers['sec-websocket-version']!=='13'){
      socket.destroy();return;
    }
    const accept=crypto.createHash('sha1').update(key+GUID).digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
    const ws=new Client(socket,head,this.maxPayload);
    this.clients.add(ws);ws.on('close',()=>this.clients.delete(ws));callback(ws);
  }
}
module.exports={MiniWSServer,Client};
