import type { KconfigNode, KconfigSymbol, KconfigParseResult } from '../../shared/types.js';

class KconfigParser {
  private lines: string[] = [];
  private currentLine = 0;
  private symbols: Record<string, KconfigSymbol> = {};
  private tree: KconfigNode[] = [];
  private nodeIdCounter = 0;

  parse(content: string): KconfigParseResult {
    this.lines = content.split('\n');
    this.currentLine = 0;
    this.symbols = {};
    this.tree = [];
    this.nodeIdCounter = 0;

    while (this.currentLine < this.lines.length) {
      const line = this.lines[this.currentLine].trim();
      
      if (line.startsWith('config ')) {
        const node = this.parseConfig();
        if (node) this.tree.push(node);
      } else if (line.startsWith('menu ')) {
        const node = this.parseMenu();
        if (node) this.tree.push(node);
      } else if (line.startsWith('choice')) {
        const node = this.parseChoice();
        if (node) this.tree.push(node);
      } else if (line.startsWith('comment ')) {
        const node = this.parseComment();
        if (node) this.tree.push(node);
      } else if (line.startsWith('source ')) {
        this.currentLine++;
      } else if (line === '' || line.startsWith('#')) {
        this.currentLine++;
      } else {
        this.currentLine++;
      }
    }

    return { tree: this.tree, symbols: this.symbols };
  }

  private getNextNodeId(): string {
    return `node_${++this.nodeIdCounter}`;
  }

  private parseConfig(): KconfigNode | null {
    const line = this.lines[this.currentLine];
    const match = line.trim().match(/^config\s+(\w+)/);
    if (!match) return null;

    const name = match[1];
    const node: KconfigNode = {
      id: this.getNextNodeId(),
      type: 'config',
      name,
      dependsOn: [],
      select: [],
      implies: [],
    };

    this.currentLine++;

    let inHelp = false;
    let helpText: string[] = [];

    while (this.currentLine < this.lines.length) {
      const currentLine = this.lines[this.currentLine];
      const trimmed = currentLine.trim();

      if (trimmed === '') {
        this.currentLine++;
        continue;
      }

      const indent = currentLine.search(/\S/);

      if (inHelp) {
        if (indent > 8 || trimmed === '') {
          helpText.push(trimmed);
          this.currentLine++;
        } else {
          node.help = helpText.join('\n').trim();
          inHelp = false;
          break;
        }
        continue;
      }

      if (indent <= 0) {
        const keywords = ['bool', 'tristate', 'string', 'int', 'hex', 'prompt', 'default', 'depends', 'select', 'imply', 'help'];
        const startsWithKeyword = keywords.some(k => trimmed.startsWith(k));
        if (!startsWithKeyword) {
          break;
        }
      }

      if (trimmed.startsWith('bool ')) {
        node.configType = 'bool';
        const promptMatch = trimmed.match(/^bool\s+"(.+)"$/);
        if (promptMatch) node.prompt = promptMatch[1];
        this.currentLine++;
      } else if (trimmed.startsWith('bool')) {
        node.configType = 'bool';
        this.currentLine++;
      } else if (trimmed.startsWith('tristate ')) {
        node.configType = 'tristate';
        const promptMatch = trimmed.match(/^tristate\s+"(.+)"$/);
        if (promptMatch) node.prompt = promptMatch[1];
        this.currentLine++;
      } else if (trimmed.startsWith('tristate')) {
        node.configType = 'tristate';
        this.currentLine++;
      } else if (trimmed.startsWith('string ')) {
        node.configType = 'string';
        const promptMatch = trimmed.match(/^string\s+"(.+)"$/);
        if (promptMatch) node.prompt = promptMatch[1];
        this.currentLine++;
      } else if (trimmed.startsWith('string')) {
        node.configType = 'string';
        this.currentLine++;
      } else if (trimmed.startsWith('int ')) {
        node.configType = 'int';
        const promptMatch = trimmed.match(/^int\s+"(.+)"$/);
        if (promptMatch) node.prompt = promptMatch[1];
        this.currentLine++;
      } else if (trimmed.startsWith('int')) {
        node.configType = 'int';
        this.currentLine++;
      } else if (trimmed.startsWith('hex ')) {
        node.configType = 'hex';
        const promptMatch = trimmed.match(/^hex\s+"(.+)"$/);
        if (promptMatch) node.prompt = promptMatch[1];
        this.currentLine++;
      } else if (trimmed.startsWith('hex')) {
        node.configType = 'hex';
        this.currentLine++;
      } else if (trimmed.startsWith('prompt ')) {
        const promptMatch = trimmed.match(/^prompt\s+"(.+)"$/);
        if (promptMatch) node.prompt = promptMatch[1];
        this.currentLine++;
      } else if (trimmed.startsWith('default ')) {
        const defaultMatch = trimmed.match(/^default\s+(.+?)(\s+if\s+.+)?$/);
        if (defaultMatch) {
          let defVal = defaultMatch[1].trim();
          if (defVal.startsWith('"') && defVal.endsWith('"')) {
            defVal = defVal.slice(1, -1);
          }
          node.defaultValue = defVal;
        }
        this.currentLine++;
      } else if (trimmed.startsWith('depends on ')) {
        const deps = trimmed.replace('depends on ', '').split(/\s+&&\s+/).map(d => d.trim());
        node.dependsOn = [...(node.dependsOn || []), ...deps];
        this.currentLine++;
      } else if (trimmed.startsWith('select ')) {
        const selectMatch = trimmed.match(/^select\s+(\w+)/);
        if (selectMatch) {
          node.select = [...(node.select || []), selectMatch[1]];
        }
        this.currentLine++;
      } else if (trimmed.startsWith('imply ')) {
        const implyMatch = trimmed.match(/^imply\s+(\w+)/);
        if (implyMatch) {
          node.implies = [...(node.implies || []), implyMatch[1]];
        }
        this.currentLine++;
      } else if (trimmed === 'help' || trimmed === '---help---') {
        inHelp = true;
        helpText = [];
        this.currentLine++;
      } else if (trimmed.startsWith('config ') || trimmed.startsWith('menu ') || trimmed.startsWith('endmenu') || trimmed.startsWith('choice') || trimmed.startsWith('endchoice')) {
        break;
      } else {
        this.currentLine++;
      }
    }

    if (inHelp && helpText.length > 0) {
      node.help = helpText.join('\n').trim();
    }

    this.registerSymbol(node);

    return node;
  }

  private parseMenu(): KconfigNode | null {
    const line = this.lines[this.currentLine];
    const match = line.trim().match(/^menu\s+"(.+)"$/);
    if (!match) return null;

    const prompt = match[1];
    const node: KconfigNode = {
      id: this.getNextNodeId(),
      type: 'menu',
      prompt,
      children: [],
    };

    this.currentLine++;

    while (this.currentLine < this.lines.length) {
      const currentLine = this.lines[this.currentLine];
      const trimmed = currentLine.trim();

      if (trimmed.startsWith('endmenu')) {
        this.currentLine++;
        break;
      }

      if (trimmed.startsWith('config ')) {
        const child = this.parseConfig();
        if (child) node.children!.push(child);
      } else if (trimmed.startsWith('menu ')) {
        const child = this.parseMenu();
        if (child) node.children!.push(child);
      } else if (trimmed.startsWith('choice')) {
        const child = this.parseChoice();
        if (child) node.children!.push(child);
      } else if (trimmed.startsWith('comment ')) {
        const child = this.parseComment();
        if (child) node.children!.push(child);
      } else if (trimmed.startsWith('source ')) {
        this.currentLine++;
      } else if (trimmed === '' || trimmed.startsWith('#')) {
        this.currentLine++;
      } else {
        this.currentLine++;
      }
    }

    return node;
  }

  private parseChoice(): KconfigNode | null {
    const node: KconfigNode = {
      id: this.getNextNodeId(),
      type: 'choice',
      choiceOptions: [],
    };

    this.currentLine++;

    while (this.currentLine < this.lines.length) {
      const currentLine = this.lines[this.currentLine];
      const trimmed = currentLine.trim();

      if (trimmed.startsWith('endchoice')) {
        this.currentLine++;
        break;
      }

      if (trimmed.startsWith('prompt ')) {
        const promptMatch = trimmed.match(/^prompt\s+"(.+)"$/);
        if (promptMatch) node.prompt = promptMatch[1];
        this.currentLine++;
      } else if (trimmed.startsWith('config ')) {
        const child = this.parseConfig();
        if (child) node.choiceOptions!.push(child);
      } else if (trimmed.startsWith('default ')) {
        this.currentLine++;
      } else if (trimmed.startsWith('optional')) {
        node.optional = true;
        this.currentLine++;
      } else if (trimmed === '' || trimmed.startsWith('#')) {
        this.currentLine++;
      } else {
        this.currentLine++;
      }
    }

    return node;
  }

  private parseComment(): KconfigNode | null {
    const line = this.lines[this.currentLine];
    const match = line.trim().match(/^comment\s+"(.+)"$/);
    if (!match) return null;

    const node: KconfigNode = {
      id: this.getNextNodeId(),
      type: 'comment',
      prompt: match[1],
    };

    this.currentLine++;
    return node;
  }

  private registerSymbol(node: KconfigNode): void {
    if (!node.name || node.type !== 'config') return;

    this.symbols[node.name] = {
      name: node.name,
      type: node.configType || 'bool',
      value: node.defaultValue || false,
      dependencies: node.dependsOn || [],
      reverseDependencies: [],
      selectedBy: [],
      impliedBy: [],
      prompt: node.prompt,
      help: node.help,
      defaultValue: node.defaultValue,
    };
  }
}

export const parseKconfig = (content: string): KconfigParseResult => {
  const parser = new KconfigParser();
  return parser.parse(content);
};
