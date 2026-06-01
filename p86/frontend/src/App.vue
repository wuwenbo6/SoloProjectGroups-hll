<template>
  <div class="app">
    <header class="app-header">
      <div class="header-left">
        <h1 class="app-title">Gremlin Graph Studio</h1>
        <span class="app-subtitle">TinkerGraph Web Console</span>
      </div>
      <div class="header-right">
        <ImportExport @graph-imported="handleGraphImported" />
      </div>
    </header>

    <main class="app-main">
      <div class="left-panel">
        <div class="panel-top">
          <QueryEditor
            @query-result="handleQueryResult"
            @graph-updated="loadGraphData"
            ref="queryEditor"
          />
        </div>
        <div class="panel-bottom">
          <QueryResult :result="queryResult" />
        </div>
      </div>

      <div class="middle-panel">
        <div class="panel-top">
          <GraphVisualization
            :graphData="graphData"
            :highlightedPath="highlightedPath"
            @clear-path="clearHighlightedPath"
          />
        </div>
        <div class="panel-bottom">
          <ToolsPanel
            @path-found="handlePathFound"
            @clear-path="clearHighlightedPath"
            ref="toolsPanel"
          />
        </div>
      </div>

      <div class="right-panel">
        <QueryHistory
          @use-query="handleUseQuery"
          ref="queryHistory"
        />
      </div>
    </main>
  </div>
</template>

<script>
import QueryEditor from './components/QueryEditor.vue'
import QueryResult from './components/QueryResult.vue'
import GraphVisualization from './components/GraphVisualization.vue'
import QueryHistory from './components/QueryHistory.vue'
import ImportExport from './components/ImportExport.vue'
import ToolsPanel from './components/ToolsPanel.vue'
import { getGraphData } from './api'

export default {
  name: 'App',
  components: {
    QueryEditor,
    QueryResult,
    GraphVisualization,
    QueryHistory,
    ImportExport,
    ToolsPanel
  },
  data() {
    return {
      graphData: { nodes: [], edges: [] },
      queryResult: null,
      highlightedPath: { found: false, nodeIds: [], edgeIds: [] }
    }
  },
  mounted() {
    this.loadGraphData()
  },
  methods: {
    async loadGraphData() {
      try {
        const response = await getGraphData()
        this.graphData = response.data
        if (this.$refs.queryHistory) {
          this.$refs.queryHistory.refresh()
        }
      } catch (error) {
        console.error('Failed to load graph data:', error)
      }
    },
    handleGraphImported() {
      this.loadGraphData()
      this.clearHighlightedPath()
    },
    handleQueryResult(result) {
      this.queryResult = result
      if (this.$refs.queryHistory) {
        this.$refs.queryHistory.refresh()
      }
    },
    handleUseQuery(query) {
      if (this.$refs.queryEditor && this.$refs.queryEditor.editor) {
        this.$refs.queryEditor.editor.setValue(query)
        this.$refs.queryEditor.editor.focus()
      }
    },
    handlePathFound(pathResult) {
      this.highlightedPath = pathResult
    },
    clearHighlightedPath() {
      this.highlightedPath = { found: false, nodeIds: [], edgeIds: [] }
    }
  }
}
</script>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #1e1e2e;
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: #313244;
  border-bottom: 1px solid #45475a;
}

.header-left {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.app-title {
  font-size: 18px;
  font-weight: 700;
  color: #cdd6f4;
  margin: 0;
}

.app-subtitle {
  font-size: 13px;
  color: #6c7086;
}

.app-main {
  flex: 1;
  display: flex;
  padding: 12px;
  gap: 12px;
  overflow: hidden;
}

.left-panel,
.middle-panel,
.right-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

.left-panel {
  flex: 0.9;
}

.middle-panel {
  flex: 1.1;
}

.right-panel {
  flex: 0.6;
}

.panel-top {
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.panel-bottom {
  flex: 0.8;
  overflow: hidden;
  min-height: 0;
}
</style>
