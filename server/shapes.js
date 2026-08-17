const SHAPES = Object.freeze([ 'Circle', 'Rectangle', 'Square', 'Triangle' ]);

const randomShape = () => SHAPES[Math.floor(Math.random() * SHAPES.length)];

export { randomShape };
