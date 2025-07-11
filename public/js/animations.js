// public/js/animations.js

document.addEventListener('DOMContentLoaded', () => {

    // --- GSAP Plugin Registration ---
    if (typeof gsap === 'undefined') {
        console.error("GSAP not loaded. Animations will be disabled.");
        return;
    }
    gsap.registerPlugin(ScrollTrigger);

    // --- General Animation Functions (Stagger, Parallax, etc.) ---

    /**
     * Animate elements with a staggered entrance when they enter the viewport.
     * @param {string} selector - CSS selector for the elements.
     * @param {object} options - Optional animation parameters.
     */
    function animateStagger(selector, options = {}) {
        const defaults = {
            y: 50,
            opacity: 0,
            duration: 1,
            ease: "power3.out",
            stagger: 0.2,
            scrollTrigger: {
                trigger: selector,
                start: "top 80%",
                once: true // Ensure it only runs once per element
            },
        };
        const config = { ...defaults, ...options };
        gsap.from(selector, config); // Use .from() for simplicity
    }

    /**
     * Apply a parallax effect to elements as the user scrolls.
     * @param {string|Element} selector - CSS selector or element reference.
     * @param {object} options - Optional parallax parameters.
     */
    function parallaxEffect(selector, options = {}) {
        const defaults = {
            y: 100,
            ease: "none",
            scrollTrigger: {
                trigger: selector,
                scrub: true,
                start: "top bottom",
                end: "bottom top",
            },
        };
        const config = { ...defaults, ...options };
        gsap.to(selector, config);
    }

    /**
     * Attach a hover flourish effect to an element using GSAP.
     * @param {Element} el - The element to animate.
     * @param {number} scaleOnHover - The scale factor on hover.
     */
    function attachHoverFlourish(el, scaleOnHover = 1.05) {
        el.addEventListener("mouseenter", () => {
            gsap.to(el, { scale: scaleOnHover, duration: 0.3, ease: "power3.out" });
        });
        el.addEventListener("mouseleave", () => {
            gsap.to(el, { scale: 1, duration: 0.3, ease: "power3.out" });
        });
    }

    /**
     * Initialize general advanced animations on the page.
     */
    function initAdvancedAnimations() {
        // Stagger entrance for designated elements
        animateStagger("[data-animate='stagger']");

        // Parallax effect for designated elements
        const parallaxEls = document.querySelectorAll(".parallax");
        parallaxEls.forEach((el) => {
            const parallaxY = el.getAttribute("data-parallax-y") || 100;
            parallaxEffect(el, { y: parallaxY });
        });

        // Hover flourish for designated elements
        const hoverEls = document.querySelectorAll("[data-hover-effect]");
        hoverEls.forEach((el) => attachHoverFlourish(el));
        
        // Animated Stats Counter for homepage
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
    }

    // --- Header & Navigation Logic ---

    const header = document.getElementById('mainHeader');
    const navMenu = document.getElementById('navMenu');
    const mobileToggle = document.querySelector('.mobile-nav-toggle');

    // Correctly select all dropdowns and submenus
    const allDropdowns = document.querySelectorAll('.header .dropdown');
    const allSubmenus = document.querySelectorAll('.header .dropdown-submenu');

    // Initial State Hiding (Dropdowns)
    gsap.set('.dropdown-menu, .submenu', { autoAlpha: 0, y: -10, scale: 0.98 });

    // GSAP Load Animations for Header
    const tlLoad = gsap.timeline({ delay: 0.2 });
    tlLoad
        .from('.logo', { duration: 0.8, x: -50, autoAlpha: 0, ease: "power3.out" })
        .from('.nav-item', {
            duration: 0.6,
            y: -30,
            autoAlpha: 0,
            stagger: 0.07,
            ease: "power2.out"
        }, "-=0.5");

    // Header Scroll Interaction
    ScrollTrigger.create({
        start: 'top -80',
        onEnter: () => header?.classList.add('scrolled'),
        onLeaveBack: () => header?.classList.remove('scrolled')
    });
    
    // Helper: Check if Mobile View
    const isMobile = () => window.innerWidth <= 1024;

    // Enhanced Dropdown/Submenu Logic
    allDropdowns.forEach(dropdown => {
        const menu = dropdown.querySelector('.dropdown-menu');
        const links = menu ? Array.from(menu.querySelectorAll('.tool-dropdown-link, .pro-upgrade-link')) : [];
        let openTimeline;
        let closeTimeline;
        let hoverTimeout;

        const openMenu = () => {
            if (!menu) return;
            if (closeTimeline?.isActive()) closeTimeline.kill();
            openTimeline = gsap.timeline({ defaults: { duration: 0.4, ease: "power2.out" } })
                .set(menu, { pointerEvents: 'auto' })
                .to(menu, { autoAlpha: 1, y: 0, scale: 1 }, 0)
                .fromTo(links,
                    { autoAlpha: 0, x: 10, rotationX: -30, transformOrigin: "top right" },
                    { autoAlpha: 1, x: 0, rotationX: 0, stagger: 0.05 },
                    0.1);
        };

        const closeMenu = (immediate = false) => {
            if (!menu) return;
            if (openTimeline?.isActive()) openTimeline.kill();
            const duration = immediate ? 0 : 0.3;
            closeTimeline = gsap.timeline({ defaults: { duration: duration, ease: "power1.in" } })
                .set(menu, { pointerEvents: 'none' })
                .to(links, { autoAlpha: 0, x: -5, stagger: { amount: 0.1, from: "end" } }, 0)
                .to(menu, { autoAlpha: 0, y: -10, scale: 0.98 }, 0.1);
        };

        // DESKTOP HOVER LOGIC
        dropdown.addEventListener('mouseenter', () => {
            if (isMobile()) return;
            clearTimeout(hoverTimeout);
            openMenu();
        });

        dropdown.addEventListener('mouseleave', () => {
            if (isMobile()) return;
            hoverTimeout = setTimeout(closeMenu, 150);
        });

        // MOBILE CLICK LOGIC
        const toggleButton = dropdown.querySelector('.has-dropdown');
        if (toggleButton) {
            toggleButton.addEventListener('click', (e) => {
                if (!isMobile()) return;
                e.preventDefault();
                const isActive = dropdown.classList.toggle('active');

                // Close other open dropdowns on mobile
                allDropdowns.forEach(otherDd => {
                    if (otherDd !== dropdown && otherDd.classList.contains('active')) {
                        otherDd.classList.remove('active');
                        const otherMenu = otherDd.querySelector('.dropdown-menu');
                        if (otherMenu) gsap.to(otherMenu, { height: 0, duration: 0.3, ease: 'power1.inOut' });
                    }
                });

                if (isActive) {
                    gsap.set(menu, { height: 'auto', autoAlpha: 1 });
                    gsap.from(menu, { height: 0, duration: 0.4, ease: 'power2.out' });
                } else {
                    gsap.to(menu, { height: 0, duration: 0.3, ease: 'power1.inOut' });
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

    // --- Close Menus on Outside Click ---
    document.addEventListener('click', (e) => {
        if (isMobile() && navMenu.classList.contains('active') && !navMenu.contains(e.target) && !mobileToggle.contains(e.target)) {
            mobileToggle.setAttribute('aria-expanded', 'false');
            navMenu.classList.remove('active');
            document.body.style.overflow = '';
        }
    });

    // --- INITIALIZE ALL ANIMATIONS ---
    initAdvancedAnimations();

});