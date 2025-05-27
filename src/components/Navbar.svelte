<script>
    import { page } from "$app/stores";
    import { base } from "$app/paths";

    let pages = [
        { url: "/", title: "Home" },
        { url: "/jogos", title: "Jogos" },
        { url: "/exxtras", title: "Extras" },
        { url: "/paises", title: "Países" }
    ];

    let colorScheme = "light dark";
    let root = globalThis?.document?.documentElement;
    $: root?.style.setProperty("color-scheme", colorScheme);

    let localStorage = globalThis.localStorage ?? {};
    $: localStorage.colorScheme = colorScheme;
</script>

<nav>
    {#each pages as p}
        <a
            href={p.url.startsWith("http") 
                ? p.url: `${base}${p.url}`}
            class:current={$page.route.id === p.url}
            target={p.url.startsWith("http") ? "_blank" : undefined}
        >
            {p.title}
        </a>
    {/each}
</nav>  


<style>
  nav {
    display: flex;
    justify-content: center; 
    gap: 1rem; 
    padding: 1rem;
    background-color: #f0f0f0; 
    border-bottom: 1px solid #ddd;
  }

  nav a {
    text-decoration: none;
    color: #333;
    font-weight: bold;
  }

  nav a:hover {
    color: #f9b924;
  }

</style>