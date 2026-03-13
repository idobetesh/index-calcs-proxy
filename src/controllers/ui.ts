import { Context } from 'hono';
import { Env } from '../types/env.js';

function buildHtml(secret: string): string {
  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Index Calculator — Israeli CBS</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%236366f1'/><text x='16' y='22' text-anchor='middle' font-size='18' font-family='sans-serif' font-weight='bold' fill='white'>₪</text></svg>" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg: #0f1117;
      --surface: #1a1d27;
      --surface2: #22263a;
      --border: #2e3348;
      --border-focus: #6366f1;
      --text: #e8eaf6;
      --text-muted: #8b90a7;
      --text-label: #a0a5bc;
      --accent: #6366f1;
      --accent-hover: #4f52d6;
      --accent-dim: rgba(99,102,241,0.15);
      --green: #34d399;
      --green-bg: rgba(52,211,153,0.1);
      --green-border: rgba(52,211,153,0.25);
      --red: #f87171;
      --red-bg: rgba(248,113,113,0.1);
      --red-border: rgba(248,113,113,0.25);
      --yellow: #fbbf24;
      --card-shadow: 0 8px 32px rgba(0,0,0,0.4);
      --input-bg: #12151f;
      --badge-bg: rgba(99,102,241,0.18);
    }
    [data-theme="light"] {
      --bg: #f0f2f8;
      --surface: #ffffff;
      --surface2: #f5f7ff;
      --border: #dde1f0;
      --border-focus: #6366f1;
      --text: #1a1d2e;
      --text-muted: #6b7094;
      --text-label: #4b5068;
      --accent: #6366f1;
      --accent-hover: #4f52d6;
      --accent-dim: rgba(99,102,241,0.08);
      --green: #059669;
      --green-bg: rgba(5,150,105,0.07);
      --green-border: rgba(5,150,105,0.2);
      --red: #dc2626;
      --red-bg: rgba(220,38,38,0.07);
      --red-border: rgba(220,38,38,0.2);
      --yellow: #d97706;
      --card-shadow: 0 4px 24px rgba(99,102,241,0.08);
      --input-bg: #f8f9ff;
      --badge-bg: rgba(99,102,241,0.1);
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { overflow-x: hidden; }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
      font-optical-sizing: auto;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      padding: 0 1rem 2rem;
      transition: background 0.2s, color 0.2s;
    }

    /* ── Ticker ── */
    .ticker-bar {
      width: 100%;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 0;
      overflow: hidden;
      position: sticky;
      top: 0;
      z-index: 50;
      display: flex;
      align-items: center;
      height: 34px;
    }
    .ticker-track {
      display: flex;
      align-items: center;
      white-space: nowrap;
      animation: ticker-scroll 90s linear infinite;
      will-change: transform;
    }
    @media (hover: hover) {
      .ticker-bar:hover .ticker-track { animation-play-state: paused; }
    }
    @keyframes ticker-scroll {
      0%   { transform: translateX(0); }
      100% { transform: translateX(-50%); }
    }
    .ticker-item {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0 1.5rem;
      font-size: 0.75rem;
      font-weight: 600;
      border-right: 1px solid var(--border);
      height: 34px;
      cursor: default;
    }
    .ticker-label { color: var(--text-muted); font-weight: 500; }
    .ticker-value { color: var(--text); letter-spacing: 0.01em; }
    .ticker-change { font-size: 0.68rem; font-weight: 700; }
    .ticker-change.up   { color: var(--green); }
    .ticker-change.down { color: var(--red); }
    .ticker-loading {
      font-size: 0.72rem;
      color: var(--text-muted);
      padding: 0 1.5rem;
      animation: ticker-fade 1s ease infinite alternate;
    }
    @keyframes ticker-fade { from { opacity: 0.4; } to { opacity: 1; } }

    /* ── Page layout ── */
    .page-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem;
      width: 100%;
      max-width: 1400px;
      min-width: 0;
      align-items: start;
    }
    .col-right {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    @media (max-width: 768px) {
      .page-grid { grid-template-columns: 1fr; }
    }

    /* ── Top bar ── */
    .topbar {
      width: 100%;
      max-width: 1400px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin: 1.25rem 0 0.75rem;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--text-muted);
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .brand-dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: var(--accent);
      box-shadow: 0 0 8px var(--accent);
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    /* ── Dark mode toggle ── */
    .theme-toggle {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      user-select: none;
    }
    .theme-toggle-label {
      font-size: 0.75rem;
      color: var(--text-muted);
      font-weight: 500;
    }
    .toggle-track {
      width: 40px; height: 22px;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 11px;
      position: relative;
      transition: background 0.2s, border-color 0.2s;
      cursor: pointer;
    }
    .toggle-track.on { background: var(--accent); border-color: var(--accent); }
    .toggle-thumb {
      width: 16px; height: 16px;
      background: #fff;
      border-radius: 50%;
      position: absolute;
      top: 2px; left: 2px;
      transition: transform 0.2s;
      box-shadow: 0 1px 4px rgba(0,0,0,0.3);
    }
    .toggle-track.on .toggle-thumb { transform: translateX(18px); }

    /* ── Card ── */
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      box-shadow: var(--card-shadow);
      padding: 2rem;
      width: 100%;
      transition: background 0.2s, border-color 0.2s;
    }

    /* ── Header ── */
    .card-header { margin-bottom: 1.75rem; position: relative; }
    .card-header h1 {
      font-size: 1.5rem;
      font-weight: 800;
      color: var(--text);
      letter-spacing: -0.02em;
      margin-bottom: 0.3rem;
    }
    .card-header p {
      font-size: 0.85rem;
      color: var(--text-muted);
    }
    .rate-chip {
      position: absolute;
      top: 0;
      right: 0;
      text-align: right;
      display: none;
      cursor: default;
    }
    .rate-chip.loaded { display: block; }
    .rate-chip-label {
      font-size: 0.65rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .rate-chip-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--text);
      line-height: 1.2;
    }
    .rate-chip::after {
      content: attr(data-tooltip);
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text);
      font-size: 0.72rem;
      line-height: 1.6;
      padding: 0.4rem 0.65rem;
      border-radius: 8px;
      white-space: pre;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.15s;
      z-index: 10;
      text-align: left;
    }
    .rate-chip:hover::after { opacity: 1; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      font-size: 0.7rem;
      font-weight: 600;
      color: var(--accent);
      background: var(--badge-bg);
      border-radius: 20px;
      padding: 0.2rem 0.6rem;
      margin-bottom: 0.5rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    /* ── Form ── */
    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }
    .field { display: flex; flex-direction: column; gap: 0.35rem; }
    .field.full { grid-column: 1 / -1; }

    label {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-label);
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }
    label .opt {
      font-weight: 400;
      color: var(--text-muted);
      text-transform: none;
      letter-spacing: 0;
    }

    input, select {
      width: 100%;
      padding: 0.65rem 0.85rem;
      background: var(--input-bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      font-size: 0.95rem;
      color: var(--text);
      outline: none;
      transition: border-color 0.15s, box-shadow 0.15s, background 0.2s;
      -webkit-appearance: none;
    }
    [data-theme="dark"]  input[type="month"] { color-scheme: dark; }
    [data-theme="light"] input[type="month"] { color-scheme: light; }
    input:focus, select:focus {
      border-color: var(--border-focus);
      box-shadow: 0 0 0 3px var(--accent-dim);
    }
    input::placeholder { color: var(--text-muted); opacity: 0.6; }
    select option { background: var(--surface); color: var(--text); }
    .select-wrap { position: relative; }
    .select-wrap::after {
      content: '';
      position: absolute;
      right: 0.85rem;
      top: 50%;
      transform: translateY(-50%);
      width: 0;
      height: 0;
      border-left: 4px solid transparent;
      border-right: 4px solid transparent;
      border-top: 5px solid var(--text-muted);
      pointer-events: none;
      transition: border-top-color 0.15s;
    }
    .select-wrap:focus-within::after { border-top-color: var(--accent); }
    .select-wrap select { padding-right: 2.2rem; cursor: pointer; }

    .input-prefix-wrap {
      position: relative;
    }
    .input-prefix-wrap .prefix {
      position: absolute;
      left: 0.85rem;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-muted);
      font-size: 0.95rem;
      pointer-events: none;
    }
    .input-prefix-wrap input { padding-left: 1.75rem; }

    /* ── Divider ── */
    .divider {
      height: 1px;
      background: var(--border);
      margin: 1.5rem 0;
    }

    /* ── Submit button ── */
    .btn-wrap { position: relative; overflow: hidden; border-radius: 10px; }
    .btn {
      width: 100%;
      padding: 0.8rem;
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: 10px;
      font-size: 0.95rem;
      font-weight: 700;
      cursor: pointer;
      letter-spacing: 0.01em;
      transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      position: relative;
      overflow: hidden;
    }
    .btn:hover:not(:disabled) {
      background: var(--accent-hover);
      box-shadow: 0 4px 20px rgba(99,102,241,0.4);
      transform: translateY(-1px);
    }
    .btn:active:not(:disabled) { transform: translateY(0) scale(0.98); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }

    /* Ripple */
    .ripple {
      position: absolute;
      border-radius: 50%;
      background: rgba(255,255,255,0.25);
      transform: scale(0);
      animation: ripple-anim 0.55s linear;
      pointer-events: none;
    }
    @keyframes ripple-anim {
      to { transform: scale(4); opacity: 0; }
    }

    /* Loading bar under button */
    .btn-progress {
      height: 3px;
      background: var(--border);
      border-radius: 0 0 10px 10px;
      overflow: hidden;
      display: none;
      margin-top: -2px;
    }
    .btn-progress.active { display: block; }
    .btn-progress-bar {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, var(--accent), #a78bfa, var(--accent));
      background-size: 200% 100%;
      animation: progress-slide 1.4s ease-in-out infinite, progress-shimmer 1.4s linear infinite;
    }
    @keyframes progress-slide {
      0%   { width: 0%;   margin-left: 0; }
      50%  { width: 75%;  margin-left: 10%; }
      100% { width: 0%;   margin-left: 110%; }
    }
    @keyframes progress-shimmer {
      0%   { background-position: 200% center; }
      100% { background-position: -200% center; }
    }

    /* ── Spinner ── */
    .spinner {
      width: 16px; height: 16px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      display: none;
    }
    .btn.loading .spinner { display: block; }
    .btn.loading .btn-text { opacity: 0.7; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ── Result ── */
    .result {
      margin-top: 1.5rem;
      border-radius: 12px;
      overflow: hidden;
      display: none;
    }
    .result.animating {
      animation: slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    @keyframes slideUp {
      from { opacity: 0; transform: translateY(16px) scale(0.98); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    /* Stagger stats */
    .stat { animation: none; }
    .result.animating .stat:nth-child(1) { animation: fadeSlot 0.3s 0.15s both; }
    .result.animating .stat:nth-child(2) { animation: fadeSlot 0.3s 0.22s both; }
    .result.animating .stat:nth-child(3) { animation: fadeSlot 0.3s 0.29s both; }
    @keyframes fadeSlot {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .result-hero {
      padding: 1.25rem 1.5rem;
      background: var(--green-bg);
      border: 1px solid var(--green-border);
      border-bottom: none;
      border-radius: 12px 12px 0 0;
    }
    .result-hero-label {
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--green);
      margin-bottom: 0.3rem;
      opacity: 0.8;
    }
    .result-hero-value {
      font-size: 2rem;
      font-weight: 600;
      color: var(--green);
      letter-spacing: -0.02em;
      line-height: 1;
      font-family: 'JetBrains Mono', monospace;
    }
    .result-hero-sub {
      font-size: 0.8rem;
      color: var(--text-muted);
      margin-top: 0.4rem;
    }

    .result.error .result-hero {
      background: var(--red-bg);
      border-color: var(--red-border);
    }
    .result.error .result-hero-label { color: var(--red); }
    .result.error .result-hero-value { font-size: 1rem; color: var(--red); font-weight: 600; }

    .result-body {
      padding: 1.25rem 1.5rem;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-top: none;
      border-radius: 0 0 12px 12px;
    }

    .stat-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.75rem;
      margin-bottom: 1rem;
    }
    .stat {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.75rem;
    }
    .stat-label {
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-muted);
      margin-bottom: 0.3rem;
    }
    .stat-value {
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--text);
      font-family: 'JetBrains Mono', monospace;
    }
    .stat-value.positive { color: var(--green); }
    .stat-value.negative { color: var(--red); }

    .period-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.82rem;
      color: var(--text-muted);
      margin-bottom: 1rem;
    }
    .period-chip {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.2rem 0.5rem;
      font-weight: 600;
      color: var(--text);
      font-size: 0.82rem;
    }
    .period-arrow { color: var(--accent); font-size: 1rem; }

    .sheets-box {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.75rem 1rem;
    }
    .sheets-box-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.35rem;
    }
    .sheets-box-label {
      font-size: 0.65rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: var(--text-muted);
    }
    .copy-btn {
      display: flex;
      align-items: center;
      gap: 0.3rem;
      font-size: 0.68rem;
      font-weight: 600;
      color: var(--accent);
      background: var(--accent-dim);
      border: 1px solid transparent;
      border-radius: 5px;
      padding: 0.2rem 0.6rem;
      cursor: pointer;
      transition: background 0.2s, color 0.2s, transform 0.15s, box-shadow 0.2s, border-color 0.2s;
      position: relative;
      overflow: hidden;
      min-width: 64px;
      justify-content: center;
    }
    .copy-btn:hover:not(.copied) {
      background: var(--accent);
      color: #fff;
      box-shadow: 0 2px 10px rgba(99,102,241,0.4);
    }
    .copy-btn:active:not(.copied) { transform: scale(0.92); }
    .copy-btn.copied {
      background: var(--green);
      color: #fff;
      border-color: var(--green);
      box-shadow: 0 2px 12px rgba(52,211,153,0.45);
      animation: copy-pop 0.35s cubic-bezier(0.16, 1, 0.3, 1);
      pointer-events: none;
    }
    @keyframes copy-pop {
      0%   { transform: scale(0.8);  }
      55%  { transform: scale(1.15); }
      100% { transform: scale(1);    }
    }
    /* Check mark draws itself in */
    .copy-check {
      display: inline-block;
      font-size: 0.85rem;
      line-height: 1;
      opacity: 0;
      transform: scale(0.4) rotate(-20deg);
      transition: none;
    }
    .copy-btn.copied .copy-check {
      animation: check-appear 0.3s 0.05s cubic-bezier(0.16,1,0.3,1) forwards;
    }
    @keyframes check-appear {
      to { opacity: 1; transform: scale(1) rotate(0deg); }
    }
    /* Particles burst on copy */
    .copy-particle {
      position: absolute;
      width: 4px; height: 4px;
      border-radius: 50%;
      background: var(--green);
      pointer-events: none;
      animation: particle-fly 0.5s ease-out forwards;
    }
    @keyframes particle-fly {
      0%   { transform: translate(0,0) scale(1); opacity: 1; }
      100% { transform: translate(var(--tx), var(--ty)) scale(0); opacity: 0; }
    }

    /* ── Toast ── */
    #toast {
      position: fixed;
      bottom: 1.75rem;
      left: 50%;
      transform: translateX(-50%) translateY(12px);
      background: var(--surface);
      border: 1px solid var(--green-border);
      color: var(--green);
      font-size: 0.82rem;
      font-weight: 600;
      padding: 0.55rem 1rem;
      border-radius: 999px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      gap: 0.45rem;
      opacity: 0;
      pointer-events: none;
      transition: none;
      white-space: nowrap;
      z-index: 100;
    }
    #toast.show {
      animation: toast-in 0.35s cubic-bezier(0.16,1,0.3,1) forwards,
                 toast-out 0.3s ease-in 1.8s forwards;
    }
    @keyframes toast-in {
      from { opacity: 0; transform: translateX(-50%) translateY(12px) scale(0.9); }
      to   { opacity: 1; transform: translateX(-50%) translateY(0)    scale(1);   }
    }
    @keyframes toast-out {
      from { opacity: 1; transform: translateX(-50%) translateY(0)    scale(1);   }
      to   { opacity: 0; transform: translateX(-50%) translateY(8px)  scale(0.95); }
    }
    .sheets-box code {
      font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 0.72rem;
      color: var(--accent);
      word-break: break-all;
      line-height: 1.5;
    }
    .latest-badge {
      font-size: 0.7rem;
      font-weight: 600;
      padding: 0.1rem 0.45rem;
      border-radius: 20px;
      margin-left: 0.3rem;
      vertical-align: middle;
    }
    .latest-badge.fresh  { background: var(--green-bg);  color: var(--green);  border: 1px solid var(--green-border); }
    .latest-badge.stale  { background: var(--red-bg);    color: var(--red);    border: 1px solid var(--red-border); }
    .latest-badge.medium { background: rgba(251,191,36,0.12); color: var(--yellow); border: 1px solid rgba(251,191,36,0.3); }
    .duration-chip {
      font-size: 0.72rem;
      color: var(--text-muted);
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 5px;
      padding: 0.15rem 0.45rem;
      font-weight: 500;
    }
    .market-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }
    .market-cell {
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      transition: border-color 0.2s;
    }
    .market-cell.open  { border-color: var(--green-border); }
    .market-cell.closed { border-color: var(--red-border); }
    .market-cell-name {
      font-size: 0.8rem;
      color: var(--text-muted);
    }
    @keyframes glow-open {
      0%, 100% { box-shadow: 0 0 5px rgba(52,211,153,0.35); }
      50%       { box-shadow: 0 0 11px rgba(52,211,153,0.65), 0 0 3px rgba(52,211,153,0.4); }
    }
    .market-status-badge {
      display: inline-block;
      padding: 0.15rem 0.55rem;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.03em;
    }
    .market-status-badge.open  {
      background: var(--green-bg);
      color: var(--green);
      animation: glow-open 2.2s ease-in-out infinite;
    }
    .market-status-badge.closed {
      background: var(--red-bg);
      color: var(--red);
      box-shadow: 0 0 6px rgba(248,113,113,0.3);
    }
    .market-badge-wrap {
      position: relative;
      display: inline-block;
    }
    .market-badge-wrap::after {
      content: attr(data-tooltip);
      position: absolute;
      bottom: calc(100% + 6px);
      left: 50%;
      transform: translateX(-50%);
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text);
      font-size: 0.7rem;
      padding: 0.25rem 0.55rem;
      border-radius: 6px;
      white-space: nowrap;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.15s;
      z-index: 10;
    }
    .market-badge-wrap:hover::after { opacity: 1; }
    .market-time {
      font-family: 'JetBrains Mono', monospace;
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--text);
    }
    .market-loading {
      grid-column: 1 / -1;
      color: var(--text-muted);
      font-size: 0.85rem;
    }
    .market-link {
      color: inherit;
      text-decoration: none;
    }
    .market-link:hover {
      text-decoration: underline;
      color: var(--accent);
    }
    @media (max-width: 480px) {
      .market-grid { grid-template-columns: 1fr; }
    }
    .today-btn {
      font-size: 0.68rem;
      font-weight: 600;
      color: var(--accent);
      background: var(--accent-dim);
      border: 1px solid transparent;
      border-radius: 5px;
      padding: 0.15rem 0.5rem;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
      line-height: 1;
    }
    .today-btn:hover {
      background: var(--accent);
      color: #fff;
    }

    .compare-toggle-btn {
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--accent);
      background: var(--accent-dim);
      border: 1px solid transparent;
      border-radius: 8px;
      padding: 0.4rem 1rem;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }
    .compare-toggle-btn:hover {
      background: var(--accent);
      color: #fff;
    }
    .compare-slot {
      flex: 1;
      min-width: 0;
      border-radius: 10px;
      overflow: hidden;
    }
    .compare-hero {
      padding: 0.85rem 1rem;
      border-radius: 10px 10px 0 0;
    }
    .compare-hero.a {
      background: var(--accent-dim);
      border: 1px solid rgba(99,102,241,0.3);
      border-bottom: none;
    }
    .compare-hero.b {
      background: var(--green-bg);
      border: 1px solid var(--green-border);
      border-bottom: none;
    }
    .compare-hero-label {
      font-size: 0.65rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      margin-bottom: 0.25rem;
    }
    .compare-hero.a .compare-hero-label { color: var(--accent); }
    .compare-hero.b .compare-hero-label { color: var(--green); }
    .compare-hero-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 1.35rem;
      font-weight: 600;
      color: var(--text);
    }
    .compare-hero-pct {
      font-size: 0.78rem;
      color: var(--text-muted);
      margin-top: 0.2rem;
    }
    .compare-body {
      padding: 0.65rem 1rem;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-top: none;
      border-radius: 0 0 10px 10px;
      font-size: 0.78rem;
      color: var(--text-muted);
    }
    .compare-diff-row {
      margin-top: 0.75rem;
      padding: 0.55rem 0.75rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      font-size: 0.78rem;
      color: var(--text-muted);
      text-align: center;
    }
    .compare-diff-row strong { color: var(--text); }
  </style>
</head>
<body>

  <div class="ticker-bar" id="tickerBar">
    <div class="ticker-track" id="tickerTrack">
      <span class="ticker-loading" id="tickerLoading">Loading market data…</span>
    </div>
  </div>

  <div class="topbar">
    <div class="brand">
      <div class="brand-dot"></div>
      CBS Index Proxy
    </div>
    <div class="theme-toggle" onclick="toggleTheme()">
      <span class="theme-toggle-label" id="themeLabel">Light</span>
      <div class="toggle-track" id="toggleTrack">
        <div class="toggle-thumb"></div>
      </div>
    </div>
  </div>

  <div class="page-grid">
  <div class="card">
    <div class="card-header">
      <div class="badge">🇮🇱 Israeli CBS</div>
      <h1>Index Calculator</h1>
      <p>CPI &amp; Construction index-linked amount adjustment</p>
      <div class="rate-chip" id="rateChip">
        <div class="rate-chip-label"><a href="https://www.boi.org.il/roles/monetary-policy/interest-rate-dates/" target="_blank" rel="noopener noreferrer" class="market-link">BOI Rate ↗</a></div>
        <div class="rate-chip-value" id="rateChipValue"></div>
      </div>
    </div>

    <div class="form-grid">
      <div class="field full">
        <label for="amount">Amount <span class="opt">(₪)</span></label>
        <div class="input-prefix-wrap">
          <span class="prefix">₪</span>
          <input type="text" id="amount" placeholder="e.g. 400,000" inputmode="numeric" autocomplete="off" />
        </div>
      </div>

      <div class="field">
        <label for="from">From</label>
        <input type="month" id="from" />
      </div>

      <div class="field">
        <label for="to" style="display:flex;align-items:center;justify-content:space-between;">
          <span>To <span class="opt">(optional)</span></span>
          <button type="button" class="today-btn" onclick="setToday()">Today</button>
        </label>
        <input type="month" id="to" />
      </div>

      <div class="field full">
        <label for="index">Index Type <span class="opt" id="latestBadge"></span></label>
        <div class="select-wrap">
          <select id="index" onchange="updateLatestBadge()">
            <option value="cpi">CPI — Consumer Price Index</option>
            <option value="construction">Construction Index</option>
            <option value="housing">Housing Price Index</option>
          </select>
        </div>
      </div>

    </div>

    <div id="validationMsg" style="display:none;margin-top:0.5rem;padding:0.5rem 0.75rem;background:var(--red-bg);border:1px solid var(--red-border);border-radius:8px;font-size:0.82rem;color:var(--red);font-weight:500;"></div>

    <div class="divider"></div>

    <div class="btn-wrap">
      <button class="btn" id="calcBtn" onclick="calculate(event)">
        <div class="spinner"></div>
        <span class="btn-text">Calculate</span>
      </button>
      <div class="btn-progress" id="btnProgress">
        <div class="btn-progress-bar"></div>
      </div>
    </div>

    <div class="result" id="result">
      <div class="result-hero" id="resultHero">
        <div class="result-hero-label" id="resultLabel">Result</div>
        <div class="result-hero-value" id="resultMain"></div>
        <div class="result-hero-sub" id="resultSub"></div>
        <div id="resultCopyWrap" style="margin-top:0.6rem;display:none;">
          <button class="copy-btn" id="resultCopyBtn">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copy amount
          </button>
        </div>
      </div>
      <div class="result-body" id="resultBody">
        <div class="stat-grid" id="statGrid"></div>
        <div class="period-row" id="periodRow"></div>
        <div class="sheets-box" id="sheetsBox"></div>
      </div>
    </div>

    <div id="compareToggleWrap" style="display:none;margin-top:1rem;text-align:center;">
      <button class="compare-toggle-btn" id="compareToggleBtn" onclick="toggleCompare()">+ Compare</button>
    </div>

    <div id="comparePanel" style="display:none;margin-top:1rem;">
      <div class="divider"></div>
      <div style="font-size:0.75rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.75rem;">Compare with</div>
      <div class="form-grid">
        <div class="field">
          <label for="cmpFrom">From</label>
          <input type="month" id="cmpFrom" />
        </div>
        <div class="field">
          <label for="cmpTo">To <span class="opt">(optional)</span></label>
          <input type="month" id="cmpTo" />
        </div>
        <div class="field full">
          <label for="cmpIndex">Index Type</label>
          <div class="select-wrap">
            <select id="cmpIndex">
              <option value="cpi">CPI — Consumer Price Index</option>
              <option value="construction">Construction Index</option>
              <option value="housing">Housing Price Index</option>
            </select>
          </div>
        </div>
      </div>
      <div style="margin-top:0.75rem;">
        <div class="btn-wrap">
          <button class="btn" id="cmpBtn" onclick="runCompare(event)" style="background:var(--surface2);color:var(--text);border:1px solid var(--border);">
            <div class="spinner"></div>
            <span class="btn-text">Run Comparison</span>
          </button>
          <div class="btn-progress" id="cmpBtnProgress">
            <div class="btn-progress-bar"></div>
          </div>
        </div>
      </div>
      <div id="compareResults" style="display:none;margin-top:1rem;"></div>
    </div>
  </div>

  <div class="col-right">
  <div class="card">
    <div class="card-header">
      <div class="badge">📈 Israeli ETFs</div>
      <h1>ETF Price Lookup</h1>
      <p>Current NAV/price by TASE security number (מספר ני&quot;ע)</p>
    </div>

    <div class="field">
      <label for="etfId">Security Number</label>
      <input type="text" id="etfId" placeholder="e.g. 5119466, 1150572…" inputmode="numeric" autocomplete="off" />
    </div>

    <div class="divider"></div>

    <div class="btn-wrap">
      <button class="btn" id="etfBtn" onclick="lookupEtf(event)">
        <div class="spinner"></div>
        <span class="btn-text">Look Up</span>
      </button>
      <div class="btn-progress" id="etfBtnProgress">
        <div class="btn-progress-bar"></div>
      </div>
    </div>

    <div class="result" id="etfResult">
      <div class="result-hero" id="etfResultHero">
        <div class="result-hero-label" id="etfResultLabel">Price</div>
        <div class="result-hero-value" id="etfResultMain"></div>
        <div class="result-hero-sub" id="etfResultSub"></div>
      </div>
      <div class="result-body" id="etfResultBody"></div>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <div class="badge">🕐 Markets</div>
      <h1>Market Hours</h1>
      <p>Live open/closed status for major stock exchanges</p>
    </div>
    <div id="marketStatusGrid" class="market-grid">
      <div class="market-loading">Loading…</div>
    </div>
    <p style="margin-top:0.75rem;font-size:0.7rem;color:var(--text-muted);text-align:right;">Holiday-aware · Updates every 60s</p>
  </div>
  </div>
  </div>

  <script>
    const SECRET = ${JSON.stringify(secret)};

    // ── Theme ──
    function toggleTheme() {
      const html = document.documentElement;
      const isDark = html.getAttribute('data-theme') === 'dark';
      const next = isDark ? 'light' : 'dark';
      html.setAttribute('data-theme', next);
      document.getElementById('toggleTrack').classList.toggle('on', isDark);
      document.getElementById('themeLabel').textContent = isDark ? 'Dark' : 'Light';
      localStorage.setItem('theme', next);
    }

    // Init theme: dark by default, respect saved preference
    (function() {
      const saved = localStorage.getItem('theme') || 'dark';
      document.documentElement.setAttribute('data-theme', saved);
      const isDark = saved === 'dark';
      document.getElementById('toggleTrack').classList.toggle('on', !isDark);
      document.getElementById('themeLabel').textContent = isDark ? 'Light' : 'Dark';
    })();

    // ── Ripple ──
    function spawnRipple(btn, e) {
      const rect   = btn.getBoundingClientRect();
      const size   = Math.max(rect.width, rect.height) * 1.5;
      const x      = (e.clientX - rect.left) - size / 2;
      const y      = (e.clientY - rect.top)  - size / 2;
      const ripple = document.createElement('span');
      ripple.className = 'ripple';
      ripple.style.cssText = 'width:' + size + 'px;height:' + size + 'px;left:' + x + 'px;top:' + y + 'px;';
      btn.appendChild(ripple);
      ripple.addEventListener('animationend', () => ripple.remove());
    }

    // ── Inline validation ──
    function validateInputs(amount, from, to) {
      const msgEl = document.getElementById('validationMsg');
      let msg = '';
      if (!amount || !from) {
        msg = 'Amount and From period are required.';
      } else if (to && to <= from) {
        msg = '"To" must be after "From" (' + from + ' \u2265 ' + to + ').';
      }
      if (msg) {
        msgEl.textContent = msg;
        msgEl.style.display = 'block';
        return false;
      }
      msgEl.style.display = 'none';
      return true;
    }

    // ── Calculate ──
    async function calculate(e) {
      const btn      = document.getElementById('calcBtn');
      const progress = document.getElementById('btnProgress');
      const resultEl = document.getElementById('result');

      if (e) spawnRipple(btn, e);

      const amount = document.getElementById('amount').value.replace(/,/g, '').trim();
      const from   = document.getElementById('from').value.trim();
      const to     = document.getElementById('to').value.trim();
      const index  = document.getElementById('index').value;

      if (!validateInputs(amount, from, to)) return;

      btn.classList.add('loading');
      btn.disabled = true;
      progress.classList.add('active');
      resultEl.style.display = 'none';
      saveInputs();

      const params = new URLSearchParams({ amount, from, index, format: 'json', secret: SECRET });
      if (to) params.set('to', to);

      try {
        const res  = await fetch('/calc?' + params.toString());
        const data = await res.json();

        if (!res.ok || data.error) {
          showError(data.error || 'Calculation failed.');
          return;
        }

        const hashParams = new URLSearchParams({ amount, from, index });
        if (to) hashParams.set('to', to);
        window.location.replace('#' + hashParams.toString());
        showResult(data);
      } catch (e) {
        showError('Network error: ' + e.message);
      } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
        progress.classList.remove('active');
      }
    }

    function showError(msg) {
      const resultEl = document.getElementById('result');
      resultEl.className = 'result error';
      resultEl.style.display = 'block';
      document.getElementById('resultLabel').textContent = 'Error';
      document.getElementById('resultMain').textContent = msg;
      document.getElementById('resultSub').textContent = '';
      document.getElementById('statGrid').innerHTML = '';
      document.getElementById('periodRow').innerHTML = '';
      document.getElementById('sheetsBox').innerHTML = '';
      const copyWrap = document.getElementById('resultCopyWrap');
      if (copyWrap) copyWrap.style.display = 'none';
      const ctw = document.getElementById('compareToggleWrap');
      if (ctw) ctw.style.display = 'none';
      const cp = document.getElementById('comparePanel');
      if (cp) cp.style.display = 'none';
      const cr = document.getElementById('compareResults');
      if (cr) cr.style.display = 'none';
      const btn = document.getElementById('compareToggleBtn');
      if (btn) btn.textContent = '+ Compare';
    }

    // ── Animated counter ──
    function animateCount(el, target, prefix, suffix, duration) {
      const start     = performance.now();
      const startVal  = 0;
      const isNeg     = target < 0;
      const abs       = Math.abs(target);
      function step(now) {
        const t        = Math.min((now - start) / duration, 1);
        const eased    = 1 - Math.pow(1 - t, 3); // ease-out cubic
        const current  = Math.round(startVal + eased * abs);
        el.textContent = prefix + (isNeg ? '-' : '') + current.toLocaleString('en-US') + suffix;
        if (t < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    function showResult(data) {
      const valMsg = document.getElementById('validationMsg');
      if (valMsg) valMsg.style.display = 'none';
      const resultEl  = document.getElementById('result');
      const pct       = data.percentage;
      const sign      = pct >= 0 ? '+' : '';
      const pctClass  = pct >= 0 ? 'positive' : 'negative';

      resultEl.className = 'result';
      resultEl.style.display = 'block';
      // Trigger stagger animation
      void resultEl.offsetWidth;
      resultEl.classList.add('animating');
      resultEl.addEventListener('animationend', () => resultEl.classList.remove('animating'), { once: true });

      document.getElementById('resultLabel').textContent = 'Indexed Amount';
      document.getElementById('resultSub').textContent   =
        sign + pct.toFixed(2) + '% change  ·  Difference: ' + fmt(data.difference);

      // Animate main hero number
      const heroEl = document.getElementById('resultMain');
      animateCount(heroEl, data.indexedAmount, '₪', '', 700);

      // Show copy-amount button
      const copyWrap = document.getElementById('resultCopyWrap');
      const copyAmountBtn = document.getElementById('resultCopyBtn');
      if (copyWrap && copyAmountBtn) {
        copyWrap.style.display = 'block';
        const amountText = String(Math.round(data.indexedAmount));
        copyAmountBtn.onclick = function() { copyFormula(this, amountText); };
      }

      document.getElementById('statGrid').innerHTML = \`
        <div class="stat">
          <div class="stat-label">Original</div>
          <div class="stat-value" id="sv-orig"></div>
        </div>
        <div class="stat">
          <div class="stat-label">Indexed</div>
          <div class="stat-value" id="sv-indexed"></div>
        </div>
        <div class="stat">
          <div class="stat-label">Change</div>
          <div class="stat-value \${pctClass}" id="sv-pct"></div>
        </div>
      \`;
      // Staggered counter animations for stats
      setTimeout(() => animateCount(document.getElementById('sv-orig'),    data.originalAmount, '₪', '', 500), 150);
      setTimeout(() => animateCount(document.getElementById('sv-indexed'), data.indexedAmount,  '₪', '', 500), 220);
      setTimeout(() => {
        const el = document.getElementById('sv-pct');
        const abs = Math.abs(pct);
        const start = performance.now();
        function stepPct(now) {
          const t = Math.min((now - start) / 400, 1);
          const eased = 1 - Math.pow(1 - t, 3);
          el.textContent = sign + (eased * abs).toFixed(2) + '%';
          if (t < 1) requestAnimationFrame(stepPct);
        }
        requestAnimationFrame(stepPct);
      }, 290);

      document.getElementById('periodRow').innerHTML = \`
        <span class="period-chip">\${data.fromPeriod}</span>
        <span class="period-arrow">→</span>
        <span class="period-chip">\${data.toPeriod}</span>
        <span class="duration-chip">\${periodDiff(data.fromPeriod, data.toPeriod)}</span>
        <span style="margin-left:auto;font-size:0.75rem;color:var(--text-muted);">\${document.getElementById('index').value.toUpperCase()}</span>
      \`;

      const base    = window.location.origin;
      const formula = '=IMPORTDATA(CONCATENATE("' + base + '/calc?amount=",INT(H3),"&from=",TEXT(M2,"YYYY-MM"),"&secret=YOUR_SECRET"))';
      const box = document.getElementById('sheetsBox');
      box.innerHTML = \`
        <div class="sheets-box-header">
          <span class="sheets-box-label">Google Sheets formula</span>
          <button class="copy-btn" id="copyBtn">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copy
          </button>
        </div>
        <code id="formulaCode"></code>
      \`;
      document.getElementById('formulaCode').textContent = formula;
      document.getElementById('copyBtn').addEventListener('click', function() {
        copyFormula(this, formula);
      });
      const ctw = document.getElementById('compareToggleWrap');
      if (ctw) ctw.style.display = 'block';
    }

    function fmt(n) {
      return '\\u20aa' + Math.round(n).toLocaleString('en-US');
    }

    function setToday() {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      document.getElementById('to').value = y + '-' + m;
    }

    function periodDiff(from, to) {
      const [fy, fm] = from.split('-').map(Number);
      const [ty, tm] = to.split('-').map(Number);
      const total    = (ty - fy) * 12 + (tm - fm);
      const years    = Math.floor(total / 12);
      const months   = total % 12;
      const parts    = [];
      if (years  > 0) parts.push(years  + (years  === 1 ? ' yr'  : ' yrs'));
      if (months > 0) parts.push(months + (months === 1 ? ' mo'  : ' mos'));
      return parts.length ? parts.join(' ') : '0 mos';
    }

    const COPY_ICON  = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy';
    const CHECK_ICON = '<span class="copy-check">&#10003;</span> Copied!';

    function spawnParticles(btn) {
      const count  = 6;
      const rect   = btn.getBoundingClientRect();
      const cx     = rect.width / 2;
      const cy     = rect.height / 2;
      for (let i = 0; i < count; i++) {
        const angle  = (i / count) * 2 * Math.PI;
        const dist   = 18 + Math.random() * 10;
        const p      = document.createElement('span');
        p.className  = 'copy-particle';
        p.style.left = cx + 'px';
        p.style.top  = cy + 'px';
        p.style.setProperty('--tx', Math.round(Math.cos(angle) * dist) + 'px');
        p.style.setProperty('--ty', Math.round(Math.sin(angle) * dist) + 'px');
        btn.appendChild(p);
        p.addEventListener('animationend', () => p.remove());
      }
    }

    let toastTimer = null;
    function showToast() {
      const t = document.getElementById('toast');
      if (toastTimer) clearTimeout(toastTimer);
      t.classList.remove('show');
      void t.offsetWidth;
      t.classList.add('show');
      // Remove class after full animation (in 0.35s + hold + out 0.3s = ~2.45s)
      toastTimer = setTimeout(() => { t.classList.remove('show'); toastTimer = null; }, 2450);
    }

    function doFeedback(btn) {
      btn.classList.add('copied');
      btn.innerHTML = CHECK_ICON;
      spawnParticles(btn);
      showToast();
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = COPY_ICON;
      }, 2000);
    }

    function copyFormula(btn, text) {
      // Try modern clipboard API, fall back to execCommand
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
          .then(() => doFeedback(btn))
          .catch(() => legacyCopy(btn, text));
      } else {
        legacyCopy(btn, text);
      }
    }

    function legacyCopy(btn, text) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try { document.execCommand('copy'); doFeedback(btn); } catch (_) {}
      document.body.removeChild(ta);
    }

    // ── Persist inputs ──
    const FIELDS = ['amount', 'from', 'to', 'index'];

    function saveInputs() {
      const saved = {};
      FIELDS.forEach(id => {
        const val = document.getElementById(id).value;
        saved[id] = id === 'amount' ? val.replace(/,/g, '') : val;
      });
      localStorage.setItem('calc-inputs', JSON.stringify(saved));
    }

    function restoreInputs() {
      try {
        const saved = JSON.parse(localStorage.getItem('calc-inputs') || '{}');
        FIELDS.forEach(id => {
          if (saved[id] !== undefined) {
            const el = document.getElementById(id);
            el.value = saved[id];
            if (id === 'amount') formatAmountDisplay(el);
          }
        });
      } catch (_) {}
    }

    restoreInputs();

    // ── Amount formatter ──
    // Allow free typing while focused; format with commas on blur.
    function formatAmountDisplay(el) {
      const digits = el.value.replace(/[^0-9]/g, '');
      el.value = digits ? parseInt(digits, 10).toLocaleString('en-US') : '';
    }

    function stripAmountCommas(el) {
      el.value = el.value.replace(/,/g, '');
    }

    const amountEl = document.getElementById('amount');
    amountEl.addEventListener('focus', function() { stripAmountCommas(this); });
    amountEl.addEventListener('blur',  function() { formatAmountDisplay(this); });

    // ── Restore from URL hash (overrides localStorage) ──
    (function restoreFromHash() {
      const hash = window.location.hash.slice(1);
      if (!hash) return;
      const p = new URLSearchParams(hash);
      const amount = p.get('amount');
      const from   = p.get('from');
      const to     = p.get('to');
      const index  = p.get('index');
      if (amount) { const el = document.getElementById('amount'); el.value = amount; formatAmountDisplay(el); }
      if (from)  document.getElementById('from').value  = from;
      if (to)    document.getElementById('to').value    = to;
      if (index) document.getElementById('index').value = index;
      if (amount && from) calculate(null);
    })();

    document.getElementById('from').addEventListener('change', function() {
      const a = document.getElementById('amount').value.replace(/,/g, '').trim();
      const f = this.value.trim();
      const t = document.getElementById('to').value.trim();
      if (a || f) validateInputs(a, f, t);
    });
    document.getElementById('to').addEventListener('change', function() {
      const a = document.getElementById('amount').value.replace(/,/g, '').trim();
      const f = document.getElementById('from').value.trim();
      validateInputs(a, f, this.value.trim());
    });

    // ── Latest available periods ──
    let latestPeriods = {};

    async function fetchLatest() {
      try {
        const data = await fetch('/latest').then(r => r.json());
        latestPeriods = data;
        updateLatestBadge();
      } catch (_) {}
    }

    function updateLatestBadge() {
      const index   = document.getElementById('index').value;
      const period  = latestPeriods[index];
      const badge   = document.getElementById('latestBadge');
      if (!period) { badge.innerHTML = ''; return; }

      const [y, m]    = period.split('-').map(Number);
      const now       = new Date();
      const monthsAgo = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
      const cls       = monthsAgo <= 2 ? 'fresh' : monthsAgo <= 4 ? 'medium' : 'stale';
      const ago       = monthsAgo === 0 ? 'this month' : monthsAgo === 1 ? '1 mo ago' : monthsAgo + ' mos ago';
      badge.innerHTML = \`<span class="latest-badge \${cls}">CBS latest: \${period} · \${ago}</span>\`;
    }

    fetchLatest();

    // ── Ticker ──
    const TICKER_ITEMS = [
      { label: 'BOI RATE', type: 'rate'   },
      { label: 'USD/ILS', type: 'fiat'   },
      { label: 'EUR/ILS', type: 'fiat'   },
      { label: 'GBP/ILS', type: 'fiat'   },
      { label: 'BTC/USD', type: 'crypto' },
      { label: 'ETH/USD', type: 'crypto' },
      { label: 'GOLD',    type: 'metal'  },
      { label: 'SILVER',  type: 'metal'  },
      { label: 'VIX',     type: 'index'  },
      { label: 'S&P 500', type: 'index'  },
      { label: 'NASDAQ',  type: 'index'  },
      { label: 'RUSSELL', type: 'index'  },
      { label: 'MSCI',    type: 'index'  },
    ];

    let prevRates = {};

    async function fetchTicker() {
      const [fiatRes, cryptoRes, marketRes, rateRes] = await Promise.allSettled([
        fetch('https://api.frankfurter.app/latest?from=ILS&to=USD,EUR,GBP').then(r => r.json()),
        fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true').then(r => r.json()),
        fetch('/market?secret=' + SECRET).then(r => r.json()),
        fetch('/rate?secret=' + SECRET).then(r => r.json()),
      ]);

      const rates = {};

      // Fiat: frankfurter returns ILS→X, invert to get X→ILS
      if (fiatRes.status === 'fulfilled') {
        for (const [sym, val] of Object.entries(fiatRes.value.rates || {})) {
          rates[sym + '/ILS'] = { value: (1 / val).toFixed(4) };
        }
      }

      // Crypto
      if (cryptoRes.status === 'fulfilled') {
        for (const [coin, data] of Object.entries(cryptoRes.value)) {
          const label = coin === 'bitcoin' ? 'BTC' : 'ETH';
          for (const [vs, val] of Object.entries(data)) {
            if (vs.endsWith('_24h_change')) continue;
            const key = label + '/' + vs.toUpperCase();
            const change = data[vs + '_24h_change'];
            rates[key] = {
              value: val > 1000 ? val.toLocaleString('en-US', { maximumFractionDigits: 0 }) : val.toFixed(2),
              change: change != null ? +change.toFixed(2) : null,
            };
          }
        }
      }

      // Metals, VIX, indices — proxied through /market (server-side fetch avoids CORS)
      if (marketRes.status === 'fulfilled') {
        const m = marketRes.value;
        if (m.gold)    rates['GOLD']    = { value: '$' + Math.round(m.gold.price).toLocaleString('en-US'), change: m.gold.change };
        if (m.silver)  rates['SILVER']  = { value: '$' + m.silver.price.toFixed(2), change: m.silver.change };
        if (m.vix)     rates['VIX']     = { value: m.vix.price.toFixed(2), change: m.vix.change };
        if (m.sp500)   rates['S&P 500'] = { value: Math.round(m.sp500.price).toLocaleString('en-US'), change: m.sp500.change };
        if (m.nasdaq)  rates['NASDAQ']  = { value: Math.round(m.nasdaq.price).toLocaleString('en-US'), change: m.nasdaq.change };
        if (m.russell) rates['RUSSELL'] = { value: m.russell.price.toFixed(2), change: m.russell.change };
        if (m.msci)    rates['MSCI']    = { value: m.msci.price.toFixed(2), change: m.msci.change };
      }

      if (rateRes.status === 'fulfilled' && rateRes.value?.rate != null) {
        const r = rateRes.value.rate;
        rates['BOI RATE'] = { value: r.toFixed(2) + '%' };
        const chip = document.getElementById('rateChip');
        const chipVal = document.getElementById('rateChipValue');
        if (chip && chipVal) {
          chipVal.textContent = r.toFixed(2) + '%';
          chip.setAttribute('data-tooltip', buildRateTooltip(r));
          chip.classList.add('loaded');
        }
      }

      if (Object.keys(rates).length) {
        renderTicker(rates);
        prevRates = rates;
      }
    }

    function renderTicker(rates) {
      const items = TICKER_ITEMS.map(t => {
        const r = rates[t.label];
        if (!r) return '';
        const prev = prevRates[t.label];
        const dir = prev && r.value !== prev.value ? (parseFloat(r.value) > parseFloat(prev.value) ? 'up' : 'down') : '';
        const changeHtml = r.change != null
          ? \`<span class="ticker-change \${r.change >= 0 ? 'up' : 'down'}">\${r.change >= 0 ? '▲' : '▼'}\${Math.abs(r.change)}%</span>\`
          : (dir ? \`<span class="ticker-change \${dir}">\${dir === 'up' ? '▲' : '▼'}</span>\` : '');
        return \`<span class="ticker-item"><span class="ticker-label">\${t.label}</span><span class="ticker-value">\${r.value}</span>\${changeHtml}</span>\`;
      }).join('');

      if (!items) return;
      // Duplicate for seamless loop
      const track = document.getElementById('tickerTrack');
      track.innerHTML = items + items;
    }

    fetchTicker();
    setInterval(fetchTicker, 60_000);

    // ── ETF Lookup ──
    async function lookupEtf(e) {
      const btn      = document.getElementById('etfBtn');
      const progress = document.getElementById('etfBtnProgress');
      const resultEl = document.getElementById('etfResult');

      if (e) spawnRipple(btn, e);

      const id = document.getElementById('etfId').value.trim().replace(/[^0-9]/g, '');
      if (!id) { showEtfError('Please enter a security number.'); return; }

      btn.classList.add('loading');
      btn.disabled = true;
      progress.classList.add('active');
      resultEl.style.display = 'none';

      try {
        const res  = await fetch('/etf?id=' + id + '&format=json&secret=' + SECRET);
        const data = await res.json();
        if (!res.ok || data.error) { showEtfError(data.error || 'Lookup failed.'); return; }
        showEtfResult(data);
      } catch (err) {
        showEtfError('Network error: ' + err.message);
      } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
        progress.classList.remove('active');
      }
    }

    function showEtfError(msg) {
      const resultEl = document.getElementById('etfResult');
      resultEl.className = 'result error';
      resultEl.style.display = 'block';
      document.getElementById('etfResultLabel').textContent = 'Error';
      document.getElementById('etfResultMain').textContent  = msg;
      document.getElementById('etfResultSub').textContent   = '';
      document.getElementById('etfResultBody').innerHTML    = '';
    }

    function showEtfResult(data) {
      const resultEl = document.getElementById('etfResult');
      resultEl.className = 'result';
      resultEl.style.display = 'block';
      void resultEl.offsetWidth;
      resultEl.classList.add('animating');
      resultEl.addEventListener('animationend', () => resultEl.classList.remove('animating'), { once: true });

      document.getElementById('etfResultLabel').textContent = data.name || ('Security ' + data.id);
      document.getElementById('etfResultMain').innerHTML =
        '<span style="display:inline-flex;flex-direction:row;align-items:baseline;gap:0.2em">' +
          '<span>\\u05d0\\u05d2</span>' +
          '<span>' + data.price.toLocaleString('en-US', { maximumFractionDigits: 0 }) + '</span>' +
        '</span>';

      const taseUrl = 'https://market.tase.co.il/en/market_data/security/' + data.id + '/major_data';
      const subParts = [];
      if (data.date) subParts.push(data.date);
      subParts.push('via ' + data.source);
      const subEl = document.getElementById('etfResultSub');
      subEl.innerHTML = subParts.join(' \\u00b7 ') +
        ' \\u00b7 <a href="' + taseUrl + '" target="_blank" rel="noopener" style="color:inherit;opacity:0.7;text-underline-offset:2px;">TASE ↗</a>';

      const formula = '=IMPORTDATA("' + window.location.origin + '/etf?id=' + data.id + '&format=text&secret=YOUR_SECRET")';
      document.getElementById('etfResultBody').innerHTML = \`
        <div class="sheets-box">
          <div class="sheets-box-header">
            <span class="sheets-box-label">Google Sheets formula</span>
            <button class="copy-btn" id="etfCopyBtn">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copy
            </button>
          </div>
          <code id="etfFormulaCode"></code>
        </div>
      \`;
      document.getElementById('etfFormulaCode').textContent = formula;
      document.getElementById('etfCopyBtn').addEventListener('click', function() {
        copyFormula(this, formula);
      });
    }

    // ── Allow Enter key to submit ──
    document.addEventListener('keydown', function(e) {
      if (e.key !== 'Enter') return;
      if (document.activeElement && document.activeElement.id === 'etfId') lookupEtf();
      else calculate();
    });

    // ── BOI Rate ──
    // Decision dates published annually: https://www.boi.org.il
    const BOI_DECISIONS = [
      '2026-01-26','2026-03-09','2026-04-27','2026-06-08',
      '2026-07-27','2026-09-07','2026-10-26','2026-12-21',
    ];

    function nextRateDecision() {
      const today = new Date().toISOString().slice(0, 10);
      return BOI_DECISIONS.find(d => d > today) ?? 'TBD';
    }

    function buildRateTooltip(rate) {
      const prime = (rate + 1.5).toFixed(2);
      const next  = nextRateDecision();
      return 'Prime = BOI + 1.5% = ' + prime + '%\\nNext decision: ' + next;
    }

    // ── Market Status ──
    const MARKET_TIMEZONES = {
      tase: 'Asia/Jerusalem',
      lse:  'Europe/London',
      nyse: 'America/New_York',
      six:  'Europe/Zurich',
    };

    const MARKET_HOURS = {
      tase: { openH:9,  openM:59, closeH:17, closeM:25, fridayCloseH:14, fridayCloseM:0, tradingDays:[1,2,3,4,5] },
      lse:  { openH:8,  openM:0,  closeH:16, closeM:30, tradingDays:[1,2,3,4,5] },
      nyse: { openH:9,  openM:30, closeH:16, closeM:0,  tradingDays:[1,2,3,4,5] },
      six:  { openH:9,  openM:0,  closeH:17, closeM:30, tradingDays:[1,2,3,4,5] },
    };

    const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

    function formatDuration(mins) {
      if (mins <= 0) return '< 1m';
      const h = Math.floor(mins / 60), m = mins % 60;
      if (h > 0 && m > 0) return h + 'h ' + m + 'm';
      return h > 0 ? h + 'h' : m + 'm';
    }

    function getMarketTooltip(key, isOpen) {
      const tz = MARKET_TIMEZONES[key];
      const hrs = MARKET_HOURS[key];
      const now = new Date();
      const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday:'short', hour:'2-digit', minute:'2-digit', hour12:false });
      const parts = fmt.formatToParts(now);
      const get = t => parts.find(p => p.type === t)?.value ?? '0';
      let curH = parseInt(get('hour')); if (curH === 24) curH = 0;
      const curM = parseInt(get('minute'));
      const weekday = { Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6 }[get('weekday')] ?? 0;
      const nowMins  = curH * 60 + curM;
      const openMins = hrs.openH * 60 + hrs.openM;
      const isFriday = weekday === 5;
      const effectiveCloseH = (isFriday && hrs.fridayCloseH !== undefined) ? hrs.fridayCloseH : hrs.closeH;
      const effectiveCloseM = (isFriday && hrs.fridayCloseM !== undefined) ? hrs.fridayCloseM : hrs.closeM;
      const closeMins = effectiveCloseH * 60 + effectiveCloseM;
      if (isOpen) {
        return 'Closes in ' + formatDuration(closeMins - nowMins);
      }
      if (hrs.tradingDays.includes(weekday) && nowMins < openMins) {
        return 'Opens in ' + formatDuration(openMins - nowMins);
      }
      for (let d = 1; d <= 7; d++) {
        const next = (weekday + d) % 7;
        if (hrs.tradingDays.includes(next)) {
          const lbl = d === 1 ? 'tomorrow' : DAY_NAMES[next];
          return \`Opens \${lbl} at \${String(hrs.openH).padStart(2,'0')}:\${String(hrs.openM).padStart(2,'0')}\`;
        }
      }
      return 'Closed';
    }

    let lastMarketData = null;

    function tickMarketClocks() {
      const now = new Date();
      Object.entries(MARKET_TIMEZONES).forEach(function([key, tz]) {
        const el = document.getElementById('marketClock-' + key);
        if (el) {
          const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
          let time = fmt.format(now);
          if (time.startsWith('24:')) time = '00:' + time.slice(3);
          el.textContent = time;
        }
        if (lastMarketData && lastMarketData[key]) {
          const wrap = document.getElementById('marketTooltip-' + key);
          if (wrap) wrap.setAttribute('data-tooltip', getMarketTooltip(key, lastMarketData[key].open));
        }
      });
    }

    const MARKET_URLS = {
      tase: 'https://www.tase.co.il',
      lse:  'https://www.londonstockexchange.com',
      nyse: 'https://www.nyse.com',
      six:  'https://www.six-group.com/en/products-services/the-swiss-stock-exchange.html',
    };

    function renderMarketStatus(data) {
      lastMarketData = data;
      const grid = document.getElementById('marketStatusGrid');
      if (!grid) return;
      const keys = ['tase', 'lse', 'nyse', 'six'];
      grid.innerHTML = keys.map(function(key) {
        const m = data[key];
        if (!m) return '';
        const cls = m.open ? 'open' : 'closed';
        const label = m.open ? 'Open' : 'Closed';
        const url = MARKET_URLS[key];
        const tooltip = getMarketTooltip(key, m.open);
        return \`<div class="market-cell \${cls}">
          <div class="market-cell-name">\${m.flag} <a href="\${url}" target="_blank" rel="noopener noreferrer" class="market-link">\${m.name}</a></div>
          <div class="market-time" id="marketClock-\${key}">\${m.localTime}</div>
          <div><span class="market-badge-wrap" id="marketTooltip-\${key}" data-tooltip="\${tooltip}"><span class="market-status-badge \${cls}">\${label}</span></span></div>
        </div>\`;
      }).join('');
    }

    async function fetchMarketStatus() {
      try {
        const res = await fetch('/market-status?secret=' + SECRET);
        if (!res.ok) return;
        const data = await res.json();
        renderMarketStatus(data);
      } catch (_) { /* ignore network errors */ }
    }

    fetchMarketStatus();
    tickMarketClocks();
    setInterval(fetchMarketStatus, 60_000);
    setInterval(tickMarketClocks, 1_000);

    // ── Compare ──
    function toggleCompare() {
      const panel = document.getElementById('comparePanel');
      const btn   = document.getElementById('compareToggleBtn');
      const isOpen = panel.style.display !== 'none';
      panel.style.display = isOpen ? 'none' : 'block';
      btn.textContent     = isOpen ? '+ Compare' : '− Compare';
      if (!isOpen) {
        // Pre-fill compare form from main form
        document.getElementById('cmpFrom').value  = document.getElementById('from').value;
        document.getElementById('cmpTo').value    = document.getElementById('to').value;
        // Default compare index to the other main one
        const mainIndex = document.getElementById('index').value;
        document.getElementById('cmpIndex').value = mainIndex === 'cpi' ? 'construction' : 'cpi';
      }
    }

    async function runCompare(e) {
      const btn      = document.getElementById('cmpBtn');
      const progress = document.getElementById('cmpBtnProgress');
      const resultEl = document.getElementById('compareResults');

      if (e) spawnRipple(btn, e);

      const amount = document.getElementById('amount').value.replace(/,/g, '').trim();
      const from   = document.getElementById('cmpFrom').value.trim();
      const to     = document.getElementById('cmpTo').value.trim();
      const index  = document.getElementById('cmpIndex').value;

      if (!amount || !from) {
        resultEl.style.display = 'block';
        resultEl.innerHTML = '<div style="color:var(--red);font-size:0.82rem;padding:0.5rem 0;">Amount and From period are required (from the main form).</div>';
        return;
      }

      btn.classList.add('loading');
      btn.disabled = true;
      progress.classList.add('active');
      resultEl.style.display = 'none';

      const params = new URLSearchParams({ amount, from, index, format: 'json', secret: SECRET });
      if (to) params.set('to', to);

      try {
        const res  = await fetch('/calc?' + params.toString());
        const data = await res.json();
        if (!res.ok || data.error) {
          resultEl.style.display = 'block';
          resultEl.innerHTML = '<div style="color:var(--red);font-size:0.82rem;padding:0.5rem 0;">' + (data.error || 'Comparison failed.') + '</div>';
          return;
        }
        showCompareResult(data);
      } catch (err) {
        resultEl.style.display = 'block';
        resultEl.innerHTML = '<div style="color:var(--red);font-size:0.82rem;padding:0.5rem 0;">Network error: ' + err.message + '</div>';
      } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
        progress.classList.remove('active');
      }
    }

    function showCompareResult(cmpData) {
      // Read primary result data from the current form + DOM
      const primAmount   = parseFloat(document.getElementById('amount').value.replace(/,/g,'')) || 0;
      const primIndexed  = parseFloat(document.getElementById('resultMain').textContent.replace(/[₪,]/g,'')) || 0;
      const primPeriodEl = document.getElementById('periodRow');
      const primPeriod   = primPeriodEl ? primPeriodEl.textContent.replace(/\\s+/g,' ').trim() : '';
      const primIndex    = document.getElementById('index').value.toUpperCase();
      const cmpIndex     = document.getElementById('cmpIndex').value.toUpperCase();
      const cmpSign      = cmpData.percentage >= 0 ? '+' : '';
      const primPct      = primAmount > 0 ? (((primIndexed - primAmount) / primAmount) * 100).toFixed(2) : '—';
      const primSign     = primAmount > 0 && ((primIndexed - primAmount) / primAmount) * 100 >= 0 ? '+' : '';

      const diff         = Math.round(cmpData.indexedAmount - primIndexed);
      const diffSign     = diff >= 0 ? '+' : '';
      const diffColor    = diff >= 0 ? 'var(--green)' : 'var(--red)';

      const container = document.getElementById('compareResults');
      container.style.display = 'block';
      container.innerHTML = \`
        <div style="display:flex;gap:0.75rem;">
          <div class="compare-slot">
            <div class="compare-hero a">
              <div class="compare-hero-label">\${primIndex}</div>
              <div class="compare-hero-value">₪\${Math.round(primIndexed).toLocaleString('en-US')}</div>
              <div class="compare-hero-pct">\${primSign}\${primPct}%</div>
            </div>
            <div class="compare-body">\${primPeriod}</div>
          </div>
          <div class="compare-slot">
            <div class="compare-hero b">
              <div class="compare-hero-label">\${cmpIndex}</div>
              <div class="compare-hero-value">₪\${Math.round(cmpData.indexedAmount).toLocaleString('en-US')}</div>
              <div class="compare-hero-pct">\${cmpSign}\${cmpData.percentage.toFixed(2)}%</div>
            </div>
            <div class="compare-body">\${cmpData.fromPeriod} → \${cmpData.toPeriod}</div>
          </div>
        </div>
        <div class="compare-diff-row">
          Difference: <strong style="color:\${diffColor}">\${diffSign}₪\${Math.abs(diff).toLocaleString('en-US')}</strong>
        </div>
      \`;
    }
  </script>
  <div id="toast">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
    Copied to clipboard
  </div>
</body>
</html>`;
}

export function uiController(c: Context<{ Bindings: Env }>): Response {
  return new Response(buildHtml(c.env.SECRET_KEY ?? ''), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
