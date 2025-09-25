const form = document.getElementById('contact-form');
const statusEl = document.getElementById('status');
const submitButton = form?.querySelector('button[type="submit"]') ?? null;

function showStatus(message, variant) {
  if (!statusEl) {
    return;
  }

  statusEl.textContent = message;
  statusEl.className = variant ? `status ${variant}` : 'status';
  statusEl.hidden = false;
}

async function handleSubmit(event) {
  event.preventDefault();

  if (!form.reportValidity()) {
    return;
  }

  if (submitButton) {
    submitButton.disabled = true;
  }
  showStatus('Sending your message…', '');

  const payload = {
    name: form.name.value.trim(),
    email: form.email.value.trim(),
    phone: form.phone.value.trim(),
    message: form.message.value.trim()
  };

  try {
    const response = await fetch('/api/contact', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json().catch(() => ({}));

    if (response.ok && result.success !== false) {
      showStatus(result.message || 'Your message has been sent!', 'success');
      form.reset();
    } else {
      const errorMessage = result.message || result.error || 'We could not send your message. Please try again later.';
      showStatus(errorMessage, 'error');
    }
  } catch (error) {
    console.error('Contact form submission failed:', error);
    showStatus('Something went wrong. Please check your connection and try again.', 'error');
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
    }
  }
}

if (form) {
  form.addEventListener('submit', handleSubmit);
}
