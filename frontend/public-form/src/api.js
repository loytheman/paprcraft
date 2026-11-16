// The customer's side of a form link: no login, no cookies; the link's token is the credential.
// Routes: backend/api/src/routes/v1/index.js ("/form-link/:token"). Responses use the API's envelope
// ({ status: 'success', data } / { status: 'fail', message, data? }).
//
// Failures are thrown as FormLinkError with a `kind` the screens switch on:
//   invalid     the link is wrong, expired, revoked or already used (the API never says which)
//   rate        too many requests from this address (429)
//   validation  the answers need fixing (422): `errors` is the API's [{ key, message, row?, field? }]
//   network     the server couldn't be reached
//   server      anything else
export class FormLinkError extends Error {
  constructor(kind, message, errors = []) {
    super(message);
    this.kind = kind;
    this.errors = errors;
  }
}

export const makeApi = (apiUrl, fetchFn = (...a) => fetch(...a)) => {
  const call = async (method, path, body) => {
    let res;
    try {
      res = await fetchFn(`${apiUrl}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new FormLinkError('network', "We couldn't reach the server. Check your connection and try again.");
    }
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.status === 'success') return json.data;
    if (res.status === 404 || res.status === 400) throw new FormLinkError('invalid', "This link isn't valid or has expired.");
    if (res.status === 429) throw new FormLinkError('rate', json.message || 'Too many requests. Please wait a minute and try again.');
    if (res.status === 422) throw new FormLinkError('validation', json.message || 'Please check the highlighted answers.', json.data?.errors ?? []);
    throw new FormLinkError('server', 'Something went wrong on our side. Please try again.');
  };

  // Attachments as the API wants them: an existing one by id, a new upload by its temporary key.
  const forApi = (list) => list.map((a) => (a.id ? { id: a.id, fieldKey: a.fieldKey } : { key: a.key, name: a.name, fieldKey: a.fieldKey }));

  return {
    getForm: (token) => call('GET', `/form-link/${token}`),
    saveDraft: (token, values, attachments) => call('PUT', `/form-link/${token}`, { values, attachments: forApi(attachments) }),
    submit: (token, values, attachments) => call('POST', `/form-link/${token}/submit`, { values, attachments: forApi(attachments) }),

    // Uploads one file: asks for a presigned URL, PUTs the file to it, returns its temporary key.
    upload: async (token, file) => {
      const { uploadUrl, key } = await call('POST', `/form-link/${token}/attachment-url`, { contentType: file.type });
      let put;
      try {
        put = await fetchFn(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file, credentials: 'omit' });
      } catch {
        throw new FormLinkError('network', "The upload didn't go through. Check your connection and try again.");
      }
      if (!put.ok) throw new FormLinkError('server', "The file couldn't be uploaded. Try again.");
      return { key, name: file.name };
    },
  };
};

// "/f/<token>" -> token, or '' when the address isn't a form link.
export const tokenFromPath = (pathname) => /^\/f\/([A-Za-z0-9_-]{20,100})\/?$/.exec(pathname)?.[1] ?? '';
