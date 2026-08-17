// shapes api server utilities

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

const debug = (message) => {
  if (!readBooleanEnv('ENABLE_DEBUG_LOGGING', false)) {
    return;
  }

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'debug',
    service: 'shapes-api',
    event: 'debug',
    message: String(message)
  }));
};

export { debug, readBooleanEnv };
