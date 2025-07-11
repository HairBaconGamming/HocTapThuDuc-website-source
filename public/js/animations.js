// public/js/animations.js

document.addEventListener('DOMContentLoaded', () => {
    // --- Register GSAP Plugins ---
    if (typeof gsap === 'undefined') {
        console.error("GSAP not loaded. Animations will be disabled.");
        return;
    }
    gsap.registerPlugin(ScrollTrigger);

    // --- Element References ---
    const header = document.getElementById('mainHeader');
    const navMenu = document.getElementById('navMenu');
    const mobileToggle = document.querySelector('.mobile-nav-toggle');
    const allDropdowns = document.querySelectorAll('.header .dropdown');
    const allSubmenus = document.querySelectorAll('.header .dropdown-submenu');

    // --- Initial State Hiding (Dropdowns Only) ---
    gsap.set('.dropdown-menu, .submenu', { autoAlpha: 0, y: -10, scale: 0.98, pointerEvents: 'none' });

    // --- GSAP Load Animations ---
    const tlLoad = gsap.timeline({ delay: 0.2 });
    tlLoad
        .from('.logo', { duration: 0.8, x: -50, autoAlpha: 0, ease: "power3.out" })
        // === THIS IS THE CORRECTED SELECTOR ===
        // It now targets only the main nav items, excluding the user/auth block.
        .from('.nav-list > .nav-item', { 
            duration: 0.6,
            y: -30,
            autoAlpha: 0,
            stagger: 0.07,
            ease: "power2.out"
        }, "-=0.5");
        // The user/auth block will now remain visible by default.
        
    // --- Header Scroll Interaction ---
    ScrollTrigger.create({
        start: 'top -80',
        onEnter: () => {
            header.classList.add('scrolled');
            document.body.classList.add('header-scrolled');
        },
        onLeaveBack: () => {
            header.classList.remove('scrolled');
            document.body.classList.remove('header-scrolled');
        }
    });

    // --- Helper: Check if Mobile View ---
    const isMobile = () => window.innerWidth <= 1024;

    // --- Enhanced Dropdown/Submenu Logic (Desktop Hover + Mobile Click) ---
    allDropdowns.forEach(dropdown => {
        const menu = dropdown.querySelector('.dropdown-menu');
        if (!menu) return;
        
        let openTimeline = null;
        let hoverTimeout;

        const openMenu = () => {
            if (openTimeline && openTimeline.isActive()) openTimeline.kill();
            gsap.killTweensOf(menu); // Kill any closing tweens
            openTimeline = gsap.timeline({ defaults: { duration: 0.3, ease: "power2.out" } })
                .set(menu, { pointerEvents: 'auto' })
                .to(menu, { autoAlpha: 1, y: 0, scale: 1 });
        };

        const closeMenu = () => {
            gsap.killTweensOf(menu);
            gsap.to(menu, { 
                duration: 0.2, 
                autoAlpha: 0, 
                y: -10, 
                scale: 0.98, 
                ease: "power1.in",
                onComplete: () => gsap.set(menu, { pointerEvents: 'none' }) 
            });
        };

        // DESKTOP HOVER LOGIC
        if (!isMobile()) {
             dropdown.addEventListener('mouseenter', () => {
                clearTimeout(hoverTimeout);
                openMenu();
             });
             dropdown.addEventListener('mouseleave', () => {
                 hoverTimeout = setTimeout(closeMenu, 150);
             });
        }

        // MOBILE CLICK LOGIC
        const toggleButton = dropdown.querySelector('.has-dropdown');
        if (toggleButton) {
            toggleButton.addEventListener('click', (e) => {
                if (isMobile()) { 
                    e.preventDefault();
                    const isActive = dropdown.classList.toggle('active');

                    // Close other open dropdowns
                    allDropdowns.forEach(otherDd => {
                        if (otherDd !== dropdown && otherDd.classList.contains('active')) {
                            otherDd.classList.remove('active');
                            const otherMenu = otherDd.querySelector('.dropdown-menu');
                            if(otherMenu) gsap.to(otherMenu, { height: 0, duration: 0.3, ease: 'power1.inOut' });
                        }
                    });

                    if (isActive) {
                        gsap.set(menu, { height: 'auto', autoAlpha: 1});
                        gsap.from(menu, { height: 0, duration: 0.4, ease: 'power2.out' });
                    } else {
                        gsap.to(menu, { height: 0, duration: 0.3, ease: 'power1.inOut' });
                    }
                }
            });
        }
    });

    // --- Mobile Navigation Toggle ---
    if (mobileToggle && navMenu) {
        mobileToggle.addEventListener('click', () => {
            const isExpanded = mobileToggle.getAttribute('aria-expanded') === 'true';
            mobileToggle.setAttribute('aria-expanded', !isExpanded);
            navMenu.classList.toggle('active');
            document.body.style.overflow = navMenu.classList.contains('active') ? 'hidden' : '';
            
            if (navMenu.classList.contains('active')) {
                gsap.fromTo('.nav-menu.active .nav-item',
                    { autoAlpha: 0, x: -30 },
                    { duration: 0.4, autoAlpha: 1, x: 0, stagger: 0.05, ease: 'power2.out', delay: 0.2 }
                );
            }
        });
    }

    // --- Close Mobile Menu on Outside Click ---
    document.addEventListener('click', (e) => {
        if (navMenu.classList.contains('active') && !navMenu.contains(e.target) && !mobileToggle.contains(e.target)) {
            mobileToggle.setAttribute('aria-expanded', 'false');
            navMenu.classList.remove('active');
            document.body.style.overflow = '';
        }
    });

    // --- Animated Stats Counter (from previous step) ---
    const statNumbers = document.querySelectorAll('.stat-number');
    statNumbers.forEach(counter => {
        if (!counter) return;
        const target = +counter.dataset.target;
        ScrollTrigger.create({
            trigger: counter,
            start: 'top 90%',
            once: true,
            onEnter: () => {
                gsap.to(counter, {
                    duration: 2,
                    innerText: target,
                    roundProps: "innerText",
                    ease: "power2.out",
                });
            },
        });
    });

}); // End DOMContentLoaded