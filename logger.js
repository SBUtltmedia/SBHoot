// Use like this: node --import logger.js yourapp.js 

import path from 'path';

const { log } = console;
[`debug`, `log`, `warn`, `error`, `table`, `dir`].forEach((methodName) => {
  const originalLoggingMethod = console[methodName];
  console[methodName] = (...args) => {
    const originalPrepareStackTrace = Error.prepareStackTrace;
    Error.prepareStackTrace = (_, stack) => stack;
    const callee = new Error().stack[1];
    Error.prepareStackTrace = originalPrepareStackTrace;
    const relativeFileName = path
      .relative(process.cwd(), callee.getFileName())
      .replace(process.cwd(), ``)
      .replace(`file:/`, ``);
    // Log in dark grey
    const label = `${relativeFileName}:${callee.getLineNumber()}`;
    log(`🪵 \x1b[90m%s\x1b[0m`, label);
    originalLoggingMethod(...args);
  };
});