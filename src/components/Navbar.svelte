<script>
    import { page } from "$app/stores";
    import { base } from "$app/paths";

    export let pages = [
        { url: "/", title: "Home" },
        { url: "/atletas", title: "Atletas" },
        { url: "/jogos", title: "Edições" }
    ];

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
        align-items: center; 
        gap: 1.5rem; 
        padding: 0.8rem 1.5rem; 
        background-color: var(--nav-background, #ffffff);
        border-bottom: 1px solid var(--border-color, #e0e0e0);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        position: sticky; 
        top: 0;
        z-index: 1000; 
    }

    .logo-link {
        display: inline-block; 
        text-decoration: none;
        color: inherit;
    }

    .olympic-logo {
        height: 40px;
        width: auto;
        display: block; 
    }
    

    .nav-links {
        display: flex;
        gap: 1.2rem; 
        margin-left: auto; 
    }

    nav a:not(.logo-link) { 
        text-decoration: none;
        color: var(--nav-text-color, #333333);
        font-weight: 300;
        font-family:Georgia, 'Times New Roman', Times, serif;
        padding: 0.5rem 0.8rem;
        border-radius: 6px;
        transition: color 0.2s ease-in-out, background-color 0.2s ease-in-out;
        position: relative; 
    }

    nav a:not(.logo-link)::after {
        content: '';
        position: absolute;
        width: 0;
        height: 2px;
        bottom: 3px; 
        left: 50%;
        transform: translateX(-50%);
        background-color: #007bff;
        transition: width 0.3s ease-in-out;
    }
    
    nav a:not(.logo-link):hover::after,
    nav a:not(.logo-link).current::after {
        width: 70%; 
    }

    nav a:not(.logo-link):hover {
        color: #007bff;
    }

    nav a:not(.logo-link).current {
        color: #0056b3; 
        font-weight: 400;
    }

    .logo-container {
        display: flex;
        align-items: center;
        gap: 15px; 
    }


    .logo-text {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 24px; 
      font-weight: 300;
      color: #000; 
      text-align: center;
      width: 100%;
      text-shadow: 1px 1px 2px white;
      white-space: nowrap;
      font-family:Georgia, 'Times New Roman', Times, serif;
    }
</style>