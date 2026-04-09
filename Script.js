/* ============================================================
   AI CROWD SAFETY DASHBOARD — script.js
   Handles: loading, crowd simulation, alerts, chart, canvas
   ============================================================ */

'use strict';

/* ── STATE ── */
const state = {
  crowdCount: 0,
  targetCount: 0,
  riskLevel: 'safe',        // 'safe' | 'warning' | 'danger'
  emergencyActive: false,
  paused: false,
  uptimeSeconds: 0,
  detections: 0,
  simInterval: null,
  simSpeed: 1500,
};

/* ── DOM REFS ── */
const $ = id => document.getElementById(id);

const els = {
  loader:        $('loader'),
  app:           $('app'),
  headerTime:    $('headerTime'),
  alertBanner:   $('alertBanner'),
  alertIcon:     $('alertIcon'),
  alertLabel:    $('alertLabel'),
  alertMessage:  $('alertMessage'),
  alertTicker:   $('alertTicker'),
  crowdDisplay:  $('crowdCountDisplay'),
  countBadge:    $('countBadge'),
  crowdBar:      $('crowdBar'),
  riskDisplay:   $('riskLevelDisplay'),
  riskBadge:     $('riskBadge'),
  riskDots:      $('riskDots'),
  sysDisplay:    $('systemStatusDisplay'),
  densityOverlay:$('densityOverlay'),
  uptimeDisplay: $('uptimeDisplay'),
  detectionCount:$('detectionCount'),
  videoTime:     $('videoTime'),
  cardCount:     $('cardCount'),
  cardRisk:      $('cardRisk'),
  cardStatus:    $('cardStatus'),
  video:         $('surveillanceVideo'),
  fallbackCanvas:$('fallbackCanvas'),
  simSpeed:      $('simSpeed'),
  sensitivity:   $('sensitivity'),
};

/* ── CHART DATA ── */
const MAX_POINTS = 30;
const chartLabels = [];
const chartData   = [];
const pointColors = [];
let densityChart  = null;

/* ══════════════════════════════════
   STARTUP — LOADING SCREEN
══════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {
  // After 2.6s, hide loader and show app
  setTimeout(() => {
    els.loader.classList.add('fade-out');
    els.app.classList.remove('hidden');
    els.app.classList.add('visible');
    initApp();
  }, 2600);
});

/* ══════════════════════════════════
   INIT
══════════════════════════════════ */
function initApp() {
  initClock();
  initUptime();
  initChart();
  initVideo();
  initSimulation();
  initControls();
}

/* ── CLOCK ── */
function initClock() {
  function tick() {
    const now = new Date();
    els.headerTime.textContent = now.toLocaleTimeString('en-US', { hour12: false });
    // Video HUD timestamp
    els.videoTime.textContent = now.toLocaleTimeString('en-US', { hour12: false });
  }
  tick();
  setInterval(tick, 1000);
}

/* ── UPTIME ── */
function initUptime() {
  setInterval(() => {
    state.uptimeSeconds++;
    const h = String(Math.floor(state.uptimeSeconds / 3600)).padStart(2, '0');
    const m = String(Math.floor((state.uptimeSeconds % 3600) / 60)).padStart(2, '0');
    const s = String(state.uptimeSeconds % 60).padStart(2, '0');
    els.uptimeDisplay.textContent = `${h}:${m}:${s}`;
  }, 1000);
}

/* ── VIDEO / FALLBACK CANVAS ── */
function initVideo() {
  const video = els.video;
  const canvas = els.fallbackCanvas;

  // Check if video loads — if not, show animated fallback canvas
  video.addEventListener('error', () => showFallbackCanvas());
  video.addEventListener('loadeddata', () => {
    canvas.style.display = 'none';
    video.style.display  = 'block';
  });

  // If no src or can't load, show fallback after short delay
  setTimeout(() => {
    if (video.readyState === 0 || video.error) showFallbackCanvas();
  }, 1500);
}

/* Animated crowd simulation canvas (fallback when no video) */
function showFallbackCanvas() {
  const canvas = els.fallbackCanvas;
  const video  = els.video;
  video.style.display  = 'none';
  canvas.style.display = 'block';

  canvas.width  = canvas.offsetWidth  || 800;
  canvas.height = canvas.offsetHeight || 450;

  const ctx = canvas.getContext('2d');
  const particles = [];

  // Create particles representing people
  function makeParticle() {
    return {
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.8,
      vy: (Math.random() - 0.5) * 0.8,
      r: 3 + Math.random() * 3,
      alpha: 0.5 + Math.random() * 0.5,
    };
  }

  for (let i = 0; i < 60; i++) particles.push(makeParticle());

  function draw() {
    // Dark background with subtle gradient
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, '#05080f');
    grad.addColorStop(1, '#090d1a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 40) {
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 40) {
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    // Determine dot color based on risk
    const color = state.riskLevel === 'danger'  ? '255,60,110'
                : state.riskLevel === 'warning' ? '255,214,0'
                : '0,255,178';

    // Draw connections between nearby particles
    for (let i = 0; i < particles.length; i++) {
      for (let j = i+1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 80) {
          ctx.strokeStyle = `rgba(${color},${0.08 * (1 - dist/80)})`;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }

    // Draw people as circles with glow
    particles.forEach(p => {
      ctx.beginPath();
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.5);
      g.addColorStop(0, `rgba(${color},${p.alpha})`);
      g.addColorStop(1, `rgba(${color},0)`);
      ctx.fillStyle = g;
      ctx.arc(p.x, p.y, p.r * 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = `rgba(${color},${p.alpha})`;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();

      // Move
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > canvas.width)  p.vx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

      // Slightly speed up in danger
      if (state.riskLevel === 'danger') {
        p.vx += (Math.random()-0.5) * 0.05;
        p.vy += (Math.random()-0.5) * 0.05;
        p.vx = Math.max(-2, Math.min(2, p.vx));
        p.vy = Math.max(-2, Math.min(2, p.vy));
      }
    });

    // Adjust particle count to match crowd count
    const desired = Math.max(10, Math.floor(state.crowdCount / 2));
    while (particles.length < desired && particles.length < 150) particles.push(makeParticle());
    while (particles.length > desired && particles.length > 10) particles.pop();

    requestAnimationFrame(draw);
  }
  draw();
}

/* ── CHART ── */
function initChart() {
  const ctx = document.getElementById('densityChart').getContext('2d');

  // Pre-fill with some baseline data
  for (let i = MAX_POINTS; i > 0; i--) {
    chartLabels.push('');
    const val = Math.floor(Math.random() * 20);
    chartData.push(val);
    pointColors.push(getPointColor(val));
  }

  densityChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: chartLabels,
      datasets: [{
        label: 'Crowd Count',
        data: chartData,
        borderColor: '#00ffb2',
        borderWidth: 2,
        pointBackgroundColor: pointColors,
        pointBorderColor: 'transparent',
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: true,
        backgroundColor: (context) => {
          const chart = context.chart;
          const { ctx: c, chartArea } = chart;
          if (!chartArea) return 'transparent';
          const gradient = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradient.addColorStop(0, 'rgba(0,255,178,0.18)');
          gradient.addColorStop(1, 'rgba(0,255,178,0)');
          return gradient;
        },
        tension: 0.4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400, easing: 'easeInOutCubic' },
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(10,13,24,0.9)',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#6b7a99',
          bodyColor: '#e8edf5',
          padding: 10,
          displayColors: false,
          callbacks: {
            title: () => 'Crowd Count',
            label: item => `${item.raw} people detected`,
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
          ticks: { display: false },
          border: { display: false },
        },
        y: {
          min: 0, max: 130,
          grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
          ticks: {
            color: '#3a4560',
            font: { family: "'JetBrains Mono', monospace", size: 11 },
            stepSize: 25,
          },
          border: { display: false },
        }
      }
    }
  });
}

function getPointColor(val) {
  if (val >= 100) return '#ff3c6e';
  if (val >= 50)  return '#ffd600';
  return '#00ffb2';
}

function pushChartPoint(val) {
  const now = new Date().toLocaleTimeString('en-US', { hour12: false });
  chartLabels.push(now);
  chartData.push(val);
  pointColors.push(getPointColor(val));
  if (chartLabels.length > MAX_POINTS) {
    chartLabels.shift(); chartData.shift(); pointColors.shift();
  }
  // Update border color dynamically
  densityChart.data.datasets[0].borderColor = getPointColor(val);
  densityChart.data.datasets[0].pointBackgroundColor = [...pointColors];
  densityChart.update('none');
}

/* ══════════════════════════════════
   SIMULATION ENGINE
══════════════════════════════════ */
function initSimulation() {
  startSim();
}

function startSim() {
  clearInterval(state.simInterval);
  state.simInterval = setInterval(simTick, state.simSpeed);
}

/**
 * Each tick: increment crowd count by a random delta,
 * clamp between 0–120, then update all UI.
 */
function simTick() {
  if (state.paused || state.emergencyActive) return;

  const sensitivity = parseInt(els.sensitivity.value) || 7;
  const delta = Math.floor((Math.random() - 0.3) * sensitivity * 2);
  state.targetCount = Math.max(0, Math.min(120, state.targetCount + delta));

  // Smoothly animate number display
  animateCount(state.crowdCount, state.targetCount);
  state.crowdCount = state.targetCount;

  // Update detections (slightly different from crowd count)
  state.detections = Math.max(0, state.crowdCount + Math.floor((Math.random()-0.5)*5));
  els.detectionCount.textContent = state.detections;

  // Determine risk level
  const prevRisk = state.riskLevel;
  if      (state.crowdCount >= 100) state.riskLevel = 'danger';
  else if (state.crowdCount >= 50)  state.riskLevel = 'warning';
  else                               state.riskLevel = 'safe';

  updateMetricCards();
  updateAlertBanner();
  updateDensityOverlay();
  pushChartPoint(state.crowdCount);
}

/* ── ANIMATE COUNT (smooth number roll) ── */
function animateCount(from, to) {
  const el   = els.crowdDisplay;
  const steps = 12;
  const diff  = to - from;
  let step    = 0;
  clearInterval(el._anim);
  el._anim = setInterval(() => {
    step++;
    const current = Math.round(from + (diff * step / steps));
    el.textContent = current;
    if (step >= steps) {
      el.textContent = to;
      clearInterval(el._anim);
      // Bump animation
      el.classList.remove('bump');
      void el.offsetWidth; // reflow
      el.classList.add('bump');
    }
  }, 20);
}

/* ── UPDATE METRIC CARDS ── */
function updateMetricCards() {
  const c = state.crowdCount;
  const r = state.riskLevel;

  // Crowd bar (0–120 → 0–100%)
  els.crowdBar.style.width = Math.min(100, (c / 120) * 100) + '%';
  els.crowdBar.style.background =
    r === 'danger'  ? 'linear-gradient(90deg,#ff3c6e,#c91840)' :
    r === 'warning' ? 'linear-gradient(90deg,#ffd600,#ff9500)' :
                      'linear-gradient(90deg,#00ffb2,#4da8ff)';

  // Count badge
  setBadge(els.countBadge, r === 'danger' ? 'DANGER' : r === 'warning' ? 'WARNING' : 'SAFE', r);
  // Card border
  setCardMode(els.cardCount, r);
  setCardMode(els.cardRisk, r);

  // Risk display
  els.riskDisplay.textContent = r === 'danger' ? 'HIGH' : r === 'warning' ? 'MED' : 'LOW';
  setBadge(els.riskBadge, r === 'danger' ? 'HIGH' : r === 'warning' ? 'MED' : 'LOW', r);
  els.riskDisplay.style.color =
    r === 'danger' ? 'var(--red)' : r === 'warning' ? 'var(--yellow)' : 'var(--green)';

  // Risk dots (1 safe, 3 warning, 5 danger)
  updateRiskDots(r);

  // System status card
  els.sysDisplay.textContent =
    r === 'danger' ? 'CRITICAL' : r === 'warning' ? 'ELEVATED' : 'NORMAL';
  els.sysDisplay.style.color =
    r === 'danger' ? 'var(--red)' : r === 'warning' ? 'var(--yellow)' : 'var(--green)';
}

function setBadge(el, text, risk) {
  el.textContent = text;
  el.className   = 'card-badge' + (risk === 'danger' ? ' danger' : risk === 'warning' ? ' warning' : '');
}

function setCardMode(cardEl, risk) {
  cardEl.classList.remove('safe-mode', 'warn-mode', 'danger-mode');
  cardEl.classList.add(
    risk === 'danger' ? 'danger-mode' : risk === 'warning' ? 'warn-mode' : 'safe-mode'
  );
}

function updateRiskDots(risk) {
  const dots = els.riskDots.querySelectorAll('.rdot');
  const active = risk === 'danger' ? 5 : risk === 'warning' ? 3 : 1;
  dots.forEach((d, i) => {
    d.className = 'rdot' + (i < active ? ` active ${risk === 'danger' ? 'danger' : risk === 'warning' ? 'warn' : 'safe'}` : '');
  });
}

/* ── ALERT BANNER ── */
const ALERT_MESSAGES = {
  safe: [
    'All systems nominal. Monitoring active.',
    'Crowd levels normal. No anomalies detected.',
    'Area clear. Continued surveillance active.',
  ],
  warning: [
    '⚠ Crowd increasing — stay alert and monitor closely.',
    '⚠ Elevated density detected. Prepare response team.',
    '⚠ Warning threshold reached. Standby for escalation.',
  ],
  danger: [
    '🚨 HIGH RISK DETECTED — Evacuate immediately!',
    '🚨 Panic threshold exceeded. Deploy response units now!',
    '🚨 CRITICAL — Crowd surge detected. Emergency protocol active.',
  ],
};
let lastMsgIdx = { safe: 0, warning: 0, danger: 0 };

function updateAlertBanner() {
  const r = state.riskLevel;
  const msgs = ALERT_MESSAGES[r];
  const idx  = (lastMsgIdx[r] + 1) % msgs.length;
  lastMsgIdx[r] = idx;

  els.alertBanner.className = 'alert-banner' + (r !== 'safe' ? ` ${r}` : '');
  els.alertMessage.textContent = msgs[idx];
  els.alertLabel.textContent   =
    r === 'danger' ? 'CRITICAL ALERT' : r === 'warning' ? 'CAUTION NOTICE' : 'SYSTEM STATUS';
  els.alertTicker.textContent  =
    r === 'danger' ? 'DANGER' : r === 'warning' ? 'WARNING' : 'SAFE';
  els.alertIcon.textContent    = r === 'danger' ? '⚠' : r === 'warning' ? '◉' : '◈';
}

/* ── DENSITY OVERLAY ── */
function updateDensityOverlay() {
  const label =
    state.crowdCount >= 100 ? 'CRITICAL' :
    state.crowdCount >= 50  ? 'ELEVATED' : 'NORMAL';
  els.densityOverlay.textContent = `DENSITY: ${label}`;
}

/* ══════════════════════════════════
   CONTROLS
══════════════════════════════════ */
function initControls() {
  // Sim speed slider
  els.simSpeed.addEventListener('input', () => {
    state.simSpeed = parseInt(els.simSpeed.value);
    startSim(); // restart with new interval
  });
}

/* ── EMERGENCY MODE ── */
window.triggerEmergency = function() {
  if (state.emergencyActive) return;
  state.emergencyActive = true;
  state.crowdCount  = 115;
  state.targetCount = 115;
  state.riskLevel   = 'danger';

  const btn = document.getElementById('btnEmergency');
  btn.classList.add('active');
  btn.querySelector('.btn-text').textContent = 'Emergency Active!';

  // Force UI update
  els.crowdDisplay.textContent = '115';
  updateMetricCards();
  updateAlertBanner();
  updateDensityOverlay();
  pushChartPoint(115);

  // System status
  els.sysDisplay.textContent = 'CRITICAL';
  els.sysDisplay.style.color = 'var(--red)';
  const camDot = document.getElementById('camDot');
  if (camDot) { camDot.classList.remove('green'); camDot.classList.add('red'); }
};

/* ── RESET SYSTEM ── */
window.resetSystem = function() {
  state.emergencyActive = false;
  state.paused          = false;
  state.crowdCount      = 0;
  state.targetCount     = 0;
  state.riskLevel       = 'safe';

  els.crowdDisplay.textContent = '0';
  els.crowdBar.style.width     = '0%';
  els.riskDisplay.textContent  = 'LOW';
  els.sysDisplay.textContent   = 'NORMAL';
  els.sysDisplay.style.color   = 'var(--green)';

  const btn = document.getElementById('btnEmergency');
  btn.classList.remove('active');
  btn.querySelector('.btn-text').textContent = 'Emergency Mode';

  const camDot = document.getElementById('camDot');
  if (camDot) { camDot.classList.remove('red'); camDot.classList.add('green'); }

  updateMetricCards();
  updateAlertBanner();
  updateDensityOverlay();
  pushChartPoint(0);
  startSim();
};