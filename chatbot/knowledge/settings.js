/**
 * settings.js — HydroGen Settings & System Knowledge Module
 * Covers: configuration help, troubleshooting, system setup, FAQ
 */

window.SettingsKnowledge = (function () {

    // ── Settings page overview ─────────────────────────────────────────────
    function settingsOverview() {
        return `⚙️ **Settings Overview**

The Settings page lets you configure every aspect of your HydroGen system.

### 🗂️ Settings Categories:

| Section | What You Can Configure |
|---------|----------------------|
| 👤 Profile | Name, email, location, timezone |
| 🔔 Notifications | Alerts for low tank, dry soil, pump errors |
| 🤖 AI Mode | Enable/disable AI irrigation automation |
| 🌤️ Weather | Connect weather API for rain forecast |
| 🔧 Sensors | Calibrate sensors, set thresholds |
| 📶 Connectivity | Firebase, WiFi, device settings |
| 🔑 API Keys | OpenRouter, Groq AI keys |
| 💾 Data | Export history, clear data, backup |
| 🌙 Appearance | Dark/light mode, language |

💡 Tip: Enable **AI Mode** for the most intelligent irrigation — it reads all sensors automatically!`;
    }

    // ── Notification setup ─────────────────────────────────────────────────
    function notificationGuide() {
        return `🔔 **Notification Setup Guide**

Configure alerts so you never miss critical system events.

### 📲 Recommended Alerts:

| Alert | Trigger | Priority |
|-------|---------|----------|
| 🚨 Low Tank | Tank < 15% | CRITICAL |
| 🌱 Dry Soil | Soil < 20% | HIGH |
| 💧 Soil Saturated | Soil > 85% | MEDIUM |
| 🔥 Heat Alert | Temp > 38°C | HIGH |
| 🚰 Pump Error | Pump running > 2hr | MEDIUM |
| 🌧️ Rain Detected | Rain forecast active | LOW |
| ✅ Tank Full | Tank > 95% | LOW |

### 💡 Setup Steps:
1. Go to ⚙️ Settings → 🔔 Notifications
2. Toggle each alert on/off
3. Set your preferred threshold values
4. Choose delivery: push notification / in-app / email

Pro tip: Set Low Tank alert to 20% for extra reaction time!`;
    }

    // ── Sensor calibration ─────────────────────────────────────────────────
    function calibrationGuide() {
        return `🔧 **Sensor Calibration Guide**

Accurate sensors = accurate irrigation. Calibrate monthly for best results.

### 🌡️ Temperature Sensor:
• Place a known-accurate thermometer next to the sensor
• If readings differ by > 2°C, adjust offset in Settings → Sensors
• Ideal: ±0.5°C accuracy

### 💧 Humidity Sensor:
• Readings of 0% or 100% constantly = sensor fault
• Normal operating range: 10–95%
• Clean sensor contacts if dusty

### 🌱 Soil Moisture Sensor:
• **Dry calibration:** Push into completely dry soil, note reading = 0%
• **Wet calibration:** Submerge in water 30 seconds, note reading = 100%
• Recalibrate after changing soil type or pot

### 💦 Tank Level Sensor:
• Based on ultrasonic distance (12cm = full range)
• If showing wrong %, check sensor is centred over tank opening
• Wipe sensor face monthly to prevent dust buildup

### ⚡ After Calibration:
• Restart the device to apply new calibration values
• Check readings for 30 minutes to confirm stability`;
    }

    // ── Troubleshooting guide ──────────────────────────────────────────────
    function troubleshoot(issue) {
        const q = (issue || '').toLowerCase();

        if (q.includes('pump') || q.includes('not working') || q.includes('not watering')) {
            return `🔧 **Troubleshooting: Pump Not Working**

### 🔍 Diagnostic Checklist:
| Check | How | Expected Result |
|-------|-----|----------------|
| Tank level | Dashboard → Tank % | Above 10% |
| Pump mode | Settings → Mode | Not in EMERGENCY STOP |
| Power | Check device LED | Green = OK |
| Firebase | Browser console | No errors |
| Soil moisture | Dashboard | Below 70% (auto won't run if soil is wet) |

### 🔁 Quick Fixes:
1. **Soft reset** — Turn device off, wait 10 seconds, turn on
2. **Check AI mode** — AI won't run pump if soil > 70% or tank < 10%
3. **Switch to MANUAL** — Test if pump responds manually
4. **Check wiring** — Ensure pump connector is fully seated
5. **Firebase reconnect** — Toggle WiFi off/on

💡 If pump runs manually but not in AUTO — the AI is protecting your plants (likely soil or tank thresholds are blocking it).`;
        }

        if (q.includes('sensor') || q.includes('wrong') || q.includes('reading') || q.includes('incorrect')) {
            return `🔧 **Troubleshooting: Wrong Sensor Readings**

### 🌡️ Temperature Reading Wrong:
• Check sensor is not in direct sunlight
• Ensure sensor is not near heat sources (motor, electronics)
• Recalibrate in Settings → Sensors

### 🌱 Soil Sensor Wrong:
• Sensor must be fully inserted into soil
• Avoid placing near roots directly (disturbs readings)
• Recalibrate with dry + wet reference (see Calibration guide)

### 💧 Humidity Wrong:
• Normal indoor range: 30–80%
• Outdoors in summer: can reach 90%+
• Clean sensor monthly

### 💦 Tank Level Wrong:
• Ensure sensor cable is taut and sensor faces down into tank
• Check for debris on sensor face
• Tank formula: (12 - distance_cm) / 12 × 100%

💡 If all sensors read 0 or are frozen — check Firebase connection first.`;
        }

        if (q.includes('wifi') || q.includes('connection') || q.includes('offline') || q.includes('firebase')) {
            return `📶 **Troubleshooting: Connectivity Issues**

### 🔌 Connection Status Checks:
1. Open browser DevTools (F12) → Console tab
2. Look for Firebase connection messages
3. Check for red errors

### 🔁 Quick Fixes:
| Problem | Solution |
|---------|---------|
| Firebase timeout | Refresh page |
| No sensor data | Check WiFi on device |
| Data not updating | Hard refresh (Ctrl+Shift+R) |
| Always showing defaults | Firebase DB not connected |

### 🌐 HydroGen runs on:
• **Firebase Realtime Database** for live sensor sync
• **OpenWeather API** for weather forecast
• **OpenRouter/Groq** for AI chatbot intelligence

All three can work independently — if one fails, others continue.`;
        }

        if (q.includes('dark mode') || q.includes('theme') || q.includes('appearance')) {
            return `🌙 **Theme & Appearance Settings**

### 🎨 Available Themes:
• ☀️ **Light Mode** — Clean white interface (default)
• 🌙 **Dark Mode** — Eye-friendly dark green theme

### How to Switch:
1. Go to ⚙️ Settings → 🌙 Appearance
2. Toggle Dark/Light mode

💡 Dark mode uses **class="dark"** on the body tag.
The chatbot, tables, and all UI components automatically adapt.

All charts and tables in Analytics have matching dark mode styles.`;
        }

        // Default troubleshooting
        return `🔧 **Troubleshooting Assistant**

What issue are you experiencing? Ask me about:

| Issue | Example Question |
|-------|-----------------|
| 🚰 Pump problems | "Pump not working" |
| 📡 Wrong readings | "Soil sensor showing wrong value" |
| 📶 Connection | "System showing offline" |
| 🌙 Appearance | "How to enable dark mode" |
| 🔔 Notifications | "Not receiving alerts" |
| 💾 Data | "How to export my data" |

💡 Or describe your problem and I'll diagnose it!`;
    }

    // ── AI mode explanation ────────────────────────────────────────────────
    function aiModeExplain() {
        return `🤖 **AI Irrigation Mode — How It Works**

When AI Mode is enabled, HydroGen automatically decides when and how long to water based on:

| Factor | How AI Uses It |
|--------|---------------|
| 🌱 Soil Moisture | Primary trigger — waters when dry |
| 🌡️ Temperature | Adjusts frequency in heat/cold |
| 💧 Humidity | Reduces watering in high humidity |
| 💦 Tank Level | Won't water if tank < 10% |
| 🌧️ Rain Forecast | Skips irrigation if rain expected |
| ⏰ Time of Day | Only waters during optimal windows |

### 🧠 AI Decision Logic:
1. **Read all sensors** every 30 seconds
2. **Check weather** forecast for rain
3. **Calculate** optimal watering duration
4. **Activate pump** only if ALL conditions allow
5. **Stop** when soil reaches target moisture

### 🎯 Benefits of AI Mode:
• **Saves water** — no wasteful fixed schedules
• **Healthier plants** — always optimal moisture
• **Fully autonomous** — works while you sleep
• **Protects tank** — reserves water intelligently

💡 AI Mode is the recommended way to run HydroGen!`;
    }

    // ── Public API ─────────────────────────────────────────────────────────
    return {
        settingsOverview,
        notificationGuide,
        calibrationGuide,
        troubleshoot,
        aiModeExplain
    };

})();