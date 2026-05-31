use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

#[derive(Debug, Clone)]
pub struct FastaRecord {
    pub name: String,
    pub description: String,
    pub sequence: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct FastqRecord {
    pub name: String,
    pub description: String,
    pub sequence: Vec<u8>,
    pub quality: Vec<u8>,
}

pub fn parse_fasta<P: AsRef<Path>>(path: P) -> Result<Vec<FastaRecord>, Box<dyn std::error::Error>> {
    let file = File::open(path)?;
    let reader = BufReader::new(file);
    
    let mut records = Vec::new();
    let mut current_name = String::new();
    let mut current_desc = String::new();
    let mut current_seq = Vec::new();

    for line_result in reader.lines() {
        let line = line_result?;
        let line = line.trim();
        
        if line.is_empty() {
            continue;
        }

        if line.starts_with('>') {
            if !current_name.is_empty() {
                records.push(FastaRecord {
                    name: std::mem::take(&mut current_name),
                    description: std::mem::take(&mut current_desc),
                    sequence: std::mem::take(&mut current_seq),
                });
            }

            let header = &line[1..];
            if let Some((name, desc)) = header.split_once(char::is_whitespace) {
                current_name = name.to_string();
                current_desc = desc.to_string();
            } else {
                current_name = header.to_string();
                current_desc = String::new();
            }
        } else {
            let mut seq_bytes = line.as_bytes().to_vec();
            seq_bytes.make_ascii_uppercase();
            current_seq.extend(seq_bytes);
        }
    }

    if !current_name.is_empty() {
        records.push(FastaRecord {
            name: current_name,
            description: current_desc,
            sequence: current_seq,
        });
    }

    Ok(records)
}

pub fn parse_fastq<P: AsRef<Path>>(path: P) -> Result<Vec<FastqRecord>, Box<dyn std::error::Error>> {
    let file = File::open(path)?;
    let reader = BufReader::new(file);
    let mut lines = reader.lines();
    
    let mut records = Vec::new();

    while let Some(line_result) = lines.next() {
        let header_line = line_result?;
        if !header_line.starts_with('@') {
            continue;
        }

        let header = &header_line[1..];
        let (name, desc) = if let Some((n, d)) = header.split_once(char::is_whitespace) {
            (n.to_string(), d.to_string())
        } else {
            (header.to_string(), String::new())
        };

        let seq_line = match lines.next() {
            Some(Ok(l)) => l,
            _ => break,
        };
        
        let _plus_line = lines.next();
        
        let qual_line = match lines.next() {
            Some(Ok(l)) => l,
            _ => break,
        };

        let mut sequence = seq_line.into_bytes();
        sequence.make_ascii_uppercase();

        records.push(FastqRecord {
            name,
            description: desc,
            sequence,
            quality: qual_line.into_bytes(),
        });
    }

    Ok(records)
}

pub fn validate_dna(sequence: &[u8]) -> bool {
    sequence.iter().all(|&c| matches!(c, b'A' | b'T' | b'C' | b'G' | b'N'))
}

pub fn validate_rna(sequence: &[u8]) -> bool {
    sequence.iter().all(|&c| matches!(c, b'A' | b'U' | b'C' | b'G' | b'N'))
}

pub fn validate_nucleic_acid(sequence: &[u8]) -> bool {
    sequence.iter().all(|&c| matches!(c, b'A' | b'T' | b'U' | b'C' | b'G' | b'N'))
}

pub fn complement(sequence: &[u8]) -> Vec<u8> {
    sequence.iter().map(|&c| match c {
        b'A' => if sequence.contains(&b'U') { b'U' } else { b'T' },
        b'T' | b'U' => b'A',
        b'C' => b'G',
        b'G' => b'C',
        _ => c,
    }).collect()
}

pub fn reverse_complement(sequence: &[u8]) -> Vec<u8> {
    let mut comp = complement(sequence);
    comp.reverse();
    comp
}

pub fn dna_to_rna(sequence: &[u8]) -> Vec<u8> {
    sequence.iter().map(|&c| if c == b'T' { b'U' } else { c }).collect()
}

pub fn rna_to_dna(sequence: &[u8]) -> Vec<u8> {
    sequence.iter().map(|&c| if c == b'U' { b'T' } else { c }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn test_parse_fasta() {
        let mut file = NamedTempFile::new().unwrap();
        writeln!(file, ">chr1 Test chromosome").unwrap();
        writeln!(file, "ATCGATCG").unwrap();
        writeln!(file, ">chr2 Second chromosome").unwrap();
        writeln!(file, "GCTAGCTA").unwrap();

        let records = parse_fasta(file.path()).unwrap();
        
        assert_eq!(records.len(), 2);
        assert_eq!(records[0].name, "chr1");
        assert_eq!(records[0].sequence, b"ATCGATCG");
        assert_eq!(records[1].name, "chr2");
        assert_eq!(records[1].sequence, b"GCTAGCTA");
    }

    #[test]
    fn test_reverse_complement_dna() {
        let seq = b"ATCG";
        let rc = reverse_complement(seq);
        assert_eq!(rc, b"CGAT");
    }

    #[test]
    fn test_reverse_complement_rna() {
        let seq = b"AUCG";
        let rc = reverse_complement(seq);
        assert_eq!(rc, b"CGAU");
    }

    #[test]
    fn test_dna_rna_conversion() {
        let dna = b"ATCGAT";
        let rna = dna_to_rna(dna);
        assert_eq!(rna, b"AUCGAU");
        
        let dna2 = rna_to_dna(&rna);
        assert_eq!(dna2, dna);
    }
}
