#!/usr/bin/env python3
"""Render a new chiptune arrangement of traditional Korobeiniki. Requires numpy and ffmpeg."""
import argparse
import json
import math
from pathlib import Path
import subprocess
import tempfile
import wave

import numpy as np

BPM = 148
RATE = 44100
BEAT = 60 / BPM
def frequency(note):
    names={'C':0,'C#':1,'D':2,'D#':3,'E':4,'F':5,'F#':6,'G':7,'G#':8,'A':9,'A#':10,'B':11}
    midi=12*(int(note[-1])+1)+names[note[:-1]]
    return 440*2**((midi-69)/12)

# Traditional melody, with new accompaniment and variations (not a game recording).
# https://imslp.org/wiki/Korobeiniki_(Folk_Songs,_Russian)
FOLK = [
    [('E5',1),('B4',.5),('C5',.5),('D5',1),('C5',.5),('B4',.5)],
    [('A4',1),('A4',.5),('C5',.5),('E5',1),('D5',.5),('C5',.5)],
    [('B4',1.5),('C5',.5),('D5',1),('E5',1)],
    [('C5',1),('A4',1),('A4',2)],
    [('D5',1.5),('F5',.5),('A5',1),('G5',.5),('F5',.5)],
    [('E5',1.5),('C5',.5),('E5',1),('D5',.5),('C5',.5)],
    [('B4',1),('B4',.5),('C5',.5),('D5',1),('E5',1)],
    [('C5',1),('A4',1),('A4',2)],
    [('E5',2),('C5',2)], [('D5',2),('B4',2)],
    [('C5',2),('A4',2)], [('G#4',2),('B4',2)],
    [('E5',2),('C5',2)], [('D5',2),('B4',2)],
    [('C5',1),('E5',1),('A5',2)], [('G#5',2),('E5',2)],
]
HARMONY = {
    'A':('A2',['A3','C4','E4']), 'E':('E2',['E3','G#3','B3']),
    'D':('D2',['D3','F3','A3']), 'C':('C3',['C4','E4','G4']),
    'G':('G2',['G3','B3','D4']),
}
FOLK_CHORDS = [HARMONY[c] for c in 'EAEADEEACGAECGAE']


def render(output):
    bars=128;duration=bars*4*BEAT+1.8
    mix=np.zeros((round(duration*RATE),2),dtype=np.float32)
    rng=np.random.default_rng(47)
    def add(at,length,note,volume=.1,voice='pulse',pan=0):
        count=round(length*RATE);t=np.arange(count)/RATE;f=frequency(note)
        phase=2*np.pi*f*t + .015*np.sin(2*np.pi*5*t)*np.minimum(t*4,1)
        if voice=='pulse':
            signal=sum(np.sin(k*phase)*math.sin(k*math.pi*.25)/k for k in range(1,min(12,int(RATE/2/f))))
        elif voice=='bell':
            signal=np.sin(phase)+.22*np.sin(phase*2)*np.exp(-t*13)
        else:
            signal=np.sin(phase)+.22*np.sin(phase*3)/3
        env=np.minimum(1,t/.006)*np.minimum(1,np.maximum(0,(length-t)/.035))*np.exp(-t*(4 if voice=='bell' else .8))
        start=round(at*RATE);n=min(count,len(mix)-start)
        if n<=0:return
        gains=np.array([math.sqrt((1-pan)/2),math.sqrt((1+pan)/2)])
        sound=signal[:n,None]*env[:n,None]*volume*gains
        mix[start:start+n]+=sound
        # Quiet dotted-eighth echo glues phrases together without masking the melody.
        if voice in ('pulse','bell') and volume>.07:
            echo=start+round(.75*BEAT*RATE);n=min(len(sound),len(mix)-echo)
            if n>0:mix[echo:echo+n]+=sound[:n,::-1]*.12
    sections=['Folk Theme','Clockwork Variation','Dancing Bass','High Score',
              'Bell Breakdown','Countermelody','Folk Reprise','Finale']
    for bar in range(bars):
        section,phrase=divmod(bar,16);start=bar*4*BEAT
        notes=FOLK[phrase]
        root,chord=FOLK_CHORDS[phrase]
        quiet=section==4;voice='bell' if quiet else 'pulse'
        cursor=0
        for i,(note,beats) in enumerate(notes):
            if section in (3,7):note=note[:-1]+str(int(note[-1])+1)
            # Short ornaments and octave answers vary each return of the theme.
            if section in (1,6) and beats>=1.5:
                add(start+cursor*BEAT,(beats-.3)*BEAT,note,.13,voice,-.12)
                add(start+(cursor+beats-.25)*BEAT,.2*BEAT,note,.08,'bell',.28)
            else:add(start+cursor*BEAT,beats*.88*BEAT,note,.14,voice,-.12)
            cursor+=beats
        for beat in range(4):
            add(start+beat*BEAT,.72*BEAT,root if beat%2==0 else chord[2][:-1]+'2',.17 if not quiet else .10,'bass')
            if not quiet or beat%2:
                for note in chord:add(start+(beat+.5)*BEAT,.28*BEAT,note,.032, 'pulse',.18)
            if section in (1,3,5,6,7):
                for eighth in (0,.5):
                    note=chord[(beat*2+int(eighth*2)+section)%3]
                    add(start+(beat+eighth)*BEAT,.32*BEAT,note[:-1]+str(int(note[-1])+1),.035,'bell',.4)
            at=round((start+beat*BEAT)*RATE);t=np.arange(round(.10*RATE))/RATE
            kick=np.sin(2*np.pi*(55*t+5*(1-np.exp(-t*30))))*np.exp(-t*35)*(.08 if not quiet else .025)
            mix[at:at+len(kick)]+=kick[:,None]
            at=round((start+(beat+.5)*BEAT)*RATE);n=round(.045*RATE)
            hiss=rng.normal(0,1,n)*np.exp(-np.arange(n)/RATE*80)*(.012 if not quiet else .004)
            mix[at:at+n]+=hiss[:,None]
        if phrase in (3,7,11) and section in (2,3,5,7):
            for i,note in enumerate(['E6','A5','E6','C6']):add(start+(2+i*.5)*BEAT,.32*BEAT,note,.075,'bell',.35)
    # Resolve the long arrangement instead of cutting a short loop mid-phrase.
    ending=bars*4*BEAT
    for note in ['A3','C4','E4','A5']:add(ending,1.75,note,.10,'bell')
    mix=np.tanh(mix*1.25);mix*=.79/max(np.max(np.abs(mix)),.01)
    fade=round(.008*RATE);mix[:fade]*=np.linspace(0,1,fade)[:,None]
    fade=round(.35*RATE);mix[-fade:]*=np.linspace(1,0,fade)[:,None]
    output=Path(output);output.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        wav=Path(tmp)/'puzzle-sprint.wav';encoded=Path(tmp)/'puzzle-sprint.m4a'
        with wave.open(str(wav),'wb') as f:
            f.setnchannels(2);f.setsampwidth(2);f.setframerate(RATE);f.writeframes((mix*32767).astype('<i2').tobytes())
        subprocess.run(['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-i',str(wav),'-c:a','aac','-b:a','128k',str(encoded)],check=True)
        encoded.replace(output)
    print(json.dumps({'title':'Korobeiniki','bpm':BPM,'key':'A minor','seconds':round(duration,3),'peak_dbfs':round(20*math.log10(float(np.max(np.abs(mix)))),2),'clipped_samples':int((np.abs(mix)>=1).sum()),'generation_cost_usd':0,'sections':[{'title':name,'at_seconds':round(i*16*4*BEAT,3)} for i,name in enumerate(sections)]}))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',default=str(Path(__file__).resolve().parents[1]/'public/assets/puzzle-sprint.m4a'))
    render(parser.parse_args().output)
