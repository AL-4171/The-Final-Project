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

const maxTankLevelCm = 12;
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
// Returns FLOOR value for tank fill bar (16%)
function waterValueToPercent(waterValue) {
    if (waterValue === undefined || waterValue === null) return 0;
    const clamped = Math.min(12, Math.max(0, waterValue));
    return Math.floor(((12 - clamped) / 12) * 100);
}

// Returns EXACT value with 2 decimals for toggle display (16.67%)
function waterValueToPercentExact(waterValue) {
    if (waterValue === undefined || waterValue === null) return 0;
    const clamped = Math.min(12, Math.max(0, waterValue));
    const percent = ((12 - clamped) / 12) * 100;
    return parseFloat(percent.toFixed(2));
}

// Returns EXACT liters with 2 decimals (0.33 L)
function waterValueToLiters(waterValue) {
    const clamped = Math.min(12, Math.max(0, waterValue));
    const exactPercent = ((12 - clamped) / 12) * 100;
    const liters = (exactPercent / 100) * maxCapacityLiters;
    return parseFloat(liters.toFixed(2));
}

// Returns EXACT cm with 2 decimals (5.00 cm)
function getWaterHeightCm(waterValue) {
    const clamped = Math.min(12, Math.max(0, waterValue));
    const exactPercent = ((12 - clamped) / 12) * 100;
    const cm = (exactPercent / 100) * maxTankLevelCm;
    return parseFloat(cm.toFixed(2));
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
    
    const waterPercent = waterValueToPercent(d.water);           // FLOOR for bar (16)
    const waterPercentExact = waterValueToPercentExact(d.water); // EXACT for toggle (16.67)
    const volume = waterValueToLiters(d.water);                  // EXACT for liters (0.33)
    const waterHeightCm = getWaterHeightCm(d.water);             // EXACT for cm (5.00)
    
    // Tank fill bar (uses FLOOR)
    if (tankFill) tankFill.style.height = waterPercent + "%";
    const tankProgressFill = document.getElementById("tankProgressFill");
    if (tankProgressFill) tankProgressFill.style.width = waterPercent + "%";
    
    // Toggle percent display (uses EXACT with 2 decimals - shows 16.67%)
    const tankPercentText = document.getElementById("tankPercentText");
    if (tankPercentText) tankPercentText.innerHTML = waterPercentExact + "%";
    
    // Liters display (EXACT with 2 decimals - shows 0.33 L)
    const tankLitersText = document.getElementById("tankLitersText");
    if (tankLitersText) tankLitersText.innerHTML = volume.toFixed(2) + " / 2.0 L";
    
    // Percent inside tank (uses FLOOR - shows 16%)
    if (tankPercent) tankPercent.innerText = waterPercent + "%";
    
    // Liters value (EXACT with 2 decimals - shows 0.33 L)
    if (tankLiters) tankLiters.innerText = volume.toFixed(2) + " L";
    
    // CM height (EXACT with 2 decimals - shows 5.00 cm)
    if (tankCmValue) tankCmValue.innerText = waterHeightCm.toFixed(2) + " cm";
    const tankCapacityText = document.getElementById("tankCapacityText");
    if (tankCapacityText) tankCapacityText.innerText = "2.0 Liters";
    const tankCapacityCm = document.getElementById("tankCapacityCm");
    if (tankCapacityCm) tankCapacityCm.innerText = "12 cm";
    
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

// ================= WEATHER WITH SKYCONS + RAIN ALERT =================
const WEATHER_API_KEY = "5dd74768dc40a34a27ac51503c655bec";
const CITY = "Port Said";

// ── Skycons init ───────────────────────────────────────────────────
function initSkycons() {
    if (typeof Skycons !== "undefined" && !skycons) {
        skycons = new Skycons({ color: "#ffffff", monochrome: false });
        skycons.play();
    }
}

// ── Smart day/night using API timezone offset ──────────────────────
// Converts dt to the city's local hour, then compares against
// sunrise/sunset LOCAL hours. Works correctly across all forecast days.
function _isNight(dt, tzOffset, srHour, ssHour) {
    var localHour = new Date((dt + tzOffset) * 1000).getUTCHours();
    // srHour/ssHour are also derived in local city time
    return localHour < srHour || localHour >= ssHour;
}

// ── Condition → Skycon string ──────────────────────────────────────
function mapWeatherToSkycon(condition, description, dt, tzOffset, srHour, ssHour) {
    var c = (condition   || "").toLowerCase();
    var d = (description || "").toLowerCase();
    var night = _isNight(dt, tzOffset, srHour, ssHour);

    if (c.includes("thunderstorm"))                               return "rain";
    if (c.includes("drizzle"))                                    return "sleet";
    if (c.includes("rain"))                                       return "rain";
    if (c.includes("snow")) return d.includes("sleet") ? "sleet" : "snow";
    if (c.includes("mist")  || c.includes("fog")  || c.includes("haze")  ||
        c.includes("smoke") || c.includes("dust") || c.includes("sand")  ||
        c.includes("ash")   || c.includes("squall") || c.includes("tornado")) return "fog";
    if (c.includes("clear"))
        return night ? "clear-night" : "clear-day";
    if (d.includes("few clouds") || d.includes("scattered"))
        return night ? "partly-cloudy-night" : "partly-cloudy-day";
    if (c.includes("cloud")) return "cloudy";
    if (c.includes("wind"))  return "wind";
    return night ? "partly-cloudy-night" : "partly-cloudy-day";
}

// ── Condition → theme class ────────────────────────────────────────
function conditionToTheme(condition) {
    var c = (condition || "").toLowerCase();
    if (c.includes("thunderstorm"))                                    return "theme-storm";
    if (c.includes("rain") || c.includes("drizzle"))                  return "theme-rain";
    if (c.includes("snow"))                                            return "theme-snow";
    if (c.includes("mist") || c.includes("fog") || c.includes("haze")) return "theme-fog";
    if (c.includes("clear"))                                           return "theme-clear";
    return "theme-clouds";
}

function applyTheme(condition) {
    var card = document.getElementById("weatherCard");
    if (!card) return;
    var themes = ["theme-clear","theme-rain","theme-storm","theme-snow","theme-fog","theme-clouds"];
    card.classList.remove.apply(card.classList, themes);
    card.classList.add(conditionToTheme(condition));
}

// ── Safe Skycon attach ─────────────────────────────────────────────
function safeAddSkycon(id, type, retries) {
    if (retries === undefined) retries = 20;
    if (typeof Skycons === "undefined") return;
    if (!skycons) initSkycons();
    if (!skycons) return;
    var el = document.getElementById(id);
    if (el) {
        try { skycons.add(id, type); } catch (e) {}
        skycons.play();
    } else if (retries > 0) {
        requestAnimationFrame(function () { safeAddSkycon(id, type, retries - 1); });
    }
}

// ── Live clock ─────────────────────────────────────────────────────
var _clockInterval = null;
function startLiveClock() {
    // Always kill the previous ticker first — prevents orphaned intervals
    // writing to detached (replaced) DOM nodes, which caused the clock
    // to appear frozen after a loadWeather() re-render.
    if (_clockInterval !== null) {
        clearInterval(_clockInterval);
        _clockInterval = null;
    }
    var tick = function () {
        // Look up #liveClock fresh every second so we always write
        // to the current element, not a stale reference from a previous render.
        var el = document.getElementById("liveClock");
        if (!el) return;
        el.textContent = new Date().toLocaleTimeString("en-US", {
            hour: "2-digit", minute: "2-digit", second: "2-digit"
        });
    };
    tick();
    _clockInterval = setInterval(tick, 1000);
}

// ── Particle system ────────────────────────────────────────────────
var ParticleSystem = (function () {
    var canvas, ctx, _type, _active = false, _raf, _particles = [];
    function resize() {
        var card = document.getElementById("weatherCard");
        if (!canvas || !card) return;
        canvas.width = card.offsetWidth; canvas.height = card.offsetHeight;
    }
    function mkRain(w, h) {
        return { x: Math.random()*w, y: Math.random()*h*-1,
                 len: 10+Math.random()*14, speed: 8+Math.random()*12,
                 opacity: 0.25+Math.random()*0.4, width: 0.8+Math.random()*0.7 };
    }
    function mkSnow(w, h) {
        return { x: Math.random()*w, y: Math.random()*h*-1,
                 r: 1.5+Math.random()*3, speed: 0.8+Math.random()*2,
                 drift: (Math.random()-0.5)*0.6, opacity: 0.5+Math.random()*0.45 };
    }
    function tick() {
        if (!_active || !ctx) return;
        var w = canvas.width, h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        _particles.forEach(function (p) {
            if (_type === "rain") {
                ctx.strokeStyle = "rgba(147,210,255,"+p.opacity+")";
                ctx.lineWidth = p.width;
                ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x-1, p.y+p.len); ctx.stroke();
                p.y += p.speed;
                if (p.y > h) { Object.assign(p, mkRain(w,h)); p.y = -p.len; }
            } else {
                ctx.fillStyle = "rgba(220,240,255,"+p.opacity+")";
                ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
                p.y += p.speed; p.x += p.drift;
                if (p.y > h || p.x < 0 || p.x > w) { Object.assign(p, mkSnow(w,h)); p.y = -5; }
            }
        });
        _raf = requestAnimationFrame(tick);
    }
    return {
        start: function (type) {
            canvas = document.getElementById("particleCanvas");
            if (!canvas) return;
            ctx = canvas.getContext("2d"); _type = type; _active = true; resize();
            var count = type === "rain" ? 90 : 60;
            _particles = Array.from({length: count}, function () {
                return type === "rain" ? mkRain(canvas.width, canvas.height) : mkSnow(canvas.width, canvas.height);
            });
            canvas.classList.add("active"); cancelAnimationFrame(_raf); tick();
        },
        stop: function () {
            _active = false; cancelAnimationFrame(_raf);
            var c = document.getElementById("particleCanvas");
            if (c) { c.classList.remove("active"); var x = c.getContext("2d"); if(x) x.clearRect(0,0,c.width,c.height); }
            _particles = [];
        },
        resize: function () { resize(); }
    };
})();
window.addEventListener("resize", function () { ParticleSystem.resize(); });

// ── Loading skeleton ───────────────────────────────────────────────
function renderSkeleton() {
    var wm = document.getElementById("weatherMain");
    var wf = document.getElementById("weatherForecast");
    if (wm) wm.innerHTML =
        '<div class="skeleton-wrap">'
      + '<div class="wg-main-grid">'
      +   '<div style="flex:1">'
      +     '<div class="skel" style="height:20px;width:60%;margin-bottom:8px"></div>'
      +     '<div class="skel" style="height:12px;width:38%;margin-bottom:6px"></div>'
      +     '<div class="skel" style="height:12px;width:25%"></div>'
      +   '</div>'
      +   '<div class="wg-temp-block">'
      +     '<div class="skel" style="width:72px;height:72px;border-radius:50%;margin:0 auto 8px"></div>'
      +     '<div class="skel" style="height:46px;width:88px;margin:0 auto 6px"></div>'
      +     '<div class="skel" style="height:12px;width:64px;margin:0 auto"></div>'
      +   '</div>'
      + '</div>'
      + '<div class="wg-stats">'
      +   '<div class="skel wg-stat-chip" style="height:56px"></div>'
      +   '<div class="skel wg-stat-chip" style="height:56px"></div>'
      +   '<div class="skel wg-stat-chip" style="height:56px"></div>'
      + '</div>'
      + '</div>';
    if (wf) wf.innerHTML = [0,1,2,3,4,5].map(function () {
        return '<div class="skel" style="height:118px;border-radius:16px"></div>';
    }).join("");
}

// ── Error state ────────────────────────────────────────────────────
function renderWeatherError(msg) {
    var wm = document.getElementById("weatherMain");
    var wf = document.getElementById("weatherForecast");
    if (wm) wm.innerHTML =
        '<div class="wg-error fade-in-wg">'
      +   '<i class="fas fa-triangle-exclamation"></i>'
      +   '<p>' + (msg || "Could not fetch weather data.") + '</p>'
      +   '<button onclick="loadWeather()">'
      +     '<i class="fas fa-rotate-right"></i>&nbsp; Try again'
      +   '</button>'
      + '</div>';
    if (wf) wf.innerHTML = "";
}

// ── Render current conditions ──────────────────────────────────────
function renderMain(cur, now, tzOffset, srHour, ssHour) {
    var wm = document.getElementById("weatherMain");
    if (!wm) return;
    var skyconType = mapWeatherToSkycon(
        cur.weather[0].main, cur.weather[0].description, cur.dt, tzOffset, srHour, ssHour
    );

    wm.innerHTML =
        '<div class="wg-main-grid fade-in-wg">'
      +   '<div class="wg-location">'
      +     '<div class="wg-city">' + CITY + ', Egypt</div>'
      +     '<div class="wg-date">' + now.toLocaleDateString("en-US", {weekday:"long",year:"numeric",month:"long",day:"numeric"}) + '</div>'
      +     '<div id="liveClock"></div>'
      +   '</div>'
      +   '<div class="wg-temp-block">'
      +     '<canvas id="weatherIcon_main" width="72" height="72" class="wg-icon-canvas"></canvas>'
      +     '<div class="wg-temp">' + Math.round(cur.main.temp) + '<sup>°C</sup></div>'
      +     '<div class="wg-desc">' + cur.weather[0].description + '</div>'
      +   '</div>'
      + '</div>'
      + '<div class="wg-stats">'
      +   '<div class="wg-stat-chip">'
      +     '<div class="wg-stat-label">Feels Like</div>'
      +     '<div class="wg-stat-val"><i class="fas fa-temperature-half wg-stat-icon"></i>' + Math.round(cur.main.feels_like) + '°</div>'
      +   '</div>'
      +   '<div class="wg-stat-chip">'
      +     '<div class="wg-stat-label">Humidity</div>'
      +     '<div class="wg-stat-val"><i class="fas fa-droplet wg-stat-icon"></i>' + cur.main.humidity + '%</div>'
      +   '</div>'
      +   '<div class="wg-stat-chip">'
      +     '<div class="wg-stat-label">Wind</div>'
      +     '<div class="wg-stat-val"><i class="fas fa-wind wg-stat-icon"></i>' + Math.round(cur.wind.speed) + '<small class="wg-unit"> km/h</small></div>'
      +   '</div>'
      + '</div>';

    requestAnimationFrame(startLiveClock);
    safeAddSkycon("weatherIcon_main", skyconType);
}

// ── Render forecast strip ──────────────────────────────────────────
function renderForecast(list, tzOffset, srHour, ssHour) {
    var wf = document.getElementById("weatherForecast");
    if (!wf) return;
    var slots = list.slice(0, 6);
    var html  = "";
    slots.forEach(function (item, idx) {
        var time   = new Date(item.dt_txt + "Z"); // parse as UTC
        var localH = new Date((item.dt + tzOffset) * 1000).getUTCHours();
        var localM = new Date((item.dt + tzOffset) * 1000).getUTCMinutes();
        var ampm   = localH >= 12 ? "PM" : "AM";
        var h12    = localH % 12 || 12;
        var timeStr = h12.toString().padStart(2,"0") + ":" + localM.toString().padStart(2,"0") + " " + ampm;
        var iconId  = "fcIcon_" + idx;
        var isRain  = item.weather[0].main.toLowerCase().includes("rain");
        html +=
            '<div class="wg-fc-item' + (isRain ? " wg-fc-rain" : "") + ' fade-in-wg" style="animation-delay:' + (idx*0.06) + 's">'
          +   '<div class="wg-fc-time">' + (idx === 0 ? "Now" : timeStr) + '</div>'
          +   '<canvas id="' + iconId + '" width="36" height="36" style="width:36px;height:36px;display:block;margin:0 auto"></canvas>'
          +   '<div class="wg-fc-temp">' + Math.round(item.main.temp) + '°</div>'
          +   '<div class="wg-fc-desc">' + item.weather[0].description + '</div>'
          +   (isRain ? '<span class="wg-fc-rain-badge">Rain</span>' : "")
          + '</div>';
    });
    wf.innerHTML = html;

    requestAnimationFrame(function () {
        slots.forEach(function (item, idx) {
            safeAddSkycon("fcIcon_" + idx,
                mapWeatherToSkycon(item.weather[0].main, item.weather[0].description,
                                   item.dt, tzOffset, srHour, ssHour));
        });
    });
}

// ── Rain alert ─────────────────────────────────────────────────────
function handleRainAlert(rainExpected) {
    var wm = document.getElementById("weatherMain");
    if (rainExpected && !rainAlertShown) {
        rainAlertShown = true;
        var stats = wm && wm.querySelector(".wg-stats");
        if (stats) {
            var bar = document.createElement("div");
            bar.className = "wg-rain-bar";
            bar.innerHTML = '<i class="fas fa-cloud-rain"></i> Rain expected soon — natural irrigation incoming!';
            stats.after(bar);
        }
        if (typeof window.showBobNotification === "function")
            window.showBobNotification("\uD83C\uDF27\uFE0F Rain Expected", "Rain coming soon! Natural irrigation will help your plants.", "success", 8000, false);
        if (typeof window.addAlertToUI === "function")
            window.addAlertToUI("rain_alert_" + Date.now(), "\uD83C\uDF27\uFE0F Rain expected in the next few hours", "warning", true);
    } else if (!rainExpected && rainAlertShown) {
        rainAlertShown = false;
    }
    weatherRainExpected        = rainExpected;
    window.weatherRainExpected = rainExpected;
}

// ── Main load ──────────────────────────────────────────────────────
window.loadWeather = async function () {
    var wm  = document.getElementById("weatherMain");
    var wf  = document.getElementById("weatherForecast");
    var btn = document.getElementById("weatherRefreshBtn");
    if (!wm || !wf) return;
    if (!skycons) initSkycons();
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading'; }
    renderSkeleton();

    try {
        var res  = await fetch(
            "https://api.openweathermap.org/data/2.5/forecast?q=" + encodeURIComponent(CITY) +
            "&appid=" + WEATHER_API_KEY + "&units=metric",
            { signal: AbortSignal.timeout(10000) }
        );
        if (!res.ok) throw new Error("HTTP " + res.status);
        var data = await res.json();
        if (String(data.cod) !== "200") throw new Error(data.message || "API error");

        var now      = new Date();
        var cur      = data.list[0];
        var tzOffset = data.city.timezone;  // seconds east of UTC
        var srHour   = new Date((data.city.sunrise + tzOffset) * 1000).getUTCHours();
        var ssHour   = new Date((data.city.sunset  + tzOffset) * 1000).getUTCHours();

        // Store for chatbot
        window._hydroWeatherData = {
            current: cur, list: data.list, city: CITY,
            sunrise: data.city.sunrise, sunset: data.city.sunset,
            tzOffset: tzOffset, srHour: srHour, ssHour: ssHour,
            fetchedAt: Date.now()
        };

        applyTheme(cur.weather[0].main);
        renderMain(cur, now, tzOffset, srHour, ssHour);
        renderForecast(data.list, tzOffset, srHour, ssHour);

        var cond = cur.weather[0].main.toLowerCase();
        if (cond.includes("rain") || cond.includes("drizzle") || cond.includes("thunderstorm")) {
            ParticleSystem.start("rain");
        } else if (cond.includes("snow")) {
            ParticleSystem.start("snow");
        } else {
            ParticleSystem.stop();
        }

        var rainExpected = data.list.slice(0, 3).some(function (i) {
            return i.weather[0].main.toLowerCase().includes("rain");
        });
        handleRainAlert(rainExpected);

    } catch (err) {
        console.error("[Weather]", err);
        renderWeatherError(
            err && err.name === "TimeoutError"
                ? "Connection timed out — check your network."
                : "Could not fetch weather data."
        );
        ParticleSystem.stop();
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh'; }
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