/* landing.js */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Check if the user is already logged in to customize the navigation
    try {
        const userRaw = localStorage.getItem("hydroUser");
        if (userRaw) {
            const user = JSON.parse(userRaw);
            if (user && (user.email || user.uid)) {
                // Update Sign In link to Dashboard
                const signInLink = document.querySelector('.header a[href*="login"], .header a[href*="Login"]');
                if (signInLink) {
                    signInLink.href = "../dashboard/dashboard.html";
                    signInLink.textContent = "Dashboard";
                }
                
                // Update Get Started link to Dashboard
                const getStartedLink = document.querySelector('.landing-buttons a[href*="register"], .landing-buttons a[href*="Register"]');
                if (getStartedLink) {
                    getStartedLink.href = "../dashboard/dashboard.html";
                    getStartedLink.textContent = "Go to Dashboard";
                }
            }
        }
    } catch (e) {
        console.error("Error reading user session from localStorage:", e);
    }

    // 2. Scroll Reveal Animation for Feature Cards
    const cards = document.querySelectorAll('.feature-card');
    
    if (cards.length > 0) {
        const observerOptions = {
            root: null,
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('show');
                    observer.unobserve(entry.target); // Stop observing once shown
                }
            });
        }, observerOptions);

        cards.forEach(card => {
            observer.observe(card);
        });
    }
});
