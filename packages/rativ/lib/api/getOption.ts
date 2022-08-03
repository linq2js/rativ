import { OptionFactory } from ".";

const getOption = <P>(builder: OptionFactory<P>, payload: P) =>
  typeof builder === "function" ? builder(payload) : builder;

export { getOption };
