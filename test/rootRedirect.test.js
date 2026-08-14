import assert from 'node:assert/strict';
import test from 'node:test';
import { redirectRootToAdmin } from '../app.js';

test('service root redirects to the protected contract administration', () => {
  const headers = new Map();
  let redirect;
  const response = {
    set(name, value) {
      headers.set(name.toLowerCase(), value);
      return this;
    },
    redirect(status, location) {
      redirect = { status, location };
      return this;
    }
  };

  redirectRootToAdmin({}, response);

  assert.deepEqual(redirect, { status: 302, location: '/admin/contracts' });
  assert.equal(headers.get('cache-control'), 'no-store');
  assert.equal(headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
});
