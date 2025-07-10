document.addEventListener('DOMContentLoaded', () => {
    const artisticCursor = document.getElementById('artistic-cursor');
    const cursorCore = artisticCursor.querySelector('.cursor-core');
    const cursorGlow = artisticCursor.querySelector('.cursor-glow');

    if (!artisticCursor || !cursorCore || !cursorGlow) {
        console.error("Artistic cursor elements not found!");
        return;
    }

    // --- Configuration ---
    // const smoothFactor = 1; // <<< Không cần thiết nữa
    const particleCreationRate = 30;
    const particleLifeTime = 800;
    const particleBaseSize = 6;
    const particleSizeVariance = 4;
    const particleSpawnOffset = 5;
    const interactiveElementsSelector = 'a, button, [role="button"], input, textarea, select';
    const idleTimeoutDuration = 150;

    // --- State Variables ---
    let mouseX = window.innerWidth / 2; // Giữ lại để biết vị trí cuối cùng
    let mouseY = window.innerHeight / 2; // Giữ lại để biết vị trí cuối cùng
    // let cursorX = mouseX; // <<< Không cần thiết nữa
    // let cursorY = mouseY; // <<< Không cần thiết nữa
    let isInteracting = false;
    let isClicking = false;
    let isIdle = false;
    let idleTimer = null;
    let lastParticleTime = 0;
    // let animationFrameId = null; // <<< Không cần thiết nữa

    // --- Helper: Lerp ---
    // function lerp(start, end, amount) { // <<< Không cần thiết nữa
    //     return (1 - amount) * start + amount * end;
    // }

    // --- Set Idle State ---
    function setIdleState(idle) {
        if (idle && !isIdle) {
            artisticCursor.classList.add('cursor-idle');
            isIdle = true;
        } else if (!idle && isIdle) {
            artisticCursor.classList.remove('cursor-idle');
            isIdle = false;
        }
    }

    // --- Update Cursor Position (trực tiếp trong mousemove) ---
    // function updateCursor() { ... } // <<< Không cần thiết nữa

    // --- Particle Creation ---
    function createParticle(x, y) { // Giờ nhận trực tiếp clientX/Y
        if (isIdle || isClicking || isInteracting) return;

        const particle = document.createElement('div');
        particle.classList.add('cursor-particle');
        const size = particleBaseSize + Math.random() * particleSizeVariance;
        const offsetX = (Math.random() - 0.5) * 2 * particleSpawnOffset;
        const offsetY = (Math.random() - 0.5) * 2 * particleSpawnOffset;
        // Đặt vị trí ban đầu gần vị trí chuột tức thì
        const startX = x + offsetX - size / 2;
        const startY = y + offsetY - size / 2;

        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        // Quan trọng: Đặt left/top trực tiếp, không cần dựa vào cursorX/Y cũ
        particle.style.left = `${startX}px`;
        particle.style.top = `${startY}px`;

        document.body.appendChild(particle);

        requestAnimationFrame(() => {
            const endX = startX + (Math.random() - 0.5) * 40;
            const endY = startY + (Math.random() - 0.5) * 40;
            // Tính toán transform dựa trên vị trí start thực tế của hạt
            particle.style.transform = `translate3d(${endX - startX}px, ${endY - startY}px, 0) scale(0)`;
            particle.style.opacity = '0';
        });

        setTimeout(() => {
            if (particle.parentNode) {
                particle.parentNode.removeChild(particle);
            }
        }, particleLifeTime);
    }

    // --- Event Listeners ---

    // Mouse Movement
    window.addEventListener('mousemove', (e) => {
        mouseX = e.clientX; // Vẫn cập nhật để biết vị trí cuối
        mouseY = e.clientY;

        // <<< Cập nhật vị trí con trỏ trực tiếp >>>
        // Sử dụng e.clientX/Y thay vì cursorX/Y đã được làm mượt
        const immediateX = e.clientX;
        const immediateY = e.clientY;
        artisticCursor.style.transform = `translate3d(${immediateX - artisticCursor.offsetWidth / 2}px, ${immediateY - artisticCursor.offsetHeight / 2}px, 0)`;

        // Reset idle state on move
        setIdleState(false);
        clearTimeout(idleTimer);

        // Start new idle timer
        idleTimer = setTimeout(() => {
            setIdleState(true);
        }, idleTimeoutDuration);

        // Throttle particle creation
        const now = Date.now();
        if (now - lastParticleTime > particleCreationRate) {
             // <<< Tạo hạt tại vị trí chuột tức thì >>>
            createParticle(immediateX, immediateY);
            lastParticleTime = now;
        }
    });

    // Interaction Hover (Không đổi)
    document.body.addEventListener('mouseover', (e) => {
        if (e.target.closest(interactiveElementsSelector)) {
            if (!isInteracting) {
                document.body.classList.add('cursor-interacting');
                isInteracting = true;
                 setIdleState(false);
                 clearTimeout(idleTimer);
            }
        }
    });
    document.body.addEventListener('mouseout', (e) => {
        if (e.target.closest(interactiveElementsSelector) && !e.relatedTarget?.closest(interactiveElementsSelector)) {
             if (isInteracting) {
                document.body.classList.remove('cursor-interacting');
                isInteracting = false;
                clearTimeout(idleTimer);
                idleTimer = setTimeout(() => setIdleState(true), idleTimeoutDuration);
            }
        }
    });

    // Clicking State (Không đổi)
    window.addEventListener('mousedown', () => {
        if (!isClicking) {
            document.body.classList.add('cursor-clicking');
            isClicking = true;
            setIdleState(false);
            clearTimeout(idleTimer);
        }
    });
    window.addEventListener('mouseup', () => {
        if (isClicking) {
            document.body.classList.remove('cursor-clicking');
            isClicking = false;
             clearTimeout(idleTimer);
             idleTimer = setTimeout(() => setIdleState(true), idleTimeoutDuration);
        }
    });

    // --- Initialization ---
    document.body.style.cursor = 'none';
    artisticCursor.style.opacity = '1';
    // Đặt vị trí ban đầu tức thì
    artisticCursor.style.transform = `translate3d(${mouseX - artisticCursor.offsetWidth / 2}px, ${mouseY - artisticCursor.offsetHeight / 2}px, 0)`;

    // Set initial state (likely idle if mouse hasn't moved yet)
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => setIdleState(true), idleTimeoutDuration);

    // updateCursor(); // <<< Không gọi vòng lặp update nữa

     // Optional: Hide/Show on window leave/enter
     document.addEventListener('mouseleave', () => {
         artisticCursor.style.opacity = '0';
         setIdleState(false);
         clearTimeout(idleTimer);
     });
     document.addEventListener('mouseenter', (e) => {
         mouseX = e.clientX; // Update position immediately
         mouseY = e.clientY;
         // Snap cursor to mouse - Cập nhật transform trực tiếp
         artisticCursor.style.transform = `translate3d(${mouseX - artisticCursor.offsetWidth / 2}px, ${mouseY - artisticCursor.offsetHeight / 2}px, 0)`;
         artisticCursor.style.opacity = '1';
         // Reset idle check on re-entry
         setIdleState(false);
         clearTimeout(idleTimer);
         idleTimer = setTimeout(() => setIdleState(true), idleTimeoutDuration);
     });

    console.log("Artistic cursor initialized (No Smoothing).");
});