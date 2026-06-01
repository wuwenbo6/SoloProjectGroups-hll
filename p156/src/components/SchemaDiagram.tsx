import { useEffect, useRef, useMemo } from 'react'
import type { TableInfo, TableRelation } from '@/types'

interface Props {
  tables: TableInfo[]
  relations: TableRelation[]
}

interface Node {
  id: string
  name: string
  x: number
  y: number
  columns: { name: string; type: string; pk: boolean; fk: boolean }[]
}

interface Edge {
  id: string
  from: string
  to: string
  fromColumn: string
  toColumn: string
}

export default function SchemaDiagram({ tables, relations }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)

  const { nodes, edges } = useMemo(() => {
    const nodeMap = new Map<string, Node>()
    const edgesArr: Edge[] = []

    const columnsPerTable = tables.map((t) => ({
      name: t.name,
      colCount: t.columns.length,
    }))

    const totalCols = columnsPerTable.reduce((sum, t) => sum + t.colCount, 0)
    const avgCols = totalCols / Math.max(tables.length, 1)

    const cols: Node[][] = [[], []]
    let leftCount = 0
    let rightCount = 0

    columnsPerTable.forEach((t) => {
      if (leftCount <= rightCount) {
        cols[0].push(t as unknown as Node)
        leftCount += t.colCount
      } else {
        cols[1].push(t as unknown as Node)
        rightCount += t.colCount
      }
    })

    const boxWidth = 200
    const boxHeight = (colCount: number) => 40 + colCount * 24
    const gapX = 200
    const gapY = 40

    let leftY = 40
    let rightY = 40

    cols[0].forEach((t) => {
      const table = tables.find((tbl) => tbl.name === t.name)!
      const height = boxHeight(table.columns.length)
      nodeMap.set(t.name, {
        id: t.name,
        name: t.name,
        x: 40,
        y: leftY,
        columns: table.columns.map((c) => ({
          name: c.name,
          type: c.type,
          pk: c.pk,
          fk: relations.some((r) => r.fromTable === t.name && r.fromColumn === c.name),
        })),
      })
      leftY += height + gapY
    })

    cols[1].forEach((t) => {
      const table = tables.find((tbl) => tbl.name === t.name)!
      const height = boxHeight(table.columns.length)
      nodeMap.set(t.name, {
        id: t.name,
        name: t.name,
        x: 40 + boxWidth + gapX,
        y: rightY,
        columns: table.columns.map((c) => ({
          name: c.name,
          type: c.type,
          pk: c.pk,
          fk: relations.some((r) => r.fromTable === t.name && r.fromColumn === c.name),
        })),
      })
      rightY += height + gapY
    })

    if (cols[0].length === 0) {
      let y = 40
      tables.forEach((table) => {
        const height = boxHeight(table.columns.length)
        nodeMap.set(table.name, {
          id: table.name,
          name: table.name,
          x: 40,
          y,
          columns: table.columns.map((c) => ({
            name: c.name,
            type: c.type,
            pk: c.pk,
            fk: relations.some((r) => r.fromTable === table.name && r.fromColumn === c.name),
          })),
        })
        y += height + gapY
      })
    }

    relations.forEach((rel, idx) => {
      edgesArr.push({
        id: `rel-${idx}`,
        from: rel.fromTable,
        to: rel.toTable,
        fromColumn: rel.fromColumn,
        toColumn: rel.toColumn,
      })
    })

    return {
      nodes: Array.from(nodeMap.values()),
      edges: edgesArr,
    }
  }, [tables, relations])

  const svgWidth = useMemo(() => {
    const maxX = Math.max(...nodes.map((n) => n.x + 200), 600)
    return maxX + 40
  }, [nodes])

  const svgHeight = useMemo(() => {
    const maxY = Math.max(
      ...nodes.map((n) => n.y + 40 + n.columns.length * 24 + 20),
      400,
    )
    return maxY + 40
  }, [nodes])

  const getColumnY = (node: Node, colName: string) => {
    const idx = node.columns.findIndex((c) => c.name === colName)
    return node.y + 40 + idx * 24 + 12
  }

  if (tables.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[#8b949e] text-sm">
        暂无表数据
      </div>
    )
  }

  return (
    <div className="w-full h-full overflow-auto bg-[#0d1117]">
      <svg
        ref={svgRef}
        width={svgWidth}
        height={svgHeight}
        className="min-w-full"
      >
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#58a6ff" />
          </marker>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {edges.map((edge) => {
          const fromNode = nodes.find((n) => n.id === edge.from)
          const toNode = nodes.find((n) => n.id === edge.to)
          if (!fromNode || !toNode) return null

          const fromY = getColumnY(fromNode, edge.fromColumn)
          const toY = getColumnY(toNode, edge.toColumn)

          const fromX = fromNode.x + 200
          const toX = toNode.x

          const dx = toX - fromX
          const controlOffset = Math.min(Math.abs(dx) / 2, 80)

          const path = `M ${fromX} ${fromY} C ${fromX + controlOffset} ${fromY}, ${toX - controlOffset} ${toY}, ${toX} ${toY}`

          return (
            <g key={edge.id}>
              <path
                d={path}
                stroke="#58a6ff"
                strokeWidth="2"
                fill="none"
                markerEnd="url(#arrowhead)"
                opacity="0.8"
              />
              <title>
                {edge.from}.{edge.fromColumn} → {edge.to}.{edge.toColumn}
              </title>
            </g>
          )
        })}

        {nodes.map((node) => (
          <g key={node.id} filter="url(#glow)">
            <rect
              x={node.x}
              y={node.y}
              width={200}
              height={40 + node.columns.length * 24}
              rx="8"
              fill="#161b22"
              stroke="#30363d"
              strokeWidth="2"
            />
            <rect
              x={node.x}
              y={node.y}
              width={200}
              height="36"
              rx="8"
              fill="#21262d"
              stroke="none"
            />
            <rect
              x={node.x}
              y={node.y + 32}
              width={200}
              height="4"
              fill="#30363d"
            />
            <text
              x={node.x + 12}
              y={node.y + 24}
              fill="#c9d1d9"
              fontSize="13"
              fontWeight="600"
              fontFamily="Inter, sans-serif"
            >
              {node.name}
            </text>
            {node.columns.map((col, colIdx) => (
              <g key={col.name}>
                <rect
                  x={node.x}
                  y={node.y + 40 + colIdx * 24}
                  width={200}
                  height="24"
                  fill={colIdx % 2 === 0 ? '#0d1117' : '#161b22'}
                />
                {col.pk && (
                  <circle
                    cx={node.x + 10}
                    cy={node.y + 40 + colIdx * 24 + 12}
                    r="5"
                    fill="#f0883e"
                  />
                )}
                {col.fk && !col.pk && (
                  <circle
                    cx={node.x + 10}
                    cy={node.y + 40 + colIdx * 24 + 12}
                    r="5"
                    fill="#58a6ff"
                  />
                )}
                <text
                  x={node.x + 24}
                  y={node.y + 40 + colIdx * 24 + 16}
                  fill="#c9d1d9"
                  fontSize="12"
                  fontFamily="JetBrains Mono, Menlo, monospace"
                >
                  {col.name}
                </text>
                <text
                  x={node.x + 130}
                  y={node.y + 40 + colIdx * 24 + 16}
                  fill="#8b949e"
                  fontSize="10"
                  fontFamily="JetBrains Mono, Menlo, monospace"
                  textAnchor="end"
                >
                  {col.type.toLowerCase()}
                </text>
              </g>
            ))}
          </g>
        ))}
      </svg>

      <div className="flex gap-6 p-4 text-xs text-[#8b949e] border-t border-[#30363d] bg-[#161b22]">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-[#f0883e]"></span>
          <span>主键 (PK)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-[#58a6ff]"></span>
          <span>外键 (FK)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-6 h-0.5 bg-[#58a6ff]"></span>
          <span>关系</span>
        </div>
        {relations.length === 0 && (
          <span className="text-[#f0883e]">未检测到外键关系</span>
        )}
      </div>
    </div>
  )
}
