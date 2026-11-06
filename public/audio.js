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
  async start(){
    if(!this.enabled)return this.setEnabled(true);
    await this.ctx.resume();
    if(this.enabled&&this.music.paused)await this.music.play();
    return this.enabled;
  }
  toggle(){return this.setEnabled(!this.enabled);}
  async setEnabled(enabled){
    this.enabled=enabled;this.generation++;clearTimeout(this.transitionTimer);
    const generation=this.generation;
    this.players.forEach(p=>p.pause());this.fading=false;
    if(this.enabled){
      try{
        this.ctx ||= new (window.AudioContext||window.webkitAudioContext)();
        if(!this.musicBus){this.musicBus=this.ctx.createGain();this.musicBus.connect(this.ctx.destination);}
        this.gains ||= this.players.map(p=>{const gain=this.ctx.createGain();this.ctx.createMediaElementSource(p).connect(gain).connect(this.musicBus);return gain;});
        this.gains.forEach((gain,i)=>{gain.gain.cancelScheduledValues(this.ctx.currentTime);gain.gain.setValueAtTime(i===this.track?1:0,this.ctx.currentTime);});
        this.music.preload='auto';
        await this.ctx.resume();if(generation!==this.generation)return this.enabled;
        await this.music.play();if(generation!==this.generation){if(!this.enabled)this.music.pause();return this.enabled;}
        this.players[1-this.track].preload='auto';
      }
      catch{this.enabled=false;this.music.pause();throw new Error('Audio could not start. Try Sound On again.');}
    }else this.music.pause();
    this.announce();return this.enabled;
  }
  tone(notes,length=.08,type='sine',volume=.055){
    if(!this.enabled||!this.ctx)return;
    const t=this.ctx.currentTime;
    notes.forEach((note,i)=>{
      const oscillator=this.ctx.createOscillator(),gain=this.ctx.createGain(),start=t+i*length;
      oscillator.type=type;oscillator.frequency.value=note;
      gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(volume,start+.008);gain.gain.exponentialRampToValueAtTime(.001,start+length*.95);
      oscillator.connect(gain).connect(this.ctx.destination);oscillator.start(start);oscillator.stop(start+length);
    });
  }
  clear(lines){
    if(!this.enabled||!this.ctx)return;
    if(this.musicBus){const gain=this.musicBus.gain,now=this.ctx.currentTime;const level=gain.value;gain.cancelScheduledValues(now);gain.setValueAtTime(level,now);gain.setTargetAtTime(.4,now,.015);gain.setTargetAtTime(1,now+.65,.1);}
    if(lines>=3){this.tone([660,784,988],.15,'square',.12);return;}
    [180,205,180,240].forEach((pitch,i)=>{
      const start=this.ctx.currentTime+i*.17,length=.14;
      const voice=this.ctx.createOscillator(),gain=this.ctx.createGain();voice.type='sawtooth';
      voice.frequency.setValueAtTime(pitch*.7,start);voice.frequency.exponentialRampToValueAtTime(pitch,start+.025);voice.frequency.exponentialRampToValueAtTime(pitch*.85,start+length);
      gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.23,start+.012);gain.gain.exponentialRampToValueAtTime(.001,start+length);
      // Rounded vowel formants give each burst a little robot "bo" voice.
      for(const frequency of [420,850,2400]){
        const formant=this.ctx.createBiquadFilter();formant.type='bandpass';formant.frequency.value=frequency;formant.Q.value=5;
        voice.connect(formant).connect(gain);
      }
      gain.connect(this.ctx.destination);voice.start(start);voice.stop(start+length);
    });
  }
  play(name,lines=1){
    if(name==='drop')this.tone([130,90],.045,'triangle');
    if(name==='rotate')this.tone([420],.035,'sine');
    if(name==='clear')this.clear(lines);
    if(name==='attack')this.tone([330,440],.045,'sine');
    if(name==='win')this.tone([523,659,784,1046,784,1046],.14,'triangle');
    if(name==='lose')this.tone([330,294,220,164],.18,'triangle');
  }
}
