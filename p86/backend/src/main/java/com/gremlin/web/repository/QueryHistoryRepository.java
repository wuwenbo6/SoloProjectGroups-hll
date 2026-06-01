package com.gremlin.web.repository;

import com.gremlin.web.entity.QueryHistory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface QueryHistoryRepository extends JpaRepository<QueryHistory, Long> {

    Page<QueryHistory> findAllByOrderByCreatedAtDesc(Pageable pageable);
}
