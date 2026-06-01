package com.gremlin.web.controller;

import com.gremlin.web.entity.QueryHistory;
import com.gremlin.web.service.GraphSONService;
import com.gremlin.web.service.GremlinQueryService;
import com.gremlin.web.service.TinkerGraphService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class GremlinController {

    @Autowired
    private GremlinQueryService gremlinQueryService;

    @Autowired
    private GraphSONService graphSONService;

    @Autowired
    private TinkerGraphService tinkerGraphService;

    @PostMapping("/query")
    public ResponseEntity<Map<String, Object>> executeQuery(@RequestBody Map<String, String> request) {
        String query = request.get("query");
        if (query == null || query.trim().isEmpty()) {
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("error", "Query cannot be empty");
            return ResponseEntity.badRequest().body(error);
        }
        return ResponseEntity.ok(gremlinQueryService.executeQuery(query));
    }

    @GetMapping("/graph")
    public ResponseEntity<Map<String, Object>> getGraphData() {
        return ResponseEntity.ok(gremlinQueryService.getGraphData());
    }

    @GetMapping("/export")
    public ResponseEntity<String> exportGraphSON() {
        return ResponseEntity.ok(graphSONService.exportGraphSON());
    }

    @PostMapping("/import")
    public ResponseEntity<Map<String, Object>> importGraphSON(@RequestBody Map<String, String> request) {
        String graphson = request.get("graphson");
        Map<String, Object> response = new HashMap<>();
        try {
            graphSONService.importGraphSON(graphson);
            response.put("success", true);
            response.put("message", "Graph imported successfully");
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            response.put("success", false);
            response.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }

    @PostMapping("/export/csv")
    public ResponseEntity<String> exportCsv(@RequestBody Map<String, Object> request) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> results = (List<Map<String, Object>>) request.get("results");
        String csv = gremlinQueryService.exportResultsToCsv(results);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.parseMediaType("text/csv; charset=UTF-8"));
        headers.setContentDispositionFormData("attachment", "query-results.csv");

        return ResponseEntity.ok()
                .headers(headers)
                .body(csv);
    }

    @GetMapping("/shortest-path")
    public ResponseEntity<Map<String, Object>> findShortestPath(
            @RequestParam String fromId,
            @RequestParam String toId,
            @RequestParam(required = false) String edgeLabel,
            @RequestParam(defaultValue = "10") int maxDepth) {
        return ResponseEntity.ok(gremlinQueryService.findShortestPath(fromId, toId, edgeLabel, maxDepth));
    }

    @GetMapping("/indexes")
    public ResponseEntity<Map<String, Object>> listIndexes() {
        return ResponseEntity.ok(tinkerGraphService.listIndexes());
    }

    @PostMapping("/indexes")
    public ResponseEntity<Map<String, Object>> createIndex(@RequestBody Map<String, String> request) {
        String indexName = request.get("indexName");
        String elementType = request.get("elementType");
        String propertyKey = request.get("propertyKey");

        Map<String, Object> response = new HashMap<>();
        try {
            tinkerGraphService.createIndex(indexName, elementType, propertyKey);
            response.put("success", true);
            response.put("message", "Index created successfully");
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            response.put("success", false);
            response.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }

    @DeleteMapping("/indexes/{indexName}")
    public ResponseEntity<Map<String, Object>> dropIndex(
            @PathVariable String indexName,
            @RequestParam String elementType) {
        Map<String, Object> response = new HashMap<>();
        try {
            tinkerGraphService.dropIndex(indexName, elementType);
            response.put("success", true);
            response.put("message", "Index dropped successfully");
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            response.put("success", false);
            response.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }

    @GetMapping("/history")
    public ResponseEntity<Page<QueryHistory>> getQueryHistory(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = PageRequest.of(page, size);
        return ResponseEntity.ok(gremlinQueryService.getQueryHistory(pageable));
    }

    @DeleteMapping("/history/{id}")
    public ResponseEntity<Void> deleteQueryHistory(@PathVariable Long id) {
        gremlinQueryService.deleteQueryHistory(id);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/history")
    public ResponseEntity<Void> clearQueryHistory() {
        gremlinQueryService.clearQueryHistory();
        return ResponseEntity.noContent().build();
    }
}
