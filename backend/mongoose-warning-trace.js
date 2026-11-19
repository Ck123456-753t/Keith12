const originalWarn = console.warn.bind(console);
const originalEmitWarning = process.emitWarning.bind(process);

function isTargetWarning(args) {
  return args.some(value =>
    String(value).includes("the 'new' option") ||
    String(value).includes("returnOriginal")
  );
}

console.warn = (...args) => {
  originalWarn(...args);

  if (isTargetWarning(args)) {
    originalWarn(
      "\n========== MONGOOSE WARNING STACK ==========\n" +
      new Error("Warning origin").stack +
      "\n============================================\n"
    );
  }
};

process.emitWarning = (warning, ...args) => {
  if (isTargetWarning([warning])) {
    originalWarn(
      "\n========== MONGOOSE EMIT WARNING STACK ==========\n" +
      new Error("Warning origin").stack +
      "\n=================================================\n"
    );
  }

  return originalEmitWarning(warning, ...args);
};
