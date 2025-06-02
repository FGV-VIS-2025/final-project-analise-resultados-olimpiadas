<script>
    import { onMount, onDestroy } from 'svelte';
    import * as d3 from 'd3';
    import { goto } from '$app/navigation';

    export let csvUrl;
    export let measure = '';
    export let searchQuery = '';
    export let valueTypes = [];
    export let yMin = '';
    export let yMax = '';
    export let selectedEvent = null;

    const margin = { top: 60, right: 50, bottom: 60, left: 60 };
    const chartHeight = 500; // SVG container height
    let chartWidth = 600;  // SVG container width

    let svgRef, chartContainerRef, ro;

    let rawData = [], filtered = [], groups = [], legend = [];
    let xScale, yScale, color;

    let hoverVisible = false;
    let hover = { sport: '', athlete: '', year: 0, value: 0, country: '', photo: '', flag: '' };
    const cache = new Map();

    let pinnedHoverData = null;
    let isHoverPinned = false;

    let introYear, recordRow, recAth, recVal, recYear;
    let recPhoto = '', recFlag = '';

    const transitionDuration = 750;

    onMount(async () => {
        rawData = await d3.csv(csvUrl);
        valueTypes = [...new Set(rawData.map(d => d.value_type))].filter(Boolean);
        if (!measure && valueTypes.length) measure = valueTypes[0];
        
        yScale = d3.scaleLinear().range([chartHeight - margin.bottom - margin.top, margin.top]); // Adjusted range calculation
        xScale = d3.scaleLinear();

        updateWidth();
        if (typeof ResizeObserver !== 'undefined') {
            ro = new ResizeObserver(updateWidth);
            ro.observe(chartContainerRef);
        } else {
             if (typeof window !== 'undefined') window.addEventListener('resize', updateWidth);
        }
    });

    onDestroy(() => {
        ro?.disconnect();
        if (typeof window !== 'undefined') window.removeEventListener('resize', updateWidth);
    });

    $: { rawData; measure; searchQuery; yMin; yMax; rawData.length && validFilterData(); }
    $: selectedEvent, calcInfoAndUpdateDraw();

    function calcInfoAndUpdateDraw() {
        calcInfo();
        // No direct draw() call here, selectedEvent change in draw() handles scale
        // but if selectedEvent becomes null from outside, draw should be called.
        // selectEvent function already calls draw(). resetAll calls filterData which calls draw().
    }

    function validFilterData() {
        if (rawData.length > 0) {
            filterData();
        }
    }
    
    function updateWidth() {
        if (!chartContainerRef) return;
        const w = chartContainerRef.clientWidth;
        chartWidth = Math.max(300, w); 
        
        if(xScale) xScale.range([margin.left, chartWidth - margin.right]);

        if (rawData.length > 0) {
            filterData(); // This will call draw()
        }
    }

    function filterData() {
        if (!rawData || rawData.length === 0) {
            groups = []; // Clear groups if no rawData
            legend = [];
            draw(); // Attempt to draw (will show "no data" if groups is empty)
            return;
        }

        filtered = rawData.filter(r =>
            r.medal_type === 'GOLD' &&
            !isNaN(+r.value_unit) &&
            (!measure || r.value_type === measure)
        );

        if (searchQuery.trim() && !selectedEvent) { // Apply search query only if no event is selected (selectedEvent overrides search)
            const q = searchQuery.trim().toLowerCase();
            filtered = filtered.filter(r => r.event_title.toLowerCase().includes(q));
        }

        groups = Array.from(d3.group(filtered, r => r.event_title));

        const yMinNumProp = Number(yMin);
        const yMaxNumProp = Number(yMax);

        // A condição para aplicar o filtro de range das props
        const applyPropRangeFilter = !selectedEvent && 
                                     yMin.toString().trim() !== '' && 
                                     yMax.toString().trim() !== '' && 
                                     !isNaN(yMinNumProp) && 
                                     !isNaN(yMaxNumProp) && 
                                     yMinNumProp <= yMaxNumProp;

        if (applyPropRangeFilter) {
            groups = groups.filter(([ev, rows]) => {
                const values = rows.map(r => (r.value_unit === null || String(r.value_unit).trim() === "") ? NaN : +r.value_unit)
                                   .filter(v => !isNaN(v)); 
                if (values.length === 0) return false;

                const minRowVal = d3.min(values);
                const maxRowVal = d3.max(values);

                if (minRowVal === undefined || maxRowVal === undefined) return false;

                return minRowVal >= yMinNumProp && maxRowVal <= yMaxNumProp;
            });
        }
        
        legend = groups.map(([ev]) => ev).sort((a, b) => a.localeCompare(b));
        if (color) {
            color.domain(legend);
        } else {
            color = d3.scaleOrdinal().domain(legend).range(d3.quantize(t => d3.interpolateRainbow(t * 0.8 + 0.1), Math.max(10, legend.length)));
        }
        draw();
    }

    function selectEvent(ev) {
        if (selectedEvent === ev) { 
            return; 
        }
        selectedEvent = ev;

        pinnedHoverData = null;
        isHoverPinned = false;
        hoverVisible = false;

        draw(); 
    }

    async function fetchAthleteMedia(athleteUrl, athleteLink) {
        const k = athleteUrl || athleteLink || '';
        if (!k) return { photo: '', flag: '' };
        if (cache.has(k)) return cache.get(k);
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
            // console.error('Error fetching athlete media:', e);
            cache.set(k, { photo: '', flag: '' });
            return { photo: '', flag: '' };
        }
    }

    async function calcInfo() {
        if (!selectedEvent) {
            introYear = null; recordRow = null; recAth = ''; recVal = ''; recYear = ''; recPhoto = ''; recFlag = '';
            return;
        }
        const rows = rawData.filter(r => r.event_title === selectedEvent && r.medal_type === 'GOLD');
         if (!rows.length) {
             introYear = null; recordRow = null; recAth = ''; recVal = ''; recYear = ''; recPhoto = ''; recFlag = '';
            return;
        }
        introYear = d3.min(rows, r => +r.ano);
        recordRow = measure === 'TIME'
            ? rows.reduce((a, b) => +b.value_unit < +a.value_unit ? b : a, rows[0])
            : rows.reduce((a, b) => +b.value_unit > +a.value_unit ? b : a, rows[0]);
        
        if (!recordRow) return;
        recAth = recordRow.athlete_full_name;
        recVal = recordRow.value_unit;
        recYear = recordRow.ano;
        const { photo, flag } = await fetchAthleteMedia(recordRow.athlete_url, recordRow.athlete_link);
        recPhoto = photo;
        recFlag = flag;
    }

    async function showHover(pointData) {
        if (isHoverPinned && !(pinnedHoverData.year === pointData.year && pinnedHoverData.athlete === pointData.raw.athlete_full_name)) {
         // If something else is pinned, don't show temporary hover for other points
            return;
        }
        hover = {
            sport: pointData.event, athlete: pointData.raw.athlete_full_name,
            year: pointData.year, value: pointData.val, country: pointData.raw.country_name,
            photo: '', flag: ''
        };
        const { photo, flag } = await fetchAthleteMedia(pointData.raw.athlete_url, pointData.raw.athlete_link);
        hover.photo = photo;
        hover.flag = flag;
        hoverVisible = true;
    }

    const hideHover = () => {
        if (!isHoverPinned) hoverVisible = false;
    };

    function resetAll() { // Called by the "Back" button or clicking dashboard background
        selectedEvent = null;
        pinnedHoverData = null;
        isHoverPinned = false;
        hoverVisible = false;
        // searchQuery = ''; // Optional: also clear search query
        // yMin = '';      // Optional: also clear y-axis range inputs
        // yMax = '';
        validFilterData(); // This will call filterData -> draw()
    }

    function draw() {
        if (!svgRef || !rawData.length || !xScale || !yScale || !color) return;

        const svg = d3.select(svgRef)
            .attr('width', chartWidth)
            .attr('height', chartHeight);

        const actualChartWidth = chartWidth - margin.left - margin.right;
        const actualChartHeight = chartHeight - margin.top - margin.bottom;

        xScale.range([margin.left, actualChartWidth + margin.left]);
        yScale.range([actualChartHeight + margin.top, margin.top]);


        const activeGroups = selectedEvent ? groups.filter(([ev]) => ev === selectedEvent) : groups;
        const allYears = activeGroups.flatMap(([, groupRows]) => groupRows.map(r => +r.ano));

        if (allYears.length > 0) {
            xScale.domain(d3.extent(allYears));
        } else {
            // Fallback domain if no years (e.g. groups is empty)
            const currentYear = new Date().getFullYear();
            xScale.domain([currentYear - 10, currentYear]);
        }
        
        const allDataForGlobalScale = groups.flatMap(([, groupRows]) => groupRows.map(r => +r.value_unit));

        if (selectedEvent) {
            const eventGroup = groups.find(([evName]) => evName === selectedEvent);
            if (eventGroup && eventGroup[1].length > 0) {
                const eventValues = eventGroup[1].map(r => +r.value_unit);
                let [minVal, maxVal] = d3.extent(eventValues);
                if (minVal !== undefined) {
                    if (minVal === maxVal) {
                        const delta = Math.abs(minVal * 0.05) || 0.5; // Smaller padding for single value
                        minVal -= delta;
                        maxVal += delta;
                    } else {
                        const padding = (maxVal - minVal) * 0.10;
                        minVal -= padding;
                        maxVal += padding;
                    }
                    yScale.domain([minVal, maxVal]);
                } else { 
                    const yMinNumProp = Number(yMin);
                    const yMaxNumProp = Number(yMax);
                    if (yMin && yMax && !isNaN(yMinNumProp) && !isNaN(yMaxNumProp) && yMinNumProp <= yMaxNumProp) {
                        yScale.domain([yMinNumProp, yMaxNumProp]);
                    } else {
                        yScale.domain(allDataForGlobalScale.length > 0 ? d3.extent(allDataForGlobalScale) : [0, 1]).nice();
                    }
                }
            } else { 
                const yMinNumProp = Number(yMin);
                const yMaxNumProp = Number(yMax);
                 if (yMin && yMax && !isNaN(yMinNumProp) && !isNaN(yMaxNumProp) && yMinNumProp <= yMaxNumProp) {
                    yScale.domain([yMinNumProp, yMaxNumProp]);
                } else {
                    yScale.domain(allDataForGlobalScale.length > 0 ? d3.extent(allDataForGlobalScale) : [0, 1]).nice();
                }
            }
        } else {
            const yMinNumProp = Number(yMin);
            const yMaxNumProp = Number(yMax);
            if (yMin && yMax && !isNaN(yMinNumProp) && !isNaN(yMaxNumProp) && yMinNumProp <= yMaxNumProp) {
                yScale.domain([yMinNumProp, yMaxNumProp]);
            } else {
                yScale.domain(allDataForGlobalScale.length > 0 ? d3.extent(allDataForGlobalScale) : [0, 1]).nice();
            }
        }
        if (!yScale.domain() || yScale.domain().length < 2 || yScale.domain()[0] === yScale.domain()[1]) {
            yScale.domain(allDataForGlobalScale.length > 0 ? d3.extent(allDataForGlobalScale) : [0,1]).nice();
             if (!yScale.domain() || yScale.domain().length < 2 || yScale.domain()[0] === yScale.domain()[1]) yScale.domain([0,1]);
        }

        const lineGenerator = d3.line()
            .defined(d => !isNaN(d.val) && yScale(d.val) !== undefined && !isNaN(yScale(d.val))) // Add .defined
            .x(d => xScale(d.year))
            .y(d => yScale(d.val));

        const measureLabels = { 'TIME': 'Tempo (segundos)', 'DISTANCE': 'Distância (metros)', 'WEIGHT': 'Peso (kg)' };
        const measureLabel = measureLabels[measure] || measure;

        svg.selectAll('g.y-axis').data([null])
            .join(
                enter => enter.append('g').attr('class', 'y-axis callout').call(sel => sel.attr('transform', `translate(${margin.left},0)`).call(d3.axisLeft(yScale))),
                update => update.call(sel => sel.transition().duration(transitionDuration).call(d3.axisLeft(yScale)))
            );

        svg.selectAll('g.x-axis').data([null])
            .join(
                enter => enter.append('g').attr('class', 'x-axis callout').call(sel => sel.attr('transform', `translate(0,${actualChartHeight + margin.top})`).call(d3.axisBottom(xScale).ticks(Math.min(10, actualChartWidth / 70)).tickFormat(d3.format('d')))),
                update => update.call(sel => sel.attr('transform', `translate(0,${actualChartHeight + margin.top})`).transition().duration(transitionDuration).call(d3.axisBottom(xScale).ticks(Math.min(10, actualChartWidth / 70)).tickFormat(d3.format('d'))))
            );
        
        svg.selectAll('text.y-axis-label').data([measureLabel])
            .join( enter => enter.append('text').attr('class', 'y-axis-label').attr('transform', 'rotate(-90)').attr('y', margin.left / 4 -10).attr('x', -( (actualChartHeight + margin.top + margin.top) / 2)).attr('text-anchor', 'middle').attr('font-size', '12px').text(d => d), update => update.attr('x', -( (actualChartHeight + margin.top + margin.top) / 2)).text(d => d) );
        svg.selectAll('text.x-axis-label').data(['Ano'])
            .join( enter => enter.append('text').attr('class', 'x-axis-label').attr('x', margin.left + actualChartWidth / 2).attr('y', chartHeight - margin.bottom / 3).attr('text-anchor', 'middle').attr('font-size', '14px').text(d => d), update => update.attr('x', margin.left + actualChartWidth / 2).text(d => d) );
        svg.selectAll('text.chart-title-text').data([`Resultados Olímpicos - ${measureLabel}`])
            .join( enter => enter.append('text').attr('class', 'chart-title-text').attr('x', (margin.left + actualChartWidth + margin.left) / 2).attr('y', margin.top / 2).attr('text-anchor', 'middle').attr('font-size', '20px').text(d => d), update => update.attr('x', (margin.left + actualChartWidth + margin.left) / 2).text(d => d) );

        const seriesToDraw = selectedEvent ? groups.filter(([ev]) => ev === selectedEvent) : groups;
            const seriesData = seriesToDraw.map(([ev, rows]) => ({
                event: ev,
                values: rows.map(r => ({ year: +r.ano, val: +r.value_unit, raw: r, event: ev }))
                            .sort((a, b) => a.year - b.year)
            })).filter(s => s.values.length > 0);

        const paths = svg.selectAll('path.line')
            .data(seriesData, d => d.event);


        paths.join(
            enter => enter.append('path')
                .attr('class', 'line')
                .attr('fill', 'none')
                .attr('stroke', d => color(d.event))
                .attr('stroke-width', 2)
                .style('cursor', 'pointer') // Mantém o cursor para clique
                .on('click', (e, d) => { e.stopPropagation(); selectEvent(d.event); })
                .attr('d', d => lineGenerator(d.values)) // Define o caminho da linha
                .style('opacity', 0) // Começa transparente
                .call(pEnter => pEnter.transition().duration(transitionDuration) // Animação de fade-in
                    .style('opacity', d => selectedEvent ? (d.event === selectedEvent ? 1 : 0.2) : (groups.length > 15 ? 0.5 : 1)) // Opacidade final
                ),
            update => update // A lógica de 'update' permanece a mesma da versão anterior
                .attr('stroke', d => color(d.event)) 
                .style('cursor', 'pointer')
                .on('click', (e, d) => { e.stopPropagation(); selectEvent(d.event); })
                .call(upd => upd.transition().duration(transitionDuration)
                    .style('opacity', d => selectedEvent ? (d.event === selectedEvent ? 1 : 0.2) : (groups.length > 15 ? 0.5 : 1))
                    .attr('d', d => lineGenerator(d.values))
                ),
            exit => exit.transition().duration(transitionDuration) // A lógica de 'exit' permanece a mesma
                .style('opacity', 0)
                .remove()
        );

        const allPoints = seriesData.flatMap(s => s.values.map(p => ({...p, eventKey: s.event})))
                                .filter(d => !isNaN(d.val) && yScale(d.val) !== undefined && !isNaN(yScale(d.val)));

        const circlesGroup = svg.selectAll('g.circles-group').data([null]);
        circlesGroup.enter().append('g').attr('class', 'circles-group')
            .merge(circlesGroup);

        const circles = svg.select('g.circles-group').selectAll('circle.data-point')
            .data(allPoints, d => `${d.eventKey}-${d.year}-${d.raw.athlete_url || d.val}-${d.val}`);

        const mergedCircles = circles.join(
            enter => enter.append('circle')
                .attr('class', 'data-point')
                .attr('cx', d => xScale(d.year)) 
                .attr('cy', d => yScale(d.val))  
                .attr('r', 0)                   
            
                .call(cEnter => cEnter.transition('enterRadius').duration(500).ease(d3.easeCircleOut)
                    .delay((d,i) => selectedEvent === d.eventKey || !selectedEvent ? i * (300 / (allPoints.filter(p => selectedEvent ? p.eventKey === selectedEvent : true).length || 1)) : 0)
                    .attr('r', 3.5) 
                ),
            update => update, 
            exit => exit.transition('exitTransition').duration(transitionDuration / 2) 
                .attr('r', 0)
                .style('opacity', 0)
                .remove()
        );

        mergedCircles
            .attr('fill', d => color(d.eventKey))
            .attr('stroke', d => d3.rgb(color(d.eventKey)).darker(0.5))
            .attr('stroke-width', 1)
            .style('cursor', d => (!selectedEvent || d.eventKey === selectedEvent) ? 'pointer' : 'default')
            .on('mouseenter', function (event, dPoint) {
                if (selectedEvent && dPoint.eventKey !== selectedEvent) return;
                if (isHoverPinned && !(pinnedHoverData.year === dPoint.year && pinnedHoverData.athlete === dPoint.raw.athlete_full_name) ) return;
                d3.select(this).transition().duration(100).attr('r', 5);
                showHover(dPoint);
            })
            .on('mouseleave', function (event, dPoint) {
                if (isHoverPinned && pinnedHoverData.year === dPoint.year && pinnedHoverData.athlete === dPoint.raw.athlete_full_name) {
                
                } else {
                    d3.select(this).transition().duration(100).attr('r', 2.5);
                }
                if (!isHoverPinned) hideHover();
                else if (!(pinnedHoverData.year === dPoint.year && pinnedHoverData.athlete === dPoint.raw.athlete_full_name)) hideHover();
            })
            .on('click', function(e, dPoint) {
                e.stopPropagation();
                if (selectedEvent && dPoint.eventKey !== selectedEvent) return;

                if (selectedEvent !== dPoint.eventKey) {
                    pinnedHoverData = {
                        sport: dPoint.event, athlete: dPoint.raw.athlete_full_name,
                        year: dPoint.year, value: dPoint.val, country: dPoint.raw.country_name,
                        photo: '', flag: ''
                    };
                    isHoverPinned = true;
                    hoverVisible = true;
                    selectEvent(dPoint.eventKey);
                } else { 
                    if (isHoverPinned && pinnedHoverData &&
                        pinnedHoverData.athlete === dPoint.raw.athlete_full_name &&
                        pinnedHoverData.year === dPoint.year) {
                        pinnedHoverData = null; isHoverPinned = false; hoverVisible = false;
                        d3.select(this).transition().duration(100).attr('r', 2.5);
                    } else {
                        const currentElement = this;
                        showHover(dPoint).then(() => {
                            pinnedHoverData = { ...hover }; isHoverPinned = true; hoverVisible = true;
                            svg.selectAll('circle.data-point')
                            .filter(c => c.eventKey === selectedEvent) 
                            .transition().duration(100)
                            .attr('r', 2.5); 
                            d3.select(currentElement).transition().duration(100).attr('r', 5); 
                        });
                    }
                }
            })
            
            .transition('updateTransition').duration(transitionDuration) 
                .attr('cx', d => xScale(d.year))
                .attr('cy', d => yScale(d.val))
                .style('opacity', d => selectedEvent ? (d.eventKey === selectedEvent ? 1 : 0.2) : (groups.length > 15 ? 0.6 : 1))
                .attr('r', d => (isHoverPinned && pinnedHoverData && pinnedHoverData.athlete === d.raw.athlete_full_name && pinnedHoverData.year === d.year) ? 5 : 2.5);


        if (allPoints.length === 0 && groups.length > 0) {
            svg.selectAll('text.no-data-message').data([null])
                .join(enter => enter.append('text').attr('class', 'no-data-message')
                    .attr('x', chartWidth / 2)
                    .attr('y', chartHeight / 2)
                    .attr('text-anchor', 'middle')
                    .text(selectedEvent ? 'Nenhum dado para o evento selecionado com os filtros atuais.' : 'Nenhum dado para exibir com os filtros atuais.')
                );
        } else {
            svg.select('text.no-data-message').remove();
        }

    }

    function goToAthleteDetails(athleteName) {
        const isGitHubPages = window.location.hostname.includes('github.io');
        const basePath = isGitHubPages ? '/final-project-analise-resultados-olimpiadas' : '';
        goto(`${basePath}/atletas?athlete=${encodeURIComponent(athleteName)}`);
    }
</script>

<div class="dashboard" on:click|self={resetAll}>
    <div class="cards-column">
        <aside class="info-card">
            {#if selectedEvent && recordRow}
                <h2>{selectedEvent}</h2>
                {#if introYear}<p><b>Introduzido em:</b> {introYear}</p>{/if}
                {#if recVal}<p><b>Recorde do evento (ouro):</b> {recVal} ({measure ? measure.toLowerCase() : ''})</p>{/if}
                {#if recAth}<p><b>Atleta:</b> {recAth} – {recYear}</p>{/if}
                {#if recPhoto}<img class="ath-img" src={recPhoto} alt={recAth}/>{/if}
                {#if recordRow.country_name}
                <p><b>País:</b> {recordRow.country_name}
                    {#if recFlag}<img class="flag" src={recFlag} alt={recordRow.country_name}/>{/if}
                </p>
                {/if}
            {:else if selectedEvent && !recordRow}
                 <h2>{selectedEvent}</h2>
                 <p>Não há dados de medalha de ouro para calcular o recorde deste evento com os filtros atuais, ou o evento não foi encontrado.</p>
            {:else}
                <p>Clique na legenda ou em uma linha do gráfico para ver detalhes de um evento.</p>
                <p>Passe o mouse sobre um ponto para ver o resultado temporariamente, ou clique para fixar.</p>
            {/if}
        </aside>

        <aside class="hover-card" on:click|stopPropagation>
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
                {#if pinnedHoverData.athlete}
                <button on:click={() => goToAthleteDetails(pinnedHoverData.athlete)}>
                    Ver Detalhes do Atleta
                </button>
                {/if}
            {:else if hoverVisible && hover.athlete}
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

    <div class="chart-wrapper">
        {#if selectedEvent}
            <button class="back-to-overview-button" on:click={resetAll} title="Voltar à visão geral">
                &#8617; Voltar
            </button>
        {/if}
        <div class="chart-container" bind:this={chartContainerRef}>
            <svg bind:this={svgRef}></svg>
        </div>
    </div>

    <aside class="legend" on:click|stopPropagation>
        {#if legend.length > 0}
            {#each legend as ev}
                <div class="legend-item" role="button" tabindex="0"
                     class:active={selectedEvent === ev}
                     on:click={() => selectEvent(ev)}
                     title={ev}>
                    <span class="swatch" style="background:{color(ev)}"></span>
                    <span class="legend-text">{ev}</span>
                </div>
            {/each}
        {:else}
            <p style="font-size: 0.75rem; text-align: center; color: #777;">Nenhuma legenda para exibir.</p>
        {/if}
    </aside>
</div>

<style>
    .dashboard {
        display: grid;
        grid-template-columns: 220px 1fr 220px; /* Ajuste para acomodar melhor o texto da legenda */
        grid-template-rows: auto; 
        gap: 1rem;
        padding: 1rem;
        width: 100%;
        box-sizing: border-box;
        align-items: start;
    }

    .cards-column {
        grid-column: 1;
        grid-row: 1;
        display: flex;
        flex-direction: column;
        gap: 1rem; /* Aumentar o gap entre os cards */
        height: 600px; 
        max-height: 500px;
    }
    
    .info-card,
    .hover-card {
        flex: 1; /* Distribui o espaço igualmente */
        min-height: 150px; 
        max-height: calc(50% - 0.5rem); /* Ajuste para o gap */
        overflow-y: auto;
        font-size: 0.75rem;
        padding: 0.8rem; /* Leve redução do padding */
        border-radius: var(--radius);
        background: var(--card);
        box-shadow: 0 2px 10px rgba(0,0,0,.1);
    }

    .chart-wrapper {
        position: relative;
        grid-column: 2;
        grid-row: 1;
        background: var(--card); /* Mover fundo e sombra para o wrapper */
        padding: 1rem;
        border-radius: var(--radius);
        box-shadow: 0 2px 10px rgba(0,0,0,.1);
        height: 500px; /* Definir altura no wrapper */
        box-sizing: border-box;
    }

    .back-to-overview-button {
        position: absolute;
        top: 10px; 
        left: 15px; 
        z-index: 20; /* Aumentar z-index */
        background-color: #6c757d; /* Cinza mais escuro */
        color: white;
        border: none;
        padding: 6px 12px; /* Ajuste de padding */
        cursor: pointer;
        border-radius: var(--radius);
        font-size: 0.75rem; /* Reduzir tamanho da fonte */
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    }
    .back-to-overview-button:hover {
        background-color: #5a6268; /* Mais escuro no hover */
    }

    .chart-container {
        min-width: 0; 
        width: 100%; /* Ocupar todo o chart-wrapper */
        height: 100%; /* Ocupar todo o chart-wrapper */
    }

    .chart-container svg {
        width: 100%;
        height: 100%; 
        display: block;
    }
    
    .legend {
        grid-column: 3;
        grid-row: 1;
        max-height: 470px; 
        overflow-y: auto;
        background: var(--card);
        padding: 1rem;
        border-radius: var(--radius);
        box-shadow: 0 2px 10px rgba(0,0,0,.1);
    }
    .legend-text {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 160px; /* Ajustar para evitar quebra excessiva */
    }

    .ath-img { width: 50px; border-radius: 4px; display: block; margin: .3rem 0; } /* Imagem menor */
    .flag { width: 14px; height: 9px; margin-left: 3px; vertical-align: middle; }
    .legend-item { display: flex; align-items: center; margin-bottom: 5px; font-size: 0.7rem; cursor: pointer; border-radius: 3px; padding: 3px 5px; transition: background-color .2s, transform .2s; /* white-space: normal; // Removido para usar ellipsis */ }
    .legend-item:hover { background: rgba(0,0,0,.05); }
    .legend-item.active { background: rgba(212,175,55,.25); transform: scale(1.03); }
    .legend-item.active .legend-text { font-weight: bold; }
    .legend-item .swatch { width: 12px; height: 12px; border-radius: 2px; margin-right: 5px; flex-shrink: 0; display: inline-block; border: 1px solid rgba(0,0,0,0.1); }
    .legend-item.active .swatch { transform: scale(1.2); }

    /* Estilos para eixos e texto do gráfico */
    .chart-container svg text { font-family: 'Poppins', sans-serif; fill: #333; } /* Cor padrão para texto */
    .chart-container svg .callout .tick line { stroke: #e0e0e0; stroke-opacity: 0.7; } /* Linhas de tick mais suaves */
    .chart-container svg .callout .domain { stroke: #ccc; } /* Linha do eixo */
    .chart-container svg .callout .tick text { font-size: .7rem; fill: #555; } /* Texto dos ticks menor e mais suave */
    .chart-container svg text.y-axis-label,
    .chart-container svg text.x-axis-label { font-size: .75rem; fill: #444; }
    .chart-container svg text.chart-title-text { font-size: 1rem; font-weight: 600; fill: var(--primary, #0056b3); } /* Título destacado */


    .hover-card button { background: var(--primary); color: #fff; padding: 0.5rem 1rem; border: none; border-radius: var(--radius); cursor: pointer; font-size: 0.8rem; margin-top: 1rem; transition: background-color 0.2s ease; }
    .hover-card button:hover { background: #00264d; }

    /* Para o estado de 'sem dados' */
    .chart-container svg text.no-data-message {
        font-size: 0.9rem;
        fill: #777;
        font-style: italic;
    }
</style>