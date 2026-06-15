/**
 * chatbot.js — HydroGen Universal AI Chatbot v4.3
 * Works on: Home, Dashboard, Irrigation, Analytics, Reports, Settings
 *
 * v4.3 Fix: Comprehensive logging for AI engine selection
 *           Shows in console which engine is used for each response
 *           Auto-updates welcome message when Firebase sensors change (even when chat is closed)
 */

// ── Auto-load all knowledge modules ────────────────────────────────────────
(function loadKnowledgeModules() {
    const scripts    = document.querySelectorAll('script[src]');
    let   chatbotSrc = '';
    scripts.forEach(s => { if (s.src.includes('chatbot.js')) chatbotSrc = s.src; });

    const base = chatbotSrc
        ? chatbotSrc.substring(0, chatbotSrc.lastIndexOf('/') + 1)
        : '';

    const modules = [
        'knowledge/sensors.js',
        'knowledge/weather.js',
        'knowledge/irrigation.js',
        'knowledge/analytics.js',
        'knowledge/settings.js'
    ];

    modules.forEach(mod => {
        const alreadyLoaded = Array.from(document.querySelectorAll('script[src]'))
            .some(s => s.src.includes(mod.replace('knowledge/', '')));
        if (alreadyLoaded) return;

        const script    = document.createElement('script');
        script.src      = base + mod;
        script.async    = false;
        script.onerror  = () => console.warn(`⚠️ [Chatbot] Could not load module: ${mod}`);
        script.onload   = () => console.log(`✅ [Chatbot] Loaded: ${mod}`);
        document.head.appendChild(script);
    });
})();
// ───────────────────────────────────────────────────────────────────────────

(function () {
    'use strict';

    if (window.hydrogenChatbotLoaded) {
        console.log('🤖 [Chatbot] Already initialized — skipping.');
        return;
    }
    window.hydrogenChatbotLoaded = true;
    console.log('🤖 [Chatbot] Initializing HydroGen Universal Chatbot v4.3...');
    console.log('📋 [Chatbot] Logging enabled - will show which AI engine is used for each response');

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // BOOT
    // ══════════════════════════════════════════════════════════════════════════
    async function boot() {
        console.log('🤖 [Chatbot] DOM ready — booting...');
        setupChatUI();
        setupSidebarListener();
        await waitForFirebase();
        await fetchSensorData();
        await loadAPIs();
        logAvailableEngines();
        setInterval(fetchSensorData, 30000);
        setTimeout(sendWelcomeMessage, 1200);
        console.log('✅ [Chatbot] Boot complete!');
    }

    // ══════════════════════════════════════════════════════════════════════════
    // LOGGING FUNCTION - Shows which engines are available
    // ══════════════════════════════════════════════════════════════════════════
    function logAvailableEngines() {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🔍 [Chatbot] AI ENGINE STATUS:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        const openrouterStatus = API.openrouter.key ? '🟢 AVAILABLE' : '🔴 NOT CONFIGURED';
        const groqStatus = API.groq.key ? '🟢 AVAILABLE' : '🔴 NOT CONFIGURED';
        const localStatus = '🟢 ALWAYS AVAILABLE (Local Knowledge Base)';
        
        console.log(`🌐 OpenRouter AI:   ${openrouterStatus}`);
        console.log(`⚡ Groq AI:         ${groqStatus}`);
        console.log(`📚 Local Knowledge: ${localStatus}`);
        console.log(`🎯 Active Engine:   ${activeApiName}`);
        
        // Check if knowledge modules are loaded
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📦 KNOWLEDGE MODULES STATUS:');
        console.log(`   SensorKnowledge:    ${window.SensorKnowledge ? '✅ LOADED' : '❌ MISSING'}`);
        console.log(`   WeatherKnowledge:   ${window.WeatherKnowledge ? '✅ LOADED' : '❌ MISSING'}`);
        console.log(`   IrrigationKnowledge:${window.IrrigationKnowledge ? '✅ LOADED' : '❌ MISSING'}`);
        console.log(`   AnalyticsKnowledge: ${window.AnalyticsKnowledge ? '✅ LOADED' : '❌ MISSING'}`);
        console.log(`   SettingsKnowledge:  ${window.SettingsKnowledge ? '✅ LOADED' : '❌ MISSING'}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        if (!API.openrouter.key && !API.groq.key) {
            console.log('💡 [Chatbot] No API keys configured. Using Local Knowledge Base only.');
            console.log('   To add API keys, configure them in Firebase config or Settings page.');
        } else if (API.openrouter.key) {
            console.log('💡 [Chatbot] OpenRouter AI is configured and will be used for non-sensor questions.');
        } else if (API.groq.key) {
            console.log('💡 [Chatbot] Groq AI is configured and will be used for non-sensor questions.');
        }
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SIDEBAR LISTENER
    // ══════════════════════════════════════════════════════════════════════════
    function setupSidebarListener() {
        const sideMenu    = document.getElementById('sideMenu');
        const menuBtn     = document.getElementById('menuBtn');
        const closeBtn    = document.getElementById('closeBtn');
        const menuOverlay = document.getElementById('menuOverlay');

        function updateChatZIndex() {
            const chatWindow = document.getElementById('chatWindow');
            const chatIcon   = document.getElementById('chatIcon');
            if (sideMenu && sideMenu.classList.contains('active')) {
                if (chatWindow) chatWindow.style.zIndex = '100';
                if (chatIcon)   chatIcon.style.zIndex   = '100';
                document.body.classList.add('sidebar-open');
            } else {
                if (chatWindow) chatWindow.style.zIndex = '1000';
                if (chatIcon)   chatIcon.style.zIndex   = '1000';
                document.body.classList.remove('sidebar-open');
            }
        }

        [menuBtn, closeBtn, menuOverlay].forEach(el => {
            if (el) el.addEventListener('click', () => setTimeout(updateChatZIndex, 50));
        });

        updateChatZIndex();

        if (sideMenu) {
            new MutationObserver(mutations => {
                mutations.forEach(m => { if (m.attributeName === 'class') updateChatZIndex(); });
            }).observe(sideMenu, { attributes: true });
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // FIREBASE WAIT
    // ══════════════════════════════════════════════════════════════════════════
    function waitForFirebase() {
        return new Promise(resolve => {
            if (window.hydroGenDB) return resolve();
            const t = setInterval(() => {
                if (window.hydroGenDB) { clearInterval(t); resolve(); }
            }, 100);
            setTimeout(() => { clearInterval(t); resolve(); }, 10000);
        });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SENSOR DATA — live Firebase listener, works on ALL pages
    // ══════════════════════════════════════════════════════════════════════════
    let _sensorCache    = null;
    let _lastSensorFetch = 0;
    let _liveListenerOn  = false;
    let _cachedWelcomeMessage = null;
    let _lastWelcomeData = null;

    function isChatOpen() {
        const chatWindow = document.getElementById('chatWindow');
        return chatWindow && chatWindow.style.display === 'flex';
    }

    function updateWelcomeMessageDisplay() {
        const chatBox = document.getElementById('chatBox');
        if (!chatBox) return;
        
        const firstMsg = chatBox.querySelector('.msg.ai');
        if (!firstMsg) return;
        
        if (_cachedWelcomeMessage) {
            firstMsg.innerHTML = `<strong>🤖 HydroGen AI</strong><br>${formatMessageWithTables(_cachedWelcomeMessage)}`;
            console.log('🔄 [Chatbot] Welcome message updated');
        }
    }

    function updateWelcomeMessageCache() {
        const d = getSensorData();
        if (!d || d.temp === null) return;
        
        // Check if data changed significantly
        if (_lastWelcomeData && 
            _lastWelcomeData.tank === d.tank && 
            _lastWelcomeData.soil === d.soil && 
            _lastWelcomeData.temp === d.temp && 
            _lastWelcomeData.hum === d.hum) {
            return;
        }
        
        _lastWelcomeData = { ...d };
        
        const page = detectPage();
        const greet = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';
        
        const pageContext = {
            dashboard:  `I can see your live sensor data and help you decide when and how to irrigate.`,
            irrigation: `I can help you manage your zones, schedules, pump, and watering strategy.`,
            analytics:  `I can explain your charts, trends, and help you optimise irrigation efficiency.`,
            reports:    `I can guide you through generating and interpreting your system reports.`,
            settings:   `I can help you configure your system, troubleshoot issues, and set up AI mode.`,
            home:       `I'm your intelligent irrigation assistant.`
        };
        
        const statusTable = `| Metric | Value |\n|--------|-------|\n| 🌡️ Temperature | ${d.temp}°C |\n| 💧 Humidity | ${d.hum}% |\n| 🌱 Soil | ${d.soil}% |\n| 💦 Tank | ${d.tank}% |`;
        
        _cachedWelcomeMessage = `👋 ${greet}! I'm HydroGen AI.
${pageContext[page] || pageContext.home}

📊 **Live Status:**
${statusTable}

Ask me anything about your irrigation system!`;
        
        console.log('🔄 [Chatbot] Welcome message cache updated');
        
        // If chat is open, update it immediately
        if (isChatOpen()) {
            updateWelcomeMessageDisplay();
        }
    }

    function startLiveSensorListener() {
        if (_liveListenerOn || !window.hydroGenDB) return;
        _liveListenerOn = true;
        console.log('🔌 [Chatbot] Starting live Firebase sensor listener...');

        window.hydroGenDB.ref('sensors').on('value', snap => {
            const sensorsData = snap.val() || {};
            let rawWater = sensorsData.water !== undefined ? parseFloat(sensorsData.water) : 12;
            const tankPercent = Math.floor(((12 - Math.min(12, Math.max(0, rawWater))) / 12) * 100);
            _sensorCache = {
                temp:     sensorsData.temp  !== undefined ? parseFloat(sensorsData.temp)  : null,
                hum:      sensorsData.hum   !== undefined ? parseFloat(sensorsData.hum)   : null,
                soil:     sensorsData.soil  !== undefined ? parseFloat(sensorsData.soil)  : null,
                tank:     tankPercent,
                pumpOn:   _sensorCache ? _sensorCache.pumpOn : false,
                rawWater: rawWater
            };
            _lastSensorFetch = Date.now();
            console.log('🌡️ [Chatbot] Live sensor update from Firebase:', _sensorCache);
            
            // Update welcome message cache
            updateWelcomeMessageCache();
        });

        window.hydroGenDB.ref('controls/pump').on('value', snap => {
            const pumpOn = snap.val() === 1;
            if (_sensorCache) {
                _sensorCache.pumpOn = pumpOn;
            } else {
                _sensorCache = { temp: null, hum: null, soil: null, tank: 0, pumpOn: pumpOn, rawWater: 12 };
            }
            console.log('🚰 [Chatbot] Pump status updated:', pumpOn ? 'ON' : 'OFF');
            
            // Update welcome message cache
            updateWelcomeMessageCache();
        });
    }

    async function fetchSensorData() {
        if (!window.hydroGenDB) await waitForFirebase();

        if (window.hydroGenDB) startLiveSensorListener();

        if (_sensorCache && _sensorCache.temp !== null && (Date.now() - _lastSensorFetch < 10000)) {
            return _sensorCache;
        }

        if (window.hydroGenDB) {
            try {
                console.log('🔄 [Chatbot] Fetching fresh sensor data from Firebase...');
                const sensorsSnap = await window.hydroGenDB.ref('sensors').once('value');
                const sensorsData = sensorsSnap.val() || {};
                const pumpSnap    = await window.hydroGenDB.ref('controls/pump').once('value');
                const pumpState   = pumpSnap.val() === 1;
                let rawWater = sensorsData.water !== undefined ? parseFloat(sensorsData.water) : 12;
                const tankPercent = Math.floor(((12 - Math.min(12, Math.max(0, rawWater))) / 12) * 100);
                _sensorCache = {
                    temp:     sensorsData.temp  !== undefined ? parseFloat(sensorsData.temp)  : null,
                    hum:      sensorsData.hum   !== undefined ? parseFloat(sensorsData.hum)   : null,
                    soil:     sensorsData.soil  !== undefined ? parseFloat(sensorsData.soil)  : null,
                    tank:     tankPercent,
                    pumpOn:   pumpState,
                    rawWater: rawWater
                };
                _lastSensorFetch = Date.now();
                console.log('✅ [Chatbot] Fresh Firebase fetch complete:', _sensorCache);
                
                // Update welcome message cache
                updateWelcomeMessageCache();
            } catch (e) {
                console.warn('⚠️ [Chatbot] Sensor fetch error:', e);
            }
        }
        return _sensorCache;
    }

    function getSensorData() {
        if (_sensorCache && _sensorCache.temp !== null) return _sensorCache;
        return _sensorCache || null;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // WEATHER FORECAST
    // ══════════════════════════════════════════════════════════════════════════
    async function getRealWeatherForecast() {
        const WEATHER_API_KEY = "5dd74768dc40a34a27ac51503c655bec";
        const CITY = "Port Said";
        try {
            console.log('🌤️ [Weather] Fetching forecast for', CITY);
            const res = await fetch(`https://api.openweathermap.org/data/2.5/forecast?q=${CITY}&appid=${WEATHER_API_KEY}&units=metric`);
            const data = await res.json();
            if (data.cod !== "200") throw new Error();

            const currentWeather = data.list[0];

            const rainExpected = data.list.slice(0, 3).some(item =>
                item.weather[0].main.toLowerCase().includes('rain')
            );
            if (typeof window !== 'undefined') window.weatherRainExpected = rainExpected;

            let forecast = [];
            data.list.slice(0, 6).forEach(item => {
                const time = new Date(item.dt_txt);
                forecast.push({
                    time:      time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    hour:      time.getHours(),
                    temp:      Math.round(item.main.temp),
                    condition: item.weather[0].description,
                    rain:      item.weather[0].main.toLowerCase().includes('rain'),
                    pop:       Math.round((item.pop || 0) * 100)
                });
            });

            console.log('✅ [Weather] Forecast fetched, rain expected:', rainExpected);

            return {
                current: {
                    temp:         Math.round(currentWeather.main.temp),
                    feelsLike:    Math.round(currentWeather.main.feels_like),
                    humidity:     currentWeather.main.humidity,
                    wind:         Math.round(currentWeather.wind.speed),
                    condition:    currentWeather.weather[0].description,
                    rainExpected: rainExpected
                },
                forecast: forecast,
                city: CITY
            };
        } catch (e) {
            console.error('❌ [Weather] Fetch error:', e);
            return null;
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // API MANAGEMENT
    // ══════════════════════════════════════════════════════════════════════════
    const API = {
        groq:       { key: null, name: 'Groq',       endpoint: 'https://api.groq.com/openai/v1/chat/completions',   model: 'llama-3.3-70b-versatile' },
        openrouter: { key: null, name: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1/chat/completions', model: 'meta-llama/llama-4-scout' }
    };
    let apiLoaded = false;
    let activeApiName = 'Local Knowledge';

    async function loadAPIs() {
        if (apiLoaded) return;
        try {
            if (window.hydroGenDB) {
                console.log('🔑 [APIs] Loading API keys from Firebase...');
                const snap = await window.hydroGenDB.ref('config').once('value');
                const cfg  = snap.val() || {};
                API.openrouter.key = cfg.openrouterKey || cfg.OPENROUTER_KEY || null;
                API.groq.key       = cfg.groqKey       || cfg.GROQ_KEY       || null;
                
                if (API.openrouter.key) {
                    console.log('✅ [APIs] OpenRouter API key loaded');
                } else {
                    console.log('⚠️ [APIs] No OpenRouter API key found in Firebase config');
                }
                
                if (API.groq.key) {
                    console.log('✅ [APIs] Groq API key loaded');
                } else {
                    console.log('⚠️ [APIs] No Groq API key found in Firebase config');
                }
                
                activeApiName = API.groq.key ? 'Groq AI' : API.openrouter.key ? 'OpenRouter AI' : 'Local Knowledge';
            }
        } catch (e) { console.error('❌ [APIs] Failed to load API keys:', e); }
        apiLoaded = true;
        console.log(`🤖 [APIs] Active engine: ${activeApiName}`);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ZONE DATA
    // ══════════════════════════════════════════════════════════════════════════
    let _cachedZones   = [];
    let _lastZoneFetch = 0;

    async function getZones() {
        const now = Date.now();
        if (_cachedZones.length > 0 && now - _lastZoneFetch < 10000) return _cachedZones;
        try {
            if (window.hydroGenDB) {
                const uid  = localStorage.getItem('userId') || 'fcyeSoWkmqcfqgafPCQAN6vtV5M2';
                const snap = await window.hydroGenDB.ref(`users_w/${uid}/zones`).once('value');
                const data = snap.val();
                if (data) {
                    _cachedZones   = Object.values(data);
                    _lastZoneFetch = now;
                    console.log(`📦 [Zones] Loaded ${_cachedZones.length} zones.`);
                    return _cachedZones;
                }
            }
        } catch (e) { console.warn('⚠️ [Zones] Fetch error:', e); }
        return [];
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PAGE DETECTION (used only for welcome message, NOT for answer variation)
    // ══════════════════════════════════════════════════════════════════════════
    function detectPage() {
        const path = window.location.pathname.toLowerCase();
        if (path.includes('dashboard'))  return 'dashboard';
        if (path.includes('irrigation')) return 'irrigation';
        if (path.includes('analytic'))   return 'analytics';
        if (path.includes('report'))     return 'reports';
        if (path.includes('setting'))    return 'settings';
        return 'home';
    }

    const PAGE_QUESTIONS = {
        home:       ['💧 Should I water?', '📊 Sensor status', '🌤️ Weather forecast'],
        dashboard:  ['💧 Should I water?', '📊 All sensor data', '💦 Tank level'],
        irrigation: ['💧 Should I water?', '🏞️ My zones', '⏰ Best watering time', '🚰 Pump advice'],
        analytics:  ['📊 Efficiency score', '📈 Analytics overview', '💧 Should I water?'],
        reports:    ['📄 Report guide', '📊 Efficiency score', '💧 Water usage report'],
        settings:   ['⚙️ Settings help', '🔧 Troubleshoot', '🤖 AI mode explained']
    };

    function getPageQuestions() {
        return PAGE_QUESTIONS[detectPage()] || PAGE_QUESTIONS.home;
    }

    function getPageWelcome(d) {
        const page  = detectPage();
        const greet = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';

        const tempStr = d && d.temp !== null ? `${d.temp}°C` : '⏳ Loading...';
        const humStr  = d && d.hum  !== null ? `${d.hum}%`   : '⏳ Loading...';
        const soilStr = d && d.soil !== null ? `${d.soil}%`  : '⏳ Loading...';
        const tankStr = d && d.tank !== null ? `${d.tank}%`  : '⏳ Loading...';

        const statusTable = `| Metric | Value |\n|--------|-------|\n| 🌡️ Temperature | ${tempStr} |\n| 💧 Humidity | ${humStr} |\n| 🌱 Soil | ${soilStr} |\n| 💦 Tank | ${tankStr} |`;

        const pageContext = {
            dashboard:  `I can see your live sensor data and help you decide when and how to irrigate.`,
            irrigation: `I can help you manage your zones, schedules, pump, and watering strategy.`,
            analytics:  `I can explain your charts, trends, and help you optimise irrigation efficiency.`,
            reports:    `I can guide you through generating and interpreting your system reports.`,
            settings:   `I can help you configure your system, troubleshoot issues, and set up AI mode.`,
            home:       `I'm your intelligent irrigation assistant.`
        };

        return `👋 ${greet}! I'm HydroGen AI.
${pageContext[page] || pageContext.home}

📊 **Live Status:**
${statusTable}

Ask me anything about your irrigation system!`;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // BUILD SYSTEM PROMPT
    // ══════════════════════════════════════════════════════════════════════════
    async function buildSystemPrompt() {
        await fetchSensorData();
        const d      = getSensorData() || { temp: '--', hum: '--', soil: '--', tank: '--', pumpOn: false, rawWater: 12 };
        const zones  = await getZones();
        const rain   = window.weatherRainExpected || false;
        const page   = detectPage();
        const liters = d.tank !== null ? ((d.tank / 100) * 2).toFixed(2) : '--';

        let zonesBlock = '';
        if (zones.length > 0) {
            zonesBlock = `\n🏞️ IRRIGATION ZONES (${zones.length}):\n`;
            zones.forEach((z, i) => {
                zonesBlock += `  ${i + 1}. ${z.icon || '🌱'} ${z.name} — ${z.isRunning ? 'RUNNING' : 'IDLE'} | ${z.duration || 30}min | ${z.waterPerCycle || 10}L\n`;
            });
        }

        return `You are HydroGen AI — a professional agricultural expert and smart irrigation assistant embedded in the HydroGen smart irrigation web app.

REAL LIVE SYSTEM DATA (from Firebase sensors):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌡️ Temperature: ${d.temp}°C
💧 Air Humidity: ${d.hum}%
🌱 Soil Moisture: ${d.soil}%
💦 Water Tank: ${d.tank}% (${liters}L / 2L capacity)
🚰 Pump: ${d.pumpOn ? 'ON — RUNNING' : 'OFF'}
🌧️ Rain Expected: ${rain ? 'YES — delay non-critical irrigation' : 'No'}
📍 Current Page: ${page.toUpperCase()}
${zonesBlock}

SYSTEM CAPABILITIES:
• Live sensor monitoring (temperature, humidity, soil moisture, tank level, pump)
• Atmospheric water generation (collects water from air, most efficient at humidity > 60%)
• Multi-zone irrigation control with individual schedules
• AI irrigation mode (automatic decisions based on all sensors)
• Weather forecast integration (OpenWeather API — Port Said, Egypt)
• Analytics charts with historical trends
• Report generation (water usage, system health, crop performance)
• Mobile-responsive design with dark mode

Use markdown tables to present data clearly. Keep responses concise and friendly.
IMPORTANT: Always use the REAL sensor values shown above — never make up data.`;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // API CALLS with detailed logging
    // ══════════════════════════════════════════════════════════════════════════
    async function callOpenRouter(messages, systemPrompt) {
        if (!API.openrouter.key) {
            console.log('⏭️ [OpenRouter] Skipped - no API key configured');
            return null;
        }
        
        console.log('🌐 [OpenRouter] Attempting to get AI response...');
        console.log(`   Model: ${API.openrouter.model}`);
        console.log(`   Question: "${messages[0]?.content?.substring(0, 100)}..."`);
        
        try {
            const ctrl = new AbortController();
            const tid  = setTimeout(() => ctrl.abort(), 12000);
            const res  = await fetch(API.openrouter.endpoint, {
                method:  'POST',
                headers: { 'Authorization': `Bearer ${API.openrouter.key}`, 'Content-Type': 'application/json', 'HTTP-Referer': window.location.href },
                body:    JSON.stringify({ model: API.openrouter.model, messages: [{ role: 'system', content: systemPrompt }, ...messages], max_tokens: 700, temperature: 0.7 }),
                signal:  ctrl.signal
            });
            clearTimeout(tid);
            if (res.ok) {
                const data  = await res.json();
                const reply = data.choices?.[0]?.message?.content;
                if (reply && reply.length > 10) { 
                    activeApiName = 'OpenRouter AI';
                    console.log('✅ [OpenRouter] Successfully got response!');
                    console.log(`   Response length: ${reply.length} characters`);
                    return reply;
                } else {
                    console.log('⚠️ [OpenRouter] Response too short or empty');
                }
            } else {
                console.log(`❌ [OpenRouter] HTTP error: ${res.status}`);
            }
        } catch (e) { 
            console.log('❌ [OpenRouter] Error:', e.message); 
        }
        return null;
    }

    async function callGroq(messages, systemPrompt) {
        if (!API.groq.key) {
            console.log('⏭️ [Groq] Skipped - no API key configured');
            return null;
        }
        
        console.log('⚡ [Groq] Attempting to get AI response...');
        console.log(`   Model: ${API.groq.model}`);
        console.log(`   Question: "${messages[0]?.content?.substring(0, 100)}..."`);
        
        try {
            const ctrl = new AbortController();
            const tid  = setTimeout(() => ctrl.abort(), 12000);
            const res  = await fetch(API.groq.endpoint, {
                method:  'POST',
                headers: { 'Authorization': `Bearer ${API.groq.key}`, 'Content-Type': 'application/json' },
                body:    JSON.stringify({ model: API.groq.model, messages: [{ role: 'system', content: systemPrompt }, ...messages], max_tokens: 700, temperature: 0.7 }),
                signal:  ctrl.signal
            });
            clearTimeout(tid);
            if (res.ok) {
                const data  = await res.json();
                const reply = data.choices?.[0]?.message?.content;
                if (reply && reply.length > 10) { 
                    activeApiName = 'Groq AI';
                    console.log('✅ [Groq] Successfully got response!');
                    console.log(`   Response length: ${reply.length} characters`);
                    return reply;
                } else {
                    console.log('⚠️ [Groq] Response too short or empty');
                }
            } else {
                console.log(`❌ [Groq] HTTP error: ${res.status}`);
            }
        } catch (e) { 
            console.log('❌ [Groq] Error:', e.message); 
        }
        return null;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // LOCAL KNOWLEDGE BASE — v4.3 with enhanced logging
    // ══════════════════════════════════════════════════════════════════════════
    async function getLocalResponse(question) {
        console.log('📚 [Local Knowledge] Generating response using local knowledge base...');
        const q = question.toLowerCase();

        await fetchSensorData();
        const d    = getSensorData();
        const rain = window.weatherRainExpected || false;
        const zones = await getZones();

        if (!d || d.temp === null) {
            console.log('⚠️ [Local Knowledge] No sensor data available yet');
            return `⏳ **Connecting to sensors...**\n\nI'm still fetching live data from Firebase. Please try again in a moment.`;
        }

        console.log(`📊 [Local Knowledge] Using live sensor data: Soil=${d.soil}%, Temp=${d.temp}°C, Tank=${d.tank}%, Humidity=${d.hum}%`);

        // Helper functions
        function soilStatus(v) {
            if (v < 15) return '🔴 CRITICAL — extremely dry';
            if (v < 30) return '🟠 LOW — needs water soon';
            if (v < 50) return '🟡 Below Optimal';
            if (v < 75) return '🟢 OPTIMAL';
            return '🔵 HIGH — well watered';
        }

        function tempStatus(v) {
            if (v > 42) return '🔥 CRITICAL — extreme heat';
            if (v > 35) return '🔥 High — water morning & evening';
            if (v < 10) return '❄️ Cold — reduce watering';
            if (v < 15) return '🌿 Cool — minimal watering needed';
            return '✅ Optimal range';
        }

        function humStatus(v) {
            if (v > 70) return '🟢 High — excellent water collection';
            if (v > 50) return '🟡 Moderate — good collection';
            if (v > 30) return '🟠 Low — slow collection';
            return '🔴 Very low — poor collection';
        }

        function tankStatus(v) {
            if (v < 10) return '🔴 CRITICAL — nearly empty';
            if (v < 25) return '🟠 LOW — refill soon';
            if (v < 60) return '🟡 Moderate';
            if (v < 85) return '🟢 Good';
            return '💧 Full';
        }

        const liters = ((d.tank / 100) * 2).toFixed(2);

        // ── Efficiency Score (SAME answer on Analytics, Reports, Dashboard, etc.) ──
        if (q.includes('efficiency') || q.includes('efficiency score') || q.includes('score')) {
            console.log('🎯 [Local Knowledge] Matched: Efficiency Score question');
            
            let score = 70;
            let notes = [];

            if (d.soil >= 40 && d.soil <= 70) { score += 10; notes.push('✅ Soil moisture in optimal range'); }
            else if (d.soil < 30)             { score -= 15; notes.push('⚠️ Soil too dry — efficiency impacted'); }
            else if (d.soil > 80)             { score -= 10; notes.push('⚠️ Overwatering detected — efficiency impacted'); }

            if (d.tank >= 30)  { score += 5;  notes.push('✅ Tank level adequate'); }
            else               { score -= 10; notes.push('⚠️ Low tank reduces system efficiency'); }

            if (rain)          { score -= 5;  notes.push('🌧️ Rain expected — irrigation may be wasteful today'); }

            if (d.hum > 60)    { score += 5;  notes.push('✅ Good humidity — collection system efficient'); }
            else               { score -= 5;  notes.push('⚠️ Low humidity slows water collection'); }

            score = Math.min(100, Math.max(0, score));
            const grade = score >= 85 ? '🟢 Excellent' : score >= 65 ? '🟡 Good' : score >= 45 ? '🟠 Fair' : '🔴 Poor';
            
            console.log(`📊 [Local Knowledge] Efficiency score calculated: ${score}/100 (${grade})`);

            return `📊 **Irrigation Efficiency Score: ${score}/100 — ${grade}**

### 📋 Score Breakdown:
${notes.map(n => `• ${n}`).join('\n')}

### 🎯 How to Improve:
${score < 85 ? '• Enable AI irrigation mode for automatic optimisation\n• Check zone durations — shorter is often better\n• Water only in 5–9 AM and 6–9 PM windows\n• Ensure tank stays above 30%' : '• Your system is running at high efficiency! Keep monitoring.'}

### 📊 Live Sensor Impact:
| Sensor | Value | Impact on Score |
|--------|-------|-----------------|
| 🌱 Soil | ${d.soil}% | ${d.soil >= 40 && d.soil <= 70 ? 'Positive (+10)' : d.soil < 30 ? 'Negative (-15)' : d.soil > 80 ? 'Negative (-10)' : 'Neutral'} |
| 💦 Tank | ${d.tank}% | ${d.tank >= 30 ? 'Positive (+5)' : 'Negative (-10)'} |
| 💧 Humidity | ${d.hum}% | ${d.hum > 60 ? 'Positive (+5)' : 'Negative (-5)'} |
| 🌧️ Rain | ${rain ? 'Expected' : 'None'} | ${rain ? 'Negative (-5)' : 'Neutral'}|`;
        }

        // ── Analytics Overview ──
        if (q.includes('analytics overview') || (q.includes('analytics') && q.includes('overview')) || (q.includes('chart') && q.includes('explain'))) {
            console.log('📈 [Local Knowledge] Matched: Analytics Overview question');
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
| 🌡️ Temperature | ${d.temp}°C | ${d.temp > 35 ? '⚠️ Hot' : d.temp < 15 ? '❄️ Cool' : '✅ Good'} |
| 💧 Humidity | ${d.hum}% | ${d.hum < 40 ? '⚠️ Low' : d.hum > 80 ? '⚠️ High' : '✅ Good'} |
| 🌱 Soil | ${d.soil}% | ${d.soil < 30 ? '🚨 Low' : d.soil > 75 ? '🔵 High' : '✅ Good'} |
| 💦 Tank | ${d.tank}% | ${d.tank < 25 ? '⚠️ Low' : '✅ Good'} |

💡 **Tip:** Check weekly trends to identify patterns — for example, if soil drops every afternoon, an evening schedule may be more efficient.`;
        }

        // ── Report Guide ──
        if (q.includes('report guide') || (q.includes('report') && q.includes('how to')) || (q.includes('export') && q.includes('report'))) {
            console.log('📄 [Local Knowledge] Matched: Report Guide question');
            const type = q.includes('water') ? 'water' : q.includes('health') || q.includes('system') ? 'health' : q.includes('crop') || q.includes('plant') ? 'crop' : 'general';
            console.log(`   Report type detected: ${type}`);
            
            if (type === 'water') {
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
            
            if (type === 'health') {
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
            
            if (type === 'crop') {
                return `🌿 **Crop Performance Report**

### 📋 What This Report Tracks:
• Irrigation adequacy per zone
• Temperature stress events (below 5°C or above 38°C)
• Soil moisture consistency score
• Optimal vs actual watering comparison

### 🌱 Healthy Crop Conditions:
| Parameter | Target Range | Your Current |
|-----------|-------------|-------------|
| Soil Moisture | 45–70% | ${d.soil}% |
| Avg Temp | 15–30°C | ${d.temp}°C |
| Humidity | 40–65% | ${d.hum}% |
| Irrigation Freq. | Based on crop type | Check zone schedule |

💡 Download monthly reports to track seasonal performance changes.`;
            }
            
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

💡 Ask me "water usage report" or "system health report" for detailed guidance!`;
        }

        // ── Soil moisture ──
        if (q.includes('soil') || q.includes('moisture')) {
            console.log('🌱 [Local Knowledge] Matched: Soil moisture question');
            return `🌱 **Soil Moisture: ${d.soil}%** — ${soilStatus(d.soil)}

| Detail | Value |
|--------|-------|
| 🌱 Current | ${d.soil}% |
| ✅ Optimal Range | 50% – 75% |
| Status | ${soilStatus(d.soil)} |

${d.soil < 30 ? '⚠️ Soil is dry — consider watering soon.' : d.soil > 80 ? '💧 Soil is very wet — pause watering.' : '✅ Soil moisture is in a good range.'}`;
        }

        // ── Temperature ──
        if ((q.includes('temp') || q.includes('temperature') || q.includes('hot') || q.includes('cold')) && !q.includes('weather')) {
            console.log('🌡️ [Local Knowledge] Matched: Temperature question');
            return `🌡️ **Temperature: ${d.temp}°C** — ${tempStatus(d.temp)}

| Detail | Value |
|--------|-------|
| 🌡️ Current | ${d.temp}°C |
| ✅ Optimal Range | 15°C – 35°C |
| Status | ${tempStatus(d.temp)} |

${d.temp > 35 ? '🔥 High heat detected — water in the early morning and evening to reduce evaporation.' : d.temp < 15 ? '❄️ Cool temperatures — reduce watering frequency.' : '✅ Temperature is in the optimal irrigation range.'}`;
        }

        // ── Humidity ──
        if (q.includes('humid')) {
            console.log('💧 [Local Knowledge] Matched: Humidity question');
            return `💧 **Air Humidity: ${d.hum}%** — ${humStatus(d.hum)}

| Detail | Value |
|--------|-------|
| 💧 Current | ${d.hum}% |
| 🌊 Best for Collection | > 60% |
| Status | ${humStatus(d.hum)} |

${d.hum < 30 ? '⚠️ Very low humidity — atmospheric water collection is minimal.' : d.hum > 70 ? '✅ High humidity — great conditions for water generation!' : '💡 Humidity is moderate — collection is ongoing at normal rate.'}`;
        }

        // ── Water tank ──
        if (q.includes('tank') || q.includes('water level') || q.includes('water storage')) {
            console.log('💦 [Local Knowledge] Matched: Water tank question');
            return `💦 **Water Tank: ${d.tank}%** — ${tankStatus(d.tank)}

| Detail | Value |
|--------|-------|
| 💦 Current Level | ${d.tank}% |
| 🪣 Volume | ${liters}L / 2L |
| Status | ${tankStatus(d.tank)} |

${d.tank < 10 ? '🚨 Tank is critically low — activate water collection immediately!' : d.tank < 25 ? '⚠️ Tank is low — reserve water for essential irrigation only.' : d.tank > 85 ? '✅ Tank is full — collection can pause.' : '✅ Tank level is adequate.'}`;
        }

        // ── Pump ──
        if (q.includes('pump')) {
            console.log('🚰 [Local Knowledge] Matched: Pump question');
            const rainIcon   = rain ? '🌧️ Expected' : '✅ None';
            const tankWarn   = d.tank < 10 ? '🔴 Critical — stop pump!' : d.tank < 25 ? '⚠️ Low' : '✅ OK';
            const soilWarn   = d.soil > 75 ? '💧 Well watered' : d.soil < 30 ? '🟠 Dry — needs water' : '✅ OK';
            const tempWarn   = d.temp > 42 ? '🔥 Extreme heat' : d.temp > 35 ? '🌡️ High' : '✅ Normal';

            let pumpAdvice = '';
            if (d.tank < 10) {
                pumpAdvice = '🚫 **Stop the pump** — tank is critically low. Refill before next cycle.';
            } else if (d.soil > 75) {
                pumpAdvice = '✅ Soil is well hydrated — pump can rest.';
            } else if (d.soil < 30 && d.tank >= 10) {
                pumpAdvice = '💧 Soil is dry — pump should run now.';
            } else if (rain) {
                pumpAdvice = '🌧️ Rain expected — consider pausing pump to conserve water.';
            } else {
                pumpAdvice = '✅ Conditions are stable — monitor and adjust as needed.';
            }

            return `🚰 **Pump Status: ${d.pumpOn ? '🟢 RUNNING' : '⚫ OFF'}**

| Detail | Value |
|--------|-------|
| 🚰 Pump | ${d.pumpOn ? '🟢 ON — actively irrigating' : '⚫ OFF'} |
| 🌱 Soil Moisture | ${d.soil}% |
| 💦 Tank Level | ${d.tank}% |
| 🌡️ Temperature | ${d.temp}°C |
| 🌧️ Rain | ${rainIcon} |

⚙️ **Current Conditions:**

| Sensor | Value | Status |
|--------|-------|--------|
| 💦 Tank | ${d.tank}% | ${tankWarn} |
| 🌱 Soil | ${d.soil}% | ${soilWarn} |
| 🌡️ Temp | ${d.temp}°C | ${tempWarn} |
| 🌧️ Rain | ${rain ? 'Expected' : 'None'} | ${rainIcon} |

💡 ${pumpAdvice}

| Mode | Description |
|------|-------------|
| 🤖 AUTO | AI controls pump based on all sensors |
| ✋ MANUAL | You control on/off directly |
| 🚨 EMERGENCY STOP | Halts all irrigation immediately |`;
        }

        // ── Should I water? ──
        if (q.includes('should i water') || q.includes('water now') || q.includes('watering needed') || q.includes('do i need to water')) {
            console.log('💧 [Local Knowledge] Matched: Should I water question');
            let decision = '';
            let reason   = '';

            if (d.tank < 10) {
                decision = '🚫 **Do NOT water** — Tank is critically low.';
                reason   = 'Refill the tank before irrigating.';
            } else if (d.soil > 75) {
                decision = `✅ **No watering needed** — Soil is well hydrated (${d.soil}%).`;
                reason   = 'Wait until soil drops below 60% before next cycle.';
            } else if (d.soil < 20) {
                decision = `🚨 **Water immediately!** — Soil is critically dry (${d.soil}%).`;
                reason   = 'Start irrigation now to prevent plant stress.';
            } else if (d.soil < 40) {
                decision = `💧 **Watering recommended** — Soil is low (${d.soil}%).`;
                reason   = rain ? '🌧️ Rain is expected — you may wait for natural watering.' : 'Start a watering cycle soon.';
            } else {
                decision = `⏳ **Monitor** — Soil is moderate (${d.soil}%).`;
                reason   = 'No immediate action needed, but keep an eye on it.';
            }

            return `${decision}

| Sensor | Value | Status |
|--------|-------|--------|
| 🌱 Soil | ${d.soil}% | ${soilStatus(d.soil)} |
| 💦 Tank | ${d.tank}% | ${tankStatus(d.tank)} |
| 🌡️ Temp | ${d.temp}°C | ${tempStatus(d.temp)} |
| 💧 Humidity | ${d.hum}% | ${humStatus(d.hum)} |
| 🌧️ Rain | ${rain ? 'Expected' : 'None'} | ${rain ? '🌧️ Delay if possible' : '✅ No rain coming'} |

💡 ${reason}`;
        }

        // ── Full sensor report ──
        if (q.includes('sensor') || q.includes('all data') || q.includes('live data') || q.includes('status') || q.includes('overview') || q.includes('summary')) {
            console.log('📊 [Local Knowledge] Matched: Sensor report question');
            return `📊 **Live Sensor Data — Firebase**

| Sensor | Value | Status |
|--------|-------|--------|
| 🌡️ Temperature | ${d.temp}°C | ${tempStatus(d.temp)} |
| 💧 Air Humidity | ${d.hum}% | ${humStatus(d.hum)} |
| 🌱 Soil Moisture | ${d.soil}% | ${soilStatus(d.soil)} |
| 💦 Water Tank | ${d.tank}% (${liters}L) | ${tankStatus(d.tank)} |
| 🚰 Pump | ${d.pumpOn ? '🟢 Running' : '⚫ Off'} | — |
| 🌧️ Rain | ${rain ? '🌧️ Expected' : '✅ None'} | — |`;
        }

        // ── Zone management ──
        if (q.includes('zone') || q.includes('how many zone') || q.includes('my zones') || q.includes('irrigation zone')) {
            console.log('🏞️ [Local Knowledge] Matched: Zone question');
            if (!zones || zones.length === 0) {
                return `🏞️ **No Zones Configured**

You have no irrigation zones yet.

**To add a zone:**
1. Go to 💧 Irrigation page
2. Tap ➕ Add New Zone
3. Set name, duration, and water amount

💡 Tip: Create separate zones for vegetables, herbs, and trees!`;
            }

            const running = zones.filter(z => z.isRunning);
            const totalWater = zones.reduce((a, z) => a + (z.waterPerCycle || 10), 0);

            let table = `| # | Zone | Status | Duration | Water/Cycle |\n|---|------|--------|----------|-------------|\n`;
            zones.forEach((z, i) => {
                table += `| ${i + 1} | ${z.icon || '🌱'} ${z.name} | ${z.isRunning ? '🟢 RUNNING' : '⚫ IDLE'} | ${z.duration || 30} min | ${z.waterPerCycle || 10}L |\n`;
            });

            let recommendations = [];
            if (rain) recommendations.push('🌧️ Rain expected — consider pausing all zones to save water.');
            if (d.tank < 20) recommendations.push(`⚠️ Tank critically low (${d.tank}%) — run essential zones only.`);
            if (d.soil < 25) recommendations.push(`🚨 Soil moisture very low (${d.soil}%) — run all plant zones soon.`);
            if (d.temp > 35) recommendations.push(`🔥 Extreme heat (${d.temp}°C) — run zones at dawn (5–8 AM) and dusk (7–9 PM) only.`);

            return `🏞️ **Irrigation Zones — ${zones.length} total**

${table}

**Running:** ${running.length} zone(s) | **Idle:** ${zones.length - running.length} zone(s)
**Total water per full cycle:** ${totalWater}L

${running.length > 0 ? `🟢 Active: ${running.map(z => z.name).join(', ')}` : '⚫ All zones idle.'}

### 💡 Zone Recommendations:
${recommendations.length > 0 ? recommendations.map(r => `• ${r}`).join('\n') : '• ✅ Conditions are normal. Standard schedule can proceed.'}`;
        }

        // ── Schedule advice ──
        if (q.includes('schedule') || q.includes('when to water') || q.includes('best time') || q.includes('watering time')) {
            console.log('⏰ [Local Knowledge] Matched: Schedule question');
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
| 🌡️ Temperature | ${d.temp}°C | ${d.temp > 35 ? '⚠️ High evaporation' : '✅ Normal'} |
| 💧 Soil Moisture | ${d.soil}% | ${d.soil < 30 ? '🚨 Water soon' : d.soil > 70 ? '✅ OK' : '🟡 Monitor'} |
| 🌧️ Rain | ${rain ? 'Expected ✅' : 'None ❌'} | ${rain ? 'Delay irrigation' : 'Rely on system'} |
| 💦 Tank | ${d.tank}% | ${d.tank < 25 ? '⚠️ Low' : '✅ OK'} |

### 🗓️ Recommended Daily Schedule:
| Time | Action |
|------|--------|
| 5:30 AM | Main irrigation cycle — all zones |
| 12:00 PM | Sensor check only — no watering |
| 7:00 PM | Supplemental watering if soil < 40% |
| 10:00 PM | Pump off — night standby |

💡 Use **AI Mode** to automate this schedule based on live sensor data.`;
        }

        // ── Water saving tips ──
        if (q.includes('save water') || q.includes('conservation') || q.includes('drought') || q.includes('water saving')) {
            console.log('💧 [Local Knowledge] Matched: Water saving question');
            let savingsTips = [];
            if (d.hum > 60) savingsTips.push('High humidity reduces evaporation — shorten cycle by 15%');
            if (rain) savingsTips.push('Skip today — rain will water naturally');
            if (d.temp < 28) savingsTips.push('Cool temps mean less frequent watering needed');

            return `💧 **Water Conservation Tips**

### 🌱 Immediate Savings Opportunities:
${savingsTips.length > 0 ? savingsTips.map(t => `• ${t}`).join('\n') : '• ✅ No immediate savings opportunities — conditions are balanced.'}

### 🌿 General Best Practices:
• **Mulch soil** — reduces evaporation by up to 70%
• **Deep watering** — encourages drought-resistant root growth
• **Group plants by water need** — prevents over/under-watering
• **Early morning watering** — 40% less evaporation than midday
• **AI mode** — prevents wasted watering automatically

💦 Your HydroGen atmospheric water generator works best at humidity > 60%.
Current collection efficiency: **${d.hum > 70 ? 'HIGH 🟢' : d.hum > 50 ? 'MODERATE 🟡' : 'LOW 🔴'}**`;
        }

        // ── Weather & rain forecast ──
        if (q.includes('weather') || q.includes('rain') || q.includes('forecast') || q.includes('temperature outside') || q.includes('wind') || q.includes('humidity outside')) {
            console.log('🌤️ [Local Knowledge] Matched: Weather question');
            const weatherData = await getRealWeatherForecast();
            if (weatherData) {
                const w = weatherData;

                function conditionIcon(condStr, isRaining, hour) {
                    if (isRaining) return '🌧️';
                    const c = condStr.toLowerCase();
                    if (c.includes('thunderstorm')) return '⛈️';
                    if (c.includes('drizzle'))      return '🌦️';
                    if (c.includes('snow'))         return '❄️';
                    if (c.includes('mist') || c.includes('fog') || c.includes('haze')) return '🌫️';
                    if (c.includes('overcast'))     return '☁️';
                    if (c.includes('broken clouds') || c.includes('scattered clouds')) return '⛅';
                    if (c.includes('few clouds'))   return '🌤️';
                    if (c.includes('clear')) {
                        const h = (hour !== null && hour !== undefined) ? hour : new Date().getHours();
                        if (h >= 8  && h < 16) return '☀️';
                        if (h >= 16 && h < 18) return '🌇';
                        if (h >= 5  && h < 8)  return '🌅';
                        return '🌙';
                    }
                    return '🌤️';
                }

                const currentIcon = conditionIcon(w.current.condition, w.current.rainExpected, null);
                const rainEmoji   = w.current.rainExpected ? '🌧️ YES' : '✅ NO';
                const rainAdvice  = w.current.rainExpected
                    ? '🌧️ **Rain expected!** Reduce or pause scheduled watering — let natural rain do the work.'
                    : '✅ **No rain forecast.** Rely fully on your HydroGen irrigation system.';

                let forecastTable = `| Time | Temp | Condition | Rain | Chance |\n|------|------|-----------|------|--------|\n`;
                w.forecast.forEach(f => {
                    const icon = conditionIcon(f.condition, f.rain, f.hour);
                    forecastTable += `| ${f.time} | ${f.temp}°C | ${icon} ${f.condition} | ${f.rain ? '🌧️ Yes' : '❌ No'} | ${f.pop}% |\n`;
                });

                const heatAdvisory = w.current.temp > 35
                    ? '🔥 **Heat Alert:** Water deeply in early morning and evening. Avoid all midday irrigation.'
                    : w.current.temp < 15
                    ? '❄️ **Cool weather:** Reduce watering frequency — low evaporation means soil stays moist longer.'
                    : '✅ **Normal temperatures:** Standard irrigation schedule is appropriate.';

                return `${currentIcon} **Weather Forecast — ${w.city}**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Current Conditions:**

| 📊 Parameter | 📈 Value |
|--------------|----------|
| 🌡️ Temperature | ${w.current.temp}°C (feels ${w.current.feelsLike}°C) |
| 💧 Humidity | ${w.current.humidity}% |
| 🌬️ Wind | ${w.current.wind} km/h |
| ${currentIcon} Conditions | ${w.current.condition} |
| 🌧️ Rain Expected | ${rainEmoji} |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Next 6-Hour Forecast:**

${forecastTable}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### 🌾 **Agricultural Advisory**

${rainAdvice}

${heatAdvisory}

💡 **Collection Efficiency:** ${w.current.humidity > 60 ? 'High — excellent for water generation! 🟢' : 'Moderate — collection is slower. 🟡'}

${zones.length > 0 && w.current.rainExpected ? `🏞️ **Zone Tip:** With rain expected, consider pausing all ${zones.length} zone(s) for 12-24 hours.` : ''}`;
            } else {
                return `🌡️ Weather service unavailable right now.\n\n**Current sensors from Firebase:**\n- 🌡️ Temp: ${d.temp}°C\n- 💧 Humidity: ${d.hum}%\n- ${rain ? '🌧️ Rain expected based on last forecast.' : '✅ No rain in last forecast.'}`;
            }
        }

        // ── Settings & configuration ──
        if (q.includes('setting') || q.includes('configure') || q.includes('configuration') || q.includes('setup')) {
            console.log('⚙️ [Local Knowledge] Matched: Settings question');
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

        if (q.includes('notification') || q.includes('alert') || q.includes('alarm')) {
            console.log('🔔 [Local Knowledge] Matched: Notification question');
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

        if (q.includes('calibrat') || q.includes('sensor accuracy') || q.includes('sensor wrong') || q.includes('wrong reading')) {
            console.log('🔧 [Local Knowledge] Matched: Calibration question');
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

        if (q.includes('troubleshoot') || q.includes('problem') || q.includes('not working') || q.includes('broken') || q.includes('error') || q.includes('issue')) {
            console.log('🔧 [Local Knowledge] Matched: Troubleshoot question');
            if (q.includes('pump')) {
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

        if (q.includes('ai mode') || q.includes('automatic') || q.includes('auto mode') || q.includes('how does ai')) {
            console.log('🤖 [Local Knowledge] Matched: AI Mode question');
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

        if (q.includes('dark mode') || q.includes('theme') || q.includes('appearance')) {
            console.log('🌙 [Local Knowledge] Matched: Dark mode question');
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

        // ── App navigation ──
        if (q.includes('what pages') || q.includes('navigation') || q.includes('menu') || q.includes('where is') || q.includes('how to find') || q.includes('go to')) {
            console.log('🗺️ [Local Knowledge] Matched: Navigation question');
            return `🗺️ **HydroGen App Navigation**

| Page | Icon | What You Can Do |
|------|------|----------------|
| Home | 🏠 | Welcome screen, quick overview |
| Dashboard | 📊 | Live sensor data, alerts |
| Irrigation | 💧 | Manage zones, pump, schedules |
| Analytics | 📈 | Charts, trends, historical data |
| Reports | 📄 | Export data, view system reports |
| Settings | ⚙️ | AI mode, notifications, calibration |

💡 Use the **sidebar menu** (☰) to navigate between pages.`;
        }

        // ── About HydroGen ──
        if (q.includes('what is hydrogen') || q.includes('about hydrogen') || q.includes('what can you do') || q.includes('what do you do')) {
            console.log('🌱 [Local Knowledge] Matched: About HydroGen question');
            return `🌱 **HydroGen Smart Irrigation System**

HydroGen is an intelligent agricultural IoT system that:

| Feature | Description |
|---------|-------------|
| 💧 Atmospheric Water | Generates water from air using humidity |
| 🤖 AI Irrigation | Automatic, sensor-based irrigation decisions |
| 📊 Live Monitoring | Real-time temperature, humidity, soil, tank |
| 🏞️ Multi-Zone | Control up to ${zones.length > 0 ? zones.length : 'multiple'} irrigation zones individually |
| 🌤️ Weather-Aware | Integrates live weather forecast |
| 📈 Analytics | Historical data and trend charts |
| 📄 Reports | Exportable performance reports |
| 🌍 Remote Access | Monitor and control from anywhere |

I'm your built-in AI assistant — ask me anything! 🤖`;
        }

        // ── Greeting ──
        if (q.includes('hello') || q.includes('hi') || q.includes('help') || q.length < 10) {
            console.log('👋 [Local Knowledge] Matched: Greeting/Help question');
            return getPageWelcome(d);
        }

        // ── Ultimate fallback ──
        console.log('❓ [Local Knowledge] No specific match - showing help menu');
        return `🤔 I can help with many topics! Try asking about:

| Topic | Example |
|-------|---------|
| 💧 Watering | "Should I water now?" |
| 📊 Sensors | "Show all sensor data" |
| 🌤️ Weather | "Weather forecast" |
| 🏞️ Zones | "My irrigation zones" |
| ⏰ Schedule | "Best time to water" |
| 📈 Analytics | "Efficiency score" |
| 📄 Reports | "Water usage report" |
| ⚙️ Settings | "How to set up AI mode" |
| 🔧 Help | "Troubleshoot pump" |`;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // MAIN AI RESPONSE with detailed logging
    // ══════════════════════════════════════════════════════════════════════════
    async function getAIResponse(question) {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`💬 [Chatbot] Processing question: "${question.substring(0, 100)}${question.length > 100 ? '...' : ''}"`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        await fetchSensorData();

        const q = question.toLowerCase();
        
        // Questions that ALWAYS use local knowledge (page-independent answers)
        const alwaysLocal = [
            'efficiency', 'score',
            'soil', 'moisture', 'temp', 'temperature', 'humid', 'humidity',
            'tank', 'water level', 'pump', 'sensor', 'all data', 'live data',
            'status', 'overview', 'summary', 'should i water', 'water now',
            'zone', 'schedule', 'when to water', 'best time', 'watering time',
            'save water', 'conservation', 'weather', 'rain', 'forecast',
            'setting', 'notification', 'alert', 'calibrat', 'troubleshoot',
            'ai mode', 'dark mode', 'theme', 'what pages', 'navigation',
            'about hydrogen', 'what can you do', 'report guide', 'analytics overview'
        ];
        
        const needsLocal = alwaysLocal.some(keyword => q.includes(keyword));
        
        if (needsLocal) {
            console.log('📚 [Chatbot] Question requires real-time sensor data → Using Local Knowledge Base');
            console.log('   Reason: Question contains keywords that need live Firebase sensor values');
            activeApiName = 'Local Knowledge';
            const response = await getLocalResponse(question);
            console.log(`✅ [Chatbot] Response generated using: ${activeApiName}`);
            console.log(`   Response length: ${response.length} characters`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            return response;
        }

        console.log('🤖 [Chatbot] Question can be answered by AI → Attempting API calls');
        const systemPrompt = await buildSystemPrompt();
        const messages     = [{ role: 'user', content: question }];

        // Try Groq first — fastest, most generous free tier
        if (API.groq.key) {
            console.log('⚡ [Chatbot] Attempt 1/3: Calling Groq AI...');
            const groqRes = await callGroq(messages, systemPrompt);
            if (groqRes) {
                console.log(`✅ [Chatbot] Response generated using: ${activeApiName}`);
                console.log(`   Response length: ${groqRes.length} characters`);
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                return groqRes;
            }
            console.log('⚠️ [Chatbot] Groq failed or returned invalid response');
        }

        // Try OpenRouter as fallback
        if (API.openrouter.key) {
            console.log('🌐 [Chatbot] Attempt 2/3: Calling OpenRouter AI...');
            const orRes = await callOpenRouter(messages, systemPrompt);
            if (orRes) {
                console.log(`✅ [Chatbot] Response generated using: ${activeApiName}`);
                console.log(`   Response length: ${orRes.length} characters`);
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                return orRes;
            }
            console.log('⚠️ [Chatbot] OpenRouter failed or returned invalid response');
        }

        // Fallback to local knowledge
        console.log('📚 [Chatbot] Attempt 3/3: Falling back to Local Knowledge Base');
        console.log('   Reason: No AI API keys configured or both APIs failed');
        activeApiName = 'Local Knowledge (Fallback)';
        const fallbackResponse = await getLocalResponse(question);
        console.log(`✅ [Chatbot] Response generated using: ${activeApiName}`);
        console.log(`   Response length: ${fallbackResponse.length} characters`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        return fallbackResponse;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CHAT UI
    // ══════════════════════════════════════════════════════════════════════════
    let isExpanded = false;

    function setupChatUI() {
        window.toggleChat       = toggleChat;
        window.sendChatMessage  = sendChatMessage;
        window.quickAsk         = quickAsk;
        window.toggleChatExpand = toggleChatExpand;

        setTimeout(() => {
            window.sendChatMessage  = sendChatMessage;
            window.quickAsk         = quickAsk;
            window.toggleChat       = toggleChat;
            window.toggleChatExpand = toggleChatExpand;
        }, 500);

        const header = document.querySelector('.chat-header');
        if (header) {
            header.innerHTML = `
                <div class="chat-header-left">
                    <div class="chat-header-icon">🤖</div>
                    <div class="chat-header-info">
                        <div class="chat-header-title">HydroGen AI</div>
                        <div class="chat-header-subtitle">Smart Assistant</div>
                    </div>
                </div>
                <div class="chat-header-actions">
                    <span class="chat-online-dot"></span>
                    <button class="chat-expand-btn" onclick="toggleChatExpand()"><i class="fas fa-expand"></i></button>
                    <button class="chat-close-btn" onclick="toggleChat()"><i class="fas fa-times"></i></button>
                </div>`;
        }

        const suggBox = document.querySelector('.suggestions');
        if (suggBox) {
            const qs = getPageQuestions();
            suggBox.innerHTML = qs.map(q => `<button onclick="quickAsk('${q.replace(/'/g, "\\'")}')">${q}</button>`).join('');
        }

        const sendBtn = document.querySelector('.chat-input button');
        if (sendBtn) {
            sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
            sendBtn.onclick = sendChatMessage;
        }

        const input = document.getElementById('userInput');
        if (input) {
            const textarea = document.createElement('textarea');
            textarea.id          = 'userInput';
            textarea.placeholder = input.placeholder || 'Ask me anything...';
            textarea.rows        = '1';
            textarea.style.whiteSpace = 'pre-wrap';
            textarea.style.wordWrap   = 'break-word';
            textarea.style.wordBreak  = 'break-word';
            textarea.style.overflow   = 'hidden';
            textarea.style.resize     = 'none';
            textarea.style.minHeight  = '40px';
            textarea.style.maxHeight  = '120px';
            textarea.style.lineHeight = '1.4';
            input.parentNode.replaceChild(textarea, input);
            textarea.addEventListener('input', function () {
                this.style.height = 'auto';
                this.style.height = Math.min(this.scrollHeight, 120) + 'px';
            });
            textarea.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendChatMessage();
                }
            });
        }

        console.log('🔧 [Chatbot] UI ready.');
    }

    function toggleChat() {
        const w = document.getElementById('chatWindow');
        if (!w) return;
        const wasClosed = w.style.display !== 'flex';
        w.style.display = w.style.display === 'flex' ? 'none' : 'flex';
        
        // If we just opened the chat, update the welcome message with latest cache
        if (wasClosed && w.style.display === 'flex' && _cachedWelcomeMessage) {
            updateWelcomeMessageDisplay();
        }
    }

    function toggleChatExpand() {
        const w = document.getElementById('chatWindow');
        if (!w) return;
        isExpanded = !isExpanded;
        w.classList.toggle('expanded', isExpanded);
        const btn = document.querySelector('.chat-expand-btn i');
        if (btn) btn.className = isExpanded ? 'fas fa-compress' : 'fas fa-expand';
    }

    function appendMsg(text, who) {
        const box = document.getElementById('chatBox');
        if (!box) return;
        const div         = document.createElement('div');
        div.className     = `msg ${who}`;
        div.style.cssText = 'white-space:normal;word-wrap:break-word;word-break:break-word;';
        div.innerHTML     = who === 'ai'
            ? `<strong>🤖 HydroGen AI</strong><br>${formatMessageWithTables(text)}`
            : `<strong>You</strong><br>${escapeHtml(text)}`;
        box.appendChild(div);
        box.scrollTop = box.scrollHeight;
        return div;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function showTyping() {
        const box = document.getElementById('chatBox');
        if (!box) return null;
        const div     = document.createElement('div');
        div.className = 'typing-indicator';
        div.id        = 'typingIndicator';
        div.innerHTML = '<span></span><span></span><span></span>';
        box.appendChild(div);
        box.scrollTop = box.scrollHeight;
        return div;
    }

    function removeTyping() {
        const indicator = document.getElementById('typingIndicator');
        if (indicator) indicator.remove();
    }

    function formatMessageWithTables(text) {
        if (!text) return '';
        text = text.replace(/((?:\|[^\n]+\|\n?)+)/g, (block) => {
            const lines     = block.trim().split('\n').filter(l => l.trim());
            if (!lines.length) return block;
            const dataLines = lines.filter(l => !/^\s*\|[\s\-:|]+\|\s*$/.test(l));
            if (!dataLines.length) return block;
            const parseRow  = line => line.split('|').filter(c => c !== undefined).slice(1, -1).map(c => c.trim());
            const colCount  = parseRow(dataLines[0]).length;
            const colW      = (100 / colCount).toFixed(2);

            let headerHtml = '<thead><tr>';
            parseRow(dataLines[0]).forEach(cell => {
                headerHtml += `<th style="padding:10px 12px;background:linear-gradient(135deg,#d1fae5,#a7f3d0);font-weight:700;font-size:12px;border:1px solid #6ee7b7;text-align:left;color:#065f46;width:${colW}%;word-break:break-word;">${escapeHtml(cell)}</th>`;
            });
            headerHtml += '</thead>';

            let bodyHtml = '<tbody>';
            for (let i = 1; i < dataLines.length; i++) {
                const cells = parseRow(dataLines[i]);
                bodyHtml += '</tr>';
                cells.forEach(cell => {
                    bodyHtml += `<td style="padding:8px 12px;border:1px solid rgba(0,0,0,0.08);font-size:12px;vertical-align:top;word-break:break-word;line-height:1.5;">${escapeHtml(cell)}</td>`;
                });
                for (let j = cells.length; j < colCount; j++) {
                    bodyHtml += `<td style="padding:8px 12px;border:1px solid rgba(0,0,0,0.08);font-size:12px;">—</td>`;
                }
                bodyHtml += '</tr>';
            }
            bodyHtml += '</tbody>';

            return `<div class="chat-table-wrapper" style="overflow-x:auto;margin:12px 0;width:100%;border-radius:12px;">
                        <table style="border-collapse:collapse;width:100%;min-width:280px;border-radius:12px;overflow:hidden;background:inherit;table-layout:fixed;">
                            ${headerHtml}${bodyHtml}
                        </table>
                    </div>`;
        });

        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/^### (.*?)$/gm, '<h4 style="margin:10px 0 5px 0;font-size:13px;color:#065f46;font-weight:600;">$1</h4>')
            .replace(/^## (.*?)$/gm, '<h3 style="margin:10px 0 5px 0;font-size:14px;color:#065f46;font-weight:600;">$1</h3>')
            .replace(/^# (.*?)$/gm, '<h2 style="margin:10px 0 5px 0;font-size:15px;color:#065f46;font-weight:600;">$1</h2>')
            .replace(/^[•\-] (.*?)$/gm, '<li style="margin:4px 0;line-height:1.5;">$1</li>')
            .replace(/(<li.*<\/li>\n?)+/g, match => `<ul style="margin:8px 0;padding-left:24px;">${match}</ul>`)
            .replace(/^(\d+)\. (.*?)$/gm, '<li style="margin:4px 0;line-height:1.5;">$2</li>')
            .replace(/(<li.*<\/li>\n?)+/g, match => `<ol style="margin:8px 0;padding-left:24px;">${match}</ol>`)
            .replace(/━+/g, '<hr style="margin:10px 0;border:none;border-top:1px solid #e2e8f0;">')
            .replace(/\n/g, '<br>');
    }

    async function sendChatMessage() {
        const input = document.getElementById('userInput');
        if (!input) return;
        const question = input.value.trim();
        if (!question) return;
        input.value        = '';
        input.style.height = 'auto';
        appendMsg(question, 'you');
        const typing = showTyping();
        try {
            const answer = await getAIResponse(question);
            removeTyping();
            appendMsg(answer, 'ai');
        } catch (e) {
            removeTyping();
            console.error('❌ [Chatbot] Error:', e);
            appendMsg('Sorry, I encountered an error. Please try again.', 'ai');
        }
    }

    function quickAsk(question) {
        const input = document.getElementById('userInput');
        if (input) {
            input.value = question;
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 100) + 'px';
        }
        setTimeout(sendChatMessage, 0);
    }

    async function sendWelcomeMessage() {
        const box = document.getElementById('chatBox');
        if (!box) return;
        await fetchSensorData();
        const d = getSensorData() || { temp: null, hum: null, soil: null, tank: null, pumpOn: false };
        const text = getPageWelcome(d);
        const existingMsgs = box.querySelectorAll('.msg');
        if (existingMsgs.length > 0 && existingMsgs[0].classList.contains('ai')) {
            existingMsgs[0].innerHTML = `<strong>🤖 HydroGen AI</strong><br>${formatMessageWithTables(text)}`;
        } else {
            appendMsg(text, 'ai');
        }
    }

})();