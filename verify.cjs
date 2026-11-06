// Run with `node verify.cjs`. No packages required; webcam/model APIs are mocked.
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
function element() {
  return { textContent: '', disabled: false, hidden: false, dataset: {}, children: [],
    style: { setProperty() {} }, classList: { toggle() {}, add() {}, remove() {} },
    append(...items) { this.children.push(...items); }, replaceChildren() { this.children = []; },
    addEventListener() {}, pause() {}, play: async () => {}, getContext: () => ({ drawImage() {} }) };
}
const nodes = new Map();
const sandbox = { console, document: { body: element(), hidden: false,
  getElementById(id) { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); },
  createElement: element, addEventListener() {} },
  window: { tf: {}, tmImage: {}, isSecureContext: true, addEventListener() {} },
  navigator: { mediaDevices: {} }, requestAnimationFrame: () => 1, cancelAnimationFrame() {} };
vm.createContext(sandbox);
vm.runInContext(readFileSync('script.js', 'utf8'), sandbox);
const run = (code) => vm.runInContext(code, sandbox);
(async () => {
  run("labels = ['Custom A', 'Custom B', 'Custom C', 'Custom D']; createScoreRows();");
  assert.equal(nodes.get('scores').children.length, 4);
  run("renderPredictions([{className:'Custom B', probability:0.8}]);");
  assert.equal(nodes.get('prediction').textContent, 'Searching...');
  run("renderPredictions([{className:'Custom B', probability:0.81}, {className:'Custom D', probability:0.95}]);");
  assert.equal(nodes.get('prediction').textContent, 'Custom D');
  assert.equal(sandbox.document.body.dataset.theme, 3);
  assert.equal(nodes.get('effects').children.length, 16);
  run('renderPredictions([]);');
  assert.equal(nodes.get('prediction').textContent, 'Searching...');
  assert.equal(nodes.get('effects').children.length, 0);

  let stopped = 0;
  const track = { stop() { stopped++; }, addEventListener() {} };
  const media = { getTracks: () => [track], getVideoTracks: () => [track] };
  sandbox.media = media;
  run('stream = media; stopCamera();');
  assert.equal(stopped, 1);
  assert.equal(nodes.get('webcam').srcObject, null);
  assert.equal(nodes.get('stop').disabled, true);

  sandbox.tmImage = { load: async () => ({ getClassLabels: () => ['Fresh metadata label'] }) };
  let grantPermission;
  sandbox.navigator.mediaDevices.getUserMedia = () => new Promise((resolve) => { grantPermission = resolve; });
  const pendingStart = run('startCamera();');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(typeof grantPermission, 'function');
  run('stopCamera();'); grantPermission(media); await pendingStart;
  assert.equal(stopped, 2, 'Late permission must release its stream');
  assert.equal(nodes.get('webcam').srcObject, null);

  sandbox.navigator.mediaDevices.getUserMedia = async () => { throw Object.assign(new Error(), { name: 'NotAllowedError' }); };
  await run('startCamera();');
  assert.match(nodes.get('status').textContent, /permission was denied/);
  assert.equal(nodes.get('start').disabled, false);

  let finishPrediction;
  sandbox.pendingPrediction = new Promise((resolve) => { finishPrediction = resolve; });
  nodes.get('webcam').readyState = 2;
  nodes.get('webcam').videoWidth = 640; nodes.get('webcam').videoHeight = 480;
  const pendingLoop = run('stream = media; model = { predict: () => pendingPrediction }; predictLoop(session);');
  run('stopCamera();');
  finishPrediction([{ className: 'Fresh metadata label', probability: 1 }]);
  await pendingLoop;
  assert.equal(nodes.get('prediction').textContent, 'A little mystery…', 'Late inference must not overwrite stopped state');
  console.log('PASS: metadata labels, strict 80% threshold, highest match, theme reset, track cleanup, late permission, denied permission, and late inference.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
