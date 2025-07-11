/**
 * @file animations.js
 * @description Master script for all site-wide GSAP and dynamic animations.
 * @version 2.0.0
 * @author Your Name
 */

(function() {
    "use strict";

    // --- UTILITY AND STATE ---

    /**
     * Checks if the GSAP library and required plugins are loaded.
     * @returns {boolean} True if all necessary GSAP components are available.
     */
    const areLibsLoaded = () => {
        if (typeof gsap === 'undefined') {
            console.error("GSAP core is not loaded. Animations will be disabled.");
            return false;
        }
        if (typeof ScrollTrigger === 'undefined') {
            console.error("GSAP ScrollTrigger plugin is not loaded. Scroll-based animations will fail.");
            return false;
        }
        return true;
    };

    /**
     * Checks if the user prefers reduced motion.
     * @type {boolean}
     */
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /**
     * Checks if the current view is mobile-sized.
     * @param {number} breakpoint - The width in pixels to consider as mobile.
     * @returns {boolean} True if the window width is at or below the breakpoint.
     */
    const isMobile = (breakpoint = 1024) => window.innerWidth <= breakpoint;


    // --- CORE ANIMATION FUNCTIONS ---

    /**
     * Animates elements with a staggered fade-and-slide entrance when they enter the viewport.
     * @param {string} selector - The CSS selector for the elements to animate.
     * @param {object} [options={}] - Optional GSAP parameters to override defaults.
     * @param {gsap.StaggerVars} [staggerOptions={}] - Optional GSAP stagger parameters.
     */
    function animateStagger(selector, options = {}, staggerOptions = {}) {
        const elements = document.querySelectorAll(selector);
        if (elements.length === 0) return;

        if (prefersReducedMotion) {
            gsap.set(elements, { autoAlpha: 1 });
            return;
        }

        const defaults = {
            autoAlpha: 0,
            y: 50,
            duration: 0.8,
            ease: "power3.out",
            scrollTrigger: {
                trigger: elements[0].parentNode,
                start: "top 85%",
                end: "bottom top",
                toggleActions: "play none none none",
            },
            ...options
        };

        const staggerDefaults = {
            amount: 0.4,
            from: "start",
            ...staggerOptions
        };

        gsap.from(elements, { ...defaults, stagger: staggerDefaults });
    }

    /**
     * Applies a vertical parallax effect to an element as the user scrolls.
     * @param {string|Element} selector - The CSS selector or element reference.
     * @param {object} [options={}] - Optional GSAP and ScrollTrigger parameters.
     */
    function parallaxEffect(selector, options = {}) {
        const element = typeof selector === 'string' ? document.querySelector(selector) : selector;
        if (!element || prefersReducedMotion) return;

        const defaults = {
            yPercent: -20, // Move element up by 20% of its height
            ease: "none",
            scrollTrigger: {
                trigger: element,
                scrub: 1.5, // Adds a bit of smoothing (higher number = more delay)
                start: "top bottom",
                end: "bottom top",
            },
            ...options
        };

        gsap.to(element, defaults);
    }

    /**
     * Attaches an interactive hover effect to an element.
     * @param {string|Element} selector - The CSS selector or element(s) reference.
     * @param {object} [options={}] - Animation options on hover.
     */
    function attachHoverFlourish(selector, options = {}) {
        const elements = gsap.utils.toArray(selector);
        if (elements.length === 0 || prefersReducedMotion) return;

        const defaults = {
            scale: 1.05,
            duration: 0.4,
            ease: "power2.out",
            ...options
        };

        elements.forEach(el => {
            el.addEventListener("mouseenter", () => gsap.to(el, defaults));
            el.addEventListener("mouseleave", () => gsap.to(el, { scale: 1, duration: 0.3 }));
        });
    }


    // --- PAGE-SPECIFIC INITIALIZATION MODULES ---

    /**
     * Initializes all animations related to the main site header.
     */
    function initHeaderAnims() {
        const header = document.getElementById('mainHeader');
        const navMenu = document.getElementById('navMenu');
        const mobileToggle = document.querySelector('.mobile-nav-toggle');
        const allDropdowns = document.querySelectorAll('.header .dropdown');
        const allSubmenus = document.querySelectorAll('.header .dropdown-submenu');

        if (!header) return;

        // Animate header load
        if (!prefersReducedMotion) {
            gsap.from(header, {
                y: '-100%',
                duration: 1,
                ease: 'power3.out',
                delay: 0.2
            });
        }

        // Header scroll interaction
        ScrollTrigger.create({
            start: 'top -80',
            onEnter: () => header.classList.add('scrolled'),
            onLeaveBack: () => header.classList.remove('scrolled'),
        });
        
        // --- Dropdown and Submenu Logic ---
        function createDropdownLogic(dropdownElement, isSubmenu = false) {
            const menu = dropdownElement.querySelector(isSubmenu ? '.submenu' : '.dropdown-menu');
            if (!menu) return;

            const links = menu.querySelectorAll('.tool-dropdown-link');
            let openTimeline, closeTimeline, hoverTimeout;

            const animationProps = {
                duration: 0.35,
                ease: "power2.out",
                y: isSubmenu ? 0 : 10,
                x: isSubmenu ? 10 : 0,
            };

            const openMenu = () => {
                if (closeTimeline) closeTimeline.kill();
                gsap.set(menu, { pointerEvents: 'auto' });
                openTimeline = gsap.timeline()
                    .to(menu, { autoAlpha: 1, y: 0, x: 0, duration: animationProps.duration, ease: animationProps.ease })
                    .from(links, { autoAlpha: 0, x: animationProps.x / 2, stagger: 0.05, duration: 0.2 }, "-=0.2");
            };

            const closeMenu = () => {
                if (openTimeline) openTimeline.kill();
                closeTimeline = gsap.timeline({ defaults: { duration: 0.2, ease: "power1.in" } })
                    .to(menu, { autoAlpha: 0, y: animationProps.y, x: animationProps.x })
                    .set(menu, { pointerEvents: 'none' });
            };

            // Desktop hover logic
            if (!isMobile()) {
                dropdownElement.addEventListener('mouseenter', () => {
                    clearTimeout(hoverTimeout);
                    openMenu();
                });
                dropdownElement.addEventListener('mouseleave', () => {
                    hoverTimeout = setTimeout(closeMenu, 150);
                });
            }

            // Click logic for mobile and specified toggles
            const toggleButton = dropdownElement.querySelector('.has-dropdown');
            if (toggleButton) {
                toggleButton.addEventListener('click', (e) => {
                    if (!isMobile() && !dropdownElement.classList.contains('user-dropdown')) return;
                    e.preventDefault();
                    
                    const isActive = dropdownElement.classList.toggle('active');
                    if (isActive) {
                        openMenu();
                    } else {
                        closeMenu();
                    }
                });
            }
        }

        allDropdowns.forEach(dd => createDropdownLogic(dd, false));
        allSubmenus.forEach(sm => createDropdownLogic(sm, true));

        // --- Mobile Navigation Toggle ---
        if (mobileToggle && navMenu) {
            const mobileMenuTimeline = gsap.timeline({ paused: true, reversed: true })
                .to(navMenu, { right: 0, duration: 0.5, ease: 'power3.inOut' })
                .from('.nav-menu.active .nav-item', {
                    autoAlpha: 0,
                    x: -30,
                    duration: 0.4,
                    stagger: 0.05,
                    ease: 'power2.out'
                }, "-=0.2");

            mobileToggle.addEventListener('click', () => {
                const isExpanded = mobileToggle.getAttribute('aria-expanded') === 'true';
                mobileToggle.setAttribute('aria-expanded', !isExpanded);
                navMenu.classList.toggle('active');
                document.body.classList.toggle('overflow-hidden', !isExpanded);
                mobileMenuTimeline.reversed(!mobileMenuTimeline.reversed());
            });
        }
    }

    /**
     * Initializes animations specific to the homepage.
     */
    function initHomePageAnims() {
        // Animated Stats Counter
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
                        duration: 2.5,
                        innerText: target,
                        roundProps: "innerText",
                        ease: "power2.out",
                    });
                },
            });
        });

        // Hero Section Text Reveal
        const heroTitle = document.querySelector('.hero-title-v2');
        if (heroTitle && !prefersReducedMotion) {
            const lines = heroTitle.querySelectorAll('.line span');
            gsap.set(lines, { yPercent: 110, autoAlpha: 0 });
            gsap.to(lines, {
                yPercent: 0,
                autoAlpha: 1,
                duration: 1,
                ease: 'power4.out',
                stagger: 0.1,
                delay: 0.3
            });
        }

        // Other homepage entrance animations
        animateStagger('.stat-item', { y: 30, duration: 0.7, stagger: 0.1 });
        animateStagger('.feature-card-v2');
        animateStagger('.content-column');
        
        parallaxEffect('.hero-aurora.aurora-1', {yPercent: 30});
        parallaxEffect('.hero-aurora.aurora-2', {yPercent: -20});
    }

    /**
     * Handles page transitions for a smoother SPA-like feel.
     */
    function initPageTransitions() {
        const loadingLinks = document.querySelectorAll('.loading-link');
        const loadingOverlay = document.getElementById('loading-overlay'); // Assume it exists in HTML

        if (!loadingOverlay) return;

        // Fade out on link click
        loadingLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                const href = link.getAttribute('href');
                // Don't prevent default for external links or anchor links
                if (!href || href.startsWith('#') || link.getAttribute('target') === '_blank') {
                    return;
                }
                e.preventDefault();
                gsap.to(loadingOverlay, {
                    autoAlpha: 1,
                    duration: 0.4,
                    onComplete: () => {
                        window.location.href = href;
                    }
                });
            });
        });

        // Fade in on page load
        gsap.set(loadingOverlay, { autoAlpha: 1 });
        window.addEventListener('load', () => {
            gsap.to(loadingOverlay, { autoAlpha: 0, duration: 0.5, delay: 0.2 });
        });
    }


    // --- MAIN INITIALIZATION LOGIC ---
    
    /**
     * The main function to run on DOMContentLoaded.
     */
    function onDomReady() {
        console.log("DOM ready. Initializing animations...");

        if (!areLibsLoaded()) return;

        // Initialize components
        initHeaderAnims();
        // initPageTransitions(); // Uncomment if you have a #loading-overlay element

        // Initialize page-specific animations
        const pageId = document.body.dataset.page;
        switch (pageId) {
            case 'home':
                initHomePageAnims();
                break;
            case 'dashboard':
                // initDashboardAnims(); // Example for another page
                break;
            // Add cases for other pages as needed
            default:
                // Generic animations for other pages
                animateStagger('.animate-stagger');
                break;
        }

        console.log("Animations initialized.");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", onDomReady);
    } else {
        onDomReady();
    }

})();