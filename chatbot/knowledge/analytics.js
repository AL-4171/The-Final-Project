/**
 * analytics.js — HydroGen Analytics & Reports Knowledge Module
 * Covers: data interpretation, trends, report generation advice, chart explanations
 */

window.AnalyticsKnowledge = (function () {

    function getSensors() {
        return window.SensorKnowledge
            ? window.SensorKnowledge.getSensorContext()
            : { temp: 25, hum: 60, soil: 50, tank: 70, pumpOn: false };
    }

    // ── Data trend interpretation ──────────────────────────────────────────
    function interpretTrend(values, label, unit) {
        if (!values || values.length < 2) return `Not enough data to determine ${label} trend.`;
        const first = values[0];
        const last  = values[values.length - 1];
        const diff  = last - first;
        const pct   = ((Math.abs(diff) / (first || 1)) * 100).toFixed(1);
        const dir   = diff > 0 ? '📈 Rising' : diff < 0 ? '📉 Falling' : '➡️ Stable';
        return `${dir} ${label}: ${first}${unit} → ${last}${unit} (${diff > 0 ? '+' : ''}${diff.toFixed(1)}${unit}, ${pct}%)`;
    }

    // ── Analytics page overview ────────────────────────────────────────────
    function analyticsOverview() {
        const s = getSensors();

        return `📊 **Analytics Overview**

The Analytics page shows historical trends for all your sensors so you can make better irrigation decisions.

### 📈 What Each Chart Tells You:

| Chart | What to Look For | Action Trigger |
|-------|-----------------|----------------|
| 🌱 Soil Moisture | Steady decline = normal | Water when drops below 35% |
| 🌡️ Temperature | Peaks above 35°C | Add extra irrigation session |
| 💧 Humidity | Below 40% for long periods | Expect faster tank depletion |
| 💦 Tank Level | Fast drops = heavy use | Check pump efficiency |
| 🚰 Pump Runtime | More runtime = more usage | Review zone durations |

### 📊 Current Snapshot:
| Sensor | Value | Health |
|--------|-------|--------|
| 🌡️ Temperature | ${s.temp}°C | ${s.temp > 35 ? '⚠️ Hot' : s.temp < 15 ? '❄️ Cool' : '✅ Good'} |
| 💧 Humidity | ${s.hum}% | ${s.hum < 40 ? '⚠️ Low' : s.hum > 80 ? '⚠️ High' : '✅ Good'} |
| 🌱 Soil | ${s.soil}% | ${s.soil < 30 ? '🚨 Low' : s.soil > 75 ? '🔵 High' : '✅ Good'} |
| 💦 Tank | ${s.tank}% | ${s.tank < 25 ? '⚠️ Low' : '✅ Good'} |

💡 **Tip:** Check weekly trends to identify patterns — for example, if soil drops every afternoon, an evening schedule may be more efficient.`;
    }

    // ── Report generation guide ────────────────────────────────────────────
    function reportGuide(type) {
        const t = (type || '').toLowerCase();

        if (t.includes('water') || t.includes('usage') || t.includes('consumption')) {
            return `💧 **Water Usage Report**

### 📋 What This Report Shows:
• Total water consumed per day/week/month
• Water collected from atmosphere vs used for irrigation
• Peak usage times and zones
• Efficiency score (water used vs optimal)

### 📊 Key Metrics to Track:
| Metric | Good Range | Action if Outside |
|--------|-----------|-------------------|
| Daily Usage | 1.0–1.8L | Adjust zone durations |
| Collection Rate | > 0.5L/day | Check humidity & system |
| Waste Ratio | < 15% | Enable AI mode |
| Tank Refill Freq. | 1–2x / week | Monitor system health |

### 💡 Reducing Water Consumption:
1. Switch to AI irrigation mode
2. Shorten midday zone sessions
3. Add mulch to reduce evaporation
4. Group zones by plant water needs`;
        }

        if (t.includes('sensor') || t.includes('health') || t.includes('system')) {
            return `🔧 **System Health Report**

### 📋 What This Report Covers:
• Sensor accuracy and calibration status
• Pump runtime hours and efficiency
• Tank fill/drain cycles
• Alert history and frequency

### 🩺 System Health Indicators:
| Component | Check | Warning Sign |
|-----------|-------|-------------|
| 🌡️ Temp Sensor | Daily readings stable | Sudden ±10°C jumps |
| 💧 Humidity Sensor | 30–95% range | Always 0% or 100% |
| 🌱 Soil Sensor | Responds to watering | No change after irrigation |
| 💦 Tank Sensor | Drops after pump runs | Static level readings |
| 🚰 Pump | Soil changes after run | Soil unchanged post-pump |

💡 If a sensor seems stuck, check wiring connections and recalibrate in Settings.`;
        }

        if (t.includes('crop') || t.includes('plant') || t.includes('growth')) {
            return `🌿 **Crop Performance Report**

### 📋 What This Report Tracks:
• Irrigation adequacy per zone
• Temperature stress events (below 5°C or above 38°C)
• Soil moisture consistency score
• Optimal vs actual watering comparison

### 🌱 Healthy Crop Conditions:
| Parameter | Target Range | Your Current |
|-----------|-------------|-------------|
| Soil Moisture | 45–70% | See live data |
| Avg Temp | 15–30°C | See live data |
| Humidity | 40–65% | See live data |
| Irrigation Freq. | Based on crop type | Check zone schedule |

💡 Download monthly reports to track seasonal performance changes.`;
        }

        // Default: general report guide
        return `📄 **Reports Overview**

The Reports page lets you export and review your irrigation system's historical data.

### 📊 Available Report Types:
| Report | What It Shows |
|--------|--------------|
| 💧 Water Usage | Consumption trends and efficiency |
| 🔧 System Health | Sensor accuracy, pump runtime |
| 🌿 Crop Performance | Soil & temperature adequacy |
| 🌡️ Environmental | Temp, humidity, weather patterns |
| 📅 Schedule Summary | When and how long each zone ran |

### 📥 Export Options:
• **PDF** — for sharing or printing
• **Chart screenshots** — for quick visuals

💡 Ask me about a specific report type for detailed guidance!`;
    }

    // ── Efficiency scoring ─────────────────────────────────────────────────
    function efficiencyScore() {
        const s = getSensors();
        const rain = window.weatherRainExpected || false;

        let score = 70; // baseline
        let notes = [];

        if (s.soil >= 40 && s.soil <= 70) { score += 10; notes.push('✅ Soil moisture in optimal range'); }
        else if (s.soil < 30)             { score -= 15; notes.push('⚠️ Soil too dry — efficiency impacted'); }
        else if (s.soil > 80)             { score -= 10; notes.push('⚠️ Overwatering detected — efficiency impacted'); }

        if (s.tank >= 30)  { score += 5;  notes.push('✅ Tank level adequate'); }
        else               { score -= 10; notes.push('⚠️ Low tank reduces system efficiency'); }

        if (rain)          { score -= 5;  notes.push('🌧️ Rain expected — irrigation may be wasteful today'); }

        if (s.hum > 60)    { score += 5;  notes.push('✅ Good humidity — collection system efficient'); }
        else               { score -= 5;  notes.push('⚠️ Low humidity slows water collection'); }

        score = Math.min(100, Math.max(0, score));
        const grade = score >= 85 ? '🟢 Excellent' : score >= 65 ? '🟡 Good' : score >= 45 ? '🟠 Fair' : '🔴 Poor';

        return `📊 **Irrigation Efficiency Score: ${score}/100 — ${grade}**

### 📋 Score Breakdown:
${notes.map(n => `• ${n}`).join('\n')}

### 🎯 How to Improve:
${score < 85 ? '• Enable AI irrigation mode for automatic optimisation\n• Check zone durations — shorter is often better\n• Water only in 5–9 AM and 6–9 PM windows\n• Ensure tank stays above 30%' : '• Your system is running at high efficiency! Keep monitoring.'}`;
    }

    // ── Public API ─────────────────────────────────────────────────────────
    return {
        analyticsOverview,
        reportGuide,
        efficiencyScore,
        interpretTrend
    };

})();