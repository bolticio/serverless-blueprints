const form = document.getElementById('budget-form');
const submitButton = document.getElementById('submit-btn');
const statusEl = document.getElementById('status');
const refreshButton = document.getElementById('refresh-btn');
const listEl = document.getElementById('entries-list');
const incomeEl = document.getElementById('summary-income');
const expenseEl = document.getElementById('summary-expense');
const netEl = document.getElementById('summary-net');

const formatCurrency = (value) => {
  const amount = Number(value) || 0;
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(amount);
};

const formatDate = (value) => {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString(undefined, { dateStyle: 'medium' });
};

function showStatus(message, variant) {
  if (!statusEl) {
    return;
  }

  if (!message) {
    statusEl.hidden = true;
    statusEl.textContent = '';
    statusEl.className = 'status';
    return;
  }

  const variants = ['success', 'error'];
  const classes = ['status'];
  if (variants.includes(variant)) {
    classes.push(variant);
  }

  statusEl.textContent = message;
  statusEl.className = classes.join(' ');
  statusEl.hidden = false;
}

function formDataToPayload() {
  const data = new FormData(form);
  const payload = {
    category: (data.get('category') || '').toString().trim(),
    amount: (data.get('amount') || '').toString().trim(),
    entryType: (data.get('entry-type') || '').toString().trim() || 'expense',
    notes: (data.get('notes') || '').toString().trim(),
  };

  const due = (data.get('due-date') || '').toString().trim();
  if (due) {
    payload.dueDate = due;
  }

  return payload;
}

async function handleSubmit(event) {
  event.preventDefault();

  if (!form.reportValidity()) {
    return;
  }

  const payload = formDataToPayload();

  if (!payload.category) {
    showStatus('Category is required.', 'error');
    return;
  }
  if (!payload.amount) {
    showStatus('Amount is required.', 'error');
    return;
  }

  if (submitButton) {
    submitButton.disabled = true;
  }
  showStatus('Saving entry…');

  try {
    const response = await fetch('/api/budget', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => ({}));

    if (response.ok && result.success !== false) {
      showStatus(result.message || 'Entry saved.', 'success');
      form.reset();
      await loadEntries();
    } else {
      const message = result?.error?.message || result?.message || 'Failed to save entry.';
      showStatus(message, 'error');
    }
  } catch (error) {
    console.error('Entry submission failed:', error);
    showStatus('Unable to save entry. Check your connection and try again.', 'error');
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
    }
  }
}

function renderSummary(summary = {}) {
  if (incomeEl) {
    incomeEl.textContent = formatCurrency(summary.totalIncome || 0);
  }
  if (expenseEl) {
    expenseEl.textContent = formatCurrency(summary.totalExpenses || 0);
  }
  if (netEl) {
    netEl.textContent = formatCurrency(summary.net || 0);
    netEl.classList.toggle('negative', (summary.net || 0) < 0);
  }
}

function renderEntries(entries) {
  if (!listEl) {
    return;
  }

  listEl.innerHTML = '';

  if (!entries.length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'No entries yet. Add your first budget item above.';
    listEl.appendChild(empty);
    return;
  }

  entries.forEach((entry) => {
    const item = document.createElement('li');
    item.className = `history-item ${entry.entryType || 'expense'}`;

    const header = document.createElement('div');
    header.className = 'item-header';

    const title = document.createElement('h3');
    title.textContent = entry.category || 'Untitled';
    header.appendChild(title);

    const amount = document.createElement('strong');
    const sign = (entry.entryType || '').toLowerCase() === 'income' ? '' : '-';
    amount.textContent = `${sign}${formatCurrency(entry.amount || 0)}`;
    header.appendChild(amount);

    item.appendChild(header);

    const meta = document.createElement('p');
    const details = [];
    if (entry.entryType) {
      details.push(entry.entryType);
    }
    if (entry.dueDate) {
      const due = formatDate(entry.dueDate);
      if (due) {
        details.push(`due ${due}`);
      }
    }
    if (entry.createdAt) {
      const created = formatDate(entry.createdAt);
      if (created) {
        details.push(`added ${created}`);
      }
    }
    meta.textContent = details.join(' · ');
    meta.className = 'item-meta';
    item.appendChild(meta);

    if (entry.notes) {
      const notes = document.createElement('p');
      notes.className = 'item-notes';
      notes.textContent = entry.notes;
      item.appendChild(notes);
    }

    listEl.appendChild(item);
  });
}

async function loadEntries() {
  try {
    const response = await fetch('/api/budget?limit=10');
    const result = await response.json().catch(() => ({}));

    if (!response.ok || result.success === false) {
      throw new Error(result?.error?.message || result?.message || 'Failed to load entries');
    }

    renderSummary(result.summary);
    renderEntries(result.data || []);
  } catch (error) {
    console.error('Failed to fetch entries:', error);
    showStatus('Unable to load entries. Refresh to try again.', 'error');
  }
}

if (form) {
  form.addEventListener('submit', handleSubmit);
}

if (refreshButton) {
  refreshButton.addEventListener('click', () => {
    loadEntries().catch((error) => {
      console.error('Refresh failed:', error);
    });
  });
}

window.addEventListener('DOMContentLoaded', () => {
  loadEntries().catch((error) => {
    console.error('Initial load failed:', error);
  });
});
