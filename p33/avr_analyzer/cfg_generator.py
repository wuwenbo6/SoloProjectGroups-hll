from dataclasses import dataclass, field
from typing import List, Dict, Set, Optional, Tuple
from graphviz import Digraph
from .disassembler import Instruction, Function


@dataclass
class BasicBlock:
    id: str
    start_addr: int
    end_addr: int
    instructions: List[Instruction] = field(default_factory=list)
    predecessors: List[str] = field(default_factory=list)
    successors: List[str] = field(default_factory=list)
    indirect_branch: bool = False
    indirect_branch_type: Optional[str] = None


@dataclass
class ControlFlowGraph:
    function_name: str
    basic_blocks: Dict[str, BasicBlock] = field(default_factory=dict)
    entry_block: Optional[str] = None
    exit_blocks: List[str] = field(default_factory=list)
    has_indirect_jump: bool = False
    has_indirect_call: bool = False


class CFGGenerator:
    def __init__(self, functions: Dict[int, Function]):
        self.functions = functions
        self.cfgs: Dict[str, ControlFlowGraph] = {}

    def generate_all(self) -> Dict[str, ControlFlowGraph]:
        for func in self.functions.values():
            cfg = self.generate_for_function(func)
            self.cfgs[func.name] = cfg
        return self.cfgs

    def generate_for_function(self, func: Function) -> ControlFlowGraph:
        cfg = ControlFlowGraph(function_name=func.name)
        
        if not func.instructions:
            return cfg

        leaders = self._find_leaders(func.instructions)
        basic_blocks = self._create_basic_blocks(func.instructions, leaders)
        cfg.basic_blocks = basic_blocks
        
        self._connect_basic_blocks(cfg, func.instructions)
        
        if basic_blocks:
            first_block = min(basic_blocks.values(), key=lambda b: b.start_addr)
            cfg.entry_block = first_block.id
        
        cfg.exit_blocks = [
            bb.id for bb in basic_blocks.values()
            if not bb.successors
        ]
        
        return cfg

    def _find_leaders(self, instructions: List[Instruction]) -> Set[int]:
        leaders: Set[int] = set()
        
        if instructions:
            leaders.add(instructions[0].address)
        
        for i, insn in enumerate(instructions):
            if self._is_branch_instruction(insn):
                target = self._get_branch_target(insn)
                if target is not None:
                    leaders.add(target)
                
                if i + 1 < len(instructions):
                    next_addr = instructions[i + 1].address
                    leaders.add(next_addr)
        
        return leaders

    def _is_branch_instruction(self, insn: Instruction) -> bool:
        return insn.mnemonic in (
            'rjmp', 'jmp', 'rcall', 'call', 'ret', 'reti',
            'ijmp', 'icall', 'eijmp', 'eicall',
            'brne', 'breq', 'brcs', 'brcc', 'brmi', 'brpl',
            'brge', 'brlt', 'brhs', 'brhc', 'brts', 'brtc',
            'brvs', 'brvc', 'brie', 'brid', 'brbs', 'brbc'
        )

    def _is_unconditional_jump(self, insn: Instruction) -> bool:
        return insn.mnemonic in ('rjmp', 'jmp', 'ret', 'reti', 'ijmp', 'eijmp')

    def _is_indirect_branch(self, insn: Instruction) -> bool:
        return insn.mnemonic in ('ijmp', 'icall', 'eijmp', 'eicall')

    def _is_conditional_branch(self, insn: Instruction) -> bool:
        return insn.mnemonic in (
            'brne', 'breq', 'brcs', 'brcc', 'brmi', 'brpl',
            'brge', 'brlt', 'brhs', 'brhc', 'brts', 'brtc',
            'brvs', 'brvc', 'brie', 'brid', 'brbs', 'brbc'
        )

    def _get_branch_target(self, insn: Instruction) -> Optional[int]:
        if not insn.operands:
            return None
        
        operand = insn.operands[0]
        
        if operand.startswith('.+') or operand.startswith('.-'):
            try:
                offset = int(operand[1:])
                return insn.address + offset
            except ValueError:
                pass
        
        if operand.startswith('0x'):
            try:
                return int(operand, 16)
            except ValueError:
                pass
        
        if operand.isdigit():
            return int(operand)
        
        return None

    def _create_basic_blocks(self, instructions: List[Instruction], 
                              leaders: Set[int]) -> Dict[str, BasicBlock]:
        blocks: Dict[str, BasicBlock] = {}
        sorted_leaders = sorted(leaders)
        
        for i, leader_addr in enumerate(sorted_leaders):
            block_id = f"bb_{leader_addr:04X}"
            block = BasicBlock(
                id=block_id,
                start_addr=leader_addr,
                end_addr=leader_addr
            )
            
            next_leader = sorted_leaders[i + 1] if i + 1 < len(sorted_leaders) else None
            
            for insn in instructions:
                if insn.address < leader_addr:
                    continue
                if next_leader is not None and insn.address >= next_leader:
                    break
                block.instructions.append(insn)
                block.end_addr = insn.address + insn.size
            
            if block.instructions:
                blocks[block_id] = block
        
        return blocks

    def _connect_basic_blocks(self, cfg: ControlFlowGraph, 
                               instructions: List[Instruction]):
        addr_to_block: Dict[int, str] = {}
        for block in cfg.basic_blocks.values():
            addr_to_block[block.start_addr] = block.id
        
        for block in cfg.basic_blocks.values():
            if not block.instructions:
                continue
            
            last_insn = block.instructions[-1]
            
            if self._is_indirect_branch(last_insn):
                block.indirect_branch = True
                block.indirect_branch_type = last_insn.mnemonic
                if last_insn.mnemonic in ('ijmp', 'eijmp'):
                    cfg.has_indirect_jump = True
                elif last_insn.mnemonic in ('icall', 'eicall'):
                    cfg.has_indirect_call = True
                continue
            
            if self._is_branch_instruction(last_insn):
                target = self._get_branch_target(last_insn)
                if target is not None and target in addr_to_block:
                    target_block_id = addr_to_block[target]
                    block.successors.append(target_block_id)
                    cfg.basic_blocks[target_block_id].predecessors.append(block.id)
                
                if self._is_conditional_branch(last_insn):
                    fall_through_addr = last_insn.address + last_insn.size
                    if fall_through_addr in addr_to_block:
                        fall_block_id = addr_to_block[fall_through_addr]
                        block.successors.append(fall_block_id)
                        cfg.basic_blocks[fall_block_id].predecessors.append(block.id)
            
            else:
                fall_through_addr = last_insn.address + last_insn.size
                if fall_through_addr in addr_to_block:
                    fall_block_id = addr_to_block[fall_through_addr]
                    block.successors.append(fall_block_id)
                    cfg.basic_blocks[fall_block_id].predecessors.append(block.id)

    def generate_dot(self, cfg: ControlFlowGraph, output_file: str):
        dot = Digraph(comment=f'CFG for {cfg.function_name}')
        dot.attr('node', shape='box', style='filled', fillcolor='white')
        
        for block_id, block in cfg.basic_blocks.items():
            label = self._format_block_label(block)
            if block.indirect_branch:
                label += "\\n[INDIRECT BRANCH]"
                dot.node(block_id, label, fillcolor='orange', shape='diamond', style='filled,bold')
            elif block_id == cfg.entry_block:
                dot.node(block_id, label, fillcolor='lightgreen', shape='doubleoctagon')
            elif block_id in cfg.exit_blocks:
                dot.node(block_id, label, fillcolor='lightcoral', shape='doubleoctagon')
            else:
                dot.node(block_id, label)
        
        for block in cfg.basic_blocks.values():
            for succ_id in block.successors:
                if succ_id in cfg.basic_blocks:
                    succ_block = cfg.basic_blocks[succ_id]
                    edge_label = self._get_edge_label(block, succ_block)
                    dot.edge(block.id, succ_id, label=edge_label)
            
            if block.indirect_branch:
                indirect_node = f"indirect_{block.id}"
                dot.node(indirect_node, f"INDIRECT\\n{block.indirect_branch_type}", 
                        shape='doublecircle', fillcolor='yellow', style='filled')
                dot.edge(block.id, indirect_node, label='indirect', style='dashed')
        
        dot.render(output_file, format='png', cleanup=True)
        return f"{output_file}.png"

    def _format_block_label(self, block: BasicBlock) -> str:
        lines = [f"BB: 0x{block.start_addr:04X}"]
        for insn in block.instructions[:8]:
            lines.append(f"0x{insn.address:04X}: {insn.mnemonic} {insn.op_str}")
        if len(block.instructions) > 8:
            lines.append("...")
        return "\\n".join(lines)

    def _get_edge_label(self, from_block: BasicBlock, to_block: BasicBlock) -> str:
        if not from_block.instructions:
            return ""
        
        last_insn = from_block.instructions[-1]
        
        if self._is_conditional_branch(last_insn):
            target = self._get_branch_target(last_insn)
            if target == to_block.start_addr:
                return "T"
            else:
                return "F"
        
        if last_insn.mnemonic in ('rcall', 'call'):
            return "call"
        
        if last_insn.mnemonic in ('ret', 'reti'):
            return "ret"
        
        return ""

    def generate_call_graph(self, output_file: str) -> str:
        dot = Digraph(comment='Function Call Graph')
        dot.attr('node', shape='ellipse', style='filled', fillcolor='lightblue')
        dot.attr(rankdir='LR')
        
        added_nodes = set()
        
        for func in self.functions.values():
            if func.name not in added_nodes:
                dot.node(func.name, func.name)
                added_nodes.add(func.name)
            
            for call_target in func.calls:
                if call_target in self.functions:
                    target_func = self.functions[call_target]
                    if target_func.name not in added_nodes:
                        dot.node(target_func.name, target_func.name)
                        added_nodes.add(target_func.name)
                    dot.edge(func.name, target_func.name)
        
        dot.render(output_file, format='png', cleanup=True)
        return f"{output_file}.png"

    def print_cfg(self, cfg: ControlFlowGraph):
        print(f"\nCFG for function {cfg.function_name}:")
        print(f"Entry block: {cfg.entry_block}")
        print(f"Exit blocks: {cfg.exit_blocks}")
        print(f"Number of basic blocks: {len(cfg.basic_blocks)}")
        
        for block_id, block in cfg.basic_blocks.items():
            print(f"\n  {block_id} (0x{block.start_addr:04X} - 0x{block.end_addr:04X}):")
            print(f"    Predecessors: {block.predecessors}")
            print(f"    Successors: {block.successors}")
            print(f"    Instructions ({len(block.instructions)}):")
            for insn in block.instructions[:3]:
                print(f"      0x{insn.address:04X}: {insn.mnemonic} {insn.op_str}")
            if len(block.instructions) > 3:
                print(f"      ... and {len(block.instructions) - 3} more")
