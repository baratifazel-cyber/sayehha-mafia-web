'use strict';
const E=require('./engine'), assert=require('node:assert/strict');
function make(s){const r=E.createRoom('ABCDEF','انسان',s,'abcdefgh01');E.action(r,r.hostId,'bots',{count:s==='father'?10:9});E.action(r,r.hostId,'start');return r;}
const counted={father:0,army:0};
for(let i=0;i<120;i++)for(const scenario of ['father','army']){
 const r=make(scenario);const n=scenario==='father'?11:10;assert.equal(r.players.length,n);assert.equal(r.players.filter(p=>p.bot).length,n-1);assert.equal(r.players.filter(p=>p.faction==='mafia').length,scenario==='father'?3:0);assert.equal(r.players.filter(p=>p.faction==='gestapo').length,scenario==='army'?3:0);
 assert.deepEqual(r.players.map(p=>p.role).sort(),(scenario==='father'?['godfather','saul','matador','doctor','leon','kane','constantine','citizen','citizen','citizen','nostradamus']:['kessler','reinhardt','gestapo','curtis','agent','agent','pascal','pilot','customer','customer']).sort());
 assert.equal(E.view(r,r.hostId).players.filter(p=>p.role).length,0,'نقش بقیه نباید پیش از پایان آشکار شود');
 E.action(r,r.hostId,'next');assert.equal(r.phase,'meet');
 const nost=r.players.find(p=>p.role==='nostradamus');if(nost&&!nost.bot){const ids=r.players.filter(p=>p.id!==nost.id).slice(0,3).map(p=>p.id);const mafia=ids.filter(id=>{const q=r.players.find(p=>p.id===id);return q.faction==='mafia'&&q.role!=='godfather';}).length;E.action(r,nost.id,'prophecy',{ids,side:mafia>=2?'mafia':'town'});}
 E.action(r,r.hostId,'next');assert.equal(r.phase,'talk');
 for(let k=0;k<4&&r.phase!=='end';k++){
  E.action(r,r.hostId,'next');
  if(scenario==='father'){
    if(r.phase==='nomination')E.action(r,r.hostId,'next');
    if(r.phase==='defense')E.action(r,r.hostId,'next');
    if(r.phase==='finalvote')E.action(r,r.hostId,'next');
    if(r.phase==='lastmove'){const p=r.players.find(p=>p.id===r.pending?.id);if(p&&!p.bot){const targets=r.players.filter(x=>x.alive&&x.id!==p.id);const t=targets[0];const id=r.card==='silence'?targets.slice(0,targets.length<=5?1:2).map(x=>x.id).join(','):t.id;E.action(r,p.id,'card',{id});}if(r.phase==='lastmove')E.action(r,r.hostId,'next');}
    if(r.phase==='night')E.action(r,r.hostId,'next');
  }else if(r.phase==='emergency')E.action(r,r.hostId,'next');
 }
 counted[scenario]++;
}
const a=make('father'),p=a.players.find(x=>x.role==='nostradamus');E.action(a,a.hostId,'next');if(!p.bot){const ids=a.players.filter(q=>q!==p).slice(0,3).map(x=>x.id);const n=ids.filter(id=>{const q=a.players.find(x=>x.id===id);return q.faction==='mafia'&&q.role!=='godfather'}).length;E.action(a,p.id,'prophecy',{ids,side:n>=2?'mafia':'town'});}E.action(a,a.hostId,'next');assert.throws(()=>E.action(a,a.hostId,'night',{type:'shoot'}),/فقط در شب|این نقش/);
const b=make('army'),cur=b.players.find(x=>x.role==='curtis');assert.equal(cur.intel.length,3);const k=b.players.find(x=>x.role==='kessler');assert.equal(k.intel.length,0);E.action(b,b.hostId,'next');E.action(b,b.hostId,'next');const z=b.players.find(x=>x.role==='customer');assert.throws(()=>E.action(b,z.id,'shoot',{id:b.players[0].id}),/شلیک|اسلحه|مرحله/);
console.log('PASS: 240 randomized game-flow tests + rule/privacy checks',counted);
