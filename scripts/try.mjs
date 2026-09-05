/** Local manual-test host. Real daemon, normal pairing, persistent synthetic data. */
import { mkdir, readFile, access } from "node:fs/promises";
import { execFileSync, spawn } from "node:child_process";
import { join, resolve } from "node:path";
import https from "node:https";
import http from "node:http";
const root = resolve(import.meta.dirname, "..");
const data = join(root, ".manual", "state"), project = join(root, ".manual", "Sample project");
await mkdir(data, { recursive: true, mode: 0o700 });
await mkdir(project, { recursive: true, mode: 0o700 });
const binary = join(root, "target/release/projectd"), ctl = join(root, "target/release/projectctl");
try { await access(binary); } catch { throw new Error("Build first: npm run build && scripts/cargo-local build --workspace --release"); }
const cert = join(data,"cert.pem"), key = join(data,"key.pem");
try { await access(cert); } catch {
  execFileSync("openssl", ["req","-x509","-newkey","rsa:2048","-nodes","-keyout",key,"-out",cert,"-subj","/CN=localhost","-addext","subjectAltName=DNS:localhost,IP:127.0.0.1","-days","30"], {stdio:"ignore"});
}
const origin = "https://localhost:47832", socket = join(data,"projectd.sock");
const child = spawn(binary,["--data-dir",data,"--public-origin",origin,"--port","47831"],{stdio:["ignore","inherit","inherit"]});
const proxy = https.createServer({key:await readFile(key),cert:await readFile(cert)},(incoming,outgoing) => {
  const request = http.request({hostname:"127.0.0.1",port:47831,path:incoming.url,method:incoming.method,headers:incoming.headers},response => {
    outgoing.writeHead(response.statusCode,response.headers); response.pipe(outgoing);
  });
  request.on("error",() => { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end("Host is unavailable"); });
  outgoing.on("close",() => request.destroy()); incoming.pipe(request);
});
let stopping = false;
function stop() { if (stopping) return; stopping = true; proxy.closeAllConnections(); proxy.close(); child.kill("SIGTERM"); }
process.on("SIGINT",stop); process.on("SIGTERM",stop);
child.on("exit",code => { stop(); process.exitCode = code ?? 1; });
proxy.on("error",error => { console.error(error.message); stop(); process.exitCode = 1; });
function cli(...args) {
  const result = execFileSync(ctl,["--socket",socket,...args],{encoding:"utf8",stdio:["ignore","pipe","pipe"]});
  return JSON.parse(result).data;
}
try {
  for (let attempt = 0; ; attempt++) {
    if (child.exitCode !== null) throw new Error("Host could not start");
    try { cli("hello"); break; } catch (e) { if (attempt >= 100) throw e; await new Promise(r => setTimeout(r,50)); }
  }
  let registered = false;
  try { cli("--project",project,"cards"); registered = true; } catch {}
  if (!registered) {
    const plan = cli("registration-plan",project,"--name","Try Local Projects");
    try { cli("register",plan.plan_id); } catch (e) { if (e.status !== 9) throw e; }
    const cards = cli("--project",project,"cards").items;
    if (!cards.length) for (const title of ["Try editing this card", "Plan a few dates", "Write a progress update"]) cli("--project",project,"card","create","--title",title);
  }
  proxy.listen(47832,"127.0.0.1",() => {
    console.log(`\nOpen ${origin}\nAccept the local test certificate warning, then request browser access.\nIn another terminal, list and approve the displayed matching challenge:\n`);
    console.log('npm run pair:try -- "CHALLENGE_FROM_BROWSER"');
    console.log("\nSynthetic data persists in .manual/. Ctrl+C stops this test host. No service or network configuration is installed.");
  });
} catch (e) { console.error(e.message); stop(); process.exitCode = 1; }
