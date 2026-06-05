import { Canvas, useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import { useMemo, useRef, useState } from 'react'
import type { ReactNode, WheelEvent } from 'react'
import * as THREE from 'three'

type Face = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'

type Cell = {
  id: string
  face: Face
  x: number
  y: number
  mine: boolean
  position: { x: number; y: number; z: number }
}

const DEFAULT_SIZE = 10
const DEFAULT_MINE_RATE = 0.15

function getPosition(face: Face, x: number, y: number, size: number) {
  const u = (x / size - 0.5) * 2
  const v = (y / size - 0.5) * 2

  let cubeX = 0
  let cubeY = 0
  let cubeZ = 0

  switch (face) {
    case 'front':
      cubeX = u
      cubeY = -v
      cubeZ = 1
      break
    case 'back':
      cubeX = -u
      cubeY = -v
      cubeZ = -1
      break
    case 'left':
      cubeX = -1
      cubeY = -v
      cubeZ = u
      break
    case 'right':
      cubeX = 1
      cubeY = -v
      cubeZ = -u
      break
    case 'top':
      cubeX = u
      cubeY = 1
      cubeZ = v
      break
    case 'bottom':
      cubeX = u
      cubeY = -1
      cubeZ = -v
      break
  }

  return {
    x: cubeX * 2,
    y: cubeY * 2,
    z: cubeZ * 2,
  }
}

function createCells(size: number, mineRate: number): Cell[] {
  const faces: Face[] = ['front', 'back', 'left', 'right', 'top', 'bottom']
  const cells: Cell[] = []

  for (const face of faces) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        cells.push({
          id: `${face}-${x}-${y}`,
          face,
          x,
          y,
          mine: Math.random() < mineRate,
          position: getPosition(face, x + 0.5, y + 0.5, size),
        })
      }
    }
  }

  return cells
}

function getNeighbors(cell: Cell, cells: Cell[], size: number) {
  const cellStep = 4 / size
  const threshold = cellStep * 1.5

  return cells.filter((other) => {
    if (cell.id === other.id) return false

    const dx = cell.position.x - other.position.x
    const dy = cell.position.y - other.position.y
    const dz = cell.position.z - other.position.z

    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)

    return distance < threshold
  })
}

function countNeighborMines(cell: Cell, cells: Cell[], size: number) {
  return getNeighbors(cell, cells, size).filter((n) => n.mine).length
}

const normalMap: Record<Face, THREE.Vector3> = {
  front: new THREE.Vector3(0, 0, 1),
  back: new THREE.Vector3(0, 0, -1),
  left: new THREE.Vector3(-1, 0, 0),
  right: new THREE.Vector3(1, 0, 0),
  top: new THREE.Vector3(0, 1, 0),
  bottom: new THREE.Vector3(0, -1, 0),
}

const faceBasis: Record<
  Face,
  {
    right: THREE.Vector3
    up: THREE.Vector3
    normal: THREE.Vector3
  }
> = {
  front: {
    right: new THREE.Vector3(1, 0, 0),
    up: new THREE.Vector3(0, 1, 0),
    normal: new THREE.Vector3(0, 0, 1),
  },
  back: {
    right: new THREE.Vector3(-1, 0, 0),
    up: new THREE.Vector3(0, 1, 0),
    normal: new THREE.Vector3(0, 0, -1),
  },
  left: {
    right: new THREE.Vector3(0, 0, 1),
    up: new THREE.Vector3(0, 1, 0),
    normal: new THREE.Vector3(-1, 0, 0),
  },
  right: {
    right: new THREE.Vector3(0, 0, -1),
    up: new THREE.Vector3(0, 1, 0),
    normal: new THREE.Vector3(1, 0, 0),
  },
  top: {
    right: new THREE.Vector3(1, 0, 0),
    up: new THREE.Vector3(0, 0, -1),
    normal: new THREE.Vector3(0, 1, 0),
  },
  bottom: {
    right: new THREE.Vector3(1, 0, 0),
    up: new THREE.Vector3(0, 0, 1),
    normal: new THREE.Vector3(0, -1, 0),
  },
}

function FaceText({
  face,
  position,
  fontSize,
  color,
  children,
}: {
  face: Face
  position: THREE.Vector3
  fontSize: number
  color: string
  children: ReactNode
}) {
  const ref = useRef<THREE.Mesh>(null)

  const baseQuaternion = useMemo(() => {
    const basis = faceBasis[face]

    return new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(basis.right, basis.up, basis.normal)
    )
  }, [face])

  useFrame(({ camera }) => {
    if (!ref.current) return

    const parent = ref.current.parent
    if (!parent) return

    const center = ref.current.getWorldPosition(new THREE.Vector3())

    let bestAngle = 0
    let bestScore = -Infinity

    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2

      const q = baseQuaternion.clone().multiply(
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 0, 1),
          angle
        )
      )

      const upLocal = new THREE.Vector3(0, 1, 0).applyQuaternion(q)
      const upWorld = upLocal.clone().transformDirection(parent.matrixWorld)

      const a = center.clone().project(camera)
      const b = center.clone().add(upWorld).project(camera)

      const score = b.y - a.y

      if (score > bestScore) {
        bestScore = score
        bestAngle = angle
      }
    }

    ref.current.quaternion.copy(
      baseQuaternion.clone().multiply(
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 0, 1),
          bestAngle
        )
      )
    )
  })

  return (
    <Text
      ref={ref}
      position={[position.x, position.y, position.z]}
      fontSize={fontSize}
      color={color}
      anchorX="center"
      anchorY="middle"
      renderOrder={10}
    >
      {children}
    </Text>
  )
}

function CameraController({ z }: { z: number }) {
  useFrame(({ camera }) => {
    camera.position.z = z
    camera.updateProjectionMatrix()
  })

  return null
}

type CellMeshProps = {
  cell: Cell
  size: number
  opened: boolean
  count: number
  flagged: boolean
  onClick: () => void
  onRightClick: () => void
  onChord: () => void
}

function CellMesh({
  cell,
  size,
  opened,
  count,
  flagged,
  onClick,
  onRightClick,
  onChord,
}: CellMeshProps) {
  const p1 = getPosition(cell.face, cell.x, cell.y, size)
  const p2 = getPosition(cell.face, cell.x + 1, cell.y, size)
  const p3 = getPosition(cell.face, cell.x + 1, cell.y + 1, size)
  const p4 = getPosition(cell.face, cell.x, cell.y + 1, size)

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()

    g.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([
          p1.x, p1.y, p1.z,
          p2.x, p2.y, p2.z,
          p3.x, p3.y, p3.z,

          p1.x, p1.y, p1.z,
          p3.x, p3.y, p3.z,
          p4.x, p4.y, p4.z,
        ]),
        3
      )
    )

    g.computeVertexNormals()
    return g
  }, [p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z, p4.x, p4.y, p4.z])

  const lineGeometry = useMemo(() => {
    return new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(p1.x, p1.y, p1.z),
      new THREE.Vector3(p2.x, p2.y, p2.z),

      new THREE.Vector3(p2.x, p2.y, p2.z),
      new THREE.Vector3(p3.x, p3.y, p3.z),

      new THREE.Vector3(p3.x, p3.y, p3.z),
      new THREE.Vector3(p4.x, p4.y, p4.z),

      new THREE.Vector3(p4.x, p4.y, p4.z),
      new THREE.Vector3(p1.x, p1.y, p1.z),
    ])
  }, [p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z, p4.x, p4.y, p4.z])

  const normal = normalMap[cell.face]

  const textPosition = new THREE.Vector3(
    cell.position.x,
    cell.position.y,
    cell.position.z
  ).add(normal.clone().multiplyScalar(0.003))

  const numberColor =
    count === 1
      ? 'blue'
      : count === 2
      ? 'green'
      : count === 3
      ? 'red'
      : count === 4
      ? 'navy'
      : count === 5
      ? 'brown'
      : 'black'

  return (
    <>
      <mesh
        geometry={geometry}
        onClick={(e) => {
          e.stopPropagation()

          if (opened) {
            onChord()
          } else {
            onClick()
          }
        }}
        onContextMenu={(e) => {
          e.nativeEvent.preventDefault()
          e.stopPropagation()
          onRightClick()
        }}
      >
        <meshStandardMaterial
          side={THREE.DoubleSide}
          color={
            flagged
              ? '#d1d5db'
              : !opened
              ? '#bdbdbd'
              : cell.mine
              ? '#ff4444'
              : '#d4d4d4'
          }
        />
      </mesh>

      <lineSegments geometry={lineGeometry}>
        <lineBasicMaterial color="#777777" />
      </lineSegments>

      {flagged && !opened && (
        <FaceText
          face={cell.face}
          position={textPosition}
          fontSize={0.18}
          color="red"
        >
          🚩
        </FaceText>
      )}

      {opened && !cell.mine && count > 0 && (
        <FaceText
          face={cell.face}
          position={textPosition}
          fontSize={0.22}
          color={numberColor}
        >
          {count}
        </FaceText>
      )}

      {opened && cell.mine && (
        <FaceText
          face={cell.face}
          position={textPosition}
          fontSize={0.2}
          color="black"
        >
          💣
        </FaceText>
      )}
    </>
  )
}

function App() {
  const [inputGridSize, setInputGridSize] = useState(DEFAULT_SIZE)
  const [inputMineRate, setInputMineRate] = useState(DEFAULT_MINE_RATE)

  const [gridSize, setGridSize] = useState(DEFAULT_SIZE)

  const [cells, setCells] = useState<Cell[]>(() =>
    createCells(DEFAULT_SIZE, DEFAULT_MINE_RATE)
  )
  const [opened, setOpened] = useState<Set<string>>(new Set())
  const [flagged, setFlagged] = useState<Set<string>>(new Set())
  const [gameOver, setGameOver] = useState(false)

  const groupRef = useRef<THREE.Group>(null)
  const dragging = useRef(false)
  const previousMouse = useRef({ x: 0, y: 0 })

  const [cameraZ, setCameraZ] = useState(6)

  const mineCount = cells.filter((cell) => cell.mine).length
  const remainingMines = mineCount - flagged.size

  const cleared =
  cells.filter((c) => !c.mine).every((c) => opened.has(c.id))

  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    e.preventDefault()

    setCameraZ((z) => {
      const next = z + e.deltaY * 0.006
      return Math.min(12, Math.max(1.5, next))
    })
  }

  const openCell = (startId: string) => {
    if (flagged.has(startId)) return
    if (gameOver) return

    const next = new Set(opened)
    const queue = [startId]

    while (queue.length > 0) {
      const id = queue.shift()!
      if (next.has(id)) continue

      const cell = cells.find((c) => c.id === id)
      if (!cell) continue
      if (flagged.has(cell.id)) continue

      next.add(id)

      if (cell.mine) {
        setGameOver(true)

        for (const c of cells) {
          if (c.mine) next.add(c.id)
        }

        continue
      }

      const count = countNeighborMines(cell, cells, gridSize)
      if (count > 0) continue

      const neighbors = getNeighbors(cell, cells, gridSize)

      for (const neighbor of neighbors) {
        if (!next.has(neighbor.id) && !flagged.has(neighbor.id)) {
          queue.push(neighbor.id)
        }
      }
    }

    setOpened(next)
  }

  const openAroundIfFlagsMatch = (cell: Cell) => {
    if (gameOver) return
    if (!opened.has(cell.id)) return
    if (cell.mine) return

    const count = countNeighborMines(cell, cells, gridSize)
    if (count === 0) return

    const neighbors = getNeighbors(cell, cells, gridSize)
    const flagCount = neighbors.filter((n) => flagged.has(n.id)).length

    if (flagCount !== count) return

    const next = new Set(opened)
    const queue: string[] = []

    for (const neighbor of neighbors) {
      if (!flagged.has(neighbor.id) && !opened.has(neighbor.id)) {
        queue.push(neighbor.id)
      }
    }

    while (queue.length > 0) {
      const id = queue.shift()!
      if (next.has(id)) continue

      const target = cells.find((c) => c.id === id)
      if (!target) continue
      if (flagged.has(target.id)) continue

      next.add(id)

      if (target.mine) {
        setGameOver(true)

        for (const c of cells) {
          if (c.mine) next.add(c.id)
        }

        continue
      }

      const targetCount = countNeighborMines(target, cells, gridSize)
      if (targetCount > 0) continue

      const targetNeighbors = getNeighbors(target, cells, gridSize)

      for (const n of targetNeighbors) {
        if (!flagged.has(n.id) && !next.has(n.id)) {
          queue.push(n.id)
        }
      }
    }

    setOpened(next)
  }

  const toggleFlag = (id: string) => {
    if (gameOver) return
    if (opened.has(id)) return

    const next = new Set(flagged)

    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }

    setFlagged(next)
  }

  const restartGame = () => {
    const nextSize = Math.min(30, Math.max(4, inputGridSize))
    const nextMineRate = Math.min(0.4, Math.max(0.05, inputMineRate))

    setGridSize(nextSize)
    setInputGridSize(nextSize)
    setInputMineRate(nextMineRate)

    setCells(createCells(nextSize, nextMineRate))
    setOpened(new Set())
    setFlagged(new Set())
    setGameOver(false)
  }

  const onPointerDown = (e: any) => {
    dragging.current = true
    previousMouse.current = {
      x: e.clientX,
      y: e.clientY,
    }
  }

  const onPointerUp = () => {
    dragging.current = false
  }

  const onPointerMove = (e: any) => {
    if (!dragging.current) return
    if (!groupRef.current) return

    const deltaX = e.clientX - previousMouse.current.x
    const deltaY = e.clientY - previousMouse.current.y

    groupRef.current.rotation.y += deltaX * 0.01
    groupRef.current.rotation.x += deltaY * 0.01

    previousMouse.current = {
      x: e.clientX,
      y: e.clientY,
    }
  }

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          top: 20,
          left: 20,
          zIndex: 20,
          background: 'rgba(0,0,0,0.75)',
          color: 'white',
          padding: '12px 16px',
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          fontSize: 16,
          fontFamily: 'sans-serif',
        }}
      >
        <label>
          マス数
          <input
            type="number"
            min={4}
            max={30}
            value={inputGridSize}
            onChange={(e) => {
              setInputGridSize(Number(e.target.value))
            }}
            style={{
              width: 60,
              marginLeft: 8,
            }}
          />
        </label>

        <label>
          爆弾率
          <input
            type="number"
            min={5}
            max={40}
            value={Math.round(inputMineRate * 100)}
            onChange={(e) => {
              setInputMineRate(Number(e.target.value) / 100)
            }}
            style={{
              width: 60,
              marginLeft: 8,
            }}
          />
          %
        </label>

        <div>💣 {remainingMines}</div>

        <button
          onClick={restartGame}
          style={{
            padding: '6px 14px',
            cursor: 'pointer',
            borderRadius: 6,
            border: 'none',
          }}
        >
          Restart
        </button>
      </div>

      <Canvas
        camera={{ position: [0, 0, cameraZ], fov: 45 }}
        onWheel={onWheel}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        <CameraController z={cameraZ} />

        <ambientLight intensity={2} />

        <group ref={groupRef} onPointerDown={onPointerDown}>
          {cells.map((cell) => (
            <CellMesh
              key={cell.id}
              cell={cell}
              size={gridSize}
              opened={opened.has(cell.id)}
              count={countNeighborMines(cell, cells, gridSize)}
              flagged={flagged.has(cell.id)}
              onClick={() => openCell(cell.id)}
              onRightClick={() => toggleFlag(cell.id)}
              onChord={() => openAroundIfFlagsMatch(cell)}
            />
          ))}
        </group>
      </Canvas>

      {gameOver && (
        <div
          style={{
            position: 'absolute',
            top: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            color: 'red',
            background: 'black',
            padding: '10px 20px',
            fontSize: 40,
            fontWeight: 'bold',
            borderRadius: 10,
            textAlign: 'center',
            zIndex: 30,
          }}
        >
          GAME OVER

          <button
            onClick={restartGame}
            style={{
              display: 'block',
              marginTop: 20,
              marginLeft: 'auto',
              marginRight: 'auto',
              padding: '10px 20px',
              fontSize: 20,
              cursor: 'pointer',
            }}
          >
            Restart
          </button>
        </div>
      )}
      
      {cleared && !gameOver && (
      <div
        style={{
          position: 'absolute',
          top: 20,
          left: '50%',
          transform: 'translateX(-50%)',

          color: '#00ff88',
          background: 'black',

          padding: '10px 20px',
          fontSize: 40,
          fontWeight: 'bold',

          borderRadius: 10,
          textAlign: 'center',

          zIndex: 30,
        }}
      >
        CLEAR!!

        <button
          onClick={restartGame}
          style={{
            display: 'block',
            marginTop: 20,
            marginLeft: 'auto',
            marginRight: 'auto',

            padding: '10px 20px',
            fontSize: 20,
            cursor: 'pointer',
          }}
        >
          Restart
        </button>
      </div>
    )}
    </div>
  )
}

export default App