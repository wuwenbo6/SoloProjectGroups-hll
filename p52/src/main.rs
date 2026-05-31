mod fm_index;
mod fasta;
mod query;
mod server;

use clap::{Parser, Subcommand};
use std::fs::File;
use std::io::{Read, Write};
use std::path::PathBuf;

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    Build {
        #[arg(short, long)]
        input: PathBuf,
        #[arg(short, long)]
        output: PathBuf,
        #[arg(long, default_value_t = 32)]
        sa_sample_rate: u32,
        #[arg(long, default_value_t = 64)]
        occ_sample_rate: u32,
    },
    Search {
        #[arg(short, long)]
        index: PathBuf,
        #[arg(short, long)]
        pattern: String,
        #[arg(short, long, default_value_t = 0)]
        mismatches: usize,
        #[arg(short, long)]
        rc: bool,
        #[arg(long)]
        gapped: bool,
        #[arg(long, default_value_t = 3)]
        max_edit: usize,
        #[arg(long)]
        sam: Option<PathBuf>,
    },
    Serve {
        #[arg(short, long)]
        index: PathBuf,
        #[arg(short, long, default_value = "127.0.0.1")]
        host: String,
        #[arg(short, long, default_value_t = 8080)]
        port: u16,
    },
    Info {
        #[arg(short, long)]
        index: PathBuf,
    },
    Align {
        #[arg(short, long)]
        index: PathBuf,
        #[arg(short, long)]
        fastq: PathBuf,
        #[arg(short, long)]
        output: PathBuf,
        #[arg(long, default_value_t = 3)]
        max_edit: usize,
    },
}

fn load_index(path: &PathBuf) -> Result<fm_index::FMIndex, Box<dyn std::error::Error>> {
    let mut file = File::open(path)?;
    let mut data = Vec::new();
    file.read_to_end(&mut data)?;
    fm_index::FMIndex::deserialize(&data)
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Build { input, output, sa_sample_rate, occ_sample_rate } => {
            println!("正在解析 FASTA 文件: {:?}", input);
            let records = fasta::parse_fasta(&input)?;
            println!("找到 {} 条序列", records.len());

            for record in &records {
                println!("  - {}: {} bp", record.name, record.sequence.len());
            }

            let sequences: Vec<_> = records
                .into_iter()
                .map(|r| (r.name, r.description, r.sequence))
                .collect();

            println!("\n正在构建 FM-Index...");
            println!("  后缀数组采样率: {}", sa_sample_rate);
            println!("  Occurrence表采样率: {}", occ_sample_rate);
            
            let fm = fm_index::FMIndex::build(&sequences, sa_sample_rate, occ_sample_rate);
            println!("构建完成!");
            println!("总长度: {} bp", fm.total_length);
            println!("序列类型: {}", if fm.is_rna { "RNA" } else { "DNA" });
            println!("内存使用: {:.2} MB", fm.memory_usage() as f64 / 1024.0 / 1024.0);

            println!("\n正在保存索引到: {:?}", output);
            let serialized = fm.serialize()?;
            let mut file = File::create(&output)?;
            file.write_all(&serialized)?;
            println!("索引已保存 (文件大小: {:.2} MB)", serialized.len() as f64 / 1024.0 / 1024.0);
        }

        Commands::Search { index, pattern, mismatches, rc, gapped, max_edit, sam } => {
            println!("正在加载索引...");
            let fm = load_index(&index)?;
            println!("索引加载完成!");
            println!("序列类型: {}\n", if fm.is_rna { "RNA" } else { "DNA" });

            let pattern = pattern.to_ascii_uppercase();
            let pattern_bytes = pattern.as_bytes();

            println!("查询序列: {}", pattern);
            println!("包含反向互补: {}", rc);
            
            let results = if gapped {
                println!("最大编辑距离: {}\n", max_edit);
                query::gapped_query(&fm, pattern_bytes, max_edit, rc)
            } else if mismatches > 0 {
                println!("允许错配: {}\n", mismatches);
                query::approximate_query(&fm, pattern_bytes, mismatches, rc)
            } else {
                println!("\n");
                query::exact_query(&fm, pattern_bytes, rc)
            };

            println!("{}", query::format_results(&results, &pattern, 50));

            if let Some(sam_path) = sam {
                println!("\n正在保存 SAM 文件: {:?}", sam_path);
                let sam_content = query::to_sam(&results, &fm, "query", pattern_bytes);
                let mut file = File::create(&sam_path)?;
                file.write_all(sam_content.as_bytes())?;
                println!("SAM 文件已保存");
            }

            if gapped && !results.is_empty() {
                println!("\n比对详情:");
                println!("{:-<60}", "");
                for (i, result) in results.iter().take(5).enumerate() {
                    if let Some(aln) = &result.alignment {
                        println!("\n[{}]", i + 1);
                        println!("{}", query::format_alignment(aln));
                    }
                }
                if results.len() > 5 {
                    println!("\n... 还有 {} 个比对未显示", results.len() - 5);
                }
            }
        }

        Commands::Serve { index, host, port } => {
            println!("正在加载索引...");
            let fm = load_index(&index)?;
            println!("索引加载完成!");
            println!("包含 {} 条序列，共 {} bp", fm.records.len(), fm.total_length);
            println!("序列类型: {}", if fm.is_rna { "RNA" } else { "DNA" });
            println!("内存使用: {:.2} MB\n", fm.memory_usage() as f64 / 1024.0 / 1024.0);

            tokio::runtime::Runtime::new()?.block_on(async {
                server::run_server(fm, host, port).await
            })?;
        }

        Commands::Info { index } => {
            println!("正在加载索引...");
            let fm = load_index(&index)?;
            println!("\n索引信息:");
            println!("  序列数量: {}", fm.records.len());
            println!("  总长度: {} bp", fm.total_length);
            println!("  BWT 长度: {}", fm.bwt.len());
            println!("  后缀数组采样率: {}", fm.sa_sample_rate);
            println!("  Occurrence表采样率: {}", fm.occ_sample_rate);
            println!("  序列类型: {}", if fm.is_rna { "RNA" } else { "DNA" });
            println!("  内存使用: {:.2} MB", fm.memory_usage() as f64 / 1024.0 / 1024.0);
            println!("\n序列列表:");
            for record in &fm.records {
                println!("  - {}: {} bp", record.name, record.length);
                if !record.description.is_empty() {
                    println!("    {}", record.description);
                }
            }
        }

        Commands::Align { index, fastq, output, max_edit } => {
            println!("正在加载索引...");
            let fm = load_index(&index)?;
            println!("索引加载完成!");

            println!("正在读取 FASTQ 文件...");
            let fastq_records = fasta::parse_fastq(&fastq)?;
            println!("读取到 {} 条 reads", fastq_records.len());

            println!("\n正在进行比对...");
            let mut sam_writer = File::create(&output)?;
            sam_writer.write_all(fm_index::sam_header(&fm.records).as_bytes())?;

            let mut aligned = 0;
            for (i, record) in fastq_records.iter().enumerate() {
                let results = query::gapped_query(&fm, &record.sequence, max_edit, true);
                
                if !results.is_empty() {
                    aligned += 1;
                    let sam_content = query::to_sam(&results, &fm, &record.name, &record.sequence);
                    sam_writer.write_all(sam_content.as_bytes())?;
                }

                if (i + 1) % 1000 == 0 {
                    println!("  已处理: {}, 已比对: {}", i + 1, aligned);
                }
            }

            println!("\n比对完成!");
            println!("  总 reads: {}", fastq_records.len());
            println!("  已比对: {}", aligned);
            println!("  比对率: {:.2}%", aligned as f64 / fastq_records.len() as f64 * 100.0);
            println!("  输出文件: {:?}", output);
        }
    }

    Ok(())
}
