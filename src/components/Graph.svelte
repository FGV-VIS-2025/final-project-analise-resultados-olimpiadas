<script>
  // Seu script permanece o mesmo
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

  const margin = { top: 50, right: 10, bottom: 30, left: 60 };
  const chartHeight = 500;
  let chartWidth = 600;

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
    
    yScale = d3.scaleLinear().range([chartHeight - margin.bottom - margin.top, margin.top]);
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
      filterData();
    }
  }

  function filterData() {
    if (!rawData || rawData.length === 0) {
      groups = [];
      legend = [];
      draw();
      return;
    }

    filtered = rawData.filter(r =>
      r.medal_type === 'GOLD' &&
      !isNaN(+r.value_unit) &&
      (!measure || r.value_type === measure)
    );

    if (searchQuery.trim() && !selectedEvent) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(r => r.event_title.toLowerCase().includes(q));
    }

    groups = Array.from(d3.group(filtered, r => r.event_title));

    const yMinNumProp = Number(yMin);
    const yMaxNumProp = Number(yMax);

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
      // Usando uma paleta de cores mais vibrante ou um esquema diferente
      // color = d3.scaleOrdinal().domain(legend).range(d3.schemeTableau10); // Exemplo: Tableau10
      // Ou mantendo o interpolateRainbow se preferir muitas cores distintas
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

  function resetAll() {
    selectedEvent = null;
    pinnedHoverData = null;
    isHoverPinned = false;
    hoverVisible = false;
    validFilterData();
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
            const delta = Math.abs(minVal * 0.1) || 0.5; // Aumentar delta para melhor visualização de ponto único
            minVal -= delta;
            maxVal += delta;
          } else {
            const padding = (maxVal - minVal) * 0.15; // Aumentar padding
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
            yScale.domain(allDataForGlobalScale.length > 0 ? d3.extent(allDataForGlobalScale) : [0, 1]).nice(5);
          }
        }
      } else { 
        const yMinNumProp = Number(yMin);
        const yMaxNumProp = Number(yMax);
          if (yMin && yMax && !isNaN(yMinNumProp) && !isNaN(yMaxNumProp) && yMinNumProp <= yMaxNumProp) {
          yScale.domain([yMinNumProp, yMaxNumProp]);
        } else {
          yScale.domain(allDataForGlobalScale.length > 0 ? d3.extent(allDataForGlobalScale) : [0, 1]).nice(5);
        }
      }
    } else {
      const yMinNumProp = Number(yMin);
      const yMaxNumProp = Number(yMax);
      if (yMin && yMax && !isNaN(yMinNumProp) && !isNaN(yMaxNumProp) && yMinNumProp <= yMaxNumProp) {
        yScale.domain([yMinNumProp, yMaxNumProp]);
      } else {
        yScale.domain(allDataForGlobalScale.length > 0 ? d3.extent(allDataForGlobalScale) : [0, 1]).nice(5);
      }
    }
    if (!yScale.domain() || yScale.domain().length < 2 || yScale.domain()[0] === yScale.domain()[1]) {
      yScale.domain(allDataForGlobalScale.length > 0 ? d3.extent(allDataForGlobalScale) : [0,1]).nice(5);
        if (!yScale.domain() || yScale.domain().length < 2 || yScale.domain()[0] === yScale.domain()[1]) yScale.domain([0,1]);
    }

    const lineGenerator = d3.line()
      .defined(d => !isNaN(d.val) && yScale(d.val) !== undefined && !isNaN(yScale(d.val)))
      .x(d => xScale(d.year))
      .y(d => yScale(d.val))
      .curve(d3.curveMonotoneX); // Curva mais suave para um visual moderno

    const measureLabels = { 'TIME': 'Tempo (s)', 'DISTANCE': 'Distância (m)', 'WEIGHT': 'Peso (kg)' };
    const measureLabel = measureLabels[measure] || measure;

    svg.selectAll('g.y-axis').data([null])
      .join(
        enter => enter.append('g').attr('class', 'y-axis callout').call(sel => sel.attr('transform', `translate(${margin.left},0)`).call(d3.axisLeft(yScale).ticks(5).tickSizeOuter(0))),
        update => update.call(sel => sel.transition().duration(transitionDuration).call(d3.axisLeft(yScale).ticks(5).tickSizeOuter(0)))
      );

    svg.selectAll('g.x-axis').data([null])
      .join(
        enter => enter.append('g').attr('class', 'x-axis callout').call(sel => sel.attr('transform', `translate(0,${actualChartHeight + margin.top})`).call(d3.axisBottom(xScale).ticks(Math.min(8, actualChartWidth / 80)).tickFormat(d3.format('d')).tickSizeOuter(0))),
        update => update.call(sel => sel.attr('transform', `translate(0,${actualChartHeight + margin.top})`).transition().duration(transitionDuration).call(d3.axisBottom(xScale).ticks(Math.min(8, actualChartWidth / 80)).tickFormat(d3.format('d')).tickSizeOuter(0)))
      );
    
    svg.selectAll('text.y-axis-label').data([measureLabel])
      .join( enter => enter.append('text').attr('class', 'y-axis-label').attr('transform', 'rotate(-90)').attr('y', margin.left / 4 - 15 ).attr('x', -( (actualChartHeight + margin.top + margin.top) / 2)).attr('text-anchor', 'middle').text(d => d), update => update.attr('y', margin.left / 4).attr('x', -( (actualChartHeight + margin.top + margin.top) / 2)).text(d => d) );
    svg.selectAll('text.x-axis-label').data(['Ano'])
      .join( enter => enter.append('text').attr('class', 'x-axis-label').attr('x', margin.left + actualChartWidth / 2).attr('y', chartHeight - margin.bottom / 3 + 5).attr('text-anchor', 'middle').text(d => d), update => update.attr('x', margin.left + actualChartWidth / 2).attr('y', chartHeight - margin.bottom / 3 + 22).text(d => d) );
    svg.selectAll('text.chart-title-text').data([`${selectedEvent ? selectedEvent + ' - ' : ''}Resultados Olímpicos (${measureLabel})`])
      .join( enter => enter.append('text').attr('class', 'chart-title-text').attr('x', (margin.left + actualChartWidth + margin.left) / 2).attr('y', margin.top / 2.5).attr('text-anchor', 'middle').text(d => d), update => update.attr('x', (margin.left + actualChartWidth + margin.left) / 2).text(d => d) );

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
        .attr('stroke-width', selectedEvent ? 3.5 : 2.5) // Linha mais grossa se selecionada
        .attr('stroke-linecap', 'round')
        .style('cursor', 'pointer')
        .on('click', (e, d) => { e.stopPropagation(); selectEvent(d.event); })
        .attr('d', d => lineGenerator(d.values))
        .style('opacity', 0)
        .call(pEnter => pEnter.transition().duration(transitionDuration)
          .style('opacity', d => selectedEvent ? (d.event === selectedEvent ? 1 : 0.1) : (groups.length > 15 ? 0.35 : 0.75))
        ),
      update => update
        .attr('stroke', d => color(d.event)) 
        .style('cursor', 'pointer')
        .on('click', (e, d) => { e.stopPropagation(); selectEvent(d.event); })
        .call(upd => upd.transition().duration(transitionDuration)
          .attr('stroke-width', selectedEvent ? 3.5 : 2.5)
          .style('opacity', d => selectedEvent ? (d.event === selectedEvent ? 1 : 0.1) : (groups.length > 15 ? 0.35 : 0.75))
          .attr('d', d => lineGenerator(d.values))
        ),
      exit => exit.transition().duration(transitionDuration)
        .style('opacity', 0)
        .attr('stroke-width', 0)
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
        .call(cEnter => cEnter.transition('enterRadius').duration(500).ease(d3.easeBounceOut) // Efeito bounce
          .delay((d,i) => selectedEvent === d.eventKey || !selectedEvent ? i * (200 / (allPoints.filter(p => selectedEvent ? p.eventKey === selectedEvent : true).length || 1)) : 0)
          .attr('r', selectedEvent ? 5 : 4)  // Pontos maiores se evento selecionado
        ),
      update => update, 
      exit => exit.transition('exitTransition').duration(transitionDuration / 2) 
        .attr('r', 0)
        .style('opacity', 0)
        .remove()
    );

    mergedCircles
      .attr('fill', d => d3.rgb(color(d.eventKey)).brighter(0.5))
      .attr('stroke', d => d3.rgb(color(d.eventKey)).darker(1))
      .attr('stroke-width', 1.5)
      .style('cursor', d => (!selectedEvent || d.eventKey === selectedEvent) ? 'pointer' : 'default')
      .on('mouseenter', function (event, dPoint) {
        if (selectedEvent && dPoint.eventKey !== selectedEvent) return;
        d3.select(this).transition().duration(100).attr('r', selectedEvent ? 7 : 6).style('fill-opacity', 1);
        showHover(dPoint);
      })
      .on('mouseleave', function (event, dPoint) {
        if (isHoverPinned && pinnedHoverData.year === dPoint.year && pinnedHoverData.athlete === dPoint.raw.athlete_full_name) {
        
        } else {
          d3.select(this).transition().duration(100).attr('r', selectedEvent ? 5 : 4).style('fill-opacity', null);
        }
        if (!isHoverPinned) hideHover();
        else if (!(pinnedHoverData.year === dPoint.year && pinnedHoverData.athlete === dPoint.raw.athlete_full_name)) hideHover();
      })
      .on('click', function(e, dPoint) {
        e.stopPropagation();

        // Se existe filtro de evento, só permite clicar no evento selecionado
        if (selectedEvent && dPoint.eventKey !== selectedEvent) return;

        // Se já está fixado no mesmo ponto, desfaz a fixação
        if (isHoverPinned &&
            pinnedHoverData &&
            pinnedHoverData.athlete === dPoint.raw.athlete_full_name &&
            pinnedHoverData.year === dPoint.year) {
          // Destrava hover
          pinnedHoverData = null;
          isHoverPinned = false;
          hoverVisible = false;

          // Atualiza visual dos pontos (remove destaque)
          svg.selectAll('circle.data-point')
            .transition().duration(100)
            .attr('r', selectedEvent ? 5 : 4);

        } else {
          // Atualiza hover fixado para o novo ponto
          pinnedHoverData = {
            sport: dPoint.event,
            athlete: dPoint.raw.athlete_full_name,
            year: dPoint.year,
            value: dPoint.val,
            country: dPoint.raw.country_name,
            photo: '',
            flag: ''
          };
          isHoverPinned = true;
          hoverVisible = true;

          // Atualiza hover com foto e bandeira async
          showHover(dPoint).then(() => {
            // Atualiza visual: todos os pontos do evento com tamanho normal,
            // só o ponto fixado maior
            svg.selectAll('circle.data-point')
              .transition().duration(100)
              .attr('r', selectedEvent ? 5 : 4);

            d3.select(this)
              .transition().duration(100)
              .attr('r', selectedEvent ? 7 : 6);
          });
        }
      })

      
      .transition('updateTransition').duration(transitionDuration) 
        .attr('cx', d => xScale(d.year))
        .attr('cy', d => yScale(d.val))
        .style('opacity', d => selectedEvent ? (d.eventKey === selectedEvent ? 0.9 : 0.2) : (groups.length > 15 ? 0.6 : 1))
        .attr('r', d => (isHoverPinned && pinnedHoverData && pinnedHoverData.athlete === d.raw.athlete_full_name && pinnedHoverData.year === d.year) ? (selectedEvent ? 7:6) : (selectedEvent ? 5:4) );

    if (svg.select('g.circles-group').node()) { 
        svg.select('g.circles-group').raise();
    }

    if (allPoints.length === 0 && groups.length > 0) {
      svg.selectAll('text.no-data-message').data([null])
        .join(enter => enter.append('text').attr('class', 'no-data-message')
          .attr('x', chartWidth / 3)
          .attr('y', chartHeight / 3)
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
    
    // A única mudança é aqui: usamos "?athlete=" em vez de "?athlete1="
    goto(`${basePath}/atletas?athlete=${encodeURIComponent(athleteName)}`);
  }
</script>

<div class="dashboard" on:click|self={resetAll}>
  <div class="cards-column">
    <aside class="info-card interactive-card">
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
        <h3>Explorar Resultados Olímpicos</h3>
        <p>Use a legenda ou clique em uma linha do gráfico para focar em um evento. Os detalhes aparecerão aqui.</p>
        <p>Interaja com os pontos no gráfico para ver informações sobre atletas e resultados específicos.</p>
      {/if}
    </aside>

    <aside class="hover-card interactive-card" on:click|stopPropagation>
      {#if isHoverPinned && pinnedHoverData}
        <h3><span class="pin-icon">📌</span> Detalhes Fixos</h3>
        <p><b>Atleta:</b> {pinnedHoverData.athlete}</p>
        {#if pinnedHoverData.photo}<img class="ath-img" src={pinnedHoverData.photo} alt={pinnedHoverData.athlete}/>{/if}
        <button class="action-button" on:click={() => goToAthleteDetails(pinnedHoverData.athlete)}>
          Ver Perfil do Atleta
        </button>
        <p><b>{pinnedHoverData.sport}</b> – {pinnedHoverData.year}</p>
        <p><b>País:</b> {pinnedHoverData.country}
          {#if pinnedHoverData.flag}<img class="flag" src={pinnedHoverData.flag} alt={pinnedHoverData.country}/>{/if}
        </p>
        <p><b>Resultado:</b> {pinnedHoverData.value}
          {measure === 'TIME' ? ' s' : measure === 'DISTANCE' ? ' m' : measure === 'WEIGHT' ? ' kg' : ''}
        </p>
        {#if pinnedHoverData.athlete}

        {/if}
      {:else if hoverVisible && hover.athlete}
        <h3>Detalhes do Ponto</h3>
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
        <p class="placeholder-text">Passe o mouse ou clique em um ponto no gráfico para ver detalhes.</p>
      {/if}
    </aside>
  </div>

  <div class="chart-wrapper">
    {#if selectedEvent}
      <button class="back-to-overview-button" on:click={resetAll} title="Voltar à visão geral">
        <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"></path></svg>
        Voltar
      </button>
    {/if}
    <div class="chart-container" bind:this={chartContainerRef}>
      <svg bind:this={svgRef}></svg>
    </div>
  </div>

  <aside class="legend interactive-card" on:click|stopPropagation>
    {#if legend.length > 0}
      <div class="legend-title">Legenda de Eventos</div>
      <div class="legend-scroll-container">
        {#each legend as ev}
          <div class="legend-item" role="button" tabindex="0"
            class:active={selectedEvent === ev}
            on:click={() => selectEvent(ev)}
            on:keypress={(e) => ['Enter', ' '].includes(e.key) && selectEvent(ev)}
            title={ev}>
            <span class="swatch" style="background:{color(ev)}; box-shadow: 0 0 5px {color(ev)};"></span>
            <span class="legend-text">{ev}</span>
          </div>
        {/each}
      </div>
    {:else}
      <p class="placeholder-text">Nenhuma legenda para exibir.</p>
    {/if}
  </aside>
</div>

<style>
  :root {
    --font-family-sans: 'Poppins', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
    
    /* Paleta de Cores Mais Ousada */
    --primary-color: var(--primary, #007bff); /* Azul vibrante */
    --primary-color-darker: var(--primary-darker, #0056b3);
    --primary-color-lighter: var(--primary-lighter, #cfe2ff); 
    --primary-color-rgb: var(--primary-rgb, 0, 123, 255); /* Para sombras coloridas */

    --secondary-color: #6c757d; /* Cinza neutro para elementos secundários */
    
    --text-primary-color: #212529; /* Preto suave */
    --text-secondary-color: #495057;
    --text-muted-color: #6c757d;
    --text-on-primary: #ffffff;

    --page-background: #eef1f5; /* Fundo da página mais claro */
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
  }

  .dashboard {
    display: grid;
    grid-template-columns: 280px 1fr 280px;
    grid-template-rows: auto; 
    gap: 0.8rem; /* Maior espaçamento */
    padding: 1.75rem;
    width: 100%;
    box-sizing: border-box;
    align-items: start;
    font-family: var(--font-family-sans);
    background-color: var(--page-background);
  }

  .cards-column {
    grid-column: 1;
    grid-row: 1;
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
    max-height: 540px; 
  }
  
  .interactive-card { /* Classe base para todos os cards e legenda */
    background: var(--card-background);
    border-radius: var(--radius-lg); /* Bordas mais arredondadas */
    box-shadow: var(--shadow-md), 0 0 0 1px var(--border-color-soft); /* Sombra mais borda sutil */
    padding: 1.25rem 1.5rem;
    transition: transform var(--transition-speed) ease, box-shadow var(--transition-speed) ease;
    overflow: hidden; /* Para conter elementos internos */
  }
  .interactive-card:hover {
     transform: translateY(-3px);
     box-shadow: var(--shadow-lg), 0 0 0 1px var(--border-color-medium);
  }

  .info-card,
  .hover-card {
    flex: 1;
    min-height: 230px; 
    max-height: calc(50% - 0.875rem);
    overflow-y: auto;
    font-size: 0.9rem;
    line-height: 1.65;
    color: var(--text-secondary-color);
  }

  .info-card h2, .hover-card h3, .legend-title {
    font-size: 1.25rem; /* Títulos maiores */
    font-weight: 700; /* Mais peso */
    color: var(--text-primary-color);
    margin-top: 0;
    margin-bottom: 1rem;
    letter-spacing: -0.5px; /* Ajuste fino */
  }
  .legend-title {
    position: relative;
    margin: 0 auto;
    top: -7px
  }
   .hover-card h3 .pin-icon {
    color: var(--primary-color);
    margin-right: 0.3em;
    font-size: 0.9em;
  }
  .info-card h3 {
    font-size: 1.15rem;
    font-weight: 600;
    color: var(--text-primary-color);
    margin-top: 0;
    margin-bottom: 0.85rem;
  }

  .info-card p, .hover-card p {
    margin-bottom: 0.6rem;
  }
  .info-card b, .hover-card b {
    color: var(--text-primary-color);
    font-weight: 600; /* Destaque maior para o 'bold' */
  }

  .placeholder-text {
    font-style: italic;
    color: var(--text-muted-color);
    font-size: 0.85rem;
    text-align: center;
    padding: 1.5rem 0.75rem;
  }

  .chart-wrapper {
    position: relative;
    grid-column: 2;
    grid-row: 1;
    background: var(--card-background);
    padding: 1.5rem;
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-md), 0 0 0 1px var(--border-color-soft);
    height: 560px; 
    box-sizing: border-box;
    overflow: hidden;
  }

  .back-to-overview-button {
    position: absolute;
    top: 1rem; 
    left: 1rem; 
    z-index: 20;
    background-color: var(--card-background);
    color: var(--primary-color);
    border: 2px solid var(--primary-color); /* Borda mais grossa */
    padding: 0.4rem 0.9rem;
    cursor: pointer;
    border-radius: var(--radius-md);
    font-size: 0.85rem;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    transition: all var(--transition-speed) ease;
    box-shadow: var(--shadow-sm);
  }
  .back-to-overview-button:hover {
    background-color: var(--primary-color);
    color: var(--text-on-primary);
    box-shadow: var(--shadow-primary-glow);
    transform: scale(1.03);
  }
  .back-to-overview-button svg {
    transition: transform 0.2s ease-out;
  }
  .back-to-overview-button:hover svg {
    transform: translateX(-3px) scale(1.05);
  }

  .chart-container {
    min-width: 0; 
    width: 100%;
    height: 100%;
  }

  .chart-container svg {
    width: 100%;
    height: 100%; 
    display: block;
    font-family: var(--font-family-sans);
  }
  
  .legend {
    grid-column: 3;
    grid-row: 1;
    max-height: 520px; 
    display: flex;
    flex-direction: column;
  }
  .legend-scroll-container {
    flex-grow: 1;
    overflow-y: auto;
    padding-right: 0.5rem; 
  }

  .legend-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 190px; 
    font-size: 0.85rem; /* Ligeiramente maior */
    color: var(--text-secondary-color);
    transition: color var(--transition-speed) ease;
  }

  .ath-img { 
    width: 70px; 
    height: 70px;
    object-fit: cover;
    border-radius: var(--radius-md); 
    display: block; 
    margin: 0.75rem auto; /* Centralizada e com mais margem */
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

  .legend-item { 
    display: flex; 
    align-items: center; 
    margin-bottom: 8px; 
    cursor: pointer; 
    border-radius: var(--radius-md); 
    padding: 8px 8px; 
    transition: all var(--transition-speed) ease; 
    border: 1px solid transparent; /* Para manter o layout no hover/active */
    position: relative;
  }
  .legend-item:hover { 
    background: var(--primary-color-lighter); 
    transform: translateX(4px);
    border-color: var(--primary-color);
  }
  .legend-item:hover .legend-text {
    color: var(--primary-color-darker);
  }
  .legend-item.active { 
    background: var(--primary-color-lighter); 
    border: 1px solid var(--primary-color-darker);
    box-shadow: var(--shadow-primary-glow);
  }
  .legend-item.active .legend-text { 
    font-weight: 700; 
    color: var(--primary-color-darker);
  }
   .legend-item .active-indicator {
    color: var(--primary-color);
    font-size: 0.9em;
    font-weight: bold;
  }
  .legend-item .swatch { 
    width: 16px; 
    height: 16px; 
    border-radius: 50%; /* Swatch circular */
    margin-right: 10px; 
    flex-shrink: 0; 
    display: inline-block; 
    border: 2px solid rgba(0,0,0,0.1);
    transition: transform var(--transition-speed) ease;
  }
  .legend-item.active .swatch { 
    transform: scale(1.2); 
    border-color: var(--primary-color-darker);
    box-shadow: 0 0 8px rgba(var(--primary-color-rgb),0.5) !important; /* Override inline style */
  }


  .chart-container svg text { fill: var(--text-secondary-color); }
  .chart-container svg .callout .tick line { stroke: var(--border-color-soft); stroke-opacity: 0.6; stroke-dasharray: 2,2; /* Linhas tracejadas */ }
  .chart-container svg .callout .domain { stroke: var(--border-color-medium); stroke-width: 1.5px; }
  .chart-container svg .callout .tick text { font-size: .75rem; fill: var(--text-muted-color); font-weight: 500; }
  
  .chart-container svg text.y-axis-label,
  .chart-container svg text.x-axis-label { 
    font-size: .8rem; /* Mantido, ajuste JS é mais importante */
    fill: var(--text-primary-color); 
    font-weight: 600;
    text-transform: uppercase; /* Para dar mais destaque */
    letter-spacing: 0.5px;
  }
  .chart-container svg text.chart-title-text { 
    font-size: 1.3rem; 
    font-weight: 700; 
    fill: var(--primary-color-darker); 
    letter-spacing: -0.5px;
  }

  .action-button { /* Classe genérica para botões de ação */
    background: var(--primary-color); 
    color: var(--text-on-primary); 
    padding: 0.75rem 1.5rem; 
    border: none; 
    border-radius: var(--radius-md); 
    cursor: pointer; 
    font-size: 0.9rem; 
    font-weight: 600;
    margin-top: 1.25rem; 
    transition: all var(--transition-speed) ease; 
    display: block;
    width: 100%;
    text-align: center;
    box-shadow: var(--shadow-sm);
  }
  .action-button:hover { 
    background: var(--primary-color-darker); 
    transform: translateY(-2px) scale(1.02);
    box-shadow: var(--shadow-md);
  }
  .action-button:active {
    transform: translateY(0px) scale(1);
    box-shadow: inset 0 2px 4px rgba(0,0,0,0.15);
  }

  .chart-container svg text.no-data-message {
    font-size: 1.1rem; /* Mensagem maior */
    fill: var(--text-muted-color);
    font-weight: 500;
  }

  /* Custom scrollbar (manter o anterior) */
  .info-card::-webkit-scrollbar,
  .hover-card::-webkit-scrollbar,
  .legend-scroll-container::-webkit-scrollbar {
    width: 8px; /* Um pouco mais grosso */
  }
  .info-card::-webkit-scrollbar-track,
  .hover-card::-webkit-scrollbar-track,
  .legend-scroll-container::-webkit-scrollbar-track {
    background: var(--page-background);
    border-radius: var(--radius-lg);
  }
  .info-card::-webkit-scrollbar-thumb,
  .hover-card::-webkit-scrollbar-thumb,
  .legend-scroll-container::-webkit-scrollbar-thumb {
    background: var(--border-color-medium);
    border-radius: var(--radius-lg);
    border: 2px solid var(--page-background);
  }
  .info-card::-webkit-scrollbar-thumb:hover,
  .hover-card::-webkit-scrollbar-thumb:hover,
  .legend-scroll-container::-webkit-scrollbar-thumb:hover {
    background: var(--secondary-color);
  }

</style>