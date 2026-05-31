use std::collections::HashMap;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct SequenceRecord {
    pub name: String,
    pub description: String,
    pub length: u32,
    pub offset: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EditOp {
    Match,
    Mismatch,
    Insertion,
    Deletion,
}

#[derive(Clone, Debug)]
pub struct Alignment {
    pub record_name: String,
    pub position: u32,
    pub strand: char,
    pub edits: Vec<EditOp>,
    pub edit_distance: usize,
    pub query: Vec<u8>,
    pub reference: Vec<u8>,
}

impl Alignment {
    pub fn to_sam(&self, query_name: &str, mapq: u8) -> String {
        let mut cigar = String::new();
        let mut current_op = None;
        let mut count = 0;

        for &op in &self.edits {
            let op_char = match op {
                EditOp::Match | EditOp::Mismatch => 'M',
                EditOp::Insertion => 'I',
                EditOp::Deletion => 'D',
            };

            if current_op == Some(op_char) {
                count += 1;
            } else {
                if let Some(c) = current_op {
                    cigar.push_str(&format!("{}{}", count, c));
                }
                current_op = Some(op_char);
                count = 1;
            }
        }
        if let Some(c) = current_op {
            cigar.push_str(&format!("{}{}", count, c));
        }

        if cigar.is_empty() {
            cigar = "*".to_string();
        }

        let flag: u16 = if self.strand == '-' { 16 } else { 0 };
        let seq = String::from_utf8_lossy(&self.query);
        let qual = "*";

        format!(
            "{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
            query_name,
            flag,
            self.record_name,
            self.position + 1,
            mapq,
            cigar,
            "*",
            0,
            0,
            seq,
            qual
        )
    }
}

#[derive(Clone)]
struct GappedSearchState {
    idx: isize,
    ref_advance: isize,
    low: usize,
    high: usize,
    edit_ops: Vec<EditOp>,
    edit_distance: usize,
}

#[derive(Serialize, Deserialize)]
pub struct FMIndex {
    pub bwt: Vec<u8>,
    pub original_sequence: Vec<u8>,
    pub suffix_array_sampled: Vec<u32>,
    pub suffix_array_marks: Vec<bool>,
    pub c_table: HashMap<u8, u32>,
    pub occ_table: HashMap<u8, Vec<u32>>,
    pub records: Vec<SequenceRecord>,
    pub total_length: u32,
    pub sa_sample_rate: u32,
    pub occ_sample_rate: u32,
    pub alphabet: Vec<u8>,
    pub is_rna: bool,
}

impl FMIndex {
    pub fn build(sequences: &[(String, String, Vec<u8>)], sa_sample_rate: u32, occ_sample_rate: u32) -> Self {
        let mut concatenated = Vec::new();
        let mut records = Vec::new();
        let mut offset: u32 = 0;
        let mut has_u = false;

        for (name, desc, seq) in sequences {
            let mut processed_seq = seq.clone();
            
            if processed_seq.iter().any(|&c| c == b'U' || c == b'u') {
                has_u = true;
                for c in &mut processed_seq {
                    if *c == b'u' {
                        *c = b'U';
                    }
                }
            }
            
            processed_seq.make_ascii_uppercase();

            records.push(SequenceRecord {
                name: name.clone(),
                description: desc.clone(),
                length: processed_seq.len() as u32,
                offset,
            });
            concatenated.extend_from_slice(&processed_seq);
            concatenated.push(b'$');
            offset += processed_seq.len() as u32 + 1;
        }

        let total_length = concatenated.len() as u32;
        let original_sequence = concatenated.clone();
        let suffix_array = Self::build_suffix_array_small(&concatenated);
        let bwt = Self::build_bwt(&concatenated, &suffix_array);
        let (c_table, occ_table) = Self::build_occ_table_sampled(&bwt, occ_sample_rate as usize);
        
        let mut alphabet: Vec<u8> = c_table.keys().cloned().filter(|&k| k != b'$').collect();
        alphabet.sort();

        let (sa_sampled, sa_marks) = Self::sample_suffix_array(&suffix_array, sa_sample_rate as usize);

        FMIndex {
            bwt,
            original_sequence,
            suffix_array_sampled: sa_sampled,
            suffix_array_marks: sa_marks,
            c_table,
            occ_table,
            records,
            total_length,
            sa_sample_rate,
            occ_sample_rate,
            alphabet,
            is_rna: has_u,
        }
    }

    fn sample_suffix_array(sa: &[usize], sample_rate: usize) -> (Vec<u32>, Vec<bool>) {
        let mut sampled = Vec::with_capacity(sa.len() / sample_rate + 1);
        let mut marks = vec![false; sa.len()];
        
        for (i, &pos) in sa.iter().enumerate() {
            if pos % sample_rate == 0 {
                marks[i] = true;
                sampled.push(pos as u32);
            }
        }
        
        (sampled, marks)
    }

    fn build_suffix_array_small(s: &[u8]) -> Vec<usize> {
        let n = s.len();
        if n == 0 {
            return Vec::new();
        }

        let mut sa: Vec<usize> = (0..n).collect();
        let mut rank: Vec<u32> = s.iter().map(|&c| c as u32).collect();
        let mut tmp = vec![0usize; n];
        let mut k = 1usize;

        while k < n {
            let max_rank = *rank.iter().max().unwrap_or(&0) as usize;
            let mut count = vec![0usize; max_rank + 2];

            for &r in &rank {
                count[r as usize + 1] += 1;
            }
            for i in 1..count.len() {
                count[i] += count[i - 1];
            }

            let mut second_part: Vec<usize> = (n.saturating_sub(k)..n).collect();
            for &i in &sa {
                if i >= k {
                    second_part.push(i - k);
                }
            }

            for &i in second_part.iter().rev() {
                let r = rank[i] as usize;
                count[r] -= 1;
                tmp[count[r]] = i;
            }

            sa.copy_from_slice(&tmp);

            let mut new_rank = vec![0u32; n];
            new_rank[sa[0]] = 0;
            let mut current_rank = 0u32;

            for i in 1..n {
                let prev = sa[i - 1];
                let curr = sa[i];
                let prev2 = rank.get(prev + k).copied().unwrap_or(0);
                let curr2 = rank.get(curr + k).copied().unwrap_or(0);
                
                if rank[curr] != rank[prev] || curr2 != prev2 {
                    current_rank += 1;
                }
                new_rank[curr] = current_rank;
            }

            rank = new_rank;
            
            if rank[sa[n - 1]] as usize == n - 1 {
                break;
            }
            
            k *= 2;
        }

        sa
    }

    fn build_bwt(s: &[u8], sa: &[usize]) -> Vec<u8> {
        sa.iter()
            .map(|&i| if i == 0 { b'$' } else { s[i - 1] })
            .collect()
    }

    fn build_occ_table_sampled(
        bwt: &[u8], 
        sample_rate: usize
    ) -> (HashMap<u8, u32>, HashMap<u8, Vec<u32>>) {
        let mut freq: HashMap<u8, u32> = HashMap::new();
        for &c in bwt {
            *freq.entry(c).or_insert(0) += 1;
        }

        let mut c_table = HashMap::new();
        let mut total = 0u32;
        let mut sorted_chars: Vec<u8> = freq.keys().cloned().collect();
        sorted_chars.sort();
        
        for &c in &sorted_chars {
            c_table.insert(c, total);
            total += freq[&c];
        }

        let sampled_size = (bwt.len() + sample_rate - 1) / sample_rate + 1;
        let mut occ_table: HashMap<u8, Vec<u32>> = HashMap::new();
        for &c in &sorted_chars {
            occ_table.insert(c, vec![0u32; sampled_size]);
        }

        let mut current_counts: HashMap<u8, u32> = sorted_chars
            .iter()
            .map(|&c| (c, 0u32))
            .collect();

        for (i, &c) in bwt.iter().enumerate() {
            *current_counts.get_mut(&c).unwrap() += 1;
            
            if (i + 1) % sample_rate == 0 {
                let sample_idx = (i + 1) / sample_rate;
                for &ch in &sorted_chars {
                    occ_table.get_mut(&ch).unwrap()[sample_idx] = current_counts[&ch];
                }
            }
        }

        let last_sample_idx = bwt.len() / sample_rate;
        if bwt.len() % sample_rate != 0 {
            for &ch in &sorted_chars {
                occ_table.get_mut(&ch).unwrap()[last_sample_idx] = current_counts[&ch];
            }
        }

        (c_table, occ_table)
    }

    fn occ(&self, c: u8, pos: usize) -> usize {
        if pos == 0 {
            return 0;
        }
        
        let sample_idx = pos / self.occ_sample_rate as usize;
        let sampled_count = self.occ_table.get(&c).map_or(0, |v| v[sample_idx] as usize);
        
        let start = sample_idx * self.occ_sample_rate as usize;
        let end = pos;
        
        let mut count = 0;
        for i in start..end {
            if self.bwt[i] == c {
                count += 1;
            }
        }
        
        sampled_count + count
    }

    fn lf(&self, pos: usize) -> usize {
        let c = self.bwt[pos];
        self.c_table[&c] as usize + self.occ(c, pos)
    }

    fn get_suffix_array_value(&self, idx: usize) -> usize {
        if self.suffix_array_marks[idx] {
            let sample_idx = self.suffix_array_marks[..=idx]
                .iter()
                .filter(|&&x| x)
                .count() - 1;
            return self.suffix_array_sampled[sample_idx] as usize;
        }

        let mut current = idx;
        let mut steps = 0;
        
        while !self.suffix_array_marks[current] {
            current = self.lf(current);
            steps += 1;
        }

        let sample_idx = self.suffix_array_marks[..=current]
            .iter()
            .filter(|&&x| x)
            .count() - 1;
        let sa_value = self.suffix_array_sampled[sample_idx] as usize;
        
        (sa_value + steps) % self.total_length as usize
    }

    pub fn exact_match(&self, pattern: &[u8]) -> Vec<(String, usize)> {
        if pattern.is_empty() {
            return Vec::new();
        }

        let mut processed_pattern = pattern.to_vec();
        processed_pattern.make_ascii_uppercase();

        let mut low = 0usize;
        let mut high = self.bwt.len() - 1;

        for &c in processed_pattern.iter().rev() {
            if !self.c_table.contains_key(&c) {
                return Vec::new();
            }

            let c_val = self.c_table[&c] as usize;
            low = c_val + self.occ(c, low);
            high = c_val + self.occ(c, high + 1) - 1;

            if low > high {
                return Vec::new();
            }
        }

        let mut results = Vec::new();
        for i in low..=high {
            let pos = self.get_suffix_array_value(i);
            if let Some((record, offset)) = self.position_to_record(pos) {
                results.push((record.name.clone(), offset));
            }
        }

        results.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)));
        results.dedup();
        results
    }

    pub fn gapped_align(
        &self,
        pattern: &[u8],
        max_edit_distance: usize,
    ) -> Vec<Alignment> {
        if pattern.is_empty() {
            return Vec::new();
        }

        let mut processed_pattern = pattern.to_vec();
        processed_pattern.make_ascii_uppercase();

        let mut results = Vec::new();
        let mut stack = Vec::with_capacity(pattern.len() * 8);
        
        stack.push(GappedSearchState {
            idx: processed_pattern.len() as isize - 1,
            ref_advance: 0,
            low: 0,
            high: self.bwt.len() - 1,
            edit_ops: Vec::new(),
            edit_distance: 0,
        });

        let alphabet = &self.alphabet;

        while let Some(state) = stack.pop() {
            if state.edit_distance > max_edit_distance || state.low > state.high {
                continue;
            }

            if state.idx < 0 {
                for i in state.low..=state.high {
                    let pos = self.get_suffix_array_value(i);
                    if let Some((record, offset)) = self.position_to_record(pos) {
                        let mut edits = state.edit_ops.clone();
                        edits.reverse();
                        
                        let (aligned_query, aligned_ref) = self.build_alignment_sequences(
                            &processed_pattern,
                            record.offset as usize + offset,
                            &edits,
                        );
                        
                        results.push(Alignment {
                            record_name: record.name.clone(),
                            position: offset as u32,
                            strand: '+',
                            edits,
                            edit_distance: state.edit_distance,
                            query: aligned_query,
                            reference: aligned_ref,
                        });
                    }
                }
                continue;
            }

            let c = processed_pattern[state.idx as usize];

            if state.ref_advance < 2 {
                let insertion_state = GappedSearchState {
                    idx: state.idx - 1,
                    ref_advance: 0,
                    low: state.low,
                    high: state.high,
                    edit_ops: {
                        let mut ops = state.edit_ops.clone();
                        ops.push(EditOp::Insertion);
                        ops
                    },
                    edit_distance: state.edit_distance + 1,
                };
                if insertion_state.edit_distance <= max_edit_distance {
                    stack.push(insertion_state);
                }
            }

            if state.ref_advance < alphabet.len() as isize {
                let base_idx = state.ref_advance as usize;
                if base_idx < alphabet.len() {
                    let base = alphabet[base_idx];
                    
                    let deletion_state = GappedSearchState {
                        idx: state.idx,
                        ref_advance: state.ref_advance + alphabet.len() as isize,
                        low: state.low,
                        high: state.high,
                        edit_ops: state.edit_ops.clone(),
                        edit_distance: state.edit_distance,
                    };
                    stack.push(deletion_state);

                    let c_val = self.c_table[&base] as usize;
                    let new_low = c_val + self.occ(base, state.low);
                    let new_high = c_val + self.occ(base, state.high + 1) - 1;

                    if new_low <= new_high {
                        let is_match = base == c;
                        let new_distance = if is_match {
                            state.edit_distance
                        } else {
                            state.edit_distance + 1
                        };

                        if new_distance <= max_edit_distance {
                            let mut new_ops = state.edit_ops.clone();
                            new_ops.push(if is_match { EditOp::Match } else { EditOp::Mismatch });
                            
                            stack.push(GappedSearchState {
                                idx: state.idx - 1,
                                ref_advance: 0,
                                low: new_low,
                                high: new_high,
                                edit_ops: new_ops,
                                edit_distance: new_distance,
                            });
                        }
                    }
                }
            }
        }

        results.sort_by(|a, b| {
            a.record_name.cmp(&b.record_name)
                .then(a.edit_distance.cmp(&b.edit_distance))
                .then(a.position.cmp(&b.position))
        });
        results.dedup_by(|a, b| a.record_name == b.record_name && a.position == b.position && a.strand == b.strand);
        
        results
    }

    fn build_alignment_sequences(&self, pattern: &[u8], ref_start: usize, edits: &[EditOp]) -> (Vec<u8>, Vec<u8>) {
        let mut query_seq = Vec::new();
        let mut ref_seq = Vec::new();
        let mut q_idx = 0;
        let mut r_idx = ref_start;

        for &op in edits {
            match op {
                EditOp::Match | EditOp::Mismatch => {
                    if q_idx < pattern.len() {
                        query_seq.push(pattern[q_idx]);
                        q_idx += 1;
                    }
                    if r_idx < self.original_sequence.len() {
                        ref_seq.push(self.original_sequence[r_idx]);
                        r_idx += 1;
                    }
                }
                EditOp::Insertion => {
                    if q_idx < pattern.len() {
                        query_seq.push(pattern[q_idx]);
                        q_idx += 1;
                    }
                    ref_seq.push(b'-');
                }
                EditOp::Deletion => {
                    query_seq.push(b'-');
                    if r_idx < self.original_sequence.len() {
                        ref_seq.push(self.original_sequence[r_idx]);
                        r_idx += 1;
                    }
                }
            }
        }

        (query_seq, ref_seq)
    }

    pub fn approximate_match(&self, pattern: &[u8], max_mismatches: usize) -> Vec<(String, usize, usize)> {
        if pattern.is_empty() {
            return Vec::new();
        }

        let mut processed_pattern = pattern.to_vec();
        processed_pattern.make_ascii_uppercase();

        let mut results = Vec::new();
        let mut stack = Vec::with_capacity(pattern.len() * 4);
        
        struct SimpleState {
            idx: isize,
            low: usize,
            high: usize,
            mismatches: usize,
            char_idx: usize,
        }
        
        stack.push(SimpleState {
            idx: processed_pattern.len() as isize - 1,
            low: 0,
            high: self.bwt.len() - 1,
            mismatches: 0,
            char_idx: 0,
        });

        let alphabet = &self.alphabet;

        while let Some(state) = stack.pop() {
            if state.mismatches > max_mismatches || state.low > state.high {
                continue;
            }

            if state.idx < 0 {
                for i in state.low..=state.high {
                    let pos = self.get_suffix_array_value(i);
                    results.push((pos, state.mismatches));
                }
                continue;
            }

            let c = processed_pattern[state.idx as usize];
            
            if state.char_idx < alphabet.len() {
                let next_state = SimpleState {
                    idx: state.idx,
                    low: state.low,
                    high: state.high,
                    mismatches: state.mismatches,
                    char_idx: state.char_idx + 1,
                };
                stack.push(next_state);

                let base = alphabet[state.char_idx];
                let new_mismatches = if base == c { state.mismatches } else { state.mismatches + 1 };
                
                if new_mismatches <= max_mismatches {
                    let c_val = self.c_table[&base] as usize;
                    let new_low = c_val + self.occ(base, state.low);
                    let new_high = c_val + self.occ(base, state.high + 1) - 1;

                    if new_low <= new_high {
                        stack.push(SimpleState {
                            idx: state.idx - 1,
                            low: new_low,
                            high: new_high,
                            mismatches: new_mismatches,
                            char_idx: 0,
                        });
                    }
                }
            }
        }

        let mut final_results = Vec::new();
        for (pos, mismatches) in results {
            if let Some((record, offset)) = self.position_to_record(pos) {
                final_results.push((record.name.clone(), offset, mismatches));
            }
        }

        final_results.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)));
        final_results.dedup();
        final_results
    }

    fn position_to_record(&self, pos: usize) -> Option<(&SequenceRecord, usize)> {
        let pos_u32 = pos as u32;
        for record in &self.records {
            if pos_u32 >= record.offset && pos_u32 < record.offset + record.length {
                return Some((record, (pos_u32 - record.offset) as usize));
            }
        }
        None
    }

    pub fn get_reference_subsequence(&self, record_name: &str, start: u32, length: u32) -> Option<Vec<u8>> {
        let record = self.records.iter().find(|r| r.name == record_name)?;
        let start_pos = record.offset + start;
        let end_pos = (start_pos + length).min(record.offset + record.length);
        
        if start_pos >= self.original_sequence.len() as u32 {
            return None;
        }
        
        Some(self.original_sequence[start_pos as usize..end_pos as usize].to_vec())
    }

    pub fn serialize(&self) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
        let encoded = bincode::serialize(self)?;
        let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::best());
        use std::io::Write;
        encoder.write_all(&encoded)?;
        Ok(encoder.finish()?)
    }

    pub fn deserialize(data: &[u8]) -> Result<Self, Box<dyn std::error::Error>> {
        let mut decoder = flate2::read::GzDecoder::new(data);
        let mut decompressed = Vec::new();
        use std::io::Read;
        decoder.read_to_end(&mut decompressed)?;
        Ok(bincode::deserialize(&decompressed)?)
    }

    pub fn memory_usage(&self) -> usize {
        let mut total = 0;
        total += self.bwt.len();
        total += self.original_sequence.len();
        total += self.suffix_array_sampled.len() * std::mem::size_of::<u32>();
        total += self.suffix_array_marks.len() * std::mem::size_of::<bool>();
        for (_, v) in &self.occ_table {
            total += v.len() * std::mem::size_of::<u32>();
        }
        total
    }
}

pub fn sam_header(records: &[SequenceRecord]) -> String {
    let mut header = String::new();
    header.push_str("@HD\tVN:1.6\tSO:coordinate\n");
    for record in records {
        header.push_str(&format!("@SQ\tSN:{}\tLN:{}\n", record.name, record.length));
    }
    header
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_exact_match() {
        let sequences = vec![(
            "chr1".to_string(),
            "Test chromosome".to_string(),
            b"ATCGATCGATCG".to_vec(),
        )];
        
        let fm = FMIndex::build(&sequences, 32, 64);
        let results = fm.exact_match(b"ATCG");
        
        assert_eq!(results.len(), 3);
        assert_eq!(results[0], ("chr1".to_string(), 0));
        assert_eq!(results[1], ("chr1".to_string(), 4));
        assert_eq!(results[2], ("chr1".to_string(), 8));
    }

    #[test]
    fn test_rna_support() {
        let sequences = vec![(
            "rna1".to_string(),
            "Test RNA".to_string(),
            b"AUCGAUCG".to_vec(),
        )];
        
        let fm = FMIndex::build(&sequences, 32, 64);
        assert!(fm.is_rna);
        
        let results = fm.exact_match(b"AUCG");
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn test_gapped_alignment() {
        let sequences = vec![(
            "chr1".to_string(),
            "Test".to_string(),
            b"ATCGATCGATCG".to_vec(),
        )];
        
        let fm = FMIndex::build(&sequences, 32, 64);
        let alignments = fm.gapped_align(b"ATXCG", 2);
        
        assert!(!alignments.is_empty());
    }

    #[test]
    fn test_sam_output() {
        let alignment = Alignment {
            record_name: "chr1".to_string(),
            position: 100,
            strand: '+',
            edits: vec![EditOp::Match, EditOp::Match, EditOp::Mismatch, EditOp::Match],
            edit_distance: 1,
            query: b"ATCG".to_vec(),
            reference: b"ATGG".to_vec(),
        };
        
        let sam = alignment.to_sam("read1", 60);
        assert!(sam.contains("chr1"));
        assert!(sam.contains("4M"));
    }
}
