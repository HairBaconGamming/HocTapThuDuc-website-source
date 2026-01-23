document.addEventListener('DOMContentLoaded', () => {
    initChart();
});

function initChart() {
    const ctx = document.getElementById('learningChart');
    if (!ctx) return;

    // [REAL DATA] Dữ liệu hoạt động thật từ server
    // Nếu user mới chưa học gì, mảng sẽ là [0,0,0,0,0,0,0] và biểu đồ sẽ phẳng (đúng thực tế)
    const rawData = window.WEEKLY_ACTIVITY;
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'],
            datasets: [{
                label: 'Giờ học',
                data: rawData,
                borderColor: '#2563eb',
                backgroundColor: (context) => {
                    const ctx = context.chart.ctx;
                    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
                    gradient.addColorStop(0, 'rgba(37, 99, 235, 0.4)');
                    gradient.addColorStop(1, 'rgba(37, 99, 235, 0.0)');
                    return gradient;
                },
                borderWidth: 3,
                tension: 0.4,
                pointRadius: 4,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#2563eb',
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#0f172a',
                    padding: 10,
                    cornerRadius: 8,
                    displayColors: false,
                    callbacks: {
                        label: (context) => context.parsed.y + ' giờ'
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { borderDash: [5, 5], color: '#f1f5f9' },
                    ticks: { display: false } 
                },
                x: {
                    grid: { display: false },
                    ticks: { font: { family: "'Be Vietnam Pro', sans-serif" } }
                }
            }
        }
    });
}