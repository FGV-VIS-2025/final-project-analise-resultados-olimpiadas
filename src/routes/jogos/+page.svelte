<script>
  import { onMount } from 'svelte';
  import * as d3 from 'd3';
  import { base } from '$app/paths'; // Se estiver usando SvelteKit

  let countryMedalsCsvUrl = `${base}/medals_by_country.csv`;
  let athleteMedalsCsvUrl = `${base}/athlete_medals_by_edition.csv`;

  let countryMedalsData = [];
  let athleteMedalsData = [];
  let years = [];
  let selectedYear;
  let playInterval;
  let isPlaying = false;
  let editionCardData = null;
  const TOP_N_RANKING = 5;

  const margin = { top: 40, right: 20, bottom: 50, left: 140 };
  const width = 800 - margin.left - margin.right;
  const height = 600 - margin.top - margin.bottom;
  const medalColors = { GOLD: '#ffd700', SILVER: '#c0c0c0', BRONZE: '#cd7f32' };

  // Cache para a função fetchAthleteMedia
  const cache = new Map();

  // Função para buscar foto e bandeira (adaptada do seu exemplo)
  async function fetchAthleteMedia(profileUrl) {
    const k = profileUrl || '';
    if (!k) return { photo: '', flag: '' };

    if (cache.has(k)) {
        return cache.get(k);
    }

    try {
        // Aviso: Esta requisição client-side para um domínio diferente pode ser bloqueada por CORS.
        const response = await fetch(profileUrl);
        if (!response.ok) {
            console.error(`Erro ao buscar página de perfil ${profileUrl}: ${response.status} ${response.statusText}`);
            cache.set(k, { photo: '', flag: '' }); // Cacheia a falha para não tentar repetidamente
            return { photo: '', flag: '' };
        }
        const html = await response.text();
        const d = new DOMParser().parseFromString(html, 'text/html');
        
        // Tenta encontrar a URL da foto e da bandeira usando seletores comuns ou os que você usa
        // Estes seletores podem precisar de ajuste para o site específico (ex: olympics.com)
        let photoSrc = d.querySelector('section picture img')?.src || 
                       d.querySelector('img.img-profile-header')?.src || 
                       d.querySelector('.athlete-profile-hero__image-container img')?.src || // Exemplo de outro possível seletor
                       ''; 
        let flagSrc = d.querySelector('section img[alt][src*="noc"]')?.src || 
                      d.querySelector('.profile-header--country-flag')?.src || 
                      d.querySelector('. गर्मियों में पानी की कमी से निपटने के उपाय img.country-flag')?.src || // Exemplo de outro possível seletor
                      '';

        // Converte URLs relativas em absolutas
        if (photoSrc && !photoSrc.startsWith('http')) {
            try { photoSrc = new URL(photoSrc, profileUrl).href; } catch (e) { photoSrc = ''; }
        }
        if (flagSrc && !flagSrc.startsWith('http')) {
            try { flagSrc = new URL(flagSrc, profileUrl).href; } catch (e) { flagSrc = ''; }
        }
        
        const media = { photo: photoSrc, flag: flagSrc };
        cache.set(k, media);
        return media;
    } catch (e) {
        console.error('Erro na função fetchAthleteMedia para URL:', profileUrl, e);
        cache.set(k, { photo: '', flag: '' }); // Cacheia a falha
        return { photo: '', flag: '' };
    }
  }


  onMount(async () => {
    try {
      const [csvCountryData, csvAthleteData] = await Promise.all([
        d3.csv(countryMedalsCsvUrl, d3.autoType).catch(err => {
          console.error(`Falha ao carregar ${countryMedalsCsvUrl}:`, err);
          return [];
        }),
        d3.csv(athleteMedalsCsvUrl, d3.autoType).catch(err => {
          console.error(`Falha ao carregar ${athleteMedalsCsvUrl}:`, err);
          return [];
        })
      ]);

      countryMedalsData = csvCountryData;
      athleteMedalsData = csvAthleteData;

      if (countryMedalsData.length > 0) {
          years = Array.from(new Set(countryMedalsData.map(d => d.year))).sort((a, b) => a - b);
          if (years.length > 0) {
              selectedYear = years[0];
          } else {
            years = [];
            selectedYear = undefined;
          }
      } else {
          years = [];
          selectedYear = undefined;
      }
    } catch (error) {
        console.error("Erro geral no onMount:", error);
        countryMedalsData = []; athleteMedalsData = []; years = []; selectedYear = undefined;
    }
  });

  // A função updateEditionCardsInfo precisa ser async pois processYearData agora é async
  async function updateEditionCardsInfo() {
    if (selectedYear === undefined) {
      editionCardData = null;
      return;
    }
    // O resultado de processYearData (que é uma Promise) é atribuído, 
    // Svelte vai lidar com a atualização quando a Promise resolver.
    editionCardData = await processYearData(selectedYear); 
  }

  $: if (selectedYear !== undefined) {
    drawChart(); // drawChart não é async, atualiza o DOM sincronamente com dados já carregados
    updateEditionCardsInfo(); // Esta vai atualizar editionCardData assincronamente
  }

  // processYearData agora é async para poder usar await com fetchAthleteMedia
  async function processYearData(year) {
    let countriesWithMedalsCount = 0;
    let totalMedalsInEdition = 0;
    let topCountryOutput = { country: 'N/A', GOLD: 0, SILVER: 0, BRONZE: 0, total: 0 };
    let brazilDataForCards = { country: 'Brazil', GOLD: 0, SILVER: 0, BRONZE: 0, total: 0 };
    let brazilRankInEdition = 'N/A';
    let topCountriesInEditionOutput = [];
    let topAthletesInEditionOutput = [];
    let highlightedAthleteOutput = null;

    if (countryMedalsData.length > 0) {
        const yearSpecificCountryData = countryMedalsData.filter(d => d.year === year);
        if (yearSpecificCountryData.length > 0) {
            const nestedYearCountries = d3.rollup(
              yearSpecificCountryData,
              v => d3.rollup(v, vv => d3.sum(vv, d => d.count_medals || 0), d => d.medal_type),
              d => d.country_name
            );
            let countriesYear = Array.from(nestedYearCountries, ([country, medalMap]) => ({
              country, GOLD: medalMap.get('GOLD') || 0, SILVER: medalMap.get('SILVER') || 0,
              BRONZE: medalMap.get('BRONZE') || 0,
              total: (medalMap.get('GOLD') || 0) + (medalMap.get('SILVER') || 0) + (medalMap.get('BRONZE') || 0)
            }));
            countriesYear.sort((a, b) => b.total - a.total || b.GOLD - a.GOLD);
            topCountriesInEditionOutput = countriesYear.slice(0, TOP_N_RANKING);
            totalMedalsInEdition = d3.sum(countriesYear, d => d.total);
            countriesWithMedalsCount = countriesYear.length;
            topCountryOutput = countriesYear.length > 0 ? countriesYear[0] : topCountryOutput;
            const brazilFound = countriesYear.find(d => d.country === 'Brazil');
            if (brazilFound) {
                brazilDataForCards = brazilFound;
                brazilRankInEdition = brazilFound.total > 0 ? countriesYear.findIndex(d => d.country === 'Brazil') + 1 : 'N/A (sem medalhas)';
            } else {
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
                    let profileUrl = null; 
                    let countryName = null;
                    v.forEach(medalEntry => {
                        medals[medalEntry.medal_type] = (medals[medalEntry.medal_type] || 0) + 1; // Contar medalhas
                        if (!profileUrl) profileUrl = medalEntry.athlete_photo_url; // Captura a URL do perfil
                        if (!countryName) countryName = medalEntry.country_name;
                    });
                    return {
                        ...medals, total: medals.GOLD + medals.SILVER + medals.BRONZE,
                        athlete_profile_url: profileUrl, // URL do perfil para scraping
                        country_name: countryName
                    };
                },
                d => d.athlete_name
            );

            let athletesDetails = Array.from(athleteMedalCounts, ([name, data]) => ({
                athlete_name: name, ...data
            }));

            athletesDetails.sort((a, b) => b.total - a.total || b.GOLD - a.GOLD || b.SILVER - b.SILVER);
            topAthletesInEditionOutput = athletesDetails.slice(0, TOP_N_RANKING);

            if (topAthletesInEditionOutput.length > 0) {
                const candidateAthlete = topAthletesInEditionOutput[0];
                let scrapedPhotoUrl = '';
                let scrapedFlagUrl = '';

                if (candidateAthlete.athlete_profile_url) { // Usa a URL do perfil para o scraping
                    const media = await fetchAthleteMedia(candidateAthlete.athlete_profile_url);
                    scrapedPhotoUrl = media.photo; // URL direta da imagem, se encontrada
                    scrapedFlagUrl = media.flag;   // URL direta da bandeira, se encontrada
                }
                
                highlightedAthleteOutput = {
                    ...candidateAthlete, // name, country_name, G,S,B, total, athlete_profile_url
                    scraped_direct_photo_url: scrapedPhotoUrl,
                    scraped_direct_flag_url: scrapedFlagUrl
                };
            }
        }
    }

    return {
      year: year, countriesWithMedalsCount, totalMedalsInEdition,
      topCountry: topCountryOutput, brazilData: brazilDataForCards, brazilRankInEdition,
      topCountriesInEdition: topCountriesInEditionOutput,
      topAthletesInEdition: topAthletesInEditionOutput, // Para o card "Top Atletas"
      highlightedAthlete: highlightedAthleteOutput    // Para o card "Atleta Destaque" com foto
    };
  }

  function drawChart() {
    d3.select('#chart svg').remove(); 
    d3.select('#chart .no-data-message-chart').remove();

    if (countryMedalsData.length === 0 || selectedYear === undefined) {
        d3.select('#chart').append('p').attr('class', 'no-data-message-chart').text(`Dados para o gráfico principal não disponíveis.`);
        return;
    }
    const filtered = countryMedalsData.filter(d => d.year <= selectedYear);
    if (filtered.length === 0) {
        d3.select('#chart').append('p').attr('class', 'no-data-message-chart').text(`Sem dados de medalhas acumulados para exibir até ${selectedYear}.`);
        return;
    }
    const nested = d3.rollup(
      filtered,
      v => d3.rollup(v, vv => d3.sum(vv, d => d.count_medals || 0), d => d.medal_type),
      d => d.country_name
    );
    let countries = Array.from(nested, ([country, medalMap]) => ({
      country, GOLD: medalMap.get('GOLD') || 0, SILVER: medalMap.get('SILVER') || 0, BRONZE: medalMap.get('BRONZE') || 0,
      total: (medalMap.get('GOLD') || 0) + (medalMap.get('SILVER') || 0) + (medalMap.get('BRONZE') || 0)
    }));
    const sortedAll = [...countries].sort((a, b) => b.total - a.total || b.GOLD - a.GOLD);
    const brazil = sortedAll.find(d => d.country === 'Brazil'); 
    let display = [...sortedAll.slice(0, 10)];
    if (brazil && brazil.total > 0 && !display.some(d => d.country === 'Brazil')) {
        if (display.length >= 10) display.pop();
        display.push(brazil);
    }
    display.sort((a,b) => b.total - a.total || b.GOLD - a.GOLD);
    const ranks = display.map((d) => (sortedAll.findIndex(s => s.country === d.country) +1) || 'N/A');
    const x = d3.scaleLinear().domain([0, d3.max(display, d => d.total) || 10]).nice().range([0, width]);
    const y = d3.scaleBand().domain(display.map(d => d.country)).range([0, height]).padding(0.1);
    const stack = d3.stack().keys(['BRONZE','SILVER','GOLD']);
    const series = stack(display.map(countryData => ({ ...countryData })));
    const svgBase = d3.select('#chart').append('svg')
      .attr('width', width + margin.left + margin.right).attr('height', height + margin.top + margin.bottom);
    const g = svgBase.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    g.append('g').attr('class','axis-ranks'); g.append('g').attr('class','axis-y');
    g.append('g').attr('class','bars'); g.append('g').attr('class','axis-x').attr('transform', `translate(0,${height})`);
    g.append('text').attr('class','chart-title').attr('x', width/2).attr('y', -margin.top/2)
      .attr('text-anchor','middle').style('font-size','16px').text(`Top Países (e Brasil) - Acumulado até ${selectedYear}`);
    g.append('g').attr('class','country-labels');
    g.select('.axis-ranks').selectAll('text.rank-label').data(display, d => d.country)
      .join(
        enter => enter.append('text').attr('class', 'rank-label').attr('x', -10).attr('y', d => y(d.country) + y.bandwidth()/2)
          .attr('dy','0.35em').attr('text-anchor','end').style('font-size','12px').text((d,i) => ranks[i]),
        update => update.transition().duration(800).attr('y', d => y(d.country) + y.bandwidth()/2).text((d,i) => ranks[i]),
        exit => exit.remove()
      );
    g.select('.country-labels').selectAll('text.country-label-text').data(display, d => d.country)
      .join(
        enter => enter.append('text').attr('class', 'country-label-text').attr('x', d => x(d.total) + 5).attr('y', d => y(d.country) + y.bandwidth()/2)
          .attr('dy','0.35em').attr('text-anchor','start').style('font-size','12px').text(d => d.country),
        update => update.transition().duration(800).attr('x', d => x(d.total) + 5).attr('y', d => y(d.country) + y.bandwidth()/2).text(d => d.country),
        exit => exit.remove()
      );
    g.select('.axis-y').transition().duration(800).call(d3.axisLeft(y).tickFormat(''));
    g.select('.axis-x').transition().duration(800).call(d3.axisBottom(x));
    g.select('.bars').selectAll('g.layer').data(series, s => s.key)
      .join(enter => enter.append('g').attr('class','layer').attr('fill', s => medalColors[s.key]));
    g.selectAll('g.layer').selectAll('rect').data(d => d.map(s => ({...s, countryName: s.data.country})), dd => dd.countryName)
      .join(
        enter => enter.append('rect').attr('y', d => y(d.countryName)).attr('height', y.bandwidth())
          .attr('x', d => x(d[0])).attr('width', 0)
          .call(sel => sel.transition().duration(800).attr('width', d => Math.max(0, x(d[1]) - x(d[0])))),
        update => update.transition().duration(800).attr('y', d => y(d.countryName)).attr('x', d => x(d[0]))
          .attr('width', d => Math.max(0, x(d[1]) - x(d[0]))),
        exit => exit.transition().duration(800).attr('width',0).remove()
      );
    g.selectAll('g.layer').selectAll('text.medal-label').data(d => d.map(s => ({...s, countryName: s.data.country})), dd => dd.countryName)
      .join(
        enter => enter.append('text').attr('class','medal-label').attr('y', d => y(d.countryName) + y.bandwidth()/2).attr('dy','0.35em')
          .style('font-size','8px').attr('fill','#000').attr('text-anchor','middle').text('')
          .call(sel => sel.transition().duration(800).attr('x', d => x(d[0]) + (Math.max(0, x(d[1]) - x(d[0])))/2).text(d => d[1] - d[0] > 0 ? d[1] - d[0] : '')),
        update => update.transition().duration(800).attr('y', d => y(d.countryName) + y.bandwidth()/2)
          .attr('x', d => x(d[0]) + (Math.max(0, x(d[1]) - x(d[0])))/2).text(d => d[1] - d[0] > 0 ? d[1] - d[0] : ''),
        exit => exit.remove()
      );
  }

  function handleYearChange(event) {
    selectedYear = +event.target.value;
  }
  
  function togglePlay() {
    if (!years || years.length === 0) return;
    if (isPlaying) {
      clearInterval(playInterval);
    } else {
      let idx = years.indexOf(selectedYear);
      if (idx === years.length -1 && years.length > 1 ) idx = -1; 
      playInterval = setInterval(() => {
        idx = idx + 1;
        if (idx >= years.length) {
            clearInterval(playInterval); isPlaying = false;
            if (years.length > 0) selectedYear = years[years.length-1];
            return;
        }
        selectedYear = years[idx];
      }, 1200);
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
  select { padding: 8px; border-radius: 4px; border: 1px solid #ccc; }
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

  :global(.axis-y .tick line) { stroke: #ccc; }
  :global(.axis-y .domain) { stroke: #ccc; }
  :global(.axis-ranks text) { fill: #333; font-weight: bold;}
  :global(.country-labels text) { fill: #222; }
  :global(.chart-title) { font-weight: bold; fill: #333; font-size: 18px !important;}
  :global(.axis-x .tick line) { stroke: #ccc; }
  :global(.axis-x .domain) { stroke: #ccc; }
  :global(.axis-x text) { fill: #333; font-size: 10px; }
  :global(#chart svg) { background-color: #f7f9fc; border-radius: 5px; }
</style>

<div id="controls">
  <label for="year-select">Edição (Ano):</label>
  {#if years.length > 0 && selectedYear !== undefined}
    <select id="year-select" bind:value={selectedYear} on:change={handleYearChange}>
      {#each years as year}
        <option value={year}>{year}</option>
      {/each}
    </select>
    <input type="range" min="{years[0]}" max="{years[years.length - 1]}" step="1" bind:value={selectedYear} on:input={handleYearChange} />
    <span>{selectedYear}</span>
    <button on:click={togglePlay} disabled={!years || years.length === 0}>{isPlaying ? 'Pause' : 'Play'}</button>
  {:else if years.length === 0 && (countryMedalsData.length > 0 || athleteMedalsData.length > 0) && selectedYear === undefined}
    <span>Nenhum ano válido encontrado. Verifique os CSVs.</span>
  {:else}
    <span>Carregando dados...</span>
  {/if}
</div>

<div id="chart"></div>

{#if selectedYear !== undefined}
  {#if editionCardData}
    <div class="cards-container">
      {#if editionCardData.highlightedAthlete}
        <div class="card">
          <h3>Atleta Destaque: {editionCardData.year}</h3>
          {#if editionCardData.highlightedAthlete.scraped_direct_photo_url}
            <img 
              class="athlete-photo" 
              src="{editionCardData.highlightedAthlete.scraped_direct_photo_url}" 
              alt="Foto de {editionCardData.highlightedAthlete.athlete_name}"
              onError="this.style.display='none'; this.nextElementSibling.style.display='block';"
            />
            <p class="photo-error-message" style="display:none;">Foto não pôde ser carregada.</p>
          {:else if editionCardData.highlightedAthlete.athlete_profile_url} 
            <p class="photo-error-message">Tentando carregar foto... (Se não aparecer, pode ser devido a restrições do site de origem ou foto não encontrada na página do atleta).</p>
          {:else}
            <p class="photo-error-message"><em>Foto não disponível (URL do perfil não encontrada).</em></p>
          {/if}
          <p><strong>Nome:</strong> {editionCardData.highlightedAthlete.athlete_name}</p>
          <p><strong>País:</strong> 
            {editionCardData.highlightedAthlete.country_name}
            {#if editionCardData.highlightedAthlete.scraped_direct_flag_url}
              <img class="flag-icon" src="{editionCardData.highlightedAthlete.scraped_direct_flag_url}" alt="Bandeira de {editionCardData.highlightedAthlete.country_name}"/>
            {/if}
          </p>
          <p>
            <strong>Medalhas:</strong>
            {#if (editionCardData.highlightedAthlete.GOLD || 0) > 0} O: {editionCardData.highlightedAthlete.GOLD} {/if}
            {#if (editionCardData.highlightedAthlete.SILVER || 0) > 0} P: {editionCardData.highlightedAthlete.SILVER} {/if}
            {#if (editionCardData.highlightedAthlete.BRONZE || 0) > 0} B: {editionCardData.highlightedAthlete.BRONZE} {/if}
            (Total: {editionCardData.highlightedAthlete.total})
          </p>
        </div>
      {/if}

      <div class="card">
        <h3>Resumo: {editionCardData.year}</h3>
        {#if editionCardData.countriesWithMedalsCount > 0 || editionCardData.totalMedalsInEdition > 0}
            <p><strong>Países com Medalhas:</strong> {editionCardData.countriesWithMedalsCount}</p>
            <p><strong>Total de Medalhas:</strong> {editionCardData.totalMedalsInEdition}</p>
        {:else}
            <p>Nenhuma medalha registrada para esta edição.</p>
        {/if}
      </div>
      
      {#if editionCardData.topCountry && editionCardData.topCountry.total > 0}
      <div class="card">
        <h3>País Destaque</h3>
        <p><strong>País:</strong> {editionCardData.topCountry.country}</p>
        <p><strong>O:</strong> {editionCardData.topCountry.GOLD}, <strong>P:</strong> {editionCardData.topCountry.SILVER}, <strong>B:</strong> {editionCardData.topCountry.BRONZE} (Total: {editionCardData.topCountry.total})</p>
      </div>
      {/if}
      
      {#if editionCardData.brazilData}
      <div class="card">
        <h3>Brasil: {editionCardData.year}</h3>
        {#if editionCardData.brazilData.total > 0}
          <p><strong>O:</strong> {editionCardData.brazilData.GOLD}, <strong>P:</strong> {editionCardData.brazilData.SILVER}, <strong>B:</strong> {editionCardData.brazilData.BRONZE}</p>
          <p><strong>Total de Medalhas:</strong> {editionCardData.brazilData.total}</p>
          <p><strong>Ranking na Edição:</strong> {editionCardData.brazilRankInEdition}</p>
        {:else}
          <p>O Brasil não obteve medalhas ou não participou.</p>
        {/if}
      </div>
      {/if}

      {#if editionCardData.topCountriesInEdition && editionCardData.topCountriesInEdition.length > 0}
      <div class="card">
        <h3>Top {TOP_N_RANKING} Países na Edição</h3>
        <ul>
          {#each editionCardData.topCountriesInEdition as countryRank, i}
            <li><strong>{i + 1}. {countryRank.country}</strong> (O:{countryRank.GOLD}, P:{countryRank.SILVER}, B:{countryRank.BRONZE}, T:{countryRank.total})</li>
          {/each}
        </ul>
      </div>
      {/if}

      {#if editionCardData.topAthletesInEdition && editionCardData.topAthletesInEdition.length > 0}
      <div class="card">
        <h3>Top {TOP_N_RANKING} Atletas na Edição</h3>
        <ul>
          {#each editionCardData.topAthletesInEdition as athleteRank, i}
            <li><strong>{i + 1}. {athleteRank.athlete_name} ({athleteRank.country_name})</strong><br/>(O:{athleteRank.GOLD}, P:{athleteRank.SILVER}, B:{athleteRank.BRONZE}, T:{athleteRank.total})</li>
          {/each}
        </ul>
      </div>
      {:else if editionCardData.year && athleteMedalsData.length > 0} 
        <div class="card">
            <h3>Top {TOP_N_RANKING} Atletas na Edição</h3>
            <p>Nenhum atleta no ranking para esta edição.</p>
        </div>
      {:else if editionCardData.year}
         <div class="card">
            <h3>Top {TOP_N_RANKING} Atletas na Edição</h3>
            <p>Dados de atletas não disponíveis no CSV específico.</p>
        </div>
      {/if}
    </div>
  {:else if selectedYear !== undefined}
    <p class="no-data-message">Processando dados para {selectedYear} ou dados não encontrados...</p>
  {/if}
{:else}
    <p class="no-data-message">Aguardando carregamento dos dados...</p>
{/if}