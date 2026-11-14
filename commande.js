(function () {
  'use strict';

  var UNIT_PRICE_CENTS = 35000;
  var SHIPPING_CENTS = 2000;
  var COUPON = 'ECOLOGIE';
  var config = window.VOLTIX_SUPABASE_CONFIG || {};
  var supabaseUrl = String(config.url || '').replace(/\/+$/, '');
  var anonKey = String(config.anonKey || '');
  var supabaseClient = null;
  var supabaseClientError = '';
  if (supabaseUrl && anonKey && window.supabase && typeof window.supabase.createClient === 'function') {
    try {
      supabaseClient = window.supabase.createClient(supabaseUrl, anonKey);
    } catch (error) {
      supabaseClientError = error.message;
    }
  }
  var quantity = document.querySelector('#quantity');
  var quantityOutput = document.querySelector('#quantity-output');
  var summaryQuantity = document.querySelector('#summary-quantity');
  var steps = Array.prototype.slice.call(document.querySelectorAll('.checkout-step'));
  var stepLinks = Array.prototype.slice.call(document.querySelectorAll('.checkout-steps li'));
  var accountDialog = document.querySelector('#account-dialog');
  var money = new Intl.NumberFormat('fr-CA', {
    style: 'currency', currency: 'CAD', minimumFractionDigits: 2, maximumFractionDigits: 2
  });
  var couponApplied = false;
  var accountMode = 'login';
  var accessToken = '';
  var accountEmail = '';
  var pendingEmail = '';
  var verificationFlow = 'email';
  var resendTimer = null;
  var confirmationSent = false;

  function currentQuantity() {
    var value = Number(quantity.value);
    return Number.isSafeInteger(value) && value >= 1 ? value : 1;
  }

  function deliveryDateIso() {
    var parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    var get = function (type) {
      var part = parts.find(function (item) { return item.type === type; });
      return part ? Number(part.value) : 0;
    };
    return new Date(Date.UTC(get('year'), get('month') - 1, get('day') + 5, 12)).toISOString().slice(0, 10);
  }

  function formatDeliveryDate(isoDate) {
    var parts = isoDate.split('-').map(Number);
    var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12));
    var label = new Intl.DateTimeFormat('fr-CA', {
      timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    }).format(date);
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  function updateOrderSummary() {
    var subtotal = UNIT_PRICE_CENTS * currentQuantity();
    var discount = couponApplied ? Math.round(subtotal * 0.25) : 0;
    var shipping = SHIPPING_CENTS;
    var taxable = subtotal - discount + shipping;
    var gst = Math.round(taxable * 0.05);
    var qst = Math.round(taxable * 0.09975);
    var total = taxable + gst + qst;

    document.querySelector('#summary-subtotal').textContent = money.format(subtotal / 100);
    document.querySelector('#summary-discount-row').hidden = discount === 0;
    document.querySelector('#summary-discount').textContent = '−' + money.format(discount / 100);
    document.querySelector('#summary-shipping').textContent = money.format(shipping / 100);
    document.querySelector('#summary-gst').textContent = money.format(gst / 100);
    document.querySelector('#summary-qst').textContent = money.format(qst / 100);
    document.querySelector('#summary-total').textContent = money.format(total / 100);

    var dateLabel = formatDeliveryDate(deliveryDateIso());
    document.querySelector('#delivery-date').textContent = 'Date estimative : au plus tard le ' + dateLabel;
    document.querySelector('#delivery-summary').textContent = 'Livraison estimée au plus tard le ' + dateLabel + ' (5 jours calendrier).';
  }

  function updateQuantity(normalize) {
    var value = currentQuantity();
    if (normalize) quantity.value = value;
    quantityOutput.textContent = value + (value === 1 ? ' appareil sélectionné' : ' appareils sélectionnés');
    summaryQuantity.textContent = value;
    updateOrderSummary();
  }

  function showStep(number, focusHeading) {
    steps.forEach(function (step, index) {
      step.hidden = index + 1 !== number;
    });
    stepLinks.forEach(function (step, index) {
      if (index + 1 === number) step.setAttribute('aria-current', 'step');
      else step.removeAttribute('aria-current');
    });
    var heading = document.querySelector('#step-title-' + number);
    if (focusHeading !== false && heading) heading.focus();
  }

  function setStatusMessage(element, message, state) {
    element.textContent = message;
    if (state) element.dataset.state = state;
    else element.removeAttribute('data-state');
  }

  function setAuthStatus(message, state) {
    setStatusMessage(document.querySelector('#auth-status'), message, state);
  }

  function setAuthFeedback(message, state) {
    setStatusMessage(document.querySelector('#auth-feedback'), message, state);
  }

  function setEmailStatus(message, state) {
    setStatusMessage(document.querySelector('#email-status'), message, state);
  }

  function applyAuthenticatedSession(session) {
    if (!session || !session.access_token || !session.user || !session.user.email) return;
    accessToken = session.access_token;
    accountEmail = session.user.email;
    setAuthStatus('Adresse vérifiée : ' + accountEmail + '.', 'success');
    document.querySelector('#send-confirmation').disabled = false;
    setEmailStatus('Vous pouvez maintenant recevoir votre récapitulatif.', 'success');
  }

  function parseResponse(response) {
    return response.text().then(function (text) {
      var body = {};
      if (text) {
        try {
          body = JSON.parse(text);
        } catch (error) {
          throw new Error('Le service a retourné une réponse illisible.');
        }
      }
      if (!response.ok) throw new Error(body.msg || body.message || body.error || 'La demande a échoué.');
      return body;
    });
  }

  document.querySelectorAll('[data-quantity]').forEach(function (button) {
    button.addEventListener('click', function () {
      quantity.value = currentQuantity() + Number(button.dataset.quantity);
      updateQuantity(true);
    });
  });
  quantity.addEventListener('change', function () { updateQuantity(true); });
  quantity.addEventListener('input', function () { updateQuantity(false); });

  document.querySelectorAll('[data-next]').forEach(function (button) {
    button.addEventListener('click', function () {
      showStep(Number(button.dataset.next));
    });
  });
  document.querySelectorAll('[data-previous]').forEach(function (button) {
    button.addEventListener('click', function () {
      showStep(Number(button.dataset.previous));
    });
  });

  document.querySelector('#coupon-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var input = document.querySelector('#discount-code');
    var code = input.value.trim().toUpperCase();
    var status = document.querySelector('#coupon-status');
    couponApplied = code === COUPON;
    if (couponApplied) {
      input.value = COUPON;
      status.textContent = 'Code ECOLOGIE appliqué : 25 % de réduction sur les appareils.';
    } else {
      status.textContent = code ? 'Code invalide. Vérifiez le code et réessayez.' : 'Entrez un code de réduction.';
    }
    updateOrderSummary();
  });

  document.querySelectorAll('[data-account]').forEach(function (button) {
    button.addEventListener('click', function () {
      accountMode = button.dataset.account === 'create' ? 'create' : 'login';
      document.querySelector('#account-title').textContent = accountMode === 'create' ? 'Créer un compte Voltix' : 'Se connecter';
      document.querySelector('#account-message').textContent = accountMode === 'create'
        ? 'Créez un compte avec un mot de passe, Google ou un code envoyé par courriel.'
        : 'Connectez-vous avec un mot de passe, Google ou un code envoyé par courriel.';
      if (resendTimer) window.clearInterval(resendTimer);
      resendTimer = null;
      pendingEmail = '';
      verificationFlow = 'email';
      document.querySelector('#auth-form').reset();
      document.querySelector('#email-entry').hidden = false;
      document.querySelector('#verification-panel').hidden = true;
      document.querySelector('#resend-code').disabled = false;
      document.querySelector('#resend-code').textContent = 'Renvoyer le code';
      setAuthFeedback('', null);
      document.querySelector('#account-password').autocomplete = accountMode === 'create' ? 'new-password' : 'current-password';
      document.querySelector('#password-submit').textContent = accountMode === 'create'
        ? 'Créer mon compte avec mot de passe'
        : 'Se connecter avec mot de passe';
      document.querySelector('#auth-submit').textContent = accountMode === 'create'
        ? 'Recevoir un code de création par courriel'
        : 'Recevoir un code de connexion par courriel';
      accountDialog.showModal();
      document.querySelector('#account-email').focus();
    });
  });

  document.querySelector('#auth-close').addEventListener('click', function () {
    accountDialog.close();
  });

  function authenticateWithPassword() {
    var email = document.querySelector('#account-email').value.trim();
    var password = document.querySelector('#account-password').value;
    var button = document.querySelector('#password-submit');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) {
      setAuthFeedback('Entrez une adresse courriel valide.', 'error');
      return;
    }
    if (!password || (accountMode === 'create' && password.length < 8)) {
      setAuthFeedback(accountMode === 'create'
        ? 'Choisissez un mot de passe d’au moins 8 caractères.'
        : 'Entrez votre mot de passe.', 'error');
      return;
    }
    if (!supabaseUrl || !anonKey) {
      setAuthFeedback('Supabase Auth n’est pas configuré pour la connexion par mot de passe.', 'error');
      return;
    }
    if (!supabaseClient) {
      setAuthFeedback('Le service de connexion n’a pas pu être chargé. Rechargez la page et réessayez.', 'error');
      return;
    }

    button.disabled = true;
    setAuthFeedback(accountMode === 'create' ? 'Création du compte…' : 'Connexion…');
    var request = accountMode === 'create'
      ? supabaseClient.auth.signUp({ email: email, password: password })
      : supabaseClient.auth.signInWithPassword({ email: email, password: password });
    request.then(function (result) {
      if (result.error) throw result.error;
      if (result.data.session) {
        applyAuthenticatedSession(result.data.session);
        accountDialog.close();
        return;
      }
      if (accountMode !== 'create' || !result.data.user) {
        throw new Error('Aucune session de connexion n’a été retournée.');
      }
      pendingEmail = email;
      verificationFlow = 'signup';
      document.querySelector('#email-entry').hidden = true;
      document.querySelector('#verification-panel').hidden = false;
      document.querySelector('#verification-code').focus();
      setAuthFeedback('Un code de confirmation a été envoyé à ' + email + '.', 'success');
      startResendCooldown();
    }).catch(function (error) {
      setAuthFeedback('Connexion par mot de passe impossible : ' + error.message, 'error');
    }).then(function () {
      button.disabled = false;
    });
  }

  document.querySelector('#google-signin').addEventListener('click', function () {
    var button = this;
    if (!supabaseUrl || !anonKey) {
      setAuthFeedback('Supabase Auth n’est pas configuré. La connexion Google est indisponible.', 'error');
      return;
    }
    if (!supabaseClient) {
      var detail = supabaseClientError || 'Rechargez la page et vérifiez que le service est disponible.';
      setAuthFeedback('Le service de connexion Google n’a pas pu être chargé. ' + detail, 'error');
      return;
    }

    var returnUrl = new URL(window.location.href);
    returnUrl.search = '';
    returnUrl.searchParams.set('step', '3');
    returnUrl.searchParams.set('quantity', String(currentQuantity()));
    if (couponApplied) returnUrl.searchParams.set('coupon', COUPON);
    returnUrl.hash = '';

    button.disabled = true;
    setAuthFeedback('Redirection vers Google…');
    supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: returnUrl.toString() }
    }).then(function (result) {
      if (result.error) throw result.error;
    }).catch(function (error) {
      setAuthFeedback('Connexion Google impossible : ' + error.message, 'error');
      button.disabled = false;
    });
  });

  function initializeSupabaseSession() {
    if (!supabaseClient) return;
    supabaseClient.auth.onAuthStateChange(function (event, session) {
      if (event === 'SIGNED_OUT') {
        accessToken = '';
        accountEmail = '';
        document.querySelector('#send-confirmation').disabled = true;
        setEmailStatus('', null);
      } else {
        applyAuthenticatedSession(session);
      }
    });
    supabaseClient.auth.getSession().then(function (result) {
      if (result.error) {
        setAuthStatus('Impossible de restaurer la connexion : ' + result.error.message, 'error');
        return;
      }
      applyAuthenticatedSession(result.data.session);
    }).catch(function (error) {
      setAuthStatus('Impossible de restaurer la connexion : ' + error.message, 'error');
    });
  }

  function startResendCooldown() {
    var button = document.querySelector('#resend-code');
    var seconds = 30;
    if (resendTimer) window.clearInterval(resendTimer);
    button.disabled = true;
    button.textContent = 'Renvoyer dans ' + seconds + ' s';
    resendTimer = window.setInterval(function () {
      seconds -= 1;
      if (seconds <= 0) {
        window.clearInterval(resendTimer);
        resendTimer = null;
        button.disabled = false;
        button.textContent = 'Renvoyer le code';
      } else {
        button.textContent = 'Renvoyer dans ' + seconds + ' s';
      }
    }, 1000);
  }

  function requestEmailCode(email, resend) {
    var submit = document.querySelector('#auth-submit');
    var resendButton = document.querySelector('#resend-code');
    if (!resend && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) {
      setAuthFeedback('Entrez une adresse courriel valide.', 'error');
      return;
    }
    if (!supabaseUrl || !anonKey) {
      setAuthFeedback('Supabase Auth n’est pas configuré. Aucun courriel n’a été envoyé.', 'error');
      return;
    }

    if (!resend) verificationFlow = 'email';
    if (resend) resendButton.disabled = true;
    else submit.disabled = true;
    setAuthFeedback('Envoi du code de vérification…');
    fetch(supabaseUrl + '/auth/v1/otp', {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, create_user: accountMode === 'create' })
    }).then(parseResponse).then(function () {
      pendingEmail = email;
      if (!resend) {
        document.querySelector('#email-entry').hidden = true;
        document.querySelector('#verification-panel').hidden = false;
        document.querySelector('#verification-code').focus();
      }
      setAuthFeedback('Un code à usage unique a été envoyé à ' + email + '. Saisissez-le ci-dessus.', 'success');
      startResendCooldown();
    }).catch(function (error) {
      setAuthFeedback('Impossible d’envoyer le code : ' + error.message, 'error');
      if (resend) resendButton.disabled = false;
    }).then(function () {
      submit.disabled = false;
    });
  }

  function verifyEmailCode() {
    var codeInput = document.querySelector('#verification-code');
    var code = codeInput.value.trim();
    var verify = document.querySelector('#verify-code');
    if (!pendingEmail) {
      setAuthFeedback('Entrez votre adresse courriel et demandez un code avant de continuer.', 'error');
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setAuthFeedback('Entrez le code de vérification à 6 chiffres.', 'error');
      codeInput.focus();
      return;
    }
    verify.disabled = true;
    setAuthFeedback('Vérification du code…');
    fetch(supabaseUrl + '/auth/v1/verify', {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pendingEmail, token: code, type: 'email' })
    }).then(parseResponse).then(function (session) {
      if (!session.access_token || !session.user || !session.user.email) {
        throw new Error('Supabase n’a pas retourné de session vérifiée.');
      }
      accessToken = session.access_token;
      accountEmail = session.user.email;
      verificationFlow = 'email';
      setAuthStatus('Adresse vérifiée : ' + accountEmail + '.', 'success');
      document.querySelector('#send-confirmation').disabled = false;
      setEmailStatus('Vous pouvez maintenant recevoir votre récapitulatif.', 'success');
      setAuthFeedback('Adresse vérifiée.', 'success');
      accountDialog.close();
    }).catch(function (error) {
      setAuthFeedback('Code invalide ou expiré : ' + error.message, 'error');
    }).then(function () {
      verify.disabled = false;
    });
  }

  document.querySelector('#auth-form').addEventListener('submit', function (event) {
    event.preventDefault();
    if (!document.querySelector('#verification-panel').hidden) {
      verifyEmailCode();
      return;
    }
    requestEmailCode(document.querySelector('#account-email').value.trim(), false);
  });
  document.querySelector('#password-submit').addEventListener('click', authenticateWithPassword);
  document.querySelector('#account-password').addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      authenticateWithPassword();
    }
  });
  document.querySelector('#verify-code').addEventListener('click', verifyEmailCode);
  document.querySelector('#resend-code').addEventListener('click', function () {
    if (!pendingEmail || this.disabled) return;
    if (verificationFlow !== 'signup') {
      requestEmailCode(pendingEmail, true);
      return;
    }
    if (!supabaseClient) {
      setAuthFeedback('Supabase Auth n’est pas configuré pour renvoyer le code.', 'error');
      return;
    }
    var button = this;
    button.disabled = true;
    supabaseClient.auth.resend({ type: 'signup', email: pendingEmail }).then(function (result) {
      if (result.error) throw result.error;
      setAuthFeedback('Un nouveau code de confirmation a été envoyé à ' + pendingEmail + '.', 'success');
      startResendCooldown();
    }).catch(function (error) {
      setAuthFeedback('Impossible de renvoyer le code : ' + error.message, 'error');
      button.disabled = false;
    });
  });
  document.querySelector('#verification-code').addEventListener('input', function () {
    this.value = this.value.replace(/\D/g, '').slice(0, 6);
  });
  document.querySelector('#verification-code').addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      verifyEmailCode();
    }
  });

  document.querySelector('#send-confirmation').addEventListener('click', function () {
    var button = this;
    var status = document.querySelector('#email-status');
    if (!accessToken || !supabaseUrl || !anonKey || confirmationSent) return;
    button.disabled = true;
    setStatusMessage(status, 'Envoi du récapitulatif…');
    fetch(supabaseUrl + '/functions/v1/send-reservation', {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        quantity: currentQuantity(),
        coupon_code: couponApplied ? COUPON : ''
      })
    }).then(parseResponse).then(function (result) {
      confirmationSent = true;
      if (result.delivery_date) {
        var dateLabel = formatDeliveryDate(result.delivery_date);
        document.querySelector('#delivery-date').textContent = 'Date estimative : au plus tard le ' + dateLabel;
        document.querySelector('#delivery-summary').textContent = 'Livraison estimée au plus tard le ' + dateLabel + ' (5 jours calendrier).';
      }
      setEmailStatus('Le récapitulatif de réservation a été envoyé à ' + accountEmail + '. Aucun paiement n’a été prélevé.', 'success');
    }).catch(function (error) {
      setEmailStatus('Le courriel n’a pas pu être envoyé : ' + error.message, 'error');
      button.disabled = false;
    });
  });

  var query = new URLSearchParams(window.location.search);
  var restoredQuantity = Number(query.get('quantity'));
  if (Number.isSafeInteger(restoredQuantity) && restoredQuantity >= 1) quantity.value = restoredQuantity;
  couponApplied = (query.get('coupon') || '').toUpperCase() === COUPON;
  if (couponApplied) {
    document.querySelector('#discount-code').value = COUPON;
    document.querySelector('#coupon-status').textContent = 'Code ECOLOGIE appliqué : 25 % de réduction sur les appareils.';
  }
  if (query.has('quantity') || query.has('coupon') || query.has('step')) {
    var cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('quantity');
    cleanUrl.searchParams.delete('coupon');
    cleanUrl.searchParams.delete('step');
    window.history.replaceState(null, document.title, cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
  }
  var initialStep = Number(query.get('step'));
  updateQuantity(true);
  showStep(initialStep >= 1 && initialStep <= 3 ? initialStep : 1, false);
  if (!supabaseUrl || !anonKey) {
    setAuthStatus('Connexion indisponible : configurez Supabase Auth pour recevoir un code par courriel.', 'error');
  } else {
    setAuthStatus('Entrez votre adresse courriel pour recevoir un code de vérification.');
  }
  initializeSupabaseSession();
})();
