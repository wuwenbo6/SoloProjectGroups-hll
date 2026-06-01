import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

export interface ScriptTemplate {
  id: string;
  name: string;
  description: string;
  code: string;
  category: string;
  createdAt: number;
  updatedAt: number;
  isBuiltin?: boolean;
}

const BUILTIN_TEMPLATES: ScriptTemplate[] = [
  {
    id: 'builtin-basic-url',
    name: '基础 URL 统计',
    description: '统计访问日志中各 URL 的访问次数',
    code: `function process_log(line)
    local method, url = line:match('"(%u+)%s+([^%s]+)%s+HTTP')
    
    if method and url then
        stats.increment('url:' .. url)
        stats.increment('method:' .. method)
        
        local status = line:match('"%s+(%d+)%s+')
        if status then
            stats.increment('status:' .. status)
        end
        
        extractor.add({
            url = url,
            method = method,
            status = status or '-'
        })
        
        print('Processed: ' .. method .. ' ' .. url)
    end
end`,
    category: '基础',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isBuiltin: true,
  },
  {
    id: 'builtin-404-detector',
    name: '404 错误检测',
    description: '找出返回 404 状态码的请求',
    code: `function process_log(line)
    local method, url = line:match('"(%u+)%s+([^%s]+)%s+HTTP')
    local status = line:match('"%s+(%d+)%s+')
    
    if status == '404' and method and url then
        stats.increment('404:' .. url)
        stats.increment('total:404', 1)
        
        extractor.add({
            url = url,
            method = method,
            status = '404'
        })
        
        print('404 Found: ' .. method .. ' ' .. url)
    end
end

print('Scanning for 404 errors...')`,
    category: '错误分析',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isBuiltin: true,
  },
  {
    id: 'builtin-slow-request',
    name: '慢请求分析',
    description: '统计响应时间超过阈值的请求',
    code: `function process_log(line)
    local method, url = line:match('"(%u+)%s+([^%s]+)%s+HTTP')
    local status = line:match('"%s+(%d+)%s+')
    local size = tonumber(line:match('"%s+%d+%s+(%d+)'))
    
    if method and url then
        if size and size > 1000 then
            stats.increment('large_response:' .. url)
        end
        
        stats.increment('url:' .. url)
        
        extractor.add({
            url = url,
            method = method,
            status = status or '-',
            size = tostring(size or 0)
        })
    end
end

print('Analyzing request patterns...')`,
    category: '性能分析',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isBuiltin: true,
  },
  {
    id: 'builtin-ua-parser',
    name: '用户代理分析',
    description: '统计不同浏览器/客户端的访问情况',
    code: `function process_log(line)
    local user_agent = line:match('"[^"]*"%s+"([^"]*)"$')
    
    if user_agent then
        if user_agent:find('Chrome') then
            stats.increment('browser:Chrome')
        elseif user_agent:find('Firefox') then
            stats.increment('browser:Firefox')
        elseif user_agent:find('Safari') then
            stats.increment('browser:Safari')
        elseif user_agent:find('Mozilla') then
            stats.increment('browser:Mozilla')
        else
            stats.increment('browser:Other')
        end
        
        extractor.add({
            user_agent = user_agent:sub(1, 50)
        })
    end
end`,
    category: '用户分析',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isBuiltin: true,
  },
];

const DATA_DIR = path.join(process.cwd(), 'data');
const TEMPLATES_FILE = path.join(DATA_DIR, 'templates.json');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadUserTemplates(): ScriptTemplate[] {
  ensureDataDir();
  if (fs.existsSync(TEMPLATES_FILE)) {
    try {
      const content = fs.readFileSync(TEMPLATES_FILE, 'utf-8');
      return JSON.parse(content);
    } catch (e) {
      console.error('Failed to load templates:', e);
      return [];
    }
  }
  return [];
}

function saveUserTemplates(templates: ScriptTemplate[]): void {
  ensureDataDir();
  fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(templates, null, 2));
}

export class TemplateStore {
  private userTemplates: ScriptTemplate[];

  constructor() {
    this.userTemplates = loadUserTemplates();
  }

  getAll(): ScriptTemplate[] {
    return [...BUILTIN_TEMPLATES, ...this.userTemplates];
  }

  getById(id: string): ScriptTemplate | undefined {
    return this.getAll().find(t => t.id === id);
  }

  getByCategory(category?: string): ScriptTemplate[] {
    const all = this.getAll();
    if (!category) return all;
    return all.filter(t => t.category === category);
  }

  getCategories(): string[] {
    const categories = new Set(this.getAll().map(t => t.category));
    return Array.from(categories).sort();
  }

  create(template: Omit<ScriptTemplate, 'id' | 'createdAt' | 'updatedAt'>): ScriptTemplate {
    const newTemplate: ScriptTemplate = {
      ...template,
      id: `tpl_${uuidv4()}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.userTemplates.push(newTemplate);
    saveUserTemplates(this.userTemplates);
    return newTemplate;
  }

  update(id: string, updates: Partial<ScriptTemplate>): ScriptTemplate | null {
    const index = this.userTemplates.findIndex(t => t.id === id);
    if (index === -1) return null;

    this.userTemplates[index] = {
      ...this.userTemplates[index],
      ...updates,
      id,
      updatedAt: Date.now(),
    };
    saveUserTemplates(this.userTemplates);
    return this.userTemplates[index];
  }

  delete(id: string): boolean {
    const index = this.userTemplates.findIndex(t => t.id === id);
    if (index === -1) return false;

    this.userTemplates.splice(index, 1);
    saveUserTemplates(this.userTemplates);
    return true;
  }
}

export const templateStore = new TemplateStore();
