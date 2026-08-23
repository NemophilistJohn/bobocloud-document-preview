const VIEWERS = Object.freeze([
  ['bobocloud.document-preview.markdown', 'Markdown preview'],
  ['bobocloud.document-preview.csv', 'CSV preview'],
  ['bobocloud.document-preview.excel', 'Excel preview'],
  ['bobocloud.document-preview.pdf', 'PDF preview']
]);

export async function activate(context) {
  const registrations = [];
  for (const [id, key] of VIEWERS) {
    registrations.push(await context.documentViews.register({ id, title: context.i18n.t(key) }));
  }

  return () => {
    for (const registration of registrations.splice(0)) registration.dispose();
  };
}
