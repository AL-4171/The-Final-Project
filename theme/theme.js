// ================= THEME.JS - COMPLETE FIX v3 =================
// Works on ALL browsers with guaranteed sound
// FIXED: Each Bob plays its own sound when appearing
// FIXED: Sound stops when Bob is closed or expires
// FIXED: NO duplicate Bobs (prevention system enhanced)
// FIXED: 5-minute critical alert plays sound AND shows Bob
// FIXED: Reload sound works consistently
// NEW: Water level overflow alert (tank > 90%)
// NEW: Water level critical high alert (tank = 100%)
// FIXED: NO sound for pump on/off or zones on/off actions
// NEW: User-configurable thresholds from Settings page
// NEW: Notification preferences from Settings page (push notifications)

// ===================== LANDING PAGE CHECK =====================
function shouldEnableAlerts() {
    try {
        const user = localStorage.getItem("hydroUser");
        const isLoggedIn = !!(user && user !== "null" && user !== "undefined");
        const currentPath = window.location.pathname.toLowerCase();
        
        if (currentPath.includes('landing') || currentPath.includes('login') || currentPath.includes('signup')) {
            return false;
        }
        
        if (!isLoggedIn) {
            return false;
        }
        
        return true;
    } catch(e) {
        return false;
    }
}

// ===================== NOTIFICATION PREFERENCES FROM SETTINGS =====================
let notificationPrefs = {
    email: true,
    push: true
};

function loadNotificationPrefs() {
    try {
        const saved = localStorage.getItem('hydroGenNotifs');
        if (saved) {
            const prefs = JSON.parse(saved);
            notificationPrefs.email = prefs.email !== undefined ? prefs.email : true;
            notificationPrefs.push = prefs.push !== undefined ? prefs.push : true;
            console.log("📋 Notification preferences loaded:", notificationPrefs);
        }
    } catch(e) {}
}

// ===================== THRESHOLDS FROM FIREBASE SETTINGS =====================
let userThresholds = { lowWater: 10, drySoil: 20 };

async function loadUserThresholds() {
    if (window.hydroGenDB) {
        try {
            const snapshot = await window.hydroGenDB.ref('settings/thresholds').once('value');
            const data = snapshot.val();
            if (data) {
                if (data.lowWater !== undefined && data.lowWater >= 0 && data.lowWater <= 100) {
                    userThresholds.lowWater = data.lowWater;
                }
                if (data.drySoil !== undefined && data.drySoil >= 0 && data.drySoil <= 100) {
                    userThresholds.drySoil = data.drySoil;
                }
                console.log(`✅ Thresholds loaded: Water < ${userThresholds.lowWater}%, Soil < ${userThresholds.drySoil}%`);
            }
        } catch(e) {}
    }
}

function startThresholdListener() {
    if (!window.hydroGenDB) {
        setTimeout(startThresholdListener, 1000);
        return;
    }
    window.hydroGenDB.ref('settings/thresholds').on('value', (snapshot) => {
        if (!shouldEnableAlerts()) return;
        const data = snapshot.val();
        if (data) {
            let changed = false;
            if (data.lowWater !== undefined && data.lowWater >= 0 && data.lowWater <= 100 && userThresholds.lowWater !== data.lowWater) {
                userThresholds.lowWater = data.lowWater;
                changed = true;
            }
            if (data.drySoil !== undefined && data.drySoil >= 0 && data.drySoil <= 100 && userThresholds.drySoil !== data.drySoil) {
                userThresholds.drySoil = data.drySoil;
                changed = true;
            }
            if (changed) {
                console.log(`🔄 Thresholds updated: Water < ${userThresholds.lowWater}%, Soil < ${userThresholds.drySoil}%`);
                if (window.lastSensorData) {
                    checkSensorAlerts(window.lastSensorData);
                }
            }
        }
    });
}

window.lastSensorData = null;

// ===================== ALERT & BOB LOGIC =====================
let bobQueue = [];
let isBobShowing = false;
let currentBobSoundPlaying = false;
let currentBobSoundTimeout = null;
let activeAlertConditions = {
    soil_critical: false, soil_warning: false,
    temp_critical: false, temp_warning: false,
    water_critical: false, water_warning: false,
    water_overflow_warning: false, water_overflow_critical: false,
    hum_critical: false, hum_warning: false,
    rain_warning: false
};

// Track which Bobs have been shown recently to prevent duplicates
const recentBobsShown = new Map(); // messageKey -> timestamp
const BOB_DEDUPE_DELAY = 20000; // 20 seconds minimum between same Bob type

// Track active Bob ID to prevent any duplicates
let currentActiveBobId = null;
let lastBobEndTime = 0;
const BOB_COOLDOWN = 3000; // 3 seconds cooldown between Bobs

// Flag to prevent duplicate critical alerts on page load
let reloadBobShown = false;

// ===================== FORCE SOUND ON ANY BROWSER =====================
let soundPlaying = false;
let soundTimer = null;
let currentAudioContext = null;

let activeSoundContext = null;
let activeSoundNodes = null;

let audioUnlocked = false;

function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    console.log("🔓 Audio unlocked via user gesture");
    try {
        const warmup = new (window.AudioContext || window.webkitAudioContext)();
        warmup.resume().then(() => warmup.close()).catch(() => {});
    } catch (e) {}
}

document.addEventListener('click', unlockAudio, { passive: true });
document.addEventListener('touchstart', unlockAudio, { passive: true });
document.addEventListener('keydown', unlockAudio, { passive: true });

function stopAlertSound() {
    console.log("🔇 Stopping alert sound...");
    
    if (currentBobSoundTimeout) {
        clearTimeout(currentBobSoundTimeout);
        currentBobSoundTimeout = null;
    }
    
    if (soundTimer) {
        clearTimeout(soundTimer);
        soundTimer = null;
    }
    
    if (activeSoundNodes) {
        try {
            if (activeSoundNodes.gain) {
                activeSoundNodes.gain.gain.setValueAtTime(0, activeSoundNodes.gain.context.currentTime);
            }
        } catch (e) {}
        try {
            if (activeSoundNodes.oscillator) {
                activeSoundNodes.oscillator.stop();
            }
        } catch (e) {}
        try {
            if (activeSoundNodes.modulator) {
                activeSoundNodes.modulator.stop();
            }
        } catch (e) {}
        activeSoundNodes = null;
    }
    
    if (activeSoundContext) {
        try {
            activeSoundContext.close();
        } catch (e) {}
        activeSoundContext = null;
    }
    
    soundPlaying = false;
    currentBobSoundPlaying = false;
}

function playBobSound() {
    if (!shouldEnableAlerts()) return;
    
    if (currentBobSoundPlaying) {
        console.log("🔊 Sound already playing for current Bob, skipping");
        return;
    }
    
    console.log("🔊 Playing Bob alert sound");
    stopAlertSound();
    
    currentBobSoundPlaying = true;
    
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        activeSoundContext = ctx;
        
        const doPlay = () => {
            try {
                const now = ctx.currentTime;
                const alarm = ctx.createOscillator();
                const gain = ctx.createGain();
                const modulator = ctx.createOscillator();
                const modGain = ctx.createGain();
                
                alarm.connect(gain);
                gain.connect(ctx.destination);
                modulator.connect(modGain);
                modGain.connect(gain.gain);
                
                alarm.type = 'square';
                alarm.frequency.value = 880;
                modulator.type = 'square';
                modulator.frequency.value = 4;
                modGain.gain.value = 0.4;
                gain.gain.setValueAtTime(0.5, now);
                
                alarm.start(now);
                modulator.start(now);
                
                activeSoundNodes = { oscillator: alarm, modulator: modulator, gain: gain };
                
                soundTimer = setTimeout(() => {
                    stopAlertSound();
                }, 2000);
            } catch (e) {
                console.log("WebAudio error:", e);
                stopAlertSound();
                playFallbackBeep();
            }
        };
        
        if (ctx.state === 'suspended') {
            ctx.resume().then(doPlay).catch(() => {
                stopAlertSound();
                playFallbackBeep();
            });
        } else {
            doPlay();
        }
    } catch (e) {
        console.log("AudioContext create error:", e);
        playFallbackBeep();
    }
}

function playFallbackBeep() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        oscillator.connect(gain);
        gain.connect(audioCtx.destination);
        oscillator.type = 'square';
        oscillator.frequency.value = 880;
        gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.8);
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        setTimeout(() => {
            audioCtx.close().catch(e => {});
        }, 1000);
    } catch (e) {
        console.log("Fallback audio error:", e);
    }
}

// ===================== BOB NOTIFICATION SYSTEM =====================

function isDuplicateBob(type, message) {
    const now = Date.now();
    
    if (now - lastBobEndTime < BOB_COOLDOWN) {
        console.log(`⚠️ Duplicate Bob prevented: Cooldown active`);
        return true;
    }
    
    const key = `${type}_${message.substring(0, 50)}`;
    const lastShown = recentBobsShown.get(key);
    
    if (lastShown && (now - lastShown) < BOB_DEDUPE_DELAY) {
        console.log(`⚠️ Duplicate Bob prevented: ${type}`);
        return true;
    }
    
    if (currentActiveBobId && currentActiveBobId.includes(type)) {
        console.log(`⚠️ Duplicate Bob prevented: Another ${type} Bob is still active`);
        return true;
    }
    
    recentBobsShown.set(key, now);
    
    for (const [k, t] of recentBobsShown.entries()) {
        if (now - t > 60000) {
            recentBobsShown.delete(k);
        }
    }
    
    return false;
}

function processBobQueue() {
    if (!shouldEnableAlerts()) {
        bobQueue = [];
        return;
    }
    
    if (isBobShowing || bobQueue.length === 0) return;
    
    const now = Date.now();
    if (now - lastBobEndTime < BOB_COOLDOWN) {
        setTimeout(processBobQueue, BOB_COOLDOWN - (now - lastBobEndTime));
        return;
    }

    isBobShowing = true;
    const { title, message, type, duration, bobId, playSound } = bobQueue.shift();
    currentActiveBobId = bobId;

    if (playSound) {
        playBobSound();
    }

    const existingBob = document.getElementById("bobNotification");
    if (existingBob) existingBob.remove();

    const bob = document.createElement("div");
    bob.id = "bobNotification";
    bob.setAttribute("data-bob-id", bobId);
    bob.className = `bob-notification bob-${type}`;
    
    let icon = "ℹ️";
    if (type === "critical") icon = "🚨";
    else if (type === "warning") icon = "⚠️";
    else if (type === "success") icon = "✅";
    else if (type === "overflow") icon = "💧💦";

    bob.innerHTML = `
        <div class="bob-content">
            <div class="bob-icon">${icon}</div>
            <div class="bob-text">
                <div class="bob-title">${escapeHtml(title)}</div>
                <div class="bob-message">${escapeHtml(message)}</div>
            </div>
            <button class="bob-close" onclick="window.closeCurrentBob('${bobId}')">✕</button>
        </div>
        <div class="bob-progress" style="animation-duration: ${duration/1000}s"></div>
    `;
    document.body.appendChild(bob);

    const timeoutId = setTimeout(() => {
        const currentBob = document.getElementById("bobNotification");
        if (currentBob && currentBob.getAttribute("data-bob-id") === bobId) {
            console.log(`⏰ Bob expired naturally: ${title}`);
            currentBob.remove();
            isBobShowing = false;
            currentActiveBobId = null;
            lastBobEndTime = Date.now();
            stopAlertSound();
            processBobQueue();
        }
    }, duration);

    bob.setAttribute("data-timeout-id", timeoutId);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

window.closeCurrentBob = function(bobId) {
    const bob = document.getElementById("bobNotification");
    if (bob && bob.getAttribute("data-bob-id") === bobId) {
        const timeoutId = bob.getAttribute("data-timeout-id");
        if (timeoutId) clearTimeout(parseInt(timeoutId));
        bob.remove();
        isBobShowing = false;
        currentActiveBobId = null;
        lastBobEndTime = Date.now();
        console.log("❌ Bob closed by user - stopping sound");
        stopAlertSound();
        processBobQueue();
    }
};

function showBobNotification(title, message, type, duration = 8000, playSound = true) {
    if (!shouldEnableAlerts()) return;
    
    if (isDuplicateBob(type, message)) {
        return;
    }
    
    const bobId = Date.now() + "_" + type + "_" + Math.random().toString(36).substr(2, 6);
    bobQueue.push({ title, message, type, duration, bobId, playSound });
    processBobQueue();
}

// ===================== ALERTS UI =====================

const addedAlerts = new Map();

function addAlertToUI(alertId, message, type, playSound = false) {
    if (!shouldEnableAlerts()) return;
    
    const alertsBox = document.getElementById("alertsContainer");
    if (!alertsBox) return;
    
    const existingAlert = document.getElementById(`alert-${alertId}`);
    if (existingAlert) return;
    
    const alertKey = `${alertId}_${type}`;
    const lastAdded = addedAlerts.get(alertKey);
    if (lastAdded && (Date.now() - lastAdded) < 10000) {
        console.log(`⚠️ Duplicate alert prevented: ${alertKey}`);
        return;
    }
    addedAlerts.set(alertKey, Date.now());

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let alertClass = type === 'critical' ? 'alert-critical' : (type === 'warning' ? 'alert-warning' : 'alert-success');
    let icon = type === 'critical' ? '🚨' : (type === 'warning' ? '⚠️' : (type === 'overflow' ? '💧💦' : '✅'));

    if (alertsBox.querySelector('.no-alerts-message')) {
        alertsBox.innerHTML = '';
    }

    const uniqueId = `${alertId}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const alertDiv = document.createElement('div');
    alertDiv.id = `alert-${uniqueId}`;
    alertDiv.className = `alert-item ${alertClass}`;
    alertDiv.style.position = "relative";
    alertDiv.style.marginBottom = "8px";
    alertDiv.style.padding = "10px 12px";
    alertDiv.style.borderRadius = "10px";
    alertDiv.innerHTML = `
        <div style="font-size:18px;">${icon}</div>
        <div style="flex:1;padding-right:25px;"><strong style="font-size:13px;">${escapeHtml(message)}</strong><div style="font-size:10px;opacity:0.7;">${timeStr}</div></div>
        <button onclick="window.dismissAlert('${uniqueId}')" style="background:none;border:none;cursor:pointer;font-size:14px;color:currentColor;position:absolute;right:8px;top:50%;transform:translateY(-50%);opacity:0.6;">✕</button>
    `;

    alertsBox.insertBefore(alertDiv, alertsBox.firstChild);

    // Auto-dismiss schedule/success/info alerts after 10 minutes
    if (type === 'success' || type === 'info') {
        setTimeout(() => window.dismissAlert(uniqueId), 600000);
    }

    if (playSound) {
        playBobSound();
    }

    if (type === 'critical') {
        if (notificationPrefs.push) {
            showBobNotification("🚨 Critical Alert", message, "critical", 15000, true);
            const bell = document.getElementById("notifToggle");
            if (bell) bell.classList.add("ringing");
        }
    } else if (type === 'warning') {
        if (notificationPrefs.push) {
            showBobNotification("⚠️ Warning", message, "warning", 10000, true);
        }
    } else if (type === 'overflow') {
        if (notificationPrefs.push) {
            showBobNotification("💧 Overflow Alert", message, "warning", 10000, true);
        }
    }

    updateBadge();
    setTimeout(showNoAlertsMessage, 100);
}

window.dismissAlert = function(uniqueId) {
    const alert = document.getElementById(`alert-${uniqueId}`);
    if (alert) alert.remove();
    updateBadge();
    setTimeout(showNoAlertsMessage, 100);
};

function removeResolvedAlert(alertType) {
    const alertsBox = document.getElementById("alertsContainer");
    if (!alertsBox) return;
    const alerts = alertsBox.querySelectorAll(".alert-item");
    alerts.forEach(alert => {
        if (alert.id && alert.id.includes(alertType)) {
            alert.remove();
        }
    });
    updateBadge();
    setTimeout(showNoAlertsMessage, 100);
}

function showNoAlertsMessage() {
    const alertsBox = document.getElementById("alertsContainer");
    if (alertsBox && alertsBox.children.length === 0) {
        alertsBox.innerHTML = '<p class="no-alerts-message" style="font-size:12px;opacity:0.5;margin:0;text-align:center;padding:20px;">No active alerts.</p>';
    }
}

function updateBadge() {
    const badge = document.getElementById("notifBadge");
    const alerts = document.querySelectorAll("#alertsContainer .alert-item:not(.no-alerts-message)");
    const count = alerts.length;
    if (badge) {
        if (count > 0) {
            badge.innerText = count > 9 ? '9+' : count;
            badge.style.display = "flex";
        } else {
            badge.innerText = "";
            badge.style.display = "none";
        }
    }
}
// EXACT percent for alerts (returns 16.7, 8.3, 25.0)
function waterValueToPercentExact(waterValue) {
    if (waterValue === undefined || waterValue === null) return 0;
    const clamped = Math.min(12, Math.max(0, waterValue));
    const percent = ((12 - clamped) / 12) * 100;
    return Math.round(percent * 10) / 10;
}
// FLOOR percent for tank display (returns 16, 8, 25)
function waterValueToPercent(waterValue) {
    if (waterValue === undefined || waterValue === null) return 0;
    const clamped = Math.min(12, Math.max(0, waterValue));
    return Math.floor(((12 - clamped) / 12) * 100);
}

function getRawWaterValue(waterValue) {
    if (waterValue === undefined || waterValue === null) return 12;
    return Math.min(12, Math.max(0, waterValue));
}

// ===================== CRITICAL ALERT INTERVAL =====================
let criticalAlertInterval = null;
let lastCriticalAlertTime = 0;

function startCriticalAlertChecker() {
    if (criticalAlertInterval) clearInterval(criticalAlertInterval);

    criticalAlertInterval = setInterval(() => {
        if (!shouldEnableAlerts()) return;
        
        const hasActiveCritical =
            activeAlertConditions.soil_critical ||
            activeAlertConditions.temp_critical ||
            activeAlertConditions.water_critical ||
            activeAlertConditions.hum_critical ||
            activeAlertConditions.water_overflow_critical;

        if (hasActiveCritical) {
            const now = Date.now();
            if (now - lastCriticalAlertTime < 270000) {
                console.log("⏭️ Skipping 5-minute critical alert - too soon since last");
                return;
            }
            lastCriticalAlertTime = now;
            
            console.log("🔊 5-minute critical alert - playing sound and showing Bob");
            
            if (activeAlertConditions.water_overflow_critical) {
                if (notificationPrefs.push) {
                    showBobNotification("🚨 CRITICAL ALERT", "Water tank is OVERFLOWING! Emergency shutdown!", "critical", 8000, true);
                }
            } else if (activeAlertConditions.soil_critical) {
                if (notificationPrefs.push) {
                    showBobNotification("🚨 CRITICAL ALERT", `Soil is extremely dry (below ${userThresholds.drySoil}%)! Water immediately!`, "critical", 8000, true);
                }
            } else if (activeAlertConditions.temp_critical) {
                if (notificationPrefs.push) {
                    showBobNotification("🚨 CRITICAL ALERT", "Extreme temperature! Provide shade!", "critical", 8000, true);
                }
            } else if (activeAlertConditions.water_critical) {
                if (notificationPrefs.push) {
                    showBobNotification("🚨 CRITICAL ALERT", `Water tank is empty (below ${userThresholds.lowWater}%)! Activate collection!`, "critical", 8000, true);
                }
            } else if (activeAlertConditions.hum_critical) {
                if (notificationPrefs.push) {
                    showBobNotification("🚨 CRITICAL ALERT", "Very low humidity! Poor water collection!", "critical", 8000, true);
                }
            }
        }
    }, 300000);
}

// ===================== UNIVERSAL SENSOR LISTENER =====================
function startUniversalSensorListener() {
    if (!window.hydroGenDB) {
        setTimeout(startUniversalSensorListener, 1000);
        return;
    }

    console.log("🔥 Starting universal sensor listener");
    
    loadNotificationPrefs();
    loadUserThresholds();
    startThresholdListener();

    window.hydroGenDB.ref('sensors').on('value', (snapshot) => {
        if (!shouldEnableAlerts()) return;
        
        const data = snapshot.val();
        if (data) {
            window.lastSensorData = data;
            console.log("📊 Real sensor data from Firebase:", data);
            checkSensorAlerts(data);
        }
    });
}

let lastAlertCheckTime = 0;
let pendingAlertCheck = false;

function checkSensorAlerts(sensorData) {
    if (!sensorData) return;
    
    const now = Date.now();
    if (now - lastAlertCheckTime < 500) {
        if (!pendingAlertCheck) {
            pendingAlertCheck = true;
            setTimeout(() => {
                pendingAlertCheck = false;
                checkSensorAlerts(sensorData);
            }, 500);
        }
        return;
    }
    lastAlertCheckTime = now;

    const hadCriticalBefore =
        activeAlertConditions.soil_critical ||
        activeAlertConditions.temp_critical ||
        activeAlertConditions.water_critical ||
        activeAlertConditions.hum_critical ||
        activeAlertConditions.water_overflow_critical;

    const soil = Number(sensorData.soil) || 0;
    const temp = Number(sensorData.temp) || 0;
    const hum = Number(sensorData.hum) || 0;
    const rawWater = Number(sensorData.water) !== undefined ? Number(sensorData.water) : 12;
    const waterPercent = waterValueToPercentExact(rawWater);
    
    const isTankFull = rawWater <= 0.5;
    const isTankNearFull = rawWater <= 1.5;

    console.log(`Soil: ${soil}%, Temp: ${temp}°C, Humidity: ${hum}%, Tank: ${waterPercent}%, RawWater: ${rawWater}, isFull: ${isTankFull}`);

    // WATER LEVEL OVERFLOW ALERTS
    if (isTankFull && !activeAlertConditions.water_overflow_critical) {
        activeAlertConditions.water_overflow_critical = true;
        if (notificationPrefs.push) {
            addAlertToUI("water_overflow_critical", `🚨💦 CRITICAL: Water tank is OVERFLOWING! Emergency stop recommended!`, "critical", true);
        }
        console.log("💦💦 WATER OVERFLOW CRITICAL ALERT TRIGGERED! 💦💦");
    } 
    else if (isTankNearFull && !activeAlertConditions.water_overflow_warning && !activeAlertConditions.water_overflow_critical) {
        activeAlertConditions.water_overflow_warning = true;
        if (notificationPrefs.push) {
            addAlertToUI("water_overflow_warning", `⚠️💧 Warning: Water tank is nearly full (${waterPercent}%)! Consider pausing collection.`, "warning", true);
        }
        console.log("💦 Water near full warning");
    }
    else if (!isTankNearFull && rawWater > 2.5 && (activeAlertConditions.water_overflow_warning || activeAlertConditions.water_overflow_critical)) {
        if (activeAlertConditions.water_overflow_critical) {
            activeAlertConditions.water_overflow_critical = false;
            removeResolvedAlert("water_overflow_critical");
            addAlertToUI(`water_overflow_reset_${Date.now()}`, `✅ Water level normalized - overflow risk cleared`, "success", false);
        }
        if (activeAlertConditions.water_overflow_warning) {
            activeAlertConditions.water_overflow_warning = false;
            removeResolvedAlert("water_overflow_warning");
            addAlertToUI(`water_overflow_warning_reset_${Date.now()}`, `✅ Water level normalized`, "success", false);
        }
    }

    // SOIL ALERTS
    if (soil < userThresholds.drySoil && !activeAlertConditions.soil_critical) {
        activeAlertConditions.soil_critical = true;
        if (notificationPrefs.push) {
            addAlertToUI("soil_critical", `🚨 CRITICAL: Soil extremely dry (${soil}% < ${userThresholds.drySoil}%)! Water immediately!`, "critical", true);
        }
    } else if (soil >= 25 && activeAlertConditions.soil_critical) {
        activeAlertConditions.soil_critical = false;
        removeResolvedAlert("soil_critical");
        addAlertToUI(`soil_recovered_${Date.now()}`, `✅ Soil moisture recovered to ${soil}%`, "success", false);
    } else if (soil >= 20 && soil < 30 && !activeAlertConditions.soil_warning && !activeAlertConditions.soil_critical) {
        activeAlertConditions.soil_warning = true;
        if (notificationPrefs.push) {
            addAlertToUI("soil_warning", `⚠️ Low soil moisture (${soil}%) — Water soon`, "warning", true);
        }
    } else if (soil >= 30 && activeAlertConditions.soil_warning) {
        activeAlertConditions.soil_warning = false;
        removeResolvedAlert("soil_warning");
    }

    // TEMPERATURE ALERTS
    if (temp > 42 && !activeAlertConditions.temp_critical) {
        activeAlertConditions.temp_critical = true;
        if (notificationPrefs.push) {
            addAlertToUI("temp_critical", `🔥 CRITICAL: Extreme temperature (${temp}°C)! Provide shade!`, "critical", true);
        }
    } else if (temp <= 40 && activeAlertConditions.temp_critical) {
        activeAlertConditions.temp_critical = false;
        removeResolvedAlert("temp_critical");
        addAlertToUI(`temp_recovered_${Date.now()}`, `✅ Temperature normalized to ${temp}°C`, "success", false);
    } else if (temp > 38 && temp <= 42 && !activeAlertConditions.temp_warning && !activeAlertConditions.temp_critical) {
        activeAlertConditions.temp_warning = true;
        if (notificationPrefs.push) {
            addAlertToUI("temp_warning", `⚠️ High temperature (${temp}°C) — Monitor plants`, "warning", true);
        }
    } else if (temp <= 38 && activeAlertConditions.temp_warning) {
        activeAlertConditions.temp_warning = false;
        removeResolvedAlert("temp_warning");
    }

    // WATER TANK LOW ALERTS
    if (waterPercent < userThresholds.lowWater && !activeAlertConditions.water_critical && !activeAlertConditions.water_overflow_critical) {
        activeAlertConditions.water_critical = true;
        if (notificationPrefs.push) {
            addAlertToUI("water_critical", `💧 CRITICAL: Water tank empty (${waterPercent.toFixed(1)}% < ${userThresholds.lowWater}%)! Activate collection!`, "critical", true);
        }
    } else if (waterPercent >= 20 && activeAlertConditions.water_critical) {
        activeAlertConditions.water_critical = false;
        removeResolvedAlert("water_critical");
        addAlertToUI(`water_recovered_${Date.now()}`, `✅ Water tank level recovered to ${waterPercent.toFixed(1)}%`, "success", false);
    } else if (waterPercent >= 10 && waterPercent < 25 && !activeAlertConditions.water_warning && !activeAlertConditions.water_critical && !activeAlertConditions.water_overflow_warning) {
        activeAlertConditions.water_warning = true;
        if (notificationPrefs.push) {
            addAlertToUI("water_warning", `⚠️ Water tank low (${waterPercent.toFixed(1)}%) — Refill soon`, "warning", true);
        }
    } else if (waterPercent >= 25 && activeAlertConditions.water_warning) {
        activeAlertConditions.water_warning = false;
        removeResolvedAlert("water_warning");
    }

    // HUMIDITY ALERTS
    if (hum < 20 && !activeAlertConditions.hum_critical) {
        activeAlertConditions.hum_critical = true;
        if (notificationPrefs.push) {
            addAlertToUI("hum_critical", `💨 CRITICAL: Very low humidity (${hum}%)! Poor water collection!`, "critical", true);
        }
    } else if (hum >= 25 && activeAlertConditions.hum_critical) {
        activeAlertConditions.hum_critical = false;
        removeResolvedAlert("hum_critical");
        addAlertToUI(`hum_recovered_${Date.now()}`, `✅ Humidity recovered to ${hum}%`, "success", false);
    } else if (hum >= 20 && hum < 30 && !activeAlertConditions.hum_warning && !activeAlertConditions.hum_critical) {
        activeAlertConditions.hum_warning = true;
        if (notificationPrefs.push) {
            addAlertToUI("hum_warning", `⚠️ Low humidity (${hum}%) — Collection slow`, "warning", true);
        }
    } else if (hum >= 30 && activeAlertConditions.hum_warning) {
        activeAlertConditions.hum_warning = false;
        removeResolvedAlert("hum_warning");
    }

    // RAIN ALERTS (always shown - no preference control)
    const rainDetected = sensorData.rain !== undefined ? Number(sensorData.rain) === 0 : false;
    if (rainDetected && !activeAlertConditions.rain_warning) {
        activeAlertConditions.rain_warning = true;
        addAlertToUI("rain_warning", `🌧️ Rain detected! Pause irrigation to conserve water.`, "warning", true);
    } else if (!rainDetected && activeAlertConditions.rain_warning) {
        activeAlertConditions.rain_warning = false;
        removeResolvedAlert("rain_warning");
        addAlertToUI(`rain_cleared_${Date.now()}`, `✅ Rain stopped — irrigation can resume.`, "success", false);
    }

    const hasCriticalNow =
        activeAlertConditions.soil_critical ||
        activeAlertConditions.temp_critical ||
        activeAlertConditions.water_critical ||
        activeAlertConditions.hum_critical ||
        activeAlertConditions.water_overflow_critical;

    if (hasCriticalNow && !hadCriticalBefore) {
        startCriticalAlertChecker();
    } else if (!hasCriticalNow && hadCriticalBefore) {
        if (criticalAlertInterval) {
            clearInterval(criticalAlertInterval);
            criticalAlertInterval = null;
        }
    }

    setTimeout(showNoAlertsMessage, 100);
}

// ===================== GLOBAL SCHEDULE NOTIFIER =====================
// Runs on EVERY page — fires Bob + ring alert once per schedule per day
// Does NOT execute irrigation, only notifies.
let _scheduleNotifierInterval = null;

function startGlobalScheduleNotifier() {
    if (!window.hydroGenDB || !shouldEnableAlerts()) {
        setTimeout(startGlobalScheduleNotifier, 2000);
        return;
    }
    if (_scheduleNotifierInterval) return; // already running

    async function checkScheduleNotifications() {
        if (!shouldEnableAlerts()) return;
        try {
            const rawUser = localStorage.getItem('hydroUser');
            const hydroUser = rawUser ? JSON.parse(rawUser) : null;
            const userId = (hydroUser && (hydroUser.uid || hydroUser.id)) || "fcyeSoWkmqcgafPCQAN6vtV5M2";
            const now = new Date();
            const currentTime = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
            const currentDay  = now.toLocaleDateString('en-US', { weekday: 'long' });
            const currentDate = now.toISOString().split('T')[0];

            const [schedSnap, zoneSnap] = await Promise.all([
                window.hydroGenDB.ref(`users_w/${userId}/schedules`).once('value'),
                window.hydroGenDB.ref(`users_w/${userId}/zones`).once('value')
            ]);
            const schedules = schedSnap.val() ? Object.values(schedSnap.val()) : [];
            const zones     = zoneSnap.val()  ? Object.values(zoneSnap.val())  : [];

            for (const schedule of schedules) {
                if (!schedule.isActive) continue;
                if (schedule.startDate && schedule.startDate > currentDate) continue;
                if (schedule.time !== currentTime) continue;
                if (!schedule.days || !schedule.days.includes(currentDay)) continue;

                const notifKey = `schedNotif_${schedule.id}_${currentDate}`;
                if (localStorage.getItem(notifKey)) continue; // already notified today
                localStorage.setItem(notifKey, '1');

                const zone = zones.find(z => z.id === schedule.zoneId);
                const zoneName = zone ? zone.name : (schedule.zoneName || 'zone');
                const msg = `⏰ Schedule "${schedule.name}" — ${zoneName} irrigation starting now`;

                showBobNotification('💧 Schedule Time', msg, 'info', 9000, true);
                addAlertToUI(`sched_notif_${schedule.id}_${Date.now()}`, msg, 'info', false);

                // Cleanup old notif keys (keep last 7 days)
                for (let i = localStorage.length - 1; i >= 0; i--) {
                    const k = localStorage.key(i);
                    if (k && k.startsWith('schedNotif_')) {
                        const datePart = k.split('_').pop();
                        const age = (now - new Date(datePart)) / 86400000;
                        if (age > 7) localStorage.removeItem(k);
                    }
                }
            }
        } catch(e) {
            console.log('[ScheduleNotifier]', e);
        }
    }

    checkScheduleNotifications();
    _scheduleNotifierInterval = setInterval(checkScheduleNotifications, 60000);
}

// Start the universal listener
if (shouldEnableAlerts()) {
    startUniversalSensorListener();
    startGlobalScheduleNotifier();
}

document.addEventListener('click', (e) => {
    if (e.target.closest('#notifToggle')) {
        document.getElementById("notifToggle")?.classList.remove("ringing");
    }
});

window.dismissAlertByType = function(alertType) {
    const alertsBox = document.getElementById("alertsContainer");
    if (!alertsBox) return;
    const alerts = alertsBox.querySelectorAll(".alert-item");
    alerts.forEach(alert => {
        if (alert.id && alert.id.includes(alertType)) {
            alert.remove();
        }
    });
    updateBadge();
    setTimeout(showNoAlertsMessage, 100);
};

function showToast(message, duration = 3000) {
    const existingToast = document.getElementById('globalToast');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.id = 'globalToast';
    toast.innerHTML = `
        <div style="
            position: fixed;
            bottom: 30px;
            right: 30px;
            background: #333;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            z-index: 10000;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            animation: toastFadeIn 0.3s ease;
        ">
            ${escapeHtml(message)}
        </div>
    `;
    document.body.appendChild(toast);

    if (!document.querySelector('#toastStyles')) {
        const style = document.createElement('style');
        style.id = 'toastStyles';
        style.textContent = `
            @keyframes toastFadeIn {
                from { opacity: 0; transform: translateX(100px); }
                to { opacity: 1; transform: translateX(0); }
            }
            @keyframes toastFadeOut {
                from { opacity: 1; transform: translateX(0); }
                to { opacity: 0; transform: translateX(100px); }
            }
        `;
        document.head.appendChild(style);
    }

    setTimeout(() => {
        const toastEl = document.getElementById('globalToast');
        if (toastEl) {
            toastEl.style.animation = 'toastFadeOut 0.3s ease';
            setTimeout(() => {
                if (toastEl.parentNode) toastEl.remove();
            }, 300);
        }
    }, duration);
}

window.showToast = showToast;

// ===================== PLAY ALERT ON PAGE RELOAD =====================
let reloadSoundPlayed = false;
let reloadAttemptCount = 0;

async function checkAndPlayAlertOnReload() {
    if (!shouldEnableAlerts()) return;
    
    if (!window.hydroGenDB) {
        if (reloadAttemptCount < 10) {
            reloadAttemptCount++;
            setTimeout(checkAndPlayAlertOnReload, 500);
        }
        return;
    }

    try {
        loadNotificationPrefs();
        await loadUserThresholds();
        
        const snapshot = await window.hydroGenDB.ref('sensors').once('value');
        const data = snapshot.val();

        if (data && !reloadSoundPlayed) {
            const soil = Number(data.soil) || 0;
            const temp = Number(data.temp) || 0;
            const rawWater = Number(data.water) !== undefined ? Number(data.water) : 12;
            const waterPercent = waterValueToPercentExact(rawWater);
            const hum = Number(data.hum) || 0;
            const isTankFull = rawWater <= 0.5;

            const hasCriticalCondition = (
                soil < userThresholds.drySoil ||
                temp > 42 ||
                waterPercent < userThresholds.lowWater ||
                hum < 20 ||
                isTankFull
            );

            if (hasCriticalCondition && notificationPrefs.push) {
                reloadSoundPlayed = true;
                reloadBobShown = true;
                
                console.log("🔊 Page reload detected - critical condition found!");
                
                setTimeout(() => {
                    console.log("🔊 Playing alert sound on page reload");
                    playBobSound();
                    
                    if (isTankFull) {
                        showBobNotification("🚨 CRITICAL ALERT", "Water tank is OVERFLOWING! Emergency shutdown!", "critical", 8000, true);
                        if (!activeAlertConditions.water_overflow_critical) {
                            activeAlertConditions.water_overflow_critical = true;
                            addAlertToUI("water_overflow_critical", `🚨💦 CRITICAL: Water tank is OVERFLOWING! Emergency stop recommended!`, "critical", false);
                        }
                    } else if (soil < userThresholds.drySoil) {
                        showBobNotification("🚨 CRITICAL ALERT", `Soil is extremely dry (${soil}% < ${userThresholds.drySoil}%)! Water immediately!`, "critical", 8000, true);
                        if (!activeAlertConditions.soil_critical) {
                            activeAlertConditions.soil_critical = true;
                            addAlertToUI("soil_critical", `🚨 CRITICAL: Soil extremely dry (${soil}% < ${userThresholds.drySoil}%)! Water immediately!`, "critical", false);
                        }
                    } else if (temp > 42) {
                        showBobNotification("🚨 CRITICAL ALERT", `Extreme temperature (${temp}°C)! Provide shade!`, "critical", 8000, true);
                        if (!activeAlertConditions.temp_critical) {
                            activeAlertConditions.temp_critical = true;
                            addAlertToUI("temp_critical", `🔥 CRITICAL: Extreme temperature (${temp}°C)! Provide shade!`, "critical", false);
                        }
                    } else if (waterPercent < userThresholds.lowWater) {
                        showBobNotification("🚨 CRITICAL ALERT", `Water tank is empty (${waterPercent.toFixed(1)}% < ${userThresholds.lowWater}%)! Activate collection!`, "critical", 8000, true);
                        if (!activeAlertConditions.water_critical) {
                            activeAlertConditions.water_critical = true;
                            addAlertToUI("water_critical", `💧 CRITICAL: Water tank empty (${waterPercent.toFixed(1)}% < ${userThresholds.lowWater}%)! Activate collection!`, "critical", false);
                        }
                    } else if (hum < 20) {
                        showBobNotification("🚨 CRITICAL ALERT", `Very low humidity (${hum}%)! Poor water collection!`, "critical", 8000, true);
                        if (!activeAlertConditions.hum_critical) {
                            activeAlertConditions.hum_critical = true;
                            addAlertToUI("hum_critical", `💨 CRITICAL: Very low humidity (${hum}%)! Poor water collection!`, "critical", false);
                        }
                    }
                    
                    startCriticalAlertChecker();
                }, 1000);
                
                setTimeout(() => { 
                    reloadBobShown = false; 
                    console.log("🔓 Reload Bob flag reset");
                }, 10000);
            }
        }
    } catch(e) {
        console.log("Error checking sensors on reload:", e);
    }
}

if (shouldEnableAlerts()) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(checkAndPlayAlertOnReload, 1000);
            setTimeout(checkAndPlayAlertOnReload, 3000);
            setTimeout(checkAndPlayAlertOnReload, 5000);
        });
    } else {
        setTimeout(checkAndPlayAlertOnReload, 1000);
        setTimeout(checkAndPlayAlertOnReload, 3000);
        setTimeout(checkAndPlayAlertOnReload, 5000);
    }
}
// ================= ORIGINAL THEME.JS CODE BELOW (UNCHANGED) =================

function initTheme() {

    /* ===============================
       SIDE MENU
    =============================== */
    const menuBtn = document.getElementById("menuBtn");
    const closeBtn = document.getElementById("closeBtn");
    const sideMenu = document.getElementById("sideMenu");
    const overlay = document.getElementById("menuOverlay");

    const navLinks = document.getElementById("navLinks");

    menuBtn?.addEventListener("click", () => {
        sideMenu?.classList.add("active");
        overlay?.classList.add("active");
        navLinks?.classList.toggle("show");
    });

    closeBtn?.addEventListener("click", () => {
        sideMenu?.classList.remove("active");
        overlay?.classList.remove("active");
    });

    overlay?.addEventListener("click", () => {
        sideMenu?.classList.remove("active");
        overlay?.classList.remove("active");
    });


    /* ===============================
       REPORTS SUBMENU
    =============================== */

    // Desktop
    const reportsBtnDesktop = document.getElementById("reportsBtnDesktop");
    const reportsMenuDesktop = document.getElementById("reportsMenuDesktop");

    // Mobile
    const reportsBtnMobile = document.getElementById("reportsBtnMobile");
    const reportsMenuMobile = document.getElementById("reportsMenuMobile");


    /* ===============================
       THEME
    =============================== */
    function applyTheme(mode) {
        if (mode === "dark") {
            document.body.classList.add("dark");
        } else if (mode === "light") {
            document.body.classList.remove("dark");
        } else {
            document.body.classList.toggle(
                "dark",
                window.matchMedia("(prefers-color-scheme: dark)").matches
            );
        }
    }

    applyTheme(localStorage.getItem("theme") || "system");

    ["appearanceBtn", "appearanceBtn2"].forEach(id => {
        const btn = document.getElementById(id);
        const menu = document.getElementById(
            id === "appearanceBtn" ? "themeMenu" : "themeMenu2"
        );

        btn?.addEventListener("click", e => {
            e.stopPropagation();
            if (menu) {
                menu.style.display = menu.style.display === "flex" ? "none" : "flex";
            }
        });
    });

    document.querySelectorAll("[data-theme]").forEach(btn => {
        btn.addEventListener("click", () => {
            localStorage.setItem("theme", btn.dataset.theme);
            applyTheme(btn.dataset.theme);
            document.querySelectorAll(".theme-submenu").forEach(menu => menu.style.display = "none");
        });
    });

    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
        if ((localStorage.getItem("theme") || "system") === "system") {
            applyTheme("system");
        }
    });


    /* ===============================
       PROFILE DROPDOWN
    =============================== */
    const profileBtn = document.getElementById("profileBtn");
    const profileDropdown = document.getElementById("profileDropdown");


    function closeAllMenus() {
        profileDropdown?.classList.remove("active");
        document.querySelector(".notification-wrapper")?.classList.remove("active");
        document.querySelectorAll(".theme-submenu").forEach(menu => menu.style.display = "none");
        reportsMenuDesktop?.classList.remove("show");
        reportsMenuMobile?.classList.remove("show");
    }


    profileBtn?.addEventListener("click", e => {
        e.stopPropagation();
        const opened = profileDropdown?.classList.contains("active");
        closeAllMenus();
        if (!opened) {
            profileDropdown?.classList.add("active");
        }
    });


    document.addEventListener("click", e => {
        if (!profileBtn?.contains(e.target) && !profileDropdown?.contains(e.target)) {
            closeAllMenus();
        }
    });


    /* ===============================
       USER INFO
    =============================== */
    try {
        const raw = localStorage.getItem("hydroUser");
        const user = raw ? JSON.parse(raw) : null;

        if (user) {
            const name = user.name || user.email || "User";
            const email = user.email || "";
            const initial = name[0].toUpperCase();

            const username = document.getElementById("username");
            const emailEl = document.getElementById("email");
            const avatar = document.querySelector(".avatar");

            if (username) username.textContent = name;
            if (emailEl) emailEl.textContent = email;

            if (avatar) {
                avatar.textContent = initial;
                const colors = ["#2e7d32", "#1565c0", "#6a1b9a", "#c62828", "#f57f17", "#00695c"];
                avatar.style.backgroundColor = colors[initial.charCodeAt(0) % colors.length];
            }
        }
    } catch (e) { }


    /* ===============================
       SWITCH ACCOUNT
    =============================== */
    document.querySelectorAll(".drop-item").forEach(btn => {
        if (btn.textContent.trim().startsWith("Switch")) {
            btn.addEventListener("click", () => {
                localStorage.removeItem("hydroUser");
                window.location.href = "../login/Login.html";
            });
        }
    });


    /* ===============================
       LOGOUT
    =============================== */
    document.getElementById("logoutBtn")?.addEventListener("click", () => {
        localStorage.removeItem("hydroUser");
        window.location.href = "../landing/landing.html";
    });


    /* ===============================
       NOTIFICATIONS
    =============================== */
    const notifToggle = document.getElementById("notifToggle");
    const notifWrapper = document.querySelector(".notification-wrapper");


    notifToggle?.addEventListener("click", e => {
        e.stopPropagation();
        notifWrapper?.classList.toggle("active");
    });

    document.addEventListener("click", e => {
        if (!notifWrapper?.contains(e.target)) {
            notifWrapper?.classList.remove("active");
        }
    });


    /* ===============================
       REPORTS CLICK
    =============================== */

    reportsBtnDesktop?.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();
        reportsMenuDesktop?.classList.toggle("show");
    });


    reportsBtnMobile?.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();
        reportsMenuMobile?.classList.toggle("show");
    });


    document.addEventListener("click", e => {
        if (!reportsBtnDesktop?.contains(e.target) && !reportsMenuDesktop?.contains(e.target)) {
            reportsMenuDesktop?.classList.remove("show");
        }
        if (!reportsBtnMobile?.contains(e.target) && !reportsMenuMobile?.contains(e.target)) {
            reportsMenuMobile?.classList.remove("show");
        }
    });

}


/* ===============================
   INIT
=============================== */
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTheme);
} else {
    initTheme();
}