/* =========================================================
   PlanWise AI — application controller
   ========================================================= */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const PLANS_KEY = 'planwise.plans';
  const CHART_COLORS = ['#b5473c', '#e0875a', '#2f6f6a', '#c9a24d', '#c2537a', '#5fa89f', '#e39b2d', '#8a6bbf', '#4a90b8', '#7a9e4e', '#b08968', '#6c757d'];

  const state = {
    view: 'landing',
    step: 1,
    brief: null,
    plan: null,        // current plan incl. brief, progress, meta
    chart: null,
    chatHistory: [],
    busy: false
  };

  /* ---------- Helpers ---------- */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n, cur) => {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur || 'USD', maximumFractionDigits: 0 }).format(n || 0); }
    catch (_) { return `${cur} ${Math.round(n || 0).toLocaleString()}`; }
  };
  const fmtDate = d => { const dt = new Date(d); return isNaN(dt) ? String(d) : dt.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }); };
  const shortDate = d => { const dt = new Date(d); return isNaN(dt) ? '' : dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
  const addDays = (date, days) => { const d = new Date(date); d.setDate(d.getDate() + days); return d; };
  const daysUntil = date => Math.round((new Date(date).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const md = text => (window.DOMPurify && window.marked) ? DOMPurify.sanitize(marked.parse(String(text || ''))) : esc(text);

  let toastTimer;
  function toast(msg, type = '') {
    const el = $('#toast');
    el.textContent = msg; el.className = 'toast ' + type; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  function showView(name) {
    state.view = name;
    $$('.view').forEach(v => { v.hidden = v.id !== name; });
    if (name !== 'dashboard') closeChat();
    $('#chat-fab').hidden = name !== 'dashboard' || !$('#chat-drawer').hidden;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- Provider pill ---------- */
  function refreshProviderPill() {
    const s = AI.loadSettings();
    const pill = $('#nav-settings');
    const ok = AI.isConfigured(s);
    pill.classList.toggle('ok', ok);
    pill.classList.toggle('local', !ok);
    $('#provider-label').textContent = ok ? `AI: ${AI.PROVIDERS[s.provider].label}` : 'AI: Smart Planner (set key)';
    $('#chat-provider').textContent = AI.describe(s);
  }

  /* ---------- Settings modal ---------- */
  function openSettings() {
    const s = AI.loadSettings();
    $('#s-provider').value = s.provider;
    $('#s-key').value = s.apiKey || '';
    $('#s-model').value = s.model || '';
    $('#s-base').value = s.baseUrl || '';
    $('#s-fallback').checked = s.fallback !== false;
    $('#s-test-result').textContent = '';
    syncSettingsForm();
    $('#settings-modal').showModal();
  }
  function syncSettingsForm() {
    const prov = $('#s-provider').value;
    const p = AI.PROVIDERS[prov];
    $('#s-key-field').hidden = prov === 'local';
    $('#s-model-field').hidden = prov === 'local';
    $('#s-base-field').hidden = prov !== 'custom';
    $('#s-key-help').textContent = p.help;
    $('#s-model').placeholder = p.defaultModel || 'model id';
    $('#model-list').innerHTML = p.models.map(m => `<option value="${esc(m)}">`).join('');
    $('#s-key').required = p.needsKey;
  }
  function readSettingsForm() {
    return {
      provider: $('#s-provider').value,
      apiKey: $('#s-key').value.trim(),
      model: $('#s-model').value.trim(),
      baseUrl: $('#s-base').value.trim(),
      fallback: $('#s-fallback').checked
    };
  }

  /* ---------- Wizard ---------- */
  const SAMPLE_BRIEFS = {
    wedding: { type: 'wedding', name: "Maya & Arjun's Wedding", honoree: 'Maya & Arjun', guests: 150, location: 'Austin, Texas', currency: 'USD', budget: 45000, vibe: ['Bohemian', 'Eco-friendly'], setting: 'Indoor + outdoor', timeOfDay: 'Evening', mustHaves: 'Live band, photo booth, Indian + Tex-Mex fusion menu', dietary: 'Vegetarian-friendly, nut allergy at table 3', notes: 'Fusion of Indian and Texan traditions; we met at a music festival.' },
    birthday: { type: 'birthday', name: "Leo's 7th Dinosaur Party", honoree: 'Leo (turning 7)', guests: 25, location: 'Manchester, UK', currency: 'GBP', budget: 900, vibe: ['Playful'], setting: 'Indoor', timeOfDay: 'Afternoon', mustHaves: 'Dinosaur cake, fossil dig activity', dietary: 'Two kids are gluten-free', notes: 'Leo loves T-Rex and volcanoes.' },
    community: { type: 'community', name: 'Riverside Spring Fair', honoree: 'Riverside Neighbourhood Association', guests: 800, location: 'Portland, Oregon', currency: 'USD', budget: 18000, vibe: ['Eco-friendly', 'Playful'], setting: 'Outdoor', timeOfDay: 'All day', mustHaves: 'Local food trucks, live music stage, kids zone', dietary: 'Vegan options required', notes: 'Fundraiser for a new community garden; 3 sponsors confirmed.' }
  };

  function setStep(n) {
    state.step = n;
    $$('.wstep').forEach(f => { f.hidden = Number(f.dataset.step) !== n; });
    $$('.stepper li').forEach(li => { const s = Number(li.dataset.step); li.classList.toggle('active', s === n); li.classList.toggle('done', s < n); });
    $('#w-back').hidden = n === 1;
    $('#w-next').hidden = n === 3;
    $('#w-generate').hidden = n !== 3;
    if (n === 3) renderReview();
  }

  function readBrief() {
    const f = $('#brief-form');
    const fd = new FormData(f);
    return {
      type: fd.get('type'), name: (fd.get('name') || '').trim(), honoree: (fd.get('honoree') || '').trim(),
      date: fd.get('date'), guests: Number(fd.get('guests')), location: (fd.get('location') || '').trim(),
      currency: fd.get('currency'), budget: Number(fd.get('budget')), vibe: fd.getAll('vibe'),
      setting: fd.get('setting'), timeOfDay: fd.get('timeOfDay'), mustHaves: (fd.get('mustHaves') || '').trim(),
      dietary: (fd.get('dietary') || '').trim(), notes: (fd.get('notes') || '').trim()
    };
  }

  function fillBrief(b) {
    const f = $('#brief-form');
    f.reset();
    $$('input[name="type"]', f).forEach(r => { r.checked = r.value === b.type; });
    $('#f-name').value = b.name || ''; $('#f-honoree').value = b.honoree || '';
    $('#f-date').value = b.date || defaultDate(b.type); $('#f-guests').value = b.guests || '';
    $('#f-location').value = b.location || ''; $('#f-currency').value = b.currency || 'USD';
    $('#f-budget').value = b.budget || ''; $('#f-setting').value = b.setting || 'Indoor';
    $('#f-time').value = b.timeOfDay || 'Evening'; $('#f-musthaves').value = b.mustHaves || '';
    $('#f-dietary').value = b.dietary || ''; $('#f-notes').value = b.notes || '';
    $$('input[name="vibe"]', f).forEach(c => { c.checked = (b.vibe || []).includes(c.value); });
    updateHonoreeLabel();
  }

  function defaultDate(type) {
    const months = { wedding: 10, birthday: 2, community: 4, other: 3 }[type] || 3;
    const d = new Date(); d.setMonth(d.getMonth() + months);
    return d.toISOString().slice(0, 10);
  }

  function updateHonoreeLabel() {
    const type = $('input[name="type"]:checked').value;
    $('#honoree-label').textContent = { wedding: 'The couple', birthday: 'Birthday person (and age)', community: 'Organizing group / cause', other: 'Who is it for?' }[type];
  }

  function validateStep1() {
    let ok = true;
    ['#f-name', '#f-date', '#f-guests', '#f-location', '#f-budget'].forEach(sel => {
      const el = $(sel); const valid = el.checkValidity() && el.value.trim() !== '';
      el.classList.toggle('invalid', !valid); if (!valid) ok = false;
    });
    if (ok && daysUntil($('#f-date').value) < 0) { $('#f-date').classList.add('invalid'); toast('Please choose a future date.', 'error'); ok = false; }
    return ok;
  }

  function renderReview() {
    const b = readBrief(); state.brief = b;
    const rows = [
      ['Type', b.type], ['Name', b.name], ['For', b.honoree || '—'], ['Date', `${fmtDate(b.date)} (${daysUntil(b.date)} days)`],
      ['Guests', b.guests], ['Location', b.location], ['Budget', money(b.budget, b.currency)], ['Vibe', b.vibe.join(', ') || '—'],
      ['Setting', `${b.setting} · ${b.timeOfDay}`], ['Must-haves', b.mustHaves || '—'], ['Dietary', b.dietary || '—'], ['Notes', b.notes || '—']
    ];
    $('#review-box').innerHTML = rows.map(([k, v]) => `<div><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('');
    const s = AI.loadSettings(); const ok = AI.isConfigured(s); const st = $('#ai-status');
    st.className = 'ai-status' + (ok ? '' : ' warn');
    st.innerHTML = ok
      ? `<i class="fa-solid fa-robot"></i><div>Your plan will be generated by <strong>${esc(AI.describe(s))}</strong> — fully personalized to this brief.</div>`
      : `<i class="fa-solid fa-triangle-exclamation"></i><div>No Generative AI key is configured, so the <strong>built-in Smart Planner</strong> (template-based) will create your plan. For a bespoke, AI-written plan, <button type="button" class="link" id="review-open-settings">add a free Gemini or Groq key</button> first.</div>`;
    $('#review-open-settings')?.addEventListener('click', openSettings);
  }

  /* ---------- Generation ---------- */
  const LOADING_MSGS = ['Analyzing your brief', 'Balancing the budget', 'Sequencing the timeline', 'Shortlisting vendors', 'Dreaming up personalized ideas', 'Checking for risks', 'Polishing the plan'];
  let loadingTimer;
  function startLoading(title) {
    $('#loading-title').textContent = title || 'Generating your plan…';
    $('#loading-provider').textContent = AI.describe();
    let i = 0; $('#loading-msg').textContent = LOADING_MSGS[0];
    clearInterval(loadingTimer);
    loadingTimer = setInterval(() => { i = (i + 1) % LOADING_MSGS.length; $('#loading-msg').textContent = LOADING_MSGS[i]; }, 1800);
    showView('loading');
  }
  function stopLoading() { clearInterval(loadingTimer); }

  async function generate(brief) {
    if (state.busy) return; state.busy = true;
    startLoading('Generating your plan…');
    try {
      const { plan, source, ai, error } = await AI.generatePlan(brief, msg => { $('#loading-msg').textContent = msg; });
      state.plan = { id: uid(), createdAt: new Date().toISOString(), brief, source, ai, ...plan, progress: { tasks: {}, vendors: {} } };
      state.chatHistory = [];
      renderPlan();
      showView('dashboard');
      if (error) toast('AI call failed — showing Smart Planner plan. Check AI settings.', 'error');
      else toast(ai ? 'Plan generated with Generative AI ✨' : 'Plan generated with the built-in Smart Planner');
    } catch (err) {
      console.error(err);
      toast('Generation failed: ' + err.message, 'error');
      showView('wizard'); setStep(3);
    } finally { stopLoading(); state.busy = false; }
  }

  async function refine(instruction) {
    if (!state.plan || state.busy) return;
    if (!AI.isConfigured()) { toast('Refining requires a Generative AI provider — add a key in AI settings.', 'error'); openSettings(); return; }
    state.busy = true; startLoading('Refining your plan…');
    try {
      const { plan, brief } = await AI.refinePlan(state.plan, instruction);
      const prev = state.plan;
      state.plan = { ...prev, ...plan, brief, source: AI.describe() + ' (refined)', ai: true, progress: carryProgress(prev, plan) };
      state.plan.refinements = [...(prev.refinements || []), instruction];
      renderPlan(); showView('dashboard'); toast('Plan refined ✨');
    } catch (err) {
      console.error(err); toast('Refine failed: ' + err.message, 'error'); showView('dashboard');
    } finally { stopLoading(); state.busy = false; }
  }

  function carryProgress(prev, next) {
    const tasks = {}, vendors = {};
    next.timeline.forEach((p, pi) => p.tasks.forEach((t, ti) => { if (prev.progress?.tasks?.[taskKey(t)]) tasks[taskKey(t)] = true; }));
    next.vendors.forEach(v => { if (prev.progress?.vendors?.[v.name]) vendors[v.name] = true; });
    return { tasks, vendors };
  }
  const taskKey = t => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 80);

  /* ---------- Rendering ---------- */
  function renderPlan() {
    const p = state.plan; if (!p) return;
    const b = p.brief;
    const badge = $('#plan-type-badge');
    badge.textContent = b.type === 'other' ? 'Event' : b.type;
    badge.className = 'plan-type-badge ' + b.type;
    $('#plan-title').textContent = p.title;
    $('#plan-tagline').textContent = p.tagline || '';
    $('#plan-meta').innerHTML = [
      `<li><i class="fa-regular fa-calendar"></i>${esc(fmtDate(b.date))}</li>`,
      `<li><i class="fa-solid fa-user-group"></i>${esc(b.guests)} guests</li>`,
      `<li><i class="fa-solid fa-location-dot"></i>${esc(b.location)}</li>`,
      `<li><i class="fa-solid fa-coins"></i>${esc(money(p.budget.total, p.budget.currency))}</li>`,
      b.vibe?.length ? `<li><i class="fa-solid fa-palette"></i>${esc(b.vibe.join(', '))}</li>` : ''
    ].join('');
    const src = $('#plan-source');
    src.textContent = (p.ai ? '✨ Generated by ' : '⚙️ Generated by ') + p.source + (p.refinements?.length ? ` · ${p.refinements.length} refinement${p.refinements.length > 1 ? 's' : ''}` : '');
    src.className = 'source-note' + (p.ai ? '' : ' local');
    renderOverview(); renderBudget(); renderTimeline(); renderVendors(); renderIdeas();
    document.title = `${p.title} — PlanWise AI`;
  }

  function stats() {
    const p = state.plan;
    const allTasks = p.timeline.flatMap(ph => ph.tasks);
    const doneTasks = allTasks.filter(t => p.progress.tasks[taskKey(t)]).length;
    const booked = p.vendors.filter(v => p.progress.vendors[v.name]).length;
    const allocated = p.budget.items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    return { allTasks: allTasks.length, doneTasks, booked, allocated };
  }

  function renderOverview() {
    const p = state.plan; const s = stats(); const cur = p.budget.currency;
    $('#ov-summary').textContent = p.summary;
    $('#ov-budget').textContent = money(p.budget.total, cur);
    const pct = p.budget.total ? Math.round(s.allocated / p.budget.total * 100) : 0;
    const bar = $('#ov-budget-bar'); bar.style.width = Math.min(100, pct) + '%'; bar.classList.toggle('over', pct > 100);
    $('#ov-budget-note').textContent = `${money(s.allocated, cur)} allocated (${pct}%) · ~${money(p.budget.perGuest, cur)} per guest`;
    const d = daysUntil(p.brief.date);
    $('#ov-countdown').textContent = d > 0 ? `${d} days` : d === 0 ? 'Today!' : `${Math.abs(d)} days ago`;
    $('#ov-date').textContent = fmtDate(p.brief.date);
    $('#ov-tasks').textContent = `${s.doneTasks} / ${s.allTasks}`;
    $('#ov-tasks-bar').style.width = (s.allTasks ? s.doneTasks / s.allTasks * 100 : 0) + '%';
    $('#ov-tasks-note').textContent = s.allTasks ? `${Math.round(s.doneTasks / s.allTasks * 100)}% complete` : '';
    $('#ov-vendors').textContent = `${s.booked} / ${p.vendors.length}`;
    $('#ov-vendors-bar').style.width = (p.vendors.length ? s.booked / p.vendors.length * 100 : 0) + '%';
    $('#ov-vendors-note').textContent = `${p.vendors.filter(v => v.priority === 'high' && !p.progress.vendors[v.name]).length} high-priority still open`;

    // Up next: first 5 incomplete tasks ordered by due date
    const next = p.timeline.flatMap(ph => ph.tasks.map(t => ({ t, due: addDays(p.brief.date, -ph.daysBefore) }))).filter(x => !p.progress.tasks[taskKey(x.t)]).slice(0, 5);
    $('#ov-next').innerHTML = next.length ? next.map(x => `<li><i class="fa-regular fa-circle"></i><span>${esc(x.t)}</span><span class="due">${esc(shortDate(x.due))}</span></li>`).join('') : '<li><i class="fa-solid fa-check"></i>All tasks complete — amazing!</li>';
    $('#ov-tips').innerHTML = (p.tips || []).map(t => `<li><i class="fa-solid fa-star"></i><span>${esc(t)}</span></li>`).join('') || '<li>—</li>';
    $('#ov-risks').innerHTML = (p.risks || []).map(r => `<li><strong>${esc(r.risk)}</strong><span>${esc(r.mitigation)}</span></li>`).join('') || '<li>—</li>';
  }

  function renderBudget() {
    const p = state.plan; const cur = p.budget.currency; const total = p.budget.total;
    const tbody = $('#budget-table tbody');
    tbody.innerHTML = p.budget.items.map((i, idx) => `
      <tr data-idx="${idx}">
        <td><span class="swatch" style="background:${CHART_COLORS[idx % CHART_COLORS.length]}"></span><input type="text" class="cat" value="${esc(i.category)}" aria-label="Category"></td>
        <td><input type="number" class="amount" min="0" step="10" value="${Number(i.amount) || 0}" aria-label="Amount"></td>
        <td class="pct">${total ? (i.amount / total * 100).toFixed(1) : 0}%</td>
        <td class="notes"><input type="text" class="note" value="${esc(i.notes || '')}" placeholder="notes" aria-label="Notes"></td>
        <td><button type="button" class="icon-btn del" aria-label="Remove line"><i class="fa-solid fa-trash-can"></i></button></td>
      </tr>`).join('');
    const s = stats();
    $('#b-allocated').textContent = money(s.allocated, cur);
    $('#b-target').textContent = money(total, cur);
    const diff = total - s.allocated; const de = $('#b-diff');
    de.textContent = (diff >= 0 ? '' : '−') + money(Math.abs(diff), cur) + (diff >= 0 ? ' unallocated' : ' over');
    de.className = diff < 0 ? 'over' : (diff > 0 ? 'under' : '');
    renderChart();
  }

  function renderChart() {
    const p = state.plan; const canvas = $('#budget-chart');
    if (!window.Chart) return;
    const labels = p.budget.items.map(i => i.category);
    const data = p.budget.items.map(i => Number(i.amount) || 0);
    if (state.chart) state.chart.destroy();
    state.chart = new Chart(canvas, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]), borderWidth: 2, borderColor: '#fff' }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '58%',
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 }, padding: 10 } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${money(ctx.parsed, p.budget.currency)} (${p.budget.total ? (ctx.parsed / p.budget.total * 100).toFixed(1) : 0}%)` } }
        }
      }
    });
  }

  function renderTimeline() {
    const p = state.plan; const today = new Date().setHours(0, 0, 0, 0);
    $('#timeline-list').innerHTML = p.timeline.map((ph, pi) => {
      const due = addDays(p.brief.date, -ph.daysBefore);
      const done = ph.tasks.filter(t => p.progress.tasks[taskKey(t)]).length;
      const allDone = done === ph.tasks.length && ph.tasks.length > 0;
      const overdue = due < today && !allDone;
      return `<li class="phase ${allDone ? 'done' : ''} ${due < today ? 'past' : ''}">
        <div class="phase-head">
          <h3>${esc(ph.phase)}</h3>
          <span class="when ${overdue ? 'overdue' : ''}"><i class="fa-regular fa-clock"></i> ${ph.daysBefore === 0 ? 'Event day' : `${ph.daysBefore} days before`} · by ${esc(fmtDate(due))}${overdue ? ' · overdue' : ''}</span>
          <span class="pct">${done}/${ph.tasks.length} done</span>
        </div>
        <ul class="tasks">${ph.tasks.map(t => { const k = taskKey(t); const c = !!p.progress.tasks[k]; return `<li><label class="task ${c ? 'done' : ''}"><input type="checkbox" data-task="${esc(k)}" ${c ? 'checked' : ''}><span>${esc(t)}</span></label></li>`; }).join('')}</ul>
      </li>`;
    }).join('');
  }

  function renderVendors() {
    const p = state.plan; const filter = $('#v-filter').value; const cur = p.budget.currency;
    const list = p.vendors.filter(v => {
      const booked = !!p.progress.vendors[v.name];
      if (filter === 'open') return !booked; if (filter === 'booked') return booked; if (filter === 'high') return v.priority === 'high'; return true;
    });
    $('#vendor-grid').innerHTML = list.length ? list.map(v => {
      const booked = !!p.progress.vendors[v.name];
      const by = addDays(p.brief.date, -v.bookByDaysBefore);
      return `<article class="card vendor ${booked ? 'booked' : ''}">
        <div class="vendor-top">
          <span class="v-icon"><i class="fa-solid ${esc(v.icon || 'fa-handshake')}"></i></span>
          <div><h3>${esc(v.name)}</h3><div class="v-cost">est. ${esc(money(v.estimatedCost, cur))}</div></div>
          <span class="prio ${esc(v.priority)}">${esc(v.priority)}</span>
        </div>
        <p>${esc(v.why)}</p>
        <div class="v-when"><i class="fa-regular fa-calendar-check"></i> Book by ${esc(fmtDate(by))}</div>
        ${v.questions?.length ? `<details><summary>Questions to ask (${v.questions.length})</summary><ul>${v.questions.map(q => `<li>${esc(q)}</li>`).join('')}</ul></details>` : ''}
        <div class="v-foot">
          <label><input type="checkbox" data-vendor="${esc(v.name)}" ${booked ? 'checked' : ''}> ${booked ? 'Booked ✓' : 'Mark as booked'}</label>
          <button type="button" class="btn btn-sm btn-ghost ask-ai" data-ask="Help me find and evaluate a ${esc(v.name)} in ${esc(p.brief.location)} for this event. Draft a short inquiry email I can send."><i class="fa-solid fa-wand-magic-sparkles"></i> Ask AI</button>
        </div>
      </article>`;
    }).join('') : '<p class="muted">No vendors match this filter.</p>';
  }

  function renderIdeas() {
    const p = state.plan; const canAI = AI.isConfigured();
    $('#ideas-grid').innerHTML = p.ideas.map((g, i) => `
      <article class="card idea-card">
        <div class="card-head"><h3><i class="fa-solid fa-lightbulb"></i> ${esc(g.category)}</h3>
          <button type="button" class="btn btn-sm btn-ghost regen" data-cat="${esc(g.category)}" title="${canAI ? 'Ask the AI for fresh ideas' : 'Requires an AI provider'}"><i class="fa-solid fa-rotate"></i> Regenerate</button></div>
        <ul>${g.items.map(it => `<li>${esc(it)}</li>`).join('')}</ul>
      </article>`).join('');
  }

  /* ---------- Saved plans ---------- */
  function loadPlans() { try { return JSON.parse(localStorage.getItem(PLANS_KEY) || '[]'); } catch (_) { return []; } }
  function storePlans(list) { localStorage.setItem(PLANS_KEY, JSON.stringify(list)); refreshPlansCount(); }
  function refreshPlansCount() { const n = loadPlans().length; const b = $('#plans-count'); b.textContent = n; b.hidden = n === 0; }
  function savePlan(silent) {
    if (!state.plan) return;
    const list = loadPlans(); const idx = list.findIndex(p => p.id === state.plan.id);
    state.plan.savedAt = new Date().toISOString();
    const copy = JSON.parse(JSON.stringify(state.plan));
    if (idx >= 0) list[idx] = copy; else list.unshift(copy);
    storePlans(list);
    if (!silent) toast('Plan saved locally');
  }
  function renderPlans() {
    const list = loadPlans(); const grid = $('#plans-grid');
    $('#plans-empty').hidden = list.length > 0;
    grid.innerHTML = list.map(p => {
      const all = p.timeline.flatMap(t => t.tasks); const done = all.filter(t => p.progress?.tasks?.[taskKey(t)]).length;
      const d = daysUntil(p.brief.date);
      return `<article class="card plan-card" data-id="${esc(p.id)}" tabindex="0" role="button">
        <span class="plan-type-badge ${esc(p.brief.type)}">${esc(p.brief.type === 'other' ? 'Event' : p.brief.type)}</span>
        <h3>${esc(p.title)}</h3>
        <ul class="meta"><li><i class="fa-regular fa-calendar"></i>${esc(fmtDate(p.brief.date))}</li><li><i class="fa-solid fa-user-group"></i>${esc(p.brief.guests)}</li><li><i class="fa-solid fa-coins"></i>${esc(money(p.budget.total, p.budget.currency))}</li></ul>
        <div class="progress"><div style="width:${all.length ? done / all.length * 100 : 0}%"></div></div>
        <small>${done}/${all.length} tasks · ${d >= 0 ? d + ' days to go' : 'past event'} · ${p.ai ? '✨ AI' : '⚙️ Smart Planner'}</small>
        <div class="plan-card-foot"><small>Saved ${esc(new Date(p.savedAt).toLocaleDateString())}</small><button type="button" class="btn btn-sm btn-danger del-plan" data-id="${esc(p.id)}"><i class="fa-solid fa-trash-can"></i></button></div>
      </article>`;
    }).join('');
  }
  function openPlan(id) {
    const p = loadPlans().find(x => x.id === id); if (!p) return;
    state.plan = p; state.chatHistory = []; renderPlan(); showView('dashboard');
  }

  /* ---------- Export ---------- */
  function toMarkdown(p) {
    const cur = p.budget.currency; const b = p.brief;
    const lines = [`# ${p.title}`, p.tagline ? `_${p.tagline}_` : '', '', `**${b.type}** · ${fmtDate(b.date)} · ${b.guests} guests · ${b.location} · ${money(p.budget.total, cur)}`, '', `> ${p.summary}`, '',
      '## Budget', '| Category | Amount | Notes |', '|---|---:|---|', ...p.budget.items.map(i => `| ${i.category} | ${money(i.amount, cur)} | ${i.notes || ''} |`), `| **Total** | **${money(p.budget.items.reduce((s, i) => s + Number(i.amount || 0), 0), cur)}** | |`, '',
      '## Timeline', ...p.timeline.flatMap(ph => [`### ${ph.phase} — by ${fmtDate(addDays(b.date, -ph.daysBefore))}`, ...ph.tasks.map(t => `- [${p.progress.tasks[taskKey(t)] ? 'x' : ' '}] ${t}`), '']),
      '## Vendor checklist', ...p.vendors.flatMap(v => [`### ${p.progress.vendors[v.name] ? '✅ ' : ''}${v.name} (${v.priority}) — est. ${money(v.estimatedCost, cur)}, book by ${fmtDate(addDays(b.date, -v.bookByDaysBefore))}`, v.why, ...(v.questions || []).map(q => `- ${q}`), '']),
      '## Personalized ideas', ...p.ideas.flatMap(g => [`### ${g.category}`, ...g.items.map(i => `- ${i}`), '']),
      '## Tips', ...(p.tips || []).map(t => `- ${t}`), '', '## Risks', ...(p.risks || []).map(r => `- **${r.risk}** — ${r.mitigation}`), '', `_Generated by PlanWise AI (${p.source})_`];
    return lines.join('\n');
  }
  function download(name, content, type) {
    const blob = new Blob([content], { type }); const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ---------- Chat ---------- */
  function openChat() { $('#chat-drawer').hidden = false; $('#drawer-scrim').hidden = false; $('#chat-fab').hidden = true; if (!$('#chat-log').children.length) greet(); setTimeout(() => $('#chat-input').focus(), 50); }
  function closeChat() { $('#chat-drawer').hidden = true; $('#drawer-scrim').hidden = true; $('#chat-fab').hidden = state.view !== 'dashboard'; }
  function greet() {
    const p = state.plan; const ai = AI.isConfigured();
    appendMsg('ai', `Hi! I'm your PlanWise assistant${p ? ` for **${p.title}**` : ''}. ${ai ? 'I have your full plan in context — ask me to draft invitations, vendor emails, a run-of-show, budget cuts, or anything else.' : 'I\'m in offline Smart Planner mode (basic answers). Add a free AI key via the **AI** button for full conversational help.'}`);
  }
  function appendMsg(role, text, extraClass = '') {
    const log = $('#chat-log'); const el = document.createElement('div');
    el.className = `msg ${role} ${extraClass}`;
    el.innerHTML = role === 'ai' ? md(text) : esc(text);
    log.appendChild(el); log.scrollTop = log.scrollHeight; return el;
  }
  async function sendChat(text) {
    text = (text || '').trim(); if (!text || state.chatBusy) return;
    state.chatBusy = true; $('#chat-send').disabled = true;
    appendMsg('user', text); state.chatHistory.push({ role: 'user', content: text });
    const typing = appendMsg('ai', '<span></span><span></span><span></span>', 'typing'); typing.innerHTML = '<span></span><span></span><span></span>';
    try {
      const reply = await AI.chat(state.chatHistory, state.plan);
      typing.remove(); appendMsg('ai', reply); state.chatHistory.push({ role: 'assistant', content: reply });
    } catch (err) {
      typing.remove(); appendMsg('ai', `Sorry — the AI request failed: ${err.message}. Check your AI settings.`, 'error');
    } finally { state.chatBusy = false; $('#chat-send').disabled = false; $('#chat-input').value = ''; autoGrow($('#chat-input')); }
  }
  function autoGrow(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; }

  /* ---------- Events ---------- */
  function bind() {
    // Nav
    $('#brand-link').addEventListener('click', e => { e.preventDefault(); showView('landing'); });
    $('#nav-new').addEventListener('click', () => startWizard());
    $('#hero-start').addEventListener('click', () => startWizard());
    $$('.type-card').forEach(c => c.addEventListener('click', () => startWizard(c.dataset.type)));
    $('#hero-demo').addEventListener('click', () => { const b = { ...SAMPLE_BRIEFS.wedding, date: defaultDate('wedding') }; fillBrief(b); state.brief = readBrief(); generate(state.brief); });
    $('#nav-plans').addEventListener('click', () => { renderPlans(); showView('plans'); });
    $('#plans-new').addEventListener('click', () => startWizard());
    $('#nav-settings').addEventListener('click', openSettings);

    // Settings
    $('#s-provider').addEventListener('change', syncSettingsForm);
    $('#settings-close').addEventListener('click', () => $('#settings-modal').close());
    $('#settings-cancel').addEventListener('click', () => $('#settings-modal').close());
    $('#s-key-toggle').addEventListener('click', () => { const i = $('#s-key'); i.type = i.type === 'password' ? 'text' : 'password'; });
    $('#s-test').addEventListener('click', async () => {
      const s = readSettingsForm(); const out = $('#s-test-result');
      if (!AI.isConfigured(s)) { out.innerHTML = '<span class="bad">Enter a key (and base URL for custom) first.</span>'; return; }
      out.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Testing…';
      try { const r = await AI.testConnection(s); out.innerHTML = `<span class="ok"><i class="fa-solid fa-check"></i> Connected — model replied “${esc(r)}”</span>`; }
      catch (err) { out.innerHTML = `<span class="bad"><i class="fa-solid fa-xmark"></i> ${esc(err.message)}</span>`; }
    });
    $('#settings-form').addEventListener('submit', () => { AI.saveSettings(readSettingsForm()); refreshProviderPill(); toast('AI settings saved'); if (state.view === 'wizard' && state.step === 3) renderReview(); if (state.plan) renderIdeas(); });

    // Wizard
    $$('input[name="type"]').forEach(r => r.addEventListener('change', updateHonoreeLabel));
    $('#w-next').addEventListener('click', () => { if (state.step === 1 && !validateStep1()) { toast('Please complete the required fields.', 'error'); return; } setStep(state.step + 1); });
    $('#w-back').addEventListener('click', () => setStep(state.step - 1));
    $('#brief-form').addEventListener('submit', e => { e.preventDefault(); if (!validateStep1()) { setStep(1); return; } state.brief = readBrief(); generate(state.brief); });
    $('#brief-form').addEventListener('input', e => { if (e.target.classList.contains('invalid') && e.target.checkValidity()) e.target.classList.remove('invalid'); });

    // Dashboard tabs
    $$('.tab').forEach(t => t.addEventListener('click', () => {
      $$('.tab').forEach(x => { x.classList.toggle('active', x === t); x.setAttribute('aria-selected', x === t); });
      $$('.tabpanel').forEach(p => { p.hidden = p.id !== 'tab-' + t.dataset.tab; });
      if (t.dataset.tab === 'budget') setTimeout(renderChart, 30);
    }));

    // Plan actions
    $('#act-save').addEventListener('click', () => savePlan());
    $('#act-refine').addEventListener('click', () => { $('#refine-text').value = ''; $('#refine-modal').showModal(); });
    $('#refine-close').addEventListener('click', () => $('#refine-modal').close());
    $('#refine-cancel').addEventListener('click', () => $('#refine-modal').close());
    $$('#refine-modal [data-fill]').forEach(b => b.addEventListener('click', () => { $('#refine-text').value = b.dataset.fill; }));
    $('#refine-form').addEventListener('submit', e => { const t = $('#refine-text').value.trim(); if (!t) { e.preventDefault(); return; } refine(t); });
    $('#act-export').addEventListener('click', e => { e.stopPropagation(); $('#export-menu').hidden = !$('#export-menu').hidden; });
    document.addEventListener('click', () => { $('#export-menu').hidden = true; });
    $$('#export-menu button').forEach(b => b.addEventListener('click', () => {
      const p = state.plan; if (!p) return; const base = p.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      if (b.dataset.export === 'print') { $$('.tabpanel').forEach(x => { x.hidden = false; }); renderChart(); setTimeout(() => { window.print(); $$('.tabpanel').forEach(x => { x.hidden = !x.classList.contains('active'); }); $$('.tab').forEach(t => { if (t.classList.contains('active')) $('#tab-' + t.dataset.tab).hidden = false; }); }, 200); }
      else if (b.dataset.export === 'markdown') { navigator.clipboard.writeText(toMarkdown(p)).then(() => toast('Markdown copied to clipboard')).catch(() => download(base + '.md', toMarkdown(p), 'text/markdown')); }
      else if (b.dataset.export === 'json') { download(base + '.json', JSON.stringify(p, null, 2), 'application/json'); }
    }));

    // Budget editing
    $('#budget-table').addEventListener('input', e => {
      const tr = e.target.closest('tr'); if (!tr) return; const i = Number(tr.dataset.idx); const item = state.plan.budget.items[i]; if (!item) return;
      if (e.target.classList.contains('amount')) { item.amount = Math.max(0, Number(e.target.value) || 0); updateBudgetTotals(); }
      else if (e.target.classList.contains('cat')) item.category = e.target.value;
      else if (e.target.classList.contains('note')) item.notes = e.target.value;
    });
    $('#budget-table').addEventListener('change', e => { if (e.target.classList.contains('amount')) renderBudget(); });
    $('#budget-table').addEventListener('click', e => { const d = e.target.closest('.del'); if (!d) return; const i = Number(d.closest('tr').dataset.idx); state.plan.budget.items.splice(i, 1); renderBudget(); renderOverview(); });
    $('#b-add').addEventListener('click', () => { state.plan.budget.items.push({ category: 'New line', amount: 0, notes: '' }); renderBudget(); $('#budget-table tbody tr:last-child .cat')?.focus(); });

    // Timeline ticks
    $('#timeline-list').addEventListener('change', e => { const k = e.target.dataset.task; if (!k) return; state.plan.progress.tasks[k] = e.target.checked; renderTimeline(); renderOverview(); savePlan(true); });
    $('#t-reset').addEventListener('click', () => { state.plan.progress.tasks = {}; renderTimeline(); renderOverview(); savePlan(true); });

    // Vendors
    $('#vendor-grid').addEventListener('change', e => { const v = e.target.dataset.vendor; if (!v) return; state.plan.progress.vendors[v] = e.target.checked; renderVendors(); renderOverview(); savePlan(true); });
    $('#vendor-grid').addEventListener('click', e => { const b = e.target.closest('.ask-ai'); if (!b) return; openChat(); sendChat(b.dataset.ask); });
    $('#v-filter').addEventListener('change', renderVendors);

    // Ideas regenerate
    $('#ideas-grid').addEventListener('click', async e => {
      const b = e.target.closest('.regen'); if (!b) return;
      if (!AI.isConfigured()) { toast('Regenerating ideas requires a Generative AI provider.', 'error'); openSettings(); return; }
      const cat = b.dataset.cat; b.disabled = true; b.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Thinking…';
      try { const items = await AI.regenerateIdeas(state.plan, cat); const g = state.plan.ideas.find(x => x.category === cat); if (g && items.length) { g.items = items; renderIdeas(); toast('Fresh ideas generated ✨'); } else throw new Error('No ideas returned'); }
      catch (err) { toast('Could not regenerate: ' + err.message, 'error'); renderIdeas(); }
    });

    // Saved plans
    $('#plans-grid').addEventListener('click', e => {
      const del = e.target.closest('.del-plan');
      if (del) { e.stopPropagation(); if (confirm('Delete this plan?')) { storePlans(loadPlans().filter(p => p.id !== del.dataset.id)); renderPlans(); } return; }
      const card = e.target.closest('.plan-card'); if (card) openPlan(card.dataset.id);
    });
    $('#plans-grid').addEventListener('keydown', e => { if (e.key === 'Enter') { const c = e.target.closest('.plan-card'); if (c) openPlan(c.dataset.id); } });

    // Chat
    $('#chat-fab').addEventListener('click', openChat);
    $('#chat-close').addEventListener('click', closeChat);
    $('#drawer-scrim').addEventListener('click', closeChat);
    $('#chat-form').addEventListener('submit', e => { e.preventDefault(); sendChat($('#chat-input').value); });
    $('#chat-input').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(e.target.value); } });
    $('#chat-input').addEventListener('input', e => autoGrow(e.target));
    $$('#quick-prompts button').forEach(b => b.addEventListener('click', () => sendChat(b.dataset.prompt)));
  }

  function updateBudgetTotals() {
    const p = state.plan; const s = stats(); const cur = p.budget.currency;
    $('#b-allocated').textContent = money(s.allocated, cur);
    const diff = p.budget.total - s.allocated; const de = $('#b-diff');
    de.textContent = (diff >= 0 ? '' : '−') + money(Math.abs(diff), cur) + (diff >= 0 ? ' unallocated' : ' over');
    de.className = diff < 0 ? 'over' : (diff > 0 ? 'under' : '');
    $$('#budget-table tbody tr').forEach((tr, i) => { tr.querySelector('.pct').textContent = (p.budget.total ? (p.budget.items[i].amount / p.budget.total * 100).toFixed(1) : 0) + '%'; });
  }

  function startWizard(type) {
    const sample = type ? SAMPLE_BRIEFS[type] : null;
    fillBrief(sample ? { type, date: defaultDate(type), currency: sample.currency } : { type: 'wedding', date: defaultDate('wedding'), currency: 'USD' });
    if (type) $$('input[name="type"]').forEach(r => { r.checked = r.value === type; });
    updateHonoreeLabel();
    setStep(1); showView('wizard');
    // Offer sample fill as placeholder hints
    if (sample) { $('#f-name').placeholder = sample.name; $('#f-location').placeholder = sample.location; $('#f-guests').placeholder = sample.guests; $('#f-budget').placeholder = sample.budget; }
  }

  /* ---------- Init ---------- */
  function init() {
    bind(); refreshProviderPill(); refreshPlansCount();
    $('#f-date').min = new Date().toISOString().slice(0, 10);
    const params = new URLSearchParams(location.search);
    if (params.get('demo')) { const t = SAMPLE_BRIEFS[params.get('demo')] ? params.get('demo') : 'wedding'; fillBrief({ ...SAMPLE_BRIEFS[t], date: defaultDate(t) }); state.brief = readBrief(); generate(state.brief); }
    else if (params.get('plan')) openPlan(params.get('plan'));
    else showView('landing');
  }
  document.addEventListener('DOMContentLoaded', init);
})();
