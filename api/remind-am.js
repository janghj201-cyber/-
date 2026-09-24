// 캘린더 알림 — 아침 9시(KST) 분. 본체는 push-remind.js
const run = require('./push-remind.js');
module.exports = (req, res) => { req.query = { ...(req.query || {}), slot: 'am9' }; return run(req, res); };
