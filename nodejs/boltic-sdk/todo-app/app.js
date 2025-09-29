const form = document.getElementById('todo-form');
const statusEl = document.getElementById('status');
const refreshButton = document.getElementById('refresh-btn');
const listEl = document.getElementById('recent-todos');
const submitButton = form?.querySelector('button[type="submit"]') ?? null;

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
    title: (data.get('title') || '').toString().trim(),
    description: (data.get('description') || '').toString().trim(),
    priority: (data.get('priority') || '').toString().trim(),
    status: (data.get('status') || '').toString().trim(),
  };

  const dueDateRaw = (data.get('due-date') || '').toString().trim();
  if (dueDateRaw) {
    payload.dueDate = dueDateRaw;
  }

  return payload;
}

async function handleSubmit(event) {
  event.preventDefault();

  if (!form.reportValidity()) {
    return;
  }

  const payload = formDataToPayload();

  if (!payload.title) {
    showStatus('Title is required.', 'error');
    return;
  }

  if (submitButton) {
    submitButton.disabled = true;
  }
  showStatus('Saving todo…');

  try {
    const response = await fetch('/api/todos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => ({}));

    if (response.ok && result.success !== false) {
      showStatus(result.message || 'Todo saved!', 'success');
      form.reset();
      await loadRecentTodos();
    } else {
      const message = result?.error?.message || result?.message || 'Failed to save todo.';
      showStatus(message, 'error');
    }
  } catch (error) {
    console.error('Todo submission failed:', error);
    showStatus('Unable to save todo. Check your connection and try again.', 'error');
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
    }
  }
}

function formatDate(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function renderTodos(todos) {
  if (!listEl) {
    return;
  }

  listEl.innerHTML = '';

  if (!todos.length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'No todos yet. Submit your first todo above.';
    listEl.appendChild(empty);
    return;
  }

  todos.forEach((todo) => {
    const item = document.createElement('li');
    item.className = 'history-item';

    const title = document.createElement('h3');
    title.textContent = todo.title || 'Untitled todo';
    item.appendChild(title);

    const meta = document.createElement('p');
    const parts = [];
    if (todo.status) {
      parts.push(todo.status);
    }
    if (todo.priority) {
      parts.push(`priority: ${todo.priority}`);
    }
    if (todo.dueDate) {
      const formatted = formatDate(todo.dueDate);
      if (formatted) {
        parts.push(`due ${formatted}`);
      }
    }
    if (todo.createdAt) {
      const created = formatDate(todo.createdAt);
      if (created) {
        parts.push(`created ${created}`);
      }
    }
    meta.textContent = parts.join(' · ');
    meta.className = 'history-meta';
    item.appendChild(meta);

    if (todo.description) {
      const description = document.createElement('p');
      description.className = 'history-description';
      description.textContent = todo.description;
      item.appendChild(description);
    }

    listEl.appendChild(item);
  });
}

async function loadRecentTodos() {
  try {
    const response = await fetch('/api/todos?limit=10');
    const result = await response.json().catch(() => ({}));

    if (!response.ok || result.success === false) {
      throw new Error(result?.error?.message || result?.message || 'Failed to load todos');
    }

    renderTodos(result.data || []);
  } catch (error) {
    console.error('Failed to fetch todos:', error);
    showStatus('Unable to load todos. Refresh to try again.', 'error');
  }
}

if (form) {
  form.addEventListener('submit', handleSubmit);
}

if (refreshButton) {
  refreshButton.addEventListener('click', () => {
    loadRecentTodos().catch((error) => {
      console.error('Refresh failed:', error);
    });
  });
}

window.addEventListener('DOMContentLoaded', () => {
  loadRecentTodos().catch((error) => {
    console.error('Initial load failed:', error);
  });
});
