// server.js  (ESM, Render-friendly)
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import rateLimit from 'express-rate-limit';
import puppeteer from 'puppeteer';
import OpenAI from 'openai';

// ---------- basic setup
const app = express();
const __root = process.cwd();
const PORT = process.env.PORT || 3100;

// ---------- middleware
app.use(cors({ origin: '*'}));
app.use(express.json({ limit: '2mb' }));
app.use(rateLimit({ windowMs: 60_000, limit: 120 }));

// ---------- quick health
app.get('/api/health', (_req, res) =>
  res.json({ ok: true, port: PORT, hasKey: !!process.env.OPENAI_API_KEY })
);

// ---------- static files
// serve all files from project root (index.html, *.html, assets/, data/, etc.)
app.use(express.static(__root));
app.use('/public', express.static(path.join(__root, 'public')));
app.use('/data', express.static(path.join(__root, 'data')));

// ---------- plan preview (reads data/plan.json)
app.get('/api/plan', (_req, res) => {
  try {
    const planPath = path.join(__root, 'data', 'plan.json');
    const json = JSON.parse(fs.readFileSync(planPath, 'utf-8'));
    res.json(json);
  } catch {
    res.status(500).json({ error: 'plan.json not found/invalid' });
  }
});

// ---------- helper: build PDF HTML
function buildPlanHtml(plan) {
  const INR = (n) => '₹' + Number(n).toLocaleString('en-IN');
  const sum = plan.summary || {};
  const rows = (plan.funds || [])
    .map(
      (f, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${f.scheme}</strong><div class="sub">${f.category || ''}</div></td>
        <td>${f.allocation_pct || 0}%</td>
        <td>${f.why || ''}</td>
        <td>${f.nav || '-'}</td>
        <td>${f.cagr_1y || '-'}</td>
        <td>${f.cagr_3y || '-'}</td>
        <td>${f.cagr_5y || '-'}</td>
        <td>${f.aum_cr || '-'}</td>
        <td>${f.expense || '-'}</td>
        <td>${f.riskometer || '-'}</td>
      </tr>`
    )
    .join('');

  return `
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Blue Sparrow Plan</title>
      <style>
        body{font-family: ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto; color:#0f172a; margin:16px;}
        .muted{color:#64748b}
        .title{font-weight:800; font-size:22px}
        .grid{display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin:12px 0}
        .card{border:1px solid #e2e8f0; border-radius:12px; padding:10px}
        .k{font-size:12px; color:#64748b}
        .v{font-size:16px; font-weight:700}
        table{width:100%; border-collapse:collapse; margin-top:14px; font-size:12px}
        th,td{border:1px solid #e2e8f0; padding:6px 8px; vertical-align:top}
        th{background:#f8fafc; text-align:left}
        .sub{color:#64748b; font-size:11px; margin-top:2px}
        .footer{margin-top:16px; font-size:11px; color:#64748b}
        .brand{display:flex; align-items:center; justify-content:space-between; margin-bottom:8px}
        .mix{font-size:13px}
        .badge{display:inline-block; padding:2px 8px; border-radius:9999px; background:#eef2ff; color:#1e40af; font-size:11px}
      </style>
    </head>
    <body>
      <div class="brand">
        <div>
          <div class="title">Blue Sparrow Capital — Plan Summary</div>
          <div class="muted">${sum.title || ''}</div>
        </div>
        <div class="badge">Shareable PDF</div>
      </div>

      <div class="grid">
        <div class="card"><div class="k">Corpus</div><div class="v">${INR(sum.corpus_inr || 0)}</div></div>
        <div class="card"><div class="k">Monthly SWP</div><div class="v">${INR(sum.monthly_swp_inr || 0)}</div></div>
        <div class="card"><div class="k">Mix</div><div class="v mix">${sum.equity_pct || 0}% Eq • ${sum.stability_pct || 0}% Stab • ${sum.liquid_pct || 0}% Liqu</div></div>
      </div>

      <div class="card">
        <div class="k">Notes</div>
        <div class="v" style="font-weight:600; font-size:13px">${sum.notes || ''}</div>
      </div>

      <h3 style="margin-top:14px;">Fund Details & Rationale</h3>
      <table>
        <thead>
          <tr>
            <th>#</th><th>Fund</th><th>Alloc %</th><th>Why picked</th>
            <th>NAV</th><th>1Y</th><th>3Y</th><th>5Y</th>
            <th>AUM (₹Cr)</th><th>Expense</th><th>Risk</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div class="footer">
        Guardrails: Trim SWP by ${(plan.guardrails?.trim_if_drawdown_gt) || '—'} if 12M return below threshold; step-up ${(plan.guardrails?.stepup_pct) || '—'} if conditions met.
        <br/>${plan.disclaimer || ''}
      </div>
    </body>
  </html>`;
}

// ---------- puppeteer-safe launcher (Render/free tier friendly)
async function launchBrowser() {
  return puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  });
}

// ---------- PDF route
app.post('/api/plan/pdf', async (req, res) => {
  try {
    const plan =
      Object.keys(req.body || {}).length > 0
        ? req.body
        : JSON.parse(fs.readFileSync(path.join(__root, 'data', 'plan.json'), 'utf-8'));

    const html = buildPlanHtml(plan);
    const browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', right: '14mm', bottom: '16mm', left: '14mm' }
    });
    await browser.close();

    res
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="BlueSparrow-Plan.pdf"'
      })
      .send(pdf);
  } catch (e) {
    console.error('pdf error', e);
    res.status(500).json({ error: 'PDF generation failed' });
  }
});

// ---------- OpenAI helper
function getOpenAI() {
  const raw = (process.env.OPENAI_API_KEY || '').trim();
  if (!raw) {
    throw Object.assign(new Error('Missing OPENAI_API_KEY'), { code: 'missing_key' });
  }
  if (!raw.startsWith('sk-')) {
    throw Object.assign(new Error('OPENAI_API_KEY looks invalid (must start with "sk-")'), {
      code: 'bad_key_format'
    });
  }
  return new OpenAI({ apiKey: raw });
}

// ---------- AI proxy route
app.post('/api/ai-finance', async (req, res) => {
  const userQuery = (req.body?.query || '').toString();
  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content:
            'You are a helpful, India-focused financial education assistant. Use short bullet points when useful. Educational only—no personalized investment advice.'
        },
        { role: 'user', content: userQuery }
      ]
    });

    const answer =
      completion.choices?.[0]?.message?.content?.trim() || 'No answer from model.';

    res.json({
      answer,
      source: 'openai',
      goal: null,
      years: null,
      assumedReturn: null,
      sip: null,
      lump: null,
      categories: []
    });
  } catch (e) {
    if (e?.code === 'missing_key' || e?.code === 'bad_key_format') {
      return res.status(500).json({
        answer: e.message + ' — set it in Render > Environment and redeploy.',
        source: 'server_config'
      });
    }
    if (e?.status === 401 || e?.code === 'invalid_api_key') {
      return res.status(500).json({
        answer: 'OpenAI rejected the API key (invalid/expired). Update OPENAI_API_KEY and redeploy.',
        source: 'invalid_api_key'
      });
    }
    console.error('ai-finance error:', e);
    res.status(500).json({ answer: 'OpenAI call failed. Try again later.', source: 'error' });
  }
});

// ---------- root -> mutual-funds.html (fallback OK)
app.get('/', (_req, res) => {
  const p = path.join(__root, 'mutual-funds.html');
  if (fs.existsSync(p)) return res.sendFile(p);
  res.type('text').send('OK');
});

// ---------- start
app.listen(PORT, () => {
  console.log(`✅ Server running on :${PORT}`);
});
