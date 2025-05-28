<script>
    import { onMount, onDestroy } from 'svelte';
    import * as d3 from 'd3';
    import { goto } from '$app/navigation'; // Import goto for navigation

    export let csvUrl;
    export let measure = '';
    export let searchQuery = '';
    export let valueTypes = [];
    export let yMin = '';
    export let yMax = '';
    export let selectedEvent = null; // Renamed from activeEvent for consistency

    const margin = { top: 60, right: 50, bottom: 60, left: 60 };
    const chartHeight = 500;
    let chartWidth = 600;

    let svgRef, chartContainerRef, ro;

    let rawData = [], filtered = [], groups = [], legend = [];
    let xScale, yScale, color;

    let hoverVisible = false;
    let hover = { sport: '', athlete: '', year: 0, value: 0, country: '', photo: '', flag: '' };
    const cache = new Map();

    // New state for the pinned hover card data
    let pinnedHoverData = null;
    let isHoverPinned = false; // Flag to indicate if the hover card is currently pinned

    let introYear, recordRow, recAth, recVal, recYear;
    let recPhoto = '', recFlag = '';

    /* mount */
    onMount(async () => {
        rawData = await d3.csv(csvUrl);
        valueTypes = [...new Set(rawData.map(d => d.value_type))].filter(Boolean);
        if (!measure && valueTypes.length) measure = valueTypes[0];

        updateWidth();
        if (typeof ResizeObserver !== 'undefined') {
            ro = new ResizeObserver(updateWidth);
            ro.observe(chartContainerRef);
        }
        filterData();
    });
    onDestroy(() => ro?.disconnect());

    $: { rawData; measure; searchQuery; yMin; yMax; rawData.length && filterData(); }
    $: selectedEvent, calcInfo(); // calcInfo is now reactive to selectedEvent only

    /* auxiliares */
    function updateWidth() {
        if (!chartContainerRef) return;
        const w = chartContainerRef.clientWidth;
        chartWidth = Math.max(300, w - margin.left - margin.right);
        draw();
    }

    function calculateInitialYRange() {
        const allValues = filtered.map(d => +d.value_unit);
        return {
            min: d3.min(allValues),
            max: d3.max(allValues)
        };
    }

    function filterData() {
        filtered = rawData.filter(r =>
            r.medal_type === 'GOLD' &&
            !isNaN(+r.value_unit) &&
            (!measure || r.value_type === measure)
        );

        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            filtered = filtered.filter(r => r.event_title.toLowerCase().includes(q));
        }

        const initialRange = calculateInitialYRange();
        if (!yMin && !yMax) {
            yMin = initialRange.min;
            yMax = initialRange.max;
        }

        groups = Array.from(d3.group(filtered, r => r.event_title));

        const yMinNum = Number(yMin);
        const yMaxNum = Number(yMax);
        if (!isNaN(yMinNum) && !isNaN(yMaxNum) && yMinNum <= yMaxNum) {
            groups = groups.filter(([ev, rows]) => {
                const values = rows.map(r => +r.value_unit);
                return d3.min(values) <= yMaxNum && d3.max(values) >= yMinNum;
            });
        }

        legend = groups.map(([ev]) => ev).sort((a, b) => a.localeCompare(b));
        color = d3.scaleOrdinal().domain(legend).range(d3.quantize(t => d3.interpolateRainbow(t * 0.8 + 0.1), Math.max(10, legend.length)));

        draw();
    }

    function selectEvent(ev) {
        selectedEvent = selectedEvent === ev ? null : ev; // Toggles selection
        // When event is selected/deselected, unpin any active hover
        pinnedHoverData = null;
        isHoverPinned = false;
        hoverVisible = false;
        draw(); // Redraws to update line opacities etc.
    }

    // Helper function to fetch photo and flag for an athlete
    async function fetchAthleteMedia(athleteUrl, athleteLink) {
        const k = athleteUrl || athleteLink || '';
        if (!k) return { photo: '', flag: '' };

        if (cache.has(k)) {
            return cache.get(k);
        }

        try {
            const html = await (await fetch(k)).text();
            const d = new DOMParser().parseFromString(html, 'text/html');
            const media = {
                photo: d.querySelector('section picture img')?.src || '',
                flag: d.querySelector('section img[alt][src*="noc"]')?.src || ''
            };
            cache.set(k, media);
            return media;
        } catch (e) {
            console.error('Error fetching athlete media:', e);
            cache.set(k, { photo: '', flag: '' });
            return { photo: '', flag: '' };
        }
    }

    async function calcInfo() {
        if (!selectedEvent) {
            introYear = null;
            recordRow = null;
            recAth = '';
            recVal = '';
            recYear = '';
            recPhoto = '';
            recFlag = '';
            return;
        }
        const rows = rawData.filter(r => r.event_title === selectedEvent && r.medal_type === 'GOLD');
        introYear = d3.min(rows, r => +r.ano);
        recordRow = measure === 'TIME'
            ? rows.reduce((a, b) => +b.value_unit < +a.value_unit ? b : a)
            : rows.reduce((a, b) => +b.value_unit > +a.value_unit ? b : a);

        recAth = recordRow.athlete_full_name;
        recVal = recordRow.value_unit;
        recYear = recordRow.ano;

        const { photo, flag } = await fetchAthleteMedia(recordRow.athlete_url, recordRow.athlete_link);
        recPhoto = photo;
        recFlag = flag;
    }

    async function showHover(row) {
        // If hover is already pinned, don't show temporary hover
        if (isHoverPinned) return;

        hover = {
            sport: row.event, athlete: row.raw.athlete_full_name,
            year: row.year, value: row.val, country: row.raw.country_name,
            photo: '', flag: ''
        };
        const { photo, flag } = await fetchAthleteMedia(row.raw.athlete_url, row.raw.athlete_link);
        hover.photo = photo;
        hover.flag = flag;
        hoverVisible = true;
    }

    const hideHover = () => {
        if (!isHoverPinned) { // Only hide if not pinned
            hoverVisible = false;
        }
    };

    const resetAll = () => {
        selectedEvent = null;
        pinnedHoverData = null; // Clear pinned hover data
        isHoverPinned = false;  // Unpin the hover
        hoverVisible = false;   // Hide temporary hover
        draw();
    };

    function draw() {
        if (!svgRef) return;

        const svg = d3.select(svgRef)
            .attr('width', chartWidth + margin.left + margin.right)
            .attr('height', chartHeight);
        svg.selectAll('*').remove();

        const useGroups = groups;

        const allData = groups.flatMap(([, v]) => v);
        const vals = allData.map(d => +d.value_unit);
        const years = allData.map(d => +d.ano);

        if (!years.length) {
            svg.append('text')
                .attr('x', (chartWidth + margin.left + margin.right) / 2)
                .attr('y', chartHeight / 2)
                .attr('text-anchor', 'middle')
                .text('Sem dados');
            return;
        }

        xScale = d3.scaleLinear()
            .domain(d3.extent(years))
            .range([margin.left, margin.left + chartWidth]);

        const yMinNum = Number(yMin);
        const yMaxNum = Number(yMax);
        if (!isNaN(yMinNum) && !isNaN(yMaxNum) && yMinNum <= yMaxNum) {
            yScale = d3.scaleLinear()
                .domain([yMinNum, yMaxNum])
                .range([chartHeight - margin.bottom, margin.top]);
        } else {
            yScale = d3.scaleLinear()
                .domain([0, d3.max(vals)]).nice()
                .range([chartHeight - margin.bottom, margin.top]);
        }

        const line = d3.line()
            .x(d => xScale(d.year))
            .y(d => yScale(d.val));

        const measureLabels = {
            'TIME': 'Tempo (segundos)',
            'DISTANCE': 'Distância (metros)',
            'WEIGHT': 'Peso (kg)'
        };

        const measureLabel = measureLabels[measure] || measure;

        svg.append('text')
            .attr('x', (chartWidth + margin.left + margin.right) / 2)
            .attr('y', 30)
            .attr('text-anchor', 'middle')
            .attr('font-size', '20px')
            .text(`Resultados Olímpicos - ${measureLabel}`);

        useGroups.forEach(([ev, rows]) => {
            const filteredRows = rows.filter(r => {
                const val = +r.value_unit;
                if (isNaN(yMinNum) || isNaN(yMaxNum)) return true; // If yMin/yMax not numbers, don't filter
                return val >= yMinNum && val <= yMaxNum;
            });

            const series = filteredRows.map(r => ({
                year: +r.ano,
                val: +r.value_unit,
                raw: r,
                event: ev
            })).sort((a, b) => a.year - b.year);

            const path = svg.append('path').datum(series)
                .attr('fill', 'none')
                .attr('stroke', color(ev))
                .attr('stroke-width', 2)
                .style('opacity', selectedEvent ? (ev === selectedEvent ? 1 : 0.05) : 1)
                .attr('d', line)
                .attr('stroke-dasharray', function () {
                    return this.getTotalLength();
                })
                .attr('stroke-dashoffset', function () {
                    return this.getTotalLength();
                })
                .style('cursor', 'pointer')
                .on('click', e => { e.stopPropagation(); selectEvent(ev); }); // Line click to select event

            path.transition()
                .duration(1000)
                .ease(d3.easeLinear)
                .attr('stroke-dashoffset', 0);

            svg.selectAll(null).data(series).enter().append('circle')
                .attr('cx', d => xScale(d.year))
                .attr('cy', d => yScale(d.val))
                .attr('r', 0)
                .attr('fill', color(ev))
                .attr('stroke', color(ev))
                .attr('stroke-width', 2)
                .style('opacity', selectedEvent ? (ev === selectedEvent ? 1 : 0.05) : 1)
                .style('cursor', 'pointer')
                .on('mouseenter', function (_, d) {
                    d3.select(this)
                        .attr('r', 4);
                    showHover(d);
                })
                .on('mouseleave', function () {
                    d3.select(this)
                        .attr('r', 2);
                    hideHover();
                })
                .on('click', e => {
					e.stopPropagation();
					selectEvent(ev);
                    e.stopPropagation();
                    if (isHoverPinned && pinnedHoverData.athlete === hover.athlete && pinnedHoverData.year === hover.year) {
                        // If clicking the same pinned point, unpin it
                        pinnedHoverData = null;
                        isHoverPinned = false;
                        hoverVisible = false;
                    } else {
                        // Pin the current hover data
                        pinnedHoverData = { ...hover }; // Copy all properties from the current hover object
                        isHoverPinned = true;
                        hoverVisible = true; // Ensure hover card is visible when pinned
                    }
                })
                .transition()
                .delay((_, i) => i * (1000 / series.length))
                .duration(500)
                .attr('r', 2);
        });

        svg.append('g')
            .attr('transform', `translate(0,${chartHeight - margin.bottom})`)
            .call(d3.axisBottom(xScale).ticks(10).tickFormat(d3.format('d')));

        svg.append('text')
            .attr('x', margin.left + (chartWidth / 2))
            .attr('y', chartHeight - (margin.bottom / 3))
            .attr('text-anchor', 'middle')
            .attr('font-size', '14px')
            .text('Ano');

        svg.append('g')
            .attr('transform', `translate(${margin.left},0)`)
            .call(d3.axisLeft(yScale));

        svg.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('y', margin.left / 3 - 10)
            .attr('x', -(chartHeight / 2))
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .text(measureLabel);
    }

    // Function to navigate to athlete details page
    function goToAthleteDetails(athleteName) {
        goto(`/jogos?athlete=${encodeURIComponent(athleteName)}`);
    }
	
</script>

<div class="dashboard" on:click={resetAll}>
    <div class="cards-column">
        <aside class="info-card">
            {#if selectedEvent}
                <h2>{selectedEvent}</h2>
                <p><b>Introduzido em:</b> {introYear}</p>
                <p><b>Recorde mundial:</b> {recVal} ({measure.toLowerCase()})</p>
                <p><b>Atleta:</b> {recAth} – {recYear}</p>
                {#if recPhoto}<img class="ath-img" src={recPhoto} alt={recAth}/>{/if}
                <p><b>País:</b> {recordRow.country_name}
                    {#if recFlag}<img class="flag" src={recFlag} alt={recordRow.country_name}/>{/if}
                </p>
            {:else}
                <p>Clique na legenda ou no gráfico para ver detalhes de eventos.</p>
                <p>Passe o mouse sobre um ponto para ver o resultado temporariamente, ou clique para fixar o resultado do atleta.</p>
            {/if}
        </aside>

        <aside class="hover-card">
            {#if isHoverPinned && pinnedHoverData}
                <h3>Resultado do ponto (fixo)</h3>
                <p><b>{pinnedHoverData.sport}</b> – {pinnedHoverData.year}</p>
                {#if pinnedHoverData.photo}<img class="ath-img" src={pinnedHoverData.photo} alt={pinnedHoverData.athlete}/>{/if}
                <p><b>Atleta:</b> {pinnedHoverData.athlete}</p>
                <p><b>País:</b> {pinnedHoverData.country}
                    {#if pinnedHoverData.flag}<img class="flag" src={pinnedHoverData.flag} alt={pinnedHoverData.country}/>{/if}
                </p>
                <p><b>Resultado:</b> {pinnedHoverData.value}
                    {measure === 'TIME' ? ' s' : measure === 'DISTANCE' ? ' m' : measure === 'WEIGHT' ? ' kg' : ''}
                </p>
                <button on:click|stopPropagation={() => goToAthleteDetails(pinnedHoverData.athlete)}>
                    Ver Detalhes do Atleta
                </button>
            {:else if hoverVisible}
                <h3>Resultado do ponto</h3>
                <p><b>{hover.sport}</b> – {hover.year}</p>
                {#if hover.photo}<img class="ath-img" src={hover.photo} alt={hover.athlete}/>{/if}
                <p><b>Atleta:</b> {hover.athlete}</p>
                <p><b>País:</b> {hover.country}
                    {#if hover.flag}<img class="flag" src={hover.flag} alt={hover.country}/>{/if}
                </p>
                <p><b>Resultado:</b> {hover.value}
                    {measure === 'TIME' ? ' s' : measure === 'DISTANCE' ? ' m' : measure === 'WEIGHT' ? ' kg' : ''}
                </p>
            {:else}
                <p>Passe o mouse sobre um ponto para ver o resultado.</p>
            {/if}
        </aside>
    </div>

    <div class="chart-container" bind:this={chartContainerRef}>
        <svg bind:this={svgRef}></svg>
    </div>

    <aside class="legend">
        {#each legend as ev}
            <div class="legend-item" role="button" tabindex="0"
                 class:active={selectedEvent === ev}
                 on:click|stopPropagation={() => selectEvent(ev)}>
                <span class="swatch" style="background:{color(ev)}"></span>{ev}
            </div>
        {/each}
    </aside>
</div>

<style>
    .dashboard {
        display: grid;
        grid-template-columns: 200px 1fr 200px;
        grid-template-rows: 1fr 0 0;
        gap: 1rem;
        padding: 1rem;
        width: 100%;
        box-sizing: border-box;
    }

    .info-card,
    .hover-card {
        min-height: 250px;
        max-height: 300px;
        overflow-y: auto;
        font-size: 0.75rem;
    }

    .info-card,
    .hover-card {
        flex: 1 1 48%;
        overflow-y: auto;
        font-size: .70rem;
        padding: 1rem;
        border-radius: var(--radius);
        background: var(--card);
        box-shadow: 0 2px 10px rgba(0, 0, 0, .1);
    }

    .chart-container {
        grid-column: 2;
        grid-row: 1/span 3;
        min-width: 0;
    }

    .info-card, .hover-card, .chart-container, .legend {
        background: var(--card);
        padding: 1rem;
        border-radius: var(--radius);
        box-shadow: 0 2px 10px rgba(0, 0, 0, .1);
    }

    .chart-container svg {
        width: 100%;
        height: 500px;
    }

    .legend {
        max-height: 500px;
        overflow-y: auto;
    }

    .ath-img {
        width: 60px;
        border-radius: 6px;
        display: block;
        margin: .4rem 0;
    }

    .flag {
        width: 14px;
        height: 9px;
        margin-left: 3px;
        vertical-align: middle;
    }

    .legend-item {
        display: flex;
        align-items: center;
        margin-bottom: 6px;
        font-size: 0.75rem;
        cursor: pointer;
        border-radius: 4px;
        padding: 2px 4px;
        transition: background-color .2s, transform .2s;
        white-space: normal;
    }

    .legend-item:hover {
        background: rgba(0, 0, 0, .05);
    }

    .legend-item.active {
        background: rgba(212, 175, 55, .25);
        transform: scale(1.03);
    }

    .legend-item .swatch {
        width: 14px;
        height: 14px;
        border-radius: 3px;
        margin-right: 6px;
        flex-shrink: 0;
        display: inline-block;
        border: 1px solid rgba(0, 0, 0, 0.1);
    }

    .legend-item.active .swatch {
        transform: scale(1.3);
    }

    .chart-container svg text {
        font-family: Poppins, sans-serif;
    }

    .chart-container svg .tick line, .chart-container svg .domain {
        stroke: var(--grid);
    }

    .chart-container svg .tick text {
        font-size: .75rem;
    }

    .cards-column {
        grid-column: 1;
        grid-row: 1/span 3;
        display: flex;
        flex-direction: column;
        height: 500px;
        max-height: 500px;
        gap: .5rem;
    }

    /* Button styles for the new page link */
    .hover-card button { /* Apply to button inside hover-card */
        background: var(--primary); /* Assuming --primary is defined */
        color: #fff;
        padding: 0.5rem 1rem;
        border: none;
        border-radius: var(--radius);
        cursor: pointer;
        font-size: 0.8rem;
        margin-top: 1rem;
        transition: background-color 0.2s ease;
    }

    .hover-card button:hover {
        background: #00264d; /* A darker shade of primary for hover */
    }
</style>