/* settings.js */

// ── Auth Guard ──
(function () {
    try {
        if (!localStorage.getItem("hydroUser")) {
            window.location.replace("../landing/landing.html");
        }
    } catch (e) {
        console.error("Storage access denied or corrupted.", e);
    }
})();

document.addEventListener('DOMContentLoaded', () => {
    // ── Utility: Safe Storage Manager ──
    const StorageManager = {
        get: (key, fallback = null) => {
            try {
                const item = localStorage.getItem(key);
                return item ? JSON.parse(item) : fallback;
            } catch (e) {
                console.warn(`[Storage] Error parsing ${key}:`, e);
                return fallback;
            }
        },
        set: (key, value) => {
            try {
                localStorage.setItem(key, JSON.stringify(value));
                return true;
            } catch (e) {
                console.warn(`[Storage] Error saving ${key}:`, e);
                return false;
            }
        },
        remove: (key) => {
            try { localStorage.removeItem(key); } catch (e) {}
        }
    };

    // ── Utility: Safe Event Listener ──
    const safeAddEventListener = (id, event, handler) => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener(event, handler);
        } else {
            console.warn(`[DOM] Element #${id} not found for event binding.`);
        }
    };

    // 1. Initialize UI Elements & Toasts
    const saveToastEl = document.getElementById('saveToast');
    let saveToast = null;
    
    // Check if Bootstrap is loaded before initializing Toast
    if (typeof bootstrap !== 'undefined' && saveToastEl) {
        saveToast = new bootstrap.Toast(saveToastEl);
    }

    const lowWaterSlider = document.getElementById('lowWaterThreshold');
    const lowWaterValue = document.getElementById('lowWaterValue');
    const drySoilSlider = document.getElementById('drySoilThreshold');
    const drySoilValue = document.getElementById('drySoilValue');

    // 2. Load Existing Settings
    loadProfile();
    loadNotifications();
    loadFirebaseConfig();
    loadHardwareThresholds();

    // 3. Real-time Slider Updates (Using 'input' event correctly)
    if (lowWaterSlider && lowWaterValue) {
        lowWaterSlider.addEventListener('input', (e) => {
            lowWaterValue.innerText = e.target.value;
        });
    }

    if (drySoilSlider && drySoilValue) {
        drySoilSlider.addEventListener('input', (e) => {
            drySoilValue.innerText = e.target.value;
        });
    }

    // 4. Form Submissions & Click Handlers

    // Profile Form
    safeAddEventListener('profileForm', 'submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('inputName')?.value.trim() || '';
        const email = document.getElementById('inputEmail')?.value.trim() || '';
        const phone = document.getElementById('inputPhone')?.value.trim() || '';

        const profile = { name, email, phone };
        StorageManager.set('hydroGenProfile', profile);

        // Update hydroUser securely
        const user = StorageManager.get("hydroUser", {});
        if (name) user.name = name;
        if (email) user.email = email;
        StorageManager.set("hydroUser", user);

        // Update header UI live using Optional Chaining and precise ID matching
        const usernameEl = document.getElementById("username");
        const emailEl = document.getElementById("email");
        const avatarEl = document.getElementById("userAvatar"); // Fixed: using ID instead of class
        
        if (usernameEl && name) usernameEl.textContent = name;
        if (emailEl && email) emailEl.textContent = email;
        if (avatarEl && name) avatarEl.textContent = name.charAt(0).toUpperCase();

        showFeedback('Profile updated successfully ✅');
    });

    // Notifications Save
    safeAddEventListener('saveNotifBtn', 'click', () => {
        const notifs = {
            email: document.getElementById('notifEmail')?.checked || false,
            push: document.getElementById('notifPush')?.checked || false
        };
        StorageManager.set('hydroGenNotifs', notifs);
        showFeedback('Notification preferences saved');
    });

    // Hardware Thresholds Save
    safeAddEventListener('saveThresholdsBtn', 'click', () => {
        const rawLowWater = parseInt(lowWaterSlider?.value || 350, 10);
        // Map 100-400 cm to 100-0%
        const lowWaterPercent = Math.round(((400 - rawLowWater) / 300) * 100);

        const thresholds = {
            lowWater: Math.min(100, Math.max(0, lowWaterPercent)),
            drySoil: parseInt(drySoilSlider?.value || 20, 10)
        };

        if (window.hydroGenDB) {
            window.hydroGenDB.ref('settings/thresholds').set(thresholds)
                .then(() => {
                    StorageManager.set('hydroGenThresholds', thresholds);
                    showFeedback('Hardware thresholds synced with Firebase');
                })
                .catch(err => {
                    console.error('[Firebase] Save error:', err);
                    StorageManager.set('hydroGenThresholds', thresholds);
                    showFeedback('Sync failed, but saved locally', 'error');
                });
        } else {
            StorageManager.set('hydroGenThresholds', thresholds);
            showFeedback('Saved locally (Firebase not connected)');
        }
    });

    // Firebase Configuration Form
    safeAddEventListener('firebaseConfigForm', 'submit', (e) => {
        e.preventDefault();
        const config = {
            databaseURL: document.getElementById('fbDatabaseUrl')?.value.trim() || '',
            apiKey: document.getElementById('fbApiKey')?.value.trim() || '',
            projectId: document.getElementById('fbProjectId')?.value.trim() || ''
        };
        StorageManager.set('hydroGenFirebaseConfig', config);
        showFeedback('Firebase config saved. Reload page to reconnect.');
        setTimeout(() => location.reload(), 2000);
    });

    // Reset Firebase Configuration
    safeAddEventListener('resetFbConfigBtn', 'click', () => {
        StorageManager.remove('hydroGenFirebaseConfig');
        showFeedback('Restored defaults. Reloading...');
        setTimeout(() => location.reload(), 1500);
    });

    // 5. Utility Functions
    function showFeedback(msg, type = 'success') {
        if (!saveToast || !saveToastEl) {
            console.log(`[Fallback Toast] ${type}: ${msg}`);
            alert(msg); // Fallback if Bootstrap is unavailable
            return;
        }

        const toastBody = saveToastEl.querySelector('.toast-body');
        const toastHeader = saveToastEl.querySelector('.toast-header');

        if (toastBody) toastBody.innerText = msg;
        
        if (toastHeader) {
            if (type === 'error') {
                toastHeader.classList.remove('bg-success');
                toastHeader.classList.add('bg-danger');
            } else {
                toastHeader.classList.remove('bg-danger');
                toastHeader.classList.add('bg-success');
            }
        }
        saveToast.show();
    }

    function loadProfile() {
        const profile = StorageManager.get('hydroGenProfile');
        const user = StorageManager.get('hydroUser', {});

        const inputName = document.getElementById('inputName');
        const inputEmail = document.getElementById('inputEmail');
        const inputPhone = document.getElementById('inputPhone');

        const name = profile?.name || user?.name || "";
        const email = profile?.email || user?.email || "";

        if (inputName) inputName.value = name;
        if (inputEmail) inputEmail.value = email;
        if (inputPhone) inputPhone.value = profile?.phone || "";

        // Dynamically update the header elements on load
        const usernameEl = document.getElementById("username");
        const emailEl = document.getElementById("email");
        const avatarEl = document.getElementById("userAvatar");
        
        if (usernameEl && name) usernameEl.textContent = name;
        if (emailEl && email) emailEl.textContent = email;
        if (avatarEl && name) avatarEl.textContent = name.charAt(0).toUpperCase();
    }

    function loadNotifications() {
        const notifs = StorageManager.get('hydroGenNotifs');
        if (notifs) {
            const emailToggle = document.getElementById('notifEmail');
            const pushToggle = document.getElementById('notifPush');
            if (emailToggle) emailToggle.checked = !!notifs.email;
            if (pushToggle) pushToggle.checked = !!notifs.push;
        }
    }

    function loadFirebaseConfig() {
        const config = StorageManager.get('hydroGenFirebaseConfig') || window.defaultFirebaseConfig || {};
        const urlInput = document.getElementById('fbDatabaseUrl');
        const apiKeyInput = document.getElementById('fbApiKey');
        const projectIdInput = document.getElementById('fbProjectId');

        if (config.databaseURL && urlInput) urlInput.value = config.databaseURL;
        if (config.apiKey && apiKeyInput) apiKeyInput.value = config.apiKey;
        if (config.projectId && projectIdInput) projectIdInput.value = config.projectId;
    }

    function loadHardwareThresholds() {
        // Try Firebase first if connected
        if (window.hydroGenDB) {
            window.hydroGenDB.ref('settings/thresholds').once('value')
                .then(snap => {
                    const data = snap.val();
                    if (data) {
                        applyThresholds(data);
                    } else {
                        fallbackToLocalThresholds();
                    }
                })
                .catch(err => {
                    console.warn('[Firebase] Failed to load thresholds, falling back to local.', err);
                    fallbackToLocalThresholds();
                });
        } else {
            fallbackToLocalThresholds();
        }
    }

    function fallbackToLocalThresholds() {
        const local = StorageManager.get('hydroGenThresholds');
        if (local) applyThresholds(local);
    }

    function applyThresholds(data) {
        if (data.lowWater !== undefined && lowWaterSlider && lowWaterValue) {
            let cmValue;
            if (data.lowWater > 100) {
                // Handle legacy cm value
                cmValue = data.lowWater;
            } else {
                // Map 0-100% back to 100-400 cm
                cmValue = Math.round(400 - (data.lowWater / 100) * 300);
            }
            lowWaterSlider.value = cmValue;
            lowWaterValue.innerText = cmValue;
        }
        if (data.drySoil !== undefined && drySoilSlider && drySoilValue) {
            drySoilSlider.value = data.drySoil;
            drySoilValue.innerText = data.drySoil;
        }
    }
});
