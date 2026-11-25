import { env, pipeline } from '@huggingface/transformers';

/* global FIREFOX */
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.useBrowserCache = false;
env.localModelPath = chrome.runtime.getURL('models/');
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('ort/');
env.backends.onnx.wasm.numThreads = 1;

const TOPICS = {
  keep: ['computer science lecture', 'programming tutorial', 'technical deep dive on software systems', 'algorithms and competitive programming', 'mathematics lecture', 'book analysis and literature'],
  music: ['music songs'],
  gaming: ['video game gameplay'],
  other: ['comedy entertainment', 'motivational self improvement speech', 'productivity routine lifestyle vlog', 'make money online', 'sports highlights', 'movies and celebrities'],
};

let model;
async function load() {
  const pipe = await pipeline('feature-extraction', 'bge-small-en-v1.5', { dtype: 'q8', device: 'wasm' });
  const embed = async texts => (await pipe(texts, { pooling: 'mean', normalize: true })).tolist();
  const topics = {};
  for (const [name, texts] of Object.entries(TOPICS)) topics[name] = await embed(texts);
  return { embed, topics };
}

async function classify(titles) {
  model ??= load().catch(err => {
    model = null;
    throw err;
  });
  const { embed, topics } = await model;
  const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
  return (await embed(titles)).map(v =>
    Object.fromEntries(Object.entries(topics).map(([name, vs]) => [name, Math.max(...vs.map(t => dot(v, t)))])),
  );
}

if (FIREFOX) {
  globalThis.holdfastClassify = classify;
} else {
  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (msg.type !== 'ai' || sender.id !== chrome.runtime.id) return;
    classify(msg.titles).then(scores => respond({ scores }), err => respond({ error: String(err) }));
    return true;
  });
}
