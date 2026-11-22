import React, { useEffect, useRef, useState } from 'react';
import {
  Crosshair,
  Ruler,
  Magnet,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Trash2,
  ChevronRight,
  PenTool,
  Star,
  Heart,
  ZoomIn,
} from 'lucide-react';
import { useChartStore } from '../store/useChartStore';

interface ToolOption {
  id: string;
  label: string;
  shortcut?: string;
  icon: React.ReactNode;
}

interface ToolSection {
  title: string;
  tools: ToolOption[];
}

interface ToolGroup {
  id: string;
  label: string;
  icon: React.ReactNode;
  sections: ToolSection[];
}

const TvIcon: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = 'w-[18px] h-[18px] shrink-0',
}) => (
  <svg
    viewBox="0 0 22 22"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {children}
  </svg>
);

const NodeDot = ({ cx, cy }: { cx: number; cy: number }) => (
  <circle cx={cx} cy={cy} r="2" fill="#1e222d" stroke="currentColor" strokeWidth="1.5" />
);

const TOOL_GROUPS: ToolGroup[] = [
  // 1. LINES / CHANNELS / PITCHFORKS
  {
    id: 'lines',
    label: 'Trend Line Tools',
    icon: (
      <TvIcon className="w-4 h-4">
        <line x1="4" y1="18" x2="18" y2="4" />
        <NodeDot cx={5} cy={17} />
        <NodeDot cx={17} cy={5} />
      </TvIcon>
    ),
    sections: [
      {
        title: 'LINES',
        tools: [
          {
            id: 'segment',
            label: 'Trendline',
            shortcut: 'Alt + T',
            icon: (
              <TvIcon>
                <line x1="4" y1="18" x2="18" y2="4" />
                <NodeDot cx={5} cy={17} />
                <NodeDot cx={17} cy={5} />
              </TvIcon>
            ),
          },
          {
            id: 'rayLine',
            label: 'Ray',
            icon: (
              <TvIcon>
                <line x1="4" y1="18" x2="19" y2="3" />
                <NodeDot cx={5} cy={17} />
                <NodeDot cx={12} cy={10} />
              </TvIcon>
            ),
          },
          {
            id: 'infoLine',
            label: 'Info line',
            icon: (
              <TvIcon>
                <line x1="4" y1="17" x2="18" y2="5" />
                <rect x="8" y="3" width="8" height="4" rx="1" strokeWidth="1.2" />
                <NodeDot cx={5} cy={16} />
                <NodeDot cx={17} cy={6} />
              </TvIcon>
            ),
          },
          {
            id: 'straightLine',
            label: 'Extended line',
            icon: (
              <TvIcon>
                <line x1="2" y1="20" x2="20" y2="2" />
                <NodeDot cx={8} cy={14} />
                <NodeDot cx={14} cy={8} />
              </TvIcon>
            ),
          },
          {
            id: 'trendAngle',
            label: 'Trend angle',
            icon: (
              <TvIcon>
                <line x1="4" y1="17" x2="19" y2="17" strokeDasharray="2 2" />
                <line x1="4" y1="17" x2="17" y2="5" />
                <path d="M11 17 A7 7 0 0 0 9.5 12" />
                <NodeDot cx={5} cy={17} />
              </TvIcon>
            ),
          },
          {
            id: 'horizontalStraightLine',
            label: 'Horizontal line',
            shortcut: 'Alt + H',
            icon: (
              <TvIcon>
                <line x1="2" y1="11" x2="20" y2="11" />
                <NodeDot cx={11} cy={11} />
              </TvIcon>
            ),
          },
          {
            id: 'horizontalRayLine',
            label: 'Horizontal ray',
            shortcut: 'Alt + J',
            icon: (
              <TvIcon>
                <line x1="6" y1="11" x2="20" y2="11" />
                <NodeDot cx={6} cy={11} />
              </TvIcon>
            ),
          },
          {
            id: 'verticalStraightLine',
            label: 'Vertical line',
            shortcut: 'Alt + V',
            icon: (
              <TvIcon>
                <line x1="11" y1="2" x2="11" y2="20" />
                <NodeDot cx={11} cy={11} />
              </TvIcon>
            ),
          },
          {
            id: 'crossLine',
            label: 'Crossline',
            shortcut: 'Alt + C',
            icon: (
              <TvIcon>
                <line x1="2" y1="11" x2="20" y2="11" />
                <line x1="11" y1="2" x2="11" y2="20" />
                <NodeDot cx={11} cy={11} />
              </TvIcon>
            ),
          },
        ],
      },
      {
        title: 'CHANNELS',
        tools: [
          {
            id: 'parallelStraightLine',
            label: 'Parallel channel',
            icon: (
              <TvIcon>
                <line x1="3" y1="14" x2="16" y2="4" />
                <line x1="6" y1="18" x2="19" y2="8" />
                <NodeDot cx={5} cy={12.5} />
                <NodeDot cx={17} cy={9.5} />
              </TvIcon>
            ),
          },
          {
            id: 'regressionTrend',
            label: 'Regression trend',
            icon: (
              <TvIcon>
                <line x1="3" y1="13" x2="18" y2="4" />
                <line x1="4" y1="16" x2="19" y2="7" strokeDasharray="2 2" />
                <line x1="5" y1="19" x2="20" y2="10" />
              </TvIcon>
            ),
          },
          {
            id: 'flatTopBottom',
            label: 'Flat top/bottom',
            icon: (
              <TvIcon>
                <line x1="3" y1="7" x2="19" y2="7" />
                <line x1="3" y1="18" x2="19" y2="12" />
                <NodeDot cx={4} cy={7} />
                <NodeDot cx={18} cy={12.5} />
              </TvIcon>
            ),
          },
          {
            id: 'disjointChannel',
            label: 'Disjoint channel',
            icon: (
              <TvIcon>
                <line x1="3" y1="10" x2="19" y2="5" />
                <line x1="3" y1="14" x2="19" y2="19" />
                <NodeDot cx={4} cy={10} />
                <NodeDot cx={18} cy={18.5} />
              </TvIcon>
            ),
          },
        ],
      },
      {
        title: 'PITCHFORKS',
        tools: [
          {
            id: 'pitchfork',
            label: 'Pitchfork',
            icon: (
              <TvIcon>
                <line x1="4" y1="18" x2="19" y2="3" />
                <line x1="6" y1="10" x2="15" y2="1" />
                <line x1="12" y1="16" x2="21" y2="7" />
                <line x1="6" y1="10" x2="12" y2="16" strokeDasharray="2 2" />
              </TvIcon>
            ),
          },
          {
            id: 'schiffPitchfork',
            label: 'Schiff pitchfork',
            icon: (
              <TvIcon>
                <line x1="4" y1="14" x2="19" y2="4" />
                <line x1="6" y1="9" x2="18" y2="1" />
                <line x1="10" y1="17" x2="20" y2="10" />
                <NodeDot cx={4} cy={14} />
              </TvIcon>
            ),
          },
          {
            id: 'modifiedSchiffPitchfork',
            label: 'Modified Schiff pitchfork',
            icon: (
              <TvIcon>
                <line x1="5" y1="15" x2="19" y2="5" />
                <line x1="5" y1="9" x2="19" y2="2" />
                <line x1="9" y1="19" x2="20" y2="11" />
                <NodeDot cx={9} cy={12} />
              </TvIcon>
            ),
          },
          {
            id: 'insidePitchfork',
            label: 'Inside pitchfork',
            icon: (
              <TvIcon>
                <line x1="8" y1="14" x2="19" y2="3" />
                <line x1="4" y1="10" x2="15" y2="1" />
                <line x1="12" y1="18" x2="21" y2="9" />
                <NodeDot cx={8} cy={14} />
              </TvIcon>
            ),
          },
        ],
      },
    ],
  },

  // 2. FIBONACCI / GANN
  {
    id: 'fib',
    label: 'Gann and Fibonacci Tools',
    icon: (
      <TvIcon className="w-4 h-4">
        <line x1="3" y1="5" x2="19" y2="5" />
        <line x1="3" y1="9" x2="19" y2="9" />
        <line x1="3" y1="13" x2="19" y2="13" />
        <line x1="3" y1="17" x2="19" y2="17" />
        <NodeDot cx={6} cy={5} />
        <NodeDot cx={16} cy={17} />
      </TvIcon>
    ),
    sections: [
      {
        title: 'FIBONACCI',
        tools: [
          {
            id: 'fibonacciLine',
            label: 'Fib retracement',
            shortcut: 'Alt + F',
            icon: (
              <TvIcon>
                <line x1="3" y1="5" x2="19" y2="5" />
                <line x1="3" y1="11" x2="19" y2="11" strokeDasharray="2 2" />
                <line x1="3" y1="17" x2="19" y2="17" />
                <NodeDot cx={5} cy={5} />
                <NodeDot cx={17} cy={17} />
              </TvIcon>
            ),
          },
          {
            id: 'fibExtension',
            label: 'Trend-based fib extension',
            icon: (
              <TvIcon>
                <polyline points="3,17 9,6 14,12" />
                <line x1="12" y1="5" x2="20" y2="5" />
                <line x1="12" y1="11" x2="20" y2="11" />
                <line x1="12" y1="17" x2="20" y2="17" />
              </TvIcon>
            ),
          },
          {
            id: 'fibChannel',
            label: 'Fib channel',
            icon: (
              <TvIcon>
                <line x1="3" y1="13" x2="17" y2="3" />
                <line x1="4" y1="16" x2="18" y2="6" strokeDasharray="2 2" />
                <line x1="5" y1="19" x2="19" y2="9" />
              </TvIcon>
            ),
          },
          {
            id: 'fibTimeZone',
            label: 'Fib time zone',
            icon: (
              <TvIcon>
                <line x1="4" y1="3" x2="4" y2="19" />
                <line x1="7" y1="3" x2="7" y2="19" />
                <line x1="12" y1="3" x2="12" y2="19" />
                <line x1="19" y1="3" x2="19" y2="19" />
              </TvIcon>
            ),
          },
          {
            id: 'fibSpeedResistanceFan',
            label: 'Fib speed resistance fan',
            icon: (
              <TvIcon>
                <line x1="4" y1="18" x2="18" y2="4" />
                <line x1="4" y1="18" x2="19" y2="10" />
                <line x1="4" y1="18" x2="11" y2="3" />
                <NodeDot cx={4} cy={18} />
              </TvIcon>
            ),
          },
          {
            id: 'trendBasedFibTime',
            label: 'Trend-based fib time',
            icon: (
              <TvIcon>
                <polyline points="3,16 8,8 12,13" />
                <line x1="14" y1="3" x2="14" y2="19" />
                <line x1="19" y1="3" x2="19" y2="19" />
              </TvIcon>
            ),
          },
          {
            id: 'fibCircles',
            label: 'Fib circles',
            icon: (
              <TvIcon>
                <circle cx="11" cy="11" r="4" />
                <circle cx="11" cy="11" r="8" />
                <NodeDot cx={11} cy={11} />
              </TvIcon>
            ),
          },
          {
            id: 'fibSpiral',
            label: 'Fib spiral',
            icon: (
              <TvIcon>
                <path d="M11 11 C13 11 13 8 10 8 C6 8 6 15 11 15 C17 15 18 6 11 4" />
              </TvIcon>
            ),
          },
          {
            id: 'fibSpeedResistanceArcs',
            label: 'Fib speed resistance arcs',
            icon: (
              <TvIcon>
                <path d="M4 17 A6 6 0 0 1 16 17" />
                <path d="M2 17 A9 9 0 0 1 20 17" />
                <NodeDot cx={11} cy={17} />
              </TvIcon>
            ),
          },
          {
            id: 'fibWedge',
            label: 'Fib wedge',
            icon: (
              <TvIcon>
                <line x1="4" y1="18" x2="18" y2="5" />
                <line x1="4" y1="18" x2="19" y2="17" />
                <path d="M12 10 A10 10 0 0 1 15 17" />
              </TvIcon>
            ),
          },
          {
            id: 'pitchfan',
            label: 'Pitchfan',
            icon: (
              <TvIcon>
                <line x1="3" y1="18" x2="19" y2="4" />
                <line x1="3" y1="18" x2="14" y2="3" />
                <line x1="3" y1="18" x2="19" y2="11" />
                <NodeDot cx={3} cy={18} />
              </TvIcon>
            ),
          },
        ],
      },
      {
        title: 'GANN',
        tools: [
          {
            id: 'gannBox',
            label: 'Gann box',
            icon: (
              <TvIcon>
                <rect x="4" y="4" width="14" height="14" />
                <line x1="4" y1="11" x2="18" y2="11" />
                <line x1="11" y1="4" x2="11" y2="18" />
              </TvIcon>
            ),
          },
          {
            id: 'gannSquareFixed',
            label: 'Gann square fixed',
            icon: (
              <TvIcon>
                <rect x="4" y="4" width="14" height="14" />
                <line x1="4" y1="4" x2="18" y2="18" />
                <line x1="18" y1="4" x2="4" y2="18" />
                <circle cx="11" cy="11" r="4" />
              </TvIcon>
            ),
          },
          {
            id: 'gannSquare',
            label: 'Gann square',
            icon: (
              <TvIcon>
                <rect x="3" y="3" width="16" height="16" />
                <line x1="3" y1="3" x2="19" y2="19" />
                <line x1="19" y1="3" x2="3" y2="19" />
                <line x1="11" y1="3" x2="11" y2="19" />
                <line x1="3" y1="11" x2="19" y2="11" />
              </TvIcon>
            ),
          },
          {
            id: 'gannFan',
            label: 'Gann fan',
            icon: (
              <TvIcon>
                <line x1="3" y1="19" x2="19" y2="3" />
                <line x1="3" y1="19" x2="11" y2="3" />
                <line x1="3" y1="19" x2="19" y2="11" />
                <line x1="3" y1="19" x2="19" y2="16" />
              </TvIcon>
            ),
          },
        ],
      },
    ],
  },

  // 3. CHART PATTERNS / ELLIOTT WAVES / CYCLES
  {
    id: 'patterns',
    label: 'Patterns & Elliott Waves',
    icon: (
      <TvIcon className="w-4 h-4">
        <polyline points="3,16 7,6 11,13 15,5 19,15" />
        <NodeDot cx={7} cy={6} />
        <NodeDot cx={15} cy={5} />
      </TvIcon>
    ),
    sections: [
      {
        title: 'CHART PATTERNS',
        tools: [
          {
            id: 'xabcdPattern',
            label: 'XABCD pattern',
            icon: (
              <TvIcon>
                <polyline points="2,16 6,6 10,13 15,5 20,15" />
                <line x1="2" y1="16" x2="10" y2="13" strokeDasharray="2 2" />
                <line x1="10" y1="13" x2="20" y2="15" strokeDasharray="2 2" />
              </TvIcon>
            ),
          },
          {
            id: 'cypherPattern',
            label: 'Cypher pattern',
            icon: (
              <TvIcon>
                <polyline points="2,15 6,8 10,13 15,4 20,14" />
                <line x1="6" y1="8" x2="15" y2="4" strokeDasharray="2 2" />
              </TvIcon>
            ),
          },
          {
            id: 'headAndShoulders',
            label: 'Head and shoulders',
            icon: (
              <TvIcon>
                <polyline points="2,16 5,10 8,15 11,5 14,15 17,10 20,16" />
                <line x1="4" y1="15" x2="18" y2="15" strokeDasharray="2 2" />
              </TvIcon>
            ),
          },
          {
            id: 'abcdPattern',
            label: 'ABCD pattern',
            icon: (
              <TvIcon>
                <polyline points="3,16 8,7 13,13 19,5" />
                <NodeDot cx={8} cy={7} />
                <NodeDot cx={13} cy={13} />
              </TvIcon>
            ),
          },
          {
            id: 'trianglePattern',
            label: 'Triangle pattern',
            icon: (
              <TvIcon>
                <polygon points="4,6 18,11 4,17" />
              </TvIcon>
            ),
          },
          {
            id: 'threeDrivesPattern',
            label: 'Three drives pattern',
            icon: (
              <TvIcon>
                <polyline points="2,17 5,11 8,14 11,7 14,11 18,4" />
              </TvIcon>
            ),
          },
        ],
      },
      {
        title: 'ELLIOTT WAVES',
        tools: [
          {
            id: 'elliottImpulse',
            label: 'Elliott impulse wave (12345)',
            icon: (
              <TvIcon>
                <polyline points="2,17 6,10 9,14 14,5 16,11 20,3" />
              </TvIcon>
            ),
          },
          {
            id: 'elliottCorrection',
            label: 'Elliott correction wave (ABC)',
            icon: (
              <TvIcon>
                <polyline points="3,6 9,15 14,9 19,18" />
              </TvIcon>
            ),
          },
          {
            id: 'elliottTriangle',
            label: 'Elliott triangle wave (ABCDE)',
            icon: (
              <TvIcon>
                <polyline points="3,17 7,5 11,15 15,8 19,13" />
              </TvIcon>
            ),
          },
          {
            id: 'elliottDoubleCombo',
            label: 'Elliott double combo wave (WXY)',
            icon: (
              <TvIcon>
                <polyline points="3,7 8,16 13,9 19,17" />
              </TvIcon>
            ),
          },
          {
            id: 'elliottTripleCombo',
            label: 'Elliott triple combo wave (WXYXZ)',
            icon: (
              <TvIcon>
                <polyline points="2,7 6,15 9,9 13,16 16,10 20,17" />
              </TvIcon>
            ),
          },
        ],
      },
      {
        title: 'CYCLES',
        tools: [
          {
            id: 'cyclicLines',
            label: 'Cyclic lines',
            icon: (
              <TvIcon>
                <line x1="4" y1="3" x2="4" y2="19" />
                <line x1="11" y1="3" x2="11" y2="19" />
                <line x1="18" y1="3" x2="18" y2="19" />
              </TvIcon>
            ),
          },
          {
            id: 'timeCycles',
            label: 'Time cycles',
            icon: (
              <TvIcon>
                <path d="M2 16 A4.5 6 0 0 1 11 16 A4.5 6 0 0 1 20 16" />
              </TvIcon>
            ),
          },
          {
            id: 'sineLine',
            label: 'Sine line',
            icon: (
              <TvIcon>
                <path d="M2 11 Q6 3 11 11 T20 11" />
              </TvIcon>
            ),
          },
        ],
      },
    ],
  },

  // 4. FORECASTING / VOLUME-BASED / MEASURERS
  {
    id: 'forecast',
    label: 'Forecasting & Measurement',
    icon: (
      <TvIcon className="w-4 h-4">
        <rect x="4" y="4" width="14" height="7" stroke="#089981" />
        <rect x="4" y="11" width="14" height="7" stroke="#f23645" />
        <line x1="3" y1="11" x2="19" y2="11" />
      </TvIcon>
    ),
    sections: [
      {
        title: 'FORECASTING',
        tools: [
          {
            id: 'riskRewardLong',
            label: 'Long position',
            icon: (
              <TvIcon className="w-[18px] h-[18px] shrink-0 text-[#089981]">
                <rect x="4" y="4" width="14" height="8" strokeWidth="1.3" />
                <rect x="4" y="12" width="14" height="6" stroke="#f23645" strokeWidth="1.3" />
                <line x1="3" y1="12" x2="19" y2="12" stroke="#d1d4dc" />
              </TvIcon>
            ),
          },
          {
            id: 'riskRewardShort',
            label: 'Short position',
            icon: (
              <TvIcon className="w-[18px] h-[18px] shrink-0 text-[#f23645]">
                <rect x="4" y="4" width="14" height="6" strokeWidth="1.3" />
                <rect x="4" y="10" width="14" height="8" stroke="#089981" strokeWidth="1.3" />
                <line x1="3" y1="10" x2="19" y2="10" stroke="#d1d4dc" />
              </TvIcon>
            ),
          },
          {
            id: 'forecastLine',
            label: 'Position forecast',
            icon: (
              <TvIcon>
                <line x1="4" y1="17" x2="17" y2="5" strokeDasharray="3 2" />
                <circle cx="17" cy="5" r="2.5" />
                <NodeDot cx={4} cy={17} />
              </TvIcon>
            ),
          },
          {
            id: 'barsPattern',
            label: 'Bars pattern',
            icon: (
              <TvIcon>
                <line x1="6" y1="15" x2="6" y2="9" />
                <line x1="11" y1="13" x2="11" y2="6" />
                <line x1="16" y1="16" x2="16" y2="8" />
                <polyline points="4,17 9,11 14,13 19,6" strokeWidth="1.2" />
              </TvIcon>
            ),
          },
          {
            id: 'ghostFeed',
            label: 'Ghost feed',
            icon: (
              <TvIcon>
                <rect x="4" y="11" width="3" height="5" strokeDasharray="2 1" />
                <rect x="10" y="8" width="3" height="6" strokeDasharray="2 1" />
                <rect x="16" y="5" width="3" height="5" strokeDasharray="2 1" />
              </TvIcon>
            ),
          },
          {
            id: 'sectorTool',
            label: 'Sector',
            icon: (
              <TvIcon>
                <path d="M5 17 L5 5 A12 12 0 0 1 17 17 Z" />
              </TvIcon>
            ),
          },
        ],
      },
      {
        title: 'VOLUME-BASED',
        tools: [
          {
            id: 'anchoredVwap',
            label: 'Anchored VWAP',
            icon: (
              <TvIcon>
                <path d="M4 16 Q10 14 13 10 T20 5" />
                <NodeDot cx={4} cy={16} />
              </TvIcon>
            ),
          },
          {
            id: 'fixedRangeVolumeProfile',
            label: 'Fixed range volume profile',
            icon: (
              <TvIcon>
                <line x1="4" y1="3" x2="4" y2="19" />
                <line x1="4" y1="6" x2="11" y2="6" strokeWidth="2" />
                <line x1="4" y1="10" x2="18" y2="10" strokeWidth="2" stroke="#f23645" />
                <line x1="4" y1="14" x2="14" y2="14" strokeWidth="2" />
                <line x1="4" y1="18" x2="9" y2="18" strokeWidth="2" />
              </TvIcon>
            ),
          },
          {
            id: 'anchoredVolumeProfile',
            label: 'Anchored volume profile',
            icon: (
              <TvIcon>
                <line x1="5" y1="4" x2="5" y2="18" strokeDasharray="2 2" />
                <line x1="5" y1="7" x2="14" y2="7" strokeWidth="2" />
                <line x1="5" y1="11" x2="19" y2="11" strokeWidth="2" stroke="#2962ff" />
                <line x1="5" y1="15" x2="12" y2="15" strokeWidth="2" />
                <NodeDot cx={5} cy={18} />
              </TvIcon>
            ),
          },
        ],
      },
      {
        title: 'MEASURERS',
        tools: [
          {
            id: 'priceRange',
            label: 'Price range',
            icon: (
              <TvIcon>
                <line x1="4" y1="5" x2="18" y2="5" />
                <line x1="4" y1="17" x2="18" y2="17" />
                <line x1="11" y1="5" x2="11" y2="17" />
                <polyline points="8,8 11,5 14,8" />
                <polyline points="8,14 11,17 14,14" />
              </TvIcon>
            ),
          },
          {
            id: 'dateRange',
            label: 'Date range',
            icon: (
              <TvIcon>
                <line x1="5" y1="4" x2="5" y2="18" />
                <line x1="17" y1="4" x2="17" y2="18" />
                <line x1="5" y1="11" x2="17" y2="11" />
                <polyline points="8,8 5,11 8,14" />
                <polyline points="14,8 17,11 14,14" />
              </TvIcon>
            ),
          },
          {
            id: 'rulerMeasure',
            label: 'Date and price range',
            icon: (
              <TvIcon>
                <rect x="4" y="4" width="14" height="14" strokeDasharray="2 2" />
                <line x1="11" y1="5" x2="11" y2="17" />
                <line x1="5" y1="11" x2="17" y2="11" />
              </TvIcon>
            ),
          },
        ],
      },
    ],
  },

  // 5. BRUSHES / ARROWS / SHAPES
  {
    id: 'brushes',
    label: 'Brushes, Arrows & Shapes',
    icon: (
      <TvIcon className="w-4 h-4">
        <path d="M16 3 L19 6 L9 16 L5 17 L6 13 Z" />
        <path d="M4 18 C5 19 8 19 9 17" />
      </TvIcon>
    ),
    sections: [
      {
        title: 'BRUSHES',
        tools: [
          {
            id: 'brushTool',
            label: 'Brush',
            icon: (
              <TvIcon>
                <path d="M16 3 L19 6 L9 16 L5 17 L6 13 Z" />
              </TvIcon>
            ),
          },
          {
            id: 'highlighterTool',
            label: 'Highlighter',
            icon: (
              <TvIcon>
                <path d="M14 4 L18 8 L9 17 L5 17 L5 13 Z" />
                <line x1="4" y1="19" x2="18" y2="19" strokeWidth="2.2" />
              </TvIcon>
            ),
          },
        ],
      },
      {
        title: 'ARROWS',
        tools: [
          {
            id: 'arrowMarker',
            label: 'Arrow marker',
            icon: (
              <TvIcon>
                <polygon points="4,16 12,8 9,5 18,4 17,13 14,10 6,18" />
              </TvIcon>
            ),
          },
          {
            id: 'arrowLine',
            label: 'Arrow',
            icon: (
              <TvIcon>
                <line x1="4" y1="18" x2="17" y2="5" />
                <polyline points="11,5 17,5 17,11" />
              </TvIcon>
            ),
          },
          {
            id: 'arrowMarkUp',
            label: 'Arrow mark up',
            icon: (
              <TvIcon className="w-[18px] h-[18px] shrink-0 text-[#089981]">
                <line x1="11" y1="18" x2="11" y2="5" />
                <polyline points="6,10 11,5 16,10" />
              </TvIcon>
            ),
          },
          {
            id: 'arrowMarkDown',
            label: 'Arrow mark down',
            icon: (
              <TvIcon className="w-[18px] h-[18px] shrink-0 text-[#f23645]">
                <line x1="11" y1="4" x2="11" y2="17" />
                <polyline points="6,12 11,17 16,12" />
              </TvIcon>
            ),
          },
        ],
      },
      {
        title: 'SHAPES',
        tools: [
          {
            id: 'rectBox',
            label: 'Rectangle',
            shortcut: 'Alt + Shift + R',
            icon: (
              <TvIcon>
                <rect x="4" y="6" width="14" height="10" rx="1" />
                <NodeDot cx={4} cy={6} />
                <NodeDot cx={18} cy={16} />
              </TvIcon>
            ),
          },
          {
            id: 'rotatedRectangle',
            label: 'Rotated rectangle',
            icon: (
              <TvIcon>
                <polygon points="4,12 11,4 18,10 11,18" />
              </TvIcon>
            ),
          },
          {
            id: 'pathTool',
            label: 'Path',
            icon: (
              <TvIcon>
                <polyline points="3,16 8,8 13,13 18,5" />
                <polyline points="14,5 18,5 18,9" />
              </TvIcon>
            ),
          },
          {
            id: 'circleShape',
            label: 'Circle',
            icon: (
              <TvIcon>
                <circle cx="11" cy="11" r="7" />
              </TvIcon>
            ),
          },
          {
            id: 'ellipseShape',
            label: 'Ellipse',
            icon: (
              <TvIcon>
                <ellipse cx="11" cy="11" rx="8" ry="5" />
              </TvIcon>
            ),
          },
          {
            id: 'polylineShape',
            label: 'Polyline',
            icon: (
              <TvIcon>
                <polygon points="4,16 7,6 15,5 19,14 11,18" />
              </TvIcon>
            ),
          },
          {
            id: 'triangleShape',
            label: 'Triangle',
            icon: (
              <TvIcon>
                <polygon points="11,4 19,17 3,17" />
              </TvIcon>
            ),
          },
          {
            id: 'arcShape',
            label: 'Arc',
            icon: (
              <TvIcon>
                <path d="M4 16 Q11 4 18 16" />
                <line x1="4" y1="16" x2="18" y2="16" strokeDasharray="2 2" />
              </TvIcon>
            ),
          },
          {
            id: 'curveShape',
            label: 'Curve',
            icon: (
              <TvIcon>
                <path d="M3 16 Q11 3 19 16" />
              </TvIcon>
            ),
          },
          {
            id: 'doubleCurveShape',
            label: 'Double curve',
            icon: (
              <TvIcon>
                <path d="M3 16 C7 4 15 18 19 6" />
              </TvIcon>
            ),
          },
        ],
      },
    ],
  },

  // 6. TEXT AND NOTES / CONTENT
  {
    id: 'text',
    label: 'Text, Notes & Content',
    icon: (
      <TvIcon className="w-4 h-4">
        <line x1="5" y1="5" x2="17" y2="5" />
        <line x1="11" y1="5" x2="11" y2="18" />
        <line x1="8" y1="18" x2="14" y2="18" />
      </TvIcon>
    ),
    sections: [
      {
        title: 'TEXT AND NOTES',
        tools: [
          {
            id: 'textNote',
            label: 'Text',
            icon: (
              <TvIcon>
                <line x1="5" y1="5" x2="17" y2="5" />
                <line x1="11" y1="5" x2="11" y2="18" />
              </TvIcon>
            ),
          },
          {
            id: 'anchoredNote',
            label: 'Note',
            icon: (
              <TvIcon>
                <rect x="4" y="3" width="14" height="12" rx="2" />
                <line x1="7" y1="7" x2="15" y2="7" />
                <line x1="7" y1="11" x2="12" y2="11" />
                <NodeDot cx={11} cy={18} />
              </TvIcon>
            ),
          },
          {
            id: 'priceNote',
            label: 'Price note',
            icon: (
              <TvIcon>
                <line x1="4" y1="17" x2="10" y2="10" />
                <rect x="10" y="5" width="9" height="8" rx="1.5" />
                <NodeDot cx={4} cy={17} />
              </TvIcon>
            ),
          },
          {
            id: 'pinMarker',
            label: 'Pin',
            icon: (
              <TvIcon>
                <circle cx="11" cy="8" r="4" />
                <line x1="11" y1="12" x2="11" y2="19" />
              </TvIcon>
            ),
          },
          {
            id: 'chartTable',
            label: 'Table',
            icon: (
              <TvIcon>
                <rect x="3" y="4" width="16" height="14" rx="1" />
                <line x1="3" y1="9" x2="19" y2="9" />
                <line x1="3" y1="14" x2="19" y2="14" />
                <line x1="11" y1="4" x2="11" y2="18" />
              </TvIcon>
            ),
          },
          {
            id: 'simpleAnnotation',
            label: 'Callout',
            icon: (
              <TvIcon>
                <rect x="4" y="4" width="14" height="10" rx="2" />
                <polyline points="8,14 5,19 12,14" />
              </TvIcon>
            ),
          },
          {
            id: 'commentBubble',
            label: 'Comment',
            icon: (
              <TvIcon>
                <path d="M4 11 A7 6 0 1 1 11 17 L5 19 L6 15 A7 6 0 0 1 4 11 Z" />
              </TvIcon>
            ),
          },
          {
            id: 'simpleTag',
            label: 'Price label',
            icon: (
              <TvIcon>
                <path d="M4 11 L8 6 H19 V16 H8 Z" />
                <circle cx="9.5" cy="11" r="1" fill="currentColor" />
              </TvIcon>
            ),
          },
          {
            id: 'signpostMarker',
            label: 'Signpost',
            icon: (
              <TvIcon>
                <line x1="11" y1="10" x2="11" y2="19" />
                <rect x="5" y="4" width="12" height="6" rx="3" />
              </TvIcon>
            ),
          },
          {
            id: 'flagMarker',
            label: 'Flag mark',
            icon: (
              <TvIcon>
                <line x1="6" y1="4" x2="6" y2="19" />
                <polygon points="6,4 17,8 6,12" />
              </TvIcon>
            ),
          },
        ],
      },
      {
        title: 'CONTENT',
        tools: [
          {
            id: 'chartImage',
            label: 'Image',
            icon: (
              <TvIcon>
                <rect x="3" y="4" width="16" height="14" rx="2" />
                <circle cx="8" cy="9" r="1.5" />
                <polyline points="4,16 9,11 13,15 16,12 19,15" />
              </TvIcon>
            ),
          },
          {
            id: 'socialPostTag',
            label: 'Post',
            icon: (
              <TvIcon>
                <rect x="3" y="4" width="16" height="14" rx="2" />
                <line x1="7" y1="9" x2="15" y2="9" />
                <line x1="7" y1="13" x2="13" y2="13" />
              </TvIcon>
            ),
          },
          {
            id: 'tradingIdeaTag',
            label: 'Idea',
            icon: (
              <TvIcon>
                <path d="M8 14 A4.5 4.5 0 1 1 14 14 L13 17 H9 Z" />
                <line x1="9" y1="19" x2="13" y2="19" />
              </TvIcon>
            ),
          },
        ],
      },
    ],
  },
];

// Flyout 7: Icons / Emojis / Stickers Picker Data
const LS_RECENT_ICONS_KEY = 'tv_recent_icons_v1';
const DEFAULT_RECENT_ICONS = ['⭕', '⬆', '☺'];

const ICON_CATEGORIES: Array<{ id: string; title: string; tabIcon: string; glyphs: string[] }> = [
  {
    id: 'gestures',
    title: 'GESTURES & SMILEYS',
    tabIcon: '☺',
    glyphs: ['👍', '👎', '🫱', '🫲', '☞', '☜', '👤', '☝', '👇', '☺', '😐', '☹', '🧍'],
  },
  {
    id: 'symbols',
    title: 'SYMBOLS & FLAGS',
    tabIcon: '⚑',
    glyphs: [
      '⚑', '🏁', '🚩', '♥', '★', '☆', '☑', '✔', '✖', '⏻', '📶', '🔁', '⟳', '◉', '📍',
      '✅', '➕', '➖', '❎', '❓', 'ℹ', '⌖', '⊗', '⊘', '✚', '━', '✳', '❗', '⚠', '👁',
      '💬', '❤', '☀', '💭', '◌', '●', '➤', '⭕', '?', '!', '◎', '🐱', '🐧', '🍎',
    ],
  },
  {
    id: 'nature',
    title: 'NATURE',
    tabIcon: '☾',
    glyphs: ['🍃', '⚙', '☾', '🪲', '⚡', '🔥', '💧', '❄', '🌟'],
  },
  {
    id: 'currency',
    title: 'CURRENCY',
    tabIcon: '₩',
    glyphs: ['€', '£', '$', '₹', '¥', '₽', '₩', '₺', '₿', 'Ξ', '🪙'],
  },
];

const EMOJI_GLYPHS = [
  '🚀', '📈', '📉', '💰', '💎', '🐂', '🐻', '🎯', '🔥', '⚡', '✅', '❌', '⚠', '💡', '🔔', '🏆',
  '👀', '🧠', '💪', '🙏', '😎', '😱', '🤯', '🤑', '🐳', '🦈', '🦅', '⏳', '⏰', '📌', '🎉', '🛑',
];

const STICKER_GLYPHS = [
  'BUY', 'SELL', 'TP', 'SL', 'BOS', 'CHoCH', 'FVG', 'OB', 'LIQ', 'EQH', 'EQL', 'POI',
];

function loadRecentIcons(): string[] {
  try {
    const raw = localStorage.getItem(LS_RECENT_ICONS_KEY);
    if (!raw) return DEFAULT_RECENT_ICONS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_RECENT_ICONS;
  } catch {
    return DEFAULT_RECENT_ICONS;
  }
}

export const LeftDrawingBar: React.FC = () => {
  const {
    activeTool,
    setActiveTool,
    activeIconGlyph,
    setActiveIconGlyph,
    keepDrawingMode,
    toggleKeepDrawingMode,
    magnetMode,
    ctrlMagnetPressed,
    cycleMagnetMode,
    drawingsLocked,
    toggleDrawingsLocked,
    drawingsVisible,
    toggleDrawingsVisible,
    favoriteTools,
    toggleFavoriteTool,
    floatingFavVisible,
    toggleFloatingFavVisible,
    bridge,
  } = useChartStore();

  const asideRef = useRef<HTMLElement>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [iconTab, setIconTab] = useState<'emojis' | 'stickers' | 'icons'>('icons');
  const [recentIcons, setRecentIcons] = useState<string[]>(() => loadRecentIcons());
  const [groupDefaults, setGroupDefaults] = useState<Record<string, string>>({
    lines: 'segment',
    fib: 'fibonacciLine',
    patterns: 'xabcdPattern',
    forecast: 'riskRewardLong',
    brushes: 'brushTool',
    text: 'textNote',
  });

  useEffect(() => {
    if (!openGroup) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (asideRef.current && !asideRef.current.contains(e.target as Node)) {
        setOpenGroup(null);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [openGroup]);

  const handleSelectTool = (groupId: string, toolId: string) => {
    setGroupDefaults((prev) => ({ ...prev, [groupId]: toolId }));
    setActiveTool(toolId);
    setOpenGroup(null);
  };

  const handleSelectGlyph = (glyph: string) => {
    setActiveIconGlyph(glyph);
    setRecentIcons((prev) => {
      const next = [glyph, ...prev.filter((g) => g !== glyph)].slice(0, 9);
      try {
        localStorage.setItem(LS_RECENT_ICONS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
    setActiveTool('iconStamp');
    setOpenGroup(null);
  };

  const effectiveMagnet = ctrlMagnetPressed ? 'strong_magnet' : magnetMode;
  const magnetActive = effectiveMagnet !== 'normal';

  return (
    <aside
      ref={asideRef}
      className="w-[44px] bg-[#1e222d] border-r border-[#2a2e39] flex flex-col items-center py-1.5 gap-0.5 shrink-0 z-20 relative"
    >
      {/* 1. Cursor / Crosshair */}
      <button
        onClick={() => {
          setActiveTool(null);
          setOpenGroup(null);
        }}
        title="Crosshair / Pointer (Esc)"
        className={`w-[34px] h-[32px] rounded flex items-center justify-center transition-colors cursor-pointer ${
          activeTool === null
            ? 'text-[#2962ff] bg-[#2962ff]/15'
            : 'text-[#d1d4dc] hover:bg-[#2a2e39]'
        }`}
      >
        <Crosshair className="w-4 h-4" />
      </button>

      {/* 2-7. Categorized Drawing Tool Groups (Flyouts 1..6) */}
      {TOOL_GROUPS.map((group) => {
        const allTools = group.sections.flatMap((s) => s.tools);
        const defaultToolId = groupDefaults[group.id] || allTools[0]?.id;
        const defaultToolObj = allTools.find((t) => t.id === defaultToolId) || allTools[0];
        const isGroupActive = allTools.some((t) => t.id === activeTool);

        return (
          <div key={group.id} className="relative">
            <div className="flex items-center">
              <button
                onClick={() => {
                  setActiveTool(defaultToolId);
                  setOpenGroup(null);
                }}
                title={defaultToolObj?.label || group.label}
                className={`w-[34px] h-[32px] rounded flex items-center justify-center transition-colors relative cursor-pointer ${
                  isGroupActive
                    ? 'text-[#2962ff] bg-[#2962ff]/15'
                    : 'text-[#d1d4dc] hover:bg-[#2a2e39]'
                }`}
              >
                {defaultToolObj?.icon || group.icon}
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenGroup((cur) => (cur === group.id ? null : group.id));
                }}
                title={`All ${group.label}`}
                className="absolute -right-1 top-1/2 -translate-y-1/2 w-3 h-5 flex items-center justify-center text-[#787b86] hover:text-[#d1d4dc] opacity-60 hover:opacity-100 cursor-pointer"
              >
                <ChevronRight className="w-2.5 h-2.5" />
              </button>
            </div>

            {openGroup === group.id && (
              <div className="absolute left-[44px] top-0 w-[274px] max-h-[82vh] overflow-y-auto bg-[#1e222d]/95 backdrop-blur-md border border-[#2a2e39] rounded-md shadow-tv py-1.5 z-50 select-none">
                {group.sections.map((section, secIdx) => (
                  <div key={section.title}>
                    {secIdx > 0 && <div className="my-1.5 border-t border-[#2a2e39]" />}
                    <div className="px-3.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#787b86]">
                      {section.title}
                    </div>
                    {section.tools.map((t) => {
                      const isFav = favoriteTools.includes(t.id);
                      const isCurrent = activeTool === t.id;
                      return (
                        <div
                          key={t.id}
                          onClick={() => handleSelectTool(group.id, t.id)}
                          className={`group w-full px-3 py-1.5 flex items-center gap-2.5 cursor-pointer hover:bg-[#2a2e39] ${
                            isCurrent
                              ? 'text-[#2962ff] font-medium bg-[#2962ff]/10'
                              : 'text-[#d1d4dc]'
                          }`}
                        >
                          <span className="text-current">{t.icon}</span>
                          <span className="flex-1 text-[12.5px] truncate">{t.label}</span>
                          {t.shortcut && (
                            <span className="text-[11px] text-[#787b86] font-mono-num mr-1">
                              {t.shortcut}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavoriteTool(t.id);
                            }}
                            title={isFav ? 'Remove from Favorites' : 'Add to Favorites'}
                            className={`p-0.5 rounded transition-opacity cursor-pointer ${
                              isFav
                                ? 'text-[#f59e0b] opacity-100'
                                : 'text-[#787b86] opacity-0 group-hover:opacity-100 hover:text-[#f59e0b]'
                            }`}
                          >
                            <Star className={`w-3.5 h-3.5 ${isFav ? 'fill-[#f59e0b]' : ''}`} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* 8. Group 7: Icons / Emojis / Stickers Picker (Heart Icon) */}
      <div className="relative">
        <div className="flex items-center">
          <button
            onClick={() => setOpenGroup((cur) => (cur === 'icons' ? null : 'icons'))}
            title={`Icons / Emojis / Stickers (${activeIconGlyph})`}
            className={`w-[34px] h-[32px] rounded flex items-center justify-center transition-colors cursor-pointer ${
              activeTool === 'iconStamp' || openGroup === 'icons'
                ? 'text-[#2962ff] bg-[#2962ff]/15'
                : 'text-[#d1d4dc] hover:bg-[#2a2e39]'
            }`}
          >
            <Heart className="w-4 h-4" />
          </button>
        </div>

        {openGroup === 'icons' && (
          <div className="absolute left-[44px] top-0 w-[280px] bg-[#1e222d]/95 backdrop-blur-md border border-[#2a2e39] rounded-md shadow-tv z-50 select-none overflow-hidden flex flex-col">
            {/* Top Category Jump Row */}
            {iconTab === 'icons' && (
              <div className="px-2.5 py-1.5 border-b border-[#2a2e39] flex items-center justify-between text-[12px] text-[#787b86]">
                <span className="text-[11px] font-semibold text-[#d1d4dc]">Icons</span>
                <div className="flex items-center gap-2">
                  {ICON_CATEGORIES.map((cat) => (
                    <span key={cat.id} title={cat.title} className="hover:text-white cursor-default">
                      {cat.tabIcon}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Scrollable Grid Body */}
            <div className="max-h-[300px] overflow-y-auto p-2.5 space-y-3">
              {iconTab === 'icons' && (
                <>
                  <div>
                    <div className="text-[9.5px] font-semibold uppercase tracking-wider text-[#787b86] mb-1">
                      RECENTLY USED
                    </div>
                    <div className="grid grid-cols-9 gap-0.5">
                      {recentIcons.map((g, idx) => (
                        <button
                          key={`rec_${idx}_${g}`}
                          onClick={() => handleSelectGlyph(g)}
                          className={`w-[26px] h-[26px] rounded flex items-center justify-center text-[14px] hover:bg-[#2a2e39] cursor-pointer ${
                            activeIconGlyph === g ? 'bg-[#2962ff]/25 ring-1 ring-[#2962ff]' : ''
                          }`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                  {ICON_CATEGORIES.map((cat) => (
                    <div key={cat.id}>
                      <div className="text-[9.5px] font-semibold uppercase tracking-wider text-[#787b86] mb-1">
                        {cat.title}
                      </div>
                      <div className="grid grid-cols-9 gap-0.5">
                        {cat.glyphs.map((g, idx) => (
                          <button
                            key={`${cat.id}_${idx}`}
                            onClick={() => handleSelectGlyph(g)}
                            className={`w-[26px] h-[26px] rounded flex items-center justify-center text-[14px] hover:bg-[#2a2e39] cursor-pointer ${
                              activeIconGlyph === g ? 'bg-[#2962ff]/25 ring-1 ring-[#2962ff]' : ''
                            }`}
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              )}

              {iconTab === 'emojis' && (
                <div>
                  <div className="text-[9.5px] font-semibold uppercase tracking-wider text-[#787b86] mb-1.5">
                    TRADING EMOJIS
                  </div>
                  <div className="grid grid-cols-8 gap-1">
                    {EMOJI_GLYPHS.map((g, idx) => (
                      <button
                        key={`em_${idx}`}
                        onClick={() => handleSelectGlyph(g)}
                        className="w-[28px] h-[28px] rounded flex items-center justify-center text-[15px] hover:bg-[#2a2e39] cursor-pointer"
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {iconTab === 'stickers' && (
                <div>
                  <div className="text-[9.5px] font-semibold uppercase tracking-wider text-[#787b86] mb-1.5">
                    SMC / ICT STICKERS
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {STICKER_GLYPHS.map((s) => (
                      <button
                        key={s}
                        onClick={() => handleSelectGlyph(s)}
                        className="px-2 py-1.5 rounded bg-[#131722] hover:bg-[#2962ff]/25 border border-[#2a2e39] text-[11.5px] font-bold text-[#d1d4dc] cursor-pointer"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Tab Switcher: Emojis | Stickers | Icons */}
            <div className="grid grid-cols-3 border-t border-[#2a2e39] bg-[#131722]/70 text-[11px]">
              {(['emojis', 'stickers', 'icons'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setIconTab(t)}
                  className={`py-1.5 capitalize font-medium cursor-pointer transition-colors ${
                    iconTab === t
                      ? 'text-[#2962ff] border-t-2 border-[#2962ff] bg-[#1e222d]'
                      : 'text-[#787b86] hover:text-[#d1d4dc]'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="w-6 h-[1px] bg-[#2a2e39] my-0.5" />

      {/* 9. Quick Date Range */}
      <button
        onClick={() => {
          setActiveTool('dateRange');
          setOpenGroup(null);
        }}
        title="Date Range"
        className={`w-[34px] h-[32px] rounded flex items-center justify-center transition-colors cursor-pointer ${
          activeTool === 'dateRange'
            ? 'text-[#2962ff] bg-[#2962ff]/15'
            : 'text-[#d1d4dc] hover:bg-[#2a2e39]'
        }`}
      >
        <TvIcon className="w-4 h-4">
          <line x1="5" y1="4" x2="5" y2="18" />
          <line x1="17" y1="4" x2="17" y2="18" />
          <line x1="5" y1="11" x2="17" y2="11" />
          <polyline points="8,8 5,11 8,14" />
          <polyline points="14,8 17,11 14,14" />
        </TvIcon>
      </button>

      {/* 10. Measure / Ruler */}
      <button
        onClick={() => {
          setActiveTool('rulerMeasure');
          setOpenGroup(null);
        }}
        title="Measure / Ruler (Date & Price Range)"
        className={`w-[34px] h-[32px] rounded flex items-center justify-center transition-colors cursor-pointer ${
          activeTool === 'rulerMeasure'
            ? 'text-[#2962ff] bg-[#2962ff]/15'
            : 'text-[#d1d4dc] hover:bg-[#2a2e39]'
        }`}
      >
        <Ruler className="w-4 h-4" />
      </button>

      {/* 11. Zoom In */}
      <button
        onClick={() => {
          setOpenGroup(null);
          bridge.zoomInChart?.();
        }}
        title="Zoom In"
        className="w-[34px] h-[32px] rounded flex items-center justify-center text-[#d1d4dc] hover:bg-[#2a2e39] transition-colors cursor-pointer"
      >
        <ZoomIn className="w-4 h-4" />
      </button>

      <div className="w-6 h-[1px] bg-[#2a2e39] my-0.5" />

      {/* 12. Magnet Mode */}
      <button
        onClick={cycleMagnetMode}
        title={
          effectiveMagnet === 'strong_magnet'
            ? 'Strong Magnet ON (Snaps to OHLC — Hold Ctrl anytime)'
            : effectiveMagnet === 'weak_magnet'
            ? 'Weak Magnet ON'
            : 'Magnet Mode OFF (Hold Ctrl for temporary magnet)'
        }
        className={`w-[34px] h-[32px] rounded flex items-center justify-center transition-colors relative cursor-pointer ${
          magnetActive
            ? 'text-[#2962ff] bg-[#2962ff]/15'
            : 'text-[#787b86] hover:bg-[#2a2e39] hover:text-[#d1d4dc]'
        }`}
      >
        <Magnet className="w-4 h-4" />
        {effectiveMagnet === 'strong_magnet' && (
          <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[#2962ff]" />
        )}
      </button>

      {/* 13. Stay in Drawing Mode */}
      <button
        onClick={toggleKeepDrawingMode}
        title={keepDrawingMode ? 'Stay in Drawing Mode: ON' : 'Stay in Drawing Mode: OFF'}
        className={`w-[34px] h-[32px] rounded flex items-center justify-center transition-colors cursor-pointer ${
          keepDrawingMode
            ? 'text-[#2962ff] bg-[#2962ff]/15'
            : 'text-[#787b86] hover:bg-[#2a2e39] hover:text-[#d1d4dc]'
        }`}
      >
        <PenTool className="w-4 h-4" />
      </button>

      {/* 14. Lock All Drawings */}
      <button
        onClick={toggleDrawingsLocked}
        title={drawingsLocked ? 'Unlock All Drawings' : 'Lock All Drawings'}
        className={`w-[34px] h-[32px] rounded flex items-center justify-center transition-colors cursor-pointer ${
          drawingsLocked
            ? 'text-[#f59e0b] bg-[#f59e0b]/15'
            : 'text-[#787b86] hover:bg-[#2a2e39] hover:text-[#d1d4dc]'
        }`}
      >
        {drawingsLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
      </button>

      {/* 15. Hide All Drawings */}
      <button
        onClick={toggleDrawingsVisible}
        title={drawingsVisible ? 'Hide All Drawings' : 'Show All Drawings'}
        className={`w-[34px] h-[32px] rounded flex items-center justify-center transition-colors cursor-pointer ${
          !drawingsVisible
            ? 'text-[#f23645] bg-[#f23645]/15'
            : 'text-[#787b86] hover:bg-[#2a2e39] hover:text-[#d1d4dc]'
        }`}
      >
        {drawingsVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
      </button>

      <div className="w-6 h-[1px] bg-[#2a2e39] my-0.5" />

      {/* 16. Remove All Drawings */}
      <button
        onClick={() => bridge.clearAllOverlays?.()}
        title="Remove All Drawings"
        className="w-[34px] h-[32px] rounded flex items-center justify-center text-[#787b86] hover:bg-[#f23645]/15 hover:text-[#f23645] transition-colors cursor-pointer"
      >
        <Trash2 className="w-4 h-4" />
      </button>

      {/* 17. Bottom-Pinned Toggle Floating Favorites Toolbar */}
      <div className="mt-auto pt-1">
        <button
          onClick={toggleFloatingFavVisible}
          title={floatingFavVisible ? 'Hide Favorites Toolbar' : 'Show Favorites Toolbar'}
          className={`w-[34px] h-[32px] rounded flex items-center justify-center transition-colors cursor-pointer ${
            floatingFavVisible
              ? 'text-[#f59e0b] bg-[#f59e0b]/15'
              : 'text-[#787b86] hover:bg-[#2a2e39] hover:text-[#d1d4dc]'
          }`}
        >
          <Star className={`w-4 h-4 ${floatingFavVisible ? 'fill-[#f59e0b]' : ''}`} />
        </button>
      </div>
    </aside>
  );
};
