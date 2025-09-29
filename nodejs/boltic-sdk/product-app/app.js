const form = document.getElementById('product-form');
const productsBody = document.getElementById('products-body');
const refreshButton = document.getElementById('refresh-btn');
const setupButton = document.getElementById('setup-btn');
const statusEl = document.getElementById('status');
const filterCategory = document.getElementById('filter-category');
const filterActive = document.getElementById('filter-active');
const applyFiltersButton = document.getElementById('apply-filters');

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

const escapeHtml = (value) => (
  typeof value === 'string'
    ? value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
    : ''
);

const state = {
  products: [],
  loading: false,
};

function showStatus(message, variant = '', timeout = 4000) {
  if (!statusEl) {
    return;
  }

  if (!message) {
    statusEl.hidden = true;
    statusEl.textContent = '';
    statusEl.className = 'status';
    return;
  }

  const variants = ['success', 'error', 'warning'];
  const classes = ['status'];
  if (variants.includes(variant)) {
    classes.push(variant);
  }

  statusEl.className = classes.join(' ');
  statusEl.textContent = message;
  statusEl.hidden = false;

  if (timeout) {
    window.setTimeout(() => {
      if (statusEl.textContent === message) {
        showStatus('');
      }
    }, timeout);
  }
}

function setGlobalLoading(isLoading) {
  state.loading = isLoading;
  if (form) {
    form.querySelectorAll('input, textarea, button, select').forEach((el) => {
      if (isLoading) {
        el.setAttribute('disabled', 'true');
      } else {
        el.removeAttribute('disabled');
      }
    });
  }
  if (refreshButton) {
    refreshButton.disabled = isLoading;
  }
  if (setupButton) {
    setupButton.disabled = isLoading;
  }
  if (applyFiltersButton) {
    applyFiltersButton.disabled = isLoading;
  }
}

async function request(url, options = {}) {
  const fetchOptions = { ...options };
  fetchOptions.headers = new Headers(options.headers || {});

  if (fetchOptions.body && !fetchOptions.headers.has('Content-Type')) {
    fetchOptions.headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, fetchOptions);
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.success === false) {
    const message = data?.error?.message || data?.message || data?.error || `Request to ${url} failed`;
    const error = new Error(message);
    error.status = response.status;
    error.code = data?.error?.code;
    throw error;
  }

  return data;
}

function renderProducts(products) {
  if (!productsBody) {
    return;
  }

  productsBody.innerHTML = '';

  if (!products.length) {
    const emptyRow = document.createElement('tr');
    emptyRow.className = 'empty';
    const cell = document.createElement('td');
    cell.colSpan = 7;
    cell.textContent = 'No products found. Add your first product using the form.';
    emptyRow.appendChild(cell);
    productsBody.appendChild(emptyRow);
    return;
  }

  products.forEach((product) => {
    const row = document.createElement('tr');
    row.dataset.id = product.id;

    const name = escapeHtml(product.name ?? '');
    const descriptionText = typeof product.description === 'string' ? product.description.trim() : '';
    const description = descriptionText ? `<div class="meta">${escapeHtml(descriptionText)}</div>` : '';
    const categoryValue = typeof product.category === 'string' && product.category.trim().length > 0
      ? escapeHtml(product.category.trim())
      : '—';

    const priceValue = typeof product.price === 'number' ? currency.format(product.price) : '—';
    const stockValue = Number.isFinite(product.stock) ? product.stock : 0;
    const updatedValue = product.updatedAt ? new Date(product.updatedAt).toLocaleString() : '—';
    const badgeClass = product.active ? 'badge' : 'badge inactive';
    const badgeLabel = product.active ? 'Active' : 'Inactive';
    const toggleLabel = product.active ? 'Deactivate' : 'Activate';

    row.innerHTML = `
      <td>
        <div class="product-name">
          <strong>${name}</strong>
          ${description}
        </div>
      </td>
      <td>${priceValue}</td>
      <td>${categoryValue}</td>
      <td>
        <div class="stock-editor">
          <input type="number" min="0" step="1" value="${stockValue}" />
          <button type="button" class="secondary" data-action="save-stock">Save</button>
        </div>
      </td>
      <td><span class="${badgeClass}">${badgeLabel}</span></td>
      <td>${updatedValue}</td>
      <td>
        <div class="action-group">
          <button type="button" class="secondary" data-action="toggle">${toggleLabel}</button>
          <button type="button" class="secondary danger" data-action="delete">Delete</button>
        </div>
      </td>
    `;

    const stockInput = row.querySelector('input[type="number"]');
    if (stockInput) {
      stockInput.setAttribute('aria-label', `Stock for ${product.name ?? 'product'}`);
    }

    productsBody.appendChild(row);
  });
}

async function loadProducts({ showMessage = true } = {}) {
  try {
    const params = new URLSearchParams();
    const category = filterCategory?.value?.trim();
    const activeValue = filterActive?.value;

    if (category) {
      params.set('category', category);
    }
    if (activeValue) {
      params.set('active', activeValue);
    }

    const query = params.toString();
    const url = query ? `/api/products?${query}` : '/api/products';
    const result = await request(url);
    state.products = Array.isArray(result.data) ? result.data : [];
    renderProducts(state.products);

    if (showMessage) {
      showStatus('Products refreshed.', 'success');
    }
  } catch (error) {
    console.error('Failed to load products:', error);
    showStatus(error.message || 'Unable to load products.', 'error', 6000);
  }
}

async function runSetup({ silent = false } = {}) {
  try {
    const result = await request('/api/setup', { method: 'POST' });
    if (!silent) {
      showStatus(result.message || 'Products table is ready.', 'success');
    }
  } catch (error) {
    console.warn('Setup failed:', error);
    const variant = error.code === 'TABLE_CREATION_NOT_SUPPORTED' ? 'warning' : 'error';
    if (!silent) {
      showStatus(error.message || 'Failed to create products table.', variant, 6000);
    }
  }
}

async function handleCreateProduct(event) {
  event.preventDefault();
  if (!form || !form.reportValidity()) {
    return;
  }

  const payload = {
    name: form.name.value.trim(),
    price: Number(form.price.value),
    category: form.category.value.trim() || undefined,
    stock: form.stock.value === '' ? 0 : Number(form.stock.value),
    description: form.description.value.trim() || undefined,
    active: !!form.active.checked,
  };

  try {
    setGlobalLoading(true);
    showStatus('Creating product…', 'warning', 0);

    await request('/api/products', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    showStatus('Product created successfully.', 'success');
    form.reset();
    form.stock.value = '0';
    form.active.checked = true;

    await loadProducts({ showMessage: false });
  } catch (error) {
    console.error('Create product failed:', error);
    showStatus(error.message || 'Failed to create product.', 'error', 6000);
  } finally {
    setGlobalLoading(false);
  }
}

function attachTableListeners() {
  if (!productsBody) {
    return;
  }

  productsBody.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const action = target.dataset.action;
    if (!action) {
      return;
    }

    const row = target.closest('tr');
    const id = row?.dataset.id;
    if (!id) {
      return;
    }

    if (action === 'save-stock') {
      const input = row.querySelector('input[type="number"]');
      const value = Number(input?.value ?? 0);
      if (!Number.isFinite(value) || value < 0) {
        showStatus('Stock must be a non-negative number.', 'error');
        return;
      }

      try {
        target.disabled = true;
        showStatus('Updating stock…', 'warning', 0);
        await request(`/api/products/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ stock: value }),
        });
        showStatus('Stock updated.', 'success');
        await loadProducts({ showMessage: false });
      } catch (error) {
        console.error('Update stock failed:', error);
        showStatus(error.message || 'Failed to update stock.', 'error', 6000);
      } finally {
        target.disabled = false;
      }
      return;
    }

    if (action === 'toggle') {
      const product = state.products.find((item) => item.id === id);
      const nextActive = product ? !product.active : false;
      try {
        target.disabled = true;
        showStatus(`${nextActive ? 'Activating' : 'Deactivating'} product…`, 'warning', 0);
        await request(`/api/products/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ active: nextActive }),
        });
        showStatus(`Product ${nextActive ? 'activated' : 'deactivated'}.`, 'success');
        await loadProducts({ showMessage: false });
      } catch (error) {
        console.error('Toggle product failed:', error);
        showStatus(error.message || 'Failed to update product status.', 'error', 6000);
      } finally {
        target.disabled = false;
      }
      return;
    }

    if (action === 'delete') {
      const confirmed = window.confirm('Delete this product permanently?');
      if (!confirmed) {
        return;
      }
      try {
        target.disabled = true;
        showStatus('Deleting product…', 'warning', 0);
        await request(`/api/products/${id}`, { method: 'DELETE' });
        showStatus('Product deleted.', 'success');
        await loadProducts({ showMessage: false });
      } catch (error) {
        console.error('Delete product failed:', error);
        showStatus(error.message || 'Failed to delete product.', 'error', 6000);
      } finally {
        target.disabled = false;
      }
    }
  });
}

function bindEventListeners() {
  if (form) {
    form.addEventListener('submit', handleCreateProduct);
  }

  if (refreshButton) {
    refreshButton.addEventListener('click', () => {
      loadProducts({ showMessage: true });
    });
  }

  if (setupButton) {
    setupButton.addEventListener('click', () => runSetup({ silent: false }));
  }

  if (applyFiltersButton) {
    applyFiltersButton.addEventListener('click', () => loadProducts({ showMessage: true }));
  }

  filterCategory?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      loadProducts({ showMessage: true });
    }
  });

  attachTableListeners();
}

async function init() {
  bindEventListeners();
  await runSetup({ silent: true });
  await loadProducts({ showMessage: false });
}

init().catch((error) => {
  console.error('Initialization failed:', error);
  showStatus('Initialization failed. Check the console for details.', 'error', 8000);
});
