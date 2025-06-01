<script>
  import { onMount } from 'svelte';
  import * as d3 from 'd3';
  import { base } from '$app/paths';

  let countryMedalsCsvUrl = `${base}/medals_by_country.csv`;
  let athleteMedalsCsvUrl = `${base}/athlete_medals_by_edition.csv`;
  let flagsCsvUrl = `${base}/flags_iso.csv`; // Novo CSV para bandeiras

  let countryMedalsData = [];
  let athleteMedalsData = [];
  let officialFlagData = new Map(); // Para armazenar dados de flags_iso.csv
  let years = [];
  let selectedYear;
  let playInterval;
  let isPlaying = false;
  let editionCardData = null;
  
  const TOP_N_RANKING_CARDS = 5; // Para os cards de Top 5
  const CHART_DISPLAY_LIMIT = 10; // Para o gráfico principal (Top 10 + Brasil)

  const margin = { top: 40, right: 60, bottom: 50, left: 60 }; 
  const width = 800 - margin.left - margin.right;
  const height = 600 - margin.top - margin.bottom;
  const medalColors = { GOLD: '#ffd700', SILVER: '#c0c0c0', BRONZE: '#cd7f32' };

  let svg;
  let g;
  let initialized = false;

  const mediaCache = new Map();
  // countryCodeMapping agora é um fallback de último recurso
  const countryCodeMapping = {
    "United States of America": "US", "USA": "US", "United States": "US",
    "People's Republic of China": "CN", "China": "CN",
    "Great Britain": "GB", "United Kingdom": "GB",
    "Japan": "JP", "Australia": "AU", "Italy": "IT", "Germany": "DE",
    "Netherlands": "NL", "Holland": "NL", "France": "FR", "Canada": "CA", "Brazil": "BR",
    "Republic of Korea": "KR", "South Korea": "KR", "Korea, South": "KR",
    "Russian Federation": "RU", "Russia": "RU", "ROC": "RU", 
    "Soviet Union": "SU", "URS": "SU", "Unified Team": "EUN", 
    "West Germany": "DE", "FRG": "DE", "East Germany": "DE", "GDR": "DE",
    "Czechoslovakia": "CS", "TCH": "CS", "Yugoslavia": "YU", "YUG": "YU",
    "Bohemia": "CZ", "BOH": "CZ", "Australasia": "AU", "ANZ": "AU",
    "Russian Empire": "RU", "Serbia and Montenegro": "CS", "SCG": "CS",
    "Ceylon": "LK", "Burma": "MM", "Rhodesia": "ZW", "Zaire": "CD",
    "Dutch Antilles": "NL", "British Guiana": "GY", "Gold Coast": "GH",
    "Spain": "ES", "Hungary": "HU", "Poland": "PL", "Sweden": "SE", "Norway": "NO",
    "Cuba": "CU", "New Zealand": "NZ", "Switzerland": "CH", "Kenya": "KE",
    "Jamaica": "JM", "Ukraine": "UA", "Iran": "IR", "India": "IN", "Chinese Taipei": "TW",
  };

  function getCountryFlagUrl(countryNameForLookup, countryCodeFromMedalData) {
    let finalCode = null;

    if (officialFlagData.has(countryNameForLookup)) {
        const codeFromOfficialCsv = officialFlagData.get(countryNameForLookup);
        if (codeFromOfficialCsv && typeof codeFromOfficialCsv === 'string' && codeFromOfficialCsv.length === 2) {
            finalCode = codeFromOfficialCsv.toUpperCase();
        }
    }

    if (!finalCode && countryCodeFromMedalData && typeof countryCodeFromMedalData === 'string' && countryCodeFromMedalData.length === 2) {
        finalCode = countryCodeFromMedalData.toUpperCase();
    }
    
    if (!finalCode && countryNameForLookup && countryCodeMapping[countryNameForLookup]) {
        finalCode = countryCodeMapping[countryNameForLookup];
    }

    if (!finalCode && countryNameForLookup && countryNameForLookup.length >= 2 && countryNameForLookup.length <= 3 && countryCodeMapping[countryNameForLookup.toUpperCase()]) {
        finalCode = countryCodeMapping[countryNameForLookup.toUpperCase()];
    }

    if (finalCode) {
        return `https://flagcdn.com/w40/${finalCode.toLowerCase()}.png`;
    }
    return ''; 
  }

  async function fetchAthleteMedia(profileUrl) {
    const k = profileUrl || '';
    if (!k) return { photo: '', flag: '' };
    if (mediaCache.has(k)) return mediaCache.get(k);
    try {
      const response = await fetch(profileUrl);
      if (!response.ok) { mediaCache.set(k, { photo: '', flag: '' }); return { photo: '', flag: '' }; }
      const html = await response.text();
      const d = new DOMParser().parseFromString(html, 'text/html');
      let photoSrc = d.querySelector('section picture img')?.src || d.querySelector('img.img-profile-header')?.src || d.querySelector('.athlete-profile-hero__image-container img')?.src || ''; 
      let flagSrc = d.querySelector('section img[alt][src*="noc"]')?.src || d.querySelector('.profile-header--country-flag')?.src || d.querySelector('.country-flag img.country-flag')?.src || '';
      if (photoSrc && !photoSrc.startsWith('http')) try { photoSrc = new URL(photoSrc, profileUrl).href; } catch (e) { photoSrc = ''; }
      if (flagSrc && !flagSrc.startsWith('http')) try { flagSrc = new URL(flagSrc, profileUrl).href; } catch (e) { flagSrc = ''; }
      const media = { photo: photoSrc, flag: flagSrc };
      mediaCache.set(k, media);
      return media;
    } catch (e) {
      mediaCache.set(k, { photo: '', flag: '' });
      return { photo: '', flag: '' };
    }
  }

  onMount(async () => {
    try {
      const [loadedCountryMedals, loadedAthleteMedals, rawFlags] = await Promise.all([
        d3.csv(countryMedalsCsvUrl, d3.autoType),
        d3.csv(athleteMedalsCsvUrl, d3.autoType),
        d3.csv(flagsCsvUrl, d3.autoType)
      ]);
      
      countryMedalsData = loadedCountryMedals;
      athleteMedalsData = loadedAthleteMedals;

      if (rawFlags) {
        rawFlags.forEach(d => {
          if (d.Country && d.Alpha_2_code) { 
            officialFlagData.set(d.Country, d.Alpha_2_code);
          }
        });
      }
      
      years = Array.from(new Set(countryMedalsData.map(d => d.year))).filter(y => y % 4 === 0).sort((a,b) => a - b);
      if (years.length > 0) selectedYear = years[0]; else selectedYear = undefined;

    } catch (error) {
      console.error("Erro ao carregar dados CSV:", error);
      countryMedalsData = []; athleteMedalsData = []; officialFlagData = new Map(); years = []; selectedYear = undefined;
    }
  });

  async function updateEditionCardsInfo() {
    if (selectedYear === undefined) { editionCardData = null; return; }
    editionCardData = await processYearData(selectedYear); 
  }

  $: if (selectedYear !== undefined && years.length > 0) {
    if (countryMedalsData.length > 0) drawChart(); 
    updateEditionCardsInfo(); 
  } else if (years.length === 0 && initialized) {
    d3.select('#chart svg').remove();
    d3.select('#chart .no-data-message-chart').remove();
    d3.select('#chart').append('p').attr('class','no-data-message-chart').text('Nenhum dado de ano disponível.');
    initialized = false;
  }
  
  async function processYearData(year) {
    let countriesWithMedalsCount = 0;
    let totalMedalsInEdition = 0;
    let topCountryOutput = { country: 'N/A', GOLD: 0, SILVER: 0, BRONZE: 0, total: 0, country_code_iso2: null };
    let brazilDataForCards = { country: 'Brazil', GOLD: 0, SILVER: 0, BRONZE: 0, total: 0, country_code_iso2: 'BR' };
    let brazilRankInEdition = 'N/A';
    let topCountriesInEditionOutput = [];
    let topAthletesInEditionOutput = [];
    let highlightedAthleteOutput = null;

    if (countryMedalsData.length > 0) {
      const yearSpecificCountryData = countryMedalsData.filter(d => d.year === year);
      if (yearSpecificCountryData.length > 0) {
        const nestedYearCountries = d3.rollup(
          yearSpecificCountryData,
          v => {
            const medalMapAgg = d3.rollup(v, vv => d3.sum(vv, d => d.count_medals || 0), d => d.medal_type);
            return { medalDetail: medalMapAgg, country_code_iso2: v[0].country_code_iso2 };
          },
          d => d.country_name
        );
        let countriesYear = Array.from(nestedYearCountries, ([country, data]) => ({
          country, 
          GOLD: data.medalDetail.get('GOLD') || 0, SILVER: data.medalDetail.get('SILVER') || 0,
          BRONZE: data.medalDetail.get('BRONZE') || 0,
          total: (data.medalDetail.get('GOLD') || 0) + (data.medalDetail.get('SILVER') || 0) + (data.medalDetail.get('BRONZE') || 0),
          country_code_iso2: data.country_code_iso2
        }));
        countriesYear.sort((a, b) => b.total - a.total || b.GOLD - a.GOLD);
        topCountriesInEditionOutput = countriesYear.slice(0, TOP_N_RANKING_CARDS);
        totalMedalsInEdition = d3.sum(countriesYear, d => d.total);
        countriesWithMedalsCount = countriesYear.length;
        topCountryOutput = countriesYear.length > 0 ? countriesYear[0] : topCountryOutput;
        const brazilFound = countriesYear.find(d => d.country === 'Brazil');
        if (brazilFound) {
          brazilDataForCards = brazilFound;
          brazilRankInEdition = brazilFound.total > 0 ? countriesYear.findIndex(d => d.country === 'Brazil') + 1 : 'N/A (sem medalhas)';
        } else {
          brazilDataForCards.country_code_iso2 = officialFlagData.get('Brazil') || 'BR'; // Garante código para card do Brasil
          brazilRankInEdition = 'Não participou ou sem medalhas';
        }
      }
    }
    if (athleteMedalsData.length > 0) {
      const athleteDataForSelectedYear = athleteMedalsData.filter(d => d.year === year);
      if (athleteDataForSelectedYear.length > 0) {
        const athleteMedalCounts = d3.rollup(
          athleteDataForSelectedYear,
          v => {
            const medals = {GOLD: 0, SILVER: 0, BRONZE: 0};
            let profileUrl = null; let countryName = null; let countryCode = null;
            v.forEach(medalEntry => {
              medals[medalEntry.medal_type] = (medals[medalEntry.medal_type] || 0) + (medalEntry.count_medals || 1);
              if (!profileUrl) profileUrl = medalEntry.athlete_photo_url; 
              if (!countryName) countryName = medalEntry.country_name;
              if (!countryCode) countryCode = medalEntry.country_code_iso2;
            });
            return { ...medals, total: medals.GOLD + medals.SILVER + medals.BRONZE, athlete_profile_url: profileUrl, country_name: countryName, country_code_iso2: countryCode };
          },
          d => d.athlete_name
        );
        let athletesDetails = Array.from(athleteMedalCounts, ([name, data]) => ({ athlete_name: name, ...data }));
        athletesDetails.sort((a, b) => b.total - a.total || b.GOLD - a.GOLD || b.SILVER - b.SILVER);
        topAthletesInEditionOutput = athletesDetails.slice(0, TOP_N_RANKING_CARDS);
        if (topAthletesInEditionOutput.length > 0) {
          const candidateAthlete = topAthletesInEditionOutput[0];
          let scrapedPhotoUrl = ''; let scrapedFlagUrl = '';
          if (candidateAthlete.athlete_profile_url) { 
            const media = await fetchAthleteMedia(candidateAthlete.athlete_profile_url);
            scrapedPhotoUrl = media.photo; scrapedFlagUrl = media.flag; 
          }
          highlightedAthleteOutput = { ...candidateAthlete, scraped_direct_photo_url: scrapedPhotoUrl, scraped_direct_flag_url: scrapedFlagUrl };
        }
      }
    }
    return { year, countriesWithMedalsCount, totalMedalsInEdition, topCountry: topCountryOutput, brazilData: brazilDataForCards, brazilRankInEdition, topCountriesInEdition: topCountriesInEditionOutput, topAthletesInEdition: topAthletesInEditionOutput, highlightedAthlete: highlightedAthleteOutput };
  }

  function drawChart() {
    if (!countryMedalsData.length || selectedYear === undefined) {
      d3.select('#chart svg').remove(); d3.select('#chart .no-data-message-chart').remove();
      d3.select('#chart').append('p').attr('class','no-data-message-chart').text('Dados para gráfico não disponíveis.');
      return;
    }
    if (!initialized) {
      d3.select('#chart').selectAll('svg').remove();
      svg = d3.select('#chart').append('svg').attr('width', width + margin.left + margin.right).attr('height', height + margin.top + margin.bottom);
      g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
      g.append('g').attr('class','axis-y-flags'); 
      g.append('g').attr('class','bars');
      g.append('g').attr('class','axis-x').attr('transform', `translate(0,${height})`);
      g.append('text').attr('class','chart-title').attr('x', width/2).attr('y', -10).attr('text-anchor','middle').style('font-size','16px');
      g.append('g').attr('class','country-labels');

      // Eixo x
      g.select('.axis-x')
        .append('text')
        .attr('class', 'x-axis-label')
        .attr('x', width / 2)
        .attr('y', 40)
        .attr('fill', 'currentColor')
        .style('text-anchor', 'middle')
        .style('font-size', '12px')
        .text('Número de Medalhas');
        
      // Cria grupo para a legenda (posicionado no canto inferior direito)
      const legend = g.append('g')
        .attr('class', 'medal-legend')
        .attr('transform', `translate(${width - 120}, ${height - 100})`); // Ajuste de posição

      // Dados para a legenda
      const medalTypes = [
        { type: 'GOLD', label: 'Ouro' },
        { type: 'SILVER', label: 'Prata' },
        { type: 'BRONZE', label: 'Bronze' }
      ];

      // Adiciona itens da legenda
      medalTypes.forEach((d, i) => {
        const legendItem = legend.append('g')
          .attr('transform', `translate(0, ${i * 20})`);

        legendItem.append('rect')
          .attr('width', 18)
          .attr('height', 18)
          .attr('fill', medalColors[d.type]);

        legendItem.append('text')
          .attr('x', 24)
          .attr('y', 9)
          .attr('dy', '0.35em')
          .style('font-size', '12px')
          .text(d.label);
      });

      // Adiciona título da legenda
      legend.append('text')
        .attr('x', 0)
        .attr('y', -10)
        .attr('class', 'legend-title')
        .text('Medalhas:');


      initialized = true;
    }
    d3.select('#chart .no-data-message-chart').remove();
    const filtered = countryMedalsData.filter(d => d.year <= selectedYear);
    if (!filtered.length) {
      g.select('.bars').selectAll('*').remove(); g.select('.country-labels').selectAll('*').remove(); 
      g.select('.axis-y-flags').selectAll('*').remove();
      g.select('.chart-title').text(`Nenhum dado acumulado até ${selectedYear}.`);
      return;
    }
    const nested = d3.rollup(
        filtered,
        v => {
            const medalMap = d3.rollup(v, vv => d3.sum(vv, d => d.count_medals || 0), d => d.medal_type);
            return { GOLD: medalMap.get('GOLD') || 0, SILVER: medalMap.get('SILVER') || 0, BRONZE: medalMap.get('BRONZE') || 0, country_code_iso2: v[0].country_code_iso2 };
        },
        d => d.country_name
    );
    let countries = Array.from(nested, ([country, data]) => ({ 
        country, GOLD: data.GOLD, SILVER: data.SILVER, BRONZE: data.BRONZE, 
        country_code_iso2: data.country_code_iso2 
    }));
    countries.forEach(d => d.total = d.GOLD + d.SILVER + d.BRONZE);

    const sortedAll = [...countries].sort((a, b) => b.total - a.total || b.GOLD - a.GOLD);
    let topN = sortedAll.slice(0, CHART_DISPLAY_LIMIT);
    
    let brazilDataPoint = countries.find(d => d.country === 'Brazil');
    if (!brazilDataPoint) { // Se Brasil não tem medalhas acumuladas, cria um objeto zerado
        brazilDataPoint = { country: 'Brazil', GOLD: 0, SILVER: 0, BRONZE: 0, total: 0, country_code_iso2: officialFlagData.get('Brazil') || 'BR' };
    } else if (!brazilDataPoint.country_code_iso2) { // Se tem medalhas mas não código, tenta buscar
        brazilDataPoint.country_code_iso2 = officialFlagData.get('Brazil') || 'BR';
    }
    
    const isBrazilInTopN = topN.some(d => d.country === 'Brazil');
    let display = [];
    if (isBrazilInTopN) {
        display = [...topN];
    } else {
        if (topN.length >= CHART_DISPLAY_LIMIT) {
            display = topN.slice(0, CHART_DISPLAY_LIMIT - 1); 
        } else {
            display = [...topN];
        }
        display.push(brazilDataPoint);
    }
    display.sort((a, b) => b.total - a.total || b.GOLD - a.GOLD);

    const x = d3.scaleLinear().domain([0, d3.max(display, d => d.total) || 10]).nice().range([0, width]);
    const y = d3.scaleBand().domain(display.map(d => d.country)).range([0, height]).padding(0.1);
    const stack = d3.stack().keys(['BRONZE','SILVER','GOLD']);
    const series = stack(display);
    g.select('.chart-title').text(`Medalhas Acumuladas até ${selectedYear}`);

    const yAxisFlags = g.select('.axis-y-flags').selectAll('g.tick-flag-group').data(display, d => d.country);
    yAxisFlags.join(
      enter => {
        const group = enter.append('g').attr('class', 'tick-flag-group');
        group.append('svg:image').attr('class', 'country-flag-axis')
            .attr('xlink:href', d => getCountryFlagUrl(d.country, d.country_code_iso2))
            .attr('x', -45).attr('y', d => y(d.country) + y.bandwidth() / 2 - 10)
            .attr('width', 30).attr('height', 20).style('opacity', 0)
            .transition().duration(300).delay((d,i) => i * 50).style('opacity', 1);
        group.select('image.country-flag-axis').append("svg:title").text(d => d.country);
        group.append('line').attr('class', 'grid-line-y').attr('x1', 0).attr('x2', width)
            .attr('y1', d => y(d.country) + y.bandwidth() / 2).attr('y2', d => y(d.country) + y.bandwidth() / 2)
            .style('stroke-opacity', 0).transition().duration(800).style('stroke-opacity', 1);
        return group;
      },
      update => {
        update.select('image.country-flag-axis')
            .attr('xlink:href', d => getCountryFlagUrl(d.country, d.country_code_iso2))
            .transition().duration(800)
            .attr('y', d => y(d.country) + y.bandwidth() / 2 - 10).style('opacity', 1);
        update.select('image.country-flag-axis title').text(d => d.country);
        update.select('line.grid-line-y').transition().duration(800)
            .attr('y1', d => y(d.country) + y.bandwidth() / 2).attr('y2', d => y(d.country) + y.bandwidth() / 2)
            .style('stroke-opacity', 1);
        return update;
      },
      exit => exit.transition().duration(300).style('opacity', 0).remove()
    );
    
    g.select('.axis-x').transition().duration(800).call(d3.axisBottom(x));
    const nameSel = g.select('.country-labels').selectAll('text.country-label-text').data(display, d => d.country);
    nameSel.join(
      enter => enter.append('text').attr('class','country-label-text')
        .attr('y', d => y(d.country) + y.bandwidth()/2).attr('dy','0.35em').style('font-size','12px').text(d => d.country)
        .attr('x', d => { const bEP = x(d.total), tL = d.country.length * 6.5, p = 8; return (bEP + p + tL > width && bEP > tL + p) ? bEP - p : bEP + p; })
        .attr('text-anchor', d => { const bEP = x(d.total), tL = d.country.length * 6.5, p = 8; return (bEP + p + tL > width && bEP > tL + p) ? 'end' : 'start'; }),
      update => update.transition().duration(800)
        .attr('y', d => y(d.country) + y.bandwidth()/2).text(d => d.country)
        .attr('x', d => { const bEP = x(d.total), tL = d.country.length * 6.5, p = 8; return (bEP + p + tL > width && bEP > tL + p) ? bEP - p : bEP + p; })
        .attr('text-anchor', d => { const bEP = x(d.total), tL = d.country.length * 6.5, p = 8; return (bEP + p + tL > width && bEP > tL + p) ? 'end' : 'start'; }),
      exit => exit.remove()
    );
    const layers = g.select('.bars').selectAll('g.layer').data(series, s => s.key);
    let layerMerge = layers.enter().append('g').attr('class','layer').attr('fill', s => medalColors[s.key]).merge(layers);
    const bars = layerMerge.selectAll('rect').data(d => d.map(s => ({ ...s, countryName: s.data.country })), dd => dd.countryName);
    bars.join(
      enter => enter.append('rect').attr('y', d => y(d.countryName)).attr('height', y.bandwidth()).attr('x', d => x(d[0])).attr('width', 0)
        .call(sel => sel.transition().duration(800).attr('width', d => Math.max(0, x(d[1]) - x(d[0])))),
      update => update.transition().duration(800).attr('y', d => y(d.countryName)).attr('x', d => x(d[0])).attr('width', d => Math.max(0, x(d[1]) - x(d[0]))),
      exit => exit.transition().duration(800).attr('width',0).remove()
    );
    const labels = layerMerge.selectAll('text.medal-label').data(d => d.map(s => ({ ...s, countryName: s.data.country })), dd => dd.countryName);
    labels.join(
      enter => enter.append('text').attr('class','medal-label').attr('y', d => y(d.countryName) + y.bandwidth()/2).attr('dy','0.35em').style('font-size','8px').attr('fill','#000').attr('text-anchor','middle').text('')
        .call(sel => sel.transition().duration(800).attr('x', d => x(d[0]) + (Math.max(0, x(d[1]) - x(d[0])))/2).text(d => { const v = d[1]-d[0]; return v > (x.domain()[1]-x.domain()[0])*0.01 ? v : ''; })),
      update => update.transition().duration(800).attr('y', d => y(d.countryName) + y.bandwidth()/2).attr('x', d => x(d[0]) + (Math.max(0, x(d[1]) - x(d[0])))/2).text(d => { const v = d[1]-d[0]; return v > (x.domain()[1]-x.domain()[0])*0.01 ? v : ''; }),
      exit => exit.remove()
    );
  }

  function handleYearChange(event) { if (event && event.target) { selectedYear = +event.target.value; } }
  function togglePlay() {
    if (!years.length) return;
    if (isPlaying) { clearInterval(playInterval); } 
    else {
      let idx = years.indexOf(selectedYear);
      if (idx === -1 && years.length > 0) idx = 0;
      playInterval = setInterval(() => { idx = (idx + 1) % years.length; selectedYear = years[idx]; }, 1200);
    }
    isPlaying = !isPlaying;
  }
</script>

<svelte:head>
  <title>Histórico de Medalhas Olímpicas</title>
</svelte:head>

<style>
  #controls { margin-bottom: 20px; display: flex; align-items: center; gap: 15px; flex-wrap: wrap; padding: 10px; background-color: #f0f0f0; border-radius: 5px;}
  input[type='range'] { width: 250px; cursor: pointer;}
  button { padding: 8px 15px; border: none; border-radius: 4px; cursor: pointer; background-color: #007bff; color: #fff; font-weight: bold;}
  button:hover { background-color: #0056b3; }
  button:disabled { background-color: #ccc; cursor: not-allowed;}
  select { padding: 8px; border-radius: 4px; border: 1px solid #ccc; font-family: inherit; font-size: 1em;}
  #controls span { font-weight: bold; font-size: 1.1em; color: #333;}
  .cards-container { display: flex; flex-wrap: wrap; gap: 20px; margin-top: 30px; margin-bottom:30px; justify-content: center;}
  .card {display: flex; flex-direction: column; border: 1px solid #ddd; border-radius: 8px; padding: 20px; width: 320px; min-height: 280px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); background-color: #ffffff; transition: transform 0.2s ease-in-out;}
  .card:hover { transform: translateY(-5px); }
  .card h3 { margin-top: 0; color: #0056b3; font-size: 1.2em; border-bottom: 2px solid #007bff; padding-bottom: 10px; margin-bottom: 15px;}
  .card p, .card li { margin: 8px 0; color: #444; font-size: 0.95em; line-height: 1.5;}
  .card strong { color: #000; }
  .card ul { list-style-type: none; padding-left: 0; }
  .card li { padding: 5px 0; border-bottom: 1px dashed #eee; }
  .card li:last-child { border-bottom: none; }
  .card img.athlete-photo { max-width: 100%; height: auto; max-height: 180px; object-fit: contain; border-radius: 4px; margin-top:10px; margin-bottom: 10px; align-self: center; border:1px solid #eee;}
  .card img.flag-icon { height: 1em; vertical-align: middle; margin-left: 5px; border: 1px solid #ccc;}
  .photo-error-message {font-style: italic; color: #777; text-align: center; margin-top:10px;}
  .no-data-message, .no-data-message-chart { text-align: center; color: #777; font-size: 1.1em; margin-top: 20px; width: 100%;}
  
  /* :global(line.grid-line-y) { stroke: #e0e0e0; stroke-dasharray: 2,2; } */
  :global(.country-labels text) { fill: #222; }
  :global(.chart-title) { font-weight: bold; fill: #333; font-size: 18px !important;}
  :global(.axis-x .tick line) { stroke: #ccc; }
  :global(.axis-x .domain) { stroke: #ccc; }
  :global(.axis-x text) { fill: #333; font-size: 10px; }
  :global(#chart svg) { background-color: #f7f9fc; border-radius: 5px; }
  :global(.country-flag-axis) {}
</style>

<div id="controls">
  {#if years.length > 0}
    <label for="year-select">Ano:</label>
    <select id="year-select" bind:value={selectedYear}>
      {#each years as year_option (year_option)}
        <option value={year_option}>{year_option}</option>
      {/each}
    </select>
    <input type="range" min="{years[0]}" max="{years[years.length - 1]}" step="{years.length > 1 ? years[1] - years[0] : 1}" bind:value={selectedYear} on:input={handleYearChange} disabled={years.length === 0}/>
    <span>{selectedYear !== undefined ? selectedYear : 'N/A'}</span>
    <button on:click={togglePlay} disabled={years.length === 0}>{isPlaying ? 'Pause' : 'Play'}</button>
  {:else}
    <p>Carregando anos...</p>
  {/if}
</div>

<div id="chart">
    {#if countryMedalsData.length === 0 && years.length > 0 && !initialized} 
        <p class="no-data-message-chart">Aguardando dados do gráfico para {selectedYear}...</p>
    {/if}
</div>

{#if selectedYear !== undefined}
  {#if editionCardData}
    <div class="cards-container">
      {#if editionCardData.highlightedAthlete}
        <div class="card">
          <h3>Atleta Destaque: {editionCardData.year}</h3>
          {#if editionCardData.highlightedAthlete.scraped_direct_photo_url}
            <img class="athlete-photo" src="{editionCardData.highlightedAthlete.scraped_direct_photo_url}" alt="Foto de {editionCardData.highlightedAthlete.athlete_name}" onError="this.style.display='none'; const next = this.nextElementSibling; if(next) next.style.display='block';"/>
            <p class="photo-error-message" style="display:none;">Foto não pôde ser carregada.</p>
          {:else if editionCardData.highlightedAthlete.athlete_profile_url} 
            <p class="photo-error-message">Tentando carregar foto...</p>
          {:else}
            <p class="photo-error-message"><em>Foto não disponível.</em></p>
          {/if}
          <p><strong>Nome:</strong> {editionCardData.highlightedAthlete.athlete_name}</p>
          <p><strong>País:</strong> {editionCardData.highlightedAthlete.country_name}
            {#if editionCardData.highlightedAthlete.scraped_direct_flag_url}
              <img class="flag-icon" src="{editionCardData.highlightedAthlete.scraped_direct_flag_url}" alt="Bandeira de {editionCardData.highlightedAthlete.country_name}"/>
            {/if}
          </p>
          <p><strong>Medalhas:</strong>
            {#if (editionCardData.highlightedAthlete.GOLD || 0) > 0} <span style="color:{medalColors.GOLD}; font-weight:bold;">O:</span> {editionCardData.highlightedAthlete.GOLD} {/if}
            {#if (editionCardData.highlightedAthlete.SILVER || 0) > 0} <span style="color:{medalColors.SILVER}; font-weight:bold;">P:</span> {editionCardData.highlightedAthlete.SILVER} {/if}
            {#if (editionCardData.highlightedAthlete.BRONZE || 0) > 0} <span style="color:{medalColors.BRONZE}; font-weight:bold;">B:</span> {editionCardData.highlightedAthlete.BRONZE} {/if}
            (Total: {editionCardData.highlightedAthlete.total})
          </p>
        </div>
      {/if}
      <div class="card">
        <h3>Resumo Edição: {editionCardData.year}</h3>
        {#if editionCardData.countriesWithMedalsCount > 0 || editionCardData.totalMedalsInEdition > 0}
            <p><strong>Países com Medalhas:</strong> {editionCardData.countriesWithMedalsCount}</p>
            <p><strong>Total de Medalhas na Edição:</strong> {editionCardData.totalMedalsInEdition}</p>
        {:else}
            <p>Nenhuma medalha registrada.</p>
        {/if}
      </div>
      {#if editionCardData.topCountry && editionCardData.topCountry.total > 0}
      <div class="card">
        <h3>País Destaque na Edição</h3>
        <p><strong>País:</strong> {editionCardData.topCountry.country} 
            {#if getCountryFlagUrl(editionCardData.topCountry.country, editionCardData.topCountry.country_code_iso2)}
                <img class="flag-icon" src="{getCountryFlagUrl(editionCardData.topCountry.country, editionCardData.topCountry.country_code_iso2)}" alt="Bandeira de {editionCardData.topCountry.country}"/>
            {/if}
        </p>
        <p><strong><span style="color:{medalColors.GOLD}; font-weight:bold;">O:</span></strong> {editionCardData.topCountry.GOLD}, <strong><span style="color:{medalColors.SILVER}; font-weight:bold;">P:</span></strong> {editionCardData.topCountry.SILVER}, <strong><span style="color:{medalColors.BRONZE}; font-weight:bold;">B:</span></strong> {editionCardData.topCountry.BRONZE} (Total: {editionCardData.topCountry.total})</p>
      </div>
      {/if}
      {#if editionCardData.brazilData}
      <div class="card">
        <h3>Brasil: {editionCardData.year}</h3>
        {#if editionCardData.brazilData.total > 0}
          <p><strong><span style="color:{medalColors.GOLD}; font-weight:bold;">O:</span></strong> {editionCardData.brazilData.GOLD}, <strong><span style="color:{medalColors.SILVER}; font-weight:bold;">P:</span></strong> {editionCardData.brazilData.SILVER}, <strong><span style="color:{medalColors.BRONZE}; font-weight:bold;">B:</span></strong> {editionCardData.brazilData.BRONZE}</p>
          <p><strong>Total de Medalhas:</strong> {editionCardData.brazilData.total}</p>
          <p><strong>Ranking na Edição:</strong> {editionCardData.brazilRankInEdition}</p>
        {:else}
          <p>Brasil sem medalhas ou não participou.</p>
        {/if}
      </div>
      {/if}
      {#if editionCardData.topCountriesInEdition && editionCardData.topCountriesInEdition.length > 0}
      <div class="card">
        <h3>Top {TOP_N_RANKING_CARDS} Países na Edição</h3> 
        <ul>
          {#each editionCardData.topCountriesInEdition as countryRank, i}
            <li><strong>{i + 1}. {countryRank.country}</strong> 
                {#if getCountryFlagUrl(countryRank.country, countryRank.country_code_iso2)}
                    <img class="flag-icon" src="{getCountryFlagUrl(countryRank.country, countryRank.country_code_iso2)}" alt="Bandeira de {countryRank.country}"/>
                {/if}
                <br/>(<span style="color:{medalColors.GOLD}; font-weight:bold;">O:</span>{countryRank.GOLD}, <span style="color:{medalColors.SILVER}; font-weight:bold;">P:</span>{countryRank.SILVER}, <span style="color:{medalColors.BRONZE}; font-weight:bold;">B:</span>{countryRank.BRONZE}, T:{countryRank.total})
            </li>
          {/each}
        </ul>
      </div>
      {/if}
      {#if editionCardData.topAthletesInEdition && editionCardData.topAthletesInEdition.length > 0}
      <div class="card">
        <h3>Top {TOP_N_RANKING_CARDS} Atletas na Edição</h3>
        <ul>
          {#each editionCardData.topAthletesInEdition as athleteRank, i}
            <li><strong>{i + 1}. {athleteRank.athlete_name} ({athleteRank.country_name || 'N/A'})</strong>
                {#if getCountryFlagUrl(athleteRank.country_name, athleteRank.country_code_iso2)}
                     <img class="flag-icon" src="{getCountryFlagUrl(athleteRank.country_name, athleteRank.country_code_iso2)}" alt="Bandeira de {athleteRank.country_name}"/>
                {/if}
                <br/>(<span style="color:{medalColors.GOLD}; font-weight:bold;">O:</span>{athleteRank.GOLD}, <span style="color:{medalColors.SILVER}; font-weight:bold;">P:</span>{athleteRank.SILVER}, <span style="color:{medalColors.BRONZE}; font-weight:bold;">B:</span>{athleteRank.BRONZE}, T:{athleteRank.total})
            </li>
          {/each}
        </ul>
      </div>
      {:else if editionCardData.year && athleteMedalsData.length > 0} 
        <div class="card">
            <h3>Top {TOP_N_RANKING_CARDS} Atletas na Edição</h3>
            <p>Nenhum atleta com medalhas registrado.</p>
        </div>
      {:else if editionCardData.year}
         <div class="card">
            <h3>Top {TOP_N_RANKING_CARDS} Atletas na Edição</h3>
            <p>Dados de atletas não disponíveis.</p>
        </div>
      {/if}
    </div>
  {:else if selectedYear !== undefined}
    <p class="no-data-message">Processando dados para {selectedYear}...</p>
  {/if}
{:else if years.length > 0 }
    <p class="no-data-message">Selecione um ano para ver os detalhes.</p>
{:else}
    <p class="no-data-message">Aguardando carregamento...</p>
{/if}