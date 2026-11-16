// Test-process observer only; never loaded by the application.
import pg from 'pg';
let values;
const reset = () => (values = { total: 0, context: 0, scalarBytesEstimate: 0 });
reset();
const query = pg.Client.prototype.query;
pg.Client.prototype.query = function (...args) {
  const text = typeof args[0] === 'string' ? args[0] : args[0]?.text || '';
  values.total++;
  if (
    /^\s*(begin|commit|rollback|savepoint|release|set)\b/i.test(text) ||
    /select set_config\(/i.test(text)
  )
    values.context++;
  const add = (result) => {
    for (const row of result?.rows || [])
      for (const v of Object.values(row)) {
        if (typeof v === 'string') values.scalarBytesEstimate += Buffer.byteLength(v);
        else if (typeof v === 'number' || v instanceof Date) values.scalarBytesEstimate += 8;
        else if (typeof v === 'boolean') values.scalarBytesEstimate++;
      }
  };
  if (typeof args.at(-1) === 'function') {
    const callback = args.at(-1);
    args[args.length - 1] = (e, r) => {
      if (!e) add(r);
      callback(e, r);
    };
    return query.apply(this, args);
  }
  const result = query.apply(this, args);
  return result?.then
    ? result.then((r) => {
        add(r);
        return r;
      })
    : result;
};
process.on('message', (m) => {
  if (m === 'reset') reset();
  process.send?.({ type: 'driver', ...values, functional: values.total - values.context });
});
