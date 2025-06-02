<script>
    import { page } from "$app/stores";
    import { base } from "$app/paths";

    export let pages = [ // Tornamos 'pages' uma prop para flexibilidade, ou pode manter fixo
        { url: "/", title: "Home" },
        { url: "/atletas", title: "Atletas" },
        { url: "/jogos", title: "Edições" }
    ];

    // Caminho para a imagem dos arcos olímpicos na pasta static
    const olympicRingsPath = `${base}/olympic_rings.svg`;
</script>

<nav>
    <a href="{`${base}/`}" class="logo-link" aria-label="Página Inicial">
        <div class="logo-container">
            <img src={olympicRingsPath} alt="Arcos Olímpicos" class="olympic-logo" />
            <span class="logo-text">Análise dos Resultados Olímpicos</span>
        </div>
    </a>
    <div class="nav-links">
        {#each pages as p}
            <a
                href={p.url.startsWith("http") ? p.url : `${base}${p.url}`}
                class:current={$page.route.id === p.url || ($page.route.id === '/' && p.url === '/')}
                target={p.url.startsWith("http") ? "_blank" : undefined}
            >
                {p.title}
            </a>
        {/each}
    </div>
</nav>

<style>
    nav {
        display: flex;
        align-items: center; /* Alinha verticalmente o logo e os links */
        gap: 1.5rem; /* Espaçamento entre o logo e os links */
        padding: 0.8rem 1.5rem; /* Padding vertical e horizontal */
        background-color: var(--nav-background, #ffffff); /* Cor de fundo da navbar */
        border-bottom: 1px solid var(--border-color, #e0e0e0);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        position: sticky; /* Faz a navbar ficar no topo ao rolar */
        top: 0;
        z-index: 1000; /* Garante que a navbar fique sobre outros elementos */
    }

    .logo-link {
        display: inline-block; /* Para o link não ocupar largura total */
        text-decoration: none;
        color: inherit;
    }

    .olympic-logo {
        height: 40px; /* Ajuste a altura conforme necessário */
        width: auto;
        display: block; /* Remove espaço extra abaixo da imagem */
    }
    

    .nav-links {
        display: flex;
        gap: 1.2rem; /* Espaçamento entre os links */
        margin-left: auto; /* Empurra os links para a direita (opcional) */
                         /* ou use justify-content: center; no 'nav' e remova margin-left: auto */
    }

    nav a:not(.logo-link) { /* Aplica estilo apenas aos links de texto */
        text-decoration: none;
        color: var(--nav-text-color, #333333);
        font-weight: 500; /* Um pouco menos "bold" que o padrão */
        padding: 0.5rem 0.8rem;
        border-radius: 6px;
        transition: color 0.2s ease-in-out, background-color 0.2s ease-in-out;
        position: relative; /* Para o pseudo-elemento ::after */
    }

    nav a:not(.logo-link)::after {
        content: '';
        position: absolute;
        width: 0;
        height: 2px;
        bottom: -2px; /* Posição da linha abaixo do texto */
        left: 50%;
        transform: translateX(-50%);
        background-color: var(--link-hover-color, #007bff); /* Cor da linha, azul olímpico */
        transition: width 0.3s ease-in-out;
    }
    
    nav a:not(.logo-link):hover::after,
    nav a:not(.logo-link).current::after {
        width: 70%; /* Largura da linha no hover/current */
    }

    nav a:not(.logo-link):hover {
        color: var(--link-hover-color, #007bff);
        /* background-color: var(--link-hover-bg, #f0f0f0); */ /* Opcional: fundo no hover */
    }

    nav a:not(.logo-link).current {
        color: var(--link-active-color, #0056b3); /* Cor para o link ativo */
        font-weight: 700;
    }

    .logo-container {
        display: flex;
        align-items: center;
        gap: 15px; /* Espaço entre a imagem e o texto */
    }


    .logo-text {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 24px; /* Ajuste o tamanho conforme necessário */
      font-weight: bold;
      color: #000; /* Cor do texto - ajuste conforme necessário */
      text-align: center;
      width: 100%;
      /* Adicione sombra ou contorno se o texto não estiver legível */
      text-shadow: 1px 1px 2px white;
      white-space: nowrap;

    }
</style>