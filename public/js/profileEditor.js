/* public/js/profileEditor.js - Fixed Version */

document.addEventListener('DOMContentLoaded', () => {
    const pwHeader = document.getElementById('pwToggleHeader');
    const pwCard = document.getElementById('passwordCard');
    const pwFields = document.getElementById('pwFields');
    
    if (pwHeader && pwFields) {
        pwHeader.addEventListener('click', () => {
            const isOpen = pwCard.classList.contains('is-open');
            
            if (!isOpen) {
                // MỞ RA
                pwCard.classList.add('is-open');
                // Kích hoạt các ô input để người dùng nhập và gửi form
                pwFields.querySelectorAll('input').forEach(i => {
                    i.disabled = false;
                });
                
                // Hiệu ứng GSAP nảy nhẹ nếu có thư viện
                if (window.gsap) {
                    gsap.from(pwFields.children, {
                        opacity: 0,
                        y: 10,
                        stagger: 0.1,
                        duration: 0.4
                    });
                }
            } else {
                // ĐÓNG LẠI
                pwCard.classList.remove('is-open');
                // Vô hiệu hóa input để không gửi dữ liệu rỗng lên server
                pwFields.querySelectorAll('input').forEach(i => {
                    i.disabled = true;
                });
            }
        });
    }

    // Logic xử lý con mắt (Show/Hide Password)
    document.querySelectorAll('.eye-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const input = btn.parentElement.querySelector('input');
            const icon = btn.querySelector('i');
            
            if (input.type === 'password') {
                input.type = 'text';
                icon.classList.replace('fa-eye', 'fa-eye-slash');
            } else {
                input.type = 'password';
                icon.classList.replace('fa-eye-slash', 'fa-eye');
            }
        });
    });

    // Kiểm tra mật khẩu khớp thời gian thực
    const newPass = document.querySelector('input[name="newPassword"]');
    const confirmPass = document.querySelector('input[name="confirmNewPassword"]');
    const msg = document.getElementById('pwMatchMessage');

    const validatePasswords = () => {
        if (!newPass.value || !confirmPass.value) {
            msg.textContent = '';
            return;
        }
        if (newPass.value === confirmPass.value) {
            msg.textContent = '✅ Mật khẩu trùng khớp!';
            msg.style.color = '#27ae60';
        } else {
            msg.textContent = '❌ Mật khẩu chưa khớp...';
            msg.style.color = '#e74c3c';
        }
    };

    newPass?.addEventListener('input', validatePasswords);
    confirmPass?.addEventListener('input', validatePasswords);
});