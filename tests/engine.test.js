import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,cells,ghost,rotate,advance,addGarbage,lockPiece,chooseBotMove} from '../public/engine.js';

test('every seven-piece bag contains all seven shapes; a shared seed reproduces the sequence',()=>{
  const a=createGame(482),b=createGame(482),types=[];
  for(let i=0;i<28;i++){
    assert.equal(a.active.type,b.active.type);types.push(a.active.type);
    a.board=a.board.map(row=>row.map(()=>0));b.board=b.board.map(row=>row.map(()=>0));act(a,'drop');act(b,'drop');
  }
  for(let i=0;i<28;i+=7)assert.equal(new Set(types.slice(i,i+7)).size,7);
});
test('hold is limited to once per piece and resets only after locking',()=>{
  const s=createGame(12),first=s.active.type,second=s.queue[0];
  act(s,'hold');assert.equal(s.hold,first);assert.equal(s.active.type,second);
  act(s,'hold');assert.equal(s.active.type,second);
  act(s,'drop');act(s,'hold');assert.equal(s.active.type,first);
});
test('hard drop lands on the ghost and clears four rows without duplicating blocks',()=>{
  const s=createGame(3);
  for(let y=18;y<22;y++)s.board[y]=Array.from({length:10},(_,x)=>x===5?0:'J');
  s.active={type:'I',x:3,y:0,r:1};
  assert.equal(ghost(s).y,18);
  const e=act(s,'drop');assert.equal(e.lines,4);assert.equal(e.attack,8);assert.equal(s.lines,4);assert.equal(s.board.flat().filter(Boolean).length,0);
});
test('wall kicks rotate a T away from the left boundary',()=>{
  const s=createGame(1);s.active={type:'T',x:-1,y:6,r:1};
  assert.equal(rotate(s,1),true);assert.equal(s.active.x,0);
  assert.ok(cells(s.active).every(([x])=>x>=0));
});
test('I wall kicks handle the distinct four-wide rotation origin',()=>{
  const s=createGame(1);s.active={type:'I',x:-2,y:6,r:1};
  assert.equal(rotate(s,1),true);assert.equal(s.active.x,0);
});
test('lock delay allows grounded movement and cannot be reset forever',()=>{
  const s=createGame(1);s.active={type:'O',x:3,y:20,r:0};
  assert.equal(advance(s,400),null);act(s,'left');assert.equal(s.lock,0);
  s.resets=15;advance(s,400);act(s,'right');assert.equal(s.lock,400);
  assert.ok(advance(s,100));assert.equal(s.pieces,1);
});
test('garbage keeps a single hole per row and overflow eliminates the player',()=>{
  const s=createGame(1);s.active.y=0;addGarbage(s,[2,7]);
  assert.deepEqual(s.board[20],['G','G',0,'G','G','G','G','G','G','G']);assert.equal(s.board[21][7],0);
  s.board[0][0]='I';addGarbage(s,[4]);assert.equal(s.alive,false);
});
test('spawn collision tops out, rather than overwriting a previous piece',()=>{
  const s=createGame(2);s.board[0].fill('G');s.board[1].fill('G');act(s,'hold');assert.equal(s.alive,false);
});
test('T-spin detection requires a rotation and three occupied corners',()=>{
  const s=createGame(1);s.active={type:'T',x:3,y:19,r:0};s.rotated=true;
  s.board[19][3]='G';s.board[19][5]='G';s.board[21][3]='G';
  assert.equal(lockPiece(s).spin,true);
});
test('practice bots use legal moves and can play a sustained game',()=>{
  const s=createGame(734);
  for(let n=0;n<120&&s.alive;n++){
    const p=chooseBotMove(s);for(let i=0;i<p.r;i++)act(s,'cw');
    for(let i=0;i<12&&s.active.x!==p.x;i++)act(s,s.active.x<p.x?'right':'left');act(s,'drop');
  }
  assert.ok(s.lines>=10,`Bot cleared ${s.lines} lines`);assert.ok(s.pieces>=50);
});
