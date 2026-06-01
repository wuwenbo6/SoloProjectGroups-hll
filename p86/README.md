# Gremlin Graph Studio

Web application for Gremlin graph database with TinkerGraph in-memory storage.

## Features

- **Gremlin Query Editor**: Syntax highlighting, keyboard shortcuts (Ctrl/Cmd+Enter to execute)
- **Graph Visualization**: Interactive force-directed graph with draggable nodes
- **GraphSON Import/Export**: Import and export graph data in GraphSON format
- **Query History**: Persistent storage of query history with execution stats
- **Real-time Results**: Query results displayed in structured format
- **Performance Optimizations**: Query timeout, result truncation, adaptive graph rendering
- **Index Management**: Create and manage TinkerGraph indexes for faster queries
- **Shortest Path**: Find and highlight shortest path between two nodes
- **CSV Export**: Export query results to CSV files

## Tech Stack

### Backend
- Java 11
- Spring Boot 2.7
- Apache TinkerPop 3.6.2 (TinkerGraph)
- H2 Database (for query history)

### Frontend
- Vue 3
- Vite
- CodeMirror 5 (syntax highlighting)
- D3.js (graph visualization)

## Performance Optimizations

### Query Execution
- **30-second timeout**: Prevents infinite queries from hanging
- **1000 result limit**: Automatically truncates large result sets
- **Async execution**: Queries run in separate thread pool
- **Truncation warnings**: Shows when results are limited

### Graph Visualization
- **Adaptive rendering**: Different node sizes/opacity for large graphs
- **Auto-pause**: Layout simulation stops after 50 ticks for large graphs
- **Display controls**: Adjustable node limit (50/100/200/500)
- **Label hiding**: Text labels disabled for >50 nodes
- **Backend sampling**: Limits nodes/edges sent to frontend (500/1000 max)

## Getting Started

### Prerequisites
- Java 11 or higher
- Maven
- Node.js 16+ and npm

### Backend Setup

```bash
cd backend
mvn clean package
mvn spring-boot:run
```

The backend will start at `http://localhost:8080`

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend will start at `http://localhost:5173`

## Usage

### Sample Queries

**Add vertices:**
```groovy
g.addV('person').property('name', 'Alice').property('age', 30)
g.addV('person').property('name', 'Bob').property('age', 25)
g.addV('software').property('name', 'Gremlin').property('language', 'Groovy')
```

**Add edges:**
```groovy
g.V().has('name', 'Alice').addE('knows').to(g.V().has('name', 'Bob')).property('since', 2020)
g.V().has('name', 'Alice').addE('created').to(g.V().has('name', 'Gremlin')).property('year', 2023)
```

**Query vertices:**
```groovy
g.V().hasLabel('person').valueMap('name', 'age')
```

**Traverse graph:**
```groovy
g.V().has('name', 'Alice').out('knows').valueMap('name')
```

## API Endpoints

- `POST /api/query` - Execute Gremlin query
- `GET /api/graph` - Get full graph data
- `GET /api/export` - Export graph as GraphSON
- `POST /api/import` - Import graph from GraphSON
- `POST /api/export/csv` - Export query results to CSV
- `GET /api/shortest-path` - Find shortest path between nodes
- `GET /api/indexes` - List all indexes
- `POST /api/indexes` - Create a new index
- `DELETE /api/indexes/{indexName}` - Drop an index
- `GET /api/history` - Get query history (paginated)
- `DELETE /api/history/{id}` - Delete history entry
- `DELETE /api/history` - Clear all history

## Usage Guide

### Index Management

Indexes significantly speed up `g.V().has('property', value)` queries. Create an index before inserting large datasets:

1. Go to the "Indexes" tab
2. Enter index name (e.g., `idx_name`)
3. Select element type (Vertex/Edge)
4. Enter property key (e.g., `name`)
5. Click "Create"

### Shortest Path

Find the shortest path between two nodes:

1. Go to the "Shortest Path" tab
2. Enter source node ID and target node ID
3. (Optional) Specify edge label to follow
4. Set maximum search depth
5. Click "Find Path"

The path will be highlighted in red on the graph visualization.

### CSV Export

After executing a query with results:
1. Click "Export CSV" button in the query result panel
2. Results are automatically flattened and downloaded as CSV
