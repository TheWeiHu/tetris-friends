import { randomBytes } from 'node:crypto';
import { createGame, act, advance, addGarbage, chooseBotMove } from '../public/engine.js';

export const MAX_PLAYERS = 6, RECONNECT_MS = 20000;
const BOT_NAMES = ['Boop Beep', 'Monarch', 'Guinea Beep', 'Scallop', 'Tiny Boop'];
export const id = (bytes=12) => randomBytes(bytes).toString('hex');
export class Room {
  constructor(name, avatar=0, now=Date.now()) {
    this.id=id(); this.players=[]; this.phase='lobby'; this.host=null;
    this.round=0; this.startedAt=0; this.createdAt=now; this.touchedAt=now;
    this.events=[]; this.eventId=0; this.winner=null; this.lastTick=now;
    this.addPlayer(name,avatar,now);
  }
  addPlayer(name,avatar=0,now=Date.now(),bot=false) {
    if (this.phase!=='lobby') throw new Error('This round has started. Join after the rematch.');
    if (this.players.length>=MAX_PLAYERS) throw new Error('This room is full. All six seats are taken.');
    const p={id:id(6),token:id(24),name,avatar,bot,ready:bot,connected:bot,
      disconnectedAt:now,joinedAt:now,game:null,pending:[],sent:0,received:[],ack:0,place:null,socket:null};
    this.players.push(p); this.host ||= p.id; this.touchedAt=now; return p;
  }
  addBot() {
    const name=BOT_NAMES.find(n=>!this.players.some(p=>p.name===n)) || 'Beep Bot';
    return this.addPlayer(name,BOT_NAMES.indexOf(name)+1,Date.now(),true);
  }
  emit(type,data={}) {
    this.events.push({id:++this.eventId,type,...data});
    this.events=this.events.slice(-20);
  }
  transferHost() {
    if(!this.players.some(p=>p.id===this.host&&p.connected)) this.host=this.players.find(p=>!p.bot&&p.connected)?.id || this.players.find(p=>!p.bot)?.id || null;
  }
  start(now=Date.now()) {
    if(this.phase!=='lobby')throw new Error('A round is already in progress.');
    if(this.players.length<2||!this.players.every(p=>p.ready&&p.connected))throw new Error('At least two players must be connected and ready.');
    this.round++; this.phase='countdown'; this.startedAt=now+3000; this.lastTick=now; this.winner=null;
    const seed=randomBytes(4).readUInt32LE();
    this.events=[];
    for(const p of this.players){p.game=createGame(seed);p.pending=[];p.sent=0;p.received=[];p.ack=0;p.place=null;p.botAt=this.startedAt+1000;}
    this.emit('start');
  }
  rematch() {
    if(this.phase!=='finished')throw new Error('Finish this round first.');
    this.phase='lobby';this.winner=null;
    for(const p of this.players){p.ready=p.bot;p.game=null;p.pending=[];p.place=null;p.ack=0;}
    this.touchedAt=Date.now();
  }
  eliminate(p,reason='topped-out') {
    if(!p.game||p.place!==null)return;
    p.game.alive=false;
    p.place=this.players.filter(x=>x.game?.alive).length+1;
    this.emit('out',{player:p.id,reason});
  }
  distribute(sender,count,now) {
    const recipients=this.players.filter(p=>p.id!==sender.id&&p.game?.alive);
    if(!recipients.length)return;
    for(const p of recipients)p.received=p.received.filter(t=>now-t<12000);
    const destinations={};
    // Spend each earned row exactly once. Balance the whole room's recent pressure.
    for(let i=0;i<count;i++){
      recipients.sort((a,b)=>a.received.length-b.received.length||a.pending.length-b.pending.length||a.id.localeCompare(b.id));
      const target=recipients[0];
      target.pending.push({hole:randomBytes(1)[0]%10,due:now+1800});
      target.received.push(now); destinations[target.id]=(destinations[target.id]||0)+1;
    }
    sender.sent+=count;
    this.emit('attack',{player:sender.id,targets:destinations,rows:count});
  }
  process(p,event,now) {
    if(event){
      let attack=event.attack;
      const canceled=Math.min(attack,p.pending.length);
      p.pending.splice(0,canceled);attack-=canceled;
      if(event.lines)this.emit('clear',{player:p.id,lines:event.lines,spin:event.spin,combo:event.combo,canceled});
      if(attack)this.distribute(p,attack,now);
      if(!event.lines){
        const incoming=[];
        while(incoming.length<4&&p.pending[0]?.due<=now)incoming.push(p.pending.shift().hole);
        if(incoming.length){addGarbage(p.game,incoming);this.emit('garbage',{player:p.id,rows:incoming.length});}
      }
    }
    if(!p.game.alive)this.eliminate(p);
  }
  input(p,action,seq,round,now=Date.now()) {
    if(this.phase!=='playing'||!p.game?.alive||round!==this.round)return;
    if(!Number.isSafeInteger(seq)||seq<=p.ack||seq>p.ack+200)return;
    if(!['left','right','down','cw','ccw','hold','drop'].includes(action))return;
    p.ack=seq;this.process(p,act(p.game,action),now);this.finish();
  }
  finish() {
    if(this.phase!=='playing')return;
    const alive=this.players.filter(p=>p.game?.alive);
    if(alive.length>1)return;
    this.phase='finished';this.winner=alive[0]?.id||null;
    if(alive[0])alive[0].place=1;
    this.emit('finish',{winner:this.winner});
  }
  tick(now=Date.now()) {
    const dt=Math.min(100,Math.max(0,now-this.lastTick));this.lastTick=now;
    if(this.players.some(p=>!p.bot&&p.connected))this.touchedAt=now;
    if(this.phase==='lobby'){
      this.players=this.players.filter(p=>p.bot||p.connected||now-p.disconnectedAt<RECONNECT_MS);
      this.transferHost();return;
    }
    if(this.phase==='countdown'&&now>=this.startedAt)this.phase='playing';
    if(this.phase!=='playing')return;
    const gravity=Math.max(100,850-Math.floor((now-this.startedAt)/30000)*85);
    for(const p of this.players){
      if(!p.game.alive)continue;
      if(!p.connected&&now-p.disconnectedAt>RECONNECT_MS){this.eliminate(p,'disconnected');continue;}
      if(p.bot&&now>=p.botAt){
        const move=chooseBotMove(p.game);
        for(let r=0;r<move.r;r++)act(p.game,'cw');
        for(let x=0;x<12&&p.game.active.x!==move.x;x++)act(p.game,p.game.active.x<move.x?'right':'left');
        this.process(p,act(p.game,'drop'),now);
        p.botAt=now+1100+p.avatar*170;
      }else this.process(p,advance(p.game,dt,gravity),now);
    }
    this.finish();
  }
  snapshot(me,now=Date.now()) {
    return {type:'state',id:this.id,me:me.id,host:this.host,phase:this.phase,round:this.round,
      now,startedAt:this.startedAt,winner:this.winner,events:this.events,
      players:this.players.map(p=>({id:p.id,name:p.name,avatar:p.avatar,bot:p.bot,ready:p.ready,
        connected:p.connected,disconnectedAt:p.disconnectedAt,sent:p.sent,place:p.place,ack:p.ack,
        pending:p.pending,game:p.game}))};
  }
}
