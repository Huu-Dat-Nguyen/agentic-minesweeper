// Single home for board geometry: sizes, index math, neighbors, labels.
export const MAX_ROWS = 24;
export const MAX_COLUMNS = 40;

const NEIGHBOR_OFFSETS = Object.freeze([
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],             [0, 1],
  [1, -1],  [1, 0],   [1, 1],
]);

const neighborTables = new Map();

export function sizeError({ rows, columns, mines }) {
  if (!Number.isInteger(rows) || rows < 1 || rows > MAX_ROWS) {
    return `Rows must be an integer from 1 to ${MAX_ROWS}.`;
  }
  if (!Number.isInteger(columns) || columns < 1 || columns > MAX_COLUMNS) {
    return `Columns must be an integer from 1 to ${MAX_COLUMNS}.`;
  }
  if (!Number.isInteger(mines) || mines < 1 || mines >= rows * columns) {
    return "Mine count must be positive and leave at least one safe cell.";
  }
  return null;
}

export function rowCol(columns, index) {
  return { row: Math.floor(index / columns), column: index % columns };
}

export function indexAt(columns, row, column) {
  return row * columns + column;
}

export function inBounds(rows, columns, row, column) {
  return Number.isInteger(row)
    && Number.isInteger(column)
    && row >= 0
    && row < rows
    && column >= 0
    && column < columns;
}

export function neighborIndices({ rows, columns }, index) {
  const key = `${rows}x${columns}`;
  let table = neighborTables.get(key);
  if (!table) {
    table = Object.freeze(Array.from({ length: rows * columns }, (_, cell) => {
      const { row, column } = rowCol(columns, cell);
      const result = [];
      for (const [rowOffset, columnOffset] of NEIGHBOR_OFFSETS) {
        if (inBounds(rows, columns, row + rowOffset, column + columnOffset)) {
          result.push(indexAt(columns, row + rowOffset, column + columnOffset));
        }
      }
      return Object.freeze(result);
    }));
    neighborTables.set(key, table);
  }
  return table[index];
}

export function positionLabel({ columns }, index) {
  const { row, column } = rowCol(columns, index);
  return `row ${row + 1}, column ${column + 1}`;
}

export function isFinished(game) {
  return game.phase === "won" || game.phase === "lost";
}
