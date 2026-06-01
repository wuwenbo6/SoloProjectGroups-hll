package com.gremlin.web.service;

import org.apache.tinkerpop.gremlin.structure.Graph;
import org.apache.tinkerpop.gremlin.structure.io.IoCore;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

@Service
public class GraphSONService {

    @Autowired
    private TinkerGraphService tinkerGraphService;

    public String exportGraphSON() {
        try {
            Graph graph = tinkerGraphService.getGraph();
            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            graph.io(IoCore.graphson()).writer().writeGraph(outputStream, graph);
            return outputStream.toString(StandardCharsets.UTF_8.name());
        } catch (Exception e) {
            throw new RuntimeException("Failed to export GraphSON", e);
        }
    }

    public void importGraphSON(String graphson) {
        try {
            tinkerGraphService.clearGraph();
            Graph graph = tinkerGraphService.getGraph();
            ByteArrayInputStream inputStream = new ByteArrayInputStream(
                    graphson.getBytes(StandardCharsets.UTF_8.name())
            );
            graph.io(IoCore.graphson()).reader().readGraph(inputStream, graph);
        } catch (Exception e) {
            throw new RuntimeException("Failed to import GraphSON", e);
        }
    }
}
