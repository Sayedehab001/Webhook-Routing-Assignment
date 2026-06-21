const dashboardStyle = `:root {
  --bg: #07111f;
  --panel: rgba(9, 18, 33, 0.84);
  --panel-strong: rgba(13, 25, 44, 0.95);
  --border: rgba(148, 163, 184, 0.18);
  --text: #e5eefb;
  --muted: #96a7c2;
  --accent: #7dd3fc;
  --accent-2: #a78bfa;
  --success: #34d399;
  --warning: #fbbf24;
  --danger: #fb7185;
}

* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: var(--text);
  background:
    radial-gradient(circle at top left, rgba(125, 211, 252, 0.2), transparent 28%),
    radial-gradient(circle at top right, rgba(167, 139, 250, 0.18), transparent 24%),
    linear-gradient(180deg, #05101d 0%, #07111f 55%, #030712 100%);
  min-height: 100vh;
}
.shell { max-width: 1440px; margin: 0 auto; padding: 32px 24px 40px; }
.panel {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 24px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.42);
  backdrop-filter: blur(18px);
}
.hero { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr); gap: 20px; }
.hero-main { padding: 28px; }
.eyebrow { color: var(--accent); letter-spacing: 0.18em; text-transform: uppercase; font-size: 12px; font-weight: 700; margin-bottom: 12px; }
h1 { margin: 0; font-size: clamp(32px, 4vw, 56px); line-height: 0.96; max-width: 10ch; }
.lede { margin: 16px 0 0; color: var(--muted); max-width: 68ch; font-size: 15px; line-height: 1.7; }
.hero-meta { margin-top: 24px; display: flex; flex-wrap: wrap; gap: 10px; }
.pill { display: inline-flex; align-items: center; gap: 8px; padding: 10px 14px; border-radius: 999px; border: 1px solid var(--border); background: rgba(255,255,255,0.03); font-size: 13px; }
.dot { width: 10px; height: 10px; border-radius: 999px; background: var(--success); box-shadow: 0 0 0 4px rgba(52, 211, 153, 0.18); }
.side { padding: 22px; display: grid; gap: 14px; }
.toggle-card,.form-card,.section,.stat { background: var(--panel-strong); border: 1px solid var(--border); border-radius: 20px; }
.toggle-card,.form-card { padding: 18px; }
.toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.toggle-copy h2,.form-card h2,.section h2 { margin: 0; font-size: 18px; }
.muted { color: var(--muted); font-size: 13px; line-height: 1.6; }
.switch { position: relative; width: 68px; height: 38px; flex: 0 0 auto; }
.switch input { opacity: 0; width: 0; height: 0; }
.slider { position: absolute; inset: 0; cursor: pointer; background: rgba(148,163,184,0.2); border: 1px solid var(--border); transition: 180ms ease; border-radius: 999px; }
.slider::before { content: ""; position: absolute; width: 28px; height: 28px; left: 4px; top: 4px; border-radius: 999px; background: white; transition: 180ms ease; }
input:checked + .slider { background: linear-gradient(135deg, rgba(52, 211, 153, 0.28), rgba(125, 211, 252, 0.35)); }
input:checked + .slider::before { transform: translateX(30px); }
.grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin: 20px 0; }
.stat { padding: 18px; min-height: 120px; }
.stat-label { color: var(--muted); font-size: 13px; margin-bottom: 12px; }
.stat-value { font-size: clamp(28px, 3vw, 40px); font-weight: 800; letter-spacing: -0.04em; }
.stat-foot { margin-top: 10px; color: var(--muted); font-size: 12px; }
.content-grid { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr); gap: 20px; }
.section { padding: 20px; }
.section + .section { margin-top: 20px; }
.section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.bars,.recent-grid { display: grid; gap: 12px; }
.bar-row { display: grid; grid-template-columns: minmax(0, 180px) minmax(0, 1fr) auto; gap: 12px; align-items: center; }
.bar-label,.recent-title { color: var(--text); font-size: 14px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.bar-track { height: 12px; border-radius: 999px; background: rgba(148,163,184,0.12); overflow: hidden; }
.bar-fill { height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--accent), var(--accent-2)); }
.bar-count { color: var(--muted); font-variant-numeric: tabular-nums; }
.recent-card { padding: 16px; border: 1px solid var(--border); border-radius: 18px; background: rgba(255,255,255,0.03); cursor: pointer; }
.recent-top { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
.tag { display: inline-flex; align-items: center; border-radius: 999px; padding: 6px 10px; font-size: 12px; border: 1px solid var(--border); background: rgba(255,255,255,0.04); }
.tag.default { color: var(--accent); }
.tag.all_countries { color: var(--warning); }
.tag.review { color: var(--danger); }
.json-panel { margin-top: 16px; border: 1px solid var(--border); border-radius: 18px; background: rgba(2, 6, 23, 0.72); overflow: hidden; }
.json-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--border); color: var(--muted); }
pre { margin: 0; padding: 16px; overflow: auto; max-height: 440px; font-size: 12px; line-height: 1.6; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 14px; }
label { display: grid; gap: 8px; color: var(--muted); font-size: 13px; }
input,select,textarea,button { font: inherit; }
input,select,textarea { width: 100%; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--border); background: rgba(255,255,255,0.04); color: var(--text); }
textarea { min-height: 115px; resize: vertical; }
.span-2 { grid-column: span 2; }
.actions { margin-top: 14px; display: flex; flex-wrap: wrap; gap: 10px; }
.button { appearance: none; border: 0; border-radius: 14px; padding: 12px 16px; color: #04111d; background: linear-gradient(135deg, #7dd3fc, #a78bfa); cursor: pointer; font-weight: 700; }
.button.secondary { color: var(--text); background: rgba(255,255,255,0.05); border: 1px solid var(--border); }
.footer-note { margin-top: 14px; color: var(--muted); font-size: 12px; }
.status-live { color: var(--success); }
.status-dry { color: var(--warning); }
@media (max-width: 1080px) {
  .hero,.content-grid,.grid { grid-template-columns: 1fr; }
  .bar-row { grid-template-columns: 1fr; }
  .form-grid { grid-template-columns: 1fr; }
  .span-2 { grid-column: auto; }
}
`;

export default dashboardStyle;
export { dashboardStyle };