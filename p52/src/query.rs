use crate::fm_index::{FMIndex, Alignment, sam_header};
use crate::fasta::reverse_complement;

#[derive(Debug, Clone)]
pub struct QueryResult {
    pub record_name: String,
    pub position: usize,
    pub mismatches: usize,
    pub strand: char,
    pub alignment: Option<Alignment>,
}

pub fn exact_query(fm: &FMIndex, pattern: &[u8], include_rc: bool) -> Vec<QueryResult> {
    let mut results = Vec::new();
    
    let forward_results = fm.exact_match(pattern);
    for (name, pos) in forward_results {
        results.push(QueryResult {
            record_name: name,
            position: pos,
            mismatches: 0,
            strand: '+',
            alignment: None,
        });
    }

    if include_rc {
        let rc_pattern = reverse_complement(pattern);
        let rc_results = fm.exact_match(&rc_pattern);
        for (name, pos) in rc_results {
            results.push(QueryResult {
                record_name: name,
                position: pos,
                mismatches: 0,
                strand: '-',
                alignment: None,
            });
        }
    }

    results.sort_by(|a, b| {
        a.record_name.cmp(&b.record_name)
            .then(a.position.cmp(&b.position))
            .then(a.strand.cmp(&b.strand))
    });

    results
}

pub fn approximate_query(fm: &FMIndex, pattern: &[u8], max_mismatches: usize, include_rc: bool) -> Vec<QueryResult> {
    let mut results = Vec::new();
    
    let forward_results = fm.approximate_match(pattern, max_mismatches);
    for (name, pos, mismatches) in forward_results {
        results.push(QueryResult {
            record_name: name,
            position: pos,
            mismatches,
            strand: '+',
            alignment: None,
        });
    }

    if include_rc {
        let rc_pattern = reverse_complement(pattern);
        let rc_results = fm.approximate_match(&rc_pattern, max_mismatches);
        for (name, pos, mismatches) in rc_results {
            results.push(QueryResult {
                record_name: name,
                position: pos,
                mismatches,
                strand: '-',
                alignment: None,
            });
        }
    }

    results.sort_by(|a, b| {
        a.record_name.cmp(&b.record_name)
            .then(a.mismatches.cmp(&b.mismatches))
            .then(a.position.cmp(&b.position))
            .then(a.strand.cmp(&b.strand))
    });

    results
}

pub fn gapped_query(fm: &FMIndex, pattern: &[u8], max_edit_distance: usize, include_rc: bool) -> Vec<QueryResult> {
    let mut results = Vec::new();
    
    let forward_alignments = fm.gapped_align(pattern, max_edit_distance);
    for alignment in forward_alignments {
        results.push(QueryResult {
            record_name: alignment.record_name.clone(),
            position: alignment.position as usize,
            mismatches: alignment.edit_distance,
            strand: alignment.strand,
            alignment: Some(alignment),
        });
    }

    if include_rc {
        let rc_pattern = reverse_complement(pattern);
        let rc_alignments = fm.gapped_align(&rc_pattern, max_edit_distance);
        for mut alignment in rc_alignments {
            alignment.strand = '-';
            results.push(QueryResult {
                record_name: alignment.record_name.clone(),
                position: alignment.position as usize,
                mismatches: alignment.edit_distance,
                strand: '-',
                alignment: Some(alignment),
            });
        }
    }

    results.sort_by(|a, b| {
        a.record_name.cmp(&b.record_name)
            .then(a.mismatches.cmp(&b.mismatches))
            .then(a.position.cmp(&b.position))
            .then(a.strand.cmp(&b.strand))
    });

    results
}

pub fn to_sam(results: &[QueryResult], fm: &FMIndex, query_name: &str, pattern: &[u8]) -> String {
    let mut sam = sam_header(&fm.records);

    for result in results {
        if let Some(alignment) = &result.alignment {
            let mut aln = alignment.clone();
            aln.strand = result.strand;
            sam.push_str(&aln.to_sam(query_name, 60));
        } else {
            let cigar = format!("{}M", pattern.len());
            let flag: u16 = if result.strand == '-' { 16 } else { 0 };
            let seq = String::from_utf8_lossy(pattern);
            
            sam.push_str(&format!(
                "{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\n",
                query_name,
                flag,
                result.record_name,
                result.position + 1,
                60,
                cigar,
                "*",
                0,
                0,
                seq,
                "*"
            ));
        }
    }

    sam
}

pub fn format_results(results: &[QueryResult], pattern: &str, max_display: usize) -> String {
    let mut output = String::new();
    output.push_str(&format!("查询序列: {}\n", pattern));
    output.push_str(&format!("找到 {} 个匹配\n\n", results.len()));
    
    if results.is_empty() {
        return output;
    }

    output.push_str(&format!("{:<20} {:<10} {:<10} {:<8}\n", "序列", "位置", "编辑距离", "链"));
    output.push_str(&format!("{:-<50}\n", ""));

    let display_count = results.len().min(max_display);
    
    for result in &results[..display_count] {
        output.push_str(&format!(
            "{:<20} {:<10} {:<10} {:<8}\n",
            result.record_name,
            result.position,
            result.mismatches,
            result.strand
        ));
    }

    if results.len() > max_display {
        output.push_str(&format!("\n... 还有 {} 个结果未显示\n", results.len() - max_display));
    }

    output
}

pub fn format_alignment(alignment: &Alignment) -> String {
    let mut output = String::new();
    
    output.push_str(&format!("位置: {}{}\n", alignment.record_name, alignment.position));
    output.push_str(&format!("链: {}\n", alignment.strand));
    output.push_str(&format!("编辑距离: {}\n", alignment.edit_distance));
    output.push_str("\n");
    
    let query_str = String::from_utf8_lossy(&alignment.query);
    let ref_str = String::from_utf8_lossy(&alignment.reference);
    
    let mut match_str = String::new();
    for (q, r) in alignment.query.iter().zip(alignment.reference.iter()) {
        if q == r && *q != b'-' {
            match_str.push('|');
        } else if *q == b'-' || *r == b'-' {
            match_str.push(' ');
        } else {
            match_str.push('*');
        }
    }
    
    output.push_str(&format!("Query:  {}\n", query_str));
    output.push_str(&format!("        {}\n", match_str));
    output.push_str(&format!("Ref:    {}\n", ref_str));
    
    output
}
