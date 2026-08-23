import { renderIcons } from './icons.js';

export function t(context, key, values) {
  return context.i18n.t(key, values);
}
export function installStyles(context) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = context.assets.url('dist/view.css');
  document.head.append(link);
}

export function createShell(context, options = {}) {
  installStyles(context);
  const root = context.root;
  root.replaceChildren();
  root.className = 'document-preview';

  const toolbar = document.createElement('header');
  toolbar.className = 'preview-toolbar';
  const identity = document.createElement('div');
  identity.className = 'preview-identity';
  const format = document.createElement('span');
  format.className = 'preview-format';
  format.textContent = t(context, options.titleKey || 'Document preview');
  const name = document.createElement('span');
  name.className = 'preview-name';
  name.textContent = context.document.name;
  name.title = context.document.name;
  identity.append(format, name);

  const controls = document.createElement('div');
  controls.className = 'preview-controls';
  toolbar.append(identity, controls);

  const body = document.createElement('main');
  body.className = 'preview-body';
  root.append(toolbar, body);

  const localeSubscription = context.i18n.onDidChange(() => {
    format.textContent = t(context, options.titleKey || 'Document preview');
    localize(root, context);
  });

  return {
    root,
    toolbar,
    controls,
    body,
    dispose() { localeSubscription.dispose(); }
  };
}

export function iconButton(context, icon, labelKey, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-button';
  button.dataset.i18nTitle = labelKey;
  button.title = t(context, labelKey);
  button.setAttribute('aria-label', button.title);
  const node = document.createElement('i');
  node.dataset.lucide = icon;
  button.append(node);
  button.addEventListener('click', onClick);
  renderIcons(button);
  return button;
}

export function searchControl(context, onInput) {
  const wrapper = document.createElement('label');
  wrapper.className = 'search-control';
  const icon = document.createElement('i');
  icon.dataset.lucide = 'Search';
  const input = document.createElement('input');
  input.type = 'search';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.dataset.i18nPlaceholder = 'Search';
  input.placeholder = t(context, 'Search');
  input.setAttribute('aria-label', input.placeholder);
  input.addEventListener('input', () => onInput(input.value));
  wrapper.append(icon, input);
  renderIcons(wrapper);
  return { wrapper, input };
}

export function segmentedControl(context, items, activeId, onChange) {
  const group = document.createElement('div');
  group.className = 'segmented-control';
  group.setAttribute('role', 'tablist');
  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.segment = item.id;
    button.dataset.i18n = item.labelKey;
    button.textContent = t(context, item.labelKey);
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(item.id === activeId));
    button.classList.toggle('active', item.id === activeId);
    button.addEventListener('click', () => {
      for (const sibling of group.children) {
        sibling.classList.toggle('active', sibling === button);
        sibling.setAttribute('aria-selected', String(sibling === button));
      }
      onChange(item.id);
    });
    group.append(button);
  }
  return group;
}

export function localize(root, context) {
  for (const element of root.querySelectorAll('[data-i18n]')) {
    element.textContent = t(context, element.dataset.i18n);
  }
  for (const element of root.querySelectorAll('[data-i18n-title]')) {
    const value = t(context, element.dataset.i18nTitle);
    element.title = value;
    element.setAttribute('aria-label', value);
  }
  for (const element of root.querySelectorAll('[data-i18n-placeholder]')) {
    const value = t(context, element.dataset.i18nPlaceholder);
    element.placeholder = value;
    element.setAttribute('aria-label', value);
  }
}

export function showStatus(body, context, key, kind = 'status') {
  body.replaceChildren();
  const state = document.createElement('div');
  state.className = 'preview-state ' + kind;
  state.dataset.i18n = key;
  state.textContent = t(context, key);
  body.append(state);
  return state;
}

export function previewError(key) {
  const error = new Error(key);
  error.previewMessageKey = key;
  return error;
}

export function showPreviewError(body, context, error) {
  const state = showStatus(body, context, 'Preview unavailable', 'error');
  const key = error && error.code === 'DOCUMENT_ARCHIVE_UNSAFE'
    ? 'The document archive did not pass safety checks.'
    : (error && typeof error.previewMessageKey === 'string'
      ? error.previewMessageKey
      : 'The document is damaged or uses an unsupported feature.');
  state.dataset.i18nTitle = key;
  state.title = t(context, key);
  return state;
}

export function humanFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KiB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MiB';
}
