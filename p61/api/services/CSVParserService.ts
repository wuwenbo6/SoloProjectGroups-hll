import { TestDataRow, ActionStep } from '../../shared/types.ts';

export class CSVParserService {
  parseCSV(csvContent: string): TestDataRow[] {
    const lines = csvContent.trim().split(/\r?\n/);
    if (lines.length < 2) {
      return [];
    }

    const headers = this.parseCSVLine(lines[0]);
    const dataRows: TestDataRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      if (values.length === 0) continue;

      const row: TestDataRow = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      dataRows.push(row);
    }

    return dataRows;
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          current += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
    }

    result.push(current.trim());
    return result;
  }

  generateCSV(headers: string[], data: TestDataRow[]): string {
    const lines: string[] = [];
    lines.push(headers.join(','));

    data.forEach((row) => {
      const values = headers.map((header) => {
        const value = row[header] || '';
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      });
      lines.push(values.join(','));
    });

    return lines.join('\n');
  }

  extractVariablesFromSteps(steps: ActionStep[]): string[] {
    const variables: Set<string> = new Set();

    steps.forEach((step) => {
      if (step.value) {
        const matches = step.value.match(/\{\{(\w+)\}\}/g);
        if (matches) {
          matches.forEach((match) => {
            const varName = match.replace(/\{\{|\}\}/g, '');
            variables.add(varName);
          });
        }
      }
    });

    return Array.from(variables);
  }

  replaceVariables(
    steps: ActionStep[],
    testData: TestDataRow
  ): ActionStep[] {
    return steps.map((step) => {
      const newStep = { ...step };

      if (newStep.value) {
        newStep.value = this.replaceInString(newStep.value, testData);
      }

      if (newStep.alternativeSelectors) {
        newStep.alternativeSelectors = newStep.alternativeSelectors.map((alt) => ({
          ...alt,
          selector: this.replaceInString(alt.selector, testData),
        }));
      }

      newStep.selector = this.replaceInString(newStep.selector, testData);

      return newStep;
    });
  }

  private replaceInString(str: string, testData: TestDataRow): string {
    return str.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      return testData[varName] !== undefined ? testData[varName] : match;
    });
  }

  detectVariables(text: string): { name: string; start: number; end: number }[] {
    const variables: { name: string; start: number; end: number }[] = [];
    const regex = /\{\{(\w+)\}\}/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      variables.push({
        name: match[1],
        start: match.index,
        end: match.index + match[0].length,
      });
    }

    return variables;
  }

  getSampleTestData(variables: string[]): TestDataRow[] {
    return [
      variables.reduce((row, v) => ({ ...row, [v]: `${v}_value_1` }), {}),
      variables.reduce((row, v) => ({ ...row, [v]: `${v}_value_2` }), {}),
    ];
  }
}

export default new CSVParserService();
