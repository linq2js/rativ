const errorHandledProp = "$errorHandled";

const isErrorHandled = (error: any, target: any) => {
  if (!error) return true;
  let errorHandledTokens = error[errorHandledProp] as WeakSet<any>;
  return errorHandledTokens?.has(target);
};

const markErrorAsHandled = (error: any, atom: any) => {
  if (!error) return;
  let errorHandledTokens = error[errorHandledProp] as WeakSet<any>;
  if (!errorHandledTokens) {
    errorHandledTokens = new WeakSet();
    error[errorHandledProp] = errorHandledTokens;
  }
  errorHandledTokens.add(atom);
};

export { isErrorHandled, markErrorAsHandled };
