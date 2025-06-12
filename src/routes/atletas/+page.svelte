<script>
	import { onMount } from 'svelte';
	import * as d3 from 'd3';
	import { base } from '$app/paths';
	import { page } from '$app/stores';

	// Section: Data Stores
	let allMetadata = [];
	let allPairs = [];
	let disciplines = [];
	let events = [];
	let athletes = [];

	// Section: Filter States
	let selectedDiscipline = '';
	let selectedEvent = '';
	let athleteSearch = '';
	let suggestions = [];
	
	// Section: Graph & UI States
	let graph = { nodes: [], links: [] };
	let simulation;
	let isLoading = true;
	let centralNode = null;
	let hoveredNode = null;
	let mousePosition = { x: 0, y: 0 };
	let zoomTransform = d3.zoomIdentity;
	
	// Section: Visualization Parameters
	const width = 1000;
	const height = 700;
	const nodeRadius = 8;
	const centralNodeRadius = 15;
	const baseRingRadius = 350; // Raio base para 1 competição

	// Section: Lifecycle
	onMount(async () => {
		try {
			const [pairsResponse, metadataResponse] = await Promise.all([
				fetch(`${base}/athlete_pairs.csv`),
				fetch(`${base}/df_all.csv`)
			]);
			allPairs = d3.csvParse(await pairsResponse.text());
			allMetadata = d3.csvParse(await metadataResponse.text());
			
			processInitialData();

			const urlParams = $page.url.searchParams;
			const athleteFromUrl = urlParams.get('athlete');

			if (athleteFromUrl) {
				const decodedAthlete = decodeURIComponent(athleteFromUrl);
				selectSuggestion(decodedAthlete);
			}

		} catch (error) {
			console.error('Error loading data:', error);
		} finally {
			isLoading = false;
			if (!centralNode) {
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
		disciplines = [...new Set(allMetadata.map(d => d.discipline_title))].sort();
		updateAvailableEvents();
	}
	
	function updateAvailableEvents() {
		let availableMetadata = allMetadata;
		if (selectedDiscipline) {
			availableMetadata = availableMetadata.filter(d => d.discipline_title === selectedDiscipline);
		}
		events = [...new Set(availableMetadata.map(d => d.event_title))].sort();
		updateAvailableAthletes();
	}

	function updateAvailableAthletes() {
		let availableMetadata = allMetadata;
		if (selectedDiscipline) {
			availableMetadata = availableMetadata.filter(d => d.discipline_title === selectedDiscipline);
		}
		if (selectedEvent) {
			availableMetadata = availableMetadata.filter(d => d.event_title === selectedEvent);
		}
		athletes = [...new Set(availableMetadata.map(d => d.athlete_full_name))].sort();
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
		initGraph();
	}

	function getAthleteMetadata(athleteName) {
		const meta = allMetadata.find(d => d.athlete_full_name === athleteName);
		if (!meta) return { country: 'N/A', event: 'N/A' };
		return {
			country: meta.country_name,
			event: meta.event_title,
		};
	}

	// Section: D3 Visualization
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

		// Desenha os anéis de competição
		const competitionCounts = [...new Set(graph.nodes.filter(n => !n.isCentral).map(n => n.competitions))];
		
		const ringGroup = zoomGroup.append('g').attr('class', 'rings');
		
		ringGroup.selectAll('.competition-ring')
			.data(competitionCounts)
			.enter()
			.append('circle')
			.attr('class', 'competition-ring')
			.attr('cx', width / 2)
			.attr('cy', height / 2)
			.attr('r', d => baseRingRadius / d)
			.attr('stroke', '#e0e0e0')
			.attr('stroke-dasharray', '4 4')
			.attr('fill', 'none');

		ringGroup.selectAll('.ring-label')
			.data(competitionCounts)
			.enter()
			.append('text')
			.attr('class', 'ring-label')
			.attr('x', width / 2)
			.attr('y', d => height / 2 - (baseRingRadius / d) - 5)
			.attr('text-anchor', 'middle')
			.text(d => `${d} comp.`);


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
			.attr('fill', d => getCountryColor(d.country))
			.attr('class', d => d.isCentral ? 'node central-node' : 'node');
			
		nodeGroup.append('text')
			.attr('class', 'node-label')
			.attr('text-anchor', 'middle')
			.attr('dy', d => d.isCentral ? centralNodeRadius + 15 : nodeRadius + 12)
			.text(d => d.label);

		simulation
			.on('tick', () => {
				link.attr('x1', d => d.source.x)
					.attr('y1', d => d.source.y)
					.attr('x2', d => d.target.x)
					.attr('y2', d => d.target.y);
				nodeGroup.attr('transform', d => `translate(${d.x}, ${d.y})`);
			});
		
		// Re-adiciona o comportamento de zoom e pan
		const zoom = d3.zoom().scaleExtent([0.2, 5]).on('zoom', event => {
			zoomTransform = event.transform;
			zoomGroup.attr('transform', event.transform);
		});
		
		svg.call(zoom).call(zoom.transform, d3.zoomIdentity);
	}

	function getCountryColor(country) {
		if (!country || country === 'N/A') return '#ccc';
		let hash = 0;
		for (let i = 0; i < country.length; i++) {
			hash = country.charCodeAt(i) + ((hash << 5) - hash);
		}
		return `hsl(${Math.abs(hash) % 360}, 70%, 50%)`;
	}
	
	// Section: UI Handlers
	function handleDisciplineChange() {
		selectedEvent = '';
		athleteSearch = '';
		centralNode = null;
		graph = { nodes: [], links: [] };
		updateAvailableEvents();
		renderGraph();
	}

	function handleEventChange() {
		athleteSearch = '';
		centralNode = null;
		graph = { nodes: [], links: [] };
		updateAvailableAthletes();
		renderGraph();
	}
	
	function handleSearchInput() {
		if (athleteSearch.length > 2) {
			suggestions = athletes.filter(a => a.toLowerCase().includes(athleteSearch.toLowerCase())).slice(0, 10);
		} else {
			suggestions = [];
		}
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

<div class="network-container">
	<div class="controls">
		<!-- Discipline Filter -->
		<select bind:value={selectedDiscipline} on:change={handleDisciplineChange}>
			<option value="">Todas as Modalidades</option>
			{#each disciplines as discipline}
				<option value={discipline}>{discipline}</option>
			{/each}
		</select>
		
		<!-- Event Filter -->
		<select bind:value={selectedEvent} on:change={handleEventChange} disabled={!selectedDiscipline}>
			<option value="">Todos os Eventos</option>
			{#each events as event}
				<option value={event}>{event}</option>
			{/each}
		</select>
		
		<!-- Athlete Search -->
		<div class="search-container">
			<input
				type="text"
				bind:value={athleteSearch}
				placeholder="Buscar atleta..."
				on:input={handleSearchInput}
				on:keydown={(e) => e.key === 'Enter' && handleSearch()}
			/>
			<button on:click={handleSearch} disabled={!athleteSearch}>Buscar</button>
			
			{#if suggestions.length > 0}
				<div class="suggestions">
					{#each suggestions as suggestion}
						<button class="suggestion-item" on:click={() => selectSuggestion(suggestion)}>
							{suggestion}
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	{#if isLoading}
		<div class="loading">Carregando dados...</div>
	{:else}
		<svg id="graph-svg" {width} {height}></svg>
	{/if}

	{#if hoveredNode}
		<div class="tooltip" style="left: {mousePosition.x + 15}px; top: {mousePosition.y + 15}px">
			<h3>{hoveredNode.label}</h3>
			<p><strong>País:</strong> {hoveredNode.country || 'N/A'}</p>
			{#if !hoveredNode.isCentral}
			<p><strong>Competições juntos:</strong> {hoveredNode.competitions}</p>
			{/if}
		</div>
	{/if}
</div>

<style>
	.network-container {
		position: relative;
		width: 100%;
		max-width: 1200px;
		margin: 0 auto;
		padding: 20px;
		font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
	}

	.controls {
		display: grid;
		grid-template-columns: 1fr 1fr 2fr;
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
		margin: 0 auto;
		background: #fff;
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0,0,0,0.1);
		cursor: grab; /* Cursor para indicar que é móvel */
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
		background: rgba(255, 255, 255, 0.95);
		padding: 12px;
		border-radius: 6px;
		box-shadow: 0 4px 12px rgba(0,0,0,0.2);
		z-index: 10;
		pointer-events: none;
		max-width: 300px;
		border: 1px solid #ddd;
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
	
	:global(.node) {
		stroke: #fff;
		stroke-width: 2px;
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
	}
	:global(.node-group) {
		cursor: pointer;
	}
	:global(.ring-label) {
		fill: #aaa;
		font-size: 10px;
		text-transform: uppercase;
	}
</style>
