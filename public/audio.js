export class ArenaAudio {
  constructor(){
    this.enabled=false;this.ctx=null;this.track=1;this.mode='room';this.generation=0;this.fading=false;
    this.tracks=Array(2).fill('/assets/puzzle-sprint.m4a?v=2');
    this.players=this.tracks.map((src,index)=>{
      const music=new Audio(src);music.preload='none';music.volume=.24;
      music.addEventListener('timeupdate',()=>{
        if(this.enabled&&this.track===index&&Number.isFinite(music.duration)&&music.duration-music.currentTime<=2.5)this.select(1-index);
      });
      music.addEventListener('ended',()=>{if(this.enabled&&this.track===index)this.select(1-index);});
      music.addEventListener('error',()=>{if(this.track===index){this.enabled=false;this.players.forEach(p=>p.pause());this.announce();}});
      return music;
    });
  }
  get music(){return this.players[this.track];}
  announce(){window.dispatchEvent(new CustomEvent('arena-audio',{detail:{enabled:this.enabled,title:'Korobeiniki'}}));}
  async select(track){
    if(this.track===track||this.fading||!this.enabled)return;
    const previous=this.track,generation=this.generation,next=this.players[track];this.fading=true;
    next.currentTime=0;
    try{
      await next.play();
      if(generation!==this.generation){next.pause();this.fading=false;return;}
      const now=this.ctx.currentTime,fade=Math.min(2.5,Math.max(0,this.music.duration-this.music.currentTime));
      this.gains[previous].gain.setValueAtTime(1,now);this.gains[previous].gain.linearRampToValueAtTime(0,now+fade);
      this.gains[track].gain.setValueAtTime(0,now);this.gains[track].gain.linearRampToValueAtTime(1,now+fade);
      this.track=track;this.announce();
      this.transitionTimer=setTimeout(()=>{this.players[previous].pause();this.fading=false;},fade*1000+50);
    }catch{this.fading=false;if(this.music.ended){this.enabled=false;this.announce();}}
  }
  setMode(mode){this.mode=mode;}
  async toggle(){
    this.enabled=!this.enabled;this.generation++;clearTimeout(this.transitionTimer);
    const generation=this.generation;
    this.players.forEach(p=>p.pause());this.fading=false;
    if(this.enabled){
      try{
        this.ctx ||= new (window.AudioContext||window.webkitAudioContext)();
        this.gains ||= this.players.map(p=>{const gain=this.ctx.createGain();this.ctx.createMediaElementSource(p).connect(gain).connect(this.ctx.destination);return gain;});
        this.gains.forEach((gain,i)=>{gain.gain.cancelScheduledValues(this.ctx.currentTime);gain.gain.setValueAtTime(i===this.track?1:0,this.ctx.currentTime);});
        await this.ctx.resume();if(generation!==this.generation)return this.enabled;
        await this.music.play();if(generation!==this.generation){if(!this.enabled)this.music.pause();return this.enabled;}
        this.players[1-this.track].preload='auto';
      }
      catch{this.enabled=false;this.music.pause();throw new Error('Audio could not start. Try Sound On again.');}
    }else this.music.pause();
    this.announce();return this.enabled;
  }
  tone(notes,length=.08,type='sine'){
    if(!this.enabled||!this.ctx)return;
    const t=this.ctx.currentTime;
    notes.forEach((note,i)=>{
      const oscillator=this.ctx.createOscillator(),gain=this.ctx.createGain(),start=t+i*length;
      oscillator.type=type;oscillator.frequency.value=note;
      gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.055,start+.008);gain.gain.exponentialRampToValueAtTime(.001,start+length*.95);
      oscillator.connect(gain).connect(this.ctx.destination);oscillator.start(start);oscillator.stop(start+length);
    });
  }
  play(name){
    if(name==='drop')this.tone([130,90],.045,'triangle');
    if(name==='rotate')this.tone([420],.035,'sine');
    if(name==='clear')this.tone([523,659,784],.07,'triangle');
    if(name==='attack')this.tone([330,440],.045,'sine');
    if(name==='win')this.tone([523,659,784,1046,784,1046],.14,'triangle');
    if(name==='lose')this.tone([330,294,220,164],.18,'triangle');
  }
}
