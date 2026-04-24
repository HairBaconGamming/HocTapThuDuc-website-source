(function () {
    function readPageData() {
        const node = document.getElementById('admin-page-data');
        if (!node) return {};

        try {
            return JSON.parse(node.textContent || '{}');
        } catch (error) {
            console.error('Failed to parse admin page data:', error);
            return {};
        }
    }

    function createChart(canvasId, config) {
        const canvas = document.getElementById(canvasId);
        if (!canvas || typeof Chart === 'undefined') return null;
        return new Chart(canvas, config);
    }

    function renderOverviewCharts(charts) {
        if (!charts?.overviewGrowth) return;
        const overviewRole = charts.overviewRole || charts.roleMix;
        const overviewContent = charts.overviewContent || charts.contentMix;

        createChart('overviewGrowthChart', {
            type: 'line',
            data: {
                labels: charts.overviewGrowth.labels,
                datasets: [
                    {
                        label: 'Visits',
                        data: charts.overviewGrowth.visits,
                        borderColor: '#0aa889',
                        backgroundColor: 'rgba(10, 168, 137, 0.12)',
                        borderWidth: 2,
                        tension: 0.35,
                        fill: true
                    },
                    {
                        label: 'Study minutes',
                        data: charts.overviewGrowth.studyMinutes,
                        borderColor: '#2f7eea',
                        backgroundColor: 'rgba(47, 126, 234, 0.08)',
                        borderWidth: 2,
                        tension: 0.35
                    },
                    {
                        label: 'New users',
                        data: charts.overviewGrowth.newUsers,
                        borderColor: '#dc8e2f',
                        backgroundColor: 'rgba(220, 142, 47, 0.08)',
                        borderWidth: 2,
                        tension: 0.35
                    }
                ]
            },
            options: chartOptions({ yTitle: 'Count' })
        });

        if (overviewRole) {
            createChart('overviewRoleChart', {
                type: 'doughnut',
                data: {
                    labels: overviewRole.labels,
                    datasets: [{
                        data: overviewRole.data,
                        backgroundColor: ['#102532', '#0aa889', '#2f7eea', '#dc8e2f'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                boxWidth: 10,
                                usePointStyle: true
                            }
                        }
                    }
                }
            });
        }

        if (overviewContent) {
            createChart('overviewContentChart', {
                type: 'bar',
                data: {
                    labels: overviewContent.labels,
                    datasets: [{
                        label: 'Courses',
                        data: overviewContent.data,
                        backgroundColor: 'rgba(47, 126, 234, 0.78)',
                        borderRadius: 10,
                        maxBarThickness: 44
                    }]
                },
                options: chartOptions({ yTitle: 'Courses' })
            });
        }
    }

    function renderTrafficCharts(charts) {
        if (!charts?.trafficTrend) return;

        createChart('trafficTrendChart', {
            type: 'line',
            data: {
                labels: charts.trafficTrend.labels,
                datasets: [
                    {
                        label: 'Visits',
                        data: charts.trafficTrend.visits,
                        borderColor: '#0aa889',
                        backgroundColor: 'rgba(10, 168, 137, 0.1)',
                        borderWidth: 2,
                        tension: 0.32,
                        fill: true
                    },
                    {
                        label: 'Study minutes',
                        data: charts.trafficTrend.minutes,
                        borderColor: '#2f7eea',
                        borderWidth: 2,
                        tension: 0.32
                    },
                    {
                        label: 'New users',
                        data: charts.trafficTrend.newUsers,
                        borderColor: '#dc8e2f',
                        borderWidth: 2,
                        tension: 0.32
                    }
                ]
            },
            options: chartOptions({ yTitle: 'Signals' })
        });
    }

    function chartOptions(options) {
        return {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        boxWidth: 12,
                        usePointStyle: true
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    }
                },
                y: {
                    beginAtZero: true,
                    title: {
                        display: !!options?.yTitle,
                        text: options?.yTitle || ''
                    }
                }
            }
        };
    }

    async function confirmAction(message, buttonLabel) {
        if (typeof Swal === 'undefined') {
            return window.confirm(message);
        }

        const result = await Swal.fire({
            title: 'Xác nhận thao tác',
            text: message,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: buttonLabel || 'Tiếp tục',
            cancelButtonText: 'Hủy',
            confirmButtonColor: '#d14b57',
            reverseButtons: true
        });

        return result.isConfirmed;
    }

    function wireConfirmForms() {
        document.querySelectorAll('form[data-confirm]').forEach((form) => {
            form.addEventListener('submit', async (event) => {
                if (form.dataset.confirmed === 'true') return;

                event.preventDefault();
                const submitter = event.submitter;
                const buttonLabel = submitter ? submitter.textContent.trim() : 'Tiếp tục';
                const confirmed = await confirmAction(form.dataset.confirm || 'Bạn có chắc muốn tiếp tục?', buttonLabel);

                if (!confirmed) return;
                form.dataset.confirmed = 'true';
                form.submit();
            });
        });
    }

    function wireDisabledPagination() {
        document.querySelectorAll('.admin-page-btn.is-disabled').forEach((link) => {
            link.addEventListener('click', (event) => {
                event.preventDefault();
            });
        });
    }

    function init() {
        if (typeof Chart !== 'undefined') {
            Chart.defaults.font.family = '"Be Vietnam Pro", sans-serif';
            Chart.defaults.color = '#5d6f7b';
            Chart.defaults.borderColor = 'rgba(18, 35, 48, 0.08)';
        }

        const data = readPageData();
        renderOverviewCharts(data.charts || {});
        renderTrafficCharts(data.charts || {});
        wireConfirmForms();
        wireDisabledPagination();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
