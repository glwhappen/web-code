const PROJECT_DOMAIN_SUFFIX = 'code.glwsq.cn';
const PROJECT_DEV_SUFFIX = '_dev';

function normalizeProjectHostLabel(value) {
  if (!value) {
    return '';
  }

  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseProjectHost(hostname) {
  const normalizedHost = String(hostname || '').trim().toLowerCase();
  const suffix = `.${PROJECT_DOMAIN_SUFFIX}`;

  if (!normalizedHost.endsWith(suffix)) {
    return null;
  }

  const rawLabel = normalizedHost.slice(0, -suffix.length);
  if (!rawLabel) {
    return null;
  }

  const isDev = rawLabel.endsWith(PROJECT_DEV_SUFFIX);
  const projectLabel = isDev ? rawLabel.slice(0, -PROJECT_DEV_SUFFIX.length) : rawLabel;
  const normalizedLabel = normalizeProjectHostLabel(projectLabel);
  if (!normalizedLabel) {
    return null;
  }

  return {
    hostname: normalizedHost,
    rawLabel,
    projectLabel: normalizedLabel,
    isDev,
  };
}

function projectDisplayNameToHostLabel(displayName, fallbackPath = '') {
  const primaryLabel = normalizeProjectHostLabel(displayName);
  if (primaryLabel) {
    return primaryLabel;
  }

  const fallbackName = String(fallbackPath || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .pop() || '';

  return normalizeProjectHostLabel(fallbackName);
}

export {
  PROJECT_DOMAIN_SUFFIX,
  PROJECT_DEV_SUFFIX,
  normalizeProjectHostLabel,
  parseProjectHost,
  projectDisplayNameToHostLabel,
};
