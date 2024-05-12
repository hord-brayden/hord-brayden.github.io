document.addEventListener('DOMContentLoaded', function() {
    const canvas = document.getElementById('gameOfLifeCanvas');
    const ctx = canvas.getContext('2d');

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    let speed = 20;
    const resolution = 18;
    const cols = Math.floor(canvas.width / resolution);
    const rows = Math.floor(canvas.height / resolution);

    let grid = createGrid();

    function createGrid() {
        let arr = new Array(cols);
        for (let i = 0; i < arr.length; i++) {
            arr[i] = new Array(rows);
            for (let j = 0; j < arr[i].length; j++) {
                arr[i][j] = Math.floor(Math.random() * 2);
            }
        }
        return arr;
    }

    function nextGeneration(grid) {
        let next = createGrid();
        for (let col = 0; col < grid.length; col++) {
            for (let row = 0; row < grid[col].length; row++) {
                const neighbors = countNeighbors(grid, col, row);
                const cell = grid[col][row];
                if (cell === 0 && neighbors === 3) {
                    next[col][row] = 1;
                } else if (cell === 1 && (neighbors < 2 || neighbors > 3)) {
                    next[col][row] = 0;
                } else {
                    next[col][row] = cell;
                }
            }
        }
        return next;
    }

    function countNeighbors(grid, x, y) {
        let count = 0;
        for (let i = -1; i < 2; i++) {
            for (let j = -1; j < 2; j++) {
                const col = (x + i + cols) % cols;
                const row = (y + j + rows) % rows;
                count += grid[col][row];
            }
        }
        count -= grid[x][y];
        return count;
    }

    function draw() {
        for (let col = 0; col < grid.length; col++) {
            for (let row = 0; row < grid[col].length; row++) {
                const cell = grid[col][row];
                ctx.beginPath();
                ctx.rect(col * resolution, row * resolution, resolution, resolution);
                ctx.fillStyle = cell ? 'white' : '#2b2b2b';
                ctx.fill();
                ctx.stroke();
            }
        }
    }

    function update() {
        setTimeout(() => {
            grid = nextGeneration(grid);
            draw();
            requestAnimationFrame(update);
        }, speed);
    }

    update();
    // for footer regen
    window.reSeed = function() {
        grid = createGrid();
        draw();
    };
});
