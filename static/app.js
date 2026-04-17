document.addEventListener('DOMContentLoaded', () => {
    console.log('Tablero Electoral v1.1.0 Cargado (Smart Search)');
    
    // Limpiar Service Workers
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
            for (let registration of registrations) {
                registration.unregister();
            }
        });
    }

    const corpSelect = document.getElementById('corpSelect');
    const munSelect = document.getElementById('munSelect');
    const candidateInput = document.getElementById('candidateInput');
    const candidateDropdown = document.getElementById('candidateDropdown');
    const searchBtn = document.getElementById('searchBtn');
    const resultsSection = document.getElementById('resultsSection');
    const resultsHeader = document.getElementById('resultsHeader');
    const resultsBody = document.getElementById('resultsBody');
    const selectedCandidateName = document.getElementById('selectedCandidateName');
    const totalVotes = document.getElementById('totalVotes');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const exportBtn = document.getElementById('exportBtn');

    let allCandidates = []; // Cache local para filtrado instantáneo
    let currentData = null; // Almacenará los resultados actuales para exportación
    let currentName = '';   // Nombre del candidato actual

    async function loadConfig() {
        showLoading(true);
        try {
            const response = await fetch('/api/config');
            const data = await response.json();
            
            data.corporaciones.forEach(corp => {
                const opt = document.createElement('option');
                opt.value = corp;
                opt.textContent = corp;
                corpSelect.appendChild(opt);
            });

            data.municipios.forEach(mun => {
                const opt = document.createElement('option');
                opt.value = mun;
                opt.textContent = mun;
                munSelect.appendChild(opt);
            });
        } catch (error) {
            console.error('Error al cargar config:', error);
        } finally {
            showLoading(false);
        }
    }

    async function updateCandidateList() {
        const corp = corpSelect.value;
        const mun = munSelect.value;
        
        candidateInput.value = '';
        candidateInput.placeholder = 'Cargando candidatos...';
        allCandidates = [];
        renderDropdown([]);

        try {
            const url = `/api/candidates?corp=${encodeURIComponent(corp)}&mun=${encodeURIComponent(mun)}`;
            const response = await fetch(url);
            const candidates = await response.json();
            
            allCandidates = candidates;
            candidateInput.placeholder = 'Escriba o elija del menú...';
            renderDropdown(allCandidates);
        } catch (error) {
            console.error('Error cargando candidatos:', error);
            candidateInput.placeholder = 'Error al cargar';
        }
    }

    function renderDropdown(list) {
        candidateDropdown.innerHTML = '';
        if (list.length === 0) {
            const div = document.createElement('div');
            div.className = 'dropdown-item no-results';
            div.textContent = 'No se encontraron candidatos';
            candidateDropdown.appendChild(div);
            return;
        }

        list.forEach(name => {
            const div = document.createElement('div');
            div.className = 'dropdown-item';
            div.textContent = name;
            div.addEventListener('mousedown', (e) => {
                // Usamos mousedown para que ocurra antes del blur del input
                selectCandidate(name);
            });
            candidateDropdown.appendChild(div);
        });
    }

    function filterCandidates(text) {
        const query = text.toUpperCase();
        const items = candidateDropdown.querySelectorAll('.dropdown-item:not(.no-results)');
        let visibleCount = 0;

        items.forEach(item => {
            if (item.textContent.toUpperCase().includes(query)) {
                item.style.display = 'block';
                visibleCount++;
            } else {
                item.style.display = 'none';
            }
        });

        // Manejar mensaje de no resultados
        let noResMsg = candidateDropdown.querySelector('.no-results');
        if (visibleCount === 0) {
            if (!noResMsg) {
                noResMsg = document.createElement('div');
                noResMsg.className = 'dropdown-item no-results';
                noResMsg.textContent = 'No coincide ningún nombre';
                candidateDropdown.appendChild(noResMsg);
            } else {
                noResMsg.style.display = 'block';
            }
        } else if (noResMsg) {
            noResMsg.style.display = 'none';
        }
    }

    function selectCandidate(name) {
        candidateInput.value = name;
        candidateDropdown.classList.add('hidden');
    }

    // Eventos del Buscador Inteligente
    candidateInput.addEventListener('focus', () => {
        if (allCandidates.length > 0) {
            candidateDropdown.classList.remove('hidden');
        }
    });

    candidateInput.addEventListener('input', (e) => {
        candidateDropdown.classList.remove('hidden');
        filterCandidates(e.target.value);
    });

    candidateInput.addEventListener('blur', () => {
        // Pequeño timeout para permitir clicks en el dropdown
        setTimeout(() => {
            candidateDropdown.classList.add('hidden');
        }, 200);
    });

    [corpSelect, munSelect].forEach(filter => {
        filter.addEventListener('change', () => {
            resultsSection.classList.add('hidden');
            updateCandidateList();
        });
    });

    searchBtn.addEventListener('click', () => {
        const name = candidateInput.value.trim();
        if (!name) {
            alert('Por favor elija un candidato.');
            return;
        }
        loadResults(name.toUpperCase());
    });

    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            if (!currentData || currentData.length === 0) {
                alert('No hay datos para exportar.');
                return;
            }
            exportToExcel();
        });
    }

    function exportToExcel() {
        try {
            // 1. Preparar estructura idéntica a la tabla pivot
            const mesasSet = new Set();
            const puestosMap = {};
            currentData.forEach(row => {
                const mesa = parseInt(row.MESA);
                mesasSet.add(mesa);
                if (!puestosMap[row.PUESNOMBRE]) {
                    puestosMap[row.PUESNOMBRE] = { total: 0, mesas: {} };
                }
                puestosMap[row.PUESNOMBRE].mesas[mesa] = row.VOTOS;
                puestosMap[row.PUESNOMBRE].total += row.VOTOS;
            });

            const sortedMesas = Array.from(mesasSet).sort((a, b) => a - b);
            const sortedPuestos = Object.keys(puestosMap).sort();

            // 2. Crear cabecera (Array de arrays para SheetJS)
            const headers = ['#', 'Puesto de Votacion'];
            sortedMesas.forEach(m => headers.push(`MESA ${m}`));
            headers.push('TOTAL');

            const dataRows = [headers];

            // 3. Crear filas de datos
            sortedPuestos.forEach((puestoName, idx) => {
                const p = puestosMap[puestoName];
                const row = [idx + 1, puestoName];
                sortedMesas.forEach(m => {
                    row.push(p.mesas[m] || 0);
                });
                row.push(p.total);
                dataRows.push(row);
            });

            // 4. Generar Libro de Excel
            const worksheet = XLSX.utils.aoa_to_sheet(dataRows);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Resultados");

            // 5. Descargar
            const cleanName = currentName.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
            const mun = munSelect.value || 'General';
            XLSX.writeFile(workbook, `Resultados_${cleanName}_${mun}.xlsx`);

        } catch (error) {
            console.error('Error al exportar:', error);
            alert('Ocurrió un error al generar el archivo de Excel.');
        }
    }

    async function loadResults(candidateName) {
        showLoading(true);
        const corp = corpSelect.value;
        const mun = munSelect.value;

        try {
            const url = `/api/results?candidate=${encodeURIComponent(candidateName)}&corp=${encodeURIComponent(corp)}&mun=${encodeURIComponent(mun)}`;
            const response = await fetch(url);
            const results = await response.json();
            
            currentData = results; // Guardar para exportar
            currentName = candidateName;
            renderPivotTable(candidateName, results);
        } catch (error) {
            console.error('Error cargando resultados:', error);
            alert('Error al obtener los resultados.');
        } finally {
            showLoading(false);
        }
    }

    function renderPivotTable(name, results) {
        selectedCandidateName.textContent = name;
        
        if (results.length === 0) {
            resultsHeader.innerHTML = '';
            resultsBody.innerHTML = '<tr><td style="text-align:center">No se encontraron votos para los filtros seleccionados.</td></tr>';
            totalVotes.textContent = '0';
        } else {
            const mesasSet = new Set();
            const puestosMap = {};
            let grandTotal = 0;

            results.forEach(row => {
                const mesa = parseInt(row.MESA);
                mesasSet.add(mesa);
                if (!puestosMap[row.PUESNOMBRE]) {
                    puestosMap[row.PUESNOMBRE] = { total: 0, mesas: {} };
                }
                puestosMap[row.PUESNOMBRE].mesas[mesa] = row.VOTOS;
                puestosMap[row.PUESNOMBRE].total += row.VOTOS;
                grandTotal += row.VOTOS;
            });

            const sortedMesas = Array.from(mesasSet).sort((a, b) => a - b);
            const sortedPuestos = Object.keys(puestosMap).sort();

            let headerHtml = '<tr><th class="col-index">#</th><th>Puesto de Votacion</th>';
            sortedMesas.forEach(m => {
                headerHtml += `<th>Mesa ${m}</th>`;
            });
            headerHtml += '<th>Total</th></tr>';
            resultsHeader.innerHTML = headerHtml;

            const rowsHtml = [];
            sortedPuestos.forEach((puestoName, index) => {
                const puestoData = puestosMap[puestoName];
                let rowHtml = `<tr><td class="col-index">${index + 1}</td><td>${puestoName}</td>`;
                sortedMesas.forEach(m => {
                    const votos = puestoData.mesas[m] || 0;
                    rowHtml += `<td>${votos > 0 ? votos.toLocaleString() : '-'}</td>`;
                });
                rowHtml += `<td>${puestoData.total.toLocaleString()}</td></tr>`;
                rowsHtml.push(rowHtml);
            });

            resultsBody.innerHTML = rowsHtml.join('');
            totalVotes.textContent = grandTotal.toLocaleString();
        }
        resultsSection.classList.remove('hidden');
    }

    function showLoading(show) {
        if (show) loadingOverlay.classList.remove('hidden');
        else loadingOverlay.classList.add('hidden');
    }

    loadConfig();
});
