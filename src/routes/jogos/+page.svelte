<script>
  import { onMount } from 'svelte';
  import * as d3 from 'd3';
  import { base } from '$app/paths';

  let csvUrl = `${base}/medals_by_country.csv`;

  let data;
  let years = [];
  let selectedYear;
  let playInterval;
  let isPlaying = false;

  const margin = { top: 40, right: 20, bottom: 50, left: 140 };
  const width = 800 - margin.left - margin.right;
  const height = 600 - margin.top - margin.bottom;

  const medalColors = { GOLD: '#ffd700', SILVER: '#c0c0c0', BRONZE: '#cd7f32' };

  onMount(async () => {
    data = await d3.csv(csvUrl, d3.autoType);
    years = Array.from(new Set(data.map(d => d.year))).sort((a, b) => a - b);
    selectedYear = years[0];
    drawChart();
  });

  function drawChart() {
    const filtered = data.filter(d => d.year <= selectedYear);
    const nested = d3.rollup(
      filtered,
      v => d3.rollup(v, vv => d3.sum(vv, d => d.count_medals), d => d.medal_type),
      d => d.country_name
    );

    let countries = Array.from(nested, ([country, medalMap]) => ({
      country,
      GOLD: medalMap.get('GOLD') || 0,
      SILVER: medalMap.get('SILVER') || 0,
      BRONZE: medalMap.get('BRONZE') || 0
    }));
    countries.forEach(d => d.total = d.GOLD + d.SILVER + d.BRONZE);

    // Ranking geral para Brasil
    const sortedAll = [...countries].sort((a, b) => b.total - a.total);
    const brazilRank = sortedAll.findIndex(d => d.country === 'Brazil') + 1;

    const top10 = sortedAll.slice(0, 10);
    const brazil = sortedAll.find(d => d.country === 'Brazil') || { country: 'Brazil', GOLD: 0, SILVER: 0, BRONZE: 0, total: 0 };
    const display = [...top10];
    if (!top10.some(d => d.country === 'Brazil')) display.push(brazil);

    const ranks = display.map((d, i) => d.country === 'Brazil' ? brazilRank : i + 1);

    const x = d3.scaleLinear()
      .domain([0, d3.max(display, d => d.total)]).nice()
      .range([0, width]);
    const y = d3.scaleBand()
      .domain(display.map(d => d.country))
      .range([0, height])
      .padding(0.1);

    const stack = d3.stack().keys(['BRONZE','SILVER','GOLD']);
    const series = stack(display);

    // Inicializa SVG
    let base = d3.select('#chart svg');
    if (!base.size()) {
      base = d3.select('#chart')
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom);
      const g = base.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
      g.append('g').attr('class','axis-ranks');
      g.append('g').attr('class','axis-y');
      g.append('g').attr('class','bars');
      g.append('g').attr('class','axis-x').attr('transform', `translate(0,${height})`);
      g.append('text').attr('class','chart-title').attr('x', width/2).attr('y', -10)
        .attr('text-anchor','middle').style('font-size','16px');
      g.append('g').attr('class','country-labels');
    }
    const g = base.select('g');

    g.select('.chart-title').text(`Top 10 + Brazil até ${selectedYear}`);

    // Posições
    const rankSel = g.select('.axis-ranks')
      .selectAll('text').data(ranks);
    rankSel.join(
      enter => enter.append('text')
        .attr('x', -10)
        .attr('y', (_,i) => y(display[i].country) + y.bandwidth()/2)
        .attr('dy','0.35em')
        .attr('text-anchor','end')
        .style('font-size','12px')
        .text(d => d),
      update => update.transition().duration(800)
        .attr('y', (_,i) => y(display[i].country) + y.bandwidth()/2)
        .text(d => d)
    );

    // Países (labels ao lado da barra)
    const nameSel = g.select('.country-labels')
      .selectAll('text').data(display, d => d.country);
    nameSel.join(
      enter => enter.append('text')
        .attr('x', d => x(d.total) + 5)
        .attr('y', d => y(d.country) + y.bandwidth()/2)
        .attr('dy','0.35em')
        .attr('text-anchor','start')
        .style('font-size','12px')
        .text(d => d.country),
      update => update.transition().duration(800)
        .attr('x', d => x(d.total) + 5)
        .attr('y', d => y(d.country) + y.bandwidth()/2)
        .text(d => d.country)
    );

    // Eixos
    g.select('.axis-y')
      .transition().duration(800)
      .call(d3.axisLeft(y).tickFormat(''));
    g.select('.axis-x')
      .transition().duration(800)
      .call(d3.axisBottom(x));

    // Barras empilhadas
    const layers = g.select('.bars').selectAll('g.layer')
      .data(series, s => s.key);
    const layerEnter = layers.enter().append('g').attr('class','layer').attr('fill', s => medalColors[s.key]);
    const layerMerge = layerEnter.merge(layers);

    const bars = layerMerge.selectAll('rect')
      .data(d => d, (_,i) => display[i].country);
    bars.join(
      enter => enter.append('rect')
        .attr('y', (_,i) => y(display[i].country))
        .attr('height', y.bandwidth())
        .attr('x', d => x(d[0]))
        .attr('width', 0)
        .call(sel => sel.transition().duration(800)
          .attr('width', d => x(d[1]) - x(d[0]))
        ),
      update => update.transition().duration(800)
        .attr('y', (_,i) => y(display[i].country))
        .attr('x', d => x(d[0]))
        .attr('width', d => x(d[1]) - x(d[0])),
      exit => exit.transition().duration(800).attr('width',0).remove()
    );

    // Rótulos de medalha
    const labels = layerMerge.selectAll('text.medal-label')
      .data(d => d, (_,i) => display[i].country);
    labels.join(
      enter => enter.append('text').attr('class','medal-label')
        .attr('y', (_,i) => y(display[i].country) + y.bandwidth()/2)
        .attr('dy','0.35em')
        .style('font-size','8px')
        .attr('fill','#000')
        .attr('text-anchor','middle')
        .text('')
        .call(sel => sel.transition().duration(800)
          .attr('x', d => x(d[0]) + (x(d[1]) - x(d[0]))/2)
          .text(d => d[1] - d[0] > 0 ? d[1] - d[0] : '')
        ),
      update => update.transition().duration(800)
        .attr('y', (_,i) => y(display[i].country) + y.bandwidth()/2)
        .attr('x', d => x(d[0]) + (x(d[1]) - x(d[0]))/2)
        .text(d => d[1] - d[0] > 0 ? d[1] - d[0] : ''),
      exit => exit.remove()
    );
  }

  function onYearChange(e) {
    selectedYear = +e.target.value;
    drawChart();
  }

  function togglePlay() {
    if (isPlaying) clearInterval(playInterval);
    else {
      let idx = years.indexOf(selectedYear);
      playInterval = setInterval(() => {
        idx = (idx + 1) % years.length;
        selectedYear = years[idx];
        drawChart();
        if (idx === years.length - 1) { clearInterval(playInterval); isPlaying = false; }
      }, 800);
    }
    isPlaying = !isPlaying;
  }
</script>

<svelte:head>
    <title>Histórico de Medalhas</title>
</svelte:head>

<style>
  #controls { margin-bottom: 20px; }
  input[type='range'] { width: 300px; }
  button { margin-left: 10px; padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; background-color: #007bff; color: #fff; }
</style>

<div id="controls">
  <input type="range" min="{years[0]}" max="{years[years.length - 1]}" bind:value={selectedYear} on:input={onYearChange} />
  <span>{selectedYear}</span>
  <button on:click={togglePlay}>{isPlaying ? 'Pause' : 'Play'}</button>
</div>
<div id="chart"></div>
