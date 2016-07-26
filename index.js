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
        h('circle', {attrs: {cx: node.position.x, cy: node.position.y, r: 30}})
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
  return state;
}

function Position({x, y}) {
  return {
    x,
    y
  };
}

function Node (label, position) {
  return {
    label,
    position: Position(position)
  };
}

function main ({Time}) {
  const nodes = {
    a: Node('a', {x: 50, y: 50}),
    b: Node('b', {x: 300, y: 50}),
    c: Node('c', {x: 50, y: 300})
  };

  const links = [
    {from: 'a', to: 'b'},
    {from: 'b', to: 'c'}
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

// Given a set of nodes
// And a set of links between nodes
//
// Each frame
//  For each link
//    Attract each linked node to the other
//
//  For each node
//    Apply resisting force to each other node
