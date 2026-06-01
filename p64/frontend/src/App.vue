<template>
  <div class="app-container">
    <header class="app-header">
      <h1>🔬 有限元应力分析系统</h1>
      <nav>
        <router-link to="/" class="nav-link">案例列表</router-link>
      </nav>
    </header>
    <main class="app-main">
      <router-view />
    </main>
  </div>
</template>

<script setup>
</script>

<style scoped>
.app-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 1rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.app-header h1 {
  font-size: 1.5rem;
  font-weight: 600;
}

.nav-link {
  color: white;
  text-decoration: none;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  background: rgba(255,255,255,0.2);
  transition: background 0.3s;
}

.nav-link:hover {
  background: rgba(255,255,255,0.3);
}

.app-main {
  flex: 1;
  padding: 2rem;
}
</style>
