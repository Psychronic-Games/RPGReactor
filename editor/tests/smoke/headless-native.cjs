#!/usr/bin/env node
/** Run one native audit on an isolated display. Invoke this through codex-check. */
'use strict';
const {spawn}=require('node:child_process'),path=require('node:path');
const root=path.resolve(__dirname,'../../..'),[script,...args]=process.argv.slice(2);
if(!script)throw Error('Usage: headless-native.cjs AUDIT_SCRIPT [ARG ...]');
let display,child;
(async()=>{try{
 display=spawn(path.join(root,'editor/tests/perf/headless-display.sh'),[],{env:process.env,stdio:['ignore','pipe','pipe']});
 const name=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Display startup timed out')),20000);display.stdout.on('data',b=>{output+=b;const match=output.match(/(?:^|\n)(:\d+)\s/);if(match){clearTimeout(timer);resolve(match[1]);}});display.stderr.on('data',()=>{});display.once('error',e=>{clearTimeout(timer);reject(e);});display.once('exit',code=>{clearTimeout(timer);reject(Error('Display exited: '+code));});});
 const env={...process.env,DISPLAY:name,XAUTHORITY:'',XDG_SESSION_TYPE:'x11',__GLX_VENDOR_LIBRARY_NAME:'mesa',NODE_OPTIONS:(process.env.NODE_OPTIONS||'')+' --max-old-space-size=1024'};delete env.WAYLAND_DISPLAY;
 child=spawn(process.execPath,[path.resolve(script),...args],{env,stdio:'inherit'});
 process.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code)=>resolve(code??1));});
}finally{
 if(child?.exitCode===null)child.kill('SIGTERM');
 if(display&&display.exitCode===null){display.kill('SIGTERM');await new Promise(resolve=>{const timer=setTimeout(resolve,3000);display.once('exit',()=>{clearTimeout(timer);resolve();});});}
}})().catch(e=>{console.error(e);process.exitCode=1;});
