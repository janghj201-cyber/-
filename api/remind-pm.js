// 캘린더 알림 — 오후 6시(KST) 분(내일 일정). 본체는 push-remind.js
const run = require('./push-remind.js');
module.exports = (req, res) => { req.query = { ...(req.query || {}), slot: 'prev18' }; return run(req, res); };
