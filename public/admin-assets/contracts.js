(() => {
  const loginPanel = document.getElementById('login-panel');
  const loginForm = document.getElementById('login-form');
  const loginButton = document.getElementById('login-button');
  const tokenInput = document.getElementById('admin-token');
  const loginStatus = document.getElementById('login-status');
  const adminPanel = document.getElementById('admin-panel');
  const adminStatus = document.getElementById('admin-status');
  const logoutButton = document.getElementById('logout-button');
  const statusFilter = document.getElementById('status-filter');
  const applicationList = document.getElementById('application-list');
  const sepaDialog = document.getElementById('sepa-dialog');
  const sepaDetails = document.getElementById('sepa-details');
  const activateDialog = document.getElementById('activate-dialog');
  const activateCopy = document.getElementById('activate-copy');
  const activateConfirmation = document.getElementById('activate-confirmation');
  const activateConfirmButton = document.getElementById('activate-confirm-button');
  const adminActionDialog = document.getElementById('admin-action-dialog');
  const adminActionHeading = document.getElementById('admin-action-heading');
  const adminActionCopy = document.getElementById('admin-action-copy');
  const adminActionConfirmationCopy = document.getElementById('admin-action-confirmation-copy');
  const adminActionConfirmation = document.getElementById('admin-action-confirmation');
  const adminActionConfirmButton = document.getElementById('admin-action-confirm-button');

  const currency = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
  const date = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeZone: 'Europe/Berlin' });
  let adminToken = '';
  let pendingActivation = null;
  let pendingAdminAction = null;

  function setStatus(element, message, isError = false) {
    element.textContent = message;
    element.classList.toggle('is-error', isError);
  }

  async function adminRequest(path, options = {}) {
    const response = await fetch(`/api/contracts${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${adminToken}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      throw new Error('Die Serverantwort konnte nicht gelesen werden.');
    }
    if (!response.ok || !result.ok) {
      const messages = {
        ADMIN_AUTH_REQUIRED: 'Admin-Token fehlt.',
        ADMIN_AUTH_INVALID: 'Admin-Token ist ungültig.',
        APPLICATION_NOT_FOUND: 'Der Antrag wurde nicht gefunden.',
        APPLICATION_NOT_ACTIVATABLE: 'Dieser Antrag kann nicht aktiviert werden.',
        APPLICATION_NOT_ACTIVE: 'Diese Aktion ist nur für aktive Verträge möglich.',
        CONFIRMATION_EMAIL_NOT_SENT: 'Die E-Mail konnte nicht versendet werden. Bitte SMTP-Verbindung prüfen und erneut versuchen.',
        TEST_BOOKING_ACCESS_FAILED: 'Der Testzugang konnte nicht gespeichert werden. Bitte erneut versuchen.'
      };
      throw new Error(messages[result.error] || 'Die Aktion konnte nicht ausgeführt werden.');
    }
    return result;
  }

  function addDetail(container, label, value) {
    const item = document.createElement('div');
    item.className = 'data-item';
    const labelNode = document.createElement('span');
    labelNode.className = 'data-label';
    labelNode.textContent = label;
    const valueNode = document.createElement('span');
    valueNode.className = 'data-value';
    valueNode.textContent = value || '–';
    item.append(labelNode, valueNode);
    container.appendChild(item);
  }

  function addDefinition(container, label, value) {
    const term = document.createElement('dt');
    term.textContent = label;
    const description = document.createElement('dd');
    description.textContent = value || '–';
    container.append(term, description);
  }

  function renderApplications(applications) {
    applicationList.replaceChildren();
    if (!applications.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'Für diesen Status wurden keine Verträge gefunden.';
      applicationList.appendChild(empty);
      return;
    }

    applications.forEach((application) => {
      const card = document.createElement('article');
      card.className = 'application-card';
      const heading = document.createElement('div');
      heading.className = 'application-heading';
      const titleWrap = document.createElement('div');
      const title = document.createElement('h3');
      title.textContent = `${application.first_name} ${application.last_name}`;
      const reference = document.createElement('p');
      reference.textContent = application.mandate_reference;
      const badge = document.createElement('span');
      badge.className = 'badge';
      const statusLabels = {
        sepa_pending: 'SEPA ausstehend',
        active: 'Aktiv',
        cancel_requested: 'Kündigung angefordert',
        cancelled: 'Beendet'
      };
      badge.textContent = statusLabels[application.status] || application.status;
      titleWrap.append(title, reference);
      heading.append(titleWrap, badge);

      const grid = document.createElement('div');
      grid.className = 'data-grid';
      addDetail(grid, 'Paket', String(application.package_key || '').toUpperCase());
      addDetail(grid, 'Monatsbeitrag', currency.format(application.monthly_price_cents / 100));
      addDetail(grid, 'Vertragsbeginn', date.format(new Date(application.starts_on)));
      addDetail(grid, 'E-Mail', application.email);
      addDetail(grid, 'IBAN', application.masked_iban);
      addDetail(grid, 'Eingang', date.format(new Date(application.created_at)));

      const actions = document.createElement('div');
      actions.className = 'card-actions';
      const sepaButton = document.createElement('button');
      sepaButton.className = 'button button-secondary';
      sepaButton.type = 'button';
      sepaButton.textContent = 'SEPA-Daten anzeigen';
      sepaButton.dataset.action = 'sepa';
      sepaButton.dataset.id = application.id;
      actions.appendChild(sepaButton);

      if (application.status === 'sepa_pending') {
        const activateButton = document.createElement('button');
        activateButton.className = 'button';
        activateButton.type = 'button';
        activateButton.textContent = 'SEPA eingerichtet & Vertrag annehmen';
        activateButton.dataset.action = 'activate';
        activateButton.dataset.id = application.id;
        activateButton.dataset.reference = application.mandate_reference;
        actions.appendChild(activateButton);
      }

      if (application.status === 'active') {
        const resendButton = document.createElement('button');
        resendButton.className = 'button button-secondary';
        resendButton.type = 'button';
        resendButton.textContent = 'Vertragsbestätigung erneut senden';
        resendButton.dataset.action = 'resend-confirmation';
        resendButton.dataset.id = application.id;
        resendButton.dataset.reference = application.mandate_reference;
        actions.appendChild(resendButton);

        const testAccessButton = document.createElement('button');
        testAccessButton.className = 'button button-secondary';
        testAccessButton.type = 'button';
        testAccessButton.textContent = 'Test-Buchung 2 Stunden freigeben';
        testAccessButton.dataset.action = 'test-booking-access';
        testAccessButton.dataset.id = application.id;
        testAccessButton.dataset.reference = application.mandate_reference;
        actions.appendChild(testAccessButton);
      }

      card.append(heading, grid, actions);
      applicationList.appendChild(card);
    });
  }

  async function loadApplications() {
    setStatus(adminStatus, 'Verträge werden geladen…');
    const query = statusFilter.value ? `?status=${encodeURIComponent(statusFilter.value)}` : '';
    try {
      const result = await adminRequest(`/admin${query}`);
      renderApplications(result.applications || []);
      setStatus(adminStatus, `${(result.applications || []).length} Vertragseinträge geladen.`);
    } catch (error) {
      setStatus(adminStatus, error.message, true);
    }
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    adminToken = tokenInput.value.trim();
    if (!adminToken) return;
    loginButton.disabled = true;
    loginButton.textContent = 'Zugang wird geprüft…';
    setStatus(loginStatus, '');
    try {
      await adminRequest('/admin?status=sepa_pending&limit=1');
      tokenInput.value = '';
      loginPanel.hidden = true;
      adminPanel.hidden = false;
      logoutButton.hidden = false;
      await loadApplications();
    } catch (error) {
      adminToken = '';
      setStatus(loginStatus, error.message, true);
    } finally {
      loginButton.disabled = false;
      loginButton.textContent = 'Verträge laden';
    }
  });

  logoutButton.addEventListener('click', () => {
    adminToken = '';
    applicationList.replaceChildren();
    adminPanel.hidden = true;
    logoutButton.hidden = true;
    loginPanel.hidden = false;
    tokenInput.focus();
  });

  statusFilter.addEventListener('change', loadApplications);

  applicationList.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    if (button.dataset.action === 'sepa') {
      button.disabled = true;
      setStatus(adminStatus, 'SEPA-Daten werden sicher geladen…');
      try {
        const result = await adminRequest(`/admin/${encodeURIComponent(button.dataset.id)}/sepa`);
        sepaDetails.replaceChildren();
        addDefinition(sepaDetails, 'Kontoinhaber', result.sepa.account_holder);
        addDefinition(sepaDetails, 'IBAN', result.sepa.iban);
        addDefinition(sepaDetails, 'Mandatsreferenz', result.sepa.mandate_reference);
        addDefinition(sepaDetails, 'Monatsbeitrag', currency.format(result.sepa.monthly_price_cents / 100));
        addDefinition(sepaDetails, 'Einrichtung', currency.format(result.sepa.setup_fee_cents / 100));
        addDefinition(sepaDetails, 'Vertragsbeginn', date.format(new Date(result.sepa.starts_on)));
        sepaDialog.showModal();
        setStatus(adminStatus, 'SEPA-Daten wurden angezeigt und der Zugriff protokolliert.');
      } catch (error) {
        setStatus(adminStatus, error.message, true);
      } finally {
        button.disabled = false;
      }
    }
    if (button.dataset.action === 'activate') {
      pendingActivation = { id: button.dataset.id, reference: button.dataset.reference };
      activateCopy.textContent = `Mandatsreferenz ${pendingActivation.reference}. Die Annahme setzt den Kundentag, aktiviert das Mitglied und versendet die Vertragsbestätigung.`;
      activateConfirmation.checked = false;
      activateConfirmButton.disabled = true;
      activateDialog.showModal();
    }
    if (button.dataset.action === 'resend-confirmation') {
      pendingAdminAction = { action: button.dataset.action, id: button.dataset.id };
      adminActionHeading.textContent = 'Vertragsbestätigung erneut senden?';
      adminActionCopy.textContent = `Die Bestätigung für ${button.dataset.reference} wird erneut an die im Vertrag hinterlegte E-Mail-Adresse gesendet.`;
      adminActionConfirmationCopy.textContent = 'Ich möchte diese Vertragsbestätigung jetzt erneut versenden.';
      adminActionConfirmButton.textContent = 'Bestätigung senden';
      adminActionConfirmation.checked = false;
      adminActionConfirmButton.disabled = true;
      adminActionDialog.showModal();
    }
    if (button.dataset.action === 'test-booking-access') {
      pendingAdminAction = { action: button.dataset.action, id: button.dataset.id };
      adminActionHeading.textContent = 'Test-Buchung freigeben?';
      adminActionCopy.textContent = `Für ${button.dataset.reference} wird ein protokollierter Testzugang für 2 Stunden eingerichtet. Vertragsbeginn und Widerrufserklärung bleiben unverändert.`;
      adminActionConfirmationCopy.textContent = 'Ich bestätige die zeitlich begrenzte Freigabe für den Live-Systemtest.';
      adminActionConfirmButton.textContent = '2 Stunden freigeben';
      adminActionConfirmation.checked = false;
      adminActionConfirmButton.disabled = true;
      adminActionDialog.showModal();
    }
  });

  sepaDialog.addEventListener('close', () => sepaDetails.replaceChildren());
  activateDialog.addEventListener('close', () => {
    pendingActivation = null;
    activateConfirmation.checked = false;
    activateConfirmButton.disabled = true;
  });
  activateConfirmation.addEventListener('change', () => {
    activateConfirmButton.disabled = !activateConfirmation.checked;
  });
  activateConfirmButton.addEventListener('click', async () => {
    if (!pendingActivation || !activateConfirmation.checked) return;
    activateConfirmButton.disabled = true;
    activateConfirmButton.textContent = 'Vertrag wird angenommen…';
    try {
      const result = await adminRequest(`/admin/${encodeURIComponent(pendingActivation.id)}/activate`, { method: 'POST' });
      activateDialog.close();
      statusFilter.value = 'active';
      await loadApplications();
      setStatus(
        adminStatus,
        result.confirmation_email_sent
          ? 'Vertrag ist aktiv. Kundentag und Vertragsbestätigung wurden verarbeitet.'
          : 'Vertrag ist aktiv und der Kundentag wurde gesetzt. Die E-Mail konnte nicht versendet werden; nutzen Sie „Vertragsbestätigung erneut senden“.',
        !result.confirmation_email_sent
      );
    } catch (error) {
      setStatus(adminStatus, error.message, true);
      activateConfirmButton.disabled = false;
    } finally {
      activateConfirmButton.textContent = 'Vertrag annehmen';
    }
  });

  adminActionDialog.addEventListener('close', () => {
    pendingAdminAction = null;
    adminActionConfirmation.checked = false;
    adminActionConfirmButton.disabled = true;
  });
  adminActionConfirmation.addEventListener('change', () => {
    adminActionConfirmButton.disabled = !adminActionConfirmation.checked;
  });
  adminActionConfirmButton.addEventListener('click', async () => {
    if (!pendingAdminAction || !adminActionConfirmation.checked) return;
    const action = pendingAdminAction;
    adminActionConfirmButton.disabled = true;
    adminActionConfirmButton.textContent = action.action === 'resend-confirmation'
      ? 'Bestätigung wird gesendet…'
      : 'Testzugang wird freigegeben…';
    try {
      const result = await adminRequest(`/admin/${encodeURIComponent(action.id)}/${action.action}`, { method: 'POST' });
      adminActionDialog.close();
      if (action.action === 'resend-confirmation') {
        setStatus(adminStatus, 'Die Vertragsbestätigung wurde erneut versendet.');
      } else {
        const expiresAt = new Intl.DateTimeFormat('de-DE', {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: 'Europe/Berlin'
        }).format(new Date(result.expires_at));
        setStatus(adminStatus, `Test-Buchungszugang ist bis ${expiresAt} Uhr freigeschaltet.`);
      }
    } catch (error) {
      setStatus(adminStatus, error.message, true);
      adminActionConfirmButton.disabled = false;
      adminActionConfirmButton.textContent = action.action === 'resend-confirmation'
        ? 'Bestätigung senden'
        : '2 Stunden freigeben';
    }
  });
})();
