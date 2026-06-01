import type { ControlFlowGraph, DataFlowGraph, BasicBlock } from '@shared/types.js';

export function exportCFGToDot(cfg: ControlFlowGraph): string {
  const lines: string[] = [];
  
  lines.push(`digraph CFG_${cfg.functionName} {`);
  lines.push('  rankdir=TB;');
  lines.push('  node [shape=box, style="filled,rounded", fontname="monospace"];');
  lines.push('  edge [fontname="monospace"];');
  lines.push('');

  for (const block of cfg.blocks) {
    const label = escapeDotLabel(getBlockLabel(block));
    const color = getBlockColor(block);
    lines.push(`  "${block.id}" [label="${label}", fillcolor="${color.fill}", fontcolor="${color.text}", color="${color.border}"];`);
  }

  lines.push('');

  for (const edge of cfg.edges) {
    const color = edge.type === 'conditional' ? '#f59e0b' : '#64748b';
    const style = edge.type === 'conditional' ? 'dashed' : 'solid';
    lines.push(`  "${edge.source}" -> "${edge.target}" [color="${color}", style="${style}"];`);
  }

  lines.push('}');
  return lines.join('\n');
}

export function exportDFGToDot(dfg: DataFlowGraph): string {
  const lines: string[] = [];
  
  lines.push('digraph DFG {');
  lines.push('  rankdir=LR;');
  lines.push('  node [shape=ellipse, style="filled", fontname="monospace"];');
  lines.push('  edge [fontname="monospace"];');
  lines.push('');

  for (const node of dfg.nodes) {
    const label = escapeDotLabel(getDFGNodeLabel(node));
    const color = getDFGNodeColor(node.type);
    lines.push(`  "${node.id}" [label="${label}", fillcolor="${color.fill}", fontcolor="${color.text}", color="${color.border}"];`);
  }

  lines.push('');

  for (const edge of dfg.edges) {
    lines.push(`  "${edge.source}" -> "${edge.target}" [color="#a855f7", label="op${edge.operandIndex}", fontsize=10];`);
  }

  lines.push('}');
  return lines.join('\n');
}

function getBlockLabel(block: BasicBlock): string {
  const instructions = block.instructions.slice(0, 5).map(i => 
    i.length > 40 ? i.slice(0, 37) + '...' : i
  );
  if (block.instructions.length > 5) {
    instructions.push(`... +${block.instructions.length - 5} more`);
  }
  return `{${block.label}}|${instructions.join('\\l')}\\l`;
}

function getDFGNodeLabel(node: { type: string; valueName?: string; instruction: string }): string {
  switch (node.type) {
    case 'argument':
      return `arg: ${node.valueName || node.instruction}`;
    case 'constant':
      return node.instruction;
    case 'instruction':
      const inst = node.instruction.split('=')[1]?.trim() || node.instruction;
      return `%${node.valueName}\\n${inst.slice(0, 30)}${inst.length > 30 ? '...' : ''}`;
    default:
      return node.valueName || node.instruction.slice(0, 20);
  }
}

function getBlockColor(block: BasicBlock): { fill: string; border: string; text: string } {
  if (block.label === 'entry') {
    return { fill: '#065f46', border: '#10b981', text: '#a7f3d0' };
  }
  if (block.successors.length === 0 || block.instructions.some(i => i.includes('ret '))) {
    return { fill: '#7f1d1d', border: '#ef4444', text: '#fca5a5' };
  }
  return { fill: '#1e293b', border: '#475569', text: '#e2e8f0' };
}

function getDFGNodeColor(type: string): { fill: string; border: string; text: string } {
  switch (type) {
    case 'argument':
      return { fill: '#065f46', border: '#10b981', text: '#a7f3d0' };
    case 'constant':
      return { fill: '#78350f', border: '#f59e0b', text: '#fcd34d' };
    case 'instruction':
      return { fill: '#1e3a5f', border: '#3b82f6', text: '#bfdbfe' };
    default:
      return { fill: '#1e293b', border: '#475569', text: '#e2e8f0' };
  }
}

function escapeDotLabel(str: string): string {
  return str.replace(/"/g, '\\"').replace(/\\/g, '\\\\');
}

export function generatePassTemplate(passName: string): string {
  const camelName = passName.charAt(0).toUpperCase() + passName.slice(1).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  
  return `//===-- ${camelName}.cpp - LLVM optimization pass -----------------------===//
//
//                     The LLVM Compiler Infrastructure
//
// This file is distributed under the University of Illinois Open Source
// License. See LICENSE.TXT for details.
//
//===----------------------------------------------------------------------===//
//
// This file implements the ${camelName} pass.
//
//===----------------------------------------------------------------------===//

#include "llvm/IR/Function.h"
#include "llvm/IR/PassManager.h"
#include "llvm/Passes/PassPlugin.h"
#include "llvm/Passes/PassBuilder.h"
#include "llvm/Support/raw_ostream.h"

using namespace llvm;

namespace {

class ${camelName}Pass : public PassInfoMixin<${camelName}Pass> {
public:
  PreservedAnalyses run(Function &F, FunctionAnalysisManager &AM) {
    errs() << "Running ${camelName} pass on " << F.getName() << "\\n";
    
    bool Changed = false;
    
    // TODO: Implement your optimization here
    for (BasicBlock &BB : F) {
      for (Instruction &I : BB) {
        // Process instruction...
        (void)I;
      }
    }
    
    return Changed ? PreservedAnalyses::none() : PreservedAnalyses::all();
  }

  static bool isRequired() { return true; }
};

} // end anonymous namespace

extern "C" LLVM_ATTRIBUTE_WEAK PassPluginLibraryInfo llvmGetPassPluginInfo() {
  return {
    LLVM_PLUGIN_API_VERSION,
    "${passName}",
    LLVM_VERSION_STRING,
    [](PassBuilder &PB) {
      PB.registerPipelineParsingCallback(
        [](StringRef Name, FunctionPassManager &FPM,
           ArrayRef<PassBuilder::PipelineElement>) {
          if (Name == "${passName}") {
            FPM.addPass(${camelName}Pass());
            return true;
          }
          return false;
        }
      );
    }
  };
}
`;
}

export function generateCMakeLists(passName: string): string {
  return `cmake_minimum_required(VERSION 3.13.4)
project(${passName})

find_package(LLVM REQUIRED CONFIG)

add_definitions(\${LLVM_DEFINITIONS})
include_directories(\${LLVM_INCLUDE_DIRS})
link_directories(\${LLVM_LIBRARY_DIRS})

add_library(${passName} MODULE ${passName}.cpp)

set_target_properties(${passName} PROPERTIES
    COMPILE_FLAGS "-fno-rtti -fPIC"
    LINK_FLAGS "-Wl,-znodelete"
)

target_link_libraries(${passName}
    LLVM
)
`;
}
