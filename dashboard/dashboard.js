// ================= COMPLETE FIXED DASHBOARD.JS =================
// FIXED: Manual pump toggle - Bob appears, NO sound
// FIXED: AI automation - Bob appears WITH sound
// FIXED: Emergency stop - Bob WITH sound
// FIXED: All alerts persist in ring until resolved

// ── Auth Guard ──
(function () {
    if (!localStorage.getItem("hydroUser")) {
        window.location.replace("../landing/landing.html");
    }
})();

const db = window.hydroGenDB;

const envTemp = document.getElementById("envTemp");
const envHum = document.getElementById("envHum");
const envSoil = document.getElementById("envSoil");

const tankFill = document.getElementById("tankLevelFill");
const tankPercent = document.getElementById("tankLevelPercent");
const tankLiters = document.getElementById("tankLevelCm");
const tankCmValue = document.getElementById("tankLevelCmValue");

const pumpToggle = document.getElementById("pumpToggle");
const pumpText = document.getElementById("pumpStatusText");

const maxTankLevelCm = 30;
const maxCapacityLiters = 2;
let lastWaterLevel = null;
let isAIActive = false;
let historyData = [];
let mode = "hour";
let weatherRainExpected = false;
let currentSensorData = null;
let lastPumpState = false;
let chart = null;
let skycons = null;
let rainAlertShown = false;

// ===================== TANK CALCULATION =====================
function waterValueToPercent(waterValue) {
    if (waterValue === undefined || waterValue === null) return 0;
    const clamped = Math.min(12, Math.max(0, waterValue));
    const percent = ((12 - clamped) / 12) * 100;
    return Math.round(percent);
}

function waterValueToLiters(waterValue) {
    return (waterValueToPercent(waterValue) / 100) * maxCapacityLiters;
}

function getWaterHeightCm(waterValue) {
    return (waterValueToPercent(waterValue) / 100) * maxTankLevelCm;
}

// ================= AI CONTROL =================
function calculateWaterNeed(d) {
    let needScore = 0;
    const waterPercent = waterValueToPercent(d.water);
    
    if (d.soil < 20) needScore += 60;
    else if (d.soil < 30) needScore += 50;
    else if (d.soil < 40) needScore += 35;
    else if (d.soil < 50) needScore += 20;
    else if (d.soil > 70) needScore -= 15;
    
    if (d.temp > 38) needScore += 25;
    else if (d.temp > 33) needScore += 18;
    else if (d.temp > 28) needScore += 10;
    else if (d.temp < 15) needScore -= 10;
    
    if (d.hum < 25) needScore += 15;
    else if (d.hum < 35) needScore += 10;
    else if (d.hum > 75) needScore -= 10;
    
    if (waterPercent < 10) needScore = 0;
    else if (waterPercent < 20) needScore = Math.min(needScore, 30);
    else if (waterPercent < 35) needScore = Math.min(needScore, 50);
    
    if (weatherRainExpected) needScore *= 0.6;
    
    return Math.min(100, Math.max(0, Math.round(needScore)));
}

function runAI(d) {
    if (!isAIActive) return;
    
    const waterNeed = calculateWaterNeed(d);
    const waterPercent = waterValueToPercent(d.water);
    let shouldRun = false;
    let reason = "";
    
    // AI decision logic
    if (waterPercent < 10) {
        shouldRun = false;
        reason = `Tank empty (${waterPercent}%) — cannot water`;
    } else if (d.soil < 20 && waterPercent > 15) {
        shouldRun = true;
        reason = `Critical dryness! Soil: ${d.soil}%`;
    } else if (d.soil < 30 && waterPercent > 25 && waterNeed > 50) {
        shouldRun = true;
        reason = `Soil dry (${d.soil}%) — watering needed`;
    } else if (d.soil < 40 && waterPercent > 35 && waterNeed > 40 && !weatherRainExpected) {
        shouldRun = true;
        reason = `Preventive irrigation — Soil: ${d.soil}%`;
    } else if (d.soil >= 45) {
        shouldRun = false;
        reason = `Soil optimal (${d.soil}%) — no watering needed`;
    } else if (weatherRainExpected && d.soil > 35) {
        shouldRun = false;
        reason = `Rain expected — delaying irrigation`;
    } else if (waterPercent < 20) {
        shouldRun = false;
        reason = `Tank low (${waterPercent}%) — preserving water`;
    } else {
        shouldRun = false;
        reason = `Conditions optimal — soil at ${d.soil}%`;
    }
    
    // Only change pump state if different
    if (shouldRun !== lastPumpState) {
        const actionMessage = shouldRun ? `AI started watering - ${reason}` : `AI stopped watering - ${reason}`;
        
        // AI automation - Bob WITH sound (playSound = true)
        window.showBobNotification("🤖 AI Decision", actionMessage, shouldRun ? "success" : "info", 5000, true);
        
        // Add to alerts ring (persists)
        if (shouldRun) {
            window.addAlertToUI(`ai_start_${Date.now()}`, `🤖 AI started watering — ${reason}`, "success", true);
        } else if (lastPumpState === true && !shouldRun) {
            window.addAlertToUI(`ai_stop_${Date.now()}`, `🤖 AI stopped watering — ${reason}`, "info", true);
        }
        
        pumpRef.set(shouldRun ? 1 : 0);
        lastPumpState = shouldRun;
    }
    
    const insightText = document.getElementById("smartInsight");
    if (insightText) {
        insightText.innerHTML = shouldRun ? `🤖 AI: Watering (Need: ${waterNeed}%) - ${reason}` : `🤖 AI: Idle - ${reason}`;
    }
}

// ================= PUMP & AI CONTROL =================
const manualToggle = document.getElementById("pumpToggle");
const aiToggleSwitch = document.getElementById("aiToggle");
let isWritingToPump = false;
let pumpWriteTimer = null;
const pumpRef = db.ref("controls/pump");
let lastPumpValue = null;

function lockPumpWrite() {
    isWritingToPump = true;
    clearTimeout(pumpWriteTimer);
    pumpWriteTimer = setTimeout(() => { isWritingToPump = false; }, 2000);
}

function unlockPumpWrite() {
    clearTimeout(pumpWriteTimer);
    isWritingToPump = false;
}

pumpRef.on("value", snap => {
    const val = !!snap.val();
    
    if (manualToggle && manualToggle.checked !== val && !isWritingToPump) {
        manualToggle.checked = val;
    }
    
    if (lastPumpValue !== null && lastPumpValue !== val && !isWritingToPump && !isAIActive) {
        window.addAlertToUI(`pump_remote_${Date.now()}`, `🔌 Pump turned ${val ? "ON" : "OFF"} from another device`, "warning", true);
    }
    
    lastPumpValue = val;
    lastPumpState = val;
    unlockPumpWrite();
    
    if (pumpText) {
        pumpText.innerText = val ? "ON 🟢" : "OFF 🔴";
        pumpText.className = val ? "status normal" : "status critical";
    }
    
    if (!isAIActive && !isWritingToPump && manualToggle) {
        manualToggle.disabled = false;
    } else if (isAIActive && manualToggle) {
        manualToggle.disabled = true;
    }
    
    if (currentSensorData) {
        updateCardColors(currentSensorData.temp, currentSensorData.hum, currentSensorData.soil, val);
    }
});

// MANUAL PUMP TOGGLE - Bob appears, NO sound
manualToggle?.addEventListener("change", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (isWritingToPump) {
        manualToggle.checked = !manualToggle.checked;
        return;
    }
    
    if (aiToggleSwitch) aiToggleSwitch.checked = false;
    isAIActive = false;
    
    const desired = manualToggle.checked;
    lockPumpWrite();
    
    // MANUAL CONTROL - Bob appears with NO sound (playSound = false)
    window.showBobNotification("🔌 Pump Control", `Pump turned ${desired ? "ON" : "OFF"} manually`, "success", 3000, false);
    
    // Add to alerts ring (success message without sound)
    window.addAlertToUI(`pump_manual_${Date.now()}`, `🔌 Pump turned ${desired ? "ON" : "OFF"} manually`, "success", false);
    
    try {
        await pumpRef.set(desired ? 1 : 0);
    } catch (e) {
        console.error("Pump write failed:", e);
        manualToggle.checked = !desired;
        window.showBobNotification("❌ Error", "Failed to control pump", "warning", 3000, true);
    } finally {
        unlockPumpWrite();
    }
});

// AI MODE TOGGLE
aiToggleSwitch?.addEventListener("change", () => {
    isAIActive = aiToggleSwitch.checked;
    if (isAIActive) {
        // AI Mode activation - Bob with NO sound
        window.showBobNotification("🤖 AI Mode", "Automatic irrigation control activated", "success", 4000, false);
        window.addAlertToUI(`ai_mode_${Date.now()}`, "🤖 AI Mode activated — automatic irrigation control", "success", false);
        if (manualToggle) manualToggle.disabled = true;
        if (currentSensorData) runAI(currentSensorData);
    } else {
        window.showBobNotification("👤 Manual Mode", "Manual control activated", "info", 3000, false);
        window.addAlertToUI(`manual_mode_${Date.now()}`, "👤 Manual Mode activated — you are in control", "info", false);
        if (manualToggle) manualToggle.disabled = false;
        const insightText = document.getElementById("smartInsight");
        if (insightText) insightText.innerHTML = "🔵 Manual Mode Active";
    }
});

// ================= EMERGENCY STOP =================
const emergencyStopBtn = document.getElementById('emergencyStopBtn');
if (emergencyStopBtn) {
    emergencyStopBtn.addEventListener('click', async () => {
        if (confirm('EMERGENCY STOP - Stop all irrigation and pump immediately?')) {
            // Stop all zones in irrigation page (if exists)
            if (typeof window.stopAllZones === 'function') {
                window.stopAllZones();
            }
            
            await pumpRef.set(0);
            
            // EMERGENCY STOP - Bob WITH sound (playSound = true)
            window.showBobNotification("🚨 EMERGENCY STOP", "All irrigation halted and pump stopped!", "critical", 8000, true);
            window.addAlertToUI("emergency_stop", "🚨 EMERGENCY STOP - All irrigation halted and pump stopped", "critical", true);
        }
    });
}

// ================= CREATE CHART =================
function createChart() {
    const ctx = document.getElementById("analyticsChart");
    if (!ctx) return;
    
    if (chart) chart.destroy();
    
    chart = new Chart(ctx, {
        type: "line",
        data: { labels: [], datasets: [
            { label: "Temperature (°C)", data: [], borderColor: "#ff6384", tension: 0.3, fill: false, pointRadius: 3 },
            { label: "Humidity (%)", data: [], borderColor: "#36a2eb", tension: 0.3, fill: false, pointRadius: 3 },
            { label: "Soil Moisture (%)", data: [], borderColor: "#4bc0c0", tension: 0.3, fill: false, pointRadius: 3 },
            { label: "Water Level (%)", data: [], borderColor: "#ffcd56", tension: 0.3, fill: false, pointRadius: 3 }
        ]},
        options: {
            responsive: true,
            maintainAspectRatio: true,
            interaction: { mode: "index", intersect: false },
            plugins: { legend: { position: "top" } },
            scales: { y: { min: 0, max: 100, title: { display: true, text: "Value" } } }
        }
    });
}

// ================= HISTORY LISTENER =================
db.ref("history").on("value", snap => {
    historyData = [];
    const hourMap = new Map();
    
    snap.forEach(child => {
        const v = child.val();
        if (!v) return;
        const waterPercent = waterValueToPercent(v.water);
        const date = new Date(v.time);
        const hourKey = `${date.toDateString()}_${date.getHours()}`;
        
        if (!hourMap.has(hourKey) || v.time > hourMap.get(hourKey).time) {
            hourMap.set(hourKey, {
                temp: +v.temp || 0, hum: +v.hum || 0, soil: +v.soil || 0,
                water: waterPercent,
                time: +v.time || Date.now()
            });
        }
    });
    
    historyData = Array.from(hourMap.values());
    historyData.sort((a, b) => a.time - b.time);
    buildChart();
});

// ================= UPDATE FUNCTIONS =================
function updateCardColors(temp, hum, soil, pumpOn) {
    const tempStatus = document.getElementById("tempStatus");
    if (tempStatus) {
        if (temp > 40) { tempStatus.innerText = "Critical 🔥"; tempStatus.className = "status critical";
        } else if (temp > 30) { tempStatus.innerText = "Hot ⚠️"; tempStatus.className = "status warning";
        } else if (temp < 15) { tempStatus.innerText = "Cold ❄️"; tempStatus.className = "status warning";
        } else { tempStatus.innerText = "Normal ✅"; tempStatus.className = "status normal"; }
    }
    
    const humStatus = document.getElementById("humStatus");
    if (humStatus) {
        if (hum < 20) { humStatus.innerText = "Dry ⚠️"; humStatus.className = "status warning";
        } else if (hum > 80) { humStatus.innerText = "High 💧"; humStatus.className = "status warning";
        } else { humStatus.innerText = "Normal ✅"; humStatus.className = "status normal"; }
    }
    
    const soilStatus = document.getElementById("soilStatus");
    if (soilStatus) {
        if (soil < 20) { soilStatus.innerText = "Critical 🚨"; soilStatus.className = "status critical";
        } else if (soil < 35) { soilStatus.innerText = "Dry ⚠️"; soilStatus.className = "status warning";
        } else { soilStatus.innerText = "Healthy 🌿"; soilStatus.className = "status normal"; }
    }
    
    if (pumpText) {
        pumpText.innerText = pumpOn ? "ON 🟢" : "OFF 🔴";
        pumpText.className = pumpOn ? "status normal" : "status critical";
    }
}

function updateWaterPrediction(d) {
    let msg = "Stable ✅";
    if (d.soil < 25) msg = "Water needed soon 🚨";
    else if (d.hum > 80) msg = "Rain expected 🌧";
    const el = document.getElementById("waterPrediction");
    if (el) el.innerText = msg;
}

function updateSystemHealth(d) {
    let score = 100;
    if (d.temp > 40) score -= 25;
    if (d.soil < 25) score -= 35;
    if (d.hum < 25) score -= 20;
    const waterPercent = waterValueToPercent(d.water);
    if (waterPercent < 20) score -= 30;
    let status = score > 70 ? "Excellent ✅" : (score > 40 ? "Warning ⚠️" : "Critical 🚨");
    const el = document.getElementById("systemHealth");
    if (el) el.innerText = status + " (" + Math.max(0, score) + "%)";
}

function updateSmartInsight(d) {
    let msg = "✅ System Optimal";
    const waterPercent = waterValueToPercent(d.water);
    if (d.soil < 25 && d.temp > 32 && waterPercent > 20) msg = "🚿 ACTION: Start watering now";
    else if (d.soil < 20 && waterPercent > 15) msg = "🚨 ACTION: Immediate irrigation required";
    else if (d.hum > 85) msg = "⏸ ACTION: Stop watering (Rain expected)";
    else if (waterPercent < 15) msg = "⚠️ ACTION: Refill water tank - Tank empty!";
    else if (waterPercent < 30) msg = "⚠️ ACTION: Water tank low - Refill soon";
    else if (d.temp > 38) msg = "🔥 ACTION: Provide shade, extreme heat";
    else if (d.hum < 25) msg = "💨 ACTION: Increase humidity";
    const el = document.getElementById("smartInsight");
    if (el && !isAIActive) el.innerText = msg;
}

function updatePlantStress(d) {
    let stress = 0;
    if (d.temp > 35) stress += 30;
    if (d.soil < 30) stress += 45;
    if (d.hum < 30) stress += 25;
    let level = stress > 70 ? "High 🚨" : (stress > 40 ? "Medium ⚠️" : "Low 🌿");
    const el = document.getElementById("plantStress");
    if (el) el.innerText = level + " (" + stress + "%)";
}

// ================= LIVE SENSOR LISTENER =================
db.ref("sensors").on("value", async (snap) => {
    const d = snap.val();
    if (!d) return;
    
    currentSensorData = d;
    if (envTemp) envTemp.innerText = d.temp + " °C";
    if (envHum) envHum.innerText = d.hum + " %";
    if (envSoil) envSoil.innerText = d.soil + " %";
    
    const waterPercent = waterValueToPercent(d.water);
    const volume = waterValueToLiters(d.water);
    const waterHeightCm = getWaterHeightCm(d.water);
    
    if (tankFill) tankFill.style.height = waterPercent + "%";
    const tankProgressFill = document.getElementById("tankProgressFill");
    if (tankProgressFill) tankProgressFill.style.width = waterPercent + "%";
    const tankPercentText = document.getElementById("tankPercentText");
    if (tankPercentText) tankPercentText.innerHTML = Math.round(waterPercent) + "%";
    const tankLitersText = document.getElementById("tankLitersText");
    if (tankLitersText) tankLitersText.innerHTML = volume.toFixed(2) + " / 2.0 L";
    if (tankPercent) tankPercent.innerText = Math.round(waterPercent) + "%";
    if (tankLiters) tankLiters.innerText = volume.toFixed(2) + " L";
    if (tankCmValue) tankCmValue.innerText = waterHeightCm.toFixed(1) + " cm";
    
    const tankCapacityText = document.getElementById("tankCapacityText");
    if (tankCapacityText) tankCapacityText.innerText = "2.0 Liters";
    const tankCapacityCm = document.getElementById("tankCapacityCm");
    if (tankCapacityCm) tankCapacityCm.innerText = "30 cm";
    
    const pumpSnapshot = await pumpRef.once('value');
    updateCardColors(d.temp, d.hum, d.soil, pumpSnapshot.val() === 1);
    updateWaterPrediction(d);
    updateSystemHealth(d);
    updateSmartInsight(d);
    updatePlantStress(d);
    
    lastWaterLevel = waterPercent;
    
    const now = new Date();
    const existingIndex = historyData.findIndex(item => {
        const itemDate = new Date(item.time);
        return itemDate.toDateString() === now.toDateString() && itemDate.getHours() === now.getHours();
    });
    
    const newEntry = { temp: d.temp, hum: d.hum, soil: d.soil, water: waterPercent, time: Date.now() };
    
    if (existingIndex >= 0) {
        historyData[existingIndex] = newEntry;
    } else {
        historyData.push(newEntry);
        await db.ref('history').push({ temp: d.temp, hum: d.hum, soil: d.soil, water: d.water, time: Date.now() });
    }
    
    historyData.sort((a, b) => a.time - b.time);
    if (historyData.length > 48) historyData = historyData.slice(-48);
    
    buildChart();
    if (isAIActive) runAI(d);
});

// ================= CHART MODE SETTER =================
window.setMode = function(m) {
    mode = m;
    buildChart();
};

function buildChart() {
    if (!chart) return;
    chart.data.labels = [];
    chart.data.datasets.forEach(ds => ds.data = []);
    if (historyData.length === 0) { chart.update(); return; }
    
    if (mode === "hour") {
        const displayData = historyData.slice(-12);
        displayData.forEach(d => {
            const date = new Date(d.time);
            let hour = date.getHours();
            let ampm = hour >= 12 ? 'PM' : 'AM';
            let hour12 = hour % 12 || 12;
            chart.data.labels.push(`${hour12}:00 ${ampm}`);
            chart.data.datasets[0].data.push(d.temp);
            chart.data.datasets[1].data.push(d.hum);
            chart.data.datasets[2].data.push(d.soil);
            chart.data.datasets[3].data.push(d.water);
        });
    } else if (mode === "day") {
        const dailyMap = new Map();
        historyData.forEach(d => {
            const dayKey = new Date(d.time).toLocaleDateString("en-GB");
            if (!dailyMap.has(dayKey) || d.time > dailyMap.get(dayKey).time) {
                dailyMap.set(dayKey, { temp: d.temp, hum: d.hum, soil: d.soil, water: d.water, time: d.time, label: dayKey });
            }
        });
        Array.from(dailyMap.values()).slice(-7).forEach(day => {
            chart.data.labels.push(day.label);
            chart.data.datasets[0].data.push(day.temp);
            chart.data.datasets[1].data.push(day.hum);
            chart.data.datasets[2].data.push(day.soil);
            chart.data.datasets[3].data.push(day.water);
        });
    } else if (mode === "month") {
        const monthlyMap = new Map();
        historyData.forEach(d => {
            const monthKey = new Date(d.time).toLocaleDateString("en-GB", { month: 'short', year: 'numeric' });
            if (!monthlyMap.has(monthKey) || d.time > monthlyMap.get(monthKey).time) {
                monthlyMap.set(monthKey, { temp: d.temp, hum: d.hum, soil: d.soil, water: d.water, time: d.time, label: monthKey });
            }
        });
        Array.from(monthlyMap.values()).slice(-6).forEach(month => {
            chart.data.labels.push(month.label);
            chart.data.datasets[0].data.push(month.temp);
            chart.data.datasets[1].data.push(month.hum);
            chart.data.datasets[2].data.push(month.soil);
            chart.data.datasets[3].data.push(month.water);
        });
    }
    chart.update();
}

// ================= WEATHER WITH SKYCONS + RAIN ALERT =================
const WEATHER_API_KEY = "5dd74768dc40a34a27ac51503c655bec";
const CITY = "Port Said";

function initSkycons() {
    if (typeof Skycons !== 'undefined') {
        skycons = new Skycons({ color: "#ffffff", monochrome: false });
        skycons.play();
    }
}

function mapWeatherToSkycon(condition) {
    const c = condition.toLowerCase();
    if (c.includes('thunderstorm')) return Skycons.RAIN;
    if (c.includes('rain')) return Skycons.RAIN;
    if (c.includes('drizzle')) return Skycons.SLEET;
    if (c.includes('snow')) return Skycons.SNOW;
    if (c.includes('mist') || c.includes('fog') || c.includes('haze')) return Skycons.FOG;
    if (c.includes('clear')) return Skycons.CLEAR_DAY;
    return Skycons.PARTLY_CLOUDY_DAY;
}

window.loadWeather = async function() {
    const weatherMain = document.getElementById("weatherMain");
    const weatherForecast = document.getElementById("weatherForecast");
    const refreshBtn = document.getElementById("weatherRefreshBtn");
    
    if (!weatherMain || !weatherForecast) return;
    if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refresh';
    }
    
    try {
        const res = await fetch(`https://api.openweathermap.org/data/2.5/forecast?q=${CITY}&appid=${WEATHER_API_KEY}&units=metric`);
        const data = await res.json();
        if (data.cod !== "200") throw new Error();
        
        const now = new Date();
        const currentWeather = data.list[0];
        const skyconType = mapWeatherToSkycon(currentWeather.weather[0].main);
        const iconId = `weatherIcon_${Date.now()}`;
        
        weatherMain.innerHTML = `
            <div class="d-flex justify-content-between align-items-center flex-wrap mt-2">
                <div>
                    <h5 class="mb-0">📍 ${CITY}, Egypt</h5>
                    <small>${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</small>
                    <div class="mt-1"><small>⏰ ${now.toLocaleTimeString()}</small></div>
                </div>
                <div class="text-end">
                    <canvas id="${iconId}" width="48" height="48" style="margin: 0 auto;"></canvas>
                    <div class="display-6">${Math.round(currentWeather.main.temp)}°C</div>
                    <small class="text-capitalize">${currentWeather.weather[0].description}</small>
                </div>
            </div>
            <div class="row mt-3 text-center">
                <div class="col-4">
                    <small>Feels Like</small>
                    <div class="fw-bold">${Math.round(currentWeather.main.feels_like)}°C</div>
                </div>
                <div class="col-4">
                    <small>Humidity</small>
                    <div class="fw-bold">${currentWeather.main.humidity}%</div>
                </div>
                <div class="col-4">
                    <small>Wind</small>
                    <div class="fw-bold">${Math.round(currentWeather.wind.speed)} km/h</div>
                </div>
            </div>
        `;
        
        if (skycons) {
            skycons.add(iconId, skyconType);
            setTimeout(() => skycons.play(), 100);
        }
        
        // Check for rain in next 3 forecast periods
        const rainExpected = data.list.slice(0, 3).some(item => 
            item.weather[0].main.toLowerCase().includes('rain')
        );
        
        // RAIN ALERT - Bob with NO sound (just info)
        if (rainExpected && !rainAlertShown) {
            rainAlertShown = true;
            window.showBobNotification("🌧️ Rain Expected", "Rain coming soon! Natural irrigation will help your plants.", "success", 8000, false);
            window.addAlertToUI(`rain_alert_${Date.now()}`, "🌧️ Rain expected in the next few hours", "warning", true);
        } else if (!rainExpected && rainAlertShown) {
            rainAlertShown = false;
        }
        
        weatherRainExpected = rainExpected;
        window.weatherRainExpected = rainExpected;
        
        let forecastHtml = '';
        data.list.slice(0, 6).forEach((item, idx) => {
            const time = new Date(item.dt_txt);
            const forecastIconId = `forecastIcon_${Date.now()}_${idx}`;
            const isRain = item.weather[0].main.toLowerCase().includes('rain');
            const rainBadge = isRain ? '<span class="badge bg-info mt-1">🌧️ Rain</span>' : '';
            forecastHtml += `
                <div class="forecast-item">
                    <div class="small">${time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    <canvas id="${forecastIconId}" width="32" height="32"></canvas>
                    <div class="fw-bold">${Math.round(item.main.temp)}°C</div>
                    <small class="d-block text-capitalize">${item.weather[0].description}</small>
                    ${rainBadge}
                </div>
            `;
        });
        weatherForecast.innerHTML = forecastHtml;
        
        if (skycons) {
            data.list.slice(0, 6).forEach((item, idx) => {
                const forecastSkycon = mapWeatherToSkycon(item.weather[0].main);
                const forecastIconId = `forecastIcon_${Date.now()}_${idx}`;
                skycons.add(forecastIconId, forecastSkycon);
            });
            setTimeout(() => skycons.play(), 200);
        }
        
    } catch (err) {
        console.error(err);
        weatherMain.innerHTML = '<div class="text-danger mt-2">❌ Weather connection error</div>';
    } finally {
        if (refreshBtn) {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
        }
    }
};

// ================= PDF REPORT =================
window.downloadPDF = async function(reportType) {
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('l', 'mm', 'a4');
        
        const primary = [41, 128, 185];
        
        doc.setFillColor(...primary);
        doc.rect(0, 0, 297, 35, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(22);
        doc.text("HydroGen Smart Report", 20, 22);
        doc.setFontSize(12);
        doc.text(`${reportType.toUpperCase()} REPORT`, 20, 32);
        doc.setFontSize(9);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 200, 20);
        
        let y = 50;
        doc.setFontSize(14);
        doc.text("Current Sensor Readings", 20, y);
        y += 10;
        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);
        if (envTemp) doc.text(`Temperature: ${envTemp.innerText}`, 20, y); y += 8;
        if (envHum) doc.text(`Humidity: ${envHum.innerText}`, 20, y); y += 8;
        if (envSoil) doc.text(`Soil Moisture: ${envSoil.innerText}`, 20, y); y += 8;
        
        const sensors = await db.ref('sensors').once('value');
        const waterValue = sensors.val()?.water || 12;
        doc.text(`Water Tank: ${waterValueToPercent(waterValue)}% (${waterValueToLiters(waterValue).toFixed(2)}L / 2L)`, 20, y); y += 15;
        
        doc.text(`AI Mode: ${isAIActive ? "ACTIVE 🤖" : "MANUAL 👤"}`, 20, y); y += 10;
        
        doc.setFillColor(...primary);
        doc.rect(0, 200, 297, 10, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.text("HydroGen AI System © 2026 - Smart Irrigation • Data Driven • Sustainable", 20, 207);
        
        doc.save(`HydroGen_${reportType}_Report.pdf`);
        window.showBobNotification("📄 Report downloaded", `Your ${reportType} report is ready`, "success", 3000, false);
        
    } catch (error) {
        console.error("PDF Error:", error);
        window.showBobNotification("❌ PDF Failed", "Could not generate report", "warning", 3000, true);
    }
};

// ================= CHAT FUNCTIONS =================
window.quickAsk = function(q) {
    const input = document.getElementById('userInput');
    if (input) {
        input.value = q;
        if (typeof window.sendChatMessage === 'function') {
            window.sendChatMessage();
        }
    }
};

window.toggleChat = function() {
    const w = document.getElementById('chatWindow');
    if (w) w.style.display = w.style.display === 'flex' ? 'none' : 'flex';
};

// ================= STOP ALL ZONES FUNCTION =================
window.stopAllZones = async function() {
    // This will be called from emergency stop to also stop zones in irrigation page
    if (typeof window.loadZones === 'function') {
        // The irrigation page will handle stopping zones
        console.log("Emergency stop: Zones will be stopped");
    }
};

// ================= INITIALIZE =================
function init() {
    createChart();
    initSkycons();
    loadWeather();
    setInterval(loadWeather, 300000);
}

init();