import {
  ParsedPineScript,
  PineBarColorDef,
  PineBgColorDef,
  PineFillDef,
  PineHlineDef,
  PineInputDef,
  PineInputKind,
  PinePlotDef,
  PinePlotStyle,
  PineShapeDef,
  PineShapeLocation,
  PineShapeStyle,
  PineStatement,
  PineVersion,
} from './pineTypes';
import { resolvePineColorValue } from './pineTaLib';

export interface LogicalLine {
  indent: number;
  text: string;
}

const DEFAULT_PALETTE = ['#2962ff', '#f59e0b', '#089981', '#f23645', '#9c27b0', '#00bcd4'];

export function detectPineVersion(code: string): PineVersion {
  const m = /\/\/\s*@version\s*=\s*([456])/.exec(code);
  if (m) return Number(m[1]) as PineVersion;
  return 6;
}

/**
 * Strips `//` comments outside string literals (`'...'` and `"..."`).
 */
export function stripPineComments(line: string): string {
  let inStr: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inStr) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === inStr) inStr = null;
    } else {
      if (ch === '"' || ch === "'") {
        inStr = ch;
      } else if (ch === '/' && line[i + 1] === '/') {
        return line.slice(0, i);
      }
    }
  }
  return line;
}

function countIndent(rawLine: string): number {
  let n = 0;
  for (let i = 0; i < rawLine.length; i++) {
    if (rawLine[i] === ' ') n += 1;
    else if (rawLine[i] === '\t') n += 4;
    else break;
  }
  return n;
}

function updateParenDepth(text: string, depth: number): number {
  let inStr: string | null = null;
  let d = depth;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === inStr) inStr = null;
    } else if (ch === '"' || ch === "'") {
      inStr = ch;
    } else if (ch === '(' || ch === '[') {
      d++;
    } else if (ch === ')' || ch === ']') {
      d = Math.max(0, d - 1);
    }
  }
  return d;
}

function endsWithContinuation(text: string): boolean {
  return /(?:,|\?|:|\+|-|\*|\/|\band|\bor|:=|=)$/.test(text.trim()) && !/=>$/.test(text.trim());
}

function startsWithContinuation(text: string): boolean {
  return /^(?:\?|:|\+|-|\*|\/|\.|and\b|or\b)/.test(text.trim());
}

/**
 * Joins multi-line Pine v6 statements into logical lines while preserving base indentation.
 */
export function joinLogicalLines(code: string): LogicalLine[] {
  const rawLines = code.split(/\r?\n/);
  const result: LogicalLine[] = [];

  let curText = '';
  let curIndent = 0;
  let depth = 0;

  for (let i = 0; i < rawLines.length; i++) {
    const withoutComment = stripPineComments(rawLines[i]);
    const trimmed = withoutComment.trim();
    if (!trimmed) continue;

    const indent = countIndent(withoutComment);

    if (!curText) {
      curText = trimmed;
      curIndent = indent;
      depth = updateParenDepth(trimmed, 0);
    } else if (depth > 0 || endsWithContinuation(curText) || startsWithContinuation(trimmed)) {
      curText = `${curText} ${trimmed}`;
      depth = updateParenDepth(trimmed, depth);
    } else {
      result.push({ indent: curIndent, text: curText });
      curText = trimmed;
      curIndent = indent;
      depth = updateParenDepth(trimmed, 0);
    }
  }

  if (curText) {
    result.push({ indent: curIndent, text: curText });
  }

  return result;
}

export function splitTopLevelArgs(argStr: string): string[] {
  const res: string[] = [];
  let depth = 0;
  let inStr: string | null = null;
  let cur = '';
  for (let i = 0; i < argStr.length; i++) {
    const ch = argStr[i];
    if (inStr) {
      cur += ch;
      if (ch === inStr && argStr[i - 1] !== '\\') inStr = null;
    } else if (ch === '"' || ch === "'") {
      inStr = ch;
      cur += ch;
    } else if (ch === '(' || ch === '[') {
      depth++;
      cur += ch;
    } else if (ch === ')' || ch === ']') {
      depth--;
      cur += ch;
    } else if (ch === ',' && depth === 0) {
      res.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) res.push(cur.trim());
  return res;
}

export function parseNamedAndPositional(args: string[]): {
  pos: string[];
  named: Record<string, string>;
} {
  const pos: string[] = [];
  const named: Record<string, string> = {};
  for (const a of args) {
    // Match `ident = expr` at top level without confusing `==`, `!=`, `<=`, `>=`, `:=`, `=>`
    const m = /^([a-zA-Z_]\w*)\s*=(?![=>])\s*(.+)$/.exec(a);
    if (m) {
      named[m[1]] = m[2].trim();
    } else {
      pos.push(a);
    }
  }
  return { pos, named };
}

function unquote(s: string | undefined, fallback = ''): string {
  if (!s) return fallback;
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function parsePlotStyle(raw: string | undefined): PinePlotStyle {
  const s = (raw || '').toLowerCase();
  if (s.includes('linebr')) return 'linebr';
  if (s.includes('stepline')) return 'stepline';
  if (s.includes('histogram')) return 'histogram';
  if (s.includes('columns')) return 'columns';
  if (s.includes('circles')) return 'circles';
  if (s.includes('cross')) return 'cross';
  if (s.includes('area')) return 'area';
  return 'line';
}

function parseShapeStyle(raw: string | undefined): PineShapeStyle {
  const s = (raw || '').toLowerCase();
  if (s.includes('triangledown')) return 'triangledown';
  if (s.includes('triangleup')) return 'triangleup';
  if (s.includes('labelup')) return 'labelup';
  if (s.includes('labeldown')) return 'labeldown';
  if (s.includes('diamond')) return 'diamond';
  if (s.includes('xcross')) return 'xcross';
  if (s.includes('cross')) return 'cross';
  if (s.includes('circle')) return 'circle';
  return 'triangleup';
}

function parseShapeLocation(raw: string | undefined): PineShapeLocation {
  const s = (raw || '').toLowerCase();
  if (s.includes('belowbar')) return 'belowbar';
  if (s.includes('abovebar')) return 'abovebar';
  if (s.includes('top')) return 'top';
  if (s.includes('bottom')) return 'bottom';
  if (s.includes('absolute')) return 'absolute';
  return 'abovebar';
}

function parseShapeSize(raw: string | undefined): 'tiny' | 'small' | 'normal' | 'large' {
  const s = (raw || '').toLowerCase();
  if (s.includes('tiny')) return 'tiny';
  if (s.includes('large') || s.includes('huge')) return 'large';
  if (s.includes('normal')) return 'normal';
  return 'small';
}

function parseHlineStyle(raw: string | undefined): 'solid' | 'dashed' | 'dotted' {
  const s = (raw || '').toLowerCase();
  if (s.includes('solid')) return 'solid';
  if (s.includes('dotted')) return 'dotted';
  return 'dashed';
}

/**
 * Strips Pine v6 type qualifiers (`var`, `varip`, `const`, `simple`, `series`, `int`, `float`, `bool`, `string`, `color`, `array<float>`, `float[]`)
 * from the left-hand side of a variable declaration.
 */
function stripDeclarationPrefix(lhs: string): { varName: string; isVar: boolean } | null {
  let s = lhs.trim();
  let isVar = false;
  if (/^(?:varip|var)\s+/.test(s)) {
    isVar = true;
    s = s.replace(/^(?:varip|var)\s+/, '');
  }
  // Remove optional qualifiers & built-in or custom PascalCase type annotations (e.g. `Cnd cd`, `array<Cnd> cs`)
  s = s.replace(/^(?:const|simple|series)\s+/, '');
  s = s.replace(
    /^(?:array<[^>]+>|matrix<[^>]+>|map<[^>]+>|(?:int|float|bool|string|color|box|line|label|table|polyline|linefill|[A-Z][a-zA-Z0-9_]*)(?:\[\])?)\s+/,
    ''
  );
  s = s.trim();
  if (/^[a-zA-Z_]\w*$/.test(s)) {
    return { varName: s, isVar };
  }
  return null;
}

function addWarningOnce(warnings: string[], msg: string) {
  if (!warnings.includes(msg)) warnings.push(msg);
}

function buildPineInputDef(
  varName: string,
  rawSub: string | undefined,
  rawArgs: string,
  constStrings?: Record<string, string>
): PineInputDef {
  const { pos, named } = parseNamedAndPositional(splitTopLevelArgs(rawArgs));
  const rawDef = (named.defval ?? pos[0] ?? '').trim();
  const iTitle = unquote(named.title || pos[1], varName);

  let kind: PineInputKind = 'float';
  if (
    rawSub === 'int' ||
    rawSub === 'float' ||
    rawSub === 'bool' ||
    rawSub === 'source' ||
    rawSub === 'color'
  ) {
    kind = rawSub;
  } else if (rawSub === 'string' || rawSub === 'timeframe' || rawSub === 'session') {
    kind = 'string';
  } else {
    if (rawDef === 'true' || rawDef === 'false') kind = 'bool';
    else if (/^['"]/.test(rawDef)) kind = 'string';
    else if (/^(close|open|high|low|hl2|hlc3|ohlc4|volume)$/.test(rawDef)) kind = 'source';
    else kind = rawDef.includes('.') ? 'float' : 'int';
  }

  let defaultVal: number | boolean | string = 0;
  let options: string[] | undefined;

  if (kind === 'bool') {
    defaultVal = rawDef === 'true';
  } else if (kind === 'string') {
    defaultVal = unquote(rawDef, '');
    if (named.options) {
      const optInner = named.options.replace(/^\[|\]$/g, '');
      options = splitTopLevelArgs(optInner).map((o) => unquote(o));
    }
  } else if (kind === 'source') {
    defaultVal = rawDef || 'close';
  } else if (kind === 'color') {
    defaultVal = resolvePineColorValue(rawDef, '#2962ff');
  } else {
    const n = Number(rawDef);
    defaultVal = Number.isFinite(n) ? n : 0;
  }

  let resolvedGroup: string | undefined;
  if (named.group) {
    const rawGrp = named.group.trim();
    resolvedGroup =
      constStrings && constStrings[rawGrp] !== undefined
        ? constStrings[rawGrp]
        : unquote(rawGrp);
  }

  return {
    varName,
    title: iTitle,
    type: kind,
    defaultVal,
    options,
    minval: named.minval !== undefined ? Number(named.minval) : undefined,
    maxval: named.maxval !== undefined ? Number(named.maxval) : undefined,
    step: named.step !== undefined ? Number(named.step) : undefined,
    group: resolvedGroup,
  };
}

/**
 * Extracts inline `input.*(...)` calls embedded inside expressions (e.g. `maxnumsr = input.int(6, ...) - 1`),
 * registering them into `inputs` and replacing them with their synthetic variable names.
 */
function extractInlineInputs(expr: string, inputs: PineInputDef[]): string {
  let out = expr;
  const re = /\binput(?:\.(int|float|bool|string|source|color|timeframe|session))?\s*\(/;
  let guard = 0;
  while (re.test(out) && guard < 20) {
    guard++;
    const m = re.exec(out);
    if (!m) break;
    const start = m.index;
    const rawSub = m[1];
    const openIdx = start + m[0].length - 1;
    let depth = 1;
    let inStr: string | null = null;
    let closeIdx = -1;
    for (let i = openIdx + 1; i < out.length; i++) {
      const ch = out[i];
      if (inStr) {
        if (ch === '\\') {
          i++;
          continue;
        }
        if (ch === inStr) inStr = null;
      } else if (ch === '"' || ch === "'") {
        inStr = ch;
      } else if (ch === '(') {
        depth++;
      } else if (ch === ')') {
        depth--;
        if (depth === 0) {
          closeIdx = i;
          break;
        }
      }
    }
    if (closeIdx <= openIdx) break;
    const rawArgs = out.slice(openIdx + 1, closeIdx);
    const varName = `__inp_${inputs.length}`;
    inputs.push(buildPineInputDef(varName, rawSub, rawArgs));
    out = out.slice(0, start) + varName + out.slice(closeIdx + 1);
  }
  return out;
}

export function parsePineScript(code: string): ParsedPineScript {
  const version = detectPineVersion(code);
  const logicalLines = joinLogicalLines(code);

  let scriptType: 'indicator' | 'strategy' = 'indicator';
  let title = 'Custom Pine Indicator';
  let shortTitle = 'PINE';
  let isMain = false; // Pine v6 spec: overlay defaults to false if omitted
  let overlaySpecified = false;

  const inputs: PineInputDef[] = [];
  const statements: PineStatement[] = [];
  const plots: PinePlotDef[] = [];
  const fills: PineFillDef[] = [];
  const shapes: PineShapeDef[] = [];
  const hlines: PineHlineDef[] = [];
  const bgColors: PineBgColorDef[] = [];
  const barColors: PineBarColorDef[] = [];
  const warnings: string[] = [];

  // Map `p1` -> `p0` or `hTop` -> `h0` for `fill(p1, p2, ...)`
  const handleMap: Record<string, string> = {};
  const constStrings: Record<string, string> = {};

  function parseBlockStatements(
    lines: LogicalLine[],
    startIdx: number,
    minIndent: number,
    enclosingCond?: string
  ): { stmts: PineStatement[]; nextIdx: number; lastExpr?: string } {
    const stmts: PineStatement[] = [];
    let i = startIdx;
    let lastExpr: string | undefined;

    while (i < lines.length && lines[i].indent >= minIndent) {
      const line = lines[i].text;
      const curIndent = lines[i].indent;

      // strategy.entry inside an `if` block -> auto-emit plotshape!
      const stratEntry = /^strategy\.entry\s*\((.*)\)$/.exec(line);
      if (stratEntry) {
        const { pos, named } = parseNamedAndPositional(splitTopLevelArgs(stratEntry[1]));
        const idTitle = unquote(named.id || pos[0], 'Entry');
        const dirRaw = (named.direction || pos[1] || 'strategy.long').toLowerCase();
        const isLong = !dirRaw.includes('short');
        const whenCond = named.when || enclosingCond || 'false';
        const key = `s${shapes.length}`;
        shapes.push({
          condExpr: whenCond,
          key,
          title: idTitle,
          shape: isLong ? 'triangleup' : 'triangledown',
          location: isLong ? 'belowbar' : 'abovebar',
          colorExpr: isLong ? 'color.green' : 'color.red',
          fallbackColor: isLong ? '#089981' : '#f23645',
          text: isLong ? 'LONG' : 'SHORT',
          size: 'small',
        });
        i++;
        continue;
      }

      if (/^(?:strategy\.(?:exit|close|close_all|cancel|risk)|alertcondition|alert\s*\()/.test(line)) {
        const prefix = line.split(/[.(]/)[0];
        addWarningOnce(warnings, `Skipped non-chart directive: ${prefix}.*`);
        i++;
        continue;
      }

      if (line === 'break') {
        stmts.push({ kind: 'break' });
        i++;
        continue;
      }
      if (line === 'continue') {
        stmts.push({ kind: 'continue' });
        i++;
        continue;
      }

      // Nested `switch` inside block (e.g. inside user function `f_pos(string s) => switch s ...`)
      const nestedSwitch = /^(?:([^=]+?)\s*=\s*)?switch(?:\s+(.+))?$/.exec(line);
      if (nestedSwitch && (!nestedSwitch[1] || !/[<>!]$/.test(nestedSwitch[1].trim()))) {
        const targetDecl = nestedSwitch[1] ? stripDeclarationPrefix(nestedSwitch[1]) : null;
        const switchExpr = (nestedSwitch[2] || '').trim();
        const cases: Array<{ matchExpr: string | null; resultExpr: string }> = [];
        let j = i + 1;
        while (j < lines.length && lines[j].indent > curIndent) {
          const caseLine = lines[j].text;
          const arrowIdx = caseLine.indexOf('=>');
          if (arrowIdx >= 0) {
            const left = caseLine.slice(0, arrowIdx).trim();
            const right = caseLine.slice(arrowIdx + 2).trim();
            cases.push({ matchExpr: left || null, resultExpr: right });
          }
          j++;
        }
        stmts.push({
          kind: 'switch_assign',
          varName: targetDecl?.varName,
          switchExpr,
          cases,
        });
        i = j;
        continue;
      }

      // Nested `while` inside block
      const whileMatch = /^while\s+(.+)$/.exec(line);
      if (whileMatch) {
        const inner = parseBlockStatements(lines, i + 1, curIndent + 1, enclosingCond);
        stmts.push({
          kind: 'while_loop',
          whileCond: whileMatch[1].trim(),
          loopBody: inner.stmts,
        });
        i = inner.nextIdx;
        continue;
      }

      // Nested `for item in arr` inside block
      const forInMatch = /^for\s+([a-zA-Z_]\w*)\s+in\s+(.+)$/.exec(line);
      if (forInMatch) {
        const inner = parseBlockStatements(lines, i + 1, curIndent + 1, enclosingCond);
        stmts.push({
          kind: 'for_in_loop',
          loopVar: forInMatch[1],
          iterExpr: forInMatch[2].trim(),
          loopBody: inner.stmts,
        });
        i = inner.nextIdx;
        continue;
      }

      // Nested `if / else if / else` inside block
      const nestedIfAssign = /^([^=]+?)\s*=\s*if\s+(.+)$/.exec(line);
      const nestedIfStmt = !nestedIfAssign ? /^if\s+(.+)$/.exec(line) : null;
      if (nestedIfAssign || nestedIfStmt) {
        const targetDecl = nestedIfAssign ? stripDeclarationPrefix(nestedIfAssign[1]) : null;
        const firstCond = (nestedIfAssign ? nestedIfAssign[2] : nestedIfStmt![1]).trim();
        const branches: Array<{ cond: string | null; body: PineStatement[]; resultExpr?: string }> =
          [];

        const firstBlock = parseBlockStatements(lines, i + 1, curIndent + 1, firstCond);
        branches.push({
          cond: firstCond,
          body: firstBlock.stmts,
          resultExpr: firstBlock.lastExpr,
        });
        let j = firstBlock.nextIdx;

        while (j < lines.length && lines[j].indent === curIndent) {
          const nextLine = lines[j].text;
          const elifMatch = /^else\s+if\s+(.+)$/.exec(nextLine);
          const elseMatch = /^else\b(.*)$/.exec(nextLine);
          if (elifMatch) {
            const cond = elifMatch[1].trim();
            const b = parseBlockStatements(lines, j + 1, curIndent + 1, cond);
            branches.push({ cond, body: b.stmts, resultExpr: b.lastExpr });
            j = b.nextIdx;
          } else if (elseMatch) {
            const inlineExpr = elseMatch[1].trim();
            if (inlineExpr) {
              branches.push({ cond: null, body: [], resultExpr: inlineExpr });
              j++;
            } else {
              const b = parseBlockStatements(lines, j + 1, curIndent + 1);
              branches.push({ cond: null, body: b.stmts, resultExpr: b.lastExpr });
              j = b.nextIdx;
            }
            break;
          } else {
            break;
          }
        }

        stmts.push({
          kind: 'if_block',
          varName: targetDecl?.varName,
          isVar: targetDecl?.isVar,
          branches,
        });
        i = j;
        continue;
      }

      // Nested `for` inside block
      const forMatch = /^for\s+([a-zA-Z_]\w*)\s*=\s*(.+?)\s+to\s+(.+?)(?:\s+by\s+(.+))?$/.exec(line);
      if (forMatch) {
        const inner = parseBlockStatements(lines, i + 1, curIndent + 1, enclosingCond);
        stmts.push({
          kind: 'for_loop',
          loopVar: forMatch[1],
          loopStart: forMatch[2].trim(),
          loopEnd: forMatch[3].trim(),
          loopStep: forMatch[4]?.trim() || '1',
          loopBody: inner.stmts,
        });
        i = inner.nextIdx;
        continue;
      }

      // Property compound assignment `obj.prop += expr`
      const propCompMatch = /^([a-zA-Z_]\w*\.[a-zA-Z_]\w*)\s*(\+=|-=|\*=|\/=)\s*(.+)$/.exec(line);
      if (propCompMatch) {
        stmts.push({
          kind: 'prop_compound',
          propTarget: propCompMatch[1],
          op: propCompMatch[2] as '+=' | '-=' | '*=' | '/=',
          expr: propCompMatch[3].trim(),
        });
        i++;
        continue;
      }

      // Property reassignment `obj.prop := expr`
      const propReassignMatch = /^([a-zA-Z_]\w*\.[a-zA-Z_]\w*)\s*:=\s*(.+)$/.exec(line);
      if (propReassignMatch) {
        stmts.push({
          kind: 'prop_assign',
          propTarget: propReassignMatch[1],
          expr: propReassignMatch[2].trim(),
        });
        i++;
        continue;
      }

      // Compound assignment `x += expr`
      const compMatch = /^([a-zA-Z_]\w*)\s*(\+=|-=|\*=|\/=)\s*(.+)$/.exec(line);
      if (compMatch) {
        stmts.push({
          kind: 'compound_assign',
          varName: compMatch[1],
          op: compMatch[2] as '+=' | '-=' | '*=' | '/=',
          expr: compMatch[3].trim(),
        });
        i++;
        continue;
      }

      // Reassignment `x := expr`
      const reassignMatch = /^([a-zA-Z_]\w*)\s*:=\s*(.+)$/.exec(line);
      if (reassignMatch) {
        stmts.push({
          kind: 'reassign',
          varName: reassignMatch[1],
          expr: reassignMatch[2].trim(),
        });
        i++;
        continue;
      }

      // Tuple assignment `[a, b] = expr`
      const tupleMatch = /^\[([^\]]+)\]\s*=\s*(.+)$/.exec(line);
      if (tupleMatch) {
        stmts.push({
          kind: 'tuple_assign',
          varNames: tupleMatch[1].split(',').map((v) => v.trim()),
          expr: tupleMatch[2].trim(),
        });
        i++;
        continue;
      }

      // Standard assignment `x = expr`
      const assignMatch = /^([^=]+?)\s*=(?![=>])\s*(.+)$/.exec(line);
      if (assignMatch && !/[<>!]$/.test(assignMatch[1].trim())) {
        const decl = stripDeclarationPrefix(assignMatch[1]);
        if (decl) {
          stmts.push({
            kind: 'assign',
            varName: decl.varName,
            isVar: decl.isVar,
            expr: assignMatch[2].trim(),
          });
          lastExpr = assignMatch[2].trim();
          i++;
          continue;
        }
      }

      // Standalone expression (e.g. `arr.push(x)` or return expression of an `if` expression)
      lastExpr = line;
      stmts.push({ kind: 'assign', varName: '__expr_stmt', expr: line });
      i++;
    }

    return { stmts, nextIdx: i, lastExpr };
  }

  let idx = 0;
  while (idx < logicalLines.length) {
    const { indent, text: line } = logicalLines[idx];

    // 1. indicator(...) / study(...) / strategy(...)
    const headerMatch = /^(indicator|study|strategy)\s*\((.*)\)$/.exec(line);
    if (headerMatch) {
      if (headerMatch[1] === 'strategy') {
        scriptType = 'strategy';
        addWarningOnce(
          warnings,
          'Strategy mode: strategy.entry() signals are rendered as chart markers; backtest fills are simulated visually.'
        );
      }
      const { pos, named } = parseNamedAndPositional(splitTopLevelArgs(headerMatch[2]));
      const rawTitle = named.title || pos[0];
      if (rawTitle) title = unquote(rawTitle, title);
      const rawShort = named.shorttitle || pos[1];
      shortTitle = rawShort ? unquote(rawShort) : title.slice(0, 10).toUpperCase();
      if (named.overlay !== undefined) {
        isMain = named.overlay.trim() === 'true';
        overlaySpecified = true;
      }
      idx++;
      continue;
    }

    // 2. Non-fatal unsupported top-level directives & Pine v6 `type` / `max_bars_back`
    if (/^max_bars_back\s*\(/.test(line)) {
      idx++;
      continue;
    }

    const typeMatch = /^type\s+([A-Z][a-zA-Z0-9_]*)$/.exec(line);
    if (typeMatch) {
      const typeName = typeMatch[1];
      const fields: Array<{ name: string; defaultExpr?: string }> = [];
      let j = idx + 1;
      while (j < logicalLines.length && logicalLines[j].indent > indent) {
        const fline = logicalLines[j].text.trim();
        const eqIdx = fline.indexOf('=');
        const lhs = eqIdx >= 0 ? fline.slice(0, eqIdx).trim() : fline;
        const rhs = eqIdx >= 0 ? fline.slice(eqIdx + 1).trim() : undefined;
        const parts = lhs.split(/\s+/);
        const fieldName = parts[parts.length - 1];
        if (/^[a-zA-Z_]\w*$/.test(fieldName)) {
          fields.push({ name: fieldName, defaultExpr: rhs });
        }
        j++;
      }
      statements.push({
        kind: 'type_def',
        varName: typeName,
        typeFields: fields,
      });
      idx = j;
      continue;
    }

    if (
      /^(?:import\s+|export\s+|method\s+|alertcondition\s*\(|alert\s*\(|strategy\.(?:exit|close|close_all|cancel|risk))/.test(
        line
      )
    ) {
      const kw = line.split(/[\s.(]/)[0];
      addWarningOnce(warnings, `Non-fatal compatibility notice: skipped "${kw}" directive`);
      idx++;
      continue;
    }

    // 3. Standalone strategy.entry(...)
    const stratEntryMatch = /^strategy\.entry\s*\((.*)\)$/.exec(line);
    if (stratEntryMatch) {
      const { pos, named } = parseNamedAndPositional(splitTopLevelArgs(stratEntryMatch[1]));
      const idTitle = unquote(named.id || pos[0], 'Entry');
      const dirRaw = (named.direction || pos[1] || 'strategy.long').toLowerCase();
      const isLong = !dirRaw.includes('short');
      const condExpr = named.when || 'false';
      shapes.push({
        condExpr,
        key: `s${shapes.length}`,
        title: idTitle,
        shape: isLong ? 'triangleup' : 'triangledown',
        location: isLong ? 'belowbar' : 'abovebar',
        colorExpr: isLong ? 'color.green' : 'color.red',
        fallbackColor: isLong ? '#089981' : '#f23645',
        text: isLong ? 'LONG' : 'SHORT',
        size: 'small',
      });
      idx++;
      continue;
    }

    // 4. [handleVar =] plot(...)
    const plotMatch = /^(?:([a-zA-Z_]\w*)\s*=\s*)?plot\s*\((.*)\)$/.exec(line);
    if (plotMatch) {
      const handleVar = plotMatch[1];
      const { pos, named } = parseNamedAndPositional(splitTopLevelArgs(plotMatch[2]));
      const expr = named.series || pos[0];
      if (expr) {
        const pIdx = plots.length;
        const key = `p${pIdx}`;
        const pTitle = unquote(named.title || pos[1], `Plot ${pIdx + 1}`);
        const colorExpr = (named.color || pos[2] || '').trim();
        const fallbackColor = resolvePineColorValue(
          colorExpr,
          DEFAULT_PALETTE[pIdx % DEFAULT_PALETTE.length]
        );
        const lineWidth = Math.max(1, Number(named.linewidth || pos[3] || 1.5) || 1.5);
        const style = parsePlotStyle(named.style || pos[4]);
        const offset = Math.trunc(Number(named.offset || 0) || 0);
        const hidden = (named.display || '').toLowerCase().includes('display.none');

        plots.push({
          handleVar,
          expr,
          key,
          title: pTitle,
          colorExpr: colorExpr || `'${fallbackColor}'`,
          fallbackColor,
          color: fallbackColor,
          lineWidth,
          style,
          offset,
          hidden,
        });
        if (handleVar) handleMap[handleVar] = key;
      }
      idx++;
      continue;
    }

    // 5. [handleVar =] hline(...)
    const hlineMatch = /^(?:([a-zA-Z_]\w*)\s*=\s*)?hline\s*\((.*)\)$/.exec(line);
    if (hlineMatch) {
      const handleVar = hlineMatch[1];
      const { pos, named } = parseNamedAndPositional(splitTopLevelArgs(hlineMatch[2]));
      const val = Number(named.price || pos[0]);
      if (!Number.isNaN(val)) {
        const key = `h${hlines.length}`;
        hlines.push({
          handleVar,
          key,
          value: val,
          title: unquote(named.title || pos[1], `${val}`),
          color: resolvePineColorValue(named.color || pos[2], '#787b86'),
          linestyle: parseHlineStyle(named.linestyle || pos[3]),
        });
        if (handleVar) handleMap[handleVar] = key;
      }
      idx++;
      continue;
    }

    // 6. fill(p1, p2, color=...)
    const fillMatch = /^fill\s*\((.*)\)$/.exec(line);
    if (fillMatch) {
      const { pos, named } = parseNamedAndPositional(splitTopLevelArgs(fillMatch[1]));
      const h1 = (named.plot1 || named.hline1 || pos[0] || '').trim();
      const h2 = (named.plot2 || named.hline2 || pos[1] || '').trim();
      const k1 = handleMap[h1];
      const k2 = handleMap[h2];
      if (k1 && k2) {
        const colorExpr = (named.color || pos[2] || 'color.new(color.blue, 85)').trim();
        const fallbackColor = resolvePineColorValue(colorExpr, 'rgba(41, 98, 255, 0.15)');
        fills.push({
          plot1Key: k1,
          plot2Key: k2,
          colorExpr,
          fallbackColor,
          title: named.title ? unquote(named.title) : undefined,
        });
      } else {
        addWarningOnce(warnings, `fill(${h1}, ${h2}) referenced unknown plot/hline handles`);
      }
      idx++;
      continue;
    }

    // 7. plotshape(...) / plotchar(...)
    const shapeMatch = /^(plotshape|plotchar)\s*\((.*)\)$/.exec(line);
    if (shapeMatch) {
      const isChar = shapeMatch[1] === 'plotchar';
      const { pos, named } = parseNamedAndPositional(splitTopLevelArgs(shapeMatch[2]));
      const condExpr = named.series || pos[0];
      if (condExpr) {
        const sIdx = shapes.length;
        const rawColor = (named.color || '').trim();
        const colorExpr =
          rawColor && rawColor !== 'na'
            ? rawColor
            : (named.textcolor || 'color.orange').trim();
        const fallbackColor = resolvePineColorValue(colorExpr, '#f59e0b');
        shapes.push({
          condExpr,
          key: `s${sIdx}`,
          title: unquote(named.title || pos[1], `Signal ${sIdx + 1}`),
          shape: isChar ? 'char' : parseShapeStyle(named.style),
          location: parseShapeLocation(named.location),
          colorExpr,
          fallbackColor,
          text: unquote(named.text, ''),
          charGlyph: isChar ? unquote(named.char || pos[2], '•') : undefined,
          size: parseShapeSize(named.size),
        });
      }
      idx++;
      continue;
    }

    // 8. bgcolor(...)
    const bgMatch = /^bgcolor\s*\((.*)\)$/.exec(line);
    if (bgMatch) {
      const { pos, named } = parseNamedAndPositional(splitTopLevelArgs(bgMatch[1]));
      const colorExpr = (named.color || pos[0] || '').trim();
      if (colorExpr) {
        bgColors.push({ key: `bg${bgColors.length}`, colorExpr });
      }
      idx++;
      continue;
    }

    // 9. barcolor(...)
    const barColorMatch = /^barcolor\s*\((.*)\)$/.exec(line);
    if (barColorMatch) {
      const { pos, named } = parseNamedAndPositional(splitTopLevelArgs(barColorMatch[1]));
      const colorExpr = (named.color || pos[0] || '').trim();
      if (colorExpr) {
        barColors.push({ key: `bc${barColors.length}`, colorExpr });
      }
      idx++;
      continue;
    }

    // 10. All typed input.* declarations (only when input.*(...) is the entire RHS)
    const inputMatch =
      /^([^=]+?)\s*=\s*input(?:\.(int|float|bool|string|source|color|timeframe|session))?\s*\((.*)\)$/.exec(
        line
      );
    if (inputMatch && !/[<>!]$/.test(inputMatch[1].trim())) {
      const decl = stripDeclarationPrefix(inputMatch[1]);
      // Ensure the closing `)` actually matches the opening `(` of `input(...)` (not `input(...) - 1` or `input(...) + input(...)`)
      const rhsAfterInput = inputMatch[3];
      let balanced = true;
      let d = 0;
      let q: string | null = null;
      for (let k = 0; k < rhsAfterInput.length; k++) {
        const ch = rhsAfterInput[k];
        if (q) {
          if (ch === '\\') {
            k++;
            continue;
          }
          if (ch === q) q = null;
        } else if (ch === '"' || ch === "'") {
          q = ch;
        } else if (ch === '(') {
          d++;
        } else if (ch === ')') {
          d--;
          if (d < 0) {
            balanced = false;
            break;
          }
        }
      }
      if (decl && balanced && d === 0) {
        inputs.push(buildPineInputDef(decl.varName, inputMatch[2], rhsAfterInput, constStrings));
        idx++;
        continue;
      }
    }

    // 11. User-defined function: `fn(a, b) => expr` (single-line or multi-line)
    const funcMatch = /^([a-zA-Z_]\w*)\s*\(([^)]*)\)\s*=>\s*(.*)$/.exec(line);
    if (funcMatch) {
      const fnName = funcMatch[1];
      const rawParams = funcMatch[2].trim()
        ? splitTopLevelArgs(funcMatch[2]).map((p) => {
            // Strip optional type annotations or defaults: `series float x = 10` -> `x`
            const noDef = p.split('=')[0].trim();
            const parts = noDef.split(/\s+/);
            return parts[parts.length - 1];
          })
        : [];
      let body = funcMatch[3].trim();
      let funcStmts: PineStatement[] | undefined;
      if (!body) {
        // Multi-line function body: preserve full statement list!
        const block = parseBlockStatements(logicalLines, idx + 1, indent + 1);
        funcStmts = block.stmts;
        body = block.lastExpr || 'na';
        idx = block.nextIdx;
      } else {
        idx++;
      }
      statements.push({
        kind: 'func_def',
        varName: fnName,
        funcParams: rawParams,
        funcBody: body,
        funcStmts,
      });
      continue;
    }

    // 12. Switch expression assignment: `ma = switch maType`
    const switchAssignMatch = /^([^=]+?)\s*=\s*switch(?:\s+(.+))?$/.exec(line);
    if (switchAssignMatch && !/[<>!]$/.test(switchAssignMatch[1].trim())) {
      const decl = stripDeclarationPrefix(switchAssignMatch[1]);
      if (decl) {
        const switchExpr = (switchAssignMatch[2] || '').trim();
        const cases: Array<{ matchExpr: string | null; resultExpr: string }> = [];
        let j = idx + 1;
        while (j < logicalLines.length && logicalLines[j].indent > indent) {
          const caseLine = logicalLines[j].text;
          const arrowIdx = caseLine.indexOf('=>');
          if (arrowIdx >= 0) {
            const left = caseLine.slice(0, arrowIdx).trim();
            const right = caseLine.slice(arrowIdx + 2).trim();
            cases.push({ matchExpr: left || null, resultExpr: right });
          }
          j++;
        }
        statements.push({
          kind: 'switch_assign',
          varName: decl.varName,
          isVar: decl.isVar,
          switchExpr,
          cases,
        });
        idx = j;
        continue;
      }
    }

    // 13. Expression-returning `x = if cond` OR statement `if cond`
    const ifAssignMatch = /^([^=]+?)\s*=\s*if\s+(.+)$/.exec(line);
    const ifStmtMatch = !ifAssignMatch ? /^if\s+(.+)$/.exec(line) : null;
    if (ifAssignMatch || ifStmtMatch) {
      const targetDecl = ifAssignMatch ? stripDeclarationPrefix(ifAssignMatch[1]) : null;
      const firstCond = (ifAssignMatch ? ifAssignMatch[2] : ifStmtMatch![1]).trim();
      const branches: Array<{ cond: string | null; body: PineStatement[]; resultExpr?: string }> = [];

      const firstBlock = parseBlockStatements(logicalLines, idx + 1, indent + 1, firstCond);
      branches.push({
        cond: firstCond,
        body: firstBlock.stmts,
        resultExpr: firstBlock.lastExpr,
      });
      let j = firstBlock.nextIdx;

      while (j < logicalLines.length && logicalLines[j].indent === indent) {
        const nextLine = logicalLines[j].text;
        const elifMatch = /^else\s+if\s+(.+)$/.exec(nextLine);
        const elseMatch = /^else\b(.*)$/.exec(nextLine);
        if (elifMatch) {
          const cond = elifMatch[1].trim();
          const b = parseBlockStatements(logicalLines, j + 1, indent + 1, cond);
          branches.push({ cond, body: b.stmts, resultExpr: b.lastExpr });
          j = b.nextIdx;
        } else if (elseMatch) {
          const inlineExpr = elseMatch[1].trim();
          if (inlineExpr) {
            branches.push({ cond: null, body: [], resultExpr: inlineExpr });
            j++;
          } else {
            const b = parseBlockStatements(logicalLines, j + 1, indent + 1);
            branches.push({ cond: null, body: b.stmts, resultExpr: b.lastExpr });
            j = b.nextIdx;
          }
          break;
        } else {
          break;
        }
      }

      statements.push({
        kind: 'if_block',
        varName: targetDecl?.varName,
        isVar: targetDecl?.isVar,
        branches,
      });
      idx = j;
      continue;
    }

    // 14. Top-level `while`, `for item in arr`, `for i = start to end [by step]`
    const topWhileMatch = /^while\s+(.+)$/.exec(line);
    if (topWhileMatch) {
      const block = parseBlockStatements(logicalLines, idx + 1, indent + 1);
      statements.push({
        kind: 'while_loop',
        whileCond: topWhileMatch[1].trim(),
        loopBody: block.stmts,
      });
      idx = block.nextIdx;
      continue;
    }

    const topForInMatch = /^for\s+([a-zA-Z_]\w*)\s+in\s+(.+)$/.exec(line);
    if (topForInMatch) {
      const block = parseBlockStatements(logicalLines, idx + 1, indent + 1);
      statements.push({
        kind: 'for_in_loop',
        loopVar: topForInMatch[1],
        iterExpr: topForInMatch[2].trim(),
        loopBody: block.stmts,
      });
      idx = block.nextIdx;
      continue;
    }

    const forMatch = /^for\s+([a-zA-Z_]\w*)\s*=\s*(.+?)\s+to\s+(.+?)(?:\s+by\s+(.+))?$/.exec(line);
    if (forMatch) {
      const block = parseBlockStatements(logicalLines, idx + 1, indent + 1);
      statements.push({
        kind: 'for_loop',
        loopVar: forMatch[1],
        loopStart: forMatch[2].trim(),
        loopEnd: forMatch[3].trim(),
        loopStep: forMatch[4]?.trim() || '1',
        loopBody: block.stmts,
      });
      idx = block.nextIdx;
      continue;
    }

    // 15. Tuple destructuring `[a, b, c] = expr`
    const tupleMatch = /^\[([^\]]+)\]\s*=\s*(.+)$/.exec(line);
    if (tupleMatch) {
      statements.push({
        kind: 'tuple_assign',
        varNames: tupleMatch[1].split(',').map((v) => v.trim()),
        expr: tupleMatch[2].trim(),
      });
      idx++;
      continue;
    }

    // 16. Compound assignment `x += expr`
    const compMatch = /^([a-zA-Z_]\w*)\s*(\+=|-=|\*=|\/=)\s*(.+)$/.exec(line);
    if (compMatch) {
      statements.push({
        kind: 'compound_assign',
        varName: compMatch[1],
        op: compMatch[2] as '+=' | '-=' | '*=' | '/=',
        expr: compMatch[3].trim(),
      });
      idx++;
      continue;
    }

    // 17. Reassignment `x := expr`
    const reassignMatch = /^([a-zA-Z_]\w*)\s*:=\s*(.+)$/.exec(line);
    if (reassignMatch) {
      statements.push({
        kind: 'reassign',
        varName: reassignMatch[1],
        expr: reassignMatch[2].trim(),
      });
      idx++;
      continue;
    }

    // 18. Standard assignment `[var/type] foo = expr`
    const assignMatch = /^([^=]+?)\s*=(?![=>])\s*(.+)$/.exec(line);
    if (assignMatch && !/[<>!]$/.test(assignMatch[1].trim())) {
      const decl = stripDeclarationPrefix(assignMatch[1]);
      if (decl) {
        const rhsTrim = assignMatch[2].trim();
        if (
          (rhsTrim.startsWith('"') && rhsTrim.endsWith('"')) ||
          (rhsTrim.startsWith("'") && rhsTrim.endsWith("'"))
        ) {
          constStrings[decl.varName] = unquote(rhsTrim);
        }
        statements.push({
          kind: 'assign',
          varName: decl.varName,
          isVar: decl.isVar,
          expr: extractInlineInputs(rhsTrim, inputs),
        });
        idx++;
        continue;
      }
    }

    // 19. Bare expression statement (e.g. `arr.push(close)`)
    if (/^[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)?\s*\(/.test(line)) {
      statements.push({ kind: 'assign', varName: '__expr_stmt', expr: line });
    }

    idx++;
  }

  // Backward compat: if no indicator() header specified overlay and script only plots price-level shapes, default overlay=false unless user explicitly set it
  if (!overlaySpecified && plots.length === 0 && shapes.length > 0) {
    isMain = true;
  }

  if (plots.length === 0 && shapes.length === 0 && bgColors.length === 0 && barColors.length === 0) {
    throw new Error(
      'No visual output found. Add at least one plot(...), plotshape(...), bgcolor(...), or barcolor(...) call.'
    );
  }

  return {
    version,
    scriptType,
    title,
    shortTitle,
    isMain,
    inputs,
    statements,
    plots,
    fills,
    shapes,
    hlines,
    bgColors,
    barColors,
    warnings,
  };
}
