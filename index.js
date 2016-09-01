import {run} from '@cycle/xstream-run';
import {makeDOMDriver, svg, h, div, pre, input} from '@cycle/dom';
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
        }, [h('path', {attrs: {fill: 'magenta', stroke: 'magenta', d: 'M 0 0 L 10 5 L 0 10 z'}})])
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
        h('foreignObject', {
          attrs: {
            x: (node.position.x - 50).toFixed(0),
            y: (node.position.y - 5).toFixed(0),
            width: Math.max(100, node.code.length * 8),
            height: 100
          }
        }, [
          div('.draggable', {
            attrs: {
              key: node.key,
              xmlns: "http://www.w3.org/1999/xhtml"
            },
            style: {
              background: 'skyblue'
            }
          }, [
            state.editingNode === node.key
              ? input({attrs: {value: node.code}})
              : pre('.code', node.code)
          ])
        ])
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

    if (state.dragging !== fromNode.label && state.editingNode !== fromNode.label) {
      fromNode.position = fromNode.position.minus(attractionForce);
    }

    if (state.dragging !== toNode.label && state.editingNode !== toNode.label) {
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

      if (state.dragging !== otherNode.label && state.editingNode !== otherNode.label) {
        otherNode.position = otherNode.position.minus(resistanceForce);
      }
    });
  });

  mapNodes(state.nodes, node => {
    if (node.isInput) {
      node.position = node.position.update({y: 50})
    }

    if (node.isOutput) {
      node.position = node.position.update({y: innerHeight - 50})
    }
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

function startEditing (nodeElement, state) {
  const nodeKey = nodeElement.attributes.key.value;

  return {
    ...state,

    editingNode: nodeKey
  };
}

function stopEditing (newNodeText, state) {
  if (!state.editingNode) {
    return state;
  }

  const node = state.nodes[state.editingNode];

  return {
    ...state,

    editingNode: null,

    nodes: {
      ...state.nodes,

      [node.key]: {
        ...node,

        code: newNodeText
      }
    }
  }
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

function Node (label, position, {isInput, isOutput}) {
  return {
    label,
    key: label,
    code: label,
    position: Vector(position),

    isInput: !!isInput,
    isOutput: !!isOutput
  };
}

let nodeKey = 0;

function makeNode(position, nodes, {key, isInput, isOutput} = {}) {
  if (!key) {
    key = (nodeKey++).toString();
  }

  const newNode = Node(key, position, {isInput, isOutput});

  return {
    ...nodes,

    [key]: newNode
  };
}

const nodes = ['DOM']
  .reduce((nodes, nodeName) =>
      makeNode(
        center.plus({x: Math.random(), y: Math.random()}),
        makeNode(
          center.plus({x: Math.random(), y: Math.random()}),
          nodes,
          {key: nodeName, isInput: true}
        ),
        {key: 'v ' + nodeName + ' v', isOutput: true}
      ),
    {});

const links = [
];

function main ({Time, DOM, Mouse}) {
  const initialState = {
    nodes,
    editingNode: null,
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

  const nodeDblClick$ = DOM
    .select('.draggable')
    .events('dblclick');

  const placeNode$ =  mousePosition$
    .map(position => backgroundDblClick$.mapTo((state) => placeNode(position, state)))
    .flatten();

  const startAddingLink$ = nodeDblClick$
    .map(ev => (state) => startAddingLink(ev.currentTarget, state));

  const startDragging$ = DOM
    .select('.draggable')
    .events('mousedown')
    .map(ev => (state) => startDragging(ev.currentTarget, state));

  const stopDragging$ = Mouse
    .ups()
    .map(ev => stopDragging);

  const drag$ = mousePosition$
    .map(position => (state) => drag(position, state));

  const editNode$ = DOM
    .select('.draggable')
    .events('click')
    .filter(event => event.metaKey)
    .map(event => (state) => startEditing(event.currentTarget, state));

  const saveNodeEdit$ = DOM
    .select('.draggable input')
    .events('change')
    .map(event => (state) => stopEditing(event.target.value, state));

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

    editNode$,
    saveNodeEdit$,

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
