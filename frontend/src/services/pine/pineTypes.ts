export type PineVersion = 4 | 5 | 6;

export type PineInputKind = 'int' | 'float' | 'bool' | 'string' | 'source' | 'color';

export type PineParamValue = number | boolean | string;

export interface PineInputDef {
  varName: string;
  title: string;
  type: PineInputKind;
  defaultVal: PineParamValue;
  options?: string[];
  minval?: number;
  maxval?: number;
  step?: number;
  group?: string;
}

export type PinePlotStyle =
  | 'line'
  | 'linebr'
  | 'stepline'
  | 'histogram'
  | 'columns'
  | 'circles'
  | 'cross'
  | 'area';

export interface PinePlotDef {
  handleVar?: string; // e.g. `p1` from `p1 = plot(upper, ...)`
  expr: string;
  key: string;
  title: string;
  colorExpr: string; // Static color OR dynamic per-bar Pine expression
  fallbackColor: string;
  /** @deprecated Legacy compatibility alias for fallbackColor */
  color?: string;
  lineWidth: number;
  style: PinePlotStyle;
  offset: number; // Positive = shift right, Negative = shift left
  hidden: boolean; // True if display=display.none
}

export interface PineFillDef {
  plot1Key: string; // Resolved key (`p0` or `h0`)
  plot2Key: string;
  colorExpr: string;
  fallbackColor: string;
  title?: string;
}

export type PineShapeStyle =
  | 'triangleup'
  | 'triangledown'
  | 'circle'
  | 'diamond'
  | 'cross'
  | 'xcross'
  | 'labelup'
  | 'labeldown'
  | 'char';

export type PineShapeLocation =
  | 'abovebar'
  | 'belowbar'
  | 'top'
  | 'bottom'
  | 'absolute';

export interface PineShapeDef {
  condExpr: string;
  key: string;
  title: string;
  shape: PineShapeStyle;
  location: PineShapeLocation;
  colorExpr: string;
  fallbackColor: string;
  text: string;
  charGlyph?: string;
  size: 'tiny' | 'small' | 'normal' | 'large';
}

export interface PineHlineDef {
  handleVar?: string;
  key: string;
  value: number;
  title: string;
  color: string;
  linestyle: 'solid' | 'dashed' | 'dotted';
}

export interface PineBgColorDef {
  key: string;
  colorExpr: string;
}

export interface PineBarColorDef {
  key: string;
  colorExpr: string;
}

export interface PineStatement {
  kind:
    | 'assign'
    | 'tuple_assign'
    | 'reassign'
    | 'compound_assign'
    | 'prop_assign'
    | 'prop_compound'
    | 'if_block'
    | 'switch_assign'
    | 'for_loop'
    | 'for_in_loop'
    | 'while_loop'
    | 'func_def'
    | 'type_def'
    | 'break'
    | 'continue';
  varName?: string;
  varNames?: string[];
  propTarget?: string; // e.g. `cd.h` or `rs.idx`
  isVar?: boolean; // `var` or `varip` persistent across bars
  op?: '+=' | '-=' | '*=' | '/=';
  expr?: string;
  branches?: Array<{ cond: string | null; body: PineStatement[]; resultExpr?: string }>;
  switchExpr?: string;
  cases?: Array<{ matchExpr: string | null; resultExpr: string }>;
  loopVar?: string;
  loopStart?: string;
  loopEnd?: string;
  loopStep?: string;
  loopBody?: PineStatement[];
  iterExpr?: string;
  whileCond?: string;
  funcParams?: string[];
  funcBody?: string;
  funcStmts?: PineStatement[];
  typeFields?: Array<{ name: string; defaultExpr?: string }>;
}

export interface PineBoxRenderItem {
  left: number;
  right: number;
  top: number;
  bottom: number;
  bgcolor: string | null;
  borderColor: string | null;
  borderWidth: number;
  extend: 'none' | 'left' | 'right' | 'both';
  xloc?: 'bar_index' | 'bar_time';
  text?: string;
  textColor?: string;
  forceOverlay?: boolean;
}

export interface PineLabelRenderItem {
  x: number;
  y: number;
  text: string;
  xloc: 'bar_index' | 'bar_time';
  color: string | null;
  textColor: string;
  style: string;
  forceOverlay?: boolean;
}

export interface ParsedPineScript {
  version: PineVersion;
  scriptType: 'indicator' | 'strategy';
  title: string;
  shortTitle: string;
  isMain: boolean;
  inputs: PineInputDef[];
  statements: PineStatement[];
  plots: PinePlotDef[];
  fills: PineFillDef[];
  shapes: PineShapeDef[];
  hlines: PineHlineDef[];
  bgColors: PineBgColorDef[];
  barColors: PineBarColorDef[];
  warnings: string[];
}

export interface SavedPineIndicator {
  id: string;
  name: string; // Registered KLineCharts indicator name (e.g. PINE_17123456)
  version?: PineVersion;
  title: string;
  shortTitle: string;
  isMain: boolean;
  code: string;
  inputs: PineInputDef[];
  plots: PinePlotDef[];
  hlines: PineHlineDef[];
  warnings?: string[];
  updatedAt: number;
}

export interface PineStarterTemplate {
  id: string;
  label: string;
  version: PineVersion;
  isMain: boolean;
  description: string;
  code: string;
}
