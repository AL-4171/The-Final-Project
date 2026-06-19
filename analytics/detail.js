/**
 * detail.js — Expanded chart view
 */

// ── Auth Guard ──
(function () {
  if (!localStorage.getItem("hydroUser")) {
    window.location.replace("../landing/landing.html");
  }
})();

document.addEventListener('DOMContentLoaded', () => {

    // ── URL param ──
    const urlParams = new URLSearchParams(window.location.search);
    const chartType = urlParams.get('type') || 'soil';

    // ── DOM refs ──
    const chartTitle = document.getElementById('chartTitle');
    const chartLabel = document.getElementById('chartLabel');
    const detailCtx  = document.getElementById('detailChart')?.getContext('2d');

    if (!detailCtx) {
        console.error('detail.js: #detailChart canvas not found.');
        return;
    }

    // ── State ──
    let detailChart     = null;
    let historyData     = [];
    let liveHistoryData = [];

    const checkedFilter = document.querySelector('.time-filter:checked');
    let currentFilter   = checkedFilter
        ? (checkedFilter.nextElementSibling?.innerText?.trim() || 'Live')
        : 'Live';

    // Pump activity tracked locally for this session
    let pumpRunMs       = 0;
    let pumpStartTime   = null;

    // ── Chart configs ──
    const configs = {
        soil:     { title: 'Soil Moisture Trend',  color: '#22c55e', unit: '%',  label: 'Moisture'    },
        temp:     { title: 'Temperature History',   color: '#ef4444', unit: '°C', label: 'Temperature' },
        hum:      { title: 'Humidity History',      color: '#0ea5e9', unit: '%',  label: 'Humidity'    },
        activity: { title: 'Pump Activity',         color: '#4f46e5', unit: '%',  label: 'Usage'       }
    };

    const config = configs[chartType] || configs.soil;
    if (chartTitle) chartTitle.innerText = config.title;
    if (chartLabel) {
        chartLabel.innerText              = config.label;
        chartLabel.style.backgroundColor  = config.color;
    }

    // ── Init chart ──
    function initChart() {
        const isDoughnut = (chartType === 'activity');

        detailChart = new Chart(detailCtx, {
            type: isDoughnut ? 'doughnut' : 'line',
            data: {
                labels: isDoughnut ? ['Running', 'Idle'] : [],
                datasets: [{
                    label:           config.label,
                    data:            isDoughnut ? [0, 100] : [],
                    borderColor:     config.color,
                    backgroundColor: isDoughnut
                        ? [config.color, '#f1f5f9']
                        : config.color + '20',
                    borderWidth:     isDoughnut ? 0 : 4,
                    tension:         0.4,
                    fill:            !isDoughnut,
                    pointRadius:     isDoughnut ? 0 : 2,
                    pointHoverRadius: 6,
                    cutout:          isDoughnut ? '75%' : 0
                }]
            },
            options: {
                responsive:          true,
                maintainAspectRatio: false,
                animation: { duration: 2000, easing: 'easeOutQuart' },
                plugins: {
                    legend:  { display: isDoughnut },
                    tooltip: {
                        mode:            isDoughnut ? 'point' : 'index',
                        intersect:       false,
                        padding:         12,
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        titleFont:       { size: 14, weight: 'bold' },
                        bodyFont:        { size: 13 },
                        callbacks: {
                            label: (ctx) => isDoughnut
                                ? `${ctx.label}: ${ctx.parsed}%`
                                : `${ctx.dataset.label}: ${ctx.parsed.y}${config.unit}`
                        }
                    }
                },
                scales: isDoughnut ? {} : {
                    y: {
                        beginAtZero: true,
                        grid:  { color: 'rgba(0,0,0,0.05)', drawBorder: false },
                        ticks: { callback: v => v + config.unit, font: { weight: 'bold' } }
                    },
                    x: {
                        grid:  { color: 'rgba(0,0,0,0.02)' },
                        ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12, font: { size: 11 } }
                    }
                }
            }
        });
    }

    function updateStats(data) {
        if (data === undefined || data === null || data.length === 0) return;

        const safe = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.innerText = val;
        };

        if (chartType === 'activity') {
            const runPct = typeof data === 'number' ? data : data[0];
            safe('currentVal',  runPct + '%');
            safe('statAvg',     runPct + '%');
            safe('statMax',     '100%');
            safe('statMin',     '0%');
            safe('statCount',   '2');
            return;
        }

        const vals   = data.map(d => d.val);
        const avg    = vals.reduce((a, b) => a + b, 0) / vals.length;
        const max    = Math.max(...vals);
        const min    = Math.min(...vals);
        const latest = vals[vals.length - 1];

        safe('statAvg',    avg.toFixed(1)    + config.unit);
        safe('statMax',    max.toFixed(1)    + config.unit);
        safe('statMin',    min.toFixed(1)    + config.unit);
        safe('statCount',  vals.length);
        safe('currentVal', latest.toFixed(1) + config.unit);
    }

    function updateActivityStats() {
        if (!detailChart) return;
        const totalMs  = pumpRunMs + (pumpStartTime ? Date.now() - pumpStartTime : 0);
        const sessionMs = Date.now() - sessionStart;
        const runPct   = sessionMs > 0
            ? Math.min(100, Math.round((totalMs / sessionMs) * 100))
            : 0;
        const idlePct  = 100 - runPct;

        detailChart.data.datasets[0].data = [runPct, idlePct];
        detailChart.update();
        updateStats(runPct);
    }
    const sessionStart = Date.now();

    // ── Refresh chart ──
    function refreshChart() {
        if (!detailChart) return;

        if (chartType === 'activity') {
            updateActivityStats();
            return;
        }

        let displayData = [];
        const now       = Date.now();

        if (currentFilter === 'Live') {
            displayData = [...liveHistoryData];

        } else {
            let filtered = [...historyData];

            if      (currentFilter === 'Day')   filtered = filtered.filter(d => now - d.time <=       86_400_000);
            else if (currentFilter === 'Week')  filtered = filtered.filter(d => now - d.time <=      604_800_000);
            else if (currentFilter === 'Month') filtered = filtered.filter(d => now - d.time <=    2_592_000_000);
            else if (currentFilter === 'Year')  filtered = filtered.filter(d => now - d.time <= 31_536_000_000);
            // 'All' → no filter, use full filtered array

            // Group & label
            if (currentFilter === 'All' || currentFilter === 'Year' || currentFilter === 'Month') {
                // Daily granularity for long ranges
                const dailyMap = new Map();
                filtered.forEach(d => {
                    const key = new Date(d.time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                    if (!dailyMap.has(key) || d.time > dailyMap.get(key).time) {
                        dailyMap.set(key, { ...d, label: key });
                    }
                });
                displayData = Array.from(dailyMap.values());
            } else {
                // Hourly granularity for Day / Week
                const hourMap = new Map();
                filtered.forEach(d => {
                    const date    = new Date(d.time);
                    const hourKey = `${date.toDateString()}_${date.getHours()}`;
                    if (!hourMap.has(hourKey) || d.time > hourMap.get(hourKey).time) {
                        const ampm    = date.getHours() >= 12 ? 'PM' : 'AM';
                        const hour12  = date.getHours() % 12 || 12;
                        const dayName = currentFilter === 'Week'
                            ? date.toLocaleDateString('en-US', { weekday: 'short' }) + ' '
                            : '';
                        hourMap.set(hourKey, { ...d, label: `${dayName}${hour12} ${ampm}` });
                    }
                });
                displayData = Array.from(hourMap.values());
            }

            displayData.sort((a, b) => a.time - b.time);

            displayData = displayData.map(d => ({
                label: d.label,
                val:   +d[chartType] || 0
            }));
        }

        if (displayData.length > 0) {
            detailChart.data.labels               = displayData.map(d => d.label);
            detailChart.data.datasets[0].data     = displayData.map(d => d.val);
            detailChart.update();
            updateStats(displayData);
        }
    }

    // ── Firebase ──
    function setupFirebase() {
        const db = window.hydroGenDB;
        if (!db) {
            console.warn('detail.js: Firebase DB not available.');
            return;
        }

        db.ref('history').on('value', snap => {
            historyData = [];
            snap.forEach(c => {
                const v = c.val();
                if (!v) return;
                historyData.push({
                    soil: +v.soil || 0,
                    temp: +v.temp || 0,
                    hum:  +v.hum  || 0,
                    time: +v.time || Date.now()
                });
            });
            historyData.sort((a, b) => a.time - b.time);
            if (currentFilter !== 'Live') refreshChart();
        });

        db.ref('sensors').on('value', snap => {
            const data = snap.val();
            if (!data) return;

            const now = Date.now();

            const label = new Date(now).toLocaleTimeString([], {
                hour:   '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });

            const val = chartType === 'activity'
                ? (+data.soil || 0)
                : (+data[chartType] || 0);

            // De-duplicate: only push if timestamp changed
            const last = liveHistoryData[liveHistoryData.length - 1];
            if (!last || last.label !== label) {
                liveHistoryData.push({ label, val, time: now });
                if (liveHistoryData.length > 50) liveHistoryData.shift();
            }

            if (currentFilter === 'Live') refreshChart();
        });

        // Pump listener for activity chart
        if (chartType === 'activity') {
            db.ref('controls/pump').on('value', snap => {
                const isOn = (snap.val() === 1);
                if (isOn && !pumpStartTime) {
                    pumpStartTime = Date.now();
                } else if (!isOn && pumpStartTime) {
                    pumpRunMs    += Date.now() - pumpStartTime;
                    pumpStartTime = null;
                }
                updateActivityStats();
            });
        }
    }

    document.querySelectorAll('.time-filter').forEach(btn => {
        btn.onchange = () => {
            const labelEl = btn.nextElementSibling;
            currentFilter = labelEl ? labelEl.innerText.trim() : (btn.value || 'Live');
            refreshChart();
        };
    });

    const downloadBtn = document.getElementById('downloadBtn');
    if (downloadBtn) {
        downloadBtn.onclick = () => {
            if (!detailChart) {
                console.warn('Chart not ready yet.');
                return;
            }
            const link      = document.createElement('a');
            link.download   = `HydroGen_${chartType}_Report.png`;
            link.href       = detailChart.toBase64Image();
            link.click();
        };
    }

    initChart();
    setupFirebase();
});
