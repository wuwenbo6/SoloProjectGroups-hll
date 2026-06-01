import { ModelType, DiodeParameters, BJTParameters, MOSFETParameters, ModelParameters } from '../../shared/types';

function formatSpiceValue(value: number): string {
  if (value === 0) return '0';
  const absVal = Math.abs(value);
  if (absVal >= 1e12) return `${(value / 1e12).toPrecision(4)}T`;
  if (absVal >= 1e9) return `${(value / 1e9).toPrecision(4)}G`;
  if (absVal >= 1e6) return `${(value / 1e6).toPrecision(4)}Meg`;
  if (absVal >= 1e3) return `${(value / 1e3).toPrecision(4)}K`;
  if (absVal >= 1) return value.toPrecision(4);
  if (absVal >= 1e-3) return `${(value * 1e3).toPrecision(4)}m`;
  if (absVal >= 1e-6) return `${(value * 1e6).toPrecision(4)}u`;
  if (absVal >= 1e-9) return `${(value * 1e9).toPrecision(4)}n`;
  if (absVal >= 1e-12) return `${(value * 1e12).toPrecision(4)}p`;
  return `${(value * 1e15).toPrecision(4)}f`;
}

export function generateSpiceStatement(modelType: ModelType, parameters: ModelParameters, modelName: string = 'M1'): string {
  switch (modelType) {
    case 'diode': {
      const p = parameters as DiodeParameters;
      let stmt = `.MODEL ${modelName} D (\n`;
      stmt += `+ IS=${formatSpiceValue(p.IS)}\n`;
      stmt += `+ N=${p.N.toFixed(4)}`;
      if (p.RS !== undefined) {
        stmt += `\n+ RS=${formatSpiceValue(p.RS)}`;
      }
      stmt += `\n)`;
      return stmt;
    }
    case 'bjt': {
      const p = parameters as BJTParameters;
      let stmt = `.MODEL ${modelName} NPN (\n`;
      stmt += `+ IS=${formatSpiceValue(p.IS)}\n`;
      stmt += `+ BF=${p.BF.toFixed(2)}\n`;
      stmt += `+ NF=${p.NF.toFixed(4)}`;
      if (p.VAF !== undefined) {
        stmt += `\n+ VAF=${formatSpiceValue(p.VAF)}`;
      }
      stmt += `\n)`;
      return stmt;
    }
    case 'mosfet': {
      const p = parameters as MOSFETParameters;
      let stmt = `.MODEL ${modelName} NMOS (\n`;
      stmt += `+ KP=${formatSpiceValue(p.KP)}\n`;
      stmt += `+ VTO=${p.VTO.toFixed(4)}`;
      if (p.LAMBDA !== undefined) {
        stmt += `\n+ LAMBDA=${p.LAMBDA.toFixed(6)}`;
      }
      if (p.W !== undefined) {
        stmt += `\n+ W=${formatSpiceValue(p.W)}`;
      }
      if (p.L !== undefined) {
        stmt += `\n+ L=${formatSpiceValue(p.L)}`;
      }
      stmt += `\n)`;
      return stmt;
    }
    default:
      return '';
  }
}
