export class ArenaAudio {
  constructor(){
    this.enabled=false;this.ctx=null;this.track=0;this.mode='room';
    this.tracks=['/assets/bounce-protocol.m4a','/assets/puzzle-sprint.m4a'];
    this.music=new Audio(this.tracks[0]);this.music.preload='none';this.music.volume=.24;
    this.music.addEventListener('ended',()=>this.select((this.track+1)%2));
    this.music.addEventListener('error',()=>{this.enabled=false;this.announce();});
  }
  announce(){window.dispatchEvent(new CustomEvent('arena-audio',{detail:{enabled:this.enabled,title:this.track?'Puzzle Sprint':'Beepboop Bounce'}}));}
  select(track){
    if(this.track===track)return;
    this.track=track;this.music.src=this.tracks[track];
    if(this.enabled)this.music.play().catch(()=>{this.enabled=false;this.announce();});
    this.announce();
  }
  setMode(mode){if(mode===this.mode)return;this.mode=mode;this.select(mode==='battle'?1:0);}
  async toggle(){
    this.enabled=!this.enabled;
    if(this.enabled){
      try{this.ctx ||= new (window.AudioContext||window.webkitAudioContext)();await this.ctx.resume();await this.music.play();}
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
