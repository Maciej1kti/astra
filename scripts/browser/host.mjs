/** Temporary HTTPS/Unix fixture shared by maintained browser suites. */
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { join, resolve } from "node:path";
import http from "node:http";
import https from "node:https";
import assert from "node:assert/strict";

export const root = resolve(import.meta.dirname, "../..");
export const profile = process.env.ASTRA_TEST_PROFILE === "release" ? "release" : "debug";
export const binaries = join(root, "target", profile);

export function localClient(socket) {
  return (...args) => {
    let output;
    try {
      output = execFileSync(join(binaries, "projectctl"), ["--socket", socket, ...args], {
        encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30000,
        maxBuffer: 16 * 1024 * 1024,
      });
    } catch (error) {
      if (!error.stdout) throw error;
      output = error.stdout;
    }
    const envelope = JSON.parse(output);
    assert.equal(envelope.api_version, "1");
    assert.equal(envelope.ok, true, JSON.stringify(envelope.error));
    return envelope.data;
  };
}

export async function createHost() {
  const temp = await realpath(await mkdtemp(join(await realpath("/tmp"), "lp-test-")));
  const state = join(temp, "state"), folder = join(temp, "Field notes");
  let proxy, daemon, daemonLog = "", closed = false;
  const sockets = new Set();
  async function close() {
    if (closed) return;
    closed = true;
    for (const socket of sockets) socket.destroy();
    if (proxy?.listening) await new Promise((done) => proxy.close(done));
    if (daemon?.pid && daemon.exitCode === null && daemon.signalCode === null) {
      const exited = once(daemon, "exit");
      daemon.kill("SIGTERM");
      const force = setTimeout(() => daemon.kill("SIGKILL"), 5000);
      try { await exited; } finally { clearTimeout(force); }
    }
    await rm(temp, { recursive: true, force: true });
  }
  try {
    await mkdir(state, { mode: 0o700 });
    await mkdir(folder, { mode: 0o700 });
    const socket = join(state, "projectd.sock");
    const cli = localClient(socket);
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes",
      "-keyout", join(temp, "key.pem"), "-out", join(temp, "cert.pem"),
      "-subj", "/CN=localhost", "-days", "1"], { stdio: "ignore", timeout: 15000 });
    const reserve = http.createServer();
    await new Promise((done, reject) => { reserve.once("error", reject); reserve.listen(0, "127.0.0.1", done); });
    const port = reserve.address().port;
    await new Promise((done) => reserve.close(done));
    proxy = https.createServer({ key: await readFile(join(temp, "key.pem")), cert: await readFile(join(temp, "cert.pem")) }, (incoming, outgoing) => {
      const upstream = http.request({ hostname: "127.0.0.1", port, path: incoming.url,
        method: incoming.method, headers: incoming.headers }, (response) => {
        outgoing.writeHead(response.statusCode, response.headers);
        response.pipe(outgoing);
      });
      upstream.on("error", () => { if (!outgoing.headersSent) outgoing.writeHead(503); outgoing.end(); });
      outgoing.on("close", () => upstream.destroy());
      incoming.pipe(upstream);
    });
    proxy.on("connection", (socket) => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
    await new Promise((done, reject) => { proxy.once("error", reject); proxy.listen(0, "127.0.0.1", done); });
    const origin = `https://localhost:${proxy.address().port}`;
    daemon = spawn(join(binaries, "projectd"), ["--data-dir", state, "--public-origin", origin, "--port", String(port)], { stdio: ["ignore", "ignore", "pipe"] });
    let startError;
    daemon.on("error", (error) => { startError = error; });
    daemon.stderr.on("data", (data) => { daemonLog = (daemonLog + data).slice(-65536); });
    for (let attempt = 0; ; attempt++) {
      try { cli("hello"); break; }
      catch (error) {
        if (attempt >= 100 || startError || daemon.exitCode !== null || daemon.signalCode !== null) {
          throw new Error(`Synthetic host failed to start: ${startError ?? (daemonLog || error)}`);
        }
        await new Promise((done) => setTimeout(done, 100));
      }
    }
    return { root, binaries, temp, state, folder, socket, origin, cli, close };
  } catch (error) {
    await close();
    throw error;
  }
}

/** Pair a test browser through the same challenge/owner approval as normal clients. */
export async function pair(page, host) {
  await page.goto(host.origin);
  const request = page.getByRole("button", { name: /^Request access/ });
  const project = page.getByLabel("Project", { exact: true });
  await request.or(project).waitFor();
  if (await request.isVisible()) {
    await request.click();
    await page.getByText("Compare this challenge on the host machine:").waitFor();
    const text = await page.locator("body").innerText();
    const matching = host.cli("pairings").items.filter((entry) => text.includes(entry.challenge));
    assert.equal(matching.length, 1, "The browser must match exactly one owner-approved challenge");
    host.cli("approve", matching[0].id, "--challenge", matching[0].challenge);
    await page.getByRole("button", { name: "I approved this browser", exact: true }).click();
  }
  await project.waitFor();
}

export async function writeRuntime(host, config) {
  const runtime = join(host.temp, "runtime");
  await mkdir(runtime, { mode: 0o700 });
  await writeFile(join(runtime, "connection.json"), JSON.stringify(config), { mode: 0o600 });
  return runtime;
}
