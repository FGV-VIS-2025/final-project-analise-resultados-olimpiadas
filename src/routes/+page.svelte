<script>
    import Graph from '../components/Graph.svelte';

    let measure = '';
    let search = '';
    let valueTypes = [];
    let yMin = '';
    let yMax = '';
    let selectedEvent = '';

    $: graphKey = measure + search + yMin + yMax;

    import { base } from '$app/paths';
    let csvUrl = `${base}/df_processed.csv`;

    function resetFilters() {
        search = '';
        yMin = '';
        yMax = '';
    }

    const measureLabels = {
        TIME: 'Tempo',
        DISTANCE: 'Distância',
        WEIGHT: 'Peso',
    };
</script>

<svelte:head>
    <title>Tarefa 4 – Olimpíadas</title>
</svelte:head>

<div class="page">
    <div class="title">
    <h1>Análise dos Resultados Olímpicos</h1>
            
    <h3>por Guilherme Buss, Guilherme Carvalho e Luís Felipe Marciano</h3>

    <p>
        Bem-vindo(a) à nossa plataforma de Análise Olímpica!
        
        Nosso objetivo com este site é mergulhar na rica história dos Jogos Olímpicos através de dados e visualizações interativas.
        Queremos oferecer a você uma maneira fascinante de explorar tendências, comparar performances marcantes e compreender a evolução
        do esporte ao longo das décadas. Navegue por todas as abas para ter a experiência completa e entender diferentes aspectos dos jogos 
        olímpicos. Logo abaixo, você encontrará nossa visualização principal, um ponto de partida para sua jornada exploratória.

    </p>

    <p>
        Dataset:
        <a href="https://www.kaggle.com/datasets/piterfm/olympic-games-medals-19862018?select=olympic_results.csv"
            target="_blank"
            rel="noopener">
            Olympic Results (1986-2018)
        </a>
    </p>    

    <hr style="margin: 30px 0; border: 0; border-top: 1px solid #e0e0e0;">
    </div>
    <div class="title">

        <h1 class="graph_title">Resultados olímpicos ao longo do tempo</h1>

        <p>

            Nessa visualização destacamos a performance dos medalhistas de ouro em diversas modalidades do atletismo através das diferentes
             edições dos Jogos Olímpicos. Observe como as marcas vencedoras evoluíram, identifique atletas que dominaram suas provas e perceba
              o impacto de diferentes eras no ápice do desempenho humano. Lembre-se de utilizar os filtros disponíveis para refinar sua busca 
              e focar em eventos específicos ou faixas de resultados que mais lhe interessam.
        </p>    

    </div>

    <div class="controls-container">
        <div class="controls">
            <select bind:value={measure}>
                <option value="" disabled selected>Tipo de medida</option>
                {#each valueTypes as t}
                    <option value={t}>{measureLabels[t] || t.toLowerCase()}</option>
                {/each}
            </select>

            <input type="text" bind:value={search} placeholder="Buscar evento…" disabled={!measure}>

            <div class="range-controls">
                <span>Resultado:</span>
                <input type="number" bind:value={yMin} placeholder="Min" disabled={!measure} class="range-input">
                <span>a</span>
                <input type="number" bind:value={yMax} placeholder="Max" disabled={!measure} class="range-input">
                <span id="guide">
                    *recomendamos o uso para visualizar valores pequenos
                </span>
                <button on:click={resetFilters} disabled={!measure} class="clear-btn">Limpar</button>
            </div>
        </div>
    </div>

    {#key graphKey}
        <Graph
            {csvUrl}
            bind:valueTypes
            {measure}
            searchQuery={search}
            yMin={yMin}
            yMax={yMax}
            bind:selectedEvent={selectedEvent}
        />
    {/key}
</div>

<style>
.page {
		max-width: 1320px;
		margin: 0 auto;
		padding: 20px;
		font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}
/* .page {
    max-width: 1380px;
    margin: auto;
    padding: 1.75rem;
    background: var(--page-background);
    font-family: var(--font-family-sans);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-md);
} */

.title h1 {
    font-weight: 700;
    color: var(--primary-color-darker);
    margin: 0 0 1.5rem 0;
    font-family:'Lucida Sans', 'Lucida Sans Regular', 'Lucida Grande', 'Lucida Sans Unicode', Geneva, Verdana, sans-serif;
    font-size: 1.8rem;
    letter-spacing: -0.5px;
}

.title h3 {
    font-weight: 300;
    color: #555;
    margin: .2em 0;
    font-size: 1rem;
}

/* .title p {
    font-size: .9rem;
} */

.controls-container {
    display: flex;
    justify-content: center;
    margin: 1.5rem 0;
}

.controls {
    display: flex;
    gap: 40px;
    max-width: 1000px;
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
margin-top: 0px;
font-size: 0.70rem;
color: #777;
}

.graph_title {
    text-align: center;
}
</style>