// shapes api server utilities

const LOG = (process.env.ENABLE_LOGGING || 'true') === 'true';

const readBooleanEnv = (name, defaultValue) => {
  const value = process.env[name];
  if (value === undefined) {
    return defaultValue;
  }

  switch (value.trim().toLowerCase()) {
    case 'true':
      return true;
    case 'false':
      return false;
    default:
      throw new Error(`${name} must be either 'true' or 'false'`);
  }
};

// debugging

const debug = LOG ?
  (msg) => console.log('      ' + msg) :
  (msg) => {};

// const debug = (msg) => console.log('      ' + msg);

export { debug, readBooleanEnv };
