<script>
  import { onMount } from 'svelte';
  import * as d3 from 'd3';

  let data;
  let years = [];
  let selectedYear;
  let playInterval;
  let isPlaying = false;

  // Dimensions
  const margin = { top: 40, right: 20, bottom: 50, left: 100 };
  const width = 800 - margin.left - margin.right;
  const height = 600 - margin.top - margin.bottom;

  // Color mapping for medal types
  const medalColors = {
    GOLD: '#ffd700',
    SILVER: '#c0c0c0',
    BRONZE: '#cd7f32'
  };

  onMount(async () => {
    // Load and parse CSV
    const raw = await d3.csv('/medals_by_country.csv', d3.autoType);
    data = raw;

    // Extract unique sorted years
    years = Array.from(new Set(data.map(d => d.year))).sort((a, b) => a - b);
    selectedYear = years[0];

    // Initial draw
    drawChart();
  });

  function drawChart() {
    // Filter data up to selectedYear
    const filtered = data.filter(d => d.year <= selectedYear);

    // Aggregate counts by country and medal type
    const nested = d3.rollup(
      filtered,
      v => d3.rollup(v, vv => d3.sum(vv, d => d.count_medals), d => d.medal_type),
      d => d.country_name
    );

    // Transform to array
    let countries = Array.from(nested, ([country, medalMap]) => {
      return {
        country,
        GOLD: medalMap.get('GOLD') || 0,
        SILVER: medalMap.get('SILVER') || 0,
        BRONZE: medalMap.get('BRONZE') || 0
      };
    });

    // Compute total
    countries.forEach(d => d.total = d.GOLD + d.SILVER + d.BRONZE);

    // Top 10
    const top10 = countries.sort((a, b) => b.total - a.total).slice(0, 10);
    // Brazil entry
    const brazil = countries.find(d => d.country === 'Brazil') || { country: 'Brazil', GOLD: 0, SILVER: 0, BRONZE: 0, total: 0 };
    // Junta top10 + brazil (sem duplicar)
    const display = top10.filter(d => d.country !== 'Brazil');
    display.push(brazil);

    // Escalas
    const x = d3.scaleLinear()
      .domain([0, d3.max(display, d => d.total)]).nice()
      .range([0, width]);

    const y = d3.scaleBand()
      .domain(display.map(d => d.country))
      .range([0, height])
      .padding(0.1);

    const stack = d3.stack().keys(['BRONZE','SILVER','GOLD']);
    const series = stack(display);

    // Seletor SVG
    const svg = d3.select('#chart svg g');
    if (!svg.size()) {
      const base = d3.select('#chart')
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);
      base.append('g').attr('class','bars');
      base.append('g').attr('class','axis-y');
      base.append('g').attr('class','axis-x').attr('transform', `translate(0,${height})`);
      base.append('text').attr('class','chart-title').attr('x', width/2).attr('y', -10).attr('text-anchor','middle').style('font-size','16px');
    }

    // Atualiza título
    d3.select('.chart-title').text(`Top 10 países + Brazil até ${selectedYear}`);

    // Atualiza eixos
    d3.select('.axis-y').transition().duration(800).call(d3.axisLeft(y));
    d3.select('.axis-x').transition().duration(800).call(d3.axisBottom(x));

    // Bind série de barras empilhadas
    const layers = d3.select('.bars').selectAll('g.layer')
      .data(series, s => s.key);

    // Enter
    const layerEnter = layers.enter().append('g').attr('class','layer').attr('fill', s => medalColors[s.key]);
    // Merge + transition
    const layerMerge = layerEnter.merge(layers);

    const bars = layerMerge.selectAll('rect')
      .data(d => d, (d,i) => display[i].country);

    bars.enter().append('rect')
      .attr('y', (_,i) => y(display[i].country))
      .attr('height', y.bandwidth())
      .attr('x', d => x(d[0]))
      .attr('width', 0)
    .merge(bars)
      .transition().duration(800)
        .attr('y', (_,i) => y(display[i].country))
        .attr('height', y.bandwidth())
        .attr('x', d => x(d[0]))
        .attr('width', d => x(d[1]) - x(d[0]));

    bars.exit().transition().duration(800).attr('width',0).remove();

    // Labels
    const labels = layerMerge.selectAll('text')
      .data(d => d, (d,i) => display[i].country);

    labels.enter().append('text')
      .attr('y', (_,i) => y(display[i].country) + y.bandwidth()/2)
      .attr('dy','0.35em')
      .attr('fill','#000')
      .attr('text-anchor','middle')
      .style('font-size','8px')
      .attr('x', d => x(d[0]))
      .text('')
    .merge(labels)
      .transition().duration(800)
      .attr('x', d => x(d[0]) + (x(d[1]) - x(d[0]))/2)
      .text((d) => {
        const val = d[1] - d[0];
        return val > 0 ? val : '';
      });

    labels.exit().remove();
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
