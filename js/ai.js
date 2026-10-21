/* =========================================================
   PlanWise AI — Generative AI layer
   Bring-your-own-key, browser-direct calls to:
     • Google Gemini (generateContent REST, JSON mode)
     • OpenAI-compatible chat completions (OpenAI, Groq, OpenRouter, custom)
   Everything returns the shared Plan JSON schema or Markdown text.
   ========================================================= */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'planwise.ai.settings';

  const PROVIDERS = {
    gemini: {
      label: 'Google Gemini',
      models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-pro'],
      defaultModel: 'gemini-2.0-flash',
      help: 'Get a free key at aistudio.google.com/app/apikey',
      needsKey: true
    },
    openai: {
      label: 'OpenAI',
      base: 'https://api.openai.com/v1',
      models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'],
      defaultModel: 'gpt-4o-mini',
      help: 'Create a key at platform.openai.com/api-keys',
      needsKey: true
    },
    groq: {
      label: 'Groq',
      base: 'https://api.groq.com/openai/v1',
      models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
      defaultModel: 'llama-3.3-70b-versatile',
      help: 'Free keys at console.groq.com/keys',
      needsKey: true
    },
    openrouter: {
      label: 'OpenRouter',
      base: 'https://openrouter.ai/api/v1',
      models: ['google/gemini-2.0-flash-001', 'openai/gpt-4o-mini', 'meta-llama/llama-3.3-70b-instruct', 'anthropic/claude-3.5-haiku'],
      defaultModel: 'google/gemini-2.0-flash-001',
      help: 'Keys at openrouter.ai/keys — one key, many models',
      needsKey: true
    },
    custom: {
      label: 'Custom OpenAI-compatible',
      base: '',
      models: [],
      defaultModel: '',
      help: 'Any endpoint implementing /chat/completions (Ollama, LM Studio, vLLM, Together…)',
      needsKey: false
    },
    local: {
      label: 'Built-in Smart Planner',
      models: [],
      defaultModel: '',
      help: 'Template-based planner. No network calls, no key required.',
      needsKey: false
    }
  };

  /* ---------- Settings ---------- */
  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (s && PROVIDERS[s.provider]) return { fallback: true, ...s };
    } catch (_) { /* ignore */ }
    return { provider: 'local', apiKey: '', model: '', baseUrl: '', fallback: true };
  }
  function saveSettings(s) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }

  function isConfigured(s = loadSettings()) {
    if (s.provider === 'local') return false;
    const p = PROVIDERS[s.provider];
    if (p.needsKey && !s.apiKey) return false;
    if (s.provider === 'custom' && !s.baseUrl) return false;
    return true;
  }
  function describe(s = loadSettings()) {
    if (!isConfigured(s)) return 'Built-in Smart Planner (no AI key)';
    return `${PROVIDERS[s.provider].label} · ${s.model || PROVIDERS[s.provider].defaultModel}`;
  }

  /* ---------- Prompting ---------- */
  const PLAN_SCHEMA_TEXT = `{
  "title": string,                       // event name
  "tagline": string,                     // one short evocative line
  "summary": string,                     // 3-5 sentence overview of the strategy for this specific event
  "budget": {
    "total": number, "currency": string, "perGuest": number,
    "items": [ { "category": string, "amount": number, "notes": string } ]   // 7-12 items; amounts MUST sum exactly to total; include a Contingency line
  },
  "timeline": [                          // 5-8 phases ordered from earliest to event week
    { "phase": string, "daysBefore": number, "tasks": [string] }           // 3-6 concrete, actionable tasks each; daysBefore <= days until the event
  ],
  "vendors": [                           // 6-12 vendors
    { "name": string, "icon": string,    // icon = a Font Awesome 6 solid class like "fa-camera"
      "priority": "high"|"medium"|"low", "estimatedCost": number, "bookByDaysBefore": number,
      "why": string, "questions": [string] }                                 // 3-5 questions to ask before booking
  ],
  "ideas": [                             // 5-7 categories (theme/décor, food, entertainment, favors, guest experience, personal touches...)
    { "category": string, "items": [string] }                                // 3-5 specific, personalized ideas each
  ],
  "tips": [string],                      // 4-6 expert tips
  "risks": [ { "risk": string, "mitigation": string } ]                      // 3-5 items
}`;

  function systemPrompt() {
    return `You are PlanWise, an expert event planner (weddings, birthdays, community events) with 20 years of experience across cultures and budgets. You produce realistic, specific, locally-aware plans. Respect the user's currency, location, guest count, vibe, dietary needs and must-haves. Be concrete (name real types of venues, dishes, activities) and never generic. Avoid filler.`;
  }

  function briefToText(brief) {
    const days = Math.round((new Date(brief.date) - new Date()) / 86400000);
    return [
      `Event type: ${brief.type}`,
      `Event name: ${brief.name}`,
      brief.honoree ? `Honoree / for whom: ${brief.honoree}` : null,
      `Date: ${brief.date} (${days} days from today, ${new Date().toISOString().slice(0, 10)})`,
      `Guests: ${brief.guests}`,
      `Location: ${brief.location}`,
      `Total budget: ${brief.currency} ${brief.budget}`,
      `Vibe / style: ${(brief.vibe || []).join(', ') || 'not specified'}`,
      `Setting: ${brief.setting}`,
      `Time of day: ${brief.timeOfDay}`,
      brief.mustHaves ? `Must-haves: ${brief.mustHaves}` : null,
      brief.dietary ? `Food & dietary: ${brief.dietary}` : null,
      brief.notes ? `Additional notes: ${brief.notes}` : null
    ].filter(Boolean).join('\n');
  }

  function planPrompt(brief) {
    return `Create a complete event plan for the brief below.

BRIEF
${briefToText(brief)}

Return ONLY a single JSON object (no markdown fences, no commentary) matching this schema exactly:
${PLAN_SCHEMA_TEXT}

Rules:
- All money values are plain numbers in ${brief.currency}. budget.items amounts must add up exactly to ${brief.budget}.
- Timeline daysBefore values must be realistic for an event ${Math.max(1, Math.round((new Date(brief.date) - new Date()) / 86400000))} days away and strictly decrease across phases.
- Personalize ideas to the vibe, honoree, location and notes. Mention the location's local flavour where sensible.
- If the setting is outdoor, include weather risk and a tent/backup vendor.`;
  }

  function refinePrompt(plan, instruction) {
    const stripped = { ...plan };
    delete stripped.progress; delete stripped.id; delete stripped.source; delete stripped.savedAt; delete stripped.createdAt;
    return `Here is an existing event plan as JSON:
${JSON.stringify(stripped)}

Original brief:
${briefToText(plan.brief)}

Revise the plan according to this instruction: "${instruction}"

Keep everything not affected by the instruction consistent with the original. Return ONLY the full revised JSON object matching the same schema (same keys; budget.items must sum exactly to budget.total; include "brief" unchanged unless the instruction changes a core fact like budget or guests).`;
  }

  function ideasPrompt(plan, category) {
    return `Event brief:
${briefToText(plan.brief)}

Plan summary: ${plan.summary}

Generate 5 fresh, specific, personalized ideas for the category "${category}". They must be different from these existing ones: ${JSON.stringify((plan.ideas.find(i => i.category === category) || {}).items || [])}.
Return ONLY a JSON array of 5 strings.`;
  }

  function chatSystemPrompt(plan) {
    const compact = plan ? {
      title: plan.title, brief: plan.brief, summary: plan.summary,
      budget: plan.budget, timeline: plan.timeline.map(p => ({ phase: p.phase, daysBefore: p.daysBefore, tasks: p.tasks })),
      vendors: plan.vendors.map(v => ({ name: v.name, priority: v.priority, estimatedCost: v.estimatedCost })),
      ideas: plan.ideas, tips: plan.tips, risks: plan.risks,
      progress: plan.progress
    } : null;
    return `${systemPrompt()}

You are chatting with the organizer inside the PlanWise app. Be warm, practical and concise; use Markdown with short headings and bullet lists when helpful. When drafting messages (invitations, emails, toasts), produce ready-to-send text. Today is ${new Date().toISOString().slice(0, 10)}.
${compact ? `\nCURRENT PLAN CONTEXT (JSON):\n${JSON.stringify(compact)}` : '\nThe user has not created a plan yet; help them think through their event.'}`;
  }

  /* ---------- Transport ---------- */
  async function callGemini(settings, messages, { json = false, temperature = 0.7 } = {}) {
    const model = settings.model || PROVIDERS.gemini.defaultModel;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(settings.apiKey)}`;
    const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    const contents = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    const body = {
      contents,
      generationConfig: { temperature, maxOutputTokens: 8192, ...(json ? { responseMimeType: 'application/json' } : {}) }
    };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(await errorText(res));
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    if (!text) throw new Error('Gemini returned an empty response' + (data?.promptFeedback?.blockReason ? ` (blocked: ${data.promptFeedback.blockReason})` : ''));
    return text;
  }

  async function callOpenAICompat(settings, messages, { json = false, temperature = 0.7 } = {}) {
    const p = PROVIDERS[settings.provider];
    const base = (settings.provider === 'custom' ? settings.baseUrl : p.base).replace(/\/+$/, '');
    const model = settings.model || p.defaultModel;
    const headers = { 'Content-Type': 'application/json' };
    if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;
    if (settings.provider === 'openrouter') { headers['HTTP-Referer'] = location.origin; headers['X-Title'] = 'PlanWise AI'; }
    const body = { model, messages, temperature };
    if (json) body.response_format = { type: 'json_object' };
    let res = await fetch(`${base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok && json) {
      // Some endpoints reject response_format; retry without it.
      delete body.response_format;
      res = await fetch(`${base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) });
    }
    if (!res.ok) throw new Error(await errorText(res));
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || '';
    if (!text) throw new Error('Model returned an empty response');
    return text;
  }

  async function errorText(res) {
    let detail = '';
    try { const j = await res.json(); detail = j?.error?.message || j?.message || JSON.stringify(j).slice(0, 200); } catch (_) { detail = res.statusText; }
    return `HTTP ${res.status}: ${detail}`;
  }

  async function complete(messages, opts = {}) {
    const settings = opts.settings || loadSettings();
    if (!isConfigured(settings)) throw new Error('No AI provider configured');
    if (settings.provider === 'gemini') return callGemini(settings, messages, opts);
    return callOpenAICompat(settings, messages, opts);
  }

  /* ---------- Parsing & validation ---------- */
  function extractJSON(text) {
    let t = text.trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) t = fence[1].trim();
    const first = Math.min(...['{', '['].map(c => t.indexOf(c)).filter(i => i >= 0));
    if (Number.isFinite(first) && first > 0) t = t.slice(first);
    const lastObj = t.lastIndexOf('}'), lastArr = t.lastIndexOf(']');
    const last = Math.max(lastObj, lastArr);
    if (last >= 0) t = t.slice(0, last + 1);
    return JSON.parse(t);
  }

  function num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function str(v, d = '') { return typeof v === 'string' ? v : (v == null ? d : String(v)); }

  /** Coerce whatever the model returned into a safe, complete plan. */
  function normalizePlan(raw, brief) {
    const p = raw && typeof raw === 'object' ? raw : {};
    const total = num(p.budget?.total, num(brief.budget));
    let items = arr(p.budget?.items).map(i => ({ category: str(i.category, 'Other'), amount: Math.max(0, Math.round(num(i.amount))), notes: str(i.notes) })).filter(i => i.category);
    if (!items.length) items = global.SmartPlanner.generate(brief).budget.items;
    // Force items to sum to total — adjust the largest line (or contingency if present)
    const sum = items.reduce((s, i) => s + i.amount, 0);
    if (sum !== total && items.length) {
      const idx = items.findIndex(i => /contingency|buffer/i.test(i.category));
      const target = idx >= 0 ? idx : items.reduce((bi, it, i, a) => it.amount > a[bi].amount ? i : bi, 0);
      items[target].amount = Math.max(0, items[target].amount + (total - sum));
    }
    const guests = num(brief.guests, 1);
    const timeline = arr(p.timeline).map(t => ({ phase: str(t.phase, 'Phase'), daysBefore: Math.max(0, Math.round(num(t.daysBefore))), tasks: arr(t.tasks).map(x => str(x)).filter(Boolean) })).filter(t => t.tasks.length);
    timeline.sort((a, b) => b.daysBefore - a.daysBefore);
    const prio = v => ['high', 'medium', 'low'].includes(String(v).toLowerCase()) ? String(v).toLowerCase() : 'medium';
    const vendors = arr(p.vendors).map(v => ({
      name: str(v.name, 'Vendor'), icon: /^fa-[a-z0-9-]+$/.test(str(v.icon)) ? v.icon : 'fa-handshake',
      priority: prio(v.priority), estimatedCost: Math.max(0, Math.round(num(v.estimatedCost))),
      bookByDaysBefore: Math.max(0, Math.round(num(v.bookByDaysBefore))), why: str(v.why),
      questions: arr(v.questions).map(x => str(x)).filter(Boolean)
    }));
    const ideas = arr(p.ideas).map(i => ({ category: str(i.category, 'Ideas'), items: arr(i.items).map(x => str(x)).filter(Boolean) })).filter(i => i.items.length);
    const fb = (!timeline.length || !vendors.length || !ideas.length) ? global.SmartPlanner.generate(brief) : null;
    return {
      title: str(p.title, brief.name),
      tagline: str(p.tagline),
      summary: str(p.summary),
      budget: { total, currency: str(p.budget?.currency, brief.currency), perGuest: Math.round(total / Math.max(1, guests)), items },
      timeline: timeline.length ? timeline : fb.timeline,
      vendors: vendors.length ? vendors : fb.vendors,
      ideas: ideas.length ? ideas : fb.ideas,
      tips: arr(p.tips).map(x => str(x)).filter(Boolean),
      risks: arr(p.risks).map(r => ({ risk: str(r.risk), mitigation: str(r.mitigation) })).filter(r => r.risk)
    };
  }

  /* ---------- Public API ---------- */
  async function generatePlan(brief, onStatus = () => {}) {
    const settings = loadSettings();
    if (isConfigured(settings)) {
      onStatus(`Asking ${describe(settings)}…`);
      try {
        const text = await complete([{ role: 'system', content: systemPrompt() }, { role: 'user', content: planPrompt(brief) }], { json: true, temperature: 0.8 });
        onStatus('Structuring your plan…');
        const plan = normalizePlan(extractJSON(text), brief);
        return { plan, source: describe(settings), ai: true };
      } catch (err) {
        console.warn('AI generation failed:', err);
        if (!settings.fallback) throw err;
        onStatus('AI unavailable — using built-in Smart Planner');
        const plan = global.SmartPlanner.generate(brief);
        return { plan, source: 'Built-in Smart Planner (AI call failed: ' + err.message + ')', ai: false, error: err.message };
      }
    }
    onStatus('Building your plan with the Smart Planner…');
    await new Promise(r => setTimeout(r, 900));
    return { plan: global.SmartPlanner.generate(brief), source: 'Built-in Smart Planner (no AI key configured)', ai: false };
  }

  async function refinePlan(plan, instruction) {
    const text = await complete([{ role: 'system', content: systemPrompt() }, { role: 'user', content: refinePrompt(plan, instruction) }], { json: true, temperature: 0.7 });
    const raw = extractJSON(text);
    const brief = raw.brief && typeof raw.brief === 'object' ? { ...plan.brief, ...raw.brief } : plan.brief;
    return { plan: normalizePlan(raw, brief), brief };
  }

  async function regenerateIdeas(plan, category) {
    const text = await complete([{ role: 'system', content: systemPrompt() }, { role: 'user', content: ideasPrompt(plan, category) }], { json: false, temperature: 1.0 });
    const parsed = extractJSON(text);
    const list = Array.isArray(parsed) ? parsed : (parsed.items || parsed.ideas || []);
    return list.map(x => str(x)).filter(Boolean).slice(0, 6);
  }

  async function chat(history, plan) {
    const settings = loadSettings();
    if (!isConfigured(settings)) {
      await new Promise(r => setTimeout(r, 500));
      return global.SmartPlanner.chat(history.at(-1).content, plan);
    }
    const messages = [{ role: 'system', content: chatSystemPrompt(plan) }, ...history.slice(-12)];
    return complete(messages, { temperature: 0.8 });
  }

  async function testConnection(settings) {
    const text = await complete([{ role: 'user', content: 'Reply with exactly the word: ready' }], { settings, temperature: 0 });
    return text.trim().slice(0, 40);
  }

  global.AI = { PROVIDERS, loadSettings, saveSettings, isConfigured, describe, generatePlan, refinePlan, regenerateIdeas, chat, testConnection, normalizePlan };
})(window);
