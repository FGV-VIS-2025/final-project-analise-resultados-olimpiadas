<script>
import Navbar from '../components/Navbar.svelte';
</script>

<div class="app-container">
  <Navbar />
  <main>
    <slot /> 
  </main>
</div>

<style>
  .app-container {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  main {
    flex-grow: 1; 
    padding: 0rem; 
  }
</style>