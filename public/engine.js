export const WIDTH = 10, HEIGHT = 22, HIDDEN = 2;
export const TYPES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
export const COLORS = { I: '#53def1', J: '#6684ff', L: '#b6adff', O: '#eef2ff', S: '#71e4c5', T: '#bb7ff5', Z: '#f593d5', G: '#63768d' };
const SHAPES = {
  I: [[0,1],[1,1],[2,1],[3,1]], J: [[0,0],[0,1],[1,1],[2,1]],
  L: [[2,0],[0,1],[1,1],[2,1]], O: [[1,0],[2,0],[1,1],[2,1]],
  S: [[1,0],[2,0],[0,1],[1,1]], T: [[1,0],[0,1],[1,1],[2,1]],
  Z: [[0,0],[1,0],[1,1],[2,1]],
};
// Rotation offsets use downward-positive board coordinates.
const KICKS = {
  '0>1': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '1>0': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  '1>2': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  '2>1': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '2>3': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '3>2': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '3>0': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '0>3': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
};
const I_KICKS = {
  '0>1': [[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
  '1>0': [[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
  '1>2': [[0,0],[-1,0],[2,0],[-1,-2],[2,1]],
  '2>1': [[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
  '2>3': [[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
  '3>2': [[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
  '3>0': [[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
  '0>3': [[0,0],[-1,0],[2,0],[-1,-2],[2,1]],
};
export function random(state) {
  let x = state.rng;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  state.rng = x >>> 0;
  return state.rng / 4294967296;
}
function fillQueue(s) {
  while (s.queue.length < 7) {
    const bag = [...TYPES];
    for (let i = 6; i > 0; i--) { const j = Math.floor(random(s) * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
    s.queue.push(...bag);
  }
}
export function cells(p) {
  let points = SHAPES[p.type].map(([x,y]) => [x,y]);
  if (p.type !== 'O') for (let i = 0; i < p.r; i++) points = points.map(([x,y]) => [(p.type === 'I' ? 3 : 2) - y, x]);
  return points.map(([x,y]) => [x+p.x, y+p.y]);
}
export function collides(s, p) {
  return cells(p).some(([x,y]) => x < 0 || x >= WIDTH || y >= HEIGHT || (y >= 0 && s.board[y][x]));
}
export function spawn(s, type) {
  fillQueue(s);
  s.active = { type: type || s.queue.shift(), x: 3, y: 1, r: 0 };
  fillQueue(s);
  s.fall = 0; s.lock = 0; s.resets = 0; s.rotated = false;
  if (collides(s, s.active)) s.alive = false;
}
export function createGame(seed = 1) {
  const s = { board: Array.from({length: HEIGHT}, () => Array(WIDTH).fill(0)), rng: seed >>> 0 || 1,
    queue: [], active: null, hold: null, held: false, alive: true, lines: 0, pieces: 0, score: 0,
    combo: -1, backToBack: false, fall: 0, lock: 0, resets: 0, rotated: false };
  spawn(s); return s;
}
export function ghost(s) {
  const p = {...s.active};
  while (!collides(s, {...p, y: p.y + 1})) p.y++;
  return p;
}
function resetLock(s) { if (s.resets < 15) { s.lock = 0; s.resets++; } }
export function move(s, dx, dy) {
  const next = {...s.active, x: s.active.x + dx, y: s.active.y + dy};
  if (collides(s, next)) return false;
  const grounded = collides(s, {...s.active, y: s.active.y+1});
  s.active = next;
  if (dx) s.rotated = false;
  if (grounded) resetLock(s);
  return true;
}
export function rotate(s, direction) {
  const from = s.active.r, to = (from + direction + 4) % 4;
  const offsets = s.active.type === 'O' ? [[0,0]] : (s.active.type === 'I' ? I_KICKS : KICKS)[`${from}>${to}`];
  for (const [x,y] of offsets) {
    const p = {...s.active, r: to, x: s.active.x+x, y: s.active.y+y};
    if (!collides(s,p)) { resetLock(s); s.active = p; s.rotated = true; return true; }
  }
  return false;
}
export function lockPiece(s) {
  const occupied = cells(s.active);
  const corner = (x,y) => x < 0 || x >= WIDTH || y >= HEIGHT || (y >= 0 && !!s.board[y][x]);
  const spin = s.active.type === 'T' && s.rotated && [[0,0],[2,0],[0,2],[2,2]].filter(([x,y]) => corner(s.active.x+x,s.active.y+y)).length >= 3;
  for (const [x,y] of occupied) { if (y >= 0) s.board[y][x] = s.active.type; }
  const cleared = [];
  s.board.forEach((row,y) => { if (row.every(Boolean)) cleared.push(y); });
  s.board = s.board.filter((_,y) => !cleared.includes(y));
  while (s.board.length < HEIGHT) s.board.unshift(Array(WIDTH).fill(0));
  const lines = cleared.length;
  s.combo = lines ? s.combo+1 : -1;
  const difficult = lines > 0 && (spin || lines === 4);
  let attack = spin ? [0,2,4,6][lines] : [0,0,1,2,4][lines];
  if (difficult && s.backToBack) attack++;
  if (lines) { attack += Math.min(3, Math.floor(s.combo/2)); s.backToBack = difficult; }
  if (lines && s.board.every(row => row.every(v => !v))) attack += 4;
  s.lines += lines; s.pieces++; s.score += [0,100,300,500,800][lines] * (spin ? 2 : 1);
  s.held = false;
  if (occupied.every(([,y]) => y < HIDDEN) && !lines) s.alive = false;
  spawn(s);
  return {lines, attack: attack || 0, spin, cleared, combo: s.combo, piece: s.pieces};
}
export function act(s, action) {
  if (!s.alive) return null;
  if (action === 'left') move(s,-1,0);
  if (action === 'right') move(s,1,0);
  if (action === 'down' && move(s,0,1)) s.score++;
  if (action === 'cw') rotate(s,1);
  if (action === 'ccw') rotate(s,-1);
  if (action === 'hold' && !s.held) {
    const type = s.active.type, old = s.hold;
    s.hold = type; spawn(s,old); s.held = true;
  }
  if (action === 'drop') {
    const p = ghost(s); s.score += (p.y-s.active.y)*2; s.active = p;
    return lockPiece(s);
  }
  return null;
}
export function advance(s, dt, gravity = 850) {
  if (!s.alive) return null;
  s.fall += dt;
  while (s.fall >= gravity) { s.fall -= gravity; if (!move(s,0,1)) break; }
  if (collides(s,{...s.active,y:s.active.y+1})) { s.lock += dt; if (s.lock >= 500) return lockPiece(s); }
  else s.lock = 0;
  return null;
}
export function addGarbage(s, holes) {
  for (const hole of holes) {
    if (s.board.shift().some(Boolean)) s.alive = false;
    s.board.push(Array.from({length:WIDTH},(_,x) => x === hole ? 0 : 'G'));
  }
  if (collides(s,s.active)) s.alive = false;
}
export function chooseBotMove(s) {
  const choices = [];
  for (let r=0;r<4;r++) for (let x=-2;x<10;x++) {
    const p = {...s.active,r,x};
    if (collides(s,p)) continue;
    while (!collides(s,{...p,y:p.y+1})) p.y++;
    const board = s.board.map(row=>[...row]);
    for(const [px,py] of cells(p)) if(py>=0) board[py][px]=p.type;
    const lines=board.filter(row=>row.every(Boolean)).length;
    const remaining=board.filter(row=>!row.every(Boolean));
    while(remaining.length<HEIGHT) remaining.unshift(Array(WIDTH).fill(0));
    let holes=0;
    const heights=Array.from({length:WIDTH},(_,col)=>{
      let first=remaining.findIndex(row=>row[col]); if(first<0)first=HEIGHT;
      for(let y=first+1;y<HEIGHT;y++)if(!remaining[y][col])holes++;
      return HEIGHT-first;
    });
    const bump=heights.slice(1).reduce((n,h,i)=>n+Math.abs(h-heights[i]),0);
    choices.push({r,x,score:lines*8-heights.reduce((a,b)=>a+b,0)*.5-holes*7-bump*.4-Math.max(...heights)*.6});
  }
  choices.sort((a,b)=>b.score-a.score);
  return choices[0] || {r:0,x:3};
}
