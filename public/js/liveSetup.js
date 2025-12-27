/* public/js/liveSetup.js */

document.addEventListener('DOMContentLoaded', async () => {
    
    // --- 1. ANIMATION ENTRY ---
    if(typeof gsap !== 'undefined') {
        gsap.from('.setup-card', { y: 30, opacity: 0, duration: 0.8, stagger: 0.2, ease: 'power3.out' });
    }

    // --- 2. CAMERA PREVIEW & MIC CHECK ---
    const videoEl = document.getElementById('localVideoPreview');
    const micLevelEl = document.getElementById('micLevel');
    const deviceStatus = document.getElementById('deviceStatus');
    let localStream = null;

    async function initMedia() {
        try {
            deviceStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang check thiết bị...';
            
            localStream = await navigator.mediaDevices.getUserMedia({ 
                video: true, 
                audio: true 
            });
            
            // Show Video
            videoEl.srcObject = localStream;
            deviceStatus.innerHTML = '<i class="fas fa-check-circle" style="color:#2ecc71"></i> Thiết bị OK';

            // Setup Mic Meter (AudioContext)
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const analyser = audioContext.createAnalyser();
            const microphone = audioContext.createMediaStreamSource(localStream);
            const javascriptNode = audioContext.createScriptProcessor(2048, 1, 1);

            analyser.smoothingTimeConstant = 0.8;
            analyser.fftSize = 1024;

            microphone.connect(analyser);
            analyser.connect(javascriptNode);
            javascriptNode.connect(audioContext.destination);

            javascriptNode.onaudioprocess = function() {
                const array = new Uint8Array(analyser.frequencyBinCount);
                analyser.getByteFrequencyData(array);
                let values = 0;
                const length = array.length;
                for (let i = 0; i < length; i++) values += array[i];
                const average = values / length;
                
                // Update UI Height (Max 100%)
                const height = Math.min(100, average * 2); 
                micLevelEl.style.height = height + '%';
                
                // Đổi màu nếu nói to
                if(height > 50) micLevelEl.style.background = '#e74c3c'; // Đỏ (To)
                else micLevelEl.style.background = '#2ecc71'; // Xanh (Vừa)
            }

        } catch (err) {
            console.error(err);
            deviceStatus.innerHTML = '<i class="fas fa-exclamation-triangle" style="color:#e74c3c"></i> Lỗi Camera/Mic';
            alert("Vui lòng cấp quyền Camera và Micro để Livestream!");
        }
    }

    // Gọi hàm init ngay khi vào trang
    initMedia();

    // --- 3. THUMBNAIL PREVIEW ---
    const thumbInput = document.getElementById('thumbInput');
    const thumbPreview = document.getElementById('thumbPreview');
    const thumbBox = document.getElementById('thumbUploadBox');

    thumbBox.addEventListener('click', () => thumbInput.click());
    thumbInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if(file) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                thumbPreview.src = evt.target.result;
                thumbPreview.style.display = 'block';
            }
            reader.readAsDataURL(file);
        }
    });

    // --- 4. FORM SUBMIT ---
    const form = document.getElementById('setupForm');
    const btnSubmit = document.getElementById('btnSubmit');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const title = document.getElementById('liveTitle').value.trim();
        const category = document.querySelector('input[name="category"]:checked')?.value || 'Khác';
        
        if(title.length < 3) return alert("Tiêu đề ngắn quá!");

        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang khởi tạo...';

        try {
            // Tắt stream ở trang này trước khi chuyển trang (để trang sau dùng được cam)
            if(localStream) {
                localStream.getTracks().forEach(track => track.stop());
            }

            // Gọi API (Giả sử có hỗ trợ upload ảnh - dùng FormData)
            // Nếu API hiện tại chỉ nhận JSON, bạn cần sửa lại backend hoặc dùng JSON
            /* --- TRƯỜNG HỢP GỬI JSON (Hiện tại) ---
            */
            const res = await fetch("/live/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title, category }) 
            });
            const data = await res.json();

            if (res.ok && !data.error) {
                window.location.href = data.liveStreamUrl; // Chuyển hướng vào phòng
            } else {
                throw new Error(data.error || 'Lỗi tạo phòng');
            }

        } catch (err) {
            alert(err.message);
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = 'Thử lại';
            // Bật lại Cam nếu lỗi
            initMedia(); 
        }
    });
});