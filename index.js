import {run} from '@cycle/xstream-run';
import {makeDOMDriver, svg, h} from '@cycle/dom';
import xs from 'xstream';

import timeDriver from './drivers/time-driver';
import mouseDriver from './drivers/mouse-driver';
import Vector from './vector';

const center = Vector({x: innerWidth / 2, y: innerHeight / 2});

window.paused = false;

function mapNodes (nodes, f) {
  return Object.keys(nodes).map(key => f(nodes[key]));
}

function renderLinkBeingCreated (state, mousePosition) {
  if (!state.addingLinkFrom) { return [] };

  const originNodePosition = state.nodes[state.addingLinkFrom].position;

  return [
    h('line', {
      attrs: {
        x1: originNodePosition.x.toFixed(1),
        y1: originNodePosition.y.toFixed(1),
        x2: mousePosition.x.toFixed(1),
        y2: mousePosition.y.toFixed(1),

        stroke: 'rebeccapurple',
        'stroke-width': '3'
      }
    })
  ];
}

function view ([state, mousePosition, hoverNode]) {
  return (
    svg({attrs: {width: innerWidth, height: innerHeight}}, [
      h('defs', [
        h('marker#triangle', {
          attrs: {
            id: 'triangle',
            viewBox: '0 0 10 10',
            refX: '40',
            refY: '5',
            markerWidth: '6',
            markerHeight: '4',
            markerUnits: 'strokeWidth',
            orient: 'auto'
          }
        }, [h('path', {attrs: {fill: 'lightgreen', stroke: 'lightgreen', d: 'M 0 0 L 10 5 L 0 10 z'}})])
      ]),

      h('text', {attrs: {
        x: 10,
        y: 70,
        style: 'stroke: white; font-size: 44pt; fill: white;'
      }}, hoverNode),

      ...state.links.map(link =>
        h('line', {
          key: 'link' + link.to + link.from,

          attrs: {
            x1: state.nodes[link.from].position.x.toFixed(1),
            y1: state.nodes[link.from].position.y.toFixed(1),
            x2: state.nodes[link.to].position.x.toFixed(1),
            y2: state.nodes[link.to].position.y.toFixed(1),

            'marker-end': 'url(#triangle)',

            stroke: 'mintcream',
            'stroke-width': '3'
          }
        })
      ),

      ...renderLinkBeingCreated(state, mousePosition),

      ...mapNodes(state.nodes, node =>
        h('circle', {
          key: node.label,
          attrs: {
            key: node.label,
            cx: node.position.x.toFixed(1),
            cy: node.position.y.toFixed(1),
            r: 20,
            fill: 'skyblue'
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
  //
  if (window.paused) {
    return state;
  }

  state.links.forEach(link => {
    const fromNode = state.nodes[link.from];
    const toNode = state.nodes[link.to];

    const distance = fromNode.position.minus(toNode.position);
    const distanceInPixels = distance.pythag();

    const compressionMultiplier = Math.max(1, distanceInPixels / 100);

    const attractionForce = distance
      .normalize()
      .times(compressionMultiplier)
      .times(delta);

    if (state.dragging !== fromNode.label) {
      fromNode.position = fromNode.position.minus(attractionForce);
    }

    if (state.dragging !== toNode.label) {
      toNode.position = toNode.position.plus(attractionForce);
    }
  });

  mapNodes(state.nodes, node => {
    mapNodes(state.nodes, otherNode => {
      if (node === otherNode) {
        return;
      }

      const distance = node.position.minus(otherNode.position);
      const distanceInPixels = distance.pythag();

      const resistanceMultiplier = Math.max(0, (300 - distanceInPixels) / 150);

      const resistanceForce = distance
        .normalize()
        .times(resistanceMultiplier)
        .times(delta);

      if (state.dragging !== otherNode.label) {
        otherNode.position = otherNode.position.minus(resistanceForce);
      }
    });
  });

  return state;
}

function startDragging (nodeElement, state) {
  // TODO - break this into two separate reducers
  const nodeKey = nodeElement.attributes.key.value;

  if (state.addingLinkFrom) {
    if (state.addingLinkFrom !== nodeKey) {
      state.links.push({from: state.addingLinkFrom, to: nodeKey});
    }

    state.addingLinkFrom = null;
  }

  state.dragging = nodeKey;

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

function placeNode (position, state) {
  return {
    ...state,

    nodes: makeNode(position, state.nodes)
  };
}

function startAddingLink (nodeElement, state) {
  state.addingLinkFrom = nodeElement.attributes.key.value;

  return state;
}

function Node (label, position) {
  return {
    label,
    position: Vector(position)
  };
}

let nodeKey = 0;

function makeNode(position, nodes, key=null) {
  if (!key) {
    key = (nodeKey++).toString();
  }

  const newNode = Node(key, position);

  return {
    ...nodes,

    [key]: newNode
  }
}

const nodes = ['a', 'b', 'c']
  .reduce((nodes, nodeName) => makeNode(center.plus({x: Math.random(), y: Math.random()}), nodes, nodeName), {});

const links = [
  {from: 'a', to: 'b'},
  {from: 'a', to: 'c'}
];

function main ({Time, DOM, Mouse}) {
  const initialState = {
    nodes,
    links,
    dragging: null,
    addingLinkFrom: null
  };

  const mousePosition$ = Mouse.positions();

  const dblClick$ = DOM
    .select('svg')
    .events('dblclick');

  const backgroundDblClick$ = dblClick$
    .filter(ev => ev.target.tagName === 'svg');

  const nodeDblClick$ = dblClick$
    .filter(ev => ev.target.tagName === 'circle');

  const placeNode$ =  mousePosition$
    .map(position => backgroundDblClick$.mapTo((state) => placeNode(position, state)))
    .flatten();

  const startAddingLink$ = nodeDblClick$
    .map(ev => (state) => startAddingLink(ev.target, state));

  const startDragging$ = DOM
    .select('circle')
    .events('mousedown')
    .map(ev => (state) => startDragging(ev.target, state));

  const stopDragging$ = Mouse
    .ups()
    .map(ev => stopDragging);

  const drag$ = mousePosition$
    .map(position => (state) => drag(position, state));

  const update$ = Time
    .map(({delta}) => delta / (1000 / 60))
    .filter(delta => delta > 0 && delta < 10) // if you switch tab, you get huge deltas
    .map(delta => (state) => update(delta, state));

  const reducer$ = xs.merge(
    update$,

    startDragging$,
    stopDragging$,
    drag$,

    placeNode$,

    startAddingLink$
  );

  const state$ = reducer$.fold(applyReducer, initialState);

  const hoverNode$ = DOM
    .select('circle')
    .events('mouseover')
    .map(ev => ev.target.attributes.key.value)
    .startWith('');

  return {
    DOM: xs.combine(state$, mousePosition$, hoverNode$).map(view)
  };
}

const drivers = {
  DOM: makeDOMDriver('.app'),
  Time: timeDriver,
  Mouse: mouseDriver
};

run(main, drivers);
