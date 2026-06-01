package com.gremlin.web.service;

import org.apache.tinkerpop.gremlin.process.traversal.dsl.graph.GraphTraversalSource;
import org.apache.tinkerpop.gremlin.structure.Graph;
import org.apache.tinkerpop.gremlin.structure.T;
import org.apache.tinkerpop.gremlin.tinkergraph.structure.TinkerGraph;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.util.*;

@Service
public class TinkerGraphService {

    private Graph graph;
    private GraphTraversalSource g;

    @PostConstruct
    public void init() {
        graph = TinkerGraph.open();
        g = graph.traversal();
    }

    public Graph getGraph() {
        return graph;
    }

    public GraphTraversalSource getTraversal() {
        return g;
    }

    public void clearGraph() {
        try {
            g.V().drop().iterate();
        } catch (Exception e) {
            throw new RuntimeException("Failed to clear graph", e);
        }
    }

    public void createIndex(String indexName, String elementType, String propertyKey) {
        try {
            TinkerGraph tg = (TinkerGraph) graph;
            Class<?> elementClass = "vertex".equalsIgnoreCase(elementType)
                    ? org.apache.tinkerpop.gremlin.structure.Vertex.class
                    : org.apache.tinkerpop.gremlin.structure.Edge.class;
            tg.createIndex(indexName, elementClass, propertyKey);
        } catch (Exception e) {
            throw new RuntimeException("Failed to create index", e);
        }
    }

    public void dropIndex(String indexName, String elementType) {
        try {
            TinkerGraph tg = (TinkerGraph) graph;
            Class<?> elementClass = "vertex".equalsIgnoreCase(elementType)
                    ? org.apache.tinkerpop.gremlin.structure.Vertex.class
                    : org.apache.tinkerpop.gremlin.structure.Edge.class;
            tg.dropIndex(indexName, elementClass);
        } catch (Exception e) {
            throw new RuntimeException("Failed to drop index", e);
        }
    }

    public Map<String, Object> listIndexes() {
        try {
            TinkerGraph tg = (TinkerGraph) graph;
            Map<String, Object> indexes = new HashMap<>();
            indexes.put("vertexIndexes", tg.getIndexedKeys(org.apache.tinkerpop.gremlin.structure.Vertex.class));
            indexes.put("edgeIndexes", tg.getIndexedKeys(org.apache.tinkerpop.gremlin.structure.Edge.class));
            return indexes;
        } catch (Exception e) {
            throw new RuntimeException("Failed to list indexes", e);
        }
    }

    public void close() {
        try {
            if (graph != null) {
                graph.close();
            }
        } catch (Exception e) {
            throw new RuntimeException("Failed to close graph", e);
        }
    }
}
