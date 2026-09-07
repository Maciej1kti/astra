// Isolated synthetic fixture. Run from the repository with Node 24 after a release build.
import { mkdir, mkdtemp, readFile, writeFile, realpath } from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import http from 'node:http';
import https from 'node:https';
const root=resolve(import.meta.dirname,'../..');
const runtime=join(root,'.manual','audit-2026-09-08');
await mkdir(runtime,{recursive:true,mode:0o700});
const temp=await mkdtemp(join(await realpath('/tmp'),'astra-audit-'));
const state=join(temp,'state'); await mkdir(state,{mode:0o700});
const socket=join(state,'projectd.sock');
const reserve=http.createServer(); await new Promise(r=>reserve.listen(0,'127.0.0.1',r));
const port=reserve.address().port; await new Promise(r=>reserve.close(r));
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(temp,'key.pem'),'-out',join(temp,'cert.pem'),'-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1','-days','2'],{stdio:'ignore'});
const proxy=https.createServer({key:await readFile(join(temp,'key.pem')),cert:await readFile(join(temp,'cert.pem'))},(req,res)=>{
 const upstream=http.request({hostname:'127.0.0.1',port,path:req.url,method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});
 upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end('Audit host unavailable');});
 res.on('close',()=>upstream.destroy());req.pipe(upstream);
});
await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
const origin=`https://localhost:${proxy.address().port}`;
const daemon=spawn(join(root,'target/release/projectd'),['--data-dir',state,'--public-origin',origin,'--port',String(port)],{stdio:['ignore','ignore','inherit']});
function cli(...args){let out;try{out=execFileSync(join(root,'target/release/projectctl'),['--socket',socket,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});}catch(e){if(e.status!==9)throw e;out=e.stdout;}const data=JSON.parse(out);if(!data.ok)throw Error(JSON.stringify(data.error));return data.data;}
for(let i=0;i<100;i++){try{cli('hello');break;}catch(e){if(i===99)throw e;await new Promise(r=>setTimeout(r,100));}}
const commandFile=join(temp,'command.json');
async function command(path,payload){await writeFile(commandFile,JSON.stringify(payload));return cli('command','POST',path,'--json-file',commandFile).result;}
const projects=[];
for(const title of ['Studio launch — QA synthetic','Personal lab — QA synthetic','Empty project — QA synthetic']){
 const folder=join(temp,title);await mkdir(folder,{mode:0o700});
 const plan=cli('registration-plan',folder,'--name',title);cli('register',plan.plan_id);
 projects.push({id:plan.project_id,title,folder});
}
const base=`/api/v1/projects/${projects[0].id}`;
const milestones=[];
for(const [title,date] of [['Prototype ready','2026-09-11'],['Public launch','2026-09-21']]) milestones.push(await command(`${base}/milestones`,{title,due:{date,kind:'hard'}}));
const cards=[];
const titles=['Design system foundations','Build onboarding flow','Review accessibility','Confirm launch scope','Draft-loss probe','History probe','Conflict probe','Archive probe','Keyboard order probe','Undated backlog idea','Polish copy — Zażółć gęślą jaźń 🧪','A very long synthetic card title that exercises wrapping in a crowded project board and small calendar cells while keeping important actions reachable'];
for(let i=0;i<36;i++){
 const title=titles[i]??`QA work package ${String(i+1).padStart(2,'0')}`;
 const payload={title,status:['planned','active','review','done','cancelled'][i%5],priority:['urgent','high','normal','low'][i%4],labels:i%2?['frontend','qa']:['design','launch'],body:`Synthetic audit fixture ${i+1}.\n\nBody-only needle: nebula-${i+1}.\n\n- [ ] Example checklist item\n- [x] Example done item\n\n**Bold** and _emphasis_.`,...(i%6!==3?{schedule:{start:`2026-09-${String(7+i%15).padStart(2,'0')}`,end:`2026-09-${String(9+i%15).padStart(2,'0')}`}}:{}),...(i%3===0?{due:{date:'2026-09-07',kind:i%2?'target':'hard'}}:{}),...(i%7===0?{blocked:{reason:'Waiting for synthetic approval'}}:{}),...(i%8===0?{review_on:'2026-09-08'}:{})};
 if(i===1||i===2)payload.depends_on=[cards[i-1].id];
 cards.push(await command(`${base}/cards`,payload));
}
const other=await command(`/api/v1/projects/${projects[1].id}/cards`,{title:'Separate project focus probe',status:'active'});
for(const [kind,summary] of [['result','Prototype tested on synthetic fixtures'],['blocker','Awaiting launch decision'],['decision_needed','Choose the launch date'],['note','Audit notes and observations']]) await command(`${base}/updates`,{kind,summary,author:{kind:'human',label:'Synthetic QA'},target:{type:'project',id:projects[0].id},body:'Synthetic report content. No customer data.'});
const config={origin,socket,temp,root,projects,cards:cards.map(c=>({id:c.id,title:c.title})),other:{id:other.id,title:other.title},milestones};
await writeFile(join(runtime,'connection.json'),JSON.stringify(config,null,2),{mode:0o600});
console.log(JSON.stringify({ready:true,origin,projects:projects.length,cards:cards.length+1,milestones:milestones.length,updates:4}));
let stopped=false;function stop(){if(stopped)return;stopped=true;proxy.closeAllConnections();proxy.close();daemon.kill('SIGTERM');}
process.on('SIGINT',stop);process.on('SIGTERM',stop);daemon.on('exit',stop);
