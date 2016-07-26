import {run} from '@cycle/xstream-run';
import {makeDOMDriver, svg, h} from '@cycle/dom';
import xs from 'xstream';

import timeDriver from './drivers/time-driver';
import mouseDriver from './drivers/mouse-driver';
import Vector from './vector';

function mapNodes (nodes, f) {
  return Object.keys(nodes).map(key => f(nodes[key]));
}

function view (state) {
  return (
    svg({attrs: {width: innerWidth, height: innerHeight}}, [
      ...mapNodes(state.nodes, node =>
        h('circle', {attrs: {key: node.label, cx: node.position.x, cy: node.position.y, r: 20}})
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

      const resistanceMultiplier = (300 - distanceInPixels) / 150;

      const resistanceForce = normalizedDistance.times(resistanceMultiplier);

      otherNode.position = otherNode.position.minus(resistanceForce);
    });
  });

  return state;
}

function startDragging (nodeEl, state) {
  state.dragging = nodeEl.attributes.key.value;

  console.log(state.dragging);

  return state;
}

function stopDragging (state) {
  state.dragging = null;

  return state;
}

function drag (position, state) {
  if (!state.dragging) {
    return state;
  }

  state.nodes[state.dragging].position = Vector(position);

  return state;
}

function Node (label, position) {
  return {
    label,
    position: Vector(position)
  };
}

const center = Vector({x: innerWidth / 2, y: innerHeight / 2});

function main ({Time, DOM, Mouse}) {
  const nodes = {
    a: Node('a', center.plus({x: 2, y: 0})),
    b: Node('b', center.minus({x: 2, y: 0})),
    c: Node('c', center.plus({x: 0, y: 1})),
    d: Node('d', center.minus({x: 0, y: 1})),
    e: Node('e', center.minus({x: 1, y: 2}))
  };

  const links = [
    {from: 'a', to: 'b'},
    {from: 'b', to: 'c'},
    {from: 'a', to: 'c'},
    {from: 'a', to: 'd'},
    {from: 'b', to: 'e'}
  ];

  const initialState = {
    nodes,
    links,
    dragging: null
  };

  const startDragging$ = DOM
    .select('circle')
    .events('mousedown')
    .map(ev => (state) => startDragging(ev.target, state));

  const stopDragging$ = Mouse
    .ups()
    .map(ev => stopDragging);

  const drag$ = Mouse
    .positions()
    .map(position => (state) => drag(position, state));

  const update$ = Time
    .map(({delta}) => delta / 1000 / 60)
    .map(delta => (state) => update(delta, state));

  const reducer$ = xs.merge(
    update$,

    startDragging$,
    stopDragging$,
    drag$
  );

  const state$ = reducer$.fold(applyReducer, initialState);

  return {
    DOM: state$.map(view)
  };
}

const drivers = {
  DOM: makeDOMDriver('.app'),
  Time: timeDriver,
  Mouse: mouseDriver
};

run(main, drivers);
