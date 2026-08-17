'use strict';

let forceOff = false;

function setNoColor(v) {
  forceOff = !!v;
}

function supportsColor(stream) {
  if (forceOff) return false;
  if (process.env.NO_COLOR != null && process.env.NO_COLOR !== '') return false;
  if (process.env.FORCE_COLOR === '0') return false;
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== '0') return true;
  const s = stream || process.stdout;
  return !!(s && s.isTTY);
}

function paint(codes, text, stream) {
  const s = String(text == null ? '' : text);
  if (!supportsColor(stream)) return s;
  const seq = Array.isArray(codes) ? codes.join(';') : String(codes);
  return '\u001b[' + seq + 'm' + s + '\u001b[0m';
}

const bold = function (t, stream) { return paint(1, t, stream); };
const dim = function (t, stream) { return paint(2, t, stream); };
const green = function (t, stream) { return paint(32, t, stream); };
const red = function (t, stream) { return paint(31, t, stream); };
const cyan = function (t, stream) { return paint(36, t, stream); };

function quote(name) {
  return '"' + name + '"';
}

module.exports = {
  setNoColor,
  supportsColor,
  paint,
  bold,
  dim,
  green,
  red,
  cyan,
  quote,
};
