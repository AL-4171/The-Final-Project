/**
 * analytics.js
 * Handles real-time data visualization and historical chart tracking
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize UI Elements
    const totalProducedEl = document.getElementById('totalProduced');
    const totalRuntimeEl = document.getElementById('totalRuntime');
    const totalCyclesEl = document.getElementById('totalCycles');
    const runPctEl = document.getElementById('runPct');
    const idlePctEl = document.getElementById('idlePct');
    const runProgress = document.getElementById('runProgress');
    const idleProgress = document.getElementById('idleProgress');

    // 2. Chart Contexts
    const soilCtx = document.getElementById('soilChart').getContext('2d');
    const tempCtx = document.getElementById('tempChart').getContext('2d');
    const humCtx = document.getElementById('humChart').getContext('2d');
    const activityCtx = document.getElementById('activityChart').getContext('2d');

    // Chart instances
    let soilChart, tempChart, humChart, activityChart;

    // UI Elements
    const saveToastEl = document.getElementById('saveToast');
    let saveToast = null;
    if (saveToastEl) saveToast = new bootstrap.Toast(saveToastEl);

    // Data storage for live session history
    let historyData = [];
    let liveHistoryData = []; // Last 20 live points
    // Read the default filter from whichever radio is checked in the HTML
    // (avoids UI/logic mismatch if HTML default ever changes)
    const checkedFilter = document.querySelector('.time-filter:checked');
    let currentFilter = checkedFilter
        ? (checkedFilter.nextElementSibling?.innerText?.trim() || 'All')
        : 'All';

    // Pump Stats
    let pumpStartTime = null;
    let totalRunMinutes = 0;
    let cycleCount = 0;
    let sessionStartTime = Date.now();

    // -- NEW: PERSISTENCE LOGIC --
    function loadSavedData() {
        const savedStats = localStorage.getItem('hydroGenAnalyticsStats');

        if (savedStats) {
            const stats = JSON.parse(savedStats);
            totalRunMinutes = stats.totalRunMinutes || 0;
            cycleCount = stats.cycleCount || 0;
            sessionStartTime = stats.sessionStartTime || Date.now();

            // UI Update
            totalRuntimeEl.innerText = totalRunMinutes.toFixed(1);
            totalCyclesEl.innerText = cycleCount;
        }
    }

    function saveToLocal() {
        localStorage.setItem('hydroGenAnalyticsStats', JSON.stringify({
            totalRunMinutes,
            cycleCount,
            sessionStartTime
        }));
    }

    function clearAllData() {
        const confirmed = window.confirm(
            'Clear all analytics data? This cannot be undone.'
        );
        if (!confirmed) return;
        localStorage.removeItem('hydroGenAnalyticsStats');
        location.reload();
    }
    // ---------------------------

    function createLineConfig(label, color) {
        return {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: label,
                    data: [],
                    borderColor: color,
                    backgroundColor: color + '20',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 0,
                    pointHoverRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { display: false } },
                    x: { grid: { display: false }, ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 8 } }
                }
            }
        };
    }

    function initCharts() {
        soilChart = new Chart(soilCtx, createLineConfig('Soil Moisture', '#22c55e'));
        tempChart = new Chart(tempCtx, createLineConfig('Temperature', '#ef4444'));
        humChart = new Chart(humCtx, createLineConfig('Humidity', '#0ea5e9'));

        // Activity Doughnut
        activityChart = new Chart(activityCtx, {
            type: 'doughnut',
            data: {
                labels: ['Running', 'Idle'],
                datasets: [{
                    data: [0, 100],
                    backgroundColor: ['#4f46e5', '#f1f5f9'],
                    borderWidth: 0,
                    cutout: '75%'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });
    }

    function updateCharts() {
        if (!soilChart || !tempChart || !humChart) return;

        let displayData = [];
        const now = Date.now();

        if (currentFilter === 'Live') {
            displayData = [...liveHistoryData];
        } else {
            let filteredData = [...historyData];

            // Apply Time Filter
            if (currentFilter === 'Day') {
                filteredData = filteredData.filter(d => now - d.time <= 24 * 60 * 60 * 1000);
            } else if (currentFilter === 'Week') {
                filteredData = filteredData.filter(d => now - d.time <= 7 * 24 * 60 * 60 * 1000);
            } else if (currentFilter === 'Month') {
                filteredData = filteredData.filter(d => now - d.time <= 30 * 24 * 60 * 60 * 1000);
            } else if (currentFilter === 'Year') {
                filteredData = filteredData.filter(d => now - d.time <= 365 * 24 * 60 * 60 * 1000);
            }

            // Downsample data if too large based on filter
            if (currentFilter === 'All' || currentFilter === 'Year' || currentFilter === 'Month') {
                // Group by day for longer periods
                const dailyMap = new Map();
                filteredData.forEach(d => {
                    const dayKey = new Date(d.time).toLocaleDateString("en-GB", { day: 'numeric', month: 'short' });
                    if (!dailyMap.has(dayKey) || d.time > dailyMap.get(dayKey).time) {
                        dailyMap.set(dayKey, { ...d, label: dayKey });
                    }
                });
                displayData = Array.from(dailyMap.values());
            } else {
                // Group by hour for day/week
                const hourMap = new Map();
                filteredData.forEach(d => {
                    const date = new Date(d.time);
                    const hourKey = `${date.toDateString()}_${date.getHours()}`;
                    if (!hourMap.has(hourKey) || d.time > hourMap.get(hourKey).time) {
                        let ampm = date.getHours() >= 12 ? 'PM' : 'AM';
                        let hour12 = date.getHours() % 12 || 12;
                        let dayName = currentFilter === 'Week' ? date.toLocaleDateString('en-US', { weekday: 'short' }) + ' ' : '';
                        hourMap.set(hourKey, { ...d, label: `${dayName}${hour12} ${ampm}` });
                    }
                });
                displayData = Array.from(hourMap.values());
            }
            displayData.sort((a, b) => a.time - b.time);
        }

        // Update Soil Chart
        soilChart.data.labels = displayData.map(d => d.label);
        soilChart.data.datasets[0].data = displayData.map(d => d.soil);
        soilChart.update();

        // Update Temp Chart
        tempChart.data.labels = displayData.map(d => d.label);
        tempChart.data.datasets[0].data = displayData.map(d => d.temp);
        tempChart.update();

        // Update Humidity Chart
        humChart.data.labels = displayData.map(d => d.label);
        humChart.data.datasets[0].data = displayData.map(d => d.hum);
        humChart.update();
    }

    // 4. Analysis Panels - Populate with real data
    function updateAnalysisPanels(currentData) {
        const now = Date.now();
        const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
        const recent7 = historyData.filter(d => d.time >= sevenDaysAgo);
        const dataSource = recent7.length > 0 ? recent7 : historyData;

        // --- SOIL MOISTURE ANALYSIS ---
        if (dataSource.length > 0) {
            const soilValues = dataSource.map(d => d.soil);
            const avgSoil = (soilValues.reduce((a, b) => a + b, 0) / soilValues.length);
            const optimalCount = soilValues.filter(v => v >= 30 && v <= 70).length;
            const totalCount = soilValues.length;
            const healthPct = Math.round((optimalCount / totalCount) * 100);
            const attentionCount = soilValues.filter(v => v < 30).length;

            const el1 = document.getElementById('soilOptimalZones');
            const el2 = document.getElementById('soilHealthPct');
            const el3 = document.getElementById('soilAvgMoisture');
            const el4 = document.getElementById('soilAttentionCount');
            const el5 = document.getElementById('soilAttentionZone');

            if (el1) el1.innerText = optimalCount + '/' + totalCount;
            if (el2) el2.innerText = healthPct + '% healthy';
            if (el3) el3.innerText = avgSoil.toFixed(1) + '%';
            if (el4) el4.innerText = attentionCount;
            if (el5) el5.innerText = attentionCount > 0 ? 'Low moisture' : 'All good';
        }

        // --- TEMPERATURE ANALYSIS ---
        if (dataSource.length > 0) {
            const tempValues = dataSource.map(d => d.temp);
            const avgTemp = (tempValues.reduce((a, b) => a + b, 0) / tempValues.length);
            const peakTemp = Math.max(...tempValues);
            const currentTemp = currentData ? currentData.temp : tempValues[tempValues.length - 1];

            const elCur = document.getElementById('tempCurrent');
            const elAvg = document.getElementById('tempAvg7');
            const elPeak = document.getElementById('tempPeak');
            const elBar = document.getElementById('tempProgressBar');

            if (elCur) elCur.innerText = currentTemp + '°C';
            if (elAvg) elAvg.innerText = avgTemp.toFixed(1) + '°C';
            if (elPeak) elPeak.innerText = peakTemp + '°C';
            if (elBar) elBar.style.width = Math.min(100, (currentTemp / 50) * 100) + '%';
        }

        // --- HUMIDITY ANALYSIS ---
        if (dataSource.length > 0) {
            const humValues = dataSource.map(d => d.hum);
            const avgHum = (humValues.reduce((a, b) => a + b, 0) / humValues.length);
            const peakHum = Math.max(...humValues);
            const currentHum = currentData ? currentData.hum : humValues[humValues.length - 1];

            const elCur = document.getElementById('humCurrent');
            const elAvg = document.getElementById('humAvg7');
            const elPeak = document.getElementById('humPeak');
            const elBar = document.getElementById('humProgressBar');

            if (elCur) elCur.innerText = currentHum + '%';
            if (elAvg) elAvg.innerText = avgHum.toFixed(1) + '%';
            if (elPeak) elPeak.innerText = peakHum + '%';
            if (elBar) elBar.style.width = Math.min(100, currentHum) + '%';
        }
    }

    // 5. Firebase Integration
    function setupFirebase() {
        if (!window.hydroGenDB) {
            console.error('Firebase DB not found');
            return;
        }

        const historyRef = window.hydroGenDB.ref('history');
        const pumpRef = window.hydroGenDB.ref('controls/pump');
        const sensorsRef = window.hydroGenDB.ref('sensors');

        // History Listener for Historical Data (Like Dashboard)
        historyRef.on('value', (snapshot) => {
            historyData = [];
            snapshot.forEach(child => {
                const v = child.val();
                if (!v) return;
                historyData.push({
                    temp: +v.temp || 0,
                    hum: +v.hum || 0,
                    soil: +v.soil || 0,
                    waterRaw: v.water,
                    time: +v.time || Date.now()
                });
            });

            historyData.sort((a, b) => a.time - b.time);
            updateCharts();
            updateAnalysisPanels(null);
        });

        // Sensor Listener (Live updates for metrics)
        sensorsRef.on('value', (snapshot) => {
            const data = snapshot.val();
            if (!data) return;

            // Maintain liveHistoryData for real-time charts (last 20 points)
            const nowTime = Date.now();
            const timeStr = new Date(nowTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            if (liveHistoryData.length === 0 || liveHistoryData[liveHistoryData.length - 1].label !== timeStr) {
                liveHistoryData.push({
                    temp: data.temp || 0,
                    hum: data.hum || 0,
                    soil: data.soil || 0,
                    waterRaw: data.water,
                    time: nowTime,
                    label: timeStr
                });

                if (liveHistoryData.length > 20) {
                    liveHistoryData.shift();
                }

                if (currentFilter === 'Live') {
                    updateCharts();
                }
            }

            const rawWaterNum = isNaN(+data.water) ? 0 : +data.water;
            const waterPct    = Math.min(100, Math.max(0, (rawWaterNum / 30) * 100));
            const waterLitres = (waterPct / 100 * 200).toFixed(1);
            if (totalProducedEl) totalProducedEl.innerText = waterLitres;

            // Update analysis panels with live current values
            updateAnalysisPanels(data);
        });

        // Pump Listener for Analytics
        pumpRef.on('value', (snapshot) => {
            const isActive = (snapshot.val() === 1);
            if (isActive) {
                if (!pumpStartTime) {
                    pumpStartTime = Date.now();
                    cycleCount++;
                    if (totalCyclesEl) totalCyclesEl.innerText = cycleCount;
                    saveToLocal();
                }
            } else {
                if (pumpStartTime) {
                    const durationMs = Date.now() - pumpStartTime;
                    totalRunMinutes += (durationMs / 60000);
                    pumpStartTime = null;
                    if (totalRuntimeEl) totalRuntimeEl.innerText = totalRunMinutes.toFixed(1);
                    saveToLocal();
                }
            }
            updateActivityStats();
        });
    }

    function updateActivityStats() {
        const totalSessionMs = Date.now() - sessionStartTime;
        let currentRunMs = totalRunMinutes * 60000;
        if (pumpStartTime) {
            currentRunMs += (Date.now() - pumpStartTime);
        }

        const runPct = Math.min(100, Math.round((currentRunMs / totalSessionMs) * 100)) || 0;
        const idlePct = 100 - runPct;

        // Update Text
        if (runPctEl) runPctEl.innerText = runPct + '%';
        if (idlePctEl) idlePctEl.innerText = idlePct + '%';

        // Update Progress Bars
        if (runProgress) runProgress.style.width = runPct + '%';
        if (idleProgress) idleProgress.style.width = idlePct + '%';

        // Update Chart
        if (activityChart) {
            activityChart.data.datasets[0].data = [runPct, idlePct];
            activityChart.update();
        }
    }

    // Refresh activity stats periodically
    setInterval(updateActivityStats, 5000);

    // Reset Data Listener
    const clearBtn = document.getElementById('clearAnalyticsBtn');
    if (clearBtn) clearBtn.onclick = clearAllData;

    // Filter Listeners — read from label text but trim whitespace defensively
    document.querySelectorAll('.time-filter').forEach(btn => {
        btn.onchange = () => {
            const labelEl = btn.nextElementSibling;
            currentFilter = labelEl ? labelEl.innerText.trim() : btn.value;
            updateCharts();
            showFeedback(`Viewing ${currentFilter} data`);
        };
    });

    // Helper for toasts
    function showFeedback(msg) {
        if (saveToast && saveToastEl) {
            saveToastEl.querySelector('.toast-body').innerText = msg;
            saveToast.show();
        } else {
            console.log('Feedback:', msg);
        }
    }

    // Initial load
    loadSavedData();
    initCharts();
    setupFirebase();

    // Chart Click Handlers for Expansion
    document.querySelectorAll('.clickable-chart').forEach(card => {
        card.addEventListener('click', () => {
            const chartType = card.getAttribute('data-chart');
            if (chartType) {
                window.open(`detail.html?type=${chartType}`, '_blank');
            }
        });
    });
});
