document.addEventListener('DOMContentLoaded', function() {
    const seedsList = document.getElementById('seeds-list');
    const refreshBtn = document.getElementById('refresh-seeds');
    const addBtn = document.getElementById('add-seed');

    function loadSeeds() {
        fetch('/seeds/api/list')
            .then(res => res.json())
            .then(data => {
                seedsList.innerHTML = '<ul>' + data.map(seed =>
                    `<li>${seed.name} <button data-id="${seed._id}" class="delete-seed">Delete</button></li>`
                ).join('') + '</ul>';
            });
    }

    refreshBtn.addEventListener('click', loadSeeds);

    addBtn.addEventListener('click', function() {
        const name = prompt('Enter new seed name:');
        if (name) {
            fetch('/seeds/api/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            }).then(loadSeeds);
        }
    });

    seedsList.addEventListener('click', function(e) {
        if (e.target.classList.contains('delete-seed')) {
            const id = e.target.getAttribute('data-id');
            fetch('/seeds/api/delete/' + id, { method: 'DELETE' })
                .then(loadSeeds);
        }
    });

    loadSeeds();
});
