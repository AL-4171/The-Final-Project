// ================= IRRIGATION.JS - FINAL FIXED VERSION =================
// FIXED: Zone START/STOP - Bob only, NO sound, ring alert NO sound
// FIXED: Soil target slider - shows real-time value in create AND edit forms
// FIXED: Schedule days - properly editable in BOTH create AND edit forms

(function () {
    if (!localStorage.getItem("hydroUser")) {
        window.location.replace("../landing/landing.html");
    }
})();

const database = window.hydroGenDB;
const currentUserId = "fcyeSoWkmqcfqgafPCQAN6vtV5M2";

let zones = [];
let schedules = [];
let currentPumpState = false;
let activityLog = [];
let currentSensorData = { temp: 0, hum: 0, soil: 0, water: 0 };
let weatherRainExpected = false;
window.weatherRainExpected = weatherRainExpected;

const maxTankLevelCm = 30;
const maxCapacityLiters = 2;

// ===================== HELPER FUNCTIONS =====================
function waterValueToPercent(waterValue) {
    if (waterValue === undefined || waterValue === null) return 0;
    const clamped = Math.min(12, Math.max(0, waterValue));
    const percent = ((12 - clamped) / 12) * 100;
    return Math.round(percent);
}

function waterValueToLiters(waterValue) {
    return (waterValueToPercent(waterValue) / 100) * maxCapacityLiters;
}

async function saveActivityLog(message, type) {
    const logEntry = {
        id: Date.now(),
        message: message,
        type: type,
        timestamp: Date.now(),
        timeStr: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
    await database.ref(`users_w/${currentUserId}/activityLog/${logEntry.id}`).set(logEntry);
    await loadActivityLog();
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

function calculateWaterNeed(zone, currentSoil) {
    const target = zone.soilTarget || 60;
    let need = 0;
    if (currentSoil < target) {
        need = ((target - currentSoil) / target) * 100;
    }
    return Math.min(100, Math.max(0, Math.round(need)));
}

function validateDates(startDate, endDate) {
    if (startDate && endDate && endDate < startDate) {
        alert("End date cannot be before start date");
        return false;
    }
    return true;
}

function getZoneTypeName(icon) {
    const types = { '🌱': 'Garden', '🥕': 'Vegetables', '🌻': 'Flowers', '🌿': 'Herbs', '🍓': 'Fruits' };
    return types[icon] || 'Garden';
}

// ===================== SOIL TARGET SLIDER FUNCTIONS =====================
function setupSoilTargetSlider() {
    const soilSlider = document.getElementById('zoneSoilTarget');
    const soilValue = document.getElementById('soilTargetValue');
    if (soilSlider && soilValue) {
        soilSlider.addEventListener('input', function() {
            soilValue.innerText = this.value + '%';
        });
    }
}

function setupEditSoilTargetSlider() {
    const editSoilSlider = document.getElementById('editZoneSoilTarget');
    const editSoilValue = document.getElementById('editSoilTargetValue');
    if (editSoilSlider && editSoilValue) {
        editSoilSlider.addEventListener('input', function() {
            editSoilValue.innerText = this.value + '%';
        });
    }
}

// ===================== DAY SELECTOR FUNCTIONS =====================
function setupDaySelectors(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    const daySelectors = modal.querySelectorAll('.day-selector');
    daySelectors.forEach(selector => {
        // Remove any existing listeners to avoid duplicates
        const newSelector = selector.cloneNode(true);
        selector.parentNode.replaceChild(newSelector, selector);
        
        const checkbox = newSelector.querySelector('.day-checkbox');
        
        // Click handler for the entire selector
        newSelector.addEventListener('click', function(e) {
            if (checkbox) {
                checkbox.checked = !checkbox.checked;
                if (checkbox.checked) {
                    this.classList.add('active');
                } else {
                    this.classList.remove('active');
                }
            }
        });
        
        // Set initial active class based on checkbox state
        if (checkbox && checkbox.checked) {
            newSelector.classList.add('active');
        }
    });
}

// ===================== LOAD DATA =====================
async function loadZones() {
    const snapshot = await database.ref(`users_w/${currentUserId}/zones`).once('value');
    const data = snapshot.val();
    zones = data ? Object.values(data) : [];
    renderZones();
    updateScheduleSelects();
}

async function loadSchedules() {
    const snapshot = await database.ref(`users_w/${currentUserId}/schedules`).once('value');
    const data = snapshot.val();
    schedules = data ? Object.values(data) : [];
    renderSchedules();
}

async function loadActivityLog() {
    const snapshot = await database.ref(`users_w/${currentUserId}/activityLog`).limitToLast(10).once('value');
    const data = snapshot.val();
    activityLog = data ? Object.values(data).reverse() : [];
    renderActivityLog();
}

// ===================== RENDER ZONES =====================
function renderZones() {
    const container = document.getElementById('zonesGrid');
    if (!container) return;

    if (zones.length === 0) {
        container.innerHTML = `<div class="text-center py-12 col-span-3"><i class="fas fa-seedling text-6xl text-gray-300 mb-4"></i><p class="text-gray-400">No zones configured. Click Add New Zone to get started!</p><button onclick="showAddZoneModal()" class="mt-4 px-6 py-2 bg-green-600 text-white rounded-full hover:bg-green-700 transition shadow-md">+ Add Your First Zone</button></div>`;
        return;
    }

    container.innerHTML = zones.map(zone => {
        const zoneSoil = currentSensorData.soil || 50;
        const waterNeed = calculateWaterNeed(zone, zoneSoil);
        const needColor = waterNeed > 70 ? '#ef4444' : (waterNeed > 40 ? '#f59e0b' : '#10b981');
        
        let dateRangeText = '';
        if (zone.startDate && zone.endDate) {
            dateRangeText = `<div class="mt-1"><small><i class="fas fa-calendar-alt"></i> ${zone.startDate} → ${zone.endDate}</small></div>`;
        } else if (zone.startDate) {
            dateRangeText = `<div class="mt-1"><small><i class="fas fa-calendar-alt"></i> From: ${zone.startDate}</small></div>`;
        } else if (zone.endDate) {
            dateRangeText = `<div class="mt-1"><small><i class="fas fa-calendar-alt"></i> Until: ${zone.endDate}</small></div>`;
        }
        
        return `
            <div class="zone-card ${zone.isRunning ? 'running' : ''}" data-description="${escapeHtml(zone.description || '')}">
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="text-2xl">${zone.icon || '🌱'}</span>
                            <h5 class="font-bold mb-0 text-gray-800 dark:text-white">${escapeHtml(zone.name)}</h5>
                        </div>
                        <small class="text-gray-500 dark:text-gray-400">${zone.lastWatered ? `Last: ${new Date(zone.lastWatered).toLocaleTimeString()}` : 'Not watered yet'}</small>
                    </div>
                    <span class="status-badge ${zone.isRunning ? 'status-running' : 'status-active'}">
                        ${zone.isRunning ? '⏺ RUNNING' : '● ACTIVE'}
                    </span>
                </div>
                
                <div class="flex justify-around items-center my-4">
                    <div class="text-center">
                        <div class="text-base font-bold text-gray-800 dark:text-white" id="soil-${zone.id}">${zoneSoil}%</div>
                        <small class="text-gray-500 dark:text-gray-400 text-xs">Soil</small>
                        <div class="soil-meter mt-1" style="width: 60px;">
                            <div class="soil-fill" style="width: ${zoneSoil}%; background: ${needColor};"></div>
                        </div>
                    </div>
                    <div class="text-center">
                        <div class="text-base font-bold text-gray-800 dark:text-white">${zone.waterPerCycle || 10} L</div>
                        <small class="text-gray-500 dark:text-gray-400 text-xs">Per cycle</small>
                    </div>
                    <div class="text-center">
                        <div class="text-base font-bold text-gray-800 dark:text-white">${zone.duration || 30} min</div>
                        <small class="text-gray-500 dark:text-gray-400 text-xs">Duration</small>
                    </div>
                </div>

                <div class="bg-gray-100 dark:bg-gray-700 rounded-lg p-2 mb-3 text-center schedule-info">
                    <span class="text-xs text-gray-700 dark:text-gray-300">Target Soil: ${zone.soilTarget || 60}% | Schedule: ${zone.time || 'Manual'}</span>
                    ${dateRangeText}
                </div>
                
                <div class="flex gap-2">
                    <button onclick="toggleZone('${zone.id}')" class="${zone.isRunning ? 'zone-stop-btn' : 'zone-start-btn'}" style="flex: 1;">
                        ${zone.isRunning ? '⏹️ STOP' : '▶️ START'}
                    </button>
                    <button onclick="downloadZoneReport('${zone.id}')" class="zone-btn-icon" title="Download Report">
                        <i class="fas fa-download text-sm"></i>
                    </button>
                    <button onclick="editZone('${zone.id}')" class="zone-btn-icon" title="Edit Zone">
                        <i class="fas fa-edit text-sm"></i>
                    </button>
                    <button onclick="deleteZone('${zone.id}')" class="zone-btn-icon" title="Delete Zone">
                        <i class="fas fa-trash text-sm"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// ===================== RENDER SCHEDULES =====================
function renderSchedules() {
    const container = document.getElementById('scheduleList');
    if (!container) return;

    if (schedules.length === 0) {
        container.innerHTML = '<div class="text-center py-4 text-gray-400">No schedules configured</div>';
        return;
    }

    container.innerHTML = schedules.map(schedule => {
        const zone = zones.find(z => z.id === schedule.zoneId);
        return `
            <div class="schedule-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--border-color);">
                <div>
                    <div class="font-semibold text-gray-800 dark:text-white text-sm">${escapeHtml(schedule.name)}</div>
                    <small class="text-gray-500 dark:text-gray-400 text-xs">${zone?.name || 'Unknown'} • ${schedule.time} • ${schedule.duration} min</small>
                    <div class="mt-1">
                        ${schedule.days?.map(day => `<span class="day-badge" style="background: #10b981; color: white; padding: 2px 8px; border-radius: 12px; font-size: 9px; display: inline-block; margin-right: 4px;">${day.substring(0,3)}</span>`).join('')}
                    </div>
                    ${schedule.startDate ? `<div class="mt-1"><small class="text-gray-400 text-xs">Start: ${schedule.startDate}</small></div>` : ''}
                </div>
                <div class="flex gap-2">
                    <button onclick="editSchedule('${schedule.id}')" class="schedule-edit-btn" style="padding: 5px 12px; font-size: 11px;">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button onclick="deleteSchedule('${schedule.id}')" class="schedule-delete-btn" style="padding: 5px 12px; font-size: 11px;">
                        <i class="fas fa-trash"></i> Del
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function renderActivityLog() {
    const container = document.getElementById('activityLog');
    if (!container) return;

    if (activityLog.length === 0) {
        container.innerHTML = '<div class="text-center py-4 text-gray-400">No recent activity</div>';
        return;
    }

    container.innerHTML = activityLog.map(log => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border-color);">
            <div>
                <i class="fas ${log.type === 'zone_start' ? 'fa-play text-green-500' : log.type === 'zone_stop' ? 'fa-stop text-red-500' : log.type === 'schedule_start' ? 'fa-clock text-blue-500' : 'fa-info-circle text-blue-500'} text-xs me-2"></i>
                <span class="text-xs text-gray-700 dark:text-gray-300">${escapeHtml(log.message)}</span>
            </div>
            <small class="text-gray-400 text-xs">${log.timeStr}</small>
        </div>
    `).join('');
}

// ===================== SCHEDULE CHECKER SYSTEM =====================
let scheduleInterval = null;

function startScheduleChecker() {
    if (scheduleInterval) clearInterval(scheduleInterval);
    scheduleInterval = setInterval(() => { checkAndExecuteSchedules(); }, 30000);
    checkAndExecuteSchedules();
}

async function checkAndExecuteSchedules() {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' });
    const currentDate = now.toISOString().split('T')[0];
    
    await loadSchedules();
    await loadZones();
    
    for (const schedule of schedules) {
        if (!schedule.isActive) continue;
        if (schedule.startDate && schedule.startDate > currentDate) continue;
        
        const timeMatch = (currentTime === schedule.time);
        const dayMatch = schedule.days && schedule.days.includes(currentDay);
        
        if (!timeMatch || !dayMatch) continue;
        
        const lastExecutionKey = `lastSchedule_${schedule.id}_${currentDate}`;
        if (localStorage.getItem(lastExecutionKey)) continue;
        
        const zone = zones.find(z => z.id === schedule.zoneId);
        if (!zone) continue;
        if (zone.isRunning) continue;
        
        const waterPercent = waterValueToPercent(currentSensorData.water);
        if (waterPercent < 10) {
            window.showBobNotification("⚠️ Schedule Skipped", `Schedule "${schedule.name}" skipped - Water tank empty!`, "warning", 8000, true);
            window.addAlertToUI(`schedule_skipped_${Date.now()}`, `⚠️ Schedule "${schedule.name}" skipped - Water tank empty!`, "warning", true);
            await saveActivityLog(`Schedule "${schedule.name}" skipped - Water tank low (${Math.round(waterPercent)}%)`, 'schedule_skipped');
            continue;
        }
        
        localStorage.setItem(lastExecutionKey, Date.now().toString());
        cleanupOldScheduleRecords(schedule.id);
        
        try {
            await database.ref(`users_w/${currentUserId}/zones/${zone.id}`).update({ isRunning: true, lastStartedAt: Date.now() });
            await database.ref('controls/pump').set(1);
            
            window.showBobNotification("💧 Schedule Started", `Schedule "${schedule.name}" started for zone "${zone.name}"`, "success", 8000, true);
            window.addAlertToUI(`schedule_start_${Date.now()}`, `💧 Schedule "${schedule.name}" started - Zone "${zone.name}"`, "success", true);
            await saveActivityLog(`Schedule "${schedule.name}" started zone "${zone.name}" at ${schedule.time}`, 'schedule_start');
            
            const durationMs = (schedule.duration || zone.duration || 30) * 60 * 1000;
            setTimeout(async () => {
                const currentZone = await database.ref(`users_w/${currentUserId}/zones/${zone.id}`).once('value');
                if (currentZone.val()?.isRunning) {
                    await database.ref(`users_w/${currentUserId}/zones/${zone.id}`).update({ isRunning: false, lastWatered: Date.now() });
                    const zonesSnapshot = await database.ref(`users_w/${currentUserId}/zones`).once('value');
                    const anyRunning = Object.values(zonesSnapshot.val() || {}).some(z => z.isRunning);
                    if (!anyRunning) await database.ref('controls/pump').set(0);
                    window.showBobNotification("✅ Schedule Completed", `Schedule "${schedule.name}" completed for zone "${zone.name}"`, "success", 5000, false);
                    await saveActivityLog(`Schedule "${schedule.name}" completed for zone "${zone.name}"`, 'schedule_complete');
                    await loadZones();
                }
            }, durationMs);
            await loadZones();
        } catch (error) {
            console.error("Error executing schedule:", error);
            await saveActivityLog(`Schedule "${schedule.name}" failed to start`, 'schedule_failed');
        }
    }
}

function cleanupOldScheduleRecords(scheduleId) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`lastSchedule_${scheduleId}_`)) {
            const dateStr = key.replace(`lastSchedule_${scheduleId}_`, '');
            if (new Date(dateStr) < sevenDaysAgo) localStorage.removeItem(key);
        }
    }
}

// ===================== ZONE ACTIONS =====================
window.toggleZone = async function(zoneId) {
    const zone = zones.find(z => z.id === zoneId);
    if (!zone) return;
    const newState = !zone.isRunning;
    
    if (newState) {
        const waterPercent = waterValueToPercent(currentSensorData.water);
        if (waterPercent < 10) {
            window.showBobNotification("❌ Cannot Start", `Zone "${zone.name}" cannot start - Water tank empty!`, "warning", 5000, true);
            window.addAlertToUI(`zone_start_empty_${Date.now()}`, `❌ Cannot start "${zone.name}" - Water tank empty!`, "critical", true);
            return;
        }
        
        await database.ref(`users_w/${currentUserId}/zones/${zoneId}`).update({ isRunning: true, lastStartedAt: Date.now() });
        await database.ref('controls/pump').set(1);
        await saveActivityLog(`Started zone: ${zone.name}`, 'zone_start');
        // ZONE START - Bob only, NO sound, ring alert NO sound
        window.showBobNotification("💧 Zone Started", `Zone "${zone.name}" started irrigation`, "success", 4000, false);
        window.addAlertToUI(`zone_start_${Date.now()}`, `💧 Zone "${zone.name}" started irrigation`, "success", false);
        
        const durationMs = (zone.duration || 30) * 60 * 1000;
        setTimeout(async () => {
            const currentZone = await database.ref(`users_w/${currentUserId}/zones/${zoneId}`).once('value');
            if (currentZone.val()?.isRunning) {
                await database.ref(`users_w/${currentUserId}/zones/${zoneId}`).update({ isRunning: false, lastWatered: Date.now() });
                const zonesSnapshot = await database.ref(`users_w/${currentUserId}/zones`).once('value');
                const anyRunning = Object.values(zonesSnapshot.val() || {}).some(z => z.isRunning);
                if (!anyRunning) await database.ref('controls/pump').set(0);
                await saveActivityLog(`Completed: ${zone.name}`, 'zone_complete');
                window.showBobNotification("✅ Zone Completed", `Zone "${zone.name}" completed irrigation cycle`, "success", 4000, false);
                await loadZones();
            }
        }, durationMs);
    } else {
        await database.ref(`users_w/${currentUserId}/zones/${zoneId}`).update({ isRunning: false });
        const zonesSnapshot = await database.ref(`users_w/${currentUserId}/zones`).once('value');
        const anyRunning = Object.values(zonesSnapshot.val() || {}).some(z => z.isRunning);
        if (!anyRunning) await database.ref('controls/pump').set(0);
        await saveActivityLog(`Stopped zone: ${zone.name}`, 'zone_stop');
        // ZONE STOP - Bob only, NO sound, ring alert NO sound
        window.showBobNotification("⏹️ Zone Stopped", `Zone "${zone.name}" stopped`, "info", 4000, false);
        window.addAlertToUI(`zone_stop_${Date.now()}`, `⏹️ Zone "${zone.name}" stopped`, "success", false);
    }
    await loadZones();
};

// ===================== EMERGENCY STOP =====================
const emergencyStopBtn = document.getElementById('emergencyStopBtn');
if (emergencyStopBtn) {
    emergencyStopBtn.addEventListener('click', async () => {
        if (confirm('EMERGENCY STOP - Stop all irrigation and pump immediately?')) {
            for (const zone of zones) {
                if (zone.isRunning) {
                    await database.ref(`users_w/${currentUserId}/zones/${zone.id}/isRunning`).set(false);
                }
            }
            await database.ref('controls/pump').set(0);
            window.showBobNotification("🚨 EMERGENCY STOP", "All irrigation halted and pump stopped!", "critical", 8000, true);
            window.addAlertToUI("emergency_stop", "🚨 EMERGENCY STOP - All irrigation halted and pump stopped", "critical", true);
            await saveActivityLog('EMERGENCY STOP ACTIVATED - Pump and all zones stopped', 'emergency');
            await loadZones();
        }
    });
}

// ===================== ZONE CRUD =====================
window.addNewZone = async function() {
    const name = document.getElementById('zoneName').value;
    const icon = document.getElementById('zoneIcon').value;
    const duration = parseInt(document.getElementById('zoneDuration').value);
    const waterAmount = parseInt(document.getElementById('zoneWaterAmount').value);
    const priority = parseInt(document.getElementById('zonePriority').value);
    const soilTarget = parseInt(document.getElementById('zoneSoilTarget').value);
    const time = document.getElementById('zoneTime').value;
    const description = document.getElementById('zoneDescription').value;
    const startDate = document.getElementById('zoneStartDate').value;
    const endDate = document.getElementById('zoneEndDate').value;
    
    if (!name) { 
        window.addAlertToUI('zone_name_error', '❌ Please enter a zone name', 'warning', true);
        window.showBobNotification("❌ Error", "Please enter a zone name", "warning", 3000, false);
        return; 
    }
    if (!validateDates(startDate, endDate)) return;
    
    const newZone = {
        id: `zone_${Date.now()}`,
        name, icon, duration: duration || 30, waterPerCycle: waterAmount || 10,
        priority: priority || 2, soilTarget: soilTarget || 60, time: time || "06:00",
        startDate: startDate || "", endDate: endDate || "", description: description || "",
        isActive: true, isRunning: false, totalWaterUsed: 0, cycles: 0, lastWatered: null, createdAt: Date.now()
    };
    
    await database.ref(`users_w/${currentUserId}/zones/${newZone.id}`).set(newZone);
    await loadZones();
    closeAddZoneModal();
    await saveActivityLog(`Created zone: ${name}`, 'zone_create');
    window.showBobNotification("✅ Zone Created", `New zone "${name}" created successfully`, "success", 4000, false);
    window.addAlertToUI(`zone_create_${Date.now()}`, `✅ New zone "${name}" created successfully`, "success", false);
    
    document.getElementById('zoneName').value = '';
    document.getElementById('zoneDescription').value = '';
    document.getElementById('zoneStartDate').value = '';
    document.getElementById('zoneEndDate').value = '';
    document.getElementById('zoneSoilTarget').value = 60;
    document.getElementById('soilTargetValue').innerText = '60%';
};

window.editZone = async function(zoneId) {
    const zone = zones.find(z => z.id === zoneId);
    if (!zone) return;
    document.getElementById('editZoneId').value = zone.id;
    document.getElementById('editZoneName').value = zone.name;
    document.getElementById('editZoneIcon').value = zone.icon || '🌱';
    document.getElementById('editZoneDuration').value = zone.duration || 30;
    document.getElementById('editZoneWaterAmount').value = zone.waterPerCycle || 10;
    document.getElementById('editZonePriority').value = zone.priority || 2;
    document.getElementById('editZoneSoilTarget').value = zone.soilTarget || 60;
    document.getElementById('editSoilTargetValue').innerText = `${zone.soilTarget || 60}%`;
    document.getElementById('editZoneTime').value = zone.time || "06:00";
    document.getElementById('editZoneStartDate').value = zone.startDate || '';
    document.getElementById('editZoneEndDate').value = zone.endDate || '';
    document.getElementById('editZoneDescription').value = zone.description || '';
    document.getElementById('editZoneModal').classList.remove('hidden');
};

window.saveZoneEdit = async function() {
    const zoneId = document.getElementById('editZoneId').value;
    const startDate = document.getElementById('editZoneStartDate').value;
    const endDate = document.getElementById('editZoneEndDate').value;
    if (!validateDates(startDate, endDate)) return;
    
    const updates = {
        name: document.getElementById('editZoneName').value,
        icon: document.getElementById('editZoneIcon').value,
        duration: parseInt(document.getElementById('editZoneDuration').value),
        waterPerCycle: parseInt(document.getElementById('editZoneWaterAmount').value),
        priority: parseInt(document.getElementById('editZonePriority').value),
        soilTarget: parseInt(document.getElementById('editZoneSoilTarget').value),
        time: document.getElementById('editZoneTime').value,
        startDate: startDate || "", endDate: endDate || "",
        description: document.getElementById('editZoneDescription').value
    };
    await database.ref(`users_w/${currentUserId}/zones/${zoneId}`).update(updates);
    await loadZones();
    closeEditZoneModal();
    await saveActivityLog(`Updated zone: ${updates.name}`, 'zone_edit');
    window.showBobNotification("✏️ Zone Updated", `Zone "${updates.name}" updated`, "success", 4000, false);
    window.addAlertToUI(`zone_edit_${Date.now()}`, `✏️ Zone "${updates.name}" updated`, "success", false);
};

window.deleteZone = async function(zoneId) {
    if (!confirm('Delete this zone?')) return;
    const zone = zones.find(z => z.id === zoneId);
    await database.ref(`users_w/${currentUserId}/zones/${zoneId}`).remove();
    await loadZones();
    await saveActivityLog(`Deleted zone: ${zone.name}`, 'zone_delete');
    window.showBobNotification("🗑️ Zone Deleted", `Zone "${zone.name}" deleted`, "info", 4000, false);
    window.addAlertToUI(`zone_delete_${Date.now()}`, `🗑️ Zone "${zone.name}" deleted`, "success", false);
};

// ===================== SCHEDULE CRUD =====================
window.addNewSchedule = async function() {
    const name = document.getElementById('scheduleName').value;
    const zoneId = document.getElementById('scheduleZone').value;
    const time = document.getElementById('scheduleTime').value;
    const duration = parseInt(document.getElementById('scheduleDuration').value);
    const selectedDays = Array.from(document.querySelectorAll('#addScheduleModal .day-checkbox:checked')).map(cb => cb.value);
    const startDate = document.getElementById('scheduleStartDate').value;
    
    if (!name || !zoneId || !time || selectedDays.length === 0) {
        window.addAlertToUI('schedule_error', '❌ Please fill all fields and select at least one day', 'warning', true);
        window.showBobNotification("❌ Error", "Please fill all fields and select at least one day", "warning", 3000, false);
        return;
    }
    
    const zone = zones.find(z => z.id === zoneId);
    const newSchedule = {
        id: `schedule_${Date.now()}`,
        name, zoneId, zoneName: zone?.name, time, days: selectedDays, duration,
        startDate: startDate || "", isActive: true, createdAt: Date.now()
    };
    
    await database.ref(`users_w/${currentUserId}/schedules/${newSchedule.id}`).set(newSchedule);
    await database.ref(`users_w/${currentUserId}/zones/${zoneId}`).update({ time: time });
    await loadSchedules();
    await loadZones();
    closeAddScheduleModal();
    await saveActivityLog(`Created schedule: ${name} for zone ${zone?.name}`, 'schedule_create');
    window.showBobNotification("⏰ Schedule Created", `Schedule "${name}" created for zone "${zone?.name}"`, "success", 4000, false);
    window.addAlertToUI(`schedule_create_${Date.now()}`, `⏰ Schedule "${name}" created for zone "${zone?.name}"`, "success", false);
    
    document.getElementById('scheduleName').value = '';
    document.querySelectorAll('#addScheduleModal .day-checkbox').forEach(cb => cb.checked = false);
    document.querySelectorAll('#addScheduleModal .day-selector').forEach(sel => sel.classList.remove('active'));
};

window.editSchedule = async function(scheduleId) {
    const schedule = schedules.find(s => s.id === scheduleId);
    if (!schedule) return;
    
    document.getElementById('editScheduleId').value = schedule.id;
    document.getElementById('editScheduleName').value = schedule.name;
    document.getElementById('editScheduleTime').value = schedule.time;
    document.getElementById('editScheduleDuration').value = schedule.duration;
    document.getElementById('editScheduleStartDate').value = schedule.startDate || '';
    
    const zoneSelect = document.getElementById('editScheduleZone');
    zoneSelect.innerHTML = '<option value="">Choose zone...</option>' + zones.map(z => `<option value="${z.id}" ${z.id === schedule.zoneId ? 'selected' : ''}>${z.icon || '🌱'} ${escapeHtml(z.name)}</option>`).join('');
    
    // Reset all checkboxes first
    const allCheckboxes = document.querySelectorAll('#editScheduleModal .day-checkbox');
    allCheckboxes.forEach(cb => {
        cb.checked = false;
        const selector = cb.closest('.day-selector');
        if (selector) selector.classList.remove('active');
    });
    
    // Set checked days from schedule data
    if (schedule.days && Array.isArray(schedule.days)) {
        allCheckboxes.forEach(cb => {
            if (schedule.days.includes(cb.value)) {
                cb.checked = true;
                const selector = cb.closest('.day-selector');
                if (selector) selector.classList.add('active');
            }
        });
    }
    
    document.getElementById('editScheduleModal').classList.remove('hidden');
    // Setup day selectors for edit schedule modal
    setTimeout(() => setupDaySelectors('editScheduleModal'), 100);
};

window.saveScheduleEdit = async function() {
    const scheduleId = document.getElementById('editScheduleId').value;
    const zoneId = document.getElementById('editScheduleZone').value;
    const zone = zones.find(z => z.id === zoneId);
    const selectedDays = Array.from(document.querySelectorAll('#editScheduleModal .day-checkbox:checked')).map(cb => cb.value);
    const startDate = document.getElementById('editScheduleStartDate').value;
    
    if (!zoneId || selectedDays.length === 0) {
        window.addAlertToUI('schedule_edit_error', '❌ Please select a zone and at least one day', 'warning', true);
        window.showBobNotification("❌ Error", "Please select a zone and at least one day", "warning", 3000, false);
        return;
    }
    
    const updates = {
        name: document.getElementById('editScheduleName').value,
        zoneId, zoneName: zone?.name,
        time: document.getElementById('editScheduleTime').value,
        duration: parseInt(document.getElementById('editScheduleDuration').value),
        days: selectedDays, startDate: startDate || ""
    };
    
    await database.ref(`users_w/${currentUserId}/schedules/${scheduleId}`).update(updates);
    await database.ref(`users_w/${currentUserId}/zones/${zoneId}`).update({ time: updates.time });
    await loadSchedules();
    await loadZones();
    closeEditScheduleModal();
    await saveActivityLog(`Updated schedule: ${updates.name} for zone ${zone?.name}`, 'schedule_edit');
    window.showBobNotification("✏️ Schedule Updated", `Schedule "${updates.name}" updated for zone "${zone?.name}"`, "success", 4000, false);
    window.addAlertToUI(`schedule_edit_${Date.now()}`, `✏️ Schedule "${updates.name}" updated for zone "${zone?.name}"`, "success", false);
};

window.deleteSchedule = async function(scheduleId) {
    if (!confirm('Delete this schedule?')) return;
    const schedule = schedules.find(s => s.id === scheduleId);
    await database.ref(`users_w/${currentUserId}/schedules/${scheduleId}`).remove();
    await loadSchedules();
    await saveActivityLog(`Deleted schedule: ${schedule?.name}`, 'schedule_delete');
    window.showBobNotification("🗑️ Schedule Deleted", `Schedule "${schedule?.name}" deleted`, "info", 4000, false);
    window.addAlertToUI(`schedule_delete_${Date.now()}`, `🗑️ Schedule "${schedule?.name}" deleted`, "success", false);
};

// ===================== PUMP CONTROL =====================
const pumpToggle = document.getElementById('pumpToggle');
const pumpRef = database.ref('controls/pump');

pumpRef.on('value', (snapshot) => {
    currentPumpState = snapshot.val() === 1;
    if (pumpToggle) {
        pumpToggle.checked = currentPumpState;
        const label = document.getElementById('pumpToggleLabel');
        if (label) label.innerText = currentPumpState ? 'ON' : 'OFF';
    }
});

if (pumpToggle) {
    pumpToggle.addEventListener('change', async (e) => {
        await pumpRef.set(e.target.checked ? 1 : 0);
        const message = `Main pump turned ${e.target.checked ? 'ON' : 'OFF'}`;
        await saveActivityLog(message, 'pump');
        // PUMP CONTROL - Bob appears, NO sound, ring alert NO sound
        window.showBobNotification("🔌 Pump Control", message, e.target.checked ? "success" : "info", 4000, false);
        window.addAlertToUI(`pump_${Date.now()}`, `🔌 ${message}`, e.target.checked ? "success" : "success", false);
    });
}

// ===================== SENSOR LISTENER =====================
database.ref('sensors').on('value', (snapshot) => {
    const d = snapshot.val();
    if (!d) return;

    const temp  = parseFloat(d.temp ?? d.temperature ?? 0);
    const hum   = parseFloat(d.hum ?? d.humidity ?? 0);
    const soil  = parseFloat(d.soil ?? d.soilMoisture ?? 0);
    const water = parseFloat(d.water ?? 0);

    currentSensorData = { temp, hum, soil, water };

    zones.forEach(zone => {
        const soilElement = document.getElementById(`soil-${zone.id}`);
        if (soilElement) {
            soilElement.innerText = `${Math.round(soil)}%`;
        }
    });

    const waterPercent = waterValueToPercent(water);
    const totalWaterLiters = waterValueToLiters(water);
    const waterHeightCm = (waterPercent / 100) * maxTankLevelCm;

    const tankFill = document.getElementById('tankLevelFill');
    if (tankFill) tankFill.style.width = `${waterPercent}%`;
    
    const tankPercentSpan = document.getElementById('tankPercent');
    if (tankPercentSpan) tankPercentSpan.innerText = `${Math.round(waterPercent)}%`;
    
    const tankLitersSpan = document.getElementById('tankLiters');
    if (tankLitersSpan) tankLitersSpan.innerText = totalWaterLiters.toFixed(2);
    
    const tankCmSpan = document.getElementById('tankCm');
    if (tankCmSpan) tankCmSpan.innerText = waterHeightCm.toFixed(1);
    
    console.log(`🌱 REAL sensor data - Soil: ${soil}% | Temp: ${temp}°C | Humidity: ${hum}% | Water: ${waterPercent}%`);
});

// ===================== DOWNLOAD REPORT =====================
window.downloadZoneReport = async function(zoneId) {
    const zone = zones.find(z => z.id === zoneId);
    if (!zone) { 
        window.addAlertToUI('zone_not_found', '❌ Zone not found', 'warning', true);
        window.showBobNotification("❌ Error", "Zone not found", "warning", 3000, false);
        return; 
    }
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        const now = new Date();
        const reportDateTime = now.toLocaleString('en-GB');
        const cleanZoneName = String(zone.name || 'Zone').replace(/[^\w\s]/g, '');
        const zoneTypeName = getZoneTypeName(zone.icon);
        const cleanDescription = (zone.description || "No description").replace(/[^\w\s.,!?-]/g, '');
        
        doc.setFillColor(16, 185, 129);
        doc.rect(0, 0, 210, 45, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(20);
        doc.text("HydroGen", 20, 25);
        doc.setFontSize(12);
        doc.text("Professional Zone Report", 20, 38);
        doc.setFontSize(9);
        doc.text(`Exported: ${reportDateTime}`, 140, 20);
        
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(18);
        doc.text(`${cleanZoneName}`, 20, 70);
        
        doc.setFontSize(11);
        let y = 90;
        
        const details = [
            { label: "Zone Type", value: zoneTypeName },
            { label: "Duration", value: `${zone.duration || 30} minutes` },
            { label: "Water per Cycle", value: `${zone.waterPerCycle || 10} liters` },
            { label: "Priority", value: zone.priority == 1 ? "High" : (zone.priority == 2 ? "Medium" : "Low") },
            { label: "Soil Target", value: `${zone.soilTarget || 60}%` },
            { label: "Current Soil", value: `${currentSensorData.soil || 0}%` },
            { label: "Temperature", value: `${currentSensorData.temp || 0}°C` },
            { label: "Humidity", value: `${currentSensorData.hum || 0}%` },
            { label: "Watered Status", value: zone.lastWatered ? new Date(zone.lastWatered).toLocaleString() : "Not watered yet" },
            { label: "Start Date", value: zone.startDate || "Not set" },
            { label: "End Date", value: zone.endDate || "Not set" },
            { label: "Schedule Time", value: zone.time || "Manual" },
            { label: "Description", value: cleanDescription }
        ];
        
        details.forEach(detail => {
            doc.text(`${detail.label}: ${detail.value}`, 20, y);
            y += 9;
            if (y > 270) { doc.addPage(); y = 20; }
        });
        
        doc.setFillColor(16, 185, 129);
        doc.rect(0, 285, 210, 12, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.text("HydroGen AI System 2026", 20, 292);
        doc.text("Smart Water-from-Air Irrigation", 105, 292);
        
        const safeFileName = `HydroGen_Zone_${cleanZoneName.replace(/[^a-zA-Z0-9]/g, '_')}_Report.pdf`;
        doc.save(safeFileName);
        
        await saveActivityLog(`Downloaded report for zone: ${zone.name}`, 'report');
        window.showBobNotification("📄 Report Downloaded", `Report for "${zone.name}" downloaded!`, "success", 3000, false);
    } catch(e) { 
        console.error("PDF Error:", e); 
        window.addAlertToUI('pdf_error', '❌ Failed to generate report', 'warning', true);
        window.showBobNotification("❌ PDF Failed", "Could not generate report", "warning", 3000, false);
    }
};

// ===================== MODAL CONTROLS =====================
window.showAddZoneModal = () => {
    document.getElementById('zoneStartDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('addZoneModal').classList.remove('hidden');
    setupSoilTargetSlider();
};
window.closeAddZoneModal = () => document.getElementById('addZoneModal').classList.add('hidden');
window.showAddScheduleModal = () => {
    updateScheduleSelects();
    document.getElementById('scheduleStartDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('addScheduleModal').classList.remove('hidden');
    setTimeout(() => setupDaySelectors('addScheduleModal'), 100);
};
window.closeAddScheduleModal = () => document.getElementById('addScheduleModal').classList.add('hidden');
window.closeEditZoneModal = () => {
    document.getElementById('editZoneModal').classList.add('hidden');
};
window.closeEditScheduleModal = () => {
    document.getElementById('editScheduleModal').classList.add('hidden');
};
window.clearLogs = async function() {
    if (confirm('Clear all activity logs?')) {
        await database.ref(`users_w/${currentUserId}/activityLog`).remove();
        await loadActivityLog();
        window.addAlertToUI('logs_cleared', '🗑️ Activity logs cleared', 'success', false);
        window.showBobNotification("🗑️ Logs Cleared", "Activity logs cleared", "info", 3000, false);
    }
};

function updateScheduleSelects() {
    const select = document.getElementById('scheduleZone');
    if (select) select.innerHTML = '<option value="">Choose zone...</option>' + zones.map(z => `<option value="${z.id}">${z.icon || '🌱'} ${escapeHtml(z.name)}</option>`).join('');
    const editSelect = document.getElementById('editScheduleZone');
    if (editSelect) editSelect.innerHTML = '<option value="">Choose zone...</option>' + zones.map(z => `<option value="${z.id}">${z.icon || '🌱'} ${escapeHtml(z.name)}</option>`).join('');
}

// ===================== INITIALIZE =====================
async function init() {
    console.log("Initializing Irrigation Page...");
    await loadZones();
    await loadSchedules();
    await loadActivityLog();
    startScheduleChecker();
    setupSoilTargetSlider();
    setupEditSoilTargetSlider();
}
init();