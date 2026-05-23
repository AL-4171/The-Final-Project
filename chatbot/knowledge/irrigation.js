/**
 * irrigation.js — HydroGen Irrigation Knowledge Module
 * Covers: zones, schedules, pump logic, watering recommendations
 */

window.IrrigationKnowledge = (function () {

    // ── Helpers ────────────────────────────────────────────────────────────
    function getSensors() {
        return window.SensorKnowledge
            ? window.SensorKnowledge.getSensorContext()
            : { temp: 25, hum: 60, soil: 50, tank: 70, pumpOn: false };
    }

    function getRain() {
        return window.weatherRainExpected || false;
    }

    // ── Zone helpers ───────────────────────────────────────────────────────
    function getZoneSummary(zones) {
        if (!zones || zones.length === 0) {
            return `🏞️ **No Zones Configured**\n\nYou have no irrigation zones yet.\n\n**To add a zone:**\n1. Go to 💧 Irrigation page\n2. Tap ➕ Add New Zone\n3. Set name, duration, and water amount\n\n💡 Tip: Create separate zones for vegetables, herbs, and trees!`;
        }

        const running = zones.filter(z => z.isRunning);
        const idle    = zones.filter(z => !z.isRunning);
        const totalWater = zones.reduce((a, z) => a + (z.waterPerCycle || 10), 0);

        let table = `| # | Zone | Status | Duration | Water/Cycle |\n|---|------|--------|----------|-------------|\n`;
        zones.forEach((z, i) => {
            table += `| ${i + 1} | ${z.icon || '🌱'} ${z.name} | ${z.isRunning ? '🟢 RUNNING' : '⚫ IDLE'} | ${z.duration || 30} min | ${z.waterPerCycle || 10}L |\n`;
        });

        return `🏞️ **Irrigation Zones — ${zones.length} total**\n\n${table}\n**Running:** ${running.length} zone(s) | **Idle:** ${idle.length} zone(s)\n**Total water per full cycle:** ${totalWater}L\n\n${running.length > 0 ? `🟢 Active: ${running.map(z => z.name).join(', ')}` : '⚫ All zones idle.'}`;
    }

    function getZoneRecommendations(zones, sensors) {
        const s  = sensors || getSensors();
        const rain = getRain();
        const lines = [];

        if (rain) {
            lines.push('🌧️ Rain expected — consider pausing all zones to save water.');
        }
        if (s.tank < 20) {
            lines.push(`⚠️ Tank critically low (${s.tank}%) — run essential zones only.`);
        }
        if (s.soil < 25) {
            lines.push(`🚨 Soil moisture very low (${s.soil}%) — run all plant zones soon.`);
        } else if (s.soil > 75) {
            lines.push(`✅ Soil well-hydrated (${s.soil}%) — no immediate zone activation needed.`);
        }
        if (s.temp > 35) {
            lines.push(`🔥 Extreme heat (${s.temp}°C) — run zones at dawn (5–8 AM) and dusk (7–9 PM) only.`);
        }

        return lines.length > 0
            ? `### 💡 Zone Recommendations\n${lines.map(l => `• ${l}`).join('\n')}`
            : `### 💡 Zone Status\n• ✅ Conditions are normal. Standard schedule can proceed.`;
    }

    // ── Schedule advice ────────────────────────────────────────────────────
    function scheduleAdvice() {
        const s    = getSensors();
        const rain = getRain();
        const hour = new Date().getHours();

        const timeAdvice = hour >= 5 && hour < 9
            ? '🟢 **Excellent time to water** — early morning minimises evaporation.'
            : hour >= 9 && hour < 12
            ? '🟡 Acceptable window — evaporation increasing. Finish soon.'
            : hour >= 12 && hour < 17
            ? '🔴 **Avoid watering now** — up to 50% water lost to evaporation.'
            : hour >= 17 && hour < 21
            ? '🟢 **Good evening window** — roots absorb well overnight.'
            : '🌙 Night watering — effective but watch for fungal risk on foliage.';

        return `⏰ **Irrigation Schedule Advisor**

${timeAdvice}

| Factor | Value | Impact |
|--------|-------|--------|
| 🌡️ Temperature | ${s.temp}°C | ${s.temp > 35 ? '⚠️ High evaporation' : '✅ Normal'} |
| 💧 Soil Moisture | ${s.soil}% | ${s.soil < 30 ? '🚨 Water soon' : s.soil > 70 ? '✅ OK' : '🟡 Monitor'} |
| 🌧️ Rain | ${rain ? 'Expected ✅' : 'None ❌'} | ${rain ? 'Delay irrigation' : 'Rely on system'} |
| 💦 Tank | ${s.tank}% | ${s.tank < 25 ? '⚠️ Low' : '✅ OK'} |

### 🗓️ Recommended Daily Schedule:
| Time | Action |
|------|--------|
| 5:30 AM | Main irrigation cycle — all zones |
| 12:00 PM | Sensor check only — no watering |
| 7:00 PM | Supplemental watering if soil < 40% |
| 10:00 PM | Pump off — night standby |

💡 Use **AI Mode** to automate this schedule based on live sensor data.`;
    }

    // ── Pump advice ────────────────────────────────────────────────────────
    function pumpAdvice() {
        const s = getSensors();
        const rain = getRain();

        const canRun = s.tank >= 10 && s.soil < 70 && !rain;
        const reason = s.tank < 10
            ? `🚫 Tank too low (${s.tank}%) — refill before running pump.`
            : rain
            ? `🌧️ Rain expected — pump activation not recommended.`
            : s.soil >= 70
            ? `✅ Soil is well-hydrated (${s.soil}%) — pump not needed.`
            : `✅ Conditions clear — pump can run.`;

        return `🚰 **Pump Status: ${s.pumpOn ? '🟢 RUNNING' : '⚫ OFF'}**

${reason}

| Mode | Description |
|------|-------------|
| 🤖 AUTO | AI controls pump based on all sensors |
| ✋ MANUAL | You control on/off directly |
| 🚨 EMERGENCY STOP | Halts all irrigation immediately |

### ⚙️ Current Conditions:
• Tank: **${s.tank}%** ${s.tank < 25 ? '⚠️' : '✅'}
• Soil: **${s.soil}%** ${s.soil < 30 ? '⚠️' : '✅'}
• Temp: **${s.temp}°C** ${s.temp > 35 ? '🔥' : '✅'}
• Rain: **${rain ? '🌧️ Expected' : '☀️ Clear'}**

💡 **Best practice:** Use AUTO mode so the AI prevents over/under-watering automatically.`;
    }

    // ── Water savings calculator ───────────────────────────────────────────
    function waterSavingsTips() {
        const s = getSensors();
        const rain = getRain();
        const savings = [];

        if (s.hum > 60)  savings.push({ tip: 'High humidity reduces evaporation — shorten cycle by 15%', save: '~0.3L/day' });
        if (rain)        savings.push({ tip: 'Skip today — rain will water naturally', save: '~2L today' });
        if (s.temp < 28) savings.push({ tip: 'Cool temps mean less frequent watering needed', save: '~0.4L/day' });

        let tipsBlock = savings.length > 0
            ? `| Tip | Potential Saving |\n|-----|------------------|\n` + savings.map(x => `| ${x.tip} | ${x.save} |`).join('\n')
            : '✅ No immediate savings opportunities — conditions are balanced.';

        return `💧 **Water Conservation Tips**

${tipsBlock}

### 🌱 General Best Practices:
• **Mulch soil** — reduces evaporation by up to 70%
• **Deep watering** — encourages drought-resistant root growth
• **Group plants by water need** — prevents over/under-watering
• **Early morning watering** — 40% less evaporation than midday
• **AI mode** — prevents wasted watering automatically

💦 Your HydroGen atmospheric water generator works best at humidity > 60%.
Current collection efficiency: **${s.hum > 70 ? 'HIGH 🟢' : s.hum > 50 ? 'MODERATE 🟡' : 'LOW 🔴'}**`;
    }

    // ── Public API ─────────────────────────────────────────────────────────
    return {
        getZoneSummary,
        getZoneRecommendations,
        scheduleAdvice,
        pumpAdvice,
        waterSavingsTips
    };

})();