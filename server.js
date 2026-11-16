'use strict';
/* Node.js 18+ | npm install && npm start */
const http=require('http');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {MiniWSServer,Client}=require('./websocket-mini');
const Engine=require('./engine');
const PORT=Number(process.env.PORT||3000);
const rooms=new Map();
const DATA_DIR=process.env.DATA_DIR||__dirname;const DATA_PATH=path.join(DATA_DIR,'sayehha_rooms_private.json');
try{const old=JSON.parse(fs.readFileSync(DATA_PATH,'utf8'));if(Array.isArray(old))for(const e of old){if(e&&e.room&&e.room.code&&e.last>Date.now()-4*3600000)rooms.set(e.room.code,e);}}catch{}
let flushTimer=null;function schedulePersist(){clearTimeout(flushTimer);flushTimer=setTimeout(()=>{try{fs.mkdirSync(DATA_DIR,{recursive:true});const temp=DATA_PATH+'.tmp';fs.writeFileSync(temp,JSON.stringify([...rooms.values()]),{mode:0o600});fs.renameSync(temp,DATA_PATH);}catch(e){console.error('Room persistence error:',e.message)}},650);}
const AUTO_MS={intro:90000,meet:50000,talk:180000,nomination:45000,defense:70000,finalvote:45000,lastmove:50000,night:55000,emergency:45000};

const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function code(){let s;do{s=Array.from(crypto.randomBytes(6),n=>ALPHABET[n%ALPHABET.length]).join('')}while(rooms.has(s));return s;}
const publicFiles={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/style.css':'style.css','/engine.js':'engine.js','/icon.svg':'icon.svg','/manifest.webmanifest':'manifest.webmanifest'};
const mime={html:'text/html; charset=utf-8',js:'application/javascript; charset=utf-8',css:'text/css; charset=utf-8',svg:'image/svg+xml',webmanifest:'application/manifest+json'};
const server=http.createServer((req,res)=>{
 const p=new URL(req.url,'http://localhost').pathname;if(p==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({status:'ok',rooms:rooms.size}));return;}const filename=publicFiles[p];
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Cache-Control','no-store');
 if(!filename||req.method!=='GET'){res.writeHead(404);res.end('Not found');return;}
 fs.readFile(path.join(__dirname,filename),(err,data)=>{
  if(err){res.writeHead(500);res.end('Server error');return;}
  res.writeHead(200,{'Content-Type':mime[filename.split('.').pop()]});res.end(data);
 });
});
const wss=new MiniWSServer({maxPayload:16384});
server.on('upgrade',(req,socket,head)=>{
 if(new URL(req.url,'http://localhost').pathname!=='/ws'){socket.destroy();return;}
 wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
});
const send=(ws,obj)=>{if(ws.readyState===Client.OPEN)ws.send(JSON.stringify(obj));};
function broadcast(room){for(const ws of wss.clients){if(ws.roomCode===room.code&&ws.playerId){const p=room.players.find(x=>x.id===ws.playerId);if(p)send(ws,{type:'state',state:Engine.view(room,p.id)});}}}
function token(){return crypto.randomBytes(24).toString('hex');}
wss.on('connection',ws=>{
 let count=0,windowStart=Date.now();
 ws.on('message',payload=>{
  try{
   if(Date.now()-windowStart>10000){count=0;windowStart=Date.now();}if(++count>60)throw Error('تعداد درخواست‌ها زیاد است.');
   let msg=JSON.parse(payload.toString('utf8'));
   if(!msg||typeof msg!=='object')throw Error('درخواست نامعتبر.');
   if(msg.type==='create'){
    if(rooms.size>300)throw Error('ظرفیت سرور پر است.');
    const roomCode=code(),idToken=token(),room=Engine.createRoom(roomCode,msg.name,msg.scenario,idToken);
    rooms.set(roomCode,{room,last:Date.now()});schedulePersist();ws.roomCode=roomCode;ws.playerId=room.hostId;
    send(ws,{type:'joined',code:roomCode,token:idToken});broadcast(room);
   }else if(msg.type==='join'||msg.type==='rejoin'){
    const roomCode=String(msg.code||'').toUpperCase().trim(), entry=rooms.get(roomCode);
    if(!entry)throw Error('اتاق پیدا نشد (یا سرور دوباره راه‌اندازی شده است).');
    const room=entry.room;let p,secret;
    if(msg.type==='rejoin'){
      secret=String(msg.token||'');p=room.players.find(x=>!x.bot&&x.token===secret);
      if(!p)throw Error('مجوز بازگشت به این اتاق معتبر نیست.');
    }else{
      secret=token();p=Engine.join(room,msg.name,secret);
    }
    ws.roomCode=roomCode;ws.playerId=p.id;entry.last=Date.now();schedulePersist();
    send(ws,{type:'joined',code:roomCode,token:secret});broadcast(room);
   }else if(msg.type==='action'){
    const entry=rooms.get(ws.roomCode),room=entry?.room;
    if(!room||!ws.playerId)throw Error('ابتدا وارد یک اتاق شو.');
    Engine.action(room,ws.playerId,msg.action,msg.data);
    entry.last=Date.now();schedulePersist();broadcast(room);
   }else throw Error('درخواست نامعتبر.');
  }catch(e){send(ws,{type:'error',message:e.message||'خطا در پردازش درخواست.'});}
 });
});
setInterval(()=>{
 const now=Date.now();for(const [id,entry] of rooms)if(now-entry.last>4*60*60*1000){rooms.delete(id);schedulePersist();}
},10*60*1000).unref();
setInterval(()=>{for(const entry of rooms.values()){const r=entry.room;if(!r.autoEnabled||!r.stageDeadline||r.phase==='end'||r.phase==='lobby'||Date.now()<r.stageDeadline)continue;try{Engine.action(r,r.hostId,'next');entry.last=Date.now();}catch(e){r.stageDeadline=Date.now()+15000;for(const c of wss.clients)if(c.roomCode===r.code&&c.playerId===r.hostId)send(c,{type:'error',message:'گرداننده خودکار: '+e.message});}schedulePersist();broadcast(r);}},1000).unref();
server.listen(PORT,'0.0.0.0',()=>console.log(`Shadows Mafia: http://localhost:${PORT}`));
