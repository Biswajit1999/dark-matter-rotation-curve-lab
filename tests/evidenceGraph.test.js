'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

test('evidence graph has valid typed nodes and resolvable directed edges', () => {
  const graph = JSON.parse(fs.readFileSync('data/evidence_graph.json', 'utf8'));
  const ids = new Set(graph.nodes.map(node => node.id));
  assert.equal(ids.size, graph.nodes.length);
  assert.ok(graph.nodes.length >= 12);
  assert.ok(graph.edges.length >= 11);
  for (const node of graph.nodes) {
    assert.ok(['observation', 'equation', 'inference', 'hypothesis'].includes(node.group));
    assert.ok(node.claim && node.source && node.limit);
  }
  for (const edge of graph.edges) {
    assert.ok(ids.has(edge.from));
    assert.ok(ids.has(edge.to));
    assert.match(edge.relation, /\S/);
  }
});

test('publication HTML exposes modes, landmark navigation and graph alternatives', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  for (const marker of ['id="modeEducator"', 'id="modeResearch"', 'aria-label="Evidence laboratory sections"', 'id="evidenceGraph"', 'id="evidenceRelations"', 'id="exportWorkspace"']) {
    assert.ok(html.includes(marker), `missing ${marker}`);
  }
});
