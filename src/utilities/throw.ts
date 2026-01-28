export const throw_ = (...args: ConstructorParameters<typeof Error>): never => {
  throw new Error(...args);
};
