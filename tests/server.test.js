import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {createArena} from '../server/index.js';

async function fixture(t){
  const app=createArena();await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${app.server.address().port}`;
  t.after(()=>app.close());
  const post=(route,data,origin=url)=>fetch(url+route,{method:'POST',headers:{'Content-Type':'application/json','Origin':origin},body:JSON.stringify(data)});
  return {...app,url,post};
}
function connect(url,auth){
  return new Promise((resolve,reject)=>{
    const ws=new WebSocket(url.replace('http:','ws:')+'/socket',{origin:url});
    ws.on('error',reject);ws.once('open',()=>ws.send(JSON.stringify({type:'auth',...auth})));
    ws.once('message',raw=>resolve({ws,data:JSON.parse(raw)}));
  });
}
function message(ws,predicate){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{ws.off('message',listener);reject(new Error('Timed out waiting for message'));},2000);
    const listener=raw=>{const data=JSON.parse(raw);if(predicate(data)){clearTimeout(timer);ws.off('message',listener);resolve(data);}};ws.on('message',listener);
  });
}
test('HTTP serves only public assets and rejects cross-origin mutation and invalid nicknames',async t=>{
  const {url,post}=await fixture(t);
  assert.equal((await fetch(url+'/')).status,200);assert.equal((await fetch(url+'/server/index.js')).status,404);
  assert.equal((await post('/api/rooms',{name:'Sneak'},'https://evil.invalid')).status,403);
  assert.equal((await post('/api/rooms',{name:'  '})).status,400);
  assert.equal((await post('/api/rooms',null)).status,400);
  assert.match((await fetch(url+'/')).headers.get('content-security-policy'),/frame-ancestors 'none'/);
});
test('six independent clients can join, seventh is refused, and no token appears in any snapshot',async t=>{
  const {url,post}=await fixture(t);const first=await (await post('/api/rooms',{name:'Host'})).json();const auth=[first];
  for(let i=1;i<6;i++)auth.push(await(await post(`/api/rooms/${first.room}/join`,{name:`Beep ${i}`})).json());
  assert.equal((await post(`/api/rooms/${first.room}/join`,{name:'Seventh'})).status,400);
  for(const a of auth){const {data}=await connect(url,a);assert.equal(data.players.length,6);for(const b of auth)assert.ok(!JSON.stringify(data).includes(b.token));}
});
test('seat authentication, host controls and socket replacement preserve ownership',async t=>{
  const {url,post,rooms}=await fixture(t);const a=await(await post('/api/rooms',{name:'Host'})).json();
  const b=await(await post(`/api/rooms/${a.room}/join`,{name:'Guest'})).json();
  const invalid=await connect(url,{room:a.room,token:'invalid'});assert.equal(invalid.data.type,'expired');
  const host=await connect(url,a),guest=await connect(url,b);
  const reply=message(guest.ws,d=>d.type==='state');guest.ws.send(JSON.stringify({type:'add-bot'}));assert.equal((await reply).players.length,2);
  const replaced=new Promise(resolve=>host.ws.once('close',resolve));await connect(url,a);assert.equal(await replaced,4002);
  assert.equal(rooms.get(a.room).players[0].connected,true);
});
test('a reconnected player keeps their board and ready-up cannot change a live match',async t=>{
  const {url,post,rooms}=await fixture(t);const a=await(await post('/api/rooms',{name:'Host'})).json();
  const b=await(await post(`/api/rooms/${a.room}/join`,{name:'Guest'})).json();
  const host=await connect(url,a),guest=await connect(url,b),r=rooms.get(a.room);
  for(const p of r.players)p.ready=true;r.start(Date.now()-3001);r.tick(Date.now());
  const response=message(host.ws,d=>d.type==='state'&&d.players.find(p=>p.id===a.player).game.pieces===1);
  host.ws.send(JSON.stringify({type:'input',round:1,seq:1,action:'drop'}));await response;
  const before=structuredClone(r.players[0].game.board);host.ws.close();await new Promise(resolve=>host.ws.once('close',resolve));
  const again=await connect(url,a);assert.deepEqual(again.data.players.find(p=>p.id===a.player).game.board,before);
  const status=message(guest.ws,d=>d.type==='state');guest.ws.send(JSON.stringify({type:'ready',ready:false}));assert.equal((await status).phase,'playing');
});
