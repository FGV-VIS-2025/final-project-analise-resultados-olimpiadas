<script>
    import { onMount } from 'svelte';
    import * as d3 from 'd3';
    import { page } from '$app/stores';
    import { base } from '$app/paths';

    let csvUrl = `${base}/df_all.csv`;
    let rawData = [];
    let athleteName = '';
    let filteredAthleteData = [];
    let athleteSports = [];
    let allAthleteNames = []; // For autocomplete suggestions
    let suggestions = [];
    let showSuggestions = false;

    let svgRef, chartContainerRef, ro;
    const margin = { top: 60, right: 50, bottom: 60, left: 60 };
    const chartHeight = 500;
    let chartWidth = 600;

    let xScale, yScale, colorScale;

    // Hover state
    let hoverVisible = false;
    let hoverData = { sport: '', year: 0, value: 0, country: '', photo: '', flag: '' };
    const cache = new Map();

    // Get athlete name from URL query parameter
    $: {
        const urlParams = $page.url.searchParams;
        if (urlParams.has('athlete')) {
            athleteName = decodeURIComponent(urlParams.get('athlete'));
        }
    }

    onMount(async () => {
        rawData = await d3.csv(csvUrl);
        // Extract all unique athlete names for autocomplete
        allAthleteNames = [...new Set(rawData.map(d => d.athlete_full_name).filter(Boolean))].sort();
        
        updateWidth();
        if (typeof ResizeObserver !== 'undefined') {
            ro = new ResizeObserver(updateWidth);
            ro.observe(chartContainerRef);
        }
        filterAndDrawAthleteData();
    });

    $: {
        // Update suggestions when athleteName changes
        if (athleteName) {
            suggestions = allAthleteNames.filter(name => 
                name.toLowerCase().includes(athleteName.toLowerCase())
            ).slice(0, 5); // Limit to 5 suggestions
        } else {
            suggestions = [];
        }
    }

    $: athleteName, rawData, rawData.length && filterAndDrawAthleteData();

    function updateWidth() {
        if (!chartContainerRef) return;
        const w = chartContainerRef.clientWidth;
        chartWidth = Math.max(300, w - margin.left - margin.right);
        drawAthleteGraph();
    }

    async function fetchAthleteMedia(athleteUrl) {
        if (!athleteUrl) return { photo: '', flag: '' };
        
        if (cache.has(athleteUrl)) {
            return cache.get(athleteUrl);
        }

        try {
            const html = await (await fetch(athleteUrl)).text();
            const d = new DOMParser().parseFromString(html, 'text/html');
            const media = {
                photo: d.querySelector('section picture img')?.src || '',
                flag: d.querySelector('section img[alt][src*="noc"]')?.src || ''
            };
            cache.set(athleteUrl, media);
            return media;
        } catch (e) {
            console.error('Error fetching athlete media:', e);
            cache.set(athleteUrl, { photo: '', flag: '' });
            return { photo: '', flag: '' };
        }
    }

    function resetSearch() {
        athleteName = '';
        if ($page.url.searchParams.has('athlete')) {
            $page.url.searchParams.delete('athlete');
            $page.url.search = $page.url.searchParams.toString();
        }
        filteredAthleteData = [];
        athleteSports = [];
        hoverVisible = false;
        showSuggestions = false;
        drawAthleteGraph();
    }

    async function filterAndDrawAthleteData() {
        if (!athleteName) {
            filteredAthleteData = [];
            athleteSports = [];
            drawAthleteGraph();
            return;
        }

        filteredAthleteData = rawData.filter(d =>
            d.athlete_full_name && d.athlete_full_name.toLowerCase() === athleteName.toLowerCase() && !isNaN(+d.value_unit)
        ).sort((a, b) => +a.ano - +b.ano);

        athleteSports = [...new Set(filteredAthleteData.map(d => d.event_title))].sort((a, b) => a.localeCompare(b));

        drawAthleteGraph();
    }

    function selectSuggestion(name) {
        athleteName = name;
        showSuggestions = false;
        // Update URL with selected athlete
        $page.url.searchParams.set('athlete', encodeURIComponent(name));
        $page.url.search = $page.url.searchParams.toString();
        filterAndDrawAthleteData();
    }

    async function showHover(d) {
        const { photo, flag } = await fetchAthleteMedia(d.raw.athlete_url);
        hoverData = {
            sport: d.raw.event_title,
            year: d.year,
            value: d.val,
            country: d.raw.country_name,
            photo: photo,
            flag: flag
        };
        hoverVisible = true;
    }

    function hideHover() {
        hoverVisible = false;
    }

    function drawAthleteGraph() {
        if (!svgRef) return;

        const svg = d3.select(svgRef)
            .attr('width', chartWidth + margin.left + margin.right)
            .attr('height', chartHeight);
        svg.selectAll('*').remove();

        if (!filteredAthleteData.length) {
            svg.append('text')
                .attr('x', (chartWidth + margin.left + margin.right) / 2)
                .attr('y', chartHeight / 2)
                .attr('text-anchor', 'middle')
                .text(athleteName ? 'Nenhum dado encontrado para este atleta.' : 'Selecione um atleta.');
            return;
        }

        const allYears = filteredAthleteData.map(d => +d.ano);
        const allValues = filteredAthleteData.map(d => +d.value_unit);

        // Calculate nice rounded values for axis ticks
        const yearExtent = d3.extent(allYears);
        xScale = d3.scaleLinear()
            .domain([Math.floor(yearExtent[0] / 4) * 4, Math.ceil(yearExtent[1] / 4) * 4])
            .range([margin.left, margin.left + chartWidth]);

        // Calculate nice y-axis domain
        const valueExtent = d3.extent(allValues);
        const yPadding = (valueExtent[1] - valueExtent[0]) * 0.1;
        yScale = d3.scaleLinear()
            .domain([Math.max(0, valueExtent[0] - yPadding), valueExtent[1] + yPadding])
            .range([chartHeight - margin.bottom, margin.top]);

        colorScale = d3.scaleOrdinal()
            .domain(athleteSports)
            .range(d3.quantize(t => d3.interpolateRainbow(t * 0.8 + 0.1), Math.max(10, athleteSports.length)));

        const line = d3.line()
            .x(d => xScale(d.year))
            .y(d => yScale(d.val));

        const dataBySport = d3.group(filteredAthleteData, d => d.event_title);

        // Add chart title
        svg.append('text')
            .attr('x', (chartWidth + margin.left + margin.right) / 2)
            .attr('y', 30)
            .attr('text-anchor', 'middle')
            .attr('font-size', '20px')
            .text(`Resultados de ${athleteName}`);

        dataBySport.forEach((rows, sportTitle) => {
            const series = rows.map(r => ({
                year: +r.ano,
                val: +r.value_unit,
                raw: r,
                sport: sportTitle
            })).sort((a, b) => a.year - b.year);

            // Draw line
            svg.append('path').datum(series)
                .attr('fill', 'none')
                .attr('stroke', colorScale(sportTitle))
                .attr('stroke-width', 2)
                .attr('d', line);

            // Draw points
            svg.selectAll(null).data(series).enter().append('circle')
                .attr('cx', d => xScale(d.year))
                .attr('cy', d => yScale(d.val))
                .attr('r', 4)
                .attr('fill', colorScale(sportTitle))
                .attr('stroke', 'white')
                .attr('stroke-width', 1)
                .on('mouseenter', function(_, d) {
                    d3.select(this).attr('r', 6);
                    showHover(d);
                })
                .on('mouseleave', function() {
                    d3.select(this).attr('r', 4);
                    hideHover();
                });
        });

        // Create axes
        const xAxis = d3.axisBottom(xScale).tickFormat(d3.format('d'));
        const yAxis = d3.axisLeft(yScale)
            .tickFormat(d => {
                const maxVal = d3.max(allValues);
                if (maxVal > 1000) return d3.format('.1s')(d);
                if (maxVal > 100) return d3.format('.0f')(d);
                if (maxVal > 10) return d3.format('.1f')(d);
                return d3.format('.2f')(d);
            });

        // Add X axis with grid
        svg.append('g')
            .attr('class', 'x-axis')
            .attr('transform', `translate(0,${chartHeight - margin.bottom})`)
            .call(xAxis)
            .call(g => g.select('.domain').attr('stroke', '#ccc'))
            .call(g => g.selectAll('.tick line').clone()
                .attr('y2', -chartHeight + margin.top + margin.bottom)
                .attr('stroke-opacity', 0.1));

        // Add Y axis with grid
        svg.append('g')
            .attr('class', 'y-axis')
            .attr('transform', `translate(${margin.left},0)`)
            .call(yAxis)
            .call(g => g.select('.domain').attr('stroke', '#ccc'))
            .call(g => g.selectAll('.tick line').clone()
                .attr('x2', chartWidth)
                .attr('stroke-opacity', 0.1));

        // Axis labels
        svg.append('text')
            .attr('class', 'axis-label')
            .attr('x', margin.left + (chartWidth / 2))
            .attr('y', chartHeight - (margin.bottom / 3))
            .attr('text-anchor', 'middle')
            .text('Ano');

        svg.append('text')
            .attr('class', 'axis-label')
            .attr('transform', 'rotate(-90)')
            .attr('y', margin.left / 3 - 10)
            .attr('x', -(chartHeight / 2))
            .attr('text-anchor', 'middle')
            .text('Valor do Resultado');
    }
</script>

<svelte:head>
    <title>Detalhes do Atleta</title>
</svelte:head>

<div class="page">
    <div class="title">
        <h1>Detalhes do Atleta: {athleteName || 'Buscar Atleta'}</h1>
    </div>

    <div class="controls-container">
        <div class="controls">
            <div class="search-container">
                <input 
                    type="text" 
                    bind:value={athleteName}
                    on:input={() => showSuggestions = true}
                    on:blur={() => setTimeout(() => showSuggestions = false, 200)}
                    placeholder="Buscar atleta…">
                
                {#if showSuggestions && suggestions.length > 0}
                    <div class="suggestions-dropdown">
                        {#each suggestions as suggestion}
                            <div 
                                class="suggestion-item"
                                on:mousedown={() => selectSuggestion(suggestion)}>
                                {suggestion}
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
            
            <button on:click={() => {
                if (athleteName) {
                    $page.url.searchParams.set('athlete', encodeURIComponent(athleteName));
                    $page.url.search = $page.url.searchParams.toString();
                    filterAndDrawAthleteData();
                }
            }}>Buscar</button>
            
            <button class="reset-button" on:click={resetSearch}>
                Limpar
            </button>
        </div>
    </div>

    <div class="dashboard">
        <div class="chart-container" bind:this={chartContainerRef}>
            <svg bind:this={svgRef}></svg>
        </div>

        <aside class="hover-card">
            {#if hoverVisible}
                <h3>Resultado do Atleta</h3>
                <p><b>Evento:</b> {hoverData.sport}</p>
                <p><b>Ano:</b> {hoverData.year}</p>
                {#if hoverData.photo}
                    <img class="ath-img" src={hoverData.photo} alt={athleteName}/>
                {/if}
                <p><b>País:</b> {hoverData.country}
                    {#if hoverData.flag}
                        <img class="flag" src={hoverData.flag} alt={hoverData.country}/>
                    {/if}
                </p>
                <p><b>Resultado:</b> {hoverData.value}</p>
            {:else}
                <p>Passe o mouse sobre um ponto para ver os detalhes do resultado.</p>
            {/if}
        </aside>
    </div>

    <aside class="legend">
        {#each athleteSports as sport}
            <div class="legend-item">
                <span class="swatch" style="background:{colorScale(sport)}"></span>{sport}
            </div>
        {/each}
    </aside>
</div>

<style>
    :global(:root) {
        --grid: #e0e0e0;
        --text: #333;
        --primary: #1a73e8;
        --primary-light: #4d94ff;
        --card: #ffffff;
        --radius: 8px;
        --shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    }

    .page {
        max-width: 1380px;
        margin: auto;
        padding: 2rem 1rem;
        background: #f8f9fa;
        border-radius: var(--radius);
        box-shadow: var(--shadow);
    }

    .title h1 {
        font-weight: 600;
        color: var(--primary);
        margin: .2em 0;
        text-align: center;
        font-family: Poppins, sans-serif;
    }

    .controls-container {
        display: flex;
        justify-content: center;
        margin: 1.5rem 0;
    }

    .controls {
        display: flex;
        gap: 15px;
        max-width: 800px;
        width: 100%;
        flex-wrap: wrap;
        align-items: center;
        position: relative;
    }

    .search-container {
        position: relative;
        flex: 1;
    }

    .controls input {
        padding: .6rem .8rem;
        font-size: .9rem;
        border: 1px solid #ccc;
        border-radius: var(--radius);
        font-family: Poppins, sans-serif;
        width: 100%;
        box-sizing: border-box;
    }

    .suggestions-dropdown {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: white;
        border: 1px solid #ddd;
        border-radius: var(--radius);
        box-shadow: var(--shadow);
        z-index: 10;
        margin-top: 5px;
        max-height: 200px;
        overflow-y: auto;
    }

    .suggestion-item {
        padding: 8px 12px;
        cursor: pointer;
        font-size: 0.9rem;
        border-bottom: 1px solid #f0f0f0;
        transition: background 0.2s;
    }

    .suggestion-item:hover {
        background-color: var(--primary-light);
        color: white;
    }

    .suggestion-item:last-child {
        border-bottom: none;
    }

    .controls button {
        padding: .6rem 1rem;
        font-size: .9rem;
        border: none;
        border-radius: var(--radius);
        cursor: pointer;
        transition: background .2s;
        font-weight: 500;
        font-family: Poppins, sans-serif;
    }

    .controls > button:not(.reset-button) {
        background: var(--primary);
        color: #fff;
    }

    .controls > button:not(.reset-button):hover {
        background: #0d5cb6;
    }

    .reset-button {
        background: #f44336;
        color: white;
    }

    .reset-button:hover {
        background: #d32f2f;
    }

    .dashboard {
        display: grid;
        grid-template-columns: 1fr 250px;
        gap: 1rem;
        margin-top: 1rem;
    }

    .chart-container {
        min-width: 0;
        background: white;
        border-radius: var(--radius);
        padding: 10px;
        box-shadow: var(--shadow);
    }

    .chart-container svg {
        width: 100%;
        height: 500px;
        display: block;
    }

    .hover-card {
        background: var(--card);
        padding: 1rem;
        border-radius: var(--radius);
        box-shadow: var(--shadow);
        font-size: 0.8rem;
        height: fit-content;
        font-family: Poppins, sans-serif;
    }

    .legend {
        grid-column: 1 / span 2;
        max-height: 200px;
        overflow-y: auto;
        padding: 1rem;
        border-radius: var(--radius);
        background: var(--card);
        margin-top: 1rem;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 10px;
        box-shadow: var(--shadow);
    }

    .legend-item {
        display: flex;
        align-items: center;
        margin-bottom: 6px;
        font-size: 0.75rem;
        white-space: normal;
        font-family: Poppins, sans-serif;
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

    /* Fix for axis styling */
    .x-axis path, .x-axis line,
    .y-axis path, .y-axis line {
        stroke: var(--grid);
        stroke-width: 1;
        shape-rendering: crispEdges;
    }

    .x-axis text, .y-axis text {
        fill: var(--text);
        font-size: 0.75rem;
        font-family: Poppins, sans-serif;
    }

    .axis-label {
        fill: var(--text);
        font-size: 0.9rem;
        font-family: Poppins, sans-serif;
    }

    @media (max-width: 768px) {
        .dashboard {
            grid-template-columns: 1fr;
        }
        
        .controls {
            flex-direction: column;
        }
        
        .search-container {
            width: 100%;
        }
        
        .controls button {
            width: 100%;
        }
        
        .hover-card {
            order: 1;
        }
        
        .chart-container {
            order: 2;
        }
        
        .legend {
            order: 3;
        }
    }
</style>