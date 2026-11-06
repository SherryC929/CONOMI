// Run with `node verify.cjs`. No packages required; webcam/model APIs are mocked.
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
function element() {
  return { textContent: '', disabled: false, hidden: false, dataset: {}, children: [],
    style: { setProperty(name, value) { this[name] = value; } }, classList: { toggle() {}, add() {}, remove() {} },
    append(...items) { items.forEach(item => item.parent = this); this.children.push(...items); }, replaceChildren() { this.children = []; },
    events: {}, addEventListener(name, callback) { this.events[name] = callback; },
    remove() { this.parent.children = this.parent.children.filter(item => item !== this); },
    pause() {}, play: async () => {}, getContext: () => ({ drawImage() {} }) };
}
const nodes = new Map();
const sandbox = { console, document: { body: element(), hidden: false,
  getElementById(id) { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); },
  createElement: element, addEventListener() {} },
  window: { tf: {}, tmImage: {}, isSecureContext: true, addEventListener() {} },
  navigator: { mediaDevices: {} }, requestAnimationFrame: () => 1, cancelAnimationFrame() {} };
const reducedMotion = { matches: false, addEventListener() {} };
const mobile = { matches: false, addEventListener() {} };
sandbox.window.matchMedia = query => query.includes('reduced-motion') ? reducedMotion : mobile;
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
  assert.equal(nodes.get('effects').children.length, 3);
  run('renderPredictions([]);');
  assert.equal(nodes.get('prediction').textContent, 'Searching...');
  assert.equal(nodes.get('effects').children.length, 0);

  // All supplied labels must select the matching, case-sensitive deployed asset.
  run("labels = ['可可 Coco', '嫑嫑 Nono', '米米 Mimi', '可嫑米 CoNoMi']; createScoreRows();");
  for (const [label, filename] of [['可可 Coco', 'Coco.jpg'], ['嫑嫑 Nono', 'Nono.jpg'], ['米米 Mimi', 'Mimi.jpg'], ['可嫑米 CoNoMi', 'CoNoMi.jpg']]) {
    sandbox.avatarPrediction = [{ className: label, probability: 0.99 }];
    run('renderPredictions(avatarPrediction); renderPredictions(avatarPrediction); renderPredictions(avatarPrediction);');
    assert.equal(nodes.get('result-avatar').src, filename);
    assert.equal(nodes.get('result-avatar').alt, label);
    assert.equal(nodes.get('result-avatar').hidden, false);
    assert.equal(nodes.get('result-symbol').hidden, true);
    assert.equal(nodes.get('prediction').textContent, label);
    const messages = {
      'Coco.jpg': 'Coco is here to watch over Mimi!',
      'Nono.jpg': 'Nono brings a little more magic to C929!',
      'Mimi.jpg': "Here's Mimi, the luckiest one on C929!",
      'CoNoMi.jpg': 'Together, they make C929 feel like home.'
    };
    assert.equal(nodes.get('character-message').textContent, messages[filename]);
    assert.equal(nodes.get('confidence').textContent, '99.0% confidence');
    const bytes = readFileSync(filename);
    assert.equal(bytes.readUInt16BE(0), 0xffd8, 'Avatar must be a JPEG');
    assert.equal(sandbox.document.body.dataset.character, filename.replace('.jpg', ''));
    assert.equal(nodes.get('confetti').children.length, 54);
    const burst = nodes.get('confetti').children[0];
    run('renderPredictions(avatarPrediction);');
    assert.equal(nodes.get('confetti').children[0], burst, 'Same character must not restart confetti');
  }
  run('renderPredictions([]);');
  assert.equal(nodes.get('result-avatar').hidden, true);
  assert.equal(nodes.get('result-symbol').hidden, false);
  assert.equal(nodes.get('prediction').textContent, 'Searching...');
  assert.equal(sandbox.document.body.dataset.character, 'CoNoMi', 'Uncertainty must preserve the last background');
  const previousBurst = nodes.get('confetti').children[0];
  run("for (let i = 0; i < 30; i++) renderPredictions([{className: i % 2 ? '可可 Coco' : '嫑嫑 Nono', probability: 0.99}]);");
  assert.equal(sandbox.document.body.dataset.character, 'CoNoMi', 'Alternating predictions cannot confirm a new theme');
  assert.equal(nodes.get('confetti').children[0], previousBurst);
  run("renderPredictions([]); renderPredictions([{className:'可可 Coco', probability:0.99}]); renderPredictions([{className:'可可 Coco', probability:0.8}]); renderPredictions([{className:'可可 Coco', probability:0.99}]); renderPredictions([{className:'可可 Coco', probability:0.99}]);");
  assert.equal(sandbox.document.body.dataset.character, 'CoNoMi', 'Threshold dip resets the candidate streak');
  run("renderPredictions([{className:'可可 Coco', probability:0.99}]);");
  assert.equal(sandbox.document.body.dataset.character, 'Coco');
  for (const piece of [...nodes.get('confetti').children]) piece.events.animationend();
  assert.equal(nodes.get('confetti').children.length, 0, 'Expired confetti is removed');
  assert.ok(nodes.get('decoration-a').children.length + nodes.get('decoration-b').children.length <= 48);
  // Verify desktop and mobile animation budgets, size ranges, speed, and staggering.
  for (const isMobile of [false, true]) {
    mobile.matches = isMobile;
    for (const character of ['Coco', 'Nono', 'Mimi', 'CoNoMi']) {
      sandbox.testCharacter = character;
      run('drawDecorations(testCharacter);');
      const particles = run("[$('decoration-a'), $('decoration-b')][visibleDecorationLayer].children");
      const expectedCount = character === 'Mimi' ? (isMobile ? 12 : 24) : (isMobile ? 10 : 20);
      assert.equal(particles.length, expectedCount);
      particles.forEach((particle, index) => {
        const duration = parseFloat(particle.style['--duration']);
        const phase = -parseFloat(particle.style['--delay']) / duration;
        assert.ok(duration >= 12 / 1.4 && duration <= 20 / 1.4);
        assert.ok(phase >= index / expectedCount && phase <= (index + 1) / expectedCount);
        if (character === 'Mimi') {
          const size = parseFloat(particle.style['--size']);
          assert.ok(size >= 20 && size <= (isMobile ? 56 : 75));
        }
      });
    }
  }
  mobile.matches = true;
  run("drawDecorations('Mimi'); celebrate('Mimi');");
  assert.equal(run("[$('decoration-a'), $('decoration-b')][visibleDecorationLayer].children.length"), 12);
  assert.equal(nodes.get('confetti').children.length, 30);
  reducedMotion.matches = true;
  run("drawDecorations('Mimi'); celebrate('Mimi');");
  assert.equal(nodes.get('decoration-a').children.length + nodes.get('decoration-b').children.length, 0);
  assert.equal(nodes.get('confetti').children.length, 0);
  reducedMotion.matches = false; mobile.matches = false;

  let stopped = 0;
  const track = { stop() { stopped++; }, addEventListener() {} };
  const media = { getTracks: () => [track], getVideoTracks: () => [track] };
  sandbox.media = media;
  run('stream = media; stopCamera();');
  assert.equal(stopped, 1);
  assert.equal(nodes.get('webcam').srcObject, null);
  assert.equal(nodes.get('stop').disabled, true);
  assert.equal(sandbox.document.body.dataset.character, undefined, 'Stop resets the theme');
  assert.equal(nodes.get('confetti').children.length, 0);

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
  assert.equal(nodes.get('prediction').textContent, 'Someone sweet is on their way...', 'Late inference must not overwrite stopped state');
  console.log('PASS: metadata labels, strict 80% threshold, highest match, theme reset, track cleanup, late permission, denied permission, and late inference.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
