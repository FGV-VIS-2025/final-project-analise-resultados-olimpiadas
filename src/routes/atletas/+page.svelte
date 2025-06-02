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
            .y(d => yScale(d.val))
            .curve(d3.curveMonotoneX);
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
                    .attr('stroke-width', 2.5)
                    .attr('stroke-linecap', 'round')
                    .attr('d', line);
                svg.selectAll(null).data(series).enter().append('circle')
                    .attr('cx', d => xScale(d.year))
                    .attr('cy', d => yScale(d.val))
                    .attr('r', 4)
                    .attr('fill', d => {
                        const medalColor = getMedalColor(d.raw.medal_type);
                        return medalColor || d3.rgb(athleteData.color).brighter(0.3);
                    })
                    .attr('stroke', d3.rgb(athleteData.color).darker(1))
                    .attr('stroke-width', 1.5)
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
        --font-family-sans: 'Poppins', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
        --primary-color: var(--primary, #007bff);
        --primary-color-darker: var(--primary-darker, #0056b3);
        --primary-color-lighter: var(--primary-lighter, #cfe2ff);
        --primary-color-rgb: var(--primary-rgb, 0, 123, 255);
        --secondary-color: #6c757d;
        --text-primary-color: #212529;
        --text-secondary-color: #495057;
        --text-muted-color: #6c757d;
        --text-on-primary: #ffffff;
        --page-background: #eef1f5;
        --card-background: var(--card, #ffffff);
        --border-color-soft: #dee2e6;
        --border-color-medium: #ced4da;
        --shadow-sm: 0 .125rem .25rem rgba(0,0,0,.075);
        --shadow-md: 0 .5rem 1rem rgba(0,0,0,.1);
        --shadow-lg: 0 1rem 3rem rgba(0,0,0,.125);
        --shadow-primary-glow: 0 0 12px rgba(var(--primary-color-rgb), 0.3);
        --radius-sm: 4px;
        --radius-md: var(--radius, 8px);
        --radius-lg: 12px;
        --transition-speed: 0.2s;
        --grid: var(--border-color-soft);
        --text: var(--text-primary-color);
    }

    .page {
        max-width: 1380px;
        margin: auto;
        padding: 1.75rem;
        background: var(--page-background);
        font-family: var(--font-family-sans);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-md);
    }

    .title h1 {
        font-weight: 700;
        color: var(--primary-color-darker);
        margin: 0 0 1.5rem 0;
        text-align: center;
        font-family: var(--font-family-sans);
        font-size: 1.8rem;
        letter-spacing: -0.5px;
    }

    .controls-container {
        display: flex;
        justify-content: center;
        margin-bottom: 1.5rem;
    }

    .controls {
        display: grid;
        grid-template-columns: 1fr 1fr auto;
        gap: 1rem;
        max-width: 800px;
        width: 100%;
        position: relative;
    }

    .search-container {
        position: relative;
    }

    .controls input[type="text"] {
        padding: .75rem 1rem;
        font-size: .9rem;
        border: 1px solid var(--border-color-medium);
        border-radius: var(--radius-md);
        font-family: var(--font-family-sans);
        width: 100%;
        box-sizing: border-box;
        background-color: var(--card-background);
        color: var(--text-primary-color);
        transition: border-color var(--transition-speed) ease, box-shadow var(--transition-speed) ease;
    }
    .controls input[type="text"]:focus {
        border-color: var(--primary-color);
        box-shadow: 0 0 0 0.2rem rgba(var(--primary-color-rgb), 0.25);
        outline: none;
    }
    .controls input[type="text"]::placeholder {
        color: var(--text-muted-color);
    }

    .suggestions-dropdown {
        position: absolute;
        top: calc(100% + 5px);
        left: 0;
        right: 0;
        background: var(--card-background);
        border: 1px solid var(--border-color-medium);
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-md);
        z-index: 1000;
        margin-top: 5px;
        max-height: 200px;
        overflow-y: auto;
    }

    .suggestion-item {
        padding: 10px 15px;
        cursor: pointer;
        font-size: 0.9rem;
        border-bottom: 1px solid var(--border-color-soft);
        transition: background-color var(--transition-speed) ease, color var(--transition-speed) ease;
        color: var(--text-secondary-color);
    }

    .suggestion-item:hover,
    .suggestion-item:focus {
        background-color: var(--primary-color-lighter);
        color: var(--primary-color-darker);
        outline: none;
    }

    .suggestion-item:last-child {
        border-bottom: none;
    }

    .reset-button {
        padding: .75rem 1.5rem;
        font-size: .9rem;
        border: none;
        border-radius: var(--radius-md);
        cursor: pointer;
        background: #dc3545;
        color: white;
        font-weight: 600;
        font-family: var(--font-family-sans);
        transition: background-color var(--transition-speed) ease, transform var(--transition-speed) ease;
        box-shadow: var(--shadow-sm);
    }

    .reset-button:hover {
        background: #c82333;
        transform: translateY(-2px);
        box-shadow: var(--shadow-md);
    }
    .reset-button:active {
        transform: translateY(0);
    }

    .dashboard {
        display: grid;
        grid-template-columns: 1fr 300px;
        gap: 1.5rem;
        margin-top: 1.5rem;
    }

    .sidebar {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        max-height: 560px;
    }

    .chart-container, .hover-card, .legend {
        background: var(--card-background);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-md), 0 0 0 1px var(--border-color-soft);
        padding: 1.25rem 1.5rem;
        transition: transform var(--transition-speed) ease, box-shadow var(--transition-speed) ease;
        overflow: hidden;
    }
    .chart-container:hover, .hover-card:hover, .legend:hover {
        transform: translateY(-3px);
        box-shadow: var(--shadow-lg), 0 0 0 1px var(--border-color-medium);
    }

    .chart-container {
        min-width: 0;
        padding: 1.0rem;
        height: 560px;
        box-sizing: border-box;
    }

    .chart-container svg {
        width: 100%;
        height: 100%;
        display: block;
        font-family: var(--font-family-sans);
    }

    .hover-card {
        font-size: 0.9rem;
        line-height: 1.65;
        color: var(--text-secondary-color);
        overflow-y: auto;
    }

    .hover-card h3 {
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--text-primary-color);
        margin-top: 0;
        margin-bottom: 1rem;
        letter-spacing: -0.5px;
    }
    .hover-card p {
        margin-bottom: 0.6rem;
    }
     .hover-card b {
        color: var(--text-primary-color);
        font-weight: 600;
    }

    .legend {
        max-height: 280px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .legend-item {
        display: flex;
        align-items: center;
        font-size: 0.85rem;
        font-family: var(--font-family-sans);
        color: var(--text-secondary-color);
        padding: 6px 8px;
        border-radius: var(--radius-sm);
        transition: background-color var(--transition-speed) ease, color var(--transition-speed) ease;
    }
    .legend-item:hover {
        background-color: var(--primary-color-lighter);
        color: var(--primary-color-darker);
    }

    .legend-item .swatch {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        margin-right: 10px;
        flex-shrink: 0;
        display: inline-block;
        border: 2px solid rgba(0, 0, 0, 0.1);
    }
    .legend-item .swatch[style*="background:#1f77b4"] { box-shadow: 0 0 5px #1f77b4; }
    .legend-item .swatch[style*="background:#ff7f0e"] { box-shadow: 0 0 5px #ff7f0e; }

    .ath-img {
        width: 70px;
        height: 70px;
        object-fit: cover;
        border-radius: var(--radius-md);
        display: block;
        margin: 0.75rem auto;
        border: 2px solid var(--border-color-medium);
        box-shadow: var(--shadow-sm);
    }

    .flag {
        width: 20px;
        height: auto;
        margin-left: 6px;
        vertical-align: middle;
        border: 1px solid var(--border-color-soft);
        border-radius: 3px;
    }

    .chart-container svg .x-axis .domain,
    .chart-container svg .y-axis .domain {
        stroke: var(--border-color-medium);
        stroke-width: 1.5px;
    }

    .chart-container svg .x-axis .tick line,
    .chart-container svg .y-axis .tick line {
        stroke: var(--border-color-soft);
        stroke-opacity: 0.6;
    }
    .chart-container svg .x-axis .tick line[y2],
    .chart-container svg .y-axis .tick line[x2] {
        stroke-opacity: 0.1;
    }

    .chart-container svg .x-axis .tick text,
    .chart-container svg .y-axis .tick text {
        font-size: .75rem;
        fill: var(--text-muted-color);
        font-weight: 500;
    }

    .chart-container svg .axis-label {
        font-size: .8rem;
        fill: var(--text-primary-color);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        font-family: var(--font-family-sans);
    }

    .chart-container svg text[font-size="20px"] {
        font-size: 1.3rem !important;
        font-weight: 700;
        fill: var(--primary-color-darker);
        font-family: var(--font-family-sans);
        letter-spacing: -0.5px;
    }
    .chart-container svg text[text-anchor="middle"]:not([font-size="20px"]):not(.axis-label) {
        font-size: 1.1rem;
        fill: var(--text-muted-color);
        font-weight: 500;
        font-family: var(--font-family-sans);
    }

    .hover-card::-webkit-scrollbar,
    .legend::-webkit-scrollbar,
    .suggestions-dropdown::-webkit-scrollbar {
        width: 8px;
    }
    .hover-card::-webkit-scrollbar-track,
    .legend::-webkit-scrollbar-track,
    .suggestions-dropdown::-webkit-scrollbar-track {
        background: var(--page-background);
        border-radius: var(--radius-lg);
    }
    .hover-card::-webkit-scrollbar-thumb,
    .legend::-webkit-scrollbar-thumb,
    .suggestions-dropdown::-webkit-scrollbar-thumb {
        background: var(--border-color-medium);
        border-radius: var(--radius-lg);
        border: 2px solid var(--page-background);
    }
    .hover-card::-webkit-scrollbar-thumb:hover,
    .legend::-webkit-scrollbar-thumb:hover,
    .suggestions-dropdown::-webkit-scrollbar-thumb:hover {
        background: var(--secondary-color);
    }

    @media (max-width: 992px) {
        .dashboard {
            grid-template-columns: 1fr;
        }
        .sidebar {
            order: 1;
            flex-direction: row;
            max-height: none;
            overflow-x: auto;
        }
        .hover-card, .legend {
            min-width: 280px;
            flex: 1;
        }
        .chart-container {
            order: 2;
            height: 450px;
        }
    }

    @media (max-width: 768px) {
        .controls {
            grid-template-columns: 1fr;
        }
        .search-container {
            width: 100%;
        }
        .sidebar {
            flex-direction: column;
            overflow-x: visible;
        }
        .page {
            padding: 1rem;
        }
        .title h1 {
            font-size: 1.5rem;
        }
        .chart-container svg text[font-size="20px"] {
             font-size: 1.1rem !important;
        }
    }
</style>