<script>
	import { onMount, tick } from 'svelte';
	import * as d3 from 'd3';
	import { base } from '$app/paths';
	import { page } from '$app/stores';

	// Section: Data Stores
	let allMetadata = [];
	let allPairs = [];
	let events = [];
	let athletes = [];
	let eventsMap = new Map();

	// Section: Filter States
	let selectedEvent = '';
	let eventSearch = '';
	let eventSuggestions = [];
	let athleteSearch = '';
	let suggestions = [];
	let selectedValueType = '';

	// Section: Graph & UI States
	let graph = { nodes: [], links: [] };
	let legendCompetitors = [];
	let simulation;
	let isLoading = true;
	let centralNode = null;
	let hoveredNode = null;
	let hoveredCompetitionDetails = [];
	let mousePosition = { x: 0, y: 0 };
	let zoomTransform = d3.zoomIdentity;
	
	// Section: Visualization Parameters
	const width = 1000;
	const height = 600;
	const nodeRadius = 8;
	const centralNodeRadius = 15;
	const baseRingRadius = 250;

	// --- Logic ---
	const valueTypes = ['TIME', 'DISTANCE', 'WEIGHT'];
	const valueTypeLabels = {
		'TIME': 'Tempo',
		'DISTANCE': 'Distância',
		'WEIGHT': 'Peso'
	};

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
		"Jamaica": "JM", "Ukraine": "UA", "Iran": "IR", "India": "IN", "Chinese Taipei": "TW", "Nigeria": "NG"
	};

	const localFlagOverrides = {
		'Soviet Union': `${base}/missing_flags/soviet_union.png`,
		'German Democratic Republic (Germany)': `${base}/missing_flags/east_germany.png`,
		'Federal Republic of Germany': `${base}/missing_flags/west_germany.png`,
		'Unified Team': `${base}/missing_flags/unified_team.png`,
	};

	function getFlagUrl(countryName, countryCode) {
		if (countryName && localFlagOverrides[countryName]) {
			return localFlagOverrides[countryName];
		}
		
		let finalCode = countryCode;
		if (!finalCode && countryName) {
			finalCode = countryCodeMapping[countryName];
		}

		if (finalCode) {
			return `https://flagcdn.com/w40/${finalCode.toLowerCase()}.png`;
		}
		
		return '';
	}
	
	// Section: Lifecycle
	onMount(async () => {
		let athleteFromUrl = null;

		try {
			const [pairsResponse, metadataResponse] = await Promise.all([
				fetch(`${base}/athlete_pairs.csv`),
				fetch(`${base}/df_all.csv`)
			]);
			allPairs = d3.csvParse(await pairsResponse.text());
			allMetadata = d3.csvParse(await metadataResponse.text());
			
			processInitialData();

			const urlParams = $page.url.searchParams;
			athleteFromUrl = urlParams.get('athlete');

		} catch (error) {
			console.error('Error loading data:', error);
		} finally {
			isLoading = false;
			await tick(); 

			if (athleteFromUrl) {
				const decodedAthlete = decodeURIComponent(athleteFromUrl);
				selectSuggestion(decodedAthlete);
			} else {
				renderGraph();
			}
		}

		const handleMouseMove = (event) => {
			mousePosition = { x: event.clientX, y: event.clientY };
		};
		window.addEventListener('mousemove', handleMouseMove);

		return () => {
			window.removeEventListener('mousemove', handleMouseMove);
		};
	});

	// Section: Data Processing
	function processInitialData() {
		allMetadata.forEach(row => {
			const key = `${row.event_title}|${row.ano}`;
			if (!eventsMap.has(key)) {
				eventsMap.set(key, []);
			}
			eventsMap.get(key).push(row);
    	});

		updateAvailableEvents();
	}

	function updateAvailableEvents() {
		let availableMetadata = allMetadata;
		if (selectedValueType) {
			availableMetadata = allMetadata.filter(d => d.value_type === selectedValueType);
		}
		events = [...new Set(availableMetadata.map(d => d.event_title).filter(Boolean))].sort();
		updateAvailableAthletes();
	}

	function updateAvailableAthletes() {
		let availableMetadata = allMetadata;
		if (selectedValueType) {
			availableMetadata = availableMetadata.filter(d => d.value_type === selectedValueType);
		}
		if (selectedEvent) {
			availableMetadata = availableMetadata.filter(d => d.event_title === selectedEvent);
		}
		athletes = [...new Set(availableMetadata.map(d => d.athlete_full_name).filter(Boolean))].sort();
	}

	function createAthleteGraph(athleteName) {
		centralNode = {
			id: athleteName,
			label: athleteName,
			isCentral: true,
			...getAthleteMetadata(athleteName)
		};

		centralNode.fx = width / 2;
		centralNode.fy = height / 2;
		
		const competitorMap = new Map();
		
		allPairs.forEach(pair => {
			let competitor = null;
			if (pair.athlete1 === athleteName) competitor = pair.athlete2;
			if (pair.athlete2 === athleteName) competitor = pair.athlete1;
			
			if (competitor) {
				const weight = parseInt(pair.competitions, 10);
				const currentWeight = competitorMap.has(competitor) ? competitorMap.get(competitor).weight : 0;
				competitorMap.set(competitor, { weight: currentWeight + weight });
			}
		});

		const competitorNodes = Array.from(competitorMap.entries()).map(([name, data]) => ({
			id: name,
			label: name,
			isCentral: false,
			competitions: data.weight,
			...getAthleteMetadata(name)
		}));
		
		const nodes = [centralNode, ...competitorNodes];
		const links = competitorNodes.map(competitor => ({
			source: centralNode.id,
			target: competitor.id,
			weight: competitor.competitions
		}));
		
		graph = { nodes, links };
		legendCompetitors = competitorNodes.sort((a,b) => b.competitions - a.competitions);
		initGraph();
	}

	function getAthleteMetadata(athleteName) {
		const meta = allMetadata.find(d => d.athlete_full_name === athleteName);
		if (!meta) return { country: 'N/A', event: 'N/A', country_code: null };
		return {
			country: meta.country_name,
			event: meta.event_title,
			country_code: meta.country_code
		};
	}

	function findCommonCompetitions(centralAthleteName, hoveredAthleteName) {
		const common = [];
		for (const [key, participants] of eventsMap.entries()) {
			const centralAthleteData = participants.find(p => p.athlete_full_name === centralAthleteName);
			const hoveredAthleteData = participants.find(p => p.athlete_full_name === hoveredAthleteName);

			if (centralAthleteData && hoveredAthleteData) {
				const [event_title, ano] = key.split('|');
				common.push({
					event: event_title,
					year: ano,
					centralValue: centralAthleteData.value_unit || 'N/A',
					hoveredValue: hoveredAthleteData.value_unit || 'N/A'
				});
			}
		}
		return common.sort((a,b) => b.year - a.year);
	}

	$: {
		if (hoveredNode && !hoveredNode.isCentral && centralNode) {
			hoveredCompetitionDetails = findCommonCompetitions(centralNode.id, hoveredNode.id);
		} else {
			hoveredCompetitionDetails = [];
		}
	}

	function initGraph() {
		if (simulation) simulation.stop();

		if (graph.nodes.length <= 1) {
			renderGraph();
			return;
		}

		simulation = d3.forceSimulation(graph.nodes)
			.force('charge', d3.forceManyBody().strength(-50))
			.force('center', d3.forceCenter(width / 2, height / 2))
			.force('radial', d3.forceRadial(d => d.isCentral ? 0 : baseRingRadius / d.competitions)
				.x(width / 2)
				.y(height / 2)
				.strength(1)
			)
			.force('collision', d3.forceCollide().radius(d => (d.isCentral ? centralNodeRadius : nodeRadius) + 10));
		
		renderGraph();
	}

	function renderGraph() {
		const svg = d3.select('#graph-svg');
		svg.selectAll('*').remove();

		if (!centralNode) {
			svg.append('text')
				.attr('class', 'placeholder-text')
				.attr('x', width / 2)
				.attr('y', height / 2)
				.attr('text-anchor', 'middle')
				.text('Filtre e busque por um atleta para começar.');
			return;
		}
		
		const zoomGroup = svg.append('g').attr('class', 'zoom-group');
		
		const defs = zoomGroup.append('defs');

		defs.append('pattern')
			.attr('id', 'olympic-rings')
			.attr('height', '100%')
			.attr('width', '100%')
			.attr('patternContentUnits', 'objectBoundingBox')
			.append('image')
			.attr('xlink:href', `${base}/olympic_rings.svg`)
			.attr('height', 1)
			.attr('width', 1)
			.attr('preserveAspectRatio', 'xMidYMid meet');
		
		graph.nodes.forEach(node => {
			const flagUrl = getFlagUrl(node.country, node.country_code);
			const patternId = `flag-${node.country_code?.toLowerCase() || node.country.replace(/\s+/g, '-')}`;
			if (flagUrl && !defs.select(`#${patternId}`).node()) {
				defs.append('pattern')
					.attr('id', patternId)
					.attr('height', '100%')
					.attr('width', '100%')
					.attr('patternContentUnits', 'objectBoundingBox')
					.append('image')
					.attr('xlink:href', flagUrl)
					.attr('height', 1)
					.attr('width', 1)
					.attr('preserveAspectRatio', 'xMidYMid slice');
			}
		});

		const competitionCounts = [...new Set(graph.nodes.filter(n => !n.isCentral).map(n => n.competitions))];
		const ringGroup = zoomGroup.append('g').attr('class', 'rings');
		
		const centralNodeData = graph.nodes.find(n => n.isCentral);
		if(centralNodeData) {
			ringGroup.selectAll('.competition-ring')
				.data(competitionCounts)
				.enter()
				.append('circle')
				.attr('class', 'competition-ring')
				.attr('cx', centralNodeData.fx)
				.attr('cy', centralNodeData.fy)
				.attr('r', d => baseRingRadius / d);

			ringGroup.selectAll('.ring-label')
				.data(competitionCounts)
				.enter()
				.append('text')
				.attr('class', 'ring-label')
				.attr('x', centralNodeData.fx)
				.attr('y', d => centralNodeData.fy - (baseRingRadius / d) - 5)
				.text(d => `${d} comp.`);
		}
		

		const link = zoomGroup.append('g').attr('class', 'links')
			.selectAll('.link')
			.data(graph.links)
			.enter().append('line')
			.attr('class', 'link');

		const nodeGroup = zoomGroup.append('g').attr('class', 'nodes')
			.selectAll('.node-group')
			.data(graph.nodes, d => d.id)
			.enter().append('g')
			.attr('class', 'node-group')
			.on('mouseover', (e, d) => { hoveredNode = d; })
			.on('mouseout', () => { hoveredNode = null; })
			.on('click', handleNodeClick);

		nodeGroup.append('circle')
			.attr('r', d => d.isCentral ? centralNodeRadius : nodeRadius)
			.attr('fill', d => {
				const flagUrl = getFlagUrl(d.country, d.country_code);
				const patternId = `flag-${d.country_code?.toLowerCase() || d.country.replace(/\s+/g, '-')}`;
				return flagUrl ? `url(#${patternId})` : 'url(#olympic-rings)';
			})
			.attr('class', d => d.isCentral ? 'node central-node' : 'node');
			
		nodeGroup.append('text')
			.attr('class', 'node-label')
			.attr('text-anchor', 'middle')
			.attr('dy', d => d.isCentral ? centralNodeRadius + 15 : nodeRadius + 12)
			.text(d => d.label);

		simulation.on('tick', () => {
			link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
				.attr('x2', d => d.target.x).attr('y2', d => d.target.y);
			nodeGroup.attr('transform', d => `translate(${d.x}, ${d.y})`);
		});
		
		const zoom = d3.zoom().scaleExtent([0.2, 5]).on('zoom', event => {
			zoomTransform = event.transform;
			zoomGroup.attr('transform', event.transform);
		});
		
		svg.call(zoom).call(zoom.transform, d3.zoomIdentity);
	}
	
	function handleValueTypeChange() {
		selectedEvent = '';
		athleteSearch = '';
		eventSearch = '';
		centralNode = null;
		graph = { nodes: [], links: [] };
		legendCompetitors = [];
		updateAvailableEvents();
		renderGraph();
	}
	
	function handleEventSearchInput() {
		if (eventSearch) {
			eventSuggestions = events.filter(e => e.toLowerCase().includes(eventSearch.toLowerCase()));
		} else {
			eventSuggestions = events;
		}
	}
	
	function hideEventSuggestions() {
		setTimeout(() => {
			eventSuggestions = [];
		}, 200);
	}

	function selectEventSuggestion(name) {
		selectedEvent = name;
		eventSearch = name;
		eventSuggestions = [];
		athleteSearch = '';
		centralNode = null;
		graph = { nodes: [], links: [] };
		legendCompetitors = [];
		updateAvailableAthletes();
		renderGraph();
	}
	
	function handleSearchInput() {
		if (athleteSearch) {
			suggestions = athletes.filter(a => a.toLowerCase().includes(athleteSearch.toLowerCase()));
		} else {
			suggestions = athletes;
		}
	}
	
	function hideSuggestions() {
		setTimeout(() => {
			suggestions = [];
		}, 200);
	}

	function handleSearch() {
		const foundAthlete = athletes.find(a => a.toLowerCase() === athleteSearch.toLowerCase());
		if (foundAthlete) {
			selectSuggestion(foundAthlete);
		}
	}

	function selectSuggestion(name) {
		athleteSearch = name;
		suggestions = [];
		createAthleteGraph(name);
	}
	
	function handleNodeClick(event, d) {
		if (d.isCentral) return;
		selectSuggestion(d.label);
	}
</script>

<div class="content-body">
	<div class="title">
		<h1>Rede de Competição dos Atletas</h1>
		<div class="intro-text">
			<p>
				Esta visualização interativa permite explorar a rede de competição de atletas olímpicos. Ao selecionar um atleta, você pode ver todos os competidores que ele enfrentou e a frequência desses confrontos.
			</p>
			<div class="instructions-block">
				<p>
					<strong>Como usar:</strong> Para começar, utilize os filtros de <strong>Modalidade</strong> e <strong>Evento</strong>, e em seguida, busque pelo nome de um atleta na barra de pesquisa. O atleta selecionado aparecerá no centro do grafo.
				</p>
				<p>
					<strong>Entendendo o Gráfico:</strong> Cada nó no gráfico representa um atleta, identificado pela bandeira de seu país. Os anéis concêntricos indicam o número de vezes que um competidor enfrentou o atleta central — quanto mais próximo do centro, maior o número de competições em comum.
				</p>
				<p>
					<strong>Interatividade:</strong> A exploração é dinâmica. <strong>Clique em qualquer competidor</strong> no gráfico ou na legenda para torná-lo o novo centro da rede. Ao <strong>passar o mouse</strong> sobre um nó, uma tabela detalhada aparecerá, mostrando o histórico de resultados das competições que eles tiveram juntos.
				</p>
			</div>
		</div>
	</div>

	<div class="controls">
		<select bind:value={selectedValueType} on:change={handleValueTypeChange}>
			<option value="">Todos os Tipos</option>
			{#each valueTypes as type}
				<option value={type}>{valueTypeLabels[type] || type}</option>
			{/each}
		</select>
		
		<div class="search-container">
			<input
				type="text"
				bind:value={eventSearch}
				placeholder="Buscar evento..."
				on:focus={handleEventSearchInput}
				on:input={handleEventSearchInput}
				on:blur={hideEventSuggestions}
			/>
			{#if eventSuggestions.length > 0}
				<div class="suggestions">
					{#each eventSuggestions.slice(0, 100) as suggestion}
						<button class="suggestion-item" on:click={() => selectEventSuggestion(suggestion)}>
							{suggestion}
						</button>
					{/each}
				</div>
			{/if}
		</div>
		
		<div class="search-container">
			<input
				type="text"
				bind:value={athleteSearch}
				placeholder="Buscar atleta..."
				on:focus={handleSearchInput}
				on:input={handleSearchInput}
				on:blur={hideSuggestions}
				on:keydown={(e) => e.key === 'Enter' && handleSearch()}
			/>
			<button on:click={handleSearch} disabled={!athleteSearch}>Buscar</button>
			
			{#if suggestions.length > 0}
				<div class="suggestions">
					{#each suggestions.slice(0, 100) as suggestion}
						<button class="suggestion-item" on:click={() => selectSuggestion(suggestion)}>
							{suggestion}
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<div class="page-wrapper">
		<div class="network-container">
			{#if isLoading}
				<div class="loading">Carregando dados...</div>
			{:else}
				<svg id="graph-svg" {width} {height}></svg>
			{/if}
		</div>

		<aside class="competitor-legend">
			<h2>Competidores</h2>
			<div class="legend-list">
				{#if legendCompetitors.length > 0}
					{#each legendCompetitors as competitor}
					<div class="legend-item" on:click={() => selectSuggestion(competitor.label)} title="Ver rede de {competitor.label}">
						<span class="legend-swatch" style="background-image: url({getFlagUrl(competitor.country, competitor.country_code) || `${base}/olympic_rings.svg`});"></span>
						<span class="competitor-name">{competitor.label}</span>
						<span class="competitor-count">{competitor.competitions} comp.</span>
					</div>
					{/each}
				{:else}
					<p class="legend-placeholder">Nenhum atleta selecionado.</p>
				{/if}
			</div>
		</aside>

		{#if hoveredNode}
			<div class="tooltip" style="left: {mousePosition.x + 15}px; top: {mousePosition.y + 15}px">
				<h3>{hoveredNode.label}</h3>
				<p><strong>País:</strong> {hoveredNode.country || 'N/A'}</p>
				{#if hoveredCompetitionDetails.length > 0}
					<div class="table-wrapper">
						<table class="competition-table">
							<thead>
								<tr>
									<th>Evento (Ano)</th>
									<th>{centralNode.label}</th>
									<th>{hoveredNode.label}</th>
								</tr>
							</thead>
							<tbody>
								{#each hoveredCompetitionDetails as comp}
									<tr>
										<td>{comp.event} ({comp.year})</td>
										<td>{comp.centralValue}</td>
										<td>{comp.hoveredValue}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else if !hoveredNode.isCentral}
					<p><strong>Competições juntos:</strong> {hoveredNode.competitions}</p>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	:root {
		--primary-color-darker: #0056b3;
	}
	
	.content-body {
		max-width: 1320px;
		margin: 0 auto;
		padding: 20px;
		font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
	}
	
	.title {
		margin-bottom: 2rem;
	}

	.title h1 {
		font-weight: 700;
		color: var(--primary-color-darker);
		margin: 0 0 1rem 0;
		font-size: 1.8rem;
		letter-spacing: -0.5px;
		text-align: center;
	}
	
	.intro-text p {
		text-align: justify;
		line-height: 1.6;
		color: #555;
	}

	.instructions-block {
		margin-top: 1.5rem;
		display: flex;
		gap: 2rem;
	}

	.instructions-block p {
		flex: 1;
		text-align: left;
		line-height: 1.6;
		color: #555;
		margin: 0;
		font-size: 0.95rem;
	}

	.page-wrapper {
		display: grid;
		grid-template-columns: 1fr 300px;
		gap: 20px;
		align-items: start;
	}

	.controls {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: 1fr 1.5fr 1.5fr;
		gap: 15px;
		margin-bottom: 20px;
		padding: 15px;
		background: #f8f9fa;
		border-radius: 8px;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
	}

	select, input, button {
		padding: 10px 15px;
		border: 1px solid #ced4da;
		border-radius: 4px;
		font-size: 16px;
		width: 100%;
		box-sizing: border-box;
	}
	
	button:disabled, select:disabled {
		background-color: #e9ecef;
		cursor: not-allowed;
	}

	.search-container {
		position: relative;
		display: flex;
		gap: 10px;
	}
	
	.suggestions {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		background: white;
		border: 1px solid #dee2e6;
		border-radius: 0 0 4px 4px;
		z-index: 100;
		box-shadow: 0 4px 8px rgba(0,0,0,0.1);
		max-height: 200px;
		overflow-y: auto;
	}
	
	.suggestion-item {
		width: 100%;
		text-align: left;
		background: none;
		border: none;
		border-bottom: 1px solid #eee;
	}
	.suggestion-item:last-child {
		border-bottom: none;
	}
	.suggestion-item:hover {
		background: #f1f1f1;
	}

	#graph-svg {
		display: block;
		width: 100%;
		background: #fff;
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0,0,0,0.1);
		cursor: grab;
	}
	#graph-svg:active {
		cursor: grabbing;
	}
	
	.placeholder-text {
		font-size: 1.5em;
		fill: #888;
	}

	.loading {
		text-align: center;
		padding: 50px;
		font-size: 18px;
		color: #6c757d;
	}

	.tooltip {
		position: fixed;
		background: rgba(255, 255, 255, 0.98);
		padding: 12px;
		border-radius: 8px;
		box-shadow: 0 6px 16px rgba(0,0,0,0.15);
		z-index: 10;
		pointer-events: none;
		border: 1px solid #ddd;
		transition: opacity 0.1s ease;
	}
	
	.tooltip h3 {
		margin-top: 0;
		margin-bottom: 8px;
		color: #1a1a1a;
		font-size: 16px;
	}

	.tooltip p {
		margin: 4px 0;
		color: #333;
		font-size: 14px;
	}

	.tooltip strong {
		color: #000;
	}

	.table-wrapper {
		width: auto;
		max-width: 450px;
	}
	
	.competition-table {
		margin-top: 12px;
		width: 100%;
		border-collapse: collapse;
		font-size: 12px;
	}
	.competition-table th, .competition-table td {
		border: 1px solid #e0e0e0;
		padding: 6px 8px;
		text-align: left;
		white-space: nowrap;
	}
	.competition-table th {
		background-color: #f7f7f7;
		font-weight: 600;
	}
	.competition-table tr:nth-child(even) {
		background-color: #fdfdfd;
	}

	.competitor-legend {
		background: #fff;
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0,0,0,0.1);
		padding: 20px;
		height: 600px;
	}
	
	.competitor-legend h2 {
		margin-top: 0;
		font-size: 1.2rem;
		border-bottom: 1px solid #eee;
		padding-bottom: 10px;
		margin-bottom: 10px;
	}

	.legend-list {
		height: calc(100% - 50px);
		overflow-y: auto;
		padding-right: 10px;
	}

	.legend-placeholder {
		font-style: italic;
		color: #888;
		text-align: center;
		padding: 20px 0;
	}

	.legend-item {
		display: flex;
		align-items: center;
		padding: 8px 4px;
		font-size: 0.9rem;
		border-bottom: 1px solid #f0f0f0;
		cursor: pointer;
		border-radius: 4px;
		transition: background-color 0.2s;
	}
	.legend-item:hover {
		background-color: #f5f5f5;
	}

	.legend-item:last-child {
		border-bottom: none;
	}

	.legend-swatch {
		width: 16px;
		height: 12px;
		border-radius: 2px;
		margin-right: 10px;
		flex-shrink: 0;
		border: 1px solid #ccc;
		background-color: #f0f0f0;
		background-size: cover;
		background-position: center;
	}
	
	.competitor-name {
		color: #333;
		flex-grow: 1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.competitor-count {
		color: #888;
		font-weight: 500;
		white-space: nowrap;
		margin-left: 15px;
	}
	
	:global(.node) {
		stroke: #555;
		stroke-width: 1.5px;
	}
	:global(.central-node) {
		stroke: gold;
		stroke-width: 3px;
	}
	:global(.link) {
		stroke: #aaa;
		stroke-opacity: 0.7;
		stroke-width: 1.5px;
	}
	:global(.node-label) {
		font-size: 12px;
		fill: #333;
		pointer-events: none;
		font-weight: 500;
		text-shadow: 0px 0px 3px #fff, 0px 0px 3px #fff, 0px 0px 3px #fff;
	}
	:global(.node-group) {
		cursor: pointer;
	}
	:global(.ring-label) {
		fill: #aaa;
		font-size: 10px;
		text-transform: uppercase;
	}
	
	:global(.competition-ring) {
		stroke: #e0e0e0;
		stroke-dasharray: 4 4;
		fill: none;
	}
</style>
