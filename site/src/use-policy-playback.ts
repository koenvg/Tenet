import { useCallback, useEffect, useRef, useState } from 'react';
import type { PolicyRouteIndex } from './policy-routes.js';
import { nextStep, phases, type Phase, type StoryFrame } from './policy-story.js';

export type SceneBinding = Readonly<{ observed: Element; clockTarget: Element; paint(frame: StoryFrame): void }>;
export type BindScene = (root: HTMLDivElement) => SceneBinding;

type Playback =
  | { kind: 'waiting' | 'static'; route: PolicyRouteIndex; phase: 'lost' | 'blocked' }
  | { kind: 'playing' | 'paused'; route: PolicyRouteIndex; phase: Phase; run: number };

export function usePolicyPlayback(ready: boolean, bindScene: BindScene) {
  const stage=useRef<HTMLDivElement>(null);
  const [playback,setPlayback]=useState<Playback>({kind:'static',route:0,phase:'blocked'});
  const [reduced,setReduced]=useState(true),[announcement,announce]=useState('');
  const current=useRef(playback); current.current=playback;
  const environment=useRef({visible:false,hidden:true,reduced:true});
  const clock=useRef<Animation|null>(null);
  const frames=useRef<{start:()=>void;stop:()=>void}|null>(null);
  const run=useRef(0);
  const binding=useRef<SceneBinding|null>(null);
  useEffect(()=> {
    if(!ready||!stage.current) return;
    const attached=bindScene(stage.current);binding.current=attached;
    return ()=> {if(binding.current===attached) binding.current=null;};
  },[ready,bindScene]);
  const sync=useCallback(()=> {
    const env=environment.current,enabled=env.visible&&!env.hidden&&!env.reduced;
    if(enabled&&current.current.kind==='waiting') setPlayback(state=>state.kind==='waiting'?{kind:'playing',route:state.route,phase:'before',run:++run.current}:state);
    if(enabled&&current.current.kind==='playing') {clock.current?.play();frames.current?.start();}
    else {
      const animation=clock.current;
      if(animation) {const time=animation.currentTime;animation.pause();animation.currentTime=time;}
      frames.current?.stop();
    }
  },[]);
  useEffect(()=> {
    if(!ready||!stage.current) return;
    const media=matchMedia('(prefers-reduced-motion: reduce)');
    environment.current.hidden=document.hidden;environment.current.reduced=media.matches;
    setReduced(media.matches);
    setPlayback({kind:media.matches?'static':'waiting',route:0,phase:media.matches?'lost':'blocked'});
    const observer=new IntersectionObserver(entries=> {environment.current.visible=entries.at(-1)?.isIntersecting??false;sync();});
    observer.observe(binding.current!.observed);
    const visibility=()=> {environment.current.hidden=document.hidden;sync();};
    const preference=()=> {
      environment.current.reduced=media.matches;setReduced(media.matches);
      if(media.matches) {
        clock.current?.pause();frames.current?.stop();
        setPlayback(state=>({kind:'static',route:state.route,phase:'blocked'}));
      }
      sync();
    };
    document.addEventListener('visibilitychange',visibility);media.addEventListener('change',preference);
    return ()=> {observer.disconnect();document.removeEventListener('visibilitychange',visibility);media.removeEventListener('change',preference);};
  },[ready,bindScene,sync]);

  const activeRun='run' in playback?playback.run:null,{route,phase}=playback;
  useEffect(()=> {
    const scene=binding.current;
    if(!scene) return;
    let frame=0,disposed=false;
    const paint=(progress:number)=>scene.paint({route,phase,progress});
    if(activeRun===null) {paint(1);return;}
    // A single native timeline on the actual machine drives all refs and readouts.
    // React state changes only at phase boundaries and on deliberate user input.
    const animation=scene.clockTarget.animate([{'--scene-progress':'0'},{'--scene-progress':'1'}],{duration:phases[phase].duration,fill:'both'});
    animation.pause();clock.current=animation;
    const draw=()=>paint(Math.min(1,Number(animation.currentTime??0)/phases[phase].duration));
    const tick=()=> {
      frame=0;
      if(disposed||animation.playState!=='running') return;
      draw();frame=requestAnimationFrame(tick);
    };
    const start=()=> {if(!disposed&&!frame&&animation.playState==='running') frame=requestAnimationFrame(tick);};
    const stop=()=> {cancelAnimationFrame(frame);frame=0;if(!disposed) draw();};
    frames.current={start,stop};
    animation.onfinish=()=> {
      if(disposed) return;
      stop();paint(1);
      setPlayback(state=> {
        if(state.kind!=='playing'||state.run!==activeRun||state.route!==route||state.phase!==phase) return state;
        return {kind:'playing',...nextStep(route,phase),run:++run.current};
      });
    };
    paint(0);sync();
    return ()=> {
      disposed=true;cancelAnimationFrame(frame);animation.onfinish=null;animation.cancel();
      if(clock.current===animation) {clock.current=null;frames.current=null;}
    };
  },[route,phase,activeRun,ready,bindScene,sync]);
  useEffect(sync,[playback.kind,sync]);
  const toggle=()=> {
    if(playback.kind==='playing') {setPlayback({...playback,kind:'paused'});announce('Animation paused.');}
    else if(playback.kind==='paused') {setPlayback({...playback,kind:'playing'});announce('Animation resumed.');}
    else {setPlayback({kind:'playing',route,phase:'before',run:++run.current});announce('Replaying this proposal before and after TENET.');}
  };
  const compare=()=> {
    const after=phase==='lost',selected=after?route:((route+1)%4) as PolicyRouteIndex;
    setPlayback({kind:'static',route:selected,phase:after?'blocked':'lost'});
    announce(`Example ${selected+1}. ${after?'With opt-in enforcement. Illustrative block.':'Without TENET. Illustrative data removal.'}`);
  };
  return {stage,playback,selected:route,reduced,announcement,toggle,compare};
}
