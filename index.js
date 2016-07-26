import {run} from '@cycle/xstream-run';
import {makeDOMDriver, svg, h} from '@cycle/dom';
import xs from 'xstream';
import timeDriver from './drivers/time-driver';

function mapNodes (nodes, f) {
  return Object.keys(nodes).map(key => f(nodes[key]));
}

function view (state) {
  return (
    svg({attrs: {width: innerWidth, height: innerHeight}}, [
      ...mapNodes(state.nodes, node =>
        h('circle', {attrs: {cx: node.position.x, cy: node.position.y, r: 20}})
      ),

      ...state.links.map(link =>
        h('line', {
          attrs: {
            x1: state.nodes[link.from].position.x,
            y1: state.nodes[link.from].position.y,
            x2: state.nodes[link.to].position.x,
            y2: state.nodes[link.to].position.y,

            stroke: 'black',
            'stroke-width': '2'
          }
        })
      )
    ])
  );
}

function applyReducer (state, reducer) {
  return reducer(state);
}

function update (delta, state) {
  // Given a set of nodes
  // And a set of links between nodes
  //
  // Each frame
  //  For each link
  //    Attract each linked node to the other
  //
  //  For each node
  //    Apply resisting force to each other node

  state.links.forEach(link => {
    const fromNode = state.nodes[link.from];
    const toNode = state.nodes[link.to];

    const distance = fromNode.position.minus(toNode.position);

    const distanceInPixels = distance.pythag();

    const compressionMultiplier = Math.max(1, distanceInPixels / 100);

    const normalizedDistance = distance.normalize().times(compressionMultiplier);

    fromNode.position = fromNode.position.minus(normalizedDistance);
    toNode.position = toNode.position.plus(normalizedDistance);
  });

  mapNodes(state.nodes, node => {
    mapNodes(state.nodes, otherNode => {
      if (node === otherNode) {
        return;
      }

      const distance = node.position.minus(otherNode.position);
      const distanceInPixels = distance.pythag();

      const normalizedDistance = distance.normalize();

      const resistanceMultiplier = (400 - distanceInPixels) / 200;

      const resistanceForce = normalizedDistance.times(resistanceMultiplier);

      otherNode.position = otherNode.position.minus(resistanceForce);
    });
  });

  return state;
}

function Vector({x, y}) {
  return {
    x,
    y,

    plus (other) {
      return Vector({
        x: x + other.x,
        y: y + other.y
      });
    },

    minus (other) {
      return Vector({
        x: x - other.x,
        y: y - other.y
      });
    },

    times (n) {
      return Vector({
        x: x * n,
        y: y * n
      });
    },

    normalize () {
      const length = Math.abs(x) + Math.abs(y);

      if (length === 0) {
        return Vector({x: 0, y: 0});
      }

      return Vector({
        x: x / length,
        y: y / length
      });
    },

    pythag () {
      return Math.abs(Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2)));
    }
  };
}

function Node (label, position) {
  return {
    label,
    position: Vector(position)
  };
}

const center = Vector({x: innerWidth / 2, y: innerHeight / 2})

function main ({Time}) {
  const nodes = {
    a: Node('a', center.plus({x: 2, y: 0})),
    b: Node('b', center.minus({x: 2, y: 0})),
    c: Node('c', center.plus({x: 0, y: 1})),
    d: Node('d', center.minus({x: 0, y: 1})),
  };

  const links = [
    {from: 'a', to: 'b'},
    {from: 'b', to: 'c'},
    {from: 'a', to: 'c'},
    {from: 'a', to: 'd'}
  ];

  const initialState = {
    nodes,
    links
  };

  const update$ = Time
    .map(({delta}) => delta / 1000 / 60)
    .map(delta => (state) => update(delta, state));

  const reducer$ = xs.merge(
    update$
  );

  const state$ = reducer$.fold(applyReducer, initialState);

  return {
    DOM: state$.map(view)
  };
}

const drivers = {
  DOM: makeDOMDriver('.app'),
  Time: timeDriver
};

run(main, drivers);
