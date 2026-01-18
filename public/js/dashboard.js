document.addEventListener('DOMContentLoaded', () => {
    initActivityChart();
    animateCounters();
    addCardHoverEffects();
});

function initActivityChart() {
    const ctx = document.getElementById('activityChart');
    if (!ctx) return;

    // Dữ liệu từ server hoặc fallback
    const dataValues = window.weeklyActivity || [1.5, 2, 0.5, 3, 1, 4, 2.5]; 
    const labels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

    // Gradient màu
    const canvasContext = ctx.getContext('2d');
    const gradient = canvasContext.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(79, 70, 229, 0.5)');
    gradient.addColorStop(1, 'rgba(79, 70, 229, 0.0)');

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Giờ học',
                data: dataValues,
                borderColor: '#4f46e5',
                backgroundColor: gradient,
                borderWidth: 3,
                pointBackgroundColor: '#ffffff',
                pointBorderColor: '#4f46e5',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 1500,
                easing: 'easeInOutQuart'
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1e293b',
                    padding: 12,
                    titleFont: { family: "'Quicksand', sans-serif", size: 14 },
                    bodyFont: { family: "'Quicksand', sans-serif", size: 13 },
                    borderColor: '#4f46e5',
                    borderWidth: 1,
                    displayColors: false,
                    callbacks: {
                        title: function(context) {
                            return context[0].label;
                        },
                        label: function(context) {
                            return context.parsed.y + ' giờ học';
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#64748b', font: { family: "'Quicksand', sans-serif" } }
                },
                y: {
                    beginAtZero: true,
                    border: { display: false },
                    grid: { color: '#f1f5f9', borderDash: [5, 5] },
                    ticks: { display: false }
                }
            }
        }
    });
}

function animateCounters() {
    const counters = document.querySelectorAll('.stat-card h3');
    counters.forEach((counter, index) => {
        const target = parseInt(counter.innerText.replace(/[^0-9]/g, '')) || 0;
        const suffix = counter.innerText.replace(/[0-9]/g, '');
        
        if(target === 0) return;

        // Delay staggered animation
        setTimeout(() => {
            let count = 0;
            const increment = Math.ceil(target / 40);
            
            const updateCount = () => {
                count += increment;
                if (count < target) {
                    counter.innerText = count + suffix;
                    requestAnimationFrame(updateCount);
                } else {
                    counter.innerText = target + suffix;
                }
            };
            updateCount();
        }, index * 100);
    });
}

function addCardHoverEffects() {
    // Add subtle scale animation to all cards
    const cards = document.querySelectorAll('.stat-card, .section-block, .widget-card');
    cards.forEach(card => {
        card.addEventListener('mouseenter', () => {
            card.style.transition = 'all 0.3s ease';
        });
    });
}