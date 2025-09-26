export function numericIdxParam(req, res, next) {
  if (!/^\d+$/.test(req.params.idx)) return res.status(400).send('잘못된 요청');
  next();
}

export function numericIdParam(req, res, next) {
  if (!/^\d+$/.test(req.params.id)) {
    return res.status(400).send('잘못된 요청');
  }
  next();
}