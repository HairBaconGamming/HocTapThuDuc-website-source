// public/js/animations.js

// Register ScrollTrigger with GSAP
gsap.registerPlugin(ScrollTrigger);

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
    },
  };
  const config = { ...defaults, ...options };
  gsap.fromTo(
    selector,
    { y: config.y, opacity: config.opacity },
    {
      y: 0,
      opacity: 1,
      duration: config.duration,
      ease: config.ease,
      stagger: config.stagger,
      scrollTrigger: config.scrollTrigger,
    }
  );
}

/**
 * Apply a parallax effect to elements as the user scrolls.
 * @param {string|Element} selector - CSS selector or element reference.
 * @param {object} options - Optional parallax parameters.
 */
function parallaxEffect(selector, options = {}) {
  const defaults = {
    y: 100, // the element will move 100px when fully scrolled
    ease: "none",
    scrollTrigger: {
      trigger: selector,
      scrub: true,
      start: "top bottom",
      end: "bottom top",
    },
  };
  const config = { ...defaults, ...options };
  gsap.to(selector, {
    y: config.y,
    ease: config.ease,
    scrollTrigger: config.scrollTrigger,
  });
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
 * Initialize advanced animations:
 * - Staggered entrance for elements with .animate-stagger.
 * - Parallax scrolling for elements with .parallax.
 * - Hover effects for elements with data-hover-effect.
 */
function initAdvancedAnimations() {
  // Stagger entrance
  const staggerElements = document.querySelectorAll(".animate-stagger");
  if (staggerElements.length > 0) {
    animateStagger(".animate-stagger");
  }
  
  // Parallax effect: For each element with class "parallax", check for a data attribute
  const parallaxEls = document.querySelectorAll(".parallax");
  parallaxEls.forEach((el) => {
    const parallaxY = el.getAttribute("data-parallax-y") || 100;
    parallaxEffect(el, { y: parallaxY });
  });
  
  // Hover flourish
  const hoverEls = document.querySelectorAll("[data-hover-effect]");
  hoverEls.forEach((el) => attachHoverFlourish(el));
}

// Initialize animations on DOMContentLoaded
document.addEventListener("DOMContentLoaded", initAdvancedAnimations);

document.addEventListener('DOMContentLoaded', () => {
    const header = document.getElementById('mainHeader');
    const navMenu = document.getElementById('navMenu');
    const mobileToggle = document.querySelector('.mobile-nav-toggle');

    // --- MODIFIED: Select all dropdowns including the new Live Stream item ---
    // Standard dropdowns (e.g., "Công cụ")
    const standardDropdowns = document.querySelectorAll('.header .dropdown:not(.live-item)'); 
    // Specific Live Stream item
    const liveStreamItem = document.querySelector('.nav-item.live-item'); // Ensure .live-item is on the <li>

    const allDropdowns = [...standardDropdowns];
    if (liveStreamItem) {
        allDropdowns.push(liveStreamItem);
        // Optionally, add the 'dropdown' class if it's not already there and your CSS relies on it
        // For this script's logic, it's not strictly necessary if structure is consistent
        if (!liveStreamItem.classList.contains('dropdown')) {
            // liveStreamItem.classList.add('dropdown'); 
        }
    }
    // --- END MODIFICATION ---

    const allSubmenus = document.querySelectorAll('.header .dropdown-submenu');

    // --- Register GSAP Plugins ---
    gsap.registerPlugin(ScrollTrigger);

    // --- Initial State Hiding (Dropdowns) ---
    gsap.set('.dropdown-menu, .submenu', { autoAlpha: 0, y: -10, scale: 0.98 });

    // --- GSAP Load Animations ---
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
        const menu = dropdown.querySelector('.dropdown-menu'); // This will now also find .live-stream-dropdown-menu
        const links = menu ? menu.querySelectorAll('.tool-dropdown-link') : [];
        let openTimeline = null;
        let closeTimeline = null;
        let hoverTimeout;

        const openMenu = () => {
            if (!menu) return;
            if (closeTimeline) closeTimeline.kill();
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
            if (openTimeline) openTimeline.kill();
            const duration = immediate ? 0 : 0.3;
            closeTimeline = gsap.timeline({ defaults: { duration: duration, ease: "power1.in" } })
                .set(menu, { pointerEvents: 'none' })
                .to(links, { autoAlpha: 0, x: -5, stagger: 0.03 }, 0)
                .to(menu, { autoAlpha: 0, y: -10, scale: 0.98 }, 0.1);
        };

        // DESKTOP HOVER LOGIC
        if (!isMobile()) {
             dropdown.addEventListener('mouseenter', () => {
                clearTimeout(hoverTimeout);
                 allDropdowns.forEach(otherDd => {
                    if (otherDd !== dropdown && otherDd.classList.contains('active')) {
                        otherDd.classList.remove('active');
                        const otherMenuElement = otherDd.querySelector('.dropdown-menu');
                        const otherLinks = otherMenuElement ? otherMenuElement.querySelectorAll('.tool-dropdown-link') : [];
                        // Explicitly pass menu and links for context
                        closeMenu.call({ menu: otherMenuElement, links: otherLinks }, true);
                    }
                 });
                openMenu();
             });

             dropdown.addEventListener('mouseleave', () => {
                 hoverTimeout = setTimeout(() => {
                    closeMenu();
                 }, 150);
             });
        }

         // MOBILE CLICK LOGIC (Also used for specific desktop toggles if needed)
         const toggleButton = dropdown.querySelector('.has-dropdown'); // The link itself acts as toggle
         if (toggleButton) {
            toggleButton.addEventListener('click', (e) => {
                // Allow click for "More Tools" on desktop, AND for all dropdowns on mobile
                if (isMobile() || dropdown.id === 'moreToolsDropdown' || dropdown.classList.contains('live-item')) { 
                    e.preventDefault();
                    const isActive = dropdown.classList.toggle('active');

                    allDropdowns.forEach(otherDd => {
                        if (otherDd !== dropdown && otherDd.classList.contains('active')) {
                            otherDd.classList.remove('active');
                            const otherMenuElement = otherDd.querySelector('.dropdown-menu');
                            const otherLinks = otherMenuElement ? otherMenuElement.querySelectorAll('.tool-dropdown-link') : [];
                            if(isMobile()){
                                if(otherMenuElement) gsap.to(otherMenuElement, { height: 0, duration: 0.3, ease: 'power1.inOut' });
                            } else {
                                // Explicitly pass menu and links for context
                                closeMenu.call({ menu: otherMenuElement, links: otherLinks });
                            }
                        }
                    });

                    if (isActive) {
                         if(isMobile()){
                            gsap.set(menu, { height: 'auto', autoAlpha: 1});
                            const height = menu.scrollHeight;
                            gsap.fromTo(menu, { height: 0, autoAlpha: 1 }, { height: height, duration: 0.4, ease: 'power2.out' });
                             gsap.fromTo(links,
                                { autoAlpha: 0, x: -10 },
                                { delay: 0.1, autoAlpha: 1, x: 0, stagger: 0.05, duration: 0.3, ease: 'power1.out' });
                         } else {
                             openMenu();
                         }
                    } else {
                        if(isMobile()){
                            gsap.to(menu, { height: 0, duration: 0.3, ease: 'power1.inOut' });
                        } else {
                            closeMenu();
                        }
                    }
                }
            });
         }
    });

    // SUBMENU LOGIC (Remains the same)
     allSubmenus.forEach(submenuContainer => {
        const submenu = submenuContainer.querySelector('.submenu');
        const subLinks = submenu ? submenu.querySelectorAll('.tool-dropdown-link') : [];
        let subOpenTimeline = null;
        let subCloseTimeline = null;
        let subHoverTimeout;

        const openSubMenu = () => {
            if(!submenu) return;
            if (subCloseTimeline) subCloseTimeline.kill();
            subOpenTimeline = gsap.timeline({ defaults: { duration: 0.35, ease: "power2.out" } })
                .set(submenu, { pointerEvents: 'auto' })
                .to(submenu, { autoAlpha: 1, x: 0, scale: 1 }, 0)
                .fromTo(subLinks,
                    { autoAlpha: 0, x: 10 },
                    { autoAlpha: 1, x: 0, stagger: 0.04 },
                    0.08);
        };
        const closeSubMenu = (immediate = false) => {
             if(!submenu) return;
             if (subOpenTimeline) subOpenTimeline.kill();
             const duration = immediate ? 0 : 0.25;
             subCloseTimeline = gsap.timeline({ defaults: { duration: duration, ease: "power1.in" } })
                 .set(submenu, { pointerEvents: 'none' })
                 .to(subLinks, { autoAlpha: 0, x: -5, stagger: 0.02 }, 0)
                 .to(submenu, { autoAlpha: 0, x: 10, scale: 0.98 }, 0.05);
        };

        if (!isMobile()) {
            submenuContainer.addEventListener('mouseenter', () => {
                 clearTimeout(subHoverTimeout);
                 allSubmenus.forEach(otherSm => {
                     if (otherSm !== submenuContainer && otherSm.classList.contains('active')) {
                         otherSm.classList.remove('active');
                         const otherSubmenuElement = otherSm.querySelector('.submenu');
                         const otherSubLinks = otherSubmenuElement ? otherSubmenuElement.querySelectorAll('.tool-dropdown-link') : [];
                         closeSubMenu.call({ submenu: otherSubmenuElement, subLinks: otherSubLinks }, true);
                     }
                 });
                 openSubMenu();
             });
            submenuContainer.addEventListener('mouseleave', () => {
                 subHoverTimeout = setTimeout(() => {
                     closeSubMenu();
                 }, 150);
             });
        }

        const subToggleButton = submenuContainer.querySelector('.has-dropdown');
        if (subToggleButton) {
             subToggleButton.addEventListener('click', (e) => {
                 if(isMobile()){
                     e.preventDefault();
                     const isActive = submenuContainer.classList.toggle('active');
                     allSubmenus.forEach(otherSm => {
                        if (otherSm !== submenuContainer && otherSm.classList.contains('active')) {
                            otherSm.classList.remove('active');
                            gsap.to(otherSm.querySelector('.submenu'), { height: 0, duration: 0.3, ease: 'power1.inOut' });
                        }
                     });
                     if (isActive) {
                         gsap.set(submenu, { height: 'auto', autoAlpha: 1 });
                         const height = submenu.scrollHeight;
                         gsap.fromTo(submenu, { height: 0, autoAlpha: 1 }, { height: height, duration: 0.4, ease: 'power2.out' });
                         gsap.fromTo(subLinks,
                            { autoAlpha: 0, x: -10 },
                            { delay: 0.1, autoAlpha: 1, x: 0, stagger: 0.05, duration: 0.3, ease: 'power1.out' });
                     } else {
                         gsap.to(submenu, { height: 0, duration: 0.3, ease: 'power1.inOut' });
                     }
                 }
             });
         }
    });

    // ----- Mobile Navigation Toggle -----
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
            } else {
                 gsap.set('.nav-menu .nav-item', { autoAlpha: 0 });
            }
        });
    }

    // ----- Close Mobile Menu/Dropdowns on Outside Click -----
    document.addEventListener('click', (e) => {
        if (navMenu.classList.contains('active') && !navMenu.contains(e.target) && !mobileToggle.contains(e.target)) {
            mobileToggle.setAttribute('aria-expanded', 'false');
            navMenu.classList.remove('active');
            document.body.style.overflow = '';
             gsap.set('.nav-menu .nav-item', { autoAlpha: 0 });
        }
        if (!isMobile()) {
            allDropdowns.forEach(dropdown => {
                if (dropdown.classList.contains('active') && !dropdown.contains(e.target)) {
                     dropdown.classList.remove('active');
                     const menuElement = dropdown.querySelector('.dropdown-menu');
                     const linksElements = menuElement ? menuElement.querySelectorAll('.tool-dropdown-link') : [];
                     closeMenu.call({ menu: menuElement, links: linksElements });
                }
            });
             allSubmenus.forEach(submenuContainer => {
                 if (submenuContainer.classList.contains('active') && !submenuContainer.contains(e.target)) {
                     submenuContainer.classList.remove('active');
                     const submenuElement = submenuContainer.querySelector('.submenu');
                     const subLinksElements = submenuElement ? submenuElement.querySelectorAll('.tool-dropdown-link') : [];
                     closeSubMenu.call({ submenu: submenuElement, subLinks: subLinksElements });
                 }
            });
        }
    });


    // Animated Stats Counter
const statNumbers = document.querySelectorAll('.stat-number');
statNumbers.forEach(counter => {
    // Ensure the counter element exists
    if (!counter) return;
    
    // Get the target number from the data-target attribute
    const target = +counter.dataset.target;

    // Use ScrollTrigger to start the animation when the element is in view
    ScrollTrigger.create({
        trigger: counter,
        start: 'top 90%', // Start animation when 90% of the element is visible
        once: true, // Only run the animation once
        onEnter: () => {
            // Use GSAP to animate the innerText property
            gsap.to(counter, {
                duration: 2, // Animation duration in seconds
                innerText: target,
                roundProps: "innerText", // Round the numbers to whole integers
                ease: "power2.out", // Easing function for a smooth effect
            });
        },
    });
});
}); // End DOMContentLoaded