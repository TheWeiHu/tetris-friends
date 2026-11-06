import {test,expect} from '@playwright/test';
import path from 'node:path';
const shots=path.resolve('.context');

function track(page){
  let latest=null;const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('websocket',ws=>ws.on('framereceived',event=>{try{const data=JSON.parse(event.payload);if(data.type==='state')latest=data;}catch{}}));
  return {get state(){return latest;},get me(){return latest?.players.find(p=>p.id===latest.me);},errors};
}
async function create(page,name){await page.goto('/');await page.getByLabel('Your Nickname',{exact:true}).fill(name);await page.getByRole('button',{name:'Create A Room'}).click();await expect(page.locator('#lobby')).toBeVisible();return page.locator('#invite').inputValue();}
async function join(page,url,name){await page.goto(url);await page.getByLabel('Your Nickname',{exact:true}).fill(name);await page.getByRole('button',{name:'Join The Room'}).click();await expect(page.locator('#lobby')).toBeVisible();}
async function ready(page){await page.getByRole('button',{name:"I'm Ready",exact:true}).click();}

test('landing, instructions, sound and narrow layout',async({page})=>{
  const t=track(page);await page.goto('/');
  await expect(page.getByRole('heading',{name:'Little Blocks. Big Boops.'})).toBeVisible();
  await expect(page.locator('.avatar-option')).toHaveCount(6);
  await page.getByRole('button',{name:'Play As Monarch',exact:true}).click();
  await expect(page.getByRole('button',{name:'Play As Monarch',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.screenshot({path:path.join(shots,'arena-desktop.png'),fullPage:true});
  await page.getByRole('button',{name:'How To Play'}).click();await expect(page.getByRole('heading',{name:'Stack. Clear. Outlast.'})).toBeVisible();
  await page.getByRole('button',{name:"Let's Boop"}).click();
  await page.getByRole('button',{name:'Turn Music On',exact:true}).click();
  await expect(page.getByRole('button',{name:'Turn Music Off',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Turn Music Off',exact:true}).click();
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(shots,'arena-mobile.png'),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(t.errors).toEqual([]);
});

test('six seats, shared countdown, immediate controls and reconnect',async({browser})=>{
  const ca=await browser.newContext(),cb=await browser.newContext();const a=await ca.newPage(),b=await cb.newPage();const ta=track(a),tb=track(b);
  try{
    const url=await create(a,'Beep Captain');await join(b,url,'Tiny Rival');
    for(let i=0;i<4;i++)await a.getByRole('button',{name:'+ Add A Bot',exact:true}).click();
    await expect(a.locator('#seat-count')).toHaveText('6 / 6');await expect(b.locator('#seat-count')).toHaveText('6 / 6');
    await expect(a.locator('#add-bot')).toBeDisabled();await expect(a.locator('#start')).toBeDisabled();
    await ready(a);await ready(b);await a.getByRole('button',{name:'Start Round',exact:false}).click();
    await expect(a.locator('#countdown')).toBeVisible();await expect(b.locator('#countdown')).toBeVisible();
    await expect.poll(()=>ta.state?.phase).toBe('playing');await expect.poll(()=>tb.state?.phase).toBe('playing');
    expect(ta.me.game.active.type).toBe(tb.me.game.active.type);
    const x=ta.me.game.active.x;await a.keyboard.press('ArrowLeft');await expect.poll(()=>ta.me?.game.active.x).toBe(x-1);
    await a.keyboard.press('KeyC');await expect.poll(()=>ta.me?.game.hold).not.toBeNull();
    await a.keyboard.press('Space');await expect.poll(()=>ta.me?.game.pieces).toBe(1);
    const id=tb.me.id;await b.reload();await expect.poll(()=>tb.state?.phase).toBe('playing');await expect.poll(()=>tb.me?.id).toBe(id);await expect(b.locator('#connection')).toBeHidden();
    await a.setViewportSize({width:1280,height:800});
    expect(await a.locator('#board').evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight)).toBe(true);
    expect(await a.locator('#opponents').evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight)).toBe(true);
    await a.screenshot({path:path.join(shots,'arena-six-players.png'),fullPage:true});
    expect(ta.errors).toEqual([]);expect(tb.errors).toEqual([]);
  }finally{await ca.close();await cb.close();}
});

test('loss shows a rotten apple, winner gets the secret pig, rematch keeps the room',async({browser})=>{
  const ca=await browser.newContext(),cb=await browser.newContext();const a=await ca.newPage(),b=await cb.newPage();const ta=track(a),tb=track(b);
  try{
    const url=await create(a,'Monarch Beep');await join(b,url,'Bad Apple');await ready(a);await ready(b);await a.locator('#start').click();
    await expect.poll(()=>tb.state?.phase).toBe('playing');
    for(let i=0;i<18&&tb.me?.game.alive;i++){await b.keyboard.press('Space');await b.waitForTimeout(100);}
    await expect(a.getByRole('heading',{name:'Big Boop Energy.'})).toBeVisible();
    await expect(b.getByRole('heading',{name:'A Little Rotten Luck.'})).toBeVisible();
    await expect(a.locator('#secret-pig')).toHaveClass('reveal');await a.waitForTimeout(1900);
    await a.screenshot({path:path.join(shots,'arena-winner.png'),fullPage:true});await b.screenshot({path:path.join(shots,'arena-rotten-apple.png'),fullPage:true});
    await a.locator('#watch').click();await a.locator('#show-results').click();await expect(a.locator('#rematch')).toBeVisible();
    await a.locator('#rematch').click();await expect(a.locator('#lobby')).toBeVisible();await expect(b.locator('#lobby')).toBeVisible();
    expect(await a.locator('#invite').inputValue()).toBe(url);expect(ta.me.ready).toBe(false);expect(tb.me.ready).toBe(false);
    await ready(a);await ready(b);await a.locator('#start').click();await expect.poll(()=>ta.state?.round).toBe(2);
    expect(ta.errors).toEqual([]);expect(tb.errors).toEqual([]);
  }finally{await ca.close();await cb.close();}
});

test('practice launches a real match with five bots',async({page})=>{
  const t=track(page);await page.goto('/');
  await page.getByRole('button',{name:'Turn Music On',exact:true}).click();
  await expect(page.locator('#sound')).toHaveAttribute('title','Now Playing: Korobeiniki');
  await page.getByRole('button',{name:'Just Me? Play With Bots'}).click();
  await expect.poll(()=>t.state?.phase).toBe('playing');expect(t.state.players.filter(p=>p.bot)).toHaveLength(5);
  await expect(page.locator('#sound')).toHaveAttribute('title','Now Playing: Korobeiniki');
  const duration=await page.evaluate(async()=>{
    const context=new AudioContext();try{const data=await(await fetch('/assets/puzzle-sprint.m4a')).arrayBuffer();return (await context.decodeAudioData(data)).duration;}finally{await context.close();}
  });expect(duration).toBeGreaterThan(200);
  await expect.poll(()=>t.state.players.filter(p=>p.bot).some(p=>p.game.pieces>0)).toBe(true);
  await page.locator('#leave-match').click();await expect(page.locator('#welcome')).toBeVisible();
  await expect(page.locator('#sound')).toHaveAttribute('title','Now Playing: Korobeiniki');expect(t.errors).toEqual([]);
});


test('long music survives round changes and overlaps tracks without a hard restart',async({page})=>{
  await page.goto('/');
  await page.evaluate(async()=>{const {ArenaAudio}=await import('/audio.js');window.soundCheck=new ArenaAudio();});
  await page.locator('body').evaluate(body=>{const button=document.createElement('button');button.id='audio-test';button.textContent='Start Audio Check';button.onclick=()=>window.soundCheck.toggle();body.append(button);});
  await page.locator('#audio-test').click();
  await expect.poll(()=>page.evaluate(()=>soundCheck.music.currentTime)).toBeGreaterThan(.1);
  const preserved=await page.evaluate(()=>{const a=soundCheck,before=a.music.currentTime;a.setMode('battle');a.setMode('room');return {track:a.track,before,after:a.music.currentTime};});
  expect(preserved.track).toBe(1);expect(preserved.after).toBeGreaterThanOrEqual(preserved.before);
  await expect.poll(()=>page.evaluate(()=>soundCheck.players[0].readyState)).toBeGreaterThanOrEqual(2);
  const durations=await page.evaluate(()=>soundCheck.players.map(p=>p.duration));expect(durations[0]).toBeGreaterThan(208);expect(durations[1]).toBeGreaterThan(208);
  const nearEnd=()=>page.evaluate(()=>new Promise(resolve=>{const music=soundCheck.music;if(music.seekable.length&&music.seekable.end(0)>music.duration-5){music.currentTime=music.duration-5;resolve();return;}music.playbackRate=16;const timer=setInterval(()=>{if(music.duration-music.currentTime<5){music.playbackRate=1;clearInterval(timer);resolve();}},25);}));
  await nearEnd();
  await expect.poll(()=>page.evaluate(()=>soundCheck.track)).toBe(0);
  expect(await page.evaluate(()=>soundCheck.players.every(p=>!p.paused))).toBe(true);
  await page.locator('#audio-test').click();
  expect(await page.evaluate(()=>soundCheck.players.every(p=>p.paused))).toBe(true);
  await page.locator('#audio-test').click();
  await expect.poll(()=>page.evaluate(()=>soundCheck.music.currentTime)).toBeGreaterThan(.1);
  expect(await page.evaluate(()=>soundCheck.players[1].paused)).toBe(true);
  await nearEnd();
  await expect.poll(()=>page.evaluate(()=>soundCheck.track)).toBe(1);
  await expect.poll(()=>page.evaluate(()=>soundCheck.players[0].paused)).toBe(true);
  expect(await page.evaluate(()=>soundCheck.music.paused)).toBe(false);
});
