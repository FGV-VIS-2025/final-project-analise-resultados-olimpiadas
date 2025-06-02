<script>
    import { page } from "$app/stores";
    import { base } from "$app/paths";
    import { onMount } from 'svelte';
    import Navbar from '../components/Navbar.svelte'; // Ajuste o caminho se necessário

    // Definição das páginas pode ficar aqui ou ser passada como prop para Navbar
    let pages = [
        { url: "/", title: "Home" },
        { url: "/atletas", title: "Atletas" },
        { url: "/jogos", title: "Edições" }
    ];

    let colorScheme = "light"; // Padrão para light
    let rootElement;

    onMount(() => {
        rootElement = document.documentElement;
        const storedScheme = localStorage.getItem("colorScheme");
        if (storedScheme) {
            colorScheme = storedScheme;
        } else {
            // Detecta preferência do sistema se não houver nada salvo
            const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            colorScheme = prefersDark ? "dark" : "light";
        }
        rootElement.style.setProperty("color-scheme", colorScheme);
        // Adicionamos uma classe para facilitar o styling do tema escuro
        if (colorScheme === 'dark') {
            rootElement.classList.add('dark-theme');
        } else {
            rootElement.classList.remove('dark-theme');
        }
    });

    function toggleColorScheme() {
        colorScheme = colorScheme === "light" ? "dark" : "light";
        localStorage.setItem("colorScheme", colorScheme);
        if (rootElement) {
            rootElement.style.setProperty("color-scheme", colorScheme);
            if (colorScheme === 'dark') {
                rootElement.classList.add('dark-theme');
            } else {
                rootElement.classList.remove('dark-theme');
            }
        }
    }
</script>

<div class="layout-container">
    <Navbar {pages} />

    <button on:click={toggleColorScheme} class="theme-toggle">
        Alternar para tema {colorScheme === 'light' ? 'Escuro' : 'Claro'}
    </button>

    <main>
        <slot />
    </main>
</div>

<style>
    :global(:root) {
        /* Tema Claro (Padrão) */
        --background-color: #f8f9fa; /* Um cinza muito claro */
        --text-color: #212529; /* Quase preto */
        --card-background: #ffffff;
        --border-color: #dee2e6;
        
        --nav-background: #ffffff;
        --nav-text-color: #333333;

        /* Cores Olímpicas (podem ser usadas como acentos) */
        --olympic-blue: #007bff; /* Azul para links e destaques */
        --olympic-yellow: #ffc107;
        --olympic-black: #000000;
        --olympic-green: #28a745;
        --olympic-red: #dc3545;

        --link-color: var(--olympic-blue);
        --link-hover-color: var(--olympic-red); /* Vermelho no hover para destaque */
        --link-active-color: var(--olympic-green); /* Verde para ativo */
        --link-hover-bg: #e9ecef; /* Fundo leve para hover de links */

        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        line-height: 1.6;
    }

    :global(:root.dark-theme) {
        /* Tema Escuro */
        --background-color: #1a1a1a; /* Um cinza bem escuro */
        --text-color: #e0e0e0; /* Cinza claro para texto */
        --card-background: #2c2c2c; /* Cinza escuro para cards */
        --border-color: #444444;

        --nav-background: #212121;
        --nav-text-color: #e0e0e0;

        --link-color: var(--olympic-yellow); /* Amarelo para links no tema escuro */
        --link-hover-color: var(--olympic-red);
        --link-active-color: var(--olympic-green);
        --link-hover-bg: #383838;
    }

    :global(body) {
        margin: 0;
        background-color: var(--background-color);
        color: var(--text-color);
        transition: background-color 0.3s ease, color 0.3s ease;
    }

    .layout-container {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
    }

    main {
        flex-grow: 1; /* Faz o conteúdo principal ocupar o espaço restante */
        padding: 1.5rem;
        width: 90%; /* Usa 90% da largura disponível */
        margin: 0 auto; /* Centraliza o conteúdo */
    }

    .theme-toggle {
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 0.6rem 1rem;
        background-color: var(--card-background);
        color: var(--text-color);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        cursor: pointer;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        z-index: 1001; /* Acima da navbar se a navbar não for sticky, ou ajustar conforme necessário */
        transition: background-color 0.2s, color 0.2s;
    }
    .theme-toggle:hover {
        opacity: 0.8;
    }

    footer {
        text-align: center;
        padding: 1.5rem;
        background-color: var(--nav-background); /* Pode usar a mesma cor da nav ou uma variação */
        border-top: 1px solid var(--border-color);
        color: var(--nav-text-color); /* Para consistência com a navbar */
        margin-top: auto; /* Empurra o footer para baixo se o conteúdo for pequeno */
    }

    footer p {
        margin: 0;
        font-size: 0.9rem;
    }

    /* Estilos globais para links, se desejar */
    :global(a) {
        color: var(--link-color);
    }
    :global(a:hover) {
        color: var(--link-hover-color);
    }

</style>