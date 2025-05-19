<script>
	import Graph from '../components/Graph.svelte';

	let measure    = '';
	let search     = '';
	let valueTypes = [];
	let yMin = '';
	let yMax = '';
    let selectedEvent = '';  

	$: graphKey = measure + search + yMin + yMax;	/* force remount */

	import { base } from '$app/paths';
  	let csvUrl = `${base}/df_processed.csv`;

	function resetFilters() {
		search = '';
		yMin = '';
		yMax = '';
	}
</script>

<svelte:head>
	<title>Tarefa 4 – Olimpíadas</title>

	<link	href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600&display=swap"
			rel="stylesheet">

	<style>
	:root {
		--bg:     #f8f9fa;
		--card:   #fff;
		--primary:#003366;
		--accent: #d4af37;
		--text:   #242424;
		--grid:   rgba(0, 0, 0, .06);
		--radius: 12px;
	}

	html, body {
		margin: 0;
		padding: 0;
		background: var(--bg);
		color: var(--text);
		font-family: Poppins, sans-serif;
	}

	a { color: var(--accent); }
	</style>
</svelte:head>

<div class="page">
	<div class="title">
		<h1>🏆 Olympic Results Analysis 🏅</h1>
		<h3>Guilherme Buss & Guilherme Carvalho</h3>
		<p>
			Visualização da evolução do desempenho olímpico.<br>
			Dataset:
			<a href="https://www.kaggle.com/datasets/piterfm/olympic-games-medals-19862018?select=olympic_results.csv"
			   target="_blank"
			   rel="noopener">
				Olympic Results (1986-2018)
			</a>
		</p>
	</div>

	<div class="controls-container">
		<div class="controls">
			<select bind:value={measure}>
				<option value="" disabled selected>tipo de medida</option>
				{#each valueTypes as t}
					<option value={t}>{t.toLowerCase()}</option>
				{/each}
			</select>

			<input type="text" bind:value={search} placeholder="Buscar evento…" disabled={!measure}>

			<div class="range-controls">
				<span>Resultado:</span>
				<input type="number" bind:value={yMin} placeholder="Min" disabled={!measure} class="range-input">
				<span>a</span>
				<input type="number" bind:value={yMax} placeholder="Max" disabled={!measure} class="range-input">
				<button on:click={resetFilters} disabled={!measure} class="clear-btn">Limpar</button>
			</div>
		</div>
	</div>
	<span id="guide">
		*recomendamos o uso para visualizar valores pequenos
	</span>

	{#key graphKey}
		<Graph 
			{csvUrl} 
			bind:valueTypes 
			{measure} 
			searchQuery={search}
			yMin={yMin}
			yMax={yMax}
		/>
	{/key}

    {#if selectedEvent}
    <h2 style="text-align:center;margin:2rem 0">
        🔍 {selectedEvent}
        <button style="margin-left:10px"
                on:click={() => selectedEvent = ''}>voltar</button>
    </h2>

    <Graph
		{csvUrl}
		bind:valueTypes
		{measure}
		searchQuery={search}
		yMin={yMin}
		yMax={yMax}
	/> 
    {/if}
</div>

<style>
.page {
	max-width: 1380px;
	margin: auto;
	padding: 3rem 1rem;
}

.title h1 {
	font-weight: 600;
	color: var(--primary);
	margin: .2em 0;
}

.title h3 {
	font-weight: 300;
	color: #555;
	margin: .2em 0;
	font-size: 1rem;
}

.title p {
	font-size: .9rem;
	color: #555;
	text-align: center;
}

.controls-container {
	display: flex;
	justify-content: center;
	margin: 1.5rem 0;
}

.controls {
	display: flex;
	gap: 40px;
	max-width: 900px;
	width: 100%;
	flex-wrap: wrap;
	align-items: center;
}

.controls select,
.controls input,
.controls button {
	padding: .6rem .8rem;
	font-size: .9rem;
	border: 1px solid #ccc;
	border-radius: var(--radius);
}

.controls select {
	background: #fff;
	min-width: 150px;
}

.range-controls {
	display: flex;
	align-items: center;
	gap: 5px;
	flex: 1;
}

.range-controls span {
	font-size: 0.9rem;
	color: #555;
}

.range-input {
	width: 80px !important;
	flex: none;
}

.clear-btn {
	background: var(--primary);
	color: #fff;
	cursor: pointer;
	transition: background .2s;
	margin-left: auto;
}

.controls button:disabled { 
	background: #888; 
	cursor: not-allowed;
}

.controls button:not(:disabled):hover { 
	background: #00264d; 
}


#guide {
	position: absolute;
	left: 49%;
	height: 10px;
	top: 254px;
	display: block;
	font-size: 0.68rem;
	color: #777;
}

</style>