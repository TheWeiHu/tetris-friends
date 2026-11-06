import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Room,RECONNECT_MS} from '../server/room.js';

function room(count=6){const r=new Room('Host',0,1000);for(let i=1;i<count;i++)r.addPlayer(`Player ${i}`,i,1000);for(const p of r.players){p.connected=true;p.ready=true;}r.start(1000);r.tick(4000);return r;}
test('six seats enforce capacity and all players must ready up',()=>{
  const r=new Room('Host');assert.throws(()=>r.start(),/two players/);for(let i=1;i<6;i++)r.addPlayer(`Player ${i}`);
  assert.throws(()=>r.addBot(),/full/);assert.throws(()=>r.start(),/ready/);
});
test('attacks conserve earned rows, balance recipients, and avoid eliminated players',()=>{
  const r=room(),sender=r.players[0];r.distribute(sender,13,4100);
  const counts=r.players.slice(1).map(p=>p.pending.length);
  assert.equal(counts.reduce((a,b)=>a+b,0),13);assert.ok(Math.max(...counts)-Math.min(...counts)<=1);assert.equal(sender.pending.length,0);
  r.eliminate(r.players[1]);const before=r.players[1].pending.length;r.distribute(sender,12,4200);assert.equal(r.players[1].pending.length,before);
});
test('the whole room shares pressure history, so repeated attackers cannot pile on one target',()=>{
  const r=room();r.distribute(r.players[0],5,4100);r.distribute(r.players[1],5,4200);
  const counts=r.players.map(p=>p.pending.length);assert.ok(Math.max(...counts)<=2);assert.equal(counts.reduce((a,b)=>a+b,0),10);
});
test('clear attacks cancel pending rows before sending any remainder',()=>{
  const r=room(3),p=r.players[0];p.pending=Array.from({length:3},()=>({hole:4,due:5000}));
  r.process(p,{attack:4,lines:4,combo:0},4500);assert.equal(p.pending.length,0);assert.equal(p.sent,1);assert.equal(r.players.slice(1).reduce((n,p)=>n+p.pending.length,0),1);
});
test('garbage waits for its warning, only rises on no-clear locks, and caps each rise at four',()=>{
  const r=room(2),p=r.players[0];p.pending=Array.from({length:8},()=>({hole:4,due:6000}));
  r.process(p,{attack:0,lines:0},5000);assert.equal(p.pending.length,8);
  r.process(p,{attack:0,lines:1},6500);assert.equal(p.pending.length,8);
  r.process(p,{attack:0,lines:0},6500);assert.equal(p.pending.length,4);assert.equal(p.game.board.flat().filter(v=>v==='G').length,36);
});
test('round and sequence checks reject stale, duplicated and fabricated input',()=>{
  const r=room(2),p=r.players[0],x=p.game.active.x;
  r.input(p,'right',1,0);assert.equal(p.game.active.x,x);
  r.input(p,'right',1,1);assert.equal(p.game.active.x,x+1);
  r.input(p,'right',1,1);r.input(p,'right',300,1);assert.equal(p.game.active.x,x+1);
});
test('disconnect grace ends in elimination and selects the surviving winner',()=>{
  const r=room(2),p=r.players[1];p.connected=false;p.disconnectedAt=4000;
  r.tick(4000+RECONNECT_MS-1);assert.equal(p.game.alive,true);
  r.tick(4000+RECONNECT_MS+1);assert.equal(p.game.alive,false);assert.equal(p.place,2);assert.equal(r.winner,r.players[0].id);assert.equal(r.phase,'finished');
});
test('host transfers to a connected human and rematch requires a new ready-up',()=>{
  const r=room(3);r.players[0].connected=false;r.transferHost();assert.equal(r.host,r.players[1].id);
  r.eliminate(r.players[0]);r.eliminate(r.players[2]);r.finish();r.rematch();
  assert.equal(r.phase,'lobby');assert.ok(r.players.every(p=>!p.ready&&!p.game));
});
test('snapshots never expose seat credentials',()=>{
  const r=room(2),data=JSON.stringify(r.snapshot(r.players[0]));
  for(const p of r.players)assert.ok(!data.includes(p.token));
});
