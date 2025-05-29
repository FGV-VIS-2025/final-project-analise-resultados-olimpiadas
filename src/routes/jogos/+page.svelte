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
  const height = 500 - margin.top - margin.bottom;

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

    // Top 10 by total medals
    countries = countries.sort((a, b) => b.total - a.total).slice(0, 10);

    // Prepare stack
    const stack = d3.stack()
      .keys(['BRONZE', 'SILVER', 'GOLD']);

    const series = stack(countries);

    // Remove existing svg
    d3.select('#chart').selectAll('*').remove();

    const svg = d3.select('#chart')
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const x = d3.scaleLinear()
      .domain([0, d3.max(countries, d => d.total)]).nice()
      .range([0, width]);

    const y = d3.scaleBand()
      .domain(countries.map(d => d.country))
      .range([0, height])
      .padding(0.1);

    // Draw bars
    svg.selectAll('g.series')
      .data(series)
      .join('g')
      .attr('class', 'series')
      .attr('fill', ({ key }) => medalColors[key])
      .selectAll('rect')
      .data(d => d)
      .join('rect')
      .attr('y', (d, i) => y(countries[i].country))
      .attr('x', d => x(d[0]))
      .attr('height', y.bandwidth())
      .attr('width', d => x(d[1]) - x(d[0]));

    // Add medal counts inside segments
    svg.selectAll('g.series')
      .selectAll('text')
      .data(d => d)
      .join('text')
      .attr('x', d => x(d[0]) + (x(d[1]) - x(d[0])) / 2)
      .attr('y', (_, i) => y(countries[i].country) + y.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'middle')
      .attr('fill', '#000')
      .style('font-size', '10px')
      .text((d, j, nodes) => {
        // Only show if segment wide enough
        const widthSeg = x(d[1]) - x(d[0]);
        const val = d[1] - d[0];
        return widthSeg > 20 && val > 0 ? val : '';
      });

    // Axes
    svg.append('g')
      .call(d3.axisLeft(y));

    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x));

    // Title
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', -10)
      .attr('text-anchor', 'middle')
      .style('font-size', '16px')
      .text(`Top 10 países por medalhas até ${selectedYear}`);
  }

  function onYearChange(e) {
    selectedYear = +e.target.value;
    drawChart();
  }

  function togglePlay() {
    if (isPlaying) {
      clearInterval(playInterval);
    } else {
      let idx = years.indexOf(selectedYear);
      playInterval = setInterval(() => {
        idx = (idx + 1) % years.length;
        selectedYear = years[idx];
        drawChart();
        if (idx === years.length - 1) {
          clearInterval(playInterval);
          isPlaying = false;
        }
      }, 800);
    }
    isPlaying = !isPlaying;
  }
</script>

<style>
  #controls {
    margin-bottom: 20px;
  }
  input[type='range'] {
    width: 300px;
  }
  button {
    margin-left: 10px;
    padding: 6px 12px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    background-color: #007bff;
    color: #fff;
  }
</style>

<div id="controls">
  <input
    type="range"
    min="{years[0]}"
    max="{years[years.length - 1]}"
    bind:value={selectedYear}
    on:input={onYearChange}
  />
  <span>{selectedYear}</span>
  <button on:click={togglePlay}>
    {isPlaying ? 'Pause' : 'Play'}
  </button>
</div>

<div id="chart"></div>
