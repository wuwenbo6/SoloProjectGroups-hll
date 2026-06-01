<template>
  <div class="query-editor">
    <div class="editor-header">
      <span class="title">Gremlin Query</span>
      <div class="actions">
        <button @click="clearEditor" class="btn btn-secondary">Clear</button>
        <button @click="executeQuery" :disabled="loading" class="btn btn-primary">
          {{ loading ? 'Running...' : 'Execute' }}
        </button>
      </div>
    </div>
    <div class="editor-container">
      <textarea ref="textarea"></textarea>
    </div>
    <div class="examples">
      <span class="examples-label">Examples:</span>
      <button @click="setExample('addVertex')" class="example-btn">Add Vertex</button>
      <button @click="setExample('addEdge')" class="example-btn">Add Edge</button>
      <button @click="setExample('query')" class="example-btn">Query Vertices</button>
      <button @click="setExample('traverse')" class="example-btn">Traverse</button>
      <button @click="setExample('generateTest')" class="example-btn">Generate Test Data</button>
    </div>
  </div>
</template>

<script>
import CodeMirror from 'codemirror'
import 'codemirror/lib/codemirror.css'
import 'codemirror/theme/dracula.css'
import { executeQuery } from '../api'

export default {
  name: 'QueryEditor',
  emits: ['query-result', 'graph-updated'],
  data() {
    return {
      loading: false,
      editor: null
    }
  },
  mounted() {
    this.initCodeMirror()
  },
  methods: {
    initCodeMirror() {
      this.defineGremlinMode()
      this.editor = CodeMirror.fromTextArea(this.$refs.textarea, {
        mode: 'gremlin',
        theme: 'dracula',
        lineNumbers: true,
        indentUnit: 2,
        tabSize: 2,
        indentWithTabs: false,
        lineWrapping: true,
        extraKeys: {
          'Ctrl-Enter': () => this.executeQuery(),
          'Cmd-Enter': () => this.executeQuery()
        }
      })
      this.editor.setSize('100%', '100%')
      this.editor.setValue('g.V()')
    },
    defineGremlinMode() {
      CodeMirror.defineMode('gremlin', () => {
        const keywords = ['g', 'V', 'E', 'addV', 'addE', 'property', 'properties', 'has', 'hasLabel', 'hasId', 'hasKey', 'hasValue', 'value', 'values', 'valueMap', 'id', 'label', 'out', 'outE', 'outV', 'in', 'inE', 'inV', 'both', 'bothE', 'bothV', 'drop', 'count', 'limit', 'range', 'tail', 'skip', 'order', 'by', 'group', 'groupCount', 'fold', 'unfold', 'map', 'flatMap', 'filter', 'where', 'is', 'not', 'and', 'or', 'select', 'as', 'match', 'choose', 'optional', 'union', 'coalesce', 'repeat', 'times', 'until', 'emit', 'loops', 'path', 'simplePath', 'cyclicPath', 'tree', 'dedup', 'aggregate', 'store', 'sideEffect', 'cap', 'inject', 'iterate', 'toList', 'toSet', 'toMap', 'next', 'tryNext', 'none', 'explain', 'profile']
        const atoms = ['true', 'false', 'null']
        const operators = ['+', '-', '*', '/', '%', '=', '==', '!=', '<', '>', '<=', '>=', '&&', '||', '!']

        return {
          token: function(stream) {
            if (stream.eatSpace()) return null
            if (stream.match(/\/\/.*/)) return 'comment'
            if (stream.match(/\/\*[\s\S]*?\*\//)) return 'comment'
            if (stream.match(/"[^"]*"/)) return 'string'
            if (stream.match(/'[^']*'/)) return 'string'
            if (stream.match(/\d+\.\d+/)) return 'number'
            if (stream.match(/\d+/)) return 'number'
            if (stream.match(/[a-zA-Z_][a-zA-Z0-9_]*/)) {
              const word = stream.current()
              if (keywords.includes(word)) return 'keyword'
              if (atoms.includes(word)) return 'atom'
              return 'variable'
            }
            if (operators.some(op => stream.match(op))) return 'operator'
            if (stream.match(/[{}()\[\],.:;]/)) return 'punctuation'
            stream.next()
            return null
          }
        }
      })
    },
    clearEditor() {
      this.editor.setValue('')
      this.editor.focus()
    },
    setExample(type) {
      const examples = {
        addVertex: `g.addV('person').
  property('name', 'Alice').
  property('age', 30)`,
        addEdge: `g.V().has('name', 'Alice').
  addE('knows').
  to(g.V().has('name', 'Bob')).
  property('since', 2020)`,
        query: `g.V().hasLabel('person').
  valueMap('name', 'age')`,
        traverse: `g.V().has('name', 'Alice').
  out('knows').
  valueMap('name')`,
        generateTest: `// Generate 200 test nodes with random connections
// Note: Use .limit() to avoid too many results
(1..200).each { i ->
  g.addV('person')
    .property('name', 'Person_' + i)
    .property('age', 20 + (int)(i % 50))
    .iterate()
}
g.V().count()`
      }
      this.editor.setValue(examples[type])
      this.editor.focus()
    },
    async executeQuery() {
      const query = this.editor.getValue().trim()
      if (!query) return
      this.loading = true
      try {
        const response = await executeQuery(query)
        this.$emit('query-result', response.data)
        this.$emit('graph-updated')
      } catch (error) {
        this.$emit('query-result', {
          success: false,
          error: error.response?.data?.error || error.message
        })
      } finally {
        this.loading = false
      }
    }
  }
}
</script>

<style scoped>
.query-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #313244;
  border-radius: 8px;
  overflow: hidden;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #45475a;
  border-bottom: 1px solid #585b70;
}

.title {
  font-weight: 600;
  color: #cdd6f4;
}

.actions {
  display: flex;
  gap: 8px;
}

.btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-weight: 500;
  font-size: 14px;
}

.btn-primary {
  background: #89b4fa;
  color: #1e1e2e;
}

.btn-primary:hover:not(:disabled) {
  background: #b4befe;
}

.btn-secondary {
  background: #585b70;
  color: #cdd6f4;
}

.btn-secondary:hover {
  background: #6c7086;
}

.editor-container {
  flex: 1;
  overflow: hidden;
}

:deep(.CodeMirror) {
  height: 100%;
  font-size: 14px;
  font-family: 'Fira Code', 'Monaco', 'Consolas', monospace;
}

.examples {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: #45475a;
  border-top: 1px solid #585b70;
  flex-wrap: wrap;
}

.examples-label {
  font-size: 13px;
  color: #a6adc8;
}

.example-btn {
  padding: 4px 10px;
  background: #585b70;
  color: #cdd6f4;
  border-radius: 4px;
  font-size: 12px;
}

.example-btn:hover {
  background: #6c7086;
}
</style>
