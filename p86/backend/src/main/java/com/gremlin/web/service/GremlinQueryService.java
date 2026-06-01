package com.gremlin.web.service;

import com.gremlin.web.entity.QueryHistory;
import com.gremlin.web.repository.QueryHistoryRepository;
import org.apache.tinkerpop.gremlin.groovy.jsr223.GremlinGroovyScriptEngine;
import org.apache.tinkerpop.gremlin.process.traversal.dsl.graph.GraphTraversal;
import org.apache.tinkerpop.gremlin.process.traversal.dsl.graph.GraphTraversalSource;
import org.apache.tinkerpop.gremlin.process.traversal.dsl.graph.__;
import org.apache.tinkerpop.gremlin.structure.Edge;
import org.apache.tinkerpop.gremlin.structure.Element;
import org.apache.tinkerpop.gremlin.structure.Vertex;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import javax.script.Bindings;
import javax.script.ScriptEngine;
import java.util.*;
import java.util.concurrent.*;
import java.util.stream.Collectors;

@Service
public class GremlinQueryService {

    private static final int QUERY_TIMEOUT_SECONDS = 30;
    private static final int MAX_RESULTS = 1000;
    private static final int MAX_GRAPH_NODES = 500;
    private static final int MAX_GRAPH_EDGES = 1000;

    @Autowired
    private TinkerGraphService tinkerGraphService;

    @Autowired
    private QueryHistoryRepository queryHistoryRepository;

    private ScriptEngine scriptEngine;
    private final ExecutorService executorService = Executors.newFixedThreadPool(4);

    @PostConstruct
    public void init() {
        scriptEngine = new GremlinGroovyScriptEngine();
    }

    public Map<String, Object> executeQuery(String gremlinQuery) {
        long startTime = System.currentTimeMillis();
        QueryHistory history = new QueryHistory();
        history.setQuery(gremlinQuery);

        Future<Object> future = executorService.submit(() -> executeQueryInternal(gremlinQuery));

        try {
            Object resultObj = future.get(QUERY_TIMEOUT_SECONDS, TimeUnit.SECONDS);

            @SuppressWarnings("unchecked")
            Map<String, Object> result = (Map<String, Object>) resultObj;

            long executionTime = System.currentTimeMillis() - startTime;
            history.setSuccess(true);
            history.setResultCount((Integer) result.get("resultCount"));
            history.setExecutionTime(executionTime);
            queryHistoryRepository.save(history);

            result.put("executionTime", executionTime);
            return result;

        } catch (TimeoutException e) {
            future.cancel(true);
            long executionTime = System.currentTimeMillis() - startTime;
            history.setSuccess(false);
            history.setErrorMessage("Query timed out after " + QUERY_TIMEOUT_SECONDS + " seconds");
            history.setExecutionTime(executionTime);
            queryHistoryRepository.save(history);

            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("error", "Query timed out after " + QUERY_TIMEOUT_SECONDS + " seconds. Consider adding .limit() to your query.");
            response.put("executionTime", executionTime);
            return response;
        } catch (Exception e) {
            long executionTime = System.currentTimeMillis() - startTime;
            history.setSuccess(false);
            history.setErrorMessage(e.getMessage());
            history.setExecutionTime(executionTime);
            queryHistoryRepository.save(history);

            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("error", e.getMessage());
            response.put("executionTime", executionTime);
            return response;
        }
    }

    private Map<String, Object> executeQueryInternal(String gremlinQuery) throws Exception {
        GraphTraversalSource g = tinkerGraphService.getTraversal();
        Bindings bindings = scriptEngine.createBindings();
        bindings.put("g", g);
        bindings.put("graph", tinkerGraphService.getGraph());

        Object result = scriptEngine.eval(gremlinQuery, bindings);

        if (result instanceof GraphTraversal) {
            GraphTraversal<?, ?> traversal = (GraphTraversal<?, ?>) result;
            List<?> list = new ArrayList<>();
            int count = 0;
            while (traversal.hasNext() && count < MAX_RESULTS) {
                list.add(traversal.next());
                count++;
            }
            boolean truncated = traversal.hasNext();
            List<Map<String, Object>> processedResults = processResult(list);

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("results", processedResults);
            response.put("resultCount", processedResults.size());
            response.put("truncated", truncated);
            response.put("maxResults", MAX_RESULTS);
            return response;
        }

        List<Map<String, Object>> processedResults = processResult(result);

        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put("results", processedResults);
        response.put("resultCount", processedResults.size());
        return response;
    }

    private List<Map<String, Object>> processResult(Object result) {
        List<Map<String, Object>> processed = new ArrayList<>();

        if (result == null) {
            return processed;
        }

        if (result instanceof List) {
            List<?> list = (List<?>) result;
            int limit = Math.min(list.size(), MAX_RESULTS);
            for (int i = 0; i < limit; i++) {
                processed.add(processItem(list.get(i)));
            }
        } else {
            processed.add(processItem(result));
        }

        return processed;
    }

    private Map<String, Object> processItem(Object item) {
        Map<String, Object> map = new HashMap<>();

        if (item instanceof Vertex) {
            Vertex v = (Vertex) item;
            map.put("type", "vertex");
            map.put("id", v.id().toString());
            map.put("label", v.label());
            map.put("properties", getProperties(v));
        } else if (item instanceof Edge) {
            Edge e = (Edge) item;
            map.put("type", "edge");
            map.put("id", e.id().toString());
            map.put("label", e.label());
            map.put("inV", e.inVertex().id().toString());
            map.put("outV", e.outVertex().id().toString());
            map.put("properties", getProperties(e));
        } else if (item instanceof Map) {
            Map<?, ?> m = (Map<?, ?>) item;
            map.put("type", "map");
            Map<String, Object> valueMap = new HashMap<>();
            int count = 0;
            for (Map.Entry<?, ?> entry : m.entrySet()) {
                if (count >= MAX_RESULTS / 10) break;
                valueMap.put(String.valueOf(entry.getKey()), processItem(entry.getValue()));
                count++;
            }
            map.put("value", valueMap);
            if (m.size() > count) {
                map.put("truncated", true);
            }
        } else {
            map.put("type", "value");
            String valueStr = item != null ? item.toString() : null;
            if (valueStr != null && valueStr.length() > 1000) {
                valueStr = valueStr.substring(0, 1000) + "...";
            }
            map.put("value", valueStr);
            map.put("class", item != null ? item.getClass().getName() : null);
        }

        return map;
    }

    private Map<String, Object> getProperties(Element element) {
        Map<String, Object> props = new HashMap<>();
        int count = 0;
        for (String key : element.keys()) {
            if (count >= 50) break;
            Object value = element.value(key);
            if (value instanceof String && ((String) value).length() > 500) {
                value = ((String) value).substring(0, 500) + "...";
            }
            props.put(key, value);
            count++;
        }
        return props;
    }

    public Map<String, Object> getGraphData() {
        return getGraphData(MAX_GRAPH_NODES, MAX_GRAPH_EDGES);
    }

    public Map<String, Object> getGraphData(int maxNodes, int maxEdges) {
        GraphTraversalSource g = tinkerGraphService.getTraversal();

        long totalNodes = g.V().count().next();
        long totalEdges = g.E().count().next();

        boolean sampled = totalNodes > maxNodes || totalEdges > maxEdges;

        List<Map<String, Object>> vertices = g.V().limit(maxNodes).toList().stream()
                .map(v -> {
                    Map<String, Object> map = new HashMap<>();
                    map.put("id", v.id().toString());
                    map.put("label", v.label());
                    map.put("properties", getProperties(v));
                    return map;
                })
                .collect(Collectors.toList());

        Set<String> visibleNodeIds = vertices.stream()
                .map(m -> (String) m.get("id"))
                .collect(Collectors.toSet());

        List<Map<String, Object>> edges = g.E().limit(maxEdges).toList().stream()
                .filter(e -> visibleNodeIds.contains(e.outVertex().id().toString())
                        && visibleNodeIds.contains(e.inVertex().id().toString()))
                .map(e -> {
                    Map<String, Object> map = new HashMap<>();
                    map.put("id", e.id().toString());
                    map.put("label", e.label());
                    map.put("source", e.outVertex().id().toString());
                    map.put("target", e.inVertex().id().toString());
                    map.put("properties", getProperties(e));
                    return map;
                })
                .collect(Collectors.toList());

        Map<String, Object> data = new HashMap<>();
        data.put("nodes", vertices);
        data.put("edges", edges);
        data.put("totalNodes", totalNodes);
        data.put("totalEdges", totalEdges);
        data.put("sampled", sampled);
        data.put("maxNodes", maxNodes);
        data.put("maxEdges", maxEdges);
        return data;
    }

    public Page<QueryHistory> getQueryHistory(Pageable pageable) {
        return queryHistoryRepository.findAllByOrderByCreatedAtDesc(pageable);
    }

    public void deleteQueryHistory(Long id) {
        queryHistoryRepository.deleteById(id);
    }

    public void clearQueryHistory() {
        queryHistoryRepository.deleteAll();
    }

    public Map<String, Object> findShortestPath(Object fromId, Object toId, String edgeLabel, int maxDepth) {
        try {
            GraphTraversalSource g = tinkerGraphService.getTraversal();

            GraphTraversal<?, ?> traversal = g.V(fromId)
                    .repeat(__.out().simplePath())
                    .until(__.hasId(toId).or().loops().is(maxDepth))
                    .hasId(toId)
                    .path()
                    .limit(1);

            if (edgeLabel != null && !edgeLabel.isEmpty()) {
                traversal = g.V(fromId)
                        .repeat(__.outE(edgeLabel).inV().simplePath())
                        .until(__.hasId(toId).or().loops().is(maxDepth))
                        .hasId(toId)
                        .path()
                        .limit(1);
            }

            if (!traversal.hasNext()) {
                Map<String, Object> result = new HashMap<>();
                result.put("found", false);
                result.put("path", Collections.emptyList());
                result.put("edges", Collections.emptyList());
                return result;
            }

            org.apache.tinkerpop.gremlin.process.traversal.Path path =
                    (org.apache.tinkerpop.gremlin.process.traversal.Path) traversal.next();

            List<Map<String, Object>> pathNodes = new ArrayList<>();
            List<String> edgeIds = new ArrayList<>();
            List<String> nodeIds = new ArrayList<>();

            List<Object> objects = path.objects();
            for (Object obj : objects) {
                if (obj instanceof Vertex) {
                    Vertex v = (Vertex) obj;
                    Map<String, Object> node = new HashMap<>();
                    node.put("id", v.id().toString());
                    node.put("label", v.label());
                    node.put("properties", getProperties(v));
                    pathNodes.add(node);
                    nodeIds.add(v.id().toString());
                } else if (obj instanceof Edge) {
                    Edge e = (Edge) obj;
                    edgeIds.add(e.id().toString());
                }
            }

            if (nodeIds.size() > 1) {
                for (int i = 0; i < nodeIds.size() - 1; i++) {
                    String from = nodeIds.get(i);
                    String to = nodeIds.get(i + 1);
                    List<String> connecting = g.V(from).outE().as("e").inV().hasId(to)
                            .select("e").toList().stream()
                            .map(e -> ((Edge) e).id().toString())
                            .collect(Collectors.toList());
                    edgeIds.addAll(connecting);
                }
            }

            Map<String, Object> result = new HashMap<>();
            result.put("found", true);
            result.put("path", pathNodes);
            result.put("nodeIds", nodeIds);
            result.put("edgeIds", new ArrayList<>(new LinkedHashSet<>(edgeIds)));
            result.put("length", nodeIds.size() - 1);
            return result;

        } catch (Exception e) {
            throw new RuntimeException("Failed to find shortest path", e);
        }
    }

    public String exportResultsToCsv(List<Map<String, Object>> results) {
        if (results == null || results.isEmpty()) {
            return "";
        }

        StringBuilder csv = new StringBuilder();
        Set<String> headers = new LinkedHashSet<>();

        for (Map<String, Object> result : results) {
            collectHeaders(result, "", headers);
        }

        csv.append(String.join(",", headers)).append("\n");

        for (Map<String, Object> result : results) {
            List<String> row = new ArrayList<>();
            for (String header : headers) {
                Object value = getValueByPath(result, header);
                row.add(escapeCsvValue(value != null ? value.toString() : ""));
            }
            csv.append(String.join(",", row)).append("\n");
        }

        return csv.toString();
    }

    private void collectHeaders(Map<String, Object> map, String prefix, Set<String> headers) {
        for (Map.Entry<String, Object> entry : map.entrySet()) {
            String key = prefix.isEmpty() ? entry.getKey() : prefix + "." + entry.getKey();
            Object value = entry.getValue();
            if (value instanceof Map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> nested = (Map<String, Object>) value;
                collectHeaders(nested, key, headers);
            } else {
                headers.add(key);
            }
        }
    }

    private Object getValueByPath(Map<String, Object> map, String path) {
        String[] parts = path.split("\\.");
        Object current = map;
        for (String part : parts) {
            if (current instanceof Map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> currentMap = (Map<String, Object>) current;
                current = currentMap.get(part);
            } else {
                return null;
            }
        }
        return current;
    }

    private String escapeCsvValue(String value) {
        if (value.contains(",") || value.contains("\"") || value.contains("\n")) {
            return "\"" + value.replace("\"", "\"\"") + "\"";
        }
        return value;
    }
}
