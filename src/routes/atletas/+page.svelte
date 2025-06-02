<script>
    import { onMount } from 'svelte';
    import * as d3 from 'd3';
    import { page } from '$app/stores';
    import { base } from '$app/paths';

    let csvUrl = `${base}/df_all.csv`;
    let rawData = [];
    let athleteName1 = '';
    let athleteName2 = '';
    let filteredAthleteData1 = [];
    let filteredAthleteData2 = [];
    let athleteSports = [];
    let allAthleteNames = [];
    let suggestions1 = [];
    let suggestions2 = [];
    let showSuggestions1 = false;
    let showSuggestions2 = false;
    let secondAthleteOptions = [];

    let svgRef, chartContainerRef, ro;
    const margin = { top: 60, right: 50, bottom: 70, left: 60 };
    const chartHeight = 500;
    let chartWidth = 600;

    let xScale, yScale;
    const athleteColors = {
        athlete1: '#1f77b4',
        athlete2: '#ff7f0e'
    };

    let hoverVisible = false;
    let hoverData = { athlete: '', sport: '', year: 0, value: 0, country: '', photo: '', flag: '' };
    const cache = new Map();

    onMount(() => {
        const urlParams = $page.url.searchParams;
        if (urlParams.has('athlete1')) {
            athleteName1 = decodeURIComponent(urlParams.get('athlete1'));
        }
        if (urlParams.has('athlete2')) {
            athleteName2 = decodeURIComponent(urlParams.get('athlete2'));
        }
        filterAndDrawAthleteData();
    });


    onMount(async () => {
        rawData = await d3.csv(csvUrl);
        allAthleteNames = [...new Set(rawData.map(d => d.athlete_full_name).filter(Boolean))].sort();
        updateWidth();
        if (typeof ResizeObserver !== 'undefined') {
            ro = new ResizeObserver(updateWidth);
            ro.observe(chartContainerRef);
        }
        filterAndDrawAthleteData();
    });

    $: {
        if (athleteName1 && rawData.length) {
            const sports = new Set(
                rawData
                    .filter(d => d.athlete_full_name === athleteName1)
                    .map(d => d.event_title)
            );
            secondAthleteOptions = [...new Set(
                rawData
                    .filter(d => sports.has(d.event_title))
                    .map(d => d.athlete_full_name)
            )].filter(name => name !== athleteName1);
        } else {
            secondAthleteOptions = [];
        }
    }

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
        athleteName1 = '';
        athleteName2 = '';
        if ($page.url.searchParams.has('athlete1')) {
            $page.url.searchParams.delete('athlete1');
            $page.url.searchParams.delete('athlete2');
            $page.url.search = $page.url.searchParams.toString();
        }
        filteredAthleteData1 = [];
        filteredAthleteData2 = [];
        athleteSports = [];
        hoverVisible = false;
        showSuggestions1 = false;
        showSuggestions2 = false;
        drawAthleteGraph();
    }

    async function filterAndDrawAthleteData() {
        filteredAthleteData1 = [];
        filteredAthleteData2 = [];
        athleteSports = [];
        if (!athleteName1) {
            filteredAthleteData1 = [];
            filteredAthleteData2 = [];
            athleteSports = [];
            drawAthleteGraph();
            return;
        }

        if (athleteName1) {
            filteredAthleteData1 = rawData.filter(d =>
                d.athlete_full_name && d.athlete_full_name.toLowerCase() === athleteName1.toLowerCase() && !isNaN(+d.value_unit)
            ).sort((a, b) => +a.ano - +b.ano);

            athleteSports = [...new Set(filteredAthleteData1.map(d => d.event_title))];
        }

        if (athleteName2) {
            filteredAthleteData2 = rawData.filter(d =>
                d.athlete_full_name && d.athlete_full_name.toLowerCase() === athleteName2.toLowerCase() && 
                !isNaN(+d.value_unit) && 
                athleteSports.includes(d.event_title)
            ).sort((a, b) => +a.ano - +b.ano);
        }

        drawAthleteGraph();
    }

    function selectSuggestion(name, athleteNum) {
        if (athleteNum === 1) {
            athleteName1 = name;
            showSuggestions1 = false;
        } else {
            athleteName2 = name;
            showSuggestions2 = false;
        }
        
        $page.url.searchParams.set('athlete1', encodeURIComponent(athleteName1));
        if (athleteName2) {
            $page.url.searchParams.set('athlete2', encodeURIComponent(athleteName2));
        } else {
            $page.url.searchParams.delete('athlete2');
        }
        $page.url.search = $page.url.searchParams.toString();
        filterAndDrawAthleteData();
    }

    function getMedalColor(medalType) {
        if (!medalType) return null;
        const medal = medalType.toLowerCase();
        if (medal.includes('gold')) return 'gold';
        if (medal.includes('silver')) return 'silver';
        if (medal.includes('bronze')) return '#cd7f32';
        return null;
    }

    async function showHover(d) {
        hoverData = {
            athlete: d.athlete,
            sport: d.raw.event_title,
            year: d.year,
            value: d.val,
            country: d.raw.country_name,
            photo: '',
            flag: ''
        };
        hoverVisible = true;

        const media = await fetchAthleteMedia(d.raw.athlete_url);
        hoverData = {...hoverData, ...media};
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

        if (!filteredAthleteData1.length && !filteredAthleteData2.length) {
            svg.append('text')
                .attr('x', (chartWidth + margin.left + margin.right) / 2)
                .attr('y', chartHeight / 2)
                .attr('text-anchor', 'middle')
                .text(athleteName1 ? 'Nenhum dado encontrado.' : 'Selecione pelo menos um atleta.');
            return;
        }

        const allYears = [
            ...filteredAthleteData1.map(d => +d.ano),
            ...filteredAthleteData2.map(d => +d.ano)
        ];
        const allValues = [
            ...filteredAthleteData1.map(d => +d.value_unit),
            ...filteredAthleteData2.map(d => +d.value_unit)
        ];

        const yearExtent = d3.extent(allYears);
        xScale = d3.scaleLinear()
            .domain([Math.floor(yearExtent[0] / 4) * 4, Math.ceil(yearExtent[1] / 4) * 4])
            .range([margin.left, margin.left + chartWidth]);

        const valueExtent = d3.extent(allValues);
        const yPadding = (valueExtent[1] - valueExtent[0]) * 0.1;
        yScale = d3.scaleLinear()
            .domain([Math.max(0, valueExtent[0] - yPadding), valueExtent[1] + yPadding])
            .range([chartHeight - margin.bottom, margin.top]);

        const line = d3.line()
            .x(d => xScale(d.year))
            .y(d => yScale(d.val));

        const datasets = [
            { 
                name: athleteName1, 
                data: filteredAthleteData1, 
                color: athleteColors.athlete1,
                id: 'athlete1'
            },
            { 
                name: athleteName2, 
                data: filteredAthleteData2, 
                color: athleteColors.athlete2,
                id: 'athlete2'
            }
        ];

        let titleText = '';
        if (athleteName1 && athleteName2) {
            titleText = `Resultados de ${athleteName1} e ${athleteName2}`;
        } else if (athleteName1) {
            titleText = `Resultados de ${athleteName1}`;
        }
        svg.append('text')
            .attr('x', (chartWidth + margin.left + margin.right) / 2)
            .attr('y', 30)
            .attr('text-anchor', 'middle')
            .attr('font-size', '20px')
            .text(titleText);

        datasets.forEach(athleteData => {
            if (!athleteData.data.length) return;
            
            const dataBySport = d3.group(athleteData.data, d => d.event_title);
            
            dataBySport.forEach((rows, sportTitle) => {
                const series = rows.map(r => ({
                    year: +r.ano,
                    val: +r.value_unit,
                    raw: r,
                    sport: sportTitle,
                    athlete: athleteData.name,
                    athleteId: athleteData.id
                })).sort((a, b) => a.year - b.year);

                svg.append('path').datum(series)
                    .attr('fill', 'none')
                    .attr('stroke', athleteData.color)
                    .attr('stroke-width', 2)
                    .attr('d', line);

                svg.selectAll(null).data(series).enter().append('circle')
                    .attr('cx', d => xScale(d.year))
                    .attr('cy', d => yScale(d.val))
                    .attr('r', 4)
                    .attr('fill', d => {
                        const medalColor = getMedalColor(d.raw.medal_type);
                        return medalColor || athleteData.color;
                    })
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
        });

        const xAxis = d3.axisBottom(xScale).tickFormat(d3.format('d'));
        const yAxis = d3.axisLeft(yScale)
            .tickFormat(d => {
                const maxVal = d3.max(allValues);
                if (maxVal > 1000) return d3.format('.1s')(d);
                if (maxVal > 100) return d3.format('.0f')(d);
                if (maxVal > 10) return d3.format('.1f')(d);
                return d3.format('.2f')(d);
            });

        svg.append('g')
            .attr('class', 'x-axis')
            .attr('transform', `translate(0,${chartHeight - margin.bottom})`)
            .call(xAxis)
            .call(g => g.select('.domain').attr('stroke', '#ccc'))
            .call(g => g.selectAll('.tick line').clone()
                .attr('y2', -chartHeight + margin.top + margin.bottom)
                .attr('stroke-opacity', 0.1));

        svg.append('g')
            .attr('class', 'y-axis')
            .attr('transform', `translate(${margin.left},0)`)
            .call(yAxis)
            .call(g => g.select('.domain').attr('stroke', '#ccc'))
            .call(g => g.selectAll('.tick line').clone()
                .attr('x2', chartWidth)
                .attr('stroke-opacity', 0.1));

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

    $: if (athleteName1 || athleteName2) {
        filterAndDrawAthleteData();
    }

</script>

<svelte:head>
    <title>Comparação de Atletas</title>
</svelte:head>

<div class="page">
    <div class="title">
        <h1>
            {#if athleteName1 && athleteName2}
                Comparação: {athleteName1} e {athleteName2}
            {:else if athleteName1}
                Detalhes do Atleta: {athleteName1}
            {:else}
                Comparação de Atletas
            {/if}
        </h1>
    </div>

    <div class="controls-container">
        <div class="controls">
            <div class="search-container">
                <input 
                    type="text" 
                    bind:value={athleteName1}
                    on:input={() => {
                        showSuggestions1 = true;
                        suggestions1 = allAthleteNames.filter(name => 
                            name.toLowerCase().includes(athleteName1.toLowerCase())
                        ).slice(0, 5);
                    }}
                    on:blur={() => setTimeout(() => showSuggestions1 = false, 200)}
                    placeholder="Primeiro atleta...">
                
                {#if showSuggestions1 && suggestions1.length > 0}
                    <div class="suggestions-dropdown">
                        {#each suggestions1 as suggestion}
                            <div 
                                class="suggestion-item"
                                on:mousedown={() => selectSuggestion(suggestion, 1)}>
                                {suggestion}
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
            
            <div class="search-container">
                <input 
                    type="text" 
                    bind:value={athleteName2}
                    disabled={!athleteName1}
                    on:input={() => {
                        showSuggestions2 = true;
                        suggestions2 = secondAthleteOptions.filter(name => 
                            name.toLowerCase().includes(athleteName2.toLowerCase())
                        ).slice(0, 5);
                    }}
                    on:blur={() => setTimeout(() => showSuggestions2 = false, 200)}
                    placeholder={athleteName1 ? "Segundo atleta..." : "Selecione primeiro atleta"}>
                
                {#if showSuggestions2 && suggestions2.length > 0}
                    <div class="suggestions-dropdown">
                        {#each suggestions2 as suggestion}
                            <div 
                                class="suggestion-item"
                                on:mousedown={() => selectSuggestion(suggestion, 2)}>
                                {suggestion}
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
            
            <button class="reset-button" on:click={resetSearch}>
                Limpar
            </button>
        </div>
    </div>

    <div class="dashboard">
        <div class="chart-container" bind:this={chartContainerRef}>
            <svg bind:this={svgRef}></svg>
        </div>

        <div class="sidebar">
            <aside class="hover-card">
                {#if hoverVisible}
                    <h3>Resultado do Atleta</h3>
                    <p><b>Atleta:</b> {hoverData.athlete}</p>
                    <p><b>Evento:</b> {hoverData.sport}</p>
                    <p><b>Ano:</b> {hoverData.year}</p>
                    {#if hoverData.photo}
                        <img class="ath-img" src={hoverData.photo} alt={hoverData.athlete}/>
                    {/if}
                    <p><b>País:</b> {hoverData.country}
                        {#if hoverData.flag}
                            <img class="flag" src={hoverData.flag} alt={hoverData.country}/>
                        {/if}
                    </p>
                    <p><b>Resultado:</b> {hoverData.value}</p>
                {:else}
                    <p>Passe o mouse sobre um ponto para ver os detalhes.</p>
                {/if}
            </aside>

            <aside class="legend">
                {#if athleteName1}
                    <div class="legend-item">
                        <span class="swatch" style="background:#1f77b4"></span>
                        {athleteName1}
                    </div>
                {/if}
                {#if athleteName2}
                    <div class="legend-item">
                        <span class="swatch" style="background:#ff7f0e"></span>
                        {athleteName2}
                    </div>
                {/if}
            </aside>
        </div>
    </div>
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
        display: grid;
        grid-template-columns: 1fr 1fr auto;
        gap: 15px;
        max-width: 800px;
        width: 100%;
        position: relative;
    }

    .search-container {
        position: relative;
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

    .reset-button {
        padding: .6rem 1rem;
        font-size: .9rem;
        border: none;
        border-radius: var(--radius);
        cursor: pointer;
        background: #f44336;
        color: white;
        font-weight: 500;
        font-family: Poppins, sans-serif;
        transition: background .2s;
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

    .sidebar {
        display: flex;
        flex-direction: column;
        gap: 1rem;
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
        max-height: 200px;
        overflow-y: auto;
        padding: 1rem;
        border-radius: var(--radius);
        background: var(--card);
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
        
        .sidebar {
            order: 1;
        }
        
        .chart-container {
            order: 2;
        }
        
        .controls {
            grid-template-columns: 1fr;
        }
        
        .search-container {
            width: 100%;
        }
    }
</style>