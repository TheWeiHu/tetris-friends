#!/usr/bin/env python3
"""Render the original Puzzle Sprint score. Requires numpy and ffmpeg."""
import argparse
import json
import math
from pathlib import Path
import subprocess
import tempfile
import wave

import numpy as np

BPM = 144
RATE = 44100
BEAT = 60 / BPM
MELODY = [
    ['A5','E5','C5','E5','B5','A5','G5','E5'],
    ['F5','A5','C6','A5','G5','E5','D5','C5'],
    ['D5','F5','A5','F5','E5','G5','B5','G5'],
    ['E5','B4','E5','G#5','B5','A5','G#5','E5'],
    ['A5','C6','B5','A5','E5','G5','A5','C6'],
    ['B5','G5','E5','D5','F5','A5','G5','F5'],
    ['E5','C5','D5','B4','C5','A4','B4','G#4'],
    ['A4','C5','E5','A5','B5','G#5','E5','B4'],
    ['A5','E5','C6','E5','B5','E5','A5','E5'],
    ['F5','C5','A5','C5','G5','D5','B5','D5'],
    ['D5','A4','F5','A4','E5','B4','G5','B4'],
    ['E5','G#5','B5','E6','D6','B5','G#5','E5'],
    ['C6','A5','E5','C5','A5','C6','E6','C6'],
    ['B5','G5','D5','B4','G5','B5','D6','B5'],
    ['A5','F5','D5','A4','G#5','E5','B4','G#4'],
    ['A4','E5','A5','C6','B5','G#5','E5','G#5'],
]
CHORDS = [('A2',['A3','C4','E4']),('F2',['F3','A3','C4']),('D2',['D3','F3','A3']),('E2',['E3','G#3','B3']),
          ('A2',['A3','C4','E4']),('G2',['G3','B3','D4']),('D2',['D3','F3','A3']),('E2',['E3','G#3','B3'])]*2

def frequency(note):
    names={'C':0,'C#':1,'D':2,'D#':3,'E':4,'F':5,'F#':6,'G':7,'G#':8,'A':9,'A#':10,'B':11}
    midi=12*(int(note[-1])+1)+names[note[:-1]]
    return 440*2**((midi-69)/12)

def render(output):
    duration=16*4*BEAT
    mix=np.zeros((round(duration*RATE),2),dtype=np.float64)
    rng=np.random.default_rng(47)
    def add(at,length,note,volume=.1,voice='pulse',pan=0):
        count=round(length*RATE);t=np.arange(count)/RATE;f=frequency(note)
        if voice=='pulse':
            signal=sum(np.sin(2*np.pi*f*k*t)*math.sin(k*math.pi*.3)/k for k in range(1,10))
        elif voice=='bell':
            signal=np.sin(2*np.pi*f*t)+.22*np.sin(2*np.pi*f*2*t)*np.exp(-t*13)
        else:
            signal=np.sin(2*np.pi*f*t)+.22*np.sin(2*np.pi*f*3*t)/3
        env=np.minimum(1,t/.006)*np.minimum(1,np.maximum(0,(length-t)/.035))*np.exp(-t*(5 if voice=='bell' else 1.7))
        start=round(at*RATE);n=min(count,len(mix)-start)
        if n<=0:return
        gains=np.array([math.sqrt((1-pan)/2),math.sqrt((1+pan)/2)])
        mix[start:start+n]+=signal[:n,None]*env[:n,None]*volume*gains
    for bar,notes in enumerate(MELODY):
        start=bar*4*BEAT;root,chord=CHORDS[bar]
        for i,note in enumerate(notes):add(start+i*.5*BEAT,.43*BEAT,note,.105,'pulse',-.13)
        for beat in range(4):
            add(start+beat*BEAT,.34*BEAT,root if beat%2==0 else chord[2][:-1]+'2',.18,'bass')
            for j,note in enumerate(chord):add(start+(beat+.5)*BEAT,.22*BEAT,note,.035,'pulse',.22)
            # A light kick and brushed noise keep the loop buoyant rather than abrasive.
            at=round((start+beat*BEAT)*RATE);t=np.arange(round(.11*RATE))/RATE
            kick=np.sin(2*np.pi*(55*t+5*(1-np.exp(-t*30))))*np.exp(-t*35)*.12
            n=min(len(kick),len(mix)-at);mix[at:at+n]+=kick[:n,None]
            at=round((start+(beat+.5)*BEAT)*RATE);n=min(round(.045*RATE),len(mix)-at)
            hiss=rng.normal(0,1,n)*np.exp(-np.arange(n)/RATE*80)*.014
            mix[at:at+n]+=hiss[:,None]
        if bar in [3,7,11,15]:
            for i,note in enumerate(['E6','A5','E6','C6']):add(start+(2+i*.5)*BEAT,.32*BEAT,note,.075,'bell',.35)
    mix=np.tanh(mix*1.25);mix*=.79/max(np.max(np.abs(mix)),.01)
    fade=round(.008*RATE);mix[:fade]*=np.linspace(0,1,fade)[:,None];mix[-fade:]*=np.linspace(1,0,fade)[:,None]
    output=Path(output);output.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        wav=Path(tmp)/'puzzle-sprint.wav';encoded=Path(tmp)/'puzzle-sprint.m4a'
        with wave.open(str(wav),'wb') as f:
            f.setnchannels(2);f.setsampwidth(2);f.setframerate(RATE);f.writeframes((mix*32767).astype('<i2').tobytes())
        subprocess.run(['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-i',str(wav),'-c:a','aac','-b:a','128k',str(encoded)],check=True)
        encoded.replace(output)
    print(json.dumps({'title':'Puzzle Sprint','bpm':BPM,'key':'A minor','seconds':round(duration,3),'peak_dbfs':round(20*math.log10(float(np.max(np.abs(mix)))),2),'clipped_samples':int((np.abs(mix)>=1).sum()),'generation_cost_usd':0}))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',default=str(Path(__file__).resolve().parents[1]/'public/assets/puzzle-sprint.m4a'))
    render(parser.parse_args().output)
