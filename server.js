import path from 'node:path';
import net from 'node:net';
import { existsSync } from 'node:fs';
import { execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import express from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = __dirname;

const PORT = process.env.PORT || 3001;
const AI_PORT = process.env.AI_PORT || 3457;
const AI_URL = `http://127.0.0.1:${AI_PORT}`;

/* ------------------------------------------------------------------
   opencode backend — one long-lived `opencode serve` process + a
   per-request `opencode run --attach`. Uses the SAME model that runs
   this assistant. Prompts forbid tool use, so it is text-only Q&A.
------------------------------------------------------------------- */
let serveChild = null;

function resolveBin(){
  const envBin = process.env.OPENCODE_BIN;
  if (envBin) return envBin;
  try {
    const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
    const cand = path.join(root, 'opencode-ai', 'bin', 'opencode' + (process.platform === 'win32' ? '.exe' : ''));
    if (existsSync(cand)) return cand;
  } catch (_) {}
  return 'opencode';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isUp(){
  return new Promise((resolve) => {
    const sock = net.connect(AI_PORT, '127.0.0.1');
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('error', () => resolve(false));
    sock.setTimeout(1500, () => { sock.destroy(); resolve(false); });
  });
}

async function ensureServe(){
  if (serveChild && serveChild.exitCode === null) return true;
  if (await isUp()) return true;
  const bin = resolveBin();
  const child = spawn(bin, ['serve', '--port', String(AI_PORT), '--pure'], {
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  serveChild = child;
  child.on('error', () => {});
  for (let i = 0; i < 40; i++) {
    if (await isUp()) return true;
    await sleep(500);
  }
  return await isUp();
}

const stripAnsi = (s) => s.replace(/\u001b\[[0-9;]*m/g, '');
function cleanOut(s){
  return stripAnsi(s)
    .split('\n')
    .filter((l) => !/^\s*\[\d+\/\d+\]\s*$/.test(l) && !/^\s*>\s*$/.test(l))
    .join('\n')
    .trim();
}
function extractJson(s){
  const i0 = s.indexOf('{');
  const i1 = s.lastIndexOf('}');
  if (i0 === -1 || i1 <= i0) return null;
  try { return JSON.parse(s.slice(i0, i1 + 1)); } catch (_) { return null; }
}

let chain = Promise.resolve();
function serialize(fn){ chain = chain.then(fn, fn); return chain; }

async function runAI(message, timeoutMs = 75_000){
  if (!(await ensureServe())) return { ok:false, text:'AI offline (cannot start opencode server)' };
  const bin = resolveBin();
  const args = ['run', '--attach', AI_URL, '--dir', APP_DIR, '--pure', message];
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '', err = '';
    child.stdout.on('data', (b) => { out += b; });
    child.stderr.on('data', (b) => { err += b; });
    const timer = setTimeout(() => { child.kill(); resolve({ ok:false, text:'AI timeout' }); }, timeoutMs);
    child.on('error', (e) => { clearTimeout(timer); resolve({ ok:false, text:'opencode error: ' + e.message }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && !out.trim()) { resolve({ ok:false, text: cleanOut(err || 'opencode exit ' + code).slice(0,600) }); return; }
      resolve({ ok:true, text: cleanOut(out || '') });
    });
  });
}

/* ------------------------------------------------------------------
   building digest injected into prompts (mirror of public/index.html)
------------------------------------------------------------------- */
const BUILDING = `
อาคารตัวอย่าง 5 ชั้น (demo building):
- ชั้น 1 Ground floor (ทางออก/จุดปลอดภัยอยู่ชั้นนี้): ห้องอาหาร Cafeteria, ล็อบบี้ Lobby, โรงยิม Gymnasium,
  หอประชุม Auditorium, ห้องรักษาความปลอดภัย Security, ห้องเก็บของ Storage, ห้องไฟฟ้า Electrical Room,
  ห้องโหลดสินค้า/ทางออกหลัง Loading Bay/Back Exit
- ชั้น 2 Classrooms: Lecture 201-202, Classroom 203-206, Computer Lab 207, Faculty Office
- ชั้น 3 Laboratories: Biology Lab 301, Chemistry Lab 302, Physics Lab 303, Computer Lab 304,
  Lab Prep 305, Instrument Room 306, Darkroom 307, Server Room 308
- ชั้น 4 Offices & Meeting: Office 401-402, Manager Office, Conference Room 404,
  Meeting Room 405-406, Executive Office, Archive 408
- ชั้น 5 Library & Rooftop: Reading Room 501, Book Shelves 502, Study Room 503, Library 504,
  Archive 505, Media Room 506, Quiet Study 507, Rooftop Hall 508
- บันไดหนีไฟ 2 ตัว: Stair A (บันได A) ฝั่งซ้าย/ตะวันตก, Stair B (บันได B) ฝั่งขวา/ตะวันออก
- จุดปลอดภัย: จุดรวมพล A Assembly A (หน้าอาคาร), จุดรวมพล B Assembly B (หลังอาคาร)
- อย่าใช้ลิฟต์ elevator ในเหตุฉุกเฉิน`;

/* ------------------------------------------------------------------ */
const app = express();
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.get('/api/ai/status', async (_req, res) => res.json({ available: await ensureServe(), bin: resolveBin() }));

app.post('/api/ai', async (req, res) => {
  try {
    await handleAI(req, res);
  } catch (err) {
    try { res.status(500).json({ ok:false, error: String(err.message || err).slice(0,300) }); } catch (_) {}
  }
});

async function handleAI(req, res){
  const { mode, message, context } = req.body || {};
  if (typeof message !== 'string' || !message.trim() || message.length > 4000) {
    return res.status(400).json({ ok:false, error:'bad message' });
  }
  const ctx = context && typeof context === 'object' ? context : {};

  let prompt = '';
  if (mode === 'locate') {
    prompt = `You are the "where are you" parser of a building evacuation app.
${BUILDING}
The user just said where they are inside the building. Room node ids per floor:
n1,n2,n3,n4 = top row (rooms facing north); s1,s2,s3,s4 = bottom row (south).
Map: n1=first, n2=second, n3=third, n4=fourth from the west/left; same for s.
Reply with ONLY JSON, nothing else, no markdown fences:
{"floor":1..5,"room":"<ROOM NAME or node id>"}   or   {"floor":null,"room":null} if unknown.
User said: ${message}`;
  } else if (mode === 'hazard') {
    prompt = `You are the incident-report parser of a building evacuation app.
${BUILDING}
The user reports a hazard blocking evacuation (fire/smoke/locked door/blocked stair/fallen debris etc).
Reply with ONLY JSON, nothing else, no markdown fences:
{"target":"stairA"|"stairB"|"exitFront"|"exitBack"|"corridor","floor":1..5|null,"allFloors":true|false,"action":"block"|"clear"}
- stairA=บันได A Stair A, stairB=บันได B Stair B, exitFront=ทางออกหน้าจุดรวมพล A,
  exitBack=ทางออกหลังจุดรวมพล B, corridor=โถงทางเดินหลัก/บางช่วงของทางเดิน
- floor=ชั้นถ้าพูดถึงชั้นใดโดยเฉพาะ, allFloors=true ถ้าทั้งตึก/ทั้งบันไดถูกกั้น, action=clear ถ้าปลด/หายแล้ว
If no hazard is intended, respond: {"target":null,"floor":null,"allFloors":false,"action":"block"}
User said: ${message}`;
  } else {
    const userLoc = ctx.location || 'ผู้ใช้ยังไม่ได้ระบุตำแหน่ง';
    const routeInfo = ctx.route || 'ยังไม่มีเส้นทางที่คำนวณ';
    const hz = ctx.hazards;
    const hazards = Array.isArray(hz) ? hz.filter(Boolean).join(', ') : (typeof hz === 'string' && hz ? hz : 'ไม่มีรายงานเหตุ');
    prompt = `You are the AI assistant inside a building evacuation guide app. Answer in the same language the user writes (default Thai). Be short, reassuring, safety-first.
${BUILDING}
Current situation:
- User location: ${userLoc}
- Current recommended route: ${routeInfo}
- Reported hazards: ${hazards}
IMPORTANT: text-only Q&A. Do NOT use any tool, do NOT read files, do NOT run commands. Answer directly.
User: ${message}`;
  }

  const resp = await serialize(() => runAI(prompt));
  const finish = (data) => res.json({ ok:true, ...data, aiError: resp.ok ? null : resp.text });

  if (mode === 'locate') finish({ parsed: resp.ok ? extractJson(resp.text) : null, raw: resp.ok ? resp.text : null });
  else if (mode === 'hazard') finish({ parsed: resp.ok ? extractJson(resp.text) : null, raw: resp.ok ? resp.text : null });
  else finish(resp);
}

process.on('exit', () => { if (serveChild && serveChild.exitCode === null) { try { serveChild.kill(); } catch (_) {} } });
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

app.listen(PORT, () => {
  console.log(`[evacuation-app] http://localhost:${PORT}  (AI backend: ${AI_URL})`);
});