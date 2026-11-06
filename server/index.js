import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { Room, RECONNECT_MS } from './room.js';

const ROOT=path.resolve(fileURLToPath(new URL('../public/',import.meta.url)));
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.m4a':'audio/mp4','.png':'image/png','.ico':'image/x-icon'};
export function createArena({origin=process.env.PUBLIC_ORIGIN,maxRooms=100,trustProxy=process.env.TRUST_PROXY==='1'}={}) {
  const rooms=new Map(),rates=new Map();
  function allowed(req){return !req.headers.origin||req.headers.origin===(origin||`http://${req.headers.host}`);}
  function rate(req,kind,limit){
    const remote=req.socket.remoteAddress;
    const ip=trustProxy&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote)?req.headers['x-real-ip']||remote:remote;
    const key=`${ip}:${kind}`,now=Date.now();
    let r=rates.get(key);if(!r||now-r.start>60000){r={start:now,n:0};rates.set(key,r);}
    return ++r.n<=limit;
  }
  function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
  async function body(req){
    if(!req.headers['content-type']?.startsWith('application/json'))throw new Error('Send JSON.');
    let text='';for await(const chunk of req){text+=chunk;if(text.length>2048)throw new Error('Request is too large.');}
    try{return JSON.parse(text);}catch{throw new Error('Invalid request.');}
  }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; media-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.setHeader('X-Robots-Tag','noindex');
    try{
      const url=new URL(req.url,'http://localhost');
      if(url.pathname==='/health'&&req.method==='GET')return json(res,200,{ok:true});
      if(url.pathname.startsWith('/api/')){
        if(req.method!=='POST')return json(res,405,{error:'Use POST.'});
        if(!allowed(req))return json(res,403,{error:'Origin not allowed.'});
        const create=url.pathname==='/api/rooms';
        const match=url.pathname.match(/^\/api\/rooms\/([a-f0-9]{24})\/join$/);
        if(!create&&!match)return json(res,404,{error:'Room not found.'});
        if(!rate(req,create?'create':'join',create?15:90))return json(res,429,{error:'Too many attempts. Try again in a minute.'});
        const data=await body(req);
        const name=typeof data?.name==='string'?data.name.trim().replace(/[\x00-\x1f\x7f]/g,'').slice(0,16):'';
        if(!name)return json(res,400,{error:'Give your Beepboop a nickname.'});
        const avatar=Number.isInteger(data.avatar)&&data.avatar>=0&&data.avatar<6?data.avatar:0;
        let room,p;
        if(create){
          if(rooms.size>=maxRooms)return json(res,503,{error:'The arena is busy. Try again shortly.'});
          room=new Room(name,avatar);rooms.set(room.id,room);p=room.players[0];
        }else{
          room=rooms.get(match[1]);if(!room)return json(res,404,{error:'This room has expired. Create a fresh one.'});
          p=room.addPlayer(name,avatar);
        }
        return json(res,200,{room:room.id,token:p.token,player:p.id});
      }
      if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'Method not allowed.'});
      const pathname=decodeURIComponent(url.pathname),file=path.resolve(ROOT,`.${pathname==='/'?'/index.html':pathname}`);
      if(!file.startsWith(ROOT+path.sep)||!MIME[path.extname(file)])return json(res,404,{error:'Not found.'});
      const info=await stat(file);if(!info.isFile())return json(res,404,{error:'Not found.'});
      res.writeHead(200,{'Content-Type':MIME[path.extname(file)],'Content-Length':info.size,'Cache-Control':file.includes('/assets/')?'public, max-age=86400':'no-cache'});
      res.end(req.method==='HEAD'?undefined:await readFile(file));
    }catch(error){if(!res.headersSent)json(res,error.code==='ENOENT'?404:400,{error:error.code==='ENOENT'?'Not found.':error.message});else res.end();}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  const wss=new WebSocketServer({noServer:true,maxPayload:2048,perMessageDeflate:{
    // Full six-player snapshots repeat board data; compress each independently.
    threshold:1024,serverNoContextTakeover:true,clientNoContextTakeover:true,
    zlibDeflateOptions:{level:1,memLevel:7},concurrencyLimit:4
  }});
  server.on('upgrade',(req,socket,head)=>{
    if(req.url!=='/socket'||!allowed(req)||!rate(req,'connect',90)){socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');socket.destroy();return;}
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));
  });
  wss.on('connection',ws=>{
    let room,player,windowAt=Date.now(),messages=0;
    ws.alive=true;ws.on('pong',()=>{ws.alive=true;});
    const authTimer=setTimeout(()=>ws.close(4001,'Sign in to a room first.'),5000);
    const send=data=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(data));};
    ws.on('error',()=>{});
    ws.on('message',raw=>{
      const now=Date.now();if(now-windowAt>1000){windowAt=now;messages=0;}if(++messages>90){ws.close(4008,'Too many messages.');return;}
      try{
        const data=JSON.parse(raw);
        if(!player){
          if(data.type!=='auth')throw new Error('Join a room first.');
          room=rooms.get(data.room);player=room?.players.find(p=>!p.bot&&p.token===data.token);
          if(!player){send({type:'expired',error:'Your seat has expired. Join the room again.'});ws.close(4001);return;}
          clearTimeout(authTimer);
          const old=player.socket;player.socket=ws;old?.close(4002,'Seat opened in another connection.');
          player.connected=true;room.transferHost();send(room.snapshot(player));return;
        }
        if(player.socket!==ws)return;
        if(data.type==='input'){room.input(player,data.action,data.seq,data.round);return;}
        if(data.type==='ready'&&room.phase==='lobby')player.ready=!!data.ready;
        else if(data.type==='start'&&room.host===player.id)room.start();
        else if(data.type==='add-bot'&&room.host===player.id)room.addBot();
        else if(data.type==='remove-bot'&&room.host===player.id&&room.phase==='lobby')room.players=room.players.filter(p=>!p.bot||p.id!==data.player);
        else if(data.type==='rematch'&&room.host===player.id)room.rematch();
        else if(data.type==='leave'){
          if(room.phase==='playing'||room.phase==='countdown'){room.eliminate(player,'left');room.finish();}
          else room.players=room.players.filter(p=>p!==player);
          player.connected=false;player.ready=false;player.disconnectedAt=now-RECONNECT_MS;room.transferHost();ws.close(1000);return;
        }
        send(room.snapshot(player));
      }catch(error){send({type:'error',error:error.message});}
    });
    ws.on('close',()=>{clearTimeout(authTimer);if(player?.socket===ws){player.connected=false;player.ready=false;player.socket=null;player.disconnectedAt=Date.now();room.transferHost();}});
  });
  let count=0;
  const ticker=setInterval(()=>{
    const now=Date.now();
    for(const [key,room]of rooms){
      room.tick(now);
      if(now-room.touchedAt>10*60*1000||!room.players.some(p=>!p.bot)){for(const p of room.players)p.socket?.close(4001,'Room expired');rooms.delete(key);continue;}
      if(count%2===0)for(const p of room.players)if(p.socket?.readyState===WebSocket.OPEN){
        if(p.socket.bufferedAmount>1024*1024)p.socket.terminate();else p.socket.send(JSON.stringify(room.snapshot(p,now)));
      }
    }
    count++;
  },50);
  const heartbeat=setInterval(()=>{
    for(const ws of wss.clients){if(!ws.alive)ws.terminate();else{ws.alive=false;ws.ping();}}
    for(const [key,r]of rates)if(Date.now()-r.start>60000)rates.delete(key);
  },15000);
  const close=async()=>{clearInterval(ticker);clearInterval(heartbeat);for(const ws of wss.clients)ws.terminate();await new Promise(resolve=>wss.close(resolve));await new Promise(resolve=>server.close(resolve));};
  return {server,rooms,close};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const app=createArena(),port=Number(process.env.PORT||55030),host=process.env.HOST||'127.0.0.1';
  app.server.listen(port,host,()=>console.log(`Beepboop Arena · http://${host}:${port}`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.close().then(()=>process.exit(0)));
}
