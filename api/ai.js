// Vercel serverless — Gemini AI backend
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method not allowed' });

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) return res.status(500).json({ ok: false, error: 'GEMINI_API_KEY not set' });

  const { mode, message, context } = req.body || {};
  if (typeof message !== 'string' || !message.trim() || message.length > 4000) {
    return res.status(400).json({ ok: false, error: 'bad message' });
  }

  const BUILDING = `อาคารตัวอย่าง 5 ชั้น (demo building):
- ชั้น 1 Ground floor: ห้องอาหาร Cafeteria, ล็อบบี้ Lobby, โรงยิม Gymnasium, หอประชุม Auditorium, ห้องรักษาความปลอดภัย Security, ห้องเก็บของ Storage, ห้องไฟฟ้า Electrical Room, ห้องโหลดสินค้า Loading Bay
- ชั้น 2 Classrooms: Lecture 201-202, Classroom 203-206, Computer Lab 207, Faculty Office
- ชั้น 3 Laboratories: Biology Lab 301, Chemistry Lab 302, Physics Lab 303, Computer Lab 304, Lab Prep 305, Instrument Room 306, Darkroom 307, Server Room 308
- ชั้น 4 Offices: Office 401-402, Manager Office, Conference Room 404, Meeting Room 405-406, Executive Office, Archive 408
- ชั้น 5 Library: Reading Room 501, Book Shelves 502, Study Room 503, Library 504, Archive 505, Media Room 506, Quiet Study 507, Rooftop Hall 508
- บันไดหนีไฟ: Stair A (ซ้าย/ตะวันตก), Stair B (ขวา/ตะวันออก)
- จุดปลอดภัย: จุดรวมพล A (หน้าอาคาร), จุดรวมพล B (หลังอาคาร)
- Room node ids per floor: n1-n4 = top row (north), s1-s4 = bottom row (south)
- n1=first, n2=second, n3=third, n4=fourth from west/left`;

  let prompt = '';
  if (mode === 'locate') {
    prompt = `You are the "where are you" parser of a building evacuation app.
${BUILDING}
Map: n1=first, n2=second, n3=third, n4=fourth from the west/left; same for s.
Reply with ONLY JSON, nothing else, no markdown fences:
{"floor":1..5,"room":"<ROOM NAME or node id>"}   or   {"floor":null,"room":null} if unknown.
User said: ${message}`;
  } else if (mode === 'hazard') {
    prompt = `You are the incident-report parser of a building evacuation app.
${BUILDING}
Reply with ONLY JSON, nothing else, no markdown fences:
{"target":"stairA"|"stairB"|"exitFront"|"exitBack"|"corridor","floor":1..5|null,"allFloors":true|false,"action":"block"|"clear"}
- stairA=บันได A, stairB=บันได B, exitFront=ทางออกหน้าจุดรวมพล A, exitBack=ทางออกหลังจุดรวมพล B, corridor=โถงทางเดิน
- floor=ชั้นถ้าพูดถึง, allFloors=true ถ้าทั้งตึก, action=clear ถ้าปลด
If no hazard, respond: {"target":null,"floor":null,"allFloors":false,"action":"block"}
User said: ${message}`;
  } else {
    const ctx = context && typeof context === 'object' ? context : {};
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

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${API_KEY}`;
    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 500 }
      })
    });

    const data = await geminiRes.json();
    if (!geminiRes.ok) {
      return res.status(502).json({ ok: false, error: data.error?.message || 'Gemini API error' });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

    if (mode === 'locate' || mode === 'hazard') {
      const parsed = extractJson(text);
      return res.json({ ok: true, parsed, raw: text, aiError: null });
    }
    return res.json({ ok: true, text, aiError: null });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

function extractJson(s) {
  const i0 = s.indexOf('{');
  const i1 = s.lastIndexOf('}');
  if (i0 === -1 || i1 <= i0) return null;
  try { return JSON.parse(s.slice(i0, i1 + 1)); } catch (_) { return null; }
}
